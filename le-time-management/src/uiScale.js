// 界面整体缩放（设置 → 界面与交互 → 界面缩放）。
//
// 与既有的「文字大小」(`--ui-text-scale`) 的分工：
// - **文字大小**只动 8 条手写的 `font-size`（body / 顶栏 / 按钮 / 设置行…），
//   控件尺寸、间距、图标、卡片内边距全都不动 —— 它解决的是「字看不清」。
// - **界面缩放**（本模块）把所有东西一起等比缩放 —— 它解决的是「整个界面太小 / 太大」，
//   手机上尤其明显：小屏设备像素比高，14px 的字和 20px 的图标物理上就是小。
//
// ## 为什么用 `zoom` 而不是 `transform: scale()`
//
// `transform` 只改变绘制，**不改变布局**：元素仍然按原尺寸参与排版，放大后会互相重叠、
// 缩小时四周留出空白（不重排），必须额外补偿宽高，等于自己重写一遍布局引擎。
// `zoom` 是**布局级**缩放 —— 元素按缩放后的尺寸参与排版，所以除媒体查询之外的一切都自然成立
// （媒体查询恰好是唯一不认 zoom 的地方，见下面那段）。
//
// ## `zoom` 的两个真实坑（都是在无头 Chrome 里实测出来的，改这个文件前务必读完）
//
// 1. **`position:fixed` 元素的包含块会变成 zoom 元素。** 「视口固定」是相对 zoom 元素说的，
//    于是 `bottom:22px` 不再是「距屏幕底部 22px」，而是「距 zoom 容器底部 22px」——
//    缩放 120% 时整个视口往外溢 20%，`bottom` 锚点的元素直接掉到屏幕外。
//    解法：把「视口尺寸」显式注入成 CSS 变量 `--ui-vw` / `--ui-vh`（**已除以缩放系数**，
//    即 zoom 前的布局长度），fixed 浮层一律用 `var(--ui-vw, 100vw)` / `var(--ui-vh, 100dvh)`。
//    这是全部改动里最关键的一条。
//
// 2. **`100vw` / `100vh` 不会自动除以缩放系数**：zoom 下 `100vw` 是布局长度，乘上缩放系数后
//    会比屏幕宽/高。所以同样要走 `--ui-vw` / `--ui-vh`。
//
// ## ⚠️ 一条被实测推翻的旧结论（别再照抄）
//
// 本模块一度采用「把视口断点从 px 改成 em，em 媒体查询就会跟着 zoom 走」的说法。
// **这是错的。** 无头 Chrome 在 1280px 视口 / zoom=1.5（html 计算字号 24px）下实测：
//   matchMedia("(max-width: 40em)")    → false
//   matchMedia("(max-width: 56.25em)") → false   ← 若 em=24px 应是 1350px>1264，该为 true
//   matchMedia("(max-width: 65em)")    → true    ← 若 em=24px 应是 1560px>1264，该为 false
// 只与「em 恒定 = 16px」自洽 ⇒ **em 媒体查询按浏览器初始字号求值，zoom 与 html font-size
// 都改不动它。** 所以 px 断点与 em 断点在 zoom 下**行为完全一样**，改 em 没有任何收益，
// 仓库里那批改动已全部回退（styles.css 顶部留了同一份记录）。
//
// ⇒ **本功能的边界**：缩放只改「整页等比大小」，**不改变布局断点**。
//   150% 时 1200px 的桌面窗口内容变大到等效 800px，但窄屏媒体查询仍按 1200px 判定，
//   布局停在桌面形态。这是刻意的取舍：让断点跟随缩放需要改用 `@container`
//   （实测它按「缩放前的使用宽度」求值、150% 能正确命中），而 `@container` 要求被匹配元素
//   是容器的后代，本应用大量断点目标是挂在 `#app` 之外的 fixed 浮层 —— 得先改 DOM 挂载结构，
//   属于独立改造，不要在这一版里顺手做。
//
// 实现取向：与 `windowSize.js`、`background.js` 保持一致 —— 只碰 DOM，不落任何额外存储，
// 偏好值存在 `settings.ui.uiScale`。Android / 浏览器环境完全可用（不依赖 Tauri）。
//
// ## v0.49.0 追加：窄屏自适应（窄屏自动等比缩小）
//
// 上面的缩放只由用户设定驱动。但手机的 CSS 布局宽度 = 物理宽 ÷ 像素比：同一块 1080p 屏
// 在 600dpi 下只有 288 CSS px（480dpi 是 360），外壳与字号会被「相对放大」到占掉 26% 屏高。
// 所以 `applyUiScale()` 现在还要乘一个 `narrowAutoFactor(innerWidth)`（低于 360px 才生效，
// 最低 0.7）。契约、边界与实测数据见下方「窄屏自适应」一节。

