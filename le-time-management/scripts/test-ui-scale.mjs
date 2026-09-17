/* 界面整体缩放（设置 → 界面与交互 → 界面缩放）的回归测试。
 *
 * 分三块：
 *  1. `src/uiScale.js` 的纯逻辑 —— 夹取、步进对齐、非法值兜底。
 *  2. `applyUiScale()` 真的往 documentElement 写了正确的 zoom / --ui-scale / --ui-vw / --ui-vh
 *     （用 vm 注入一个假 document，与 test-dorm-duty.mjs 同一套路）。
 *  3. **源码守卫** —— 这是本次改动最容易回归的部分：
 *     - styles.css 里不许再有 fixed 浮层直接用 `100vw`/`100vh`/`100dvh` 兜底（zoom 下会溢出屏幕）；
 *     - 断点必须保持 `px`，且不许把「缩放跟随断点」当成既成事实写进代码或注释。
 *     第一·条不是风格偏好，是 zoom 生效的前提，破了就等于功能坏掉，所以拿断言钉住。
 *
 * 关于第二条（曾一度写反，这里记录实测结论，别再翻回去）：
 * 本文件曾断言「媒体查询里不许有 px 断点，必须改用 em，em 会跟着 zoom 走」。
 * **那是错的**。无头 Chrome 实测（window-size=1280 → 视口 1264px，zoom=1.5 → html 计算字号 24px）：
 *
 *   @media (max-width: 65em)   → 不命中   （16px 基=1040，24px 基=1560，1264 两者都>，不可分辨）
 *   @media (max-width: 79em)   → **命中** （16px 基=1264 <= 1264 ✓；24px 基=1896 > 1264 应不命中 ✗）
 *   @media (max-width: 1264px) → 命中
 *   html 计算字号实测 24px（说明 zoom 确实把 html 的 font-size 缩放到了 24px）
 *
 * ⇒ **`em` 媒体查询固定按浏览器初始字号（默认 16px）求值，`html { font-size }` 与 `zoom`
 * 都改不动它。** 所以断点只能写 `px`，`zoom` 不会让窄屏断点提前命中 —— 这是本功能的
 * 已知边界（缩放只做「整页等比大小」，不改布局断点），不是缺陷。
 * 想让断点跟随缩放只能走 `@container`，属独立改造。
 *
 * v0.49.0 追加「窄屏自适应」：`applyUiScale` 除了用户设定，还要乘一个
 * `narrowAutoFactor(innerWidth)`（低于 360px 才生效）。所以第二条的判据变成
 * 「zoom = 用户设定 × 自适应」，`--ui-vw/--ui-vh` 必须除以**生效系数**而不是用户设定
 * —— 这一条最容易写错，下面用 288px 视口钉死。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_UI_SCALE,
  NARROW_MIN_FACTOR,
  NARROW_REFERENCE_WIDTH,
  UI_SCALE_LIMITS,
  UI_SCALE_PRESETS,
  __resetUiScaleForTest,
  applyUiScale,
  getAutoScaleFactor,
  getUiScale,
  getUiScaleFactor,
  initUiScale,
  narrowAutoFactor,
  normalizeUiScale,
} from "../src/uiScale.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

/* ────────────────────────── 1. 纯逻辑 ────────────────────────── */

// 区间与步进是功能的对外契约，写死在这里 —— 改了要连着设置页文案一起改。
assert.deepEqual(
  { min: UI_SCALE_LIMITS.min, max: UI_SCALE_LIMITS.max, step: UI_SCALE_LIMITS.step },
  { min: 80, max: 150, step: 5 },
);
assert.equal(DEFAULT_UI_SCALE, 100);

// 合法值原样通过
assert.equal(normalizeUiScale(100), 100);
assert.equal(normalizeUiScale(125), 125);
assert.equal(normalizeUiScale(80), 80);
assert.equal(normalizeUiScale(150), 150);

// 越界夹取
assert.equal(normalizeUiScale(10), 80);
assert.equal(normalizeUiScale(0), 100, "0 视为「没设置过」，回默认而不是夹到 80");
assert.equal(normalizeUiScale(-40), 80);
assert.equal(normalizeUiScale(999), 150);
assert.equal(normalizeUiScale(1e9), 150);
assert.equal(normalizeUiScale(Infinity), 150, "Infinity 夹到上限");

