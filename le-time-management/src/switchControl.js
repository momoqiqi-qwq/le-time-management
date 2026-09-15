/**
 * 滑块开关（拨动开关）· 应用层唯一事实源
 *
 * 为什么单独成模块：设置页、任务抽屉、插件卡片原先各自手搓 `<input type="checkbox">`，
 * 外观交给浏览器决定，与插件中心已经在用的滑块风格不一致。这里把「语义 + 外观钩子」收敛到一处。
 *
 * 语义仍然是**原生 checkbox**（不是 div 扮的开关）：`checked`、`change` 事件、键盘空格、
 * 屏幕阅读器、表单语义全部保留。调用方把
 *   `el("input", { type: "checkbox", checked: x ? true : null })`
 * 换成 `toggleSwitch({ checked: x, onChange: fn })` 即可，其余代码（读 `.checked`、
 * 外部挂 `.onchange` / `.oninput`）一行都不用改。
 *
 * 外观在 styles.css 的 `.switch`（与插件中心的 `<button class="switch">` 共用同一套定义）。
 */
import { el } from "./ui.js";

/** 样式钩子：styles.css 里 `.switch` / `:is(.switch.on, .switch:checked)` 都认这个类名。 */
export const SWITCH_CLASS = "switch";

/**
 * 建一个滑块开关。
 *
 * @param {object}    [opts]
 * @param {boolean}   [opts.checked]    初始是否打开
 * @param {Function}  [opts.onChange]   状态变化回调，收到新值（布尔）；不传则调用方自行读 `.checked`
 * @param {string}    [opts.ariaLabel]  无可视标签时补无障碍名（如任务抽屉里的提醒开关）
 * @returns {HTMLInputElement}
 */
export function toggleSwitch({ checked = false, onChange = null, ariaLabel = "" } = {}) {
  const input = el("input", {
    type: "checkbox",
    class: SWITCH_CLASS,
    role: "switch",
    checked: checked ? true : null,
    "aria-label": ariaLabel || null,
  });
  if (typeof onChange === "function") {
    input.addEventListener("change", () => onChange(input.checked));
  }
  return input;
}
