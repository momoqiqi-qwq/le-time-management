/* 主题 / 深浅模式切换动画（v0.50.0 批次）的回归测试。
 *
 * 背景：旧实现「animate 的门槛是主题 id 变了」，浅色↔深色只是模式变化、id 不变，
 * 于是深浅切换零动画、全屏配色瞬间跳变（用户报「突兀」的根因）。
 * 新实现（src/theme.js runThemeMutation）：
 *   ① 主路径 View Transitions：整页快照 + 圆形揭示（从最近按下位置 / 屏幕中心扩散）；
 *   ② 降级：无 startViewTransition 的环境走 :root.theme-transitioning 全元素过渡；
 *   ③ 动效偏好 reduced（应用内 data-ui-motion 或系统 prefers-reduced-motion）直接应用。
 *
 * 本文件用 vm + 替身真跑 src/theme.js（与 test-ui-scale.mjs 同套路，store/themeProfiles 打桩），
 * 末尾对三处关键逻辑做变异测试，证明断言承重。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 替身环境 ── */
let darkFlag = false;          // prefers-color-scheme: dark
let vtCalls = 0;               // startViewTransition 调用计数
let vtCallback = null;         // 最近一次转场的 DOM 更新回调
let env = null;

function installEnv({ supportVT = true, motion = "system" } = {}) {
  const styleStore = new Map();
  const root = {
    dataset: { uiMotion: motion },
    style: {
      colorScheme: "",
      setProperty: (k, v) => styleStore.set(k, v),
      removeProperty: (k) => styleStore.delete(k),
    },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
  };
  const listeners = [];
  env = {
    root, styleStore, listeners,
    settings: { theme: "classic", themeMode: "system" },
    dispatch(type, ev) { for (const [t, fn] of listeners) if (t === type) fn(ev); },
  };
  globalThis.__storeStub = {
    getState: () => ({ settings: env.settings }),
    saveNow: () => {},
  };
  globalThis.__themeProfileStub = {
    THEMES: [{ id: "classic" }, { id: "night" }],
    getThemeProfile: (id) => ({ id: id === "night" ? "night" : (id || "classic") }),
  };
  // v0.51.0：theme.js 现在会调 api.systemBar() 同步状态栏图标明暗。
  // ⚠️ 形状必须是 `{ api: { systemBar } }` —— 替换行是 `const { api } = globalThis.__apiStub`，
  // 解构的是名为 `api` 的键。若直接写成 `{ systemBar }` 会拿到 undefined 且**静默失效**
  // （可选链 `?.` 把错误吞掉，测试会误判成「实现没调」）。
  // 记录数组由宿主创建后传进闭包：vm 里的 globalThis 指向上下文自身，
  // 在 vm 内写 `globalThis.xxx` 宿主看不到。
  const systemBarCalls = [];
  env.systemBarCalls = systemBarCalls;
  globalThis.__apiStub = {
    api: {
      systemBar: (darkIcons) => { systemBarCalls.push(darkIcons); return Promise.resolve({ applied: false }); },
    },
  };
  globalThis.document = {
    documentElement: root,
    addEventListener: (type, fn) => listeners.push([type, fn]),
    ...(supportVT ? { startViewTransition: (cb) => { vtCalls++; vtCallback = cb; return { finished: Promise.resolve() }; } } : {}),
  };
  globalThis.window = {
    innerWidth: 800,
    innerHeight: 600,
    matchMedia: (q) => ({
      matches: q.includes("prefers-color-scheme") ? darkFlag : q.includes("prefers-reduced-motion") ? false : false,
      addEventListener() {},
    }),
    setTimeout,
    clearTimeout,
  };
  vtCalls = 0;
  vtCallback = null;
  return env;
}

function loadTheme() {
  const src = readSrc("src/theme.js")
    .replace(/^import \* as S from ".*store\.js";$/m, "const S = globalThis.__storeStub;")
    .replace(/^import \{ api \} from ".*api\.js";$/m, "const { api } = globalThis.__apiStub;")
    .replace(/^export \{ THEMES \} from ".*themeProfiles\.js";$/m, "")
    .replace(/^import \{ THEMES, getThemeProfile \} from ".*themeProfiles\.js";$/m, "const { THEMES, getThemeProfile } = globalThis.__themeProfileStub;")
    .replace(/^export /gm, "")
    .concat("\nglobalThis.__theme = { applyTheme, setTheme, setThemeMode, initTheme, resolveTheme, resolveThemeMode, getThemeMode };\n");
  // 注意：ctx 里不要放名为 globalThis 的键 —— 会遮蔽 vm 内建的 globalThis。
  // stub（__storeStub / __themeProfileStub / __apiStub）挂在外层 globalThis 上，必须显式搬进上下文。
  const ctx = {
    console, setTimeout, clearTimeout, Math, Promise,
    window: globalThis.window, document: globalThis.document,
    __storeStub: globalThis.__storeStub, __themeProfileStub: globalThis.__themeProfileStub,
    __apiStub: globalThis.__apiStub,
  };
  ctx.globalThis = ctx;   // 上下文内的 globalThis 指向上下文自身
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.__theme;
}