// 非 5 的倍数对齐到最近的档位
assert.equal(normalizeUiScale(117), 115);
assert.equal(normalizeUiScale(118), 120);
assert.equal(normalizeUiScale(83), 85);
assert.equal(normalizeUiScale(82), 80);
assert.equal(normalizeUiScale("125"), 125, "字符串数字来自 input.value，必须认");

// 非法输入兜底
for (const bad of [undefined, null, NaN, "", "abc", {}, [], true]) {
  assert.equal(normalizeUiScale(bad), 100, `非法输入 ${JSON.stringify(bad)} 应回默认 100`);
}

// 幂等：夹过之后再夹一次不变（设置页 input/change 两个事件会连续调用）
for (const raw of [83, 117, 0, 999, NaN]) {
  const once = normalizeUiScale(raw);
  assert.equal(normalizeUiScale(once), once, `normalizeUiScale 应幂等：${raw}`);
}

// 档位按钮必须都在合法区间内，且不重复
const presetValues = UI_SCALE_PRESETS.map(([value]) => value);
assert.equal(new Set(presetValues).size, presetValues.length, "档位不能重复");
for (const value of presetValues) {
  assert.equal(normalizeUiScale(value), value, `档位 ${value}% 必须本身合法`);
}
assert.ok(presetValues.includes(DEFAULT_UI_SCALE), "档位里要有「标准」这一档，否则用户没法回到默认");

/* ──────────────── 1b. 窄屏自适应系数（v0.49.0） ──────────────── */

// 基准宽度是功能的对外契约：动它等于改变所有窄屏设备的观感（实测 288px 的 600dpi 屏
// 上，外壳占屏高 26% → 20.6%）。要改就连同设置页文案一起改。
assert.equal(NARROW_REFERENCE_WIDTH, 360);
assert.equal(NARROW_MIN_FACTOR, 0.7);

// 标准手机逻辑宽度（360 / 390 / 412 是最常见的三档）：一律不缩 —— 这是「常规机零影响」的判据
for (const w of [360, 375, 390, 393, 412, 414, 560, 768, 1024, 1440, 3840]) {
  assert.equal(narrowAutoFactor(w), 1, `${w}px 不该触发窄屏自适应`);
}

// 窄于基准：系数 = 宽 / 基准，使内容布局宽度恰好回到基准
assert.equal(narrowAutoFactor(288), 0.8, "288 → 0.8（布局宽度回到 360）");
assert.equal(narrowAutoFactor(324), 0.9);
assert.equal(narrowAutoFactor(320), 320 / 360);
assert.equal(narrowAutoFactor(252), NARROW_MIN_FACTOR, "触到下限");
assert.equal(narrowAutoFactor(1), NARROW_MIN_FACTOR, "再窄也不缩过头");

// 拿不到宽度一律退回 1（宁可不缩，也不要因为读不到视口把界面缩坏）
for (const bad of [undefined, null, NaN, "", "abc", {}, [], 0, -320, Infinity, -Infinity]) {
  assert.equal(narrowAutoFactor(bad), 1, `宽度 ${JSON.stringify(bad)} 应退回 1（不缩）`);
}

// 区间内单调：越窄缩得越多
assert.ok(narrowAutoFactor(300) < narrowAutoFactor(340), "越窄应缩得越多");
assert.ok(narrowAutoFactor(359) < 1);
// 纯函数：同输入同输出
assert.equal(narrowAutoFactor(288), narrowAutoFactor(288));

/* ────────────────────── 2. applyUiScale 的 DOM 写入 ────────────────────── */

// 假 document / window：只要 root.style.setProperty / addEventListener 够用就行。
function makeEnv({ width = 1440, height = 900 } = {}) {
  const vars = new Map();
  const listeners = new Map();
  const root = {
    style: {
      zoom: "",
      setProperty(name, value) { vars.set(name, value); },
      getPropertyValue(name) { return vars.has(name) ? vars.get(name) : ""; },
    },
  };
  return {
    vars,
    listeners,
    document: { documentElement: root },
    window: {
      innerWidth: width,
      innerHeight: height,
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
    },
  };
}

