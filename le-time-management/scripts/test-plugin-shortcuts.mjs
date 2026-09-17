// 插件快捷键（Alt + 字母直达插件视图）：分配规则真跑 + 三处界面接线静态守卫。
// 分层契约见 src/pluginShortcuts.js 头注释 —— 纯逻辑不依赖 DOM，这里直接 import 真跑；
// shell / 命令面板 / 设置页的接线用源码正则钉住。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PLUGIN_SHORTCUT_MODIFIER,
  normalizeShortcutLetter,
  getPluginShortcutCustoms,
  setPluginShortcut,
  computePluginShortcutMap,
  resolveShortcutActivation,
} from '../src/pluginShortcuts.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

/* ── 1. 字母归一化 ── */
assert.equal(normalizeShortcutLetter('p'), 'P', '小写要归一成大写');
assert.equal(normalizeShortcutLetter(' P '), 'P', '首尾空白要去掉');
assert.equal(normalizeShortcutLetter('AB'), '', '多字符不是合法快捷键（输入框 maxlength=1 之外还要兜底）');
assert.equal(normalizeShortcutLetter('1'), '', '数字不是合法快捷键');
assert.equal(normalizeShortcutLetter(''), '', '空串 = 清除（回到自动分配）');
assert.equal(normalizeShortcutLetter(null), '', 'null 不能炸');
assert.equal(normalizeShortcutLetter('π'), '', '变音字符不能当快捷键');

/* ── 2. 分配规则真跑 ── */
// 2a. 自动分配 = 插件 ID 首字母
const only = computePluginShortcutMap([{ pluginId: 'pomodoro', viewId: 'pomodoro' }], {});
assert.equal(only.get('pomodoro').letter, 'P');
assert.equal(only.get('pomodoro').viewId, 'pomodoro', 'viewId 必须原样带回（导航要用它拼 plug: 前缀）');

// 2b. viewId 与 pluginId 可以不同（registerView 的 id 不必等于插件 id）
const renamed = computePluginShortcutMap([{ pluginId: 'p1', viewId: 'p1-view' }], {});
assert.equal(renamed.get('p1').viewId, 'p1-view');

// 2c. 显式指定优先 —— 而且与插件在列表里的先后无关（先登记全部 customs，再分自动）
const entries2 = [{ pluginId: 'web-collector', viewId: 'a' }, { pluginId: 'pomodoro', viewId: 'b' }];
const customBeatsAuto = computePluginShortcutMap(entries2, { pomodoro: 'W' });
assert.equal(customBeatsAuto.get('pomodoro').letter, 'W', '显式指定必须生效');
assert.equal(customBeatsAuto.get('web-collector').letter, '', '自动分配的 W 被显式指定占了，先到先得落空');
const customBeatsAutoRev = computePluginShortcutMap([...entries2].reverse(), { pomodoro: 'W' });
assert.equal(customBeatsAutoRev.get('pomodoro').letter, 'W', '调换顺序后显式指定依然生效（customs 先于自动分配登记）');
assert.equal(customBeatsAutoRev.get('web-collector').letter, '');

// 2d. 自动分配撞字母：先注册的拿走，后注册的空手
const clash = computePluginShortcutMap(
  [{ pluginId: 'shiguang-schedule', viewId: 'a' }, { pluginId: 'school-notice', viewId: 'b' }],
  {},
);
assert.equal(clash.get('shiguang-schedule').letter, 'S');
assert.equal(clash.get('school-notice').letter, '', '第二个 S 撞车，必须空手而不是抢过来');

// 2e. 显式之间也先到先得；输家退回自动分配
const dupCustom = computePluginShortcutMap(
  [{ pluginId: 'aaa-tool', viewId: 'a' }, { pluginId: 'bbb-tool', viewId: 'b' }],
  { 'aaa-tool': 'X', 'bbb-tool': 'X' },
);
assert.equal(dupCustom.get('aaa-tool').letter, 'X', '先设置的显式字母生效');
assert.equal(dupCustom.get('bbb-tool').letter, 'B', '重复的显式字母退回自动分配，而不是空手');

// 2f. 非 A–Z 开头的插件 ID 没有自动分配
const weird = computePluginShortcutMap([{ pluginId: '123-tool', viewId: 'a' }], {});
assert.equal(weird.get('123-tool').letter, '');

/* ── 3. 按键事件 → 目标视图（纯函数，喂假事件） ── */
const entries = [{ pluginId: 'pomodoro', viewId: 'pomodoro' }, { pluginId: 'weekly-report', viewId: 'weekly' }];
const customs = {};
const hit = (event) => resolveShortcutActivation(event, entries, customs);