/* ── 场景 1：主路径 View Transitions ── */
{
  darkFlag = false;
  const e = installEnv({ supportVT: true, motion: "system" });
  const mod = loadTheme();

  // 初始应用（无 animate）：直接写 dataset，不出动画
  mod.applyTheme("classic");
  assert.equal(e.root.dataset.theme, "classic");
  assert.equal(e.root.dataset.themeMode, "light", "跟随系统 + 系统浅色 → light");
  assert.equal(e.root.style.colorScheme, "light");
  assert.equal(vtCalls, 0, "无 animate 不出转场");

  // 🔴 核心回归点：浅色↔深色只是模式变化（主题 id 不变），旧实现在这里零动画
  e.dispatch("pointerdown", { clientX: 120, clientY: 80 });
  mod.setThemeMode("dark", { animate: true });
  assert.equal(vtCalls, 1, "模式切换必须触发 View Transition（旧实现此处为 0 —— 突兀根因）");
  assert.equal(e.root.dataset.themeMode, "light", "转场回调执行前 DOM 仍是旧配色");
  vtCallback();
  assert.equal(e.root.dataset.themeMode, "dark", "转场回调里写入新模式");
  assert.equal(e.root.dataset.theme, "classic", "主题 id 不变");
  assert.equal(e.root.style.colorScheme, "dark");
  // 圆形揭示几何：起点 = 最近按下位置，半径 = 到最远角距离
  assert.equal(e.styleStore.get("--theme-reveal-x"), "120px");
  assert.equal(e.styleStore.get("--theme-reveal-y"), "80px");
  assert.equal(e.styleStore.get("--theme-reveal-r"), `${Math.ceil(Math.hypot(800 - 120, 600 - 80))}px`,
    "半径必须覆盖从按下点到最远角");

  // 状态没变：不重复出转场
  mod.setThemeMode("dark", { animate: true });
  assert.equal(vtCalls, 1, "同状态重复设置不得再出转场");

  // 换主题 id（night 恒深色）也走转场
  mod.setTheme("night", { animate: true });
  assert.equal(vtCalls, 2, "主题 id 变化仍走转场");
  vtCallback();
  assert.equal(e.root.dataset.theme, "night");
  assert.equal(e.root.dataset.themeMode, "dark", "night 是原生深色主题");

  // 程序触发（无按下坐标）：从屏幕中心扩散 —— 独立模块实例验证
  const e2 = installEnv({ supportVT: true, motion: "system" });
  const mod2 = loadTheme();
  mod2.applyTheme("classic");
  mod2.setThemeMode("dark", { animate: true });
  assert.equal(vtCalls, 1);
  assert.equal(e2.styleStore.get("--theme-reveal-x"), "400px", "无按下记录 → 屏幕水平中心");
  assert.equal(e2.styleStore.get("--theme-reveal-y"), "300px", "无按下记录 → 屏幕垂直中心");
  vtCallback();
}

/* ── 场景 2：降级（无 startViewTransition）→ 全元素过渡 class ── */
{
  darkFlag = false;
  const e = installEnv({ supportVT: false, motion: "system" });
  const mod = loadTheme();
  mod.applyTheme("classic");
  mod.setThemeMode("dark", { animate: true });
  assert.equal(e.root.classList.contains("theme-transitioning"), true, "降级路径必须挂全元素过渡 class");
  assert.equal(e.root.dataset.themeMode, "dark", "降级路径同样立即应用新配色");
  await sleep(420);
  assert.equal(e.root.classList.contains("theme-transitioning"), false, "340ms 后过渡 class 必须摘掉");
}