const loadModuleInEnv = (env) => {
  const src = readSrc("src/uiScale.js")
    // 剥掉 ESM 导出语法，改成往 globalThis 上挂，好在 vm 里跑
    .replace(/^export\s+/gm, "")
    .concat("\nglobalThis.__uiScale = { __resetUiScaleForTest, applyUiScale, initUiScale, getUiScale, getUiScaleFactor, getAutoScaleFactor, narrowAutoFactor, viewportWidth, viewportHeight, normalizeUiScale, UI_SCALE_LIMITS, NARROW_REFERENCE_WIDTH, NARROW_MIN_FACTOR };\n");
  const ctx = { console, document: env.document, window: env.window };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.__uiScale;
};

{
  const env = makeEnv({ width: 1440, height: 900 });
  const mod = loadModuleInEnv(env);
  mod.__resetUiScaleForTest();

  // 100%：zoom=1，且 --ui-vw/--ui-vh 恰好等于视口（除以 1）
  assert.equal(mod.applyUiScale(100), 100);
  assert.equal(env.document.documentElement.style.zoom, "1");
  assert.equal(env.vars.get("--ui-scale"), "1");
  assert.equal(env.vars.get("--ui-vw"), "1440px");
  assert.equal(env.vars.get("--ui-vh"), "900px");

  // 150%：zoom=1.5；视口补偿必须是「除以 1.5」的原始长度，否则 fixed 浮层掉到屏幕外
  assert.equal(mod.applyUiScale(150), 150);
  assert.equal(env.document.documentElement.style.zoom, "1.5");
  assert.equal(env.vars.get("--ui-scale"), "1.5");
  assert.equal(env.vars.get("--ui-vw"), "960px", "1440 / 1.5");
  assert.equal(env.vars.get("--ui-vh"), "600px", "900 / 1.5");

  // 80%：放大视口补偿（1440 / 0.8 = 1800），fixed 浮层的坐标空间随之变大
  assert.equal(mod.applyUiScale(80), 80);
  assert.equal(env.document.documentElement.style.zoom, "0.8");
  assert.equal(env.vars.get("--ui-vw"), "1800px");
  assert.equal(env.vars.get("--ui-vh"), "1125px");

  // 非法值：写入的仍是夹取后的合法值，不是原始输入
  mod.applyUiScale(9999);
  assert.equal(env.document.documentElement.style.zoom, "1.5");
  assert.equal(env.vars.get("--ui-vw"), "960px");

  // getUiScale / getUiScaleFactor 与写入保持一致
  mod.applyUiScale(125);
  assert.equal(mod.getUiScale(), 125);
  assert.equal(mod.getUiScaleFactor(), 1.25);
  assert.equal(mod.viewportWidth(), 1440 / 1.25);
  assert.equal(mod.viewportHeight(), 900 / 1.25);

  // resize 后 --ui-vw/--ui-vh 必须刷新（纯 CSS 算不出来，只能靠监听）
  mod.initUiScale();
  const resizeHandlers = env.listeners.get("resize") || [];
  assert.equal(resizeHandlers.length, 1, "resize 监听应恰好挂一次");
  assert.ok((env.listeners.get("orientationchange") || []).length >= 1, "横竖屏切换也要刷（部分 WebView 不发 resize）");
  env.window.innerWidth = 800;
  env.window.innerHeight = 600;
  resizeHandlers[0]();
  assert.equal(env.vars.get("--ui-vw"), String(800 / 1.25) + "px", "resize 后要重算 --ui-vw");
  assert.equal(env.vars.get("--ui-vh"), String(600 / 1.25) + "px", "resize 后要重算 --ui-vh");
  assert.equal(env.document.documentElement.style.zoom, "1.25", "resize 不该改缩放值");

  // initUiScale 幂等：重复调用不得挂出第二组监听（否则每次进设置页都堆一个）
  mod.initUiScale();
  mod.initUiScale();
  assert.equal((env.listeners.get("resize") || []).length, 1, "initUiScale 必须幂等");
}

