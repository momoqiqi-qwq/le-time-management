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
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_UI_SCALE,
  UI_SCALE_LIMITS,
  UI_SCALE_PRESETS,
  __resetUiScaleForTest,
  applyUiScale,
  getUiScale,
  getUiScaleFactor,
  initUiScale,
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
    .concat("\nglobalThis.__uiScale = { __resetUiScaleForTest, applyUiScale, initUiScale, getUiScale, getUiScaleFactor, viewportWidth, viewportHeight, normalizeUiScale, UI_SCALE_LIMITS };\n");
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

// 3c. 三处契约本身在位：固定浮层确实消费了新变量。
assert.match(styles, /#toasts\s*\{[^}]*bottom:\s*calc\(var\(--ui-vh/, "#toasts 的 bottom 要走 --ui-vh");
assert.match(styles, /\.settings-modal\s*\{[^}]*inset:\s*calc\(var\(--ui-vh/, ".settings-modal 的 inset 要走 --ui-vh/--ui-vw");

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
const mainSrc = readSrc("src/main.js");
assert.match(mainSrc, /initUiScale\(\)/, "启动时要 initUiScale()，否则 resize 监听挂不上");

console.log("PASS: UI scale normalization, zoom/vw-vh emission and zoom-safety guards");
