// 侧栏宽度（v0.58.0）：.rail 与 .main 之间的可拖拽分隔条（shell.js 挂 `.rail-resizer`）。
// 拖动实时改宽、松手落盘 `settings.railWidth`，双击恢复默认，键盘 ←/→ ±RAIL_WIDTH_STEP。
//
// 契约：
// - 偏好存 `settings.railWidth`（**布局 px**，整数）。null / 缺省 = 未自定义，宽度跟随
//   CSS 默认（`:root` 的 `--rail-w`，随密度档位变化：舒适 224 / 紧凑 204）。新增可选
//   字段**不写迁移**（同 uiScale / autoBackup 的口径，normalizeState 原样放行）。
// - DOM 应用出口只有 `applyRailWidth()`：往 `.app` 元素写/删**内联** `--rail-w`。
//   写在 `.app` 上而不是 `:root`，作用域最小（`--rail-w` 只有 `.rail` 一个消费者）；
//   内联值天然压过任何样式表档位 —— 用户显式拖过的宽度优先于密度默认，是预期行为。
// - **指针坐标换算归调用方**：zoom 下 `clientX` 与 `getBoundingClientRect()` 同为
//   屏幕**视觉 px**，位移与起点宽度都要除以生效缩放系数（`getUiScaleFactor()`）才是
//   布局 px（与 uiScale.js 的 `viewportWidth()` 同一口径）。本模块只做夹取与落值。
// - `normalizeRailWidth`（落盘值闸门）与 `clampRailWidth`（拖动实时值）分开：
//   前者对脏数据一律返回 null（= 恢复 CSS 默认，宁可不自定义也不要用半截值）；
//   后者只服务拖动中的有限数字，NaN/Infinity 同样拒收。

/** 合法区间（布局 px）。168 是品牌行 + 导航标签省略号规则下的最小可读宽度。 */
export const RAIL_WIDTH_LIMITS = Object.freeze({ min: 168, max: 360 });

/** 键盘步进（布局 px）。 */
export const RAIL_WIDTH_STEP = 16;

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));

/**
 * 落盘值闸门：settings.railWidth → 布局 px 整数；任何脏输入 → null（未自定义）。
 * 只认数字与数字字符串；0、空串（`Number("") === 0`）、负数、NaN/Infinity 一律 null。
 * 越界值夹取到区间（语义是「拉过头了」，仍是有效自定义，不是脏数据）。
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeRailWidth(raw) {
  if (typeof raw !== "number" && typeof raw !== "string") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampInt(n, RAIL_WIDTH_LIMITS.min, RAIL_WIDTH_LIMITS.max);
}

/**
 * 拖动/键盘的实时宽度：有限数字夹取到区间并取整；非有限值与非 number 类型拒收（null）。
 * 与 normalizeRailWidth 的差别：0 / 负数是拖动过程中的合法中间态（往左拖过头），
 * 直接夹到下限即可，不当脏数据。
 * 🔴 只认 `typeof raw === "number"`：`Number(null) === 0`、`Number("") === 0`、
 * `Number(false) === 0`，放它们进来会被当成「0」夹到下限 —— 而调用方传 null 的语义是
 * 「没有基准/没测到宽度」（键盘步进找不到基准必须不动，而不是跳到 168）。
 * @param {unknown} raw
 * @returns {number|null}
 */
export function clampRailWidth(raw) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return clampInt(raw, RAIL_WIDTH_LIMITS.min, RAIL_WIDTH_LIMITS.max);
}

/**
 * 键盘步进：direction = -1 变窄 / +1 变宽。落盘值非法时用 fallbackRaw
 * （调用方现测的当前布局宽度）作基准 —— 未自定义过也能从 CSS 默认宽度起步。
 * @param {unknown} currentRaw settings.railWidth 原值
 * @param {unknown} direction -1 | 1
 * @param {unknown} fallbackRaw 当前实际宽度（布局 px，可含小数）
 * @returns {number|null}
 */
export function steppedRailWidth(currentRaw, direction, fallbackRaw) {
  const dir = Number(direction);
  if (dir !== 1 && dir !== -1) return null;
  const base = normalizeRailWidth(currentRaw) ?? clampRailWidth(fallbackRaw);
  if (base === null) return null;
  return clampInt(base + dir * RAIL_WIDTH_STEP, RAIL_WIDTH_LIMITS.min, RAIL_WIDTH_LIMITS.max);
}

/**
 * DOM 应用出口（唯一）：往 target（.app 元素）写/删内联 `--rail-w`。
 * px 为 null/undefined = 恢复默认（删内联属性，让样式表档位生效）。
 * 环境拿不到 style（纯函数单测 / 非浏览器）时安全返回 null。
 * @param {number|null|undefined} px
 * @param {Element|{style?: {setProperty?: Function, removeProperty?: Function}}|undefined} target
 * @returns {number|null} 实际应用的值（删除时 null）
 */
export function applyRailWidth(px, target) {
  if (typeof target?.style?.setProperty !== "function"
    || typeof target?.style?.removeProperty !== "function") return null;
  if (px === null || px === undefined) {
    target.style.removeProperty("--rail-w");
    return null;
  }
  const v = clampRailWidth(px);
  if (v === null) return null;
  target.style.setProperty("--rail-w", `${v}px`);
  return v;
}