assert.equal(hit({ altKey: true, key: 'p', target: { tagName: 'DIV' } }), 'pomodoro', 'Alt+P 应命中番茄专注');
assert.equal(hit({ altKey: true, key: 'P', target: { tagName: 'DIV' } }), 'pomodoro', '大写同样命中');
assert.equal(hit({ altKey: true, key: 'w', target: { tagName: 'DIV' } }), 'weekly', 'Alt+W 命中周度报告');
assert.equal(hit({ altKey: true, key: 'z', target: { tagName: 'DIV' } }), null, '没分配的字母不触发');
assert.equal(hit({ altKey: true, key: 'p', target: { tagName: 'INPUT' } }), null, '焦点在输入框不许跳视图');
assert.equal(hit({ altKey: true, key: 'p', target: { tagName: 'TEXTAREA' } }), null, '焦点在文本域不许跳视图');
assert.equal(hit({ altKey: true, key: 'p', target: { tagName: 'SELECT' } }), null, '焦点在下拉不许跳视图');
assert.equal(hit({ altKey: true, key: 'p', target: { isContentEditable: true } }), null, '可编辑元素不许跳视图');
assert.equal(hit({ altKey: true, ctrlKey: true, key: 'p', target: { tagName: 'DIV' } }), null, 'Ctrl 组合放行给系统');
assert.equal(hit({ altKey: true, metaKey: true, key: 'p', target: { tagName: 'DIV' } }), null, 'Meta 组合放行给系统');
assert.equal(hit({ key: 'p', target: { tagName: 'DIV' } }), null, '没按 Alt 不触发');
assert.equal(
  hit({ altKey: true, key: 'π', code: 'KeyP', target: { tagName: 'DIV' } }),
  'pomodoro',
  'macOS 上 Option 会把 e.key 变成变音字符，必须退回 e.code 还原物理键',
);

/* ── 4. settings 存储访问器（真跑，共享 store 模块状态） ── */
// store 是模块级单例：Node 侧先喂 localStorage 垫片并初始化（与 test-interactions.mjs 同款）
import * as S from '../src/store.js';
const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
await S.initStore({ tasks: [], blocks: [], settings: {}, plugins: {} });

const letter = setPluginShortcut('test-plugin-x', ' q ');
assert.equal(letter, 'Q', 'setPluginShortcut 返回归一化结果');
assert.equal(getPluginShortcutCustoms()['test-plugin-x'], 'Q');
setPluginShortcut('test-plugin-x', '');
assert.ok(!('test-plugin-x' in getPluginShortcutCustoms()), '传空 = 删除显式值（回到自动分配）');
setPluginShortcut('test-plugin-x', '!!!');
assert.ok(!('test-plugin-x' in getPluginShortcutCustoms()), '非法输入同样视为清除');

/* ── 5. 三处界面接线（静态守卫） ── */
const shell = read('../src/shell.js');
assert.match(shell, /import \{[^}]*attachPluginShortcutKeys[^}]*\} from "\.\/pluginShortcuts\.js"/, 'shell 必须引入快捷键挂载器');
assert.match(shell, /attachPluginShortcutKeys\(\{/, 'shell 必须真正挂上 keydown 监听');
assert.match(shell, /navigate: \(viewId\) => switchTo\(`plug:\$\{viewId\}`\)/, '命中后必须以 plug: 前缀交给 switchTo');
assert.match(shell, /const sc = isPlug && def\.pluginView\?\.pluginId \? effectiveShortcutLetter\(def\.pluginView\.pluginId\) : "";/, 'navBtn 必须先算出生效字母');
assert.match(shell, /sc \? el\("kbd", \{ class: "nav-kbd"/, '侧栏插件入口必须带快捷键徽标（条件成立才渲染，而不是把字样留在死代码里）');
assert.match(shell, /menuButton\(`快捷键 · /, '插件右键菜单必须提供「快捷键」设置项');
assert.match(shell, /setPluginShortcut\(pluginId, value\)/, '右键菜单必须真正落盘显式字母');

const palette = read('../src/commandPalette.js');
assert.match(palette, /打开插件 · Alt\+\$\{sc\}/, '命令面板的插件条目必须亮出 Alt 快捷键');

const settings = read('../src/views/settings.js');
assert.match(settings, /paintPluginShortcuts/, '设置页必须有插件快捷键编辑区');
assert.match(settings, /computePluginShortcutMap\(entries, getPluginShortcutCustoms\(\)\)/, '设置页必须用同一套分配规则回显');
assert.match(settings, /class: "shortcut-kbd"/, '设置页每行必须展示生效字母');
// 实景探针抓出的回归：paintPluginShortcuts 用了 getRegistry() 却没导入 →
// ReferenceError 把整个设置渲染打断，.set-wrap 整页空白。这里锁死导入行。
assert.match(
  settings,
  /import \{[^}]*getRegistry[^}]*\} from "\.\.\/pluginHost\.js"/,
  'settings 用到 getRegistry 必须真的从 pluginHost 导入（漏导入会打断整个设置渲染）',
);

const styles = read('../src/styles.css');
assert.match(styles, /\.nav \.nav-kbd \{ margin-left: 4px/, '侧栏徽标必须有基线样式');
assert.match(styles, /\.nav button:hover \.nav-kbd, \.nav button\.on \.nav-kbd, \.nav button:focus-visible \.nav-kbd \{ opacity: 1; \}/, '徽标必须在悬停 / 选中 / 聚焦时现形');
assert.match(styles, /\.nav \.nav-kbd \{ color: var\(--ink-3\); background: var\(--paper\); border: 1px solid var\(--line\); \}/, '≥901px 浅色侧栏必须覆盖徽标配色');
assert.match(styles, /\.shortcut-hint\{/, '设置页提示行必须有样式');
assert.match(styles, /\.plugin-shortcut-block\{/, '设置页插件快捷键块必须有样式');

/* ── 6. 番茄专注的常驻试听按钮也在本批次（版本断言在 test-pomodoro.mjs）── */
const pomodoro = read('../public/plugins/pomodoro/main.js');
assert.match(pomodoro, /head\.append\(toggle, previewBtn\)/, '番茄专注：试听按钮必须挂在提醒面板头部');

console.log('PASS: 插件快捷键（显式优先 / 自动先到先得 / 输入安全）与侧栏徽标、右键菜单、命令面板、设置页接线');