{
  // ── 窄屏（600dpi 的 1080×2376 实测只有 288×633 CSS px）──
  // 判据：生效系数 = 用户设定 × 自适应，且 --ui-vw/--ui-vh 必须除以**生效系数**。
  const env = makeEnv({ width: 288, height: 633.6 });
  const mod = loadModuleInEnv(env);
  mod.__resetUiScaleForTest();

  assert.equal(mod.applyUiScale(100), 100, "返回值仍是用户设定，不被自适应改写");
  assert.equal(mod.getUiScale(), 100, "设置页显示用户设定");
  assert.equal(mod.getAutoScaleFactor(), 0.8);
  assert.equal(mod.getUiScaleFactor(), 0.8, "生效系数 = 1.0 × 0.8");
  assert.equal(env.document.documentElement.style.zoom, "0.8");
  assert.equal(env.vars.get("--ui-scale"), "0.8");
  assert.equal(env.vars.get("--ui-auto-scale"), "0.8");
  // 🔴 视口补偿除以生效系数：288 / 0.8 = 360。
  //    写成「除以用户设定」（288 / 1）会让 width: var(--ui-vw) 的浮层在 360 宽的
  //    内容坐标系里只画 288 宽 —— 缺一块，且只有窄屏才复现。
  assert.equal(Math.round(parseFloat(env.vars.get("--ui-vw"))), 360);
  assert.equal(Math.round(parseFloat(env.vars.get("--ui-vh"))), 792);
  assert.equal(mod.viewportWidth(), 288 / 0.8);

  // 用户自己再缩到 80%：两段系数相乘（0.8 × 0.8 = 0.64）
  mod.applyUiScale(80);
  assert.equal(mod.getUiScale(), 80);
  assert.equal(mod.getAutoScaleFactor(), 0.8, "自适应部分不随用户设定变");
  assert.equal(Math.round(mod.getUiScaleFactor() * 100), 64);
  assert.equal(Math.round(parseFloat(env.vars.get("--ui-vw"))), Math.round(288 / 0.64));

  // 旋屏到 768px 宽：自适应退出，只剩用户设定
  env.window.innerWidth = 768;
  env.window.innerHeight = 400;
  mod.applyUiScale(80);
  assert.equal(mod.getAutoScaleFactor(), 1);
  assert.equal(mod.getUiScaleFactor(), 0.8);
  assert.equal(env.vars.get("--ui-auto-scale"), "1");
  assert.equal(env.vars.get("--ui-vw"), "960px", "768 / 0.8");

  // 回到标准手机宽度：必须与旧行为逐位一致（这是「常规机零影响」的判据）
  const env2 = makeEnv({ width: 390, height: 844 });
  const mod2 = loadModuleInEnv(env2);
  mod2.__resetUiScaleForTest();
  mod2.applyUiScale(100);
  assert.equal(env2.document.documentElement.style.zoom, "1");
  assert.equal(env2.vars.get("--ui-scale"), "1");
  assert.equal(env2.vars.get("--ui-auto-scale"), "1");
  assert.equal(env2.vars.get("--ui-vw"), "390px");
  assert.equal(env2.vars.get("--ui-vh"), "844px");
}

/* ───────────────────── 3. 源码守卫（zoom 成立的硬前提） ───────────────────── */

const styles = readSrc("src/styles.css");

// 3a. fixed 浮层不许拿 100vw/100vh/100dvh 当兜底值 —— zoom 下它们乘上缩放系数会大于屏幕。
//     `var(--ui-vw, 100vw)` 这种写法是**允许**的：兜底只在 JS 没来得及写变量时生效。
const offenders = [];
const declRe = /(^|[;{]\s*)((?:left|right|top|bottom|width|max-width|min-width|height|max-height|min-height|inset)\s*:\s*)([^;}]+)/g;
let m;
while ((m = declRe.exec(styles))) {
  const value = m[3];
  if (!/(^|[^-\w])(?:100vw|100vh|100dvh)/.test(value)) continue;
  // 已被 var(--ui-v*) 包住的直接放行
  const stripped = value.replace(/var\(\s*--ui-v[wh]\s*,[^)]*\)/g, "UI");
  if (!/(^|[^-\w])(?:100vw|100vh|100dvh)/.test(stripped)) continue;
  offenders.push(`${m[2].trim()} ${value.trim()}`);
}
assert.deepEqual(
  offenders,
  [],
  "这些声明在 zoom 下会溢出屏幕，请改用 var(--ui-vw, 100vw) / var(--ui-vh, 100dvh)：\n" + offenders.join("\n"),
);