/* ── 场景 3：动效偏好 reduced → 不出任何动画 ── */
{
  darkFlag = false;
  const e = installEnv({ supportVT: true, motion: "reduced" });
  const mod = loadTheme();
  mod.applyTheme("classic");
  mod.setThemeMode("dark", { animate: true });
  assert.equal(vtCalls, 0, "减少动效时不调 startViewTransition");
  assert.equal(e.root.classList.contains("theme-transitioning"), false, "也不走降级过渡");
  assert.equal(e.root.dataset.themeMode, "dark", "但配色必须立即生效");
}

/* ── 场景 4：系统深浅变化（跟随系统自动切换）也走动画 ── */
{
  darkFlag = false;
  const e = installEnv({ supportVT: true, motion: "system" });
  const mod = loadTheme();
  mod.applyTheme("classic");
  darkFlag = true;   // 系统切到深色
  mod.applyTheme("classic", { animate: true });   // initTheme listener 的调用形态
  assert.equal(vtCalls, 1, "跟随系统的深浅变化同样出转场");
  vtCallback();
  assert.equal(e.root.dataset.themeMode, "dark");
}

/* ── 场景 5：状态栏图标明暗必须跟着**解析后的亮度**走（v0.51.0）──
   背景：Android edge-to-edge 下状态栏图标压在网页上，颜色由系统按**系统深色模式**定，
   与网页 data-theme-mode 无关 ⇒ 两者不一致时图标看不见（实测对比度 1.02 / 1.16）。
   修法是每次 paintTheme 就把 resolved.mode 同步过去。
   这里钉住「同步的值 == 解析后的亮度」——传主题 id 或传反都会让修复失效。 */
{
  darkFlag = false;
  const e = installEnv({ supportVT: true, motion: "system" });
  const mod = loadTheme();
  const calls = e.systemBarCalls;

  // 系统浅色 + 浅色主题 ⇒ 浅背景 ⇒ 要深色图标 ⇒ true
  calls.length = 0;
  mod.applyTheme("classic");
  assert.deepEqual([...calls], [true],
    "首次应用浅色主题必须同步 darkIcons=true（浅背景配深色图标），且只同步一次");

  // 切深色 ⇒ 深背景 ⇒ 要浅色图标 ⇒ false
  calls.length = 0;
  darkFlag = true;
  mod.applyTheme("classic");
  assert.deepEqual([...calls], [false],
    "系统转深色后必须同步 darkIcons=false；传 true 会让图标在深背景上消失");

  // 🔴 关键：显式浅色模式（系统深色）下，网页仍是浅色 ⇒ 必须还是 true。
  // 若实现传的是主题 id 或搞错了解析顺序，这里会拿到 false。
  calls.length = 0;
  e.settings.themeMode = "light";
  mod.applyTheme("classic");
  assert.equal(e.root.dataset.themeMode, "light", "显式浅色模式：系统深色也不影响网页亮度");
  assert.deepEqual([...calls], [true],
    "必须跟**解析后**的亮度（light），不是系统偏好、也不是主题 id");

  // 同步是装饰性的：原生层抛错不能把换主题搞崩
  calls.length = 0;
  const original = globalThis.__apiStub.api.systemBar;
  globalThis.__apiStub.api.systemBar = () => { throw new Error("原生层不可用"); };
  mod.applyTheme("classic");
  assert.equal(e.root.dataset.themeMode, "light", "系统栏同步抛错时主题仍要正常应用");
  globalThis.__apiStub.api.systemBar = original;

  // 原生命令**不存在**（旧版原生层）也不能崩 —— 走的是可选调用 `?.`
  calls.length = 0;
  globalThis.__apiStub.api.systemBar = undefined;
  mod.applyTheme("classic");
  assert.equal(e.root.dataset.themeMode, "light", "原生命令缺失时主题仍要正常应用");
  globalThis.__apiStub.api.systemBar = original;
}

