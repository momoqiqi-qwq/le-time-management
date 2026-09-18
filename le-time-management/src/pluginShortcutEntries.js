// 插件快捷键的统一取数口径：把 pluginViews 变成 computePluginShortcutMap 要的 entries。
//
// 为什么单独一个模块：自动分配的字母取自「插件**显示名**的拼音首字母」，
// 而显示名带用户重命名覆盖（pluginAppearance），三处要用到快捷键的地方
// （侧栏徽标 / 设置页回显 / 命令面板副标题）必须取**同一份名字**，
// 否则同一个插件会算出不同字母 —— 各写一遍迟早漂移，所以收在这里。
//
// 名字取显示名而不是 manifest 原名：用户把「番茄专注」改名成「计时器」后，
// 侧栏写的是「计时器」、徽标却是 Alt+F（F 来自原名）会显得像 bug；
// 跟着显示名走，改名后字母跟着变，侧栏 / 设置页 / 实际按键三处仍然一致。
import { pluginViews } from "./pluginHost.js";
import { pluginDisplayName } from "./pluginAppearance.js";

/** @returns {Array<{pluginId: string, viewId: string, name: string}>} */
export function pluginShortcutEntries() {
  return pluginViews.map((pv) => ({
    pluginId: pv.pluginId,
    viewId: pv.id,
    name: pluginDisplayName(pv.pluginId, pv.title),
  }));
}