/** 缩放档位的合法区间与步进（百分比）。下限 80% 保证仍在可点范围，上限 150% 保证不把布局撑爆。 */
export const UI_SCALE_LIMITS = Object.freeze({ min: 80, max: 150, step: 5 });

/** 默认值：与旧版完全一致（不缩放）。 */
export const DEFAULT_UI_SCALE = 100;

/** 一键档位：给不想拖滑块的用户（尤其是手机端），顺带充当「一眼看出能调多大」的标尺。 */
export const UI_SCALE_PRESETS = Object.freeze([
  [80, "80%"],
  [100, "标准"],
  [125, "125%"],
  [150, "150%"],
]);

/* ── 窄屏自适应（v0.49.0）──
 *
 * **为什么需要它**：手机的 CSS 布局宽度 = 物理宽 ÷ 设备像素比，**与屏幕物理大小无关**。
 * 1080×2376@480dpi = 360×792（标准），但同一块屏在 600dpi 下只有 288×633 ——
 * 后者会把「按 CSS px 写死」的外壳尺寸（顶栏 54、底栏 46、返回键 40）放大到占掉
 * 26% 的屏高（标准机约 18%），字号整体显大，窄屏下还会挤压出版式故障
 * （2026-09-17 用户截图实测：课程表「‹」返回键被切、教务导入「选择学校」压成竖排四字）。
 *
 * **做法**：布局宽度不足 `NARROW_REFERENCE_WIDTH` 时，把缩放系数再乘 `宽 / 基准`，
 * 使**内容布局宽度回到基准值**（288 × 1/0.8 = 360）。外壳与字号一起等比变小，
 * 而每行可用宽度反而变大 —— 等价于「把窄屏设备当成标准宽度手机来渲染」。
 *
 * 两条边界：
 * - **只按宽度**：宽度才是版式约束（换行、挤压都由它决定）；高度会随缩放自动回来
 *   （633 → 792），不必单独算。
 * - **标准机零影响**：360 / 390 / 412 都 ≥ 基准 ⇒ 系数恰为 1；桌面窗口下限是 900px
 *   （`windowSize.js` 的 `CUSTOM_SIZE_LIMITS.minWidth`），也永不触发。
 *
 * **安全区（`--sat/--sab`）会被一起缩放 —— 这是量过之后的有意取舍，不是漏算。**
 * 原生注入的是 CSS px 常量，`zoom` 会把它们一并乘掉（顶栏 40.3 → 32.6，实机 151 → 123 设备px）。
 * 不补偿的理由：Android 状态栏图标在栏内**垂直居中**，最坏情况（系数压到下限 0.7）也只侵入
 * 栏体下缘的 30%，够不到图标 —— 2026-09-17 在 288×633 实机复现（--sat 40.3 / 图标止于 82 设备px，
 * 顶栏内容起点 123 > 82，无重叠）。要补偿得让 20 多处 `var(--sat, env(...))` 全部除以
 * `--ui-scale`，或改动「`:root` 不许定义 `--sat`」那条被回归测试守着的铁律（AGENTS.md 铁律四），
 * 收益与风险不成比例。**若将来把 `NARROW_MIN_FACTOR` 降到 0.7 以下，或顶栏改成贴图标布局，必须重算。**
 */

