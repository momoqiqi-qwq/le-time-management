// 插件快捷键：Alt + 字母直达插件视图。
//
// 分层刻意拆开：
//   - 本模块只放**纯逻辑 + settings 存储**（仅依赖 store.js，Node 测试可直接 import 真跑）；
//   - 按键监听由 shell.js 调 attachPluginShortcutKeys() 挂上 —— 有序的插件视图、
//     `plug:` 前缀的 switchTo 都在它手里，这里不重复实现导航。
//
// 分配规则（computePluginShortcutMap）：
//   1. 显式指定优先：settings.pluginShortcuts[pluginId] = "A".."Z" 先全部登记进占用表
//      （显式之间同样先到先得，后到的重复字母退回自动分配）；
//   2. 没显式的用**插件 ID 首字母**（A–Z）自动分配，撞了就被先注册的拿走，自己空手。
//   「先到先得」的顺序 = 插件视图的注册顺序（= manifest order，稳定、不随用户拖动洗牌），
//   侧栏徽标、按键命中、设置页回显三处看到的是同一份结果。
import * as S from "./store.js";

export const PLUGIN_SHORTCUT_MODIFIER = "Alt";

/** 归一化成一个 A–Z 字母；非法输入一律回空串（= 恢复自动分配）。 */
export function normalizeShortcutLetter(value) {
  const s = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]$/.test(s) ? s : "";
}

/** 显式指定的字母表（settings.pluginShortcuts）。缺字段就地补一个空对象。 */
export function getPluginShortcutCustoms() {
  const settings = S.getState().settings;
  if (!settings.pluginShortcuts || typeof settings.pluginShortcuts !== "object" || Array.isArray(settings.pluginShortcuts)) {
    settings.pluginShortcuts = {};
  }
  return settings.pluginShortcuts;
}

/** 写入一个插件的显式字母；传空/非法 = 删除显式值（回到自动分配）。 */
export function setPluginShortcut(pluginId, value) {
  const customs = getPluginShortcutCustoms();
  const letter = normalizeShortcutLetter(value);
  if (letter) customs[pluginId] = letter;
  else delete customs[pluginId];
  S.persistSoon();
  return letter;
}

/**
 * 纯函数：按显示顺序给插件视图分配生效的 Alt 字母。
 * @param {Array<{pluginId: string, viewId: string}>} entries 显示顺序的插件视图
 * @param {Record<string, string>} customs 显式指定 { pluginId: "A".."Z" }
 * @returns {Map<string, {letter: string, viewId: string}>} letter 为空串 = 没有快捷键
 */
export function computePluginShortcutMap(entries, customs = {}) {
  const claimed = new Set();
  const map = new Map();
  // 第一遍只登记显式指定 —— 「用户明确选的字母」必须压过任何顺手的自动分配，
  // 与插件在列表里的先后无关。
  // 第一遍只登记显式指定 —— 「用户明确选的字母」必须压过任何顺手的自动分配，
  // 与插件在列表里的先后无关。
  for (const e of entries) {
    const letter = normalizeShortcutLetter(customs[e.pluginId]);
    if (letter && !claimed.has(letter)) {
      claimed.add(letter);
      map.set(e.pluginId, { letter, viewId: e.viewId });
    } else {
      map.set(e.pluginId, { letter: "", viewId: e.viewId });
    }
  }
  // 第二遍给剩下的按插件 ID 首字母自动分配，先到先得。
  for (const e of entries) {
    const info = map.get(e.pluginId);
    if (info.letter) continue;
    const m = /^[a-z]/i.exec(String(e.pluginId || ""));
    const letter = m ? m[0].toUpperCase() : "";
    if (letter && !claimed.has(letter)) {
      claimed.add(letter);
      info.letter = letter;
    }
  }
  return map;
}

/** 便捷取单个插件生效字母（entries 顺序由调用方给定，通常是显示顺序）。 */
export function effectivePluginShortcutLetter(pluginId, entries, customs = getPluginShortcutCustoms()) {
  return computePluginShortcutMap(entries, customs).get(pluginId)?.letter || "";
}

/**
 * 纯函数：把一次键盘事件翻译成目标视图 id；不触发时返回 null。
 * - 只认 Alt（Ctrl/Meta 组合放行给系统与浏览器）；
 * - 焦点在输入框 / 文本域 / 下拉 / 可编辑元素里不触发（macOS 上 Option+字母
 *   是打变音字符的常规输入方式，绝不能在打字时跳视图）；
 * - e.key 被修饰键改成变音字符时（macOS Option+P → π），退回 e.code 还原物理键。
 */
export function resolveShortcutActivation(event, entries, customs) {
  const e = event || {};
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  const target = e.target || {};
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return null;
  let letter = /^[a-z]$/i.test(String(e.key || "")) ? String(e.key).toUpperCase() : "";
  if (!letter) {
    const m = /^Key([A-Z])$/.exec(String(e.code || ""));
    if (m) letter = m[1];
  }
  if (!letter) return null;
  const map = computePluginShortcutMap(entries, customs || {});
  for (const info of map.values()) if (info.letter === letter) return info.viewId;
  return null;
}

/**
 * 挂全局 keydown（shell.js 在 renderShell 里调一次）。取数走回调，
 * 插件是启动后期异步注册的 —— 每次按键现查，先挂监听后加载插件也没问题。
 * 有全屏浮层（命令面板 / 设置 / 快速捕获 / 应用内对话框）时不在背后切视图。
 */
export function attachPluginShortcutKeys({ getEntries, getCustoms, navigate }) {
  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.querySelector(".cmd-palette, .settings-modal, .cap-modal, .quick-cap, .app-dialog")) return;
    const viewId = resolveShortcutActivation(event, getEntries(), getCustoms());
    if (!viewId) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(viewId);
  });
}