/* ── 源码守卫：CSS 侧的圆形揭示与动效豁免必须就位 ── */
{
  const css = readSrc("src/styles.css");
  assert.match(css, /::view-transition-new\(root\)\s*\{[^}]*animation:\s*theme-reveal/, "View Transitions 主路径的揭示动画必须挂在 ::view-transition-new(root) 上");
  assert.match(css, /@keyframes theme-reveal\s*\{/, "圆形揭示 keyframes 必须存在");
  assert.match(css, /--theme-reveal-x/, "揭示起点必须可由 JS 注入");
  assert.match(css, /:root\[data-ui-motion="reduced"\]::view-transition-new\(root\)/, "应用内「减少动效」必须豁免揭示动画");

  /* 🔴 坐标系换算（v0.71.1）：`--theme-reveal-*` 由 theme.js 按**屏幕 CSS px** 写入
     （pointerdown 的 clientX/Y），但 `::view-transition` 伪元素活在 **zoom 之后的坐标系**里 ——
     uiScale.js 把「用户缩放 × 窄屏自适应」写在 `documentElement.style.zoom` 上，伪元素盒
     于是变成 `视口 / zoom`（无头 Chrome 实测 zoom=0.64：视口 503×642，伪元素盒 785×1003）。
     不除以 `--ui-scale`，圆就画在真实位置的 1/zoom 处：手机上圆心从左下角的按钮
     漂到「左中间」，半径也扫不到右下角（2026-09-19 用户报的正是这个）。
     换算写法沿用 uiScale.js 的既有契约：恒定物理长度一律 `calc(Npx / var(--ui-scale))`。 */
  /* ⚠️ 下面三条报错时先别急着查代码：共享工作区里 `src/styles.css` 随时可能被**并行会话**
     改写 —— 实测 2026-09-19：并行会话跑它自己的变异测试时会把 ` / var(--ui-scale, 1)`
     整批抽掉（正则与本文件变异 M6 同款，它同样按全文件替换），本脚本恰好读到那一瞬间，
     就报出「源码缺 ÷ var(--ui-scale)」的**假失败**，重跑即过。
     判据：源码里明明有 ÷ var(--ui-scale) 却报缺 —— 那就是瞬时改写，不是真缺口。 */
  const MAYBE_CONCURRENT = "（若源码里确有 ÷ var(--ui-scale)，多半是并行会话正在改 styles.css，重跑一次）";
  const reveal = css.match(/@keyframes theme-reveal\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.ok(reveal, "必须存在 @keyframes theme-reveal 块");
  assert.match(reveal, /--theme-reveal-x\s*[^)]*\)\s*\/\s*var\(--ui-scale/, "揭示起点 x 必须除以生效缩放系数换算进 VT 坐标系" + MAYBE_CONCURRENT);
  assert.match(reveal, /--theme-reveal-y\s*[^)]*\)\s*\/\s*var\(--ui-scale/, "揭示起点 y 必须除以生效缩放系数换算进 VT 坐标系" + MAYBE_CONCURRENT);
  assert.match(reveal, /--theme-reveal-r\s*[^)]*\)\s*\/\s*var\(--ui-scale/, "揭示半径必须同样换算，否则圆收不到最远角" + MAYBE_CONCURRENT);
  assert.match(reveal, /var\(--ui-scale,\s*1\)/, "--ui-scale 必须带 1 兜底：没初始化缩放时 calc 不能非法，整条 clip-path 会被丢掉" + MAYBE_CONCURRENT);
}

/* ── 变异测试：证明上面的断言承重 ──
   每个变异写回源码后，用子进程重跑本文件（THEME_TRANSITION_NO_MUTATE=1 跳过变异循环、
   只跑断言），变异后必须失败才算断言承重。 */