/** 窄屏自适应的基准布局宽度（CSS px）：低于它才等比缩小。360 是 Android 的标准逻辑宽度。 */
export const NARROW_REFERENCE_WIDTH = 360;

/** 自动缩小的下限系数：再窄也不缩过头，否则文字小到读不了。 */
export const NARROW_MIN_FACTOR = 0.7;

/**
 * 窄屏自适应系数（1 = 不缩放）。纯函数，便于单测。
 *
 * 拿不到宽度时一律返回 1 —— 宁可不缩，也不要因为读不到视口把界面缩坏。
 * @param {number} viewportWidthPx 布局视口宽度（CSS px，即 `window.innerWidth`）
 * @returns {number} `NARROW_MIN_FACTOR` ~ 1
 */
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function narrowAutoFactor(viewportWidthPx) {
  const w = Number(viewportWidthPx);
  if (!Number.isFinite(w) || w <= 0) return 1;
  return clamp(w / NARROW_REFERENCE_WIDTH, NARROW_MIN_FACTOR, 1);
}

/**
 * 把任意输入夹到合法区间并对齐步进。非法值（字符串、NaN、null）退回 100。
 *
 * 注意三种边界：
 * - `Infinity` / `-Infinity` 落到上/下限（语义就是「拉到最右」），不是退回默认；
 * - 空串与 0 当「没设置过」退回默认（`Number("") === 0`）；
 * - NaN 与其它脏数据退回默认。
 * 另外必须先夹取后对齐步进，否则 `Infinity / 5 * 5 === NaN` 会被当脏数据。
 * @param {unknown} raw
 * @returns {number}
 */
export function normalizeUiScale(raw) {
  // 只认数字与数字字符串。布尔/对象/数组走 `Number()` 会得到 0/1/NaN 这类假值，
  // 例如 `true → 1` 会被夹成 80% —— 那是「接受了一个脏输入」而不是「兜底」。
  // 偏好值来自 settings.json，污染它的途径很多，这里守严一点。
  if (typeof raw !== "number" && typeof raw !== "string") return DEFAULT_UI_SCALE;
  const n = Math.round(Number(raw));
  // `Number("")` 是 0，所以空串与 0 都当「没设置过」处理；NaN 同理。
  if (Number.isNaN(n) || n === 0) return DEFAULT_UI_SCALE;
  const { min, max, step } = UI_SCALE_LIMITS;
  // ±Infinity 单独接住：它 `Number.isFinite` 为假，但语义上就是「拉到最右/最左」，
  // 该落到上限/下限，而不是被当成脏数据退回 100。
  if (!Number.isFinite(n)) return n > 0 ? max : min;
  // 先夹取再对齐步进：反过来的话 `Infinity / 5 * 5` 会先算出 NaN，
  // 于是「无穷大」被当成非法值退回 100 —— 用户拖到最右却回到标准，看着像滑块坏了。
  const clamped = clamp(n, min, max);
  return clamp(Math.round(clamped / step) * step, min, max);
}

/** 当前缩放百分比（100 = 不缩放）。 */
export function getUiScale() {
  return currentScale;
}

/**
 * 当前**生效**缩放系数（1 = 不缩放）。CSS 变量与 fixed 浮层补偿都用这个。
 *
 * ⚠️ 与 `getUiScale()` 不是一回事：后者是用户在设置里选的百分比，这里是它乘上
 * 窄屏自适应系数之后的真实值（窄屏上会小于用户设定，见本文件「窄屏自适应」一节）。
 */
export function getUiScaleFactor() {
  return currentFactor;
}

/**
 * 窄屏自适应系数（1 = 未触发）。设置页用它提示「已自动缩至 N%」，
 * 免得用户看见 100% 却发现界面比预期小。
 */
export function getAutoScaleFactor() {
  return currentAutoFactor;
}