// 3b. `:root` 里绝不许给 --sat/--sab/--sal/--sar 写兜底默认值。
//     变量一旦在 :root 成为有效值，`var()` 的第二个参数（原生 env()）就永远失效，
//     iOS 与桌面的安全区会整个废掉。这条在 AGENTS.md 里点名过，这里钉死。
const rootBlock = (styles.match(/:root\s*\{[\s\S]*?\n\}/) || [""])[0];
for (const varName of ["--sat", "--sab", "--sal", "--sar"]) {
  assert.ok(
    !new RegExp(`${varName}\\s*:`).test(rootBlock),
    `:root 里不能定义 ${varName}，否则 var() 的 env() 兜底永远不生效`,
  );
}

// 3c. 🔴 固定浮层的边距必须写「÷ --ui-scale」，**不许**再写「视口长 − 边距」。
//     v0.48.0 曾把 bottom / inset 改成 `calc(var(--ui-vh, 100dvh) - N)`，理由是
//     「zoom 下 px 会被缩放」。实测（1280×800，zoom=1 与 1.5 两档，
//     .workbuddy-ai/tmp/probe-inset-zoom.cjs）那是错的：该写法等价于「距屏幕**顶** N」——
//     toast 跑到屏幕上沿、设置弹窗塌成 2×2 被推出屏幕（桌面 >760px 设置页整个打不开，
//     v0.48.0 ~ v0.49.1）。正确写法是「物理边距 N ÷ 系数」。推导见 styles.css 顶部契约第 1 条。
assert.match(styles, /#toasts\s*\{[^}]*bottom:\s*calc\(22px\s*\/\s*var\(--ui-scale/,
  "#toasts 的 bottom 要写「边距 ÷ --ui-scale」");
