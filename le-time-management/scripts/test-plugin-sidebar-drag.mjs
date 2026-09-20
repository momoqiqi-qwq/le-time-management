import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const shell = fs.readFileSync(path.join(here, "..", "src", "shell.js"), "utf8");
const css = fs.readFileSync(path.join(here, "..", "src", "styles.css"), "utf8");
const block = shell.slice(shell.indexOf("function attachPluginListDrag"), shell.indexOf("/* ── v0.53.0：侧栏操作条拖拽重排"));

assert.ok(block.length > 1000, "侧栏插件必须有独立的指针拖拽控制器");
assert.match(block, /requestAnimationFrame\(\(\) => frame\(st\)\)/, "拖拽期间必须逐帧重算落点");
assert.match(block, /const slot = computeSlot\(st, st\.y\)/, "每帧必须按最新指针位置计算槽位");
assert.match(block, /list\.insertBefore\(st\.card, peers\[slot\] \?\? null\)/, "拖动项必须留在普通流中形成实时空槽");
assert.match(block, /node\.animate\(\[\{ transform: `translateY\(\$\{dy\}px\)` \}/, "其余插件项必须各自用 FLIP 追赶位置");
assert.match(block, /classList\.add\("plugin-nav-ghost"\)/, "拖动项必须有脱离列表流的浮起副本");
assert.match(block, /if \(!reducedMotion\(\)\)/, "减少动效时必须跳过幽灵项或位移动画");
assert.match(block, /Math\.hypot\(dx, dy\) >= 6/, "鼠标移动阈值缺失");
assert.match(block, /setTimeout\(\(\) => \{ if \(pd\?\.card === card && !pd\.active\) begin\(pd\); \}, 240\)/, "触屏长按阈值缺失");
assert.match(block, /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/, "必须支持 Alt+↑/↓ 键盘排序");
assert.match(shell, /settings\.pluginOrder = \[\.\.\.box\.querySelectorAll\("button\[data-plugin-id\]"\)\]/,
  "松手后必须按实时 DOM 顺序持久化 pluginOrder");
assert.match(css, /\.nav \.plug-list > button\.nav-dragging\s*\{[^}]*outline:/s, "原位置必须显示明确空槽");
assert.match(css, /\.plugin-nav-ghost\s*\{[^}]*position: fixed/s, "浮起插件项必须 fixed 跟随指针");

console.log("PASS: 侧栏插件拖拽具备浮起项 / 每帧落点 / 明确空槽 / 独立 FLIP 追赶 / 键盘与 reduced-motion");