/**
 * 按缩放系数换算后的「视口 CSS 长度」。fixed 浮层在 JS 里算位置时用它，
 * 与 CSS 的 `var(--ui-vw)` / `var(--ui-vh)` 是同一个值（同一个来源，不会对不上）。
 */
export function viewportWidth() {
  if (typeof window === "undefined") return 0;
  return window.innerWidth / getUiScaleFactor();
}

export function viewportHeight() {
  if (typeof window === "undefined") return 0;
  return window.innerHeight / getUiScaleFactor();
}

let currentScale = DEFAULT_UI_SCALE;
/** 生效系数 = 用户设定 × 窄屏自适应。所有「视口补偿」都读它，别再自己乘。 */
let currentFactor = DEFAULT_UI_SCALE / 100;
/** 上一次算出的窄屏自适应系数，仅用于设置页提示。 */
let currentAutoFactor = 1;
let resizeBound = false;

/**
 * 把缩放应用到界面。幂等，可重复调用。
 *
 * 写四个东西：
 * - `documentElement.style.zoom` —— 布局级缩放本体（= 用户设定 × 窄屏自适应）；
 * - `--ui-scale` —— 生效系数，供 CSS 侧需要「反算原始尺寸」的场合使用；
 * - `--ui-auto-scale` —— 其中的窄屏自适应部分（1 = 未触发），供诊断与提示；
 * - `--ui-vw` / `--ui-vh` —— 视口尺寸 ÷ 生效系数，fixed 浮层与 100vw/100vh 的替代品。
 *
 * 🔴 `--ui-vw/--ui-vh` 必须除以**生效系数**（含窄屏自适应那部分），否则窄屏上
 * 内容布局宽 360 而 `--ui-vw` 只写 288，`width: var(--ui-vw)` 的浮层会缺一块。
 *
 * @param {number} scale 用户设定的百分比（80~150），不含窄屏自适应
 * @returns {number} 夹取后的用户设定百分比（不是生效系数 —— 设置页要显示这个）
 */
export function applyUiScale(scale = currentScale) {
  const value = normalizeUiScale(scale);
  currentScale = value;
  const auto = narrowAutoFactor(typeof window !== "undefined" ? window.innerWidth : 0);
  const factor = (value / 100) * auto;
  currentFactor = factor;
  currentAutoFactor = auto;
  if (typeof document === "undefined") return value;
  const root = document.documentElement;
  root.style.zoom = String(factor);
  root.style.setProperty("--ui-scale", String(factor));
  root.style.setProperty("--ui-auto-scale", String(auto));
  // 视口补偿：这两个值必须是「缩放前」的长度，所以除以 factor。
  // zoom 是布局级的，fixed 定位的包含块变成了 root，不补偿就会溢出屏幕。
  if (typeof window !== "undefined") {
    root.style.setProperty("--ui-vw", `${window.innerWidth / factor}px`);
    root.style.setProperty("--ui-vh", `${window.innerHeight / factor}px`);
  }
  return value;
}

/**
 * 窗口尺寸变化时刷新 `--ui-vw` / `--ui-vh`。
 *
 * 必须挂在 window 的 resize 上：`innerWidth / factor` 没有纯 CSS 写法
 * （`calc(100vw / 1.5)` 里的 `100vw` 已经是缩放后的布局长度，越算越错），
 * 只能由 JS 重新写一遍。
 */
export function initUiScale() {
  applyUiScale(currentScale);
  if (typeof window === "undefined" || resizeBound) return currentScale;
  resizeBound = true;
  window.addEventListener("resize", () => applyUiScale(currentScale));
  // 手机横竖屏切换在部分 WebView 上只发 orientationchange 不发 resize，补一道。
  window.addEventListener("orientationchange", () => applyUiScale(currentScale));
  return currentScale;
}

/** 仅供测试与诊断：重置模块内状态。 */
export function __resetUiScaleForTest() {
  currentScale = DEFAULT_UI_SCALE;
  currentFactor = DEFAULT_UI_SCALE / 100;
  currentAutoFactor = 1;
  resizeBound = false;
}