assert.match(styles, /\.settings-modal\s*\{[^}]*inset:\s*calc\(36px\s*\/\s*var\(--ui-scale/,
  ".settings-modal 的 inset 要写「边距 ÷ --ui-scale」");
// v0.50.0 用户反馈「设置弹窗左右太宽」：限宽 1120px + margin auto 居中。
// max-width 必须是裸值、不许 ÷ --ui-scale —— zoom 放大时字号一起放大，
// ÷scale 会把大字号挤进没放大的宽度里（与 inset 的「物理边距」语义相反，别搞混）。
assert.match(styles, /\.settings-modal\s*\{[^}]*max-width:\s*1120px[^}]*margin:\s*auto/,
  ".settings-modal 要限宽 1120px 并 margin auto 居中（不许改回全宽铺开）");
assert.doesNotMatch(styles, /\.settings-modal\s*\{[^}]*max-width:\s*calc\([^)]*--ui-scale/,
  ".settings-modal 的 max-width 不许 ÷ --ui-scale（会挤压 zoom 放大后的内容）");
// 反向守卫：定位锚点里出现「--ui-v* − 数值」一律算回归。
// （`calc(var(--ui-vh) * .11)` 这类「乘比例」是合法用法，不要误伤。）
const badAnchors = [...styles.matchAll(/(?:^|[\s;{])(bottom|top|left|right|inset)\s*:[^;]*?calc\(var\(--ui-v[wh][^;]*?-\s*[\d.]+px/g)]
  .map((m) => `${m[1]}: ${m[0].slice(m[0].indexOf("calc")).trim()}`);
assert.deepEqual(badAnchors, [],
  "不许再写「视口长 − 边距」（v0.48.0 的错误写法，v0.49.2 已改回「边距 ÷ --ui-scale」）：\n" + badAnchors.join("\n"));

// 3c-2. 窄屏设置弹窗全屏贴顶 ⇒ 顶栏必须自己让开状态栏。
//       （v0.49.2 用户反馈：APK 里「设置」二字与「关闭」按钮被手机状态栏压住。）
//       Android WebView 不实现 env(safe-area-inset-*)，只有 --sat 是真的 ⇒ 双路写法。
assert.match(styles, /\.settings-modal-head\s*\{\s*padding-top:\s*calc\(12px \+ var\(--sat/,
  "窄屏设置弹窗顶栏要让开状态栏（padding-top 消费 --sat，双路写法）");

// 3d. 🔴 反向守卫：**不许**再把断点写成 em。
//     实测 em 媒体查询恒定按浏览器默认 16px 求值，zoom 与 html font-size 都影响不了它，
//     所以 em 断点相对 px 断点没有任何收益，只会让断点值与设计稿脱节。
//     这条是给「又有人想用 em 让断点跟随缩放」准备的 —— 那个思路已被实测推翻。
const emBreakpoints = (styles.match(/@media[^{]*\{/g) || [])
  .filter((head) => /(?:max|min)-width:\s*\d+(?:\.\d+)?em/.test(head));
assert.deepEqual(
  emBreakpoints,
  [],
  "媒体查询断点请用 px：em 媒体查询不跟随 zoom（实测恒定按 16px 求值），改 em 没有收益\n"
    + emBreakpoints.join("\n"),
);

// 3e. 桌面/手机的 px 断点必须一个不少、数量也对得上。
//     ⚠️ 只断言「某断点存在」是不够的：同一个断点在全文件出现多处（760px 有 12 处），
//     改坏一处、其余仍能匹配 → 假断言（变异测试实测逃逸过）。所以这里钉**精确条数**。
//     这批数字是回退 em 时的对照表；真要新增断点，连着这个表一起改。
const expectedBreakpoints = new Map([
  [520, 3], [560, 1], [700, 3], [720, 1], [760, 12], [761, 2],
  [800, 1], [820, 1], [900, 4], [901, 1], [980, 3], [1280, 1],
]);
const mediaHeads = styles.match(/@media[^{]*\{/g) || [];
const actualBreakpoints = new Map();
for (const head of mediaHeads) {
  for (const hit of head.matchAll(/(?:max|min)-width:\s*(\d+)px/g)) {
    const px = Number(hit[1]);
    actualBreakpoints.set(px, (actualBreakpoints.get(px) || 0) + 1);
  }
}
for (const [px, count] of expectedBreakpoints) {
  assert.equal(
    actualBreakpoints.get(px) || 0,
    count,
    `${px}px 断点应出现 ${count} 处，实际 ${actualBreakpoints.get(px) || 0} 处 —— 回退 em 时改错或漏改了`,
  );
}
for (const px of actualBreakpoints.keys()) {
  assert.ok(expectedBreakpoints.has(px), `出现了预期外的断点 ${px}px，请连同本表一起更新`);
}

// 3f. 设置页真的接了这个值（避免「模块写了但没人调」）
const prefsSrc = readSrc("src/uiPreferences.js");
assert.match(prefsSrc, /uiScale/, "uiPreferences 要认 uiScale 字段");
assert.match(prefsSrc, /applyUiScale/, "applyUiPreferences 里要真的调 applyUiScale");
const appearanceSrc = readSrc("src/views/settings/appearance.js");
assert.match(appearanceSrc, /UI_SCALE_LIMITS/, "设置页滑块的范围要读 UI_SCALE_LIMITS，不能手写数字");
assert.match(appearanceSrc, /界面缩放/, "设置页要有「界面缩放」这一行");

// 3g. 窄屏自适应不许「悄悄生效」：设置页要把实际生效值写出来，否则用户看到
//     「设了 100% 却比预期小」无从解释。提示语里的「本机宽度」必须是缩放前的
//     `window.innerWidth` —— 用 viewportWidth() 会读出生效后的基准宽度，提示语自己说反。
assert.match(appearanceSrc, /getAutoScaleFactor/, "设置页要提示窄屏自适应的实际生效值");
assert.match(appearanceSrc, /window\.innerWidth/, "提示语里的本机宽度要用缩放前的 innerWidth");
// ⚠️ 先剥注释再查：本页的注释里正写着「不是 viewportWidth()」这句解释，
//    不剥注释就会命中自己（这个坑在插件侧踩过一次，记在这里）。
const appearanceCode = appearanceSrc
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");
assert.ok(!/viewportWidth/.test(appearanceCode), "设置页别用 viewportWidth()（那是生效后的宽度，会把提示语说反）");
const mainSrc = readSrc("src/main.js");
assert.match(mainSrc, /initUiScale\(\)/, "启动时要 initUiScale()，否则 resize 监听挂不上");

console.log("PASS: UI scale normalization, zoom/vw-vh emission and zoom-safety guards");
