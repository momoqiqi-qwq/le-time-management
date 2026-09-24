// 通知堆叠：把同一个容器里的多条横幅叠成一张，鼠标移上去背后那张向上散开。
//
// 分工刻意切成两半：
// - **CSS 负责一切视觉与动画**（见 styles.css 的 `.notify-stack`）。折叠态是
//   `margin-bottom: calc(露出边 - 自身高 - 间距)`，展开态是 `margin-bottom: 0`；
//   容器贴底定位，所以「后面那张」只会向上退开，前面那张一动不动。
// - **本文件只喂 CSS 算不出来的两个量**：每张卡的真实高度（`--item-h`）和
//   「现在该不该折叠」（`is-stacked`）。
//
// 三个不折叠的情形：
// 1. 只有一张 —— 没有可藏的背后那张。
// 2. 容器里有**常驻卡**（`[data-pin]`，如任务提醒长鸣、下载进度）—— 它带着要用户
//    按的按钮，被盖住就等于按钮消失。只要有一张在，整列摊平。
//    打标记的地方只有两处：`ui.js` 的 `toast()`（`ms: 0` 隐含钉住）与更新进度卡。
// 3. 用户在「设置 › 界面与交互」里关了「通知叠成一张」—— 这条本文件不管，
//    CSS 用 `--ns-fold` 系数把折叠量乘成 0（见 styles.css 的 `[data-notify-stack="off"]`），
//    所以拨开关当场就变，不必等卡片重建。
//
// 触屏设备不参与：折叠靠 hover 才能展开，手机上「叠起来」等于「看不到」。
// 那条判据写在 CSS 的 `@media (hover: hover) and (pointer: fine)` 里，
// 所以本文件在手机上照样打标记，只是没有样式认领 —— 不必在 JS 里重复判断设备。

/**
 * 重新量一遍容器里每张卡的高度，并决定折叠还是摊平。
 * 幂等，可以随便多调；卡片增删、内容换行都靠它刷新。
 */
export function refreshStack(container) {
  if (!container || !container.children) return;
  const cards = [...container.children].filter((node) => node?.nodeType === 1);
  for (const card of cards) {
    // offsetHeight 含 border 与 padding，正是折叠要扣掉的量。取整：亚像素会让
    // 露出边在 10.5/11.5 之间跳，hover 时看着像抖了一下。
    const h = card.offsetHeight;
    if (Number.isFinite(h) && h > 0) card.style?.setProperty?.("--item-h", `${Math.round(h)}px`);
  }
  const pinned = cards.some((card) => card.hasAttribute?.("data-pin"));
  container.classList.toggle("is-stacked", cards.length >= 2 && !pinned);
}

const observed = new WeakSet();

/**
 * 挂一个观察器，让容器此后任何一次尺寸变化都触发重算。
 *
 * 只挂容器不挂卡片：这类容器是贴底的 shrink-to-fit 盒，里面任何一张卡变高
 * （进度文案折行、字号缩放、窗口改变宽度）都会连带改变容器尺寸 —— 一个观察器
 * 就覆盖了「新增卡」「内容变高」「窗口变窄」三种情况，不必逐张挂再处理增订。
 */
export function observeStack(container) {
  if (!container || typeof ResizeObserver !== "function") return;
  if (observed.has(container)) return;
  observed.add(container);
  new ResizeObserver(() => refreshStack(container)).observe(container);
}