if (!process.env.THEME_TRANSITION_NO_MUTATE) {
  const { spawnSync } = await import("node:child_process");
  const THEME_FILE = "src/theme.js";
  const CSS_FILE = "src/styles.css";
  const files = {};
  const readOf = (rel) => (files[rel] ??= fs.readFileSync(path.join(__dirname, "..", rel), "utf8"));
  const mutations = [
    // M1 = 旧 bug 复活：模式变化不再计入「变了」→ 深浅切换零动画
    ["模式变化不计入 changed（旧 bug）", THEME_FILE,
      /const changed = root\.dataset\.theme !== resolved\.id \|\| root\.dataset\.themeMode !== resolved\.mode;/,
      "const changed = root.dataset.theme !== resolved.id;"],
    // M2 = 主路径被砍：永远走降级
    ["View Transitions 主路径被砍", THEME_FILE,
      /if \(typeof doc\.startViewTransition === "function"\) \{/,
      "if (false) {"],
    // M3 = 减少动效豁免失效
    ["reduced 豁免失效", THEME_FILE,
      /if \(!themeMotionAllowed\(\)\) \{\s*\n\s*mutate\(\);\s*\n\s*return;\s*\n\s*\}/,
      "if (false) { mutate(); return; }"],
    // M4 = 状态栏同步被砍（原生写好了但没人调，症状与没修一样）
    //      ⚠️ 行尾写 `\r?\n`：工作树是 CRLF（git autocrlf 的常态），只写 `\n` 会失配 ——
    //      实测这条变异因此一直「未命中源码」，等于这个洞从来没被测到。
    ["状态栏图标同步被砍", THEME_FILE,
      /  syncSystemBarIcons\(resolved\.mode\);\r?\n/,
      ""],
    // M5 = 同步值传反（浅背景配浅色图标 ⇒ 看不见）
    ["状态栏图标明暗传反", THEME_FILE,
      /api\.systemBar\(mode === "light"\)/,
      'api.systemBar(mode === "dark")'],
    // M6 = v0.71.1 修复被回退：揭示几何不再换算进 zoom 坐标系
    //      （桌面 zoom=1 看不出问题，手机上圆心漂到「左中间」—— 用户报的原样）
    ["揭示几何未换算 zoom 坐标系", CSS_FILE,
      / \/ var\(--ui-scale, 1\)/g,
      ""],
    // M7 = 兜底被去掉：uiScale 尚未写入 --ui-scale 时 calc 非法，整条 clip-path 被丢
    ["--ui-scale 兜底被去掉", CSS_FILE,
      /var\(--ui-scale, 1\)/g,
      "var(--ui-scale, 0.8)"],
  ];
  let allBlocked = true;
  for (const [name, rel, re, rep] of mutations) {
    const orig = readOf(rel);
    const mutated = orig.replace(re, rep);
    if (mutated === orig) { console.log(`✗ 变异未命中源码：${name}`); allBlocked = false; continue; }
    const target = path.join(__dirname, "..", rel);
    let blocked = false;
    // 变异写入也要重试 —— Windows 上偶发文件占用（errno -4094），全量跑时 styles.css
    // 刚被前面的环节写过更容易撞上。原来只有还原路径有重试，写入这边一抛
    // `UNKNOWN` 就把整个测试脚本炸成 FAIL，而单跑又稳定复现不出来。
    let prepared = false;
    for (let i = 0; i < 6 && !prepared; i += 1) {
      try {
        fs.writeFileSync(target, mutated);
        // 回读确认变异真落盘了：Windows 上写入偶发失败（文件被占用，errno -4094），
        // 不确认就会拿「没变异的源码」去跑，报出来的「漏过」是假的。
        // ⚠️ 必须直接读磁盘 —— readOf() 带缓存（files[rel] ??= ...），拿它回读会永远
        // 读到变异前的内容，这个检查就变成了摆设。
        prepared = fs.readFileSync(target, "utf8") === mutated;
      } catch { /* 文件被占用，等一下重试 */ }
      if (!prepared) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
    if (!prepared) { console.log(`✗ 变异写入持续失败（文件被占用）：${name}`); allBlocked = false; continue; }
    try {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        encoding: "utf8",
        env: { ...process.env, THEME_TRANSITION_NO_MUTATE: "1" },
        timeout: 30000,
      });
      blocked = r.status !== 0;
    } finally {
      // 🔴 还原必须在 finally 里，而且要**回读 + 重试** —— 实测发生过一次：M4（删掉
      //    `syncSystemBarIcons(resolved.mode)` 那行调用）的变异被留在了 src/theme.js 里。
      //    原因是原来的代码把还原写在 try 外面，还原写入又碰上 Windows 的文件占用
      //    （errno -4094）直接抛了，于是变异留在仓库里，后续 `npm test` 报出一堆
      //    莫名其妙的状态栏失败，排查方向全错。
      let restored = false;
      for (let i = 0; i < 6 && !restored; i += 1) {
        try {
          fs.writeFileSync(target, orig);
          restored = fs.readFileSync(target, "utf8") === orig;
        } catch { /* 文件被占用，等一下重试 */ }
        if (!restored) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
      }
      if (!restored) {
        console.error(`🔴 变异还原失败，仓库里留下了变异：${rel} —— 请手动执行 git checkout -- ${rel}`);
        process.exit(1);
      }
    }
    console.log(`${blocked ? "✓ 被拦下" : "✗ 漏过了"} ${name}`);
    if (!blocked) allBlocked = false;
  }
  if (!allBlocked) process.exitCode = 1;
}

// 失败时不要打印 PASS —— 实测被这条刷过去过：变异「未命中源码」把 exitCode 置了 1，
// 但末尾无条件打印 PASS，看日志的人以为通过了。
if (process.exitCode) process.exit(process.exitCode);
console.log("PASS: 主题/深浅模式切换动画（VT 圆形揭示主路径 + 降级过渡 + 减少动效豁免 + 守卫与变异）");
process.exit(0);
