// 插件颜色分组：色值合法性、同色吸附归一化、组名与收起状态、整组移动。
import assert from "node:assert/strict";
import * as S from "../src/store.js";
import { pluginColor, resetPluginOverride, setPluginColor, setPluginOverride } from "../src/pluginAppearance.js";
import {
  GROUP_COLORS,
  groupName,
  groupSegments,
  isGroupColor,
  isGroupCollapsed,
  moveGroupInOrder,
  normalizePluginOrder,
  renameGroup,
  toggleGroupCollapsed,
} from "../src/pluginGroups.js";

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
await S.initStore({ tasks: [], blocks: [], settings: {}, plugins: {} });

/* ── 色板 ── */
assert.equal(GROUP_COLORS.length, 8, "色板固定 8 色");
assert.equal(new Set(GROUP_COLORS.map((c) => c.id)).size, 8, "色板 ID 不许重复");
for (const color of GROUP_COLORS) {
  assert.match(color.id, /^[a-z]+$/, `色板 ID 用小写字母：${color.id}`);
  assert.match(color.hex, /^#[0-9A-F]{6}$/, `色值要写 6 位大写十六进制：${color.hex}`);
  assert.ok(color.label.endsWith("色"), `颜色名以「色」结尾，组名才拼得顺：${color.label}`);
  assert.ok(isGroupColor(color.id), `${color.id} 应当是合法色`);
}
assert.ok(!isGroupColor("#DC2626"), "色值本身不是色 ID");
assert.ok(!isGroupColor(""), "空串不是色 ID");
assert.ok(!isGroupColor(undefined), "缺省不是色 ID");

/* ── 同色吸附：纯函数，色由调用方注入 ── */
const colors = { b: "red", d: "red", e: "blue" };
const colorOf = (id) => colors[id] || "";
assert.deepEqual(normalizePluginOrder(["a", "b", "c", "d", "e"], colorOf), ["a", "b", "d", "c", "e"],
  "同色的 b/d 收成一段，无色的 a/c/e 保持各自槽位");
assert.deepEqual(normalizePluginOrder(["b", "x", "d"], colorOf), ["b", "d", "x"],
  "段的位置 = 该组第一个成员原来的位置");
assert.deepEqual(normalizePluginOrder(["d", "b", "e"], colorOf), ["d", "b", "e"],
  "组内相对顺序按原顺序，不重排");
assert.deepEqual(normalizePluginOrder(["a", "c"], colorOf), ["a", "c"], "全无色时原样返回");
assert.deepEqual(normalizePluginOrder(["b", "d"], colorOf), ["b", "d"], "全同色时原样返回");

const once = normalizePluginOrder(["e", "a", "b", "c", "d"], colorOf);
assert.deepEqual(normalizePluginOrder(once, colorOf), once, "归一化必须幂等");
assert.deepEqual(once, ["e", "a", "b", "d", "c"], "蓝组锚点是 e，红组锚点是先出现的 b");

assert.deepEqual(normalizePluginOrder(["a", "b", "a", "b"], colorOf), ["a", "b"], "重复 ID 要去重");
assert.deepEqual(normalizePluginOrder(null, colorOf), [], "非数组按空处理");
assert.deepEqual(normalizePluginOrder(["a", "", null, "b"], colorOf), ["a", "b"], "脏 ID 直接丢掉");

/* ── 分段与整组移动 ── */
const ordered = ["a", "b", "d", "c", "e"];
assert.deepEqual(groupSegments(ordered, colorOf), [["a"], ["b", "d"], ["c"], ["e"]], "连续同色算一段");
assert.deepEqual(moveGroupInOrder(ordered, "red", 1, colorOf), ["a", "c", "b", "d", "e"], "红组下移一段");
assert.deepEqual(moveGroupInOrder(ordered, "red", -1, colorOf), ["b", "d", "a", "c", "e"], "红组上移一段");
assert.deepEqual(moveGroupInOrder(ordered, "red", 2, colorOf), ["a", "c", "e", "b", "d"], "跨多段按段数走");
assert.deepEqual(moveGroupInOrder(ordered, "red", 3, colorOf), ordered, "越界不动");
assert.deepEqual(moveGroupInOrder(ordered, "blue", -1, colorOf), ["a", "b", "d", "e", "c"], "末组上移");
for (const delta of [-1, 1, 2]) {
  const moved = moveGroupInOrder(ordered, "red", delta, colorOf);
  assert.deepEqual(normalizePluginOrder(moved, colorOf), moved, "整组移动后同色仍然连续");
}
assert.deepEqual(moveGroupInOrder(ordered, "pink", 1, colorOf), ordered, "不存在的组原样返回");

/* ── 覆写表里的色值：读写与清理 ── */
setPluginColor("cppu-notify", "blue");
assert.equal(pluginColor("cppu-notify"), "blue");
setPluginColor("cppu-notify", "red");
assert.equal(pluginColor("cppu-notify"), "red", "改色是覆盖不是追加");
assert.deepEqual(S.getState().settings.pluginOverrides["cppu-notify"], { color: "red" }, "只写色不该带出别的键");

setPluginColor("chaoxing-notify", "green");
assert.equal(S.getState().settings.pluginOverrides["chaoxing-notify"].color, "green");
setPluginColor("chaoxing-notify", "");
assert.equal(pluginColor("chaoxing-notify"), "", "清色后读回空");
assert.ok(!("chaoxing-notify" in S.getState().settings.pluginOverrides), "空覆写记录要整条删掉");

setPluginColor("pomodoro", "#DC2626");
assert.equal(pluginColor("pomodoro"), "", "非法色值不落库");
assert.ok(!("pomodoro" in S.getState().settings.pluginOverrides), "非法色值不留空壳");

// 已有名字/图标的插件改色，不能把别的覆写砸掉
S.getState().settings.pluginOverrides["rss-reader"] = { name: "订阅" };
setPluginColor("rss-reader", "cyan");
assert.deepEqual(S.getState().settings.pluginOverrides["rss-reader"], { name: "订阅", color: "cyan" }, "改色要保留已改的名字");
setPluginColor("rss-reader", "");
assert.deepEqual(S.getState().settings.pluginOverrides["rss-reader"], { name: "订阅" }, "清色不能顺手清名");

// 「恢复默认名称与图标」只清名称和图标，分组色要留下
setPluginOverride("ai-chat", { name: "助手", icon: "data:image/png;base64,AAA" });
setPluginColor("ai-chat", "pink");
setPluginOverride("ai-chat", { name: "", icon: "" });
assert.deepEqual(S.getState().settings.pluginOverrides["ai-chat"], { color: "pink" },
  "恢复名称与图标不能顺手清掉分组色");
resetPluginOverride("ai-chat");
assert.ok(!("ai-chat" in S.getState().settings.pluginOverrides), "整条重置要连色一起清掉");

/* ── 组名与收起 ── */
assert.equal(groupName("red"), "红色组", "默认组名 = 颜色名 + 组");
assert.equal(groupName("nope"), "", "非法色没有组名");
renameGroup("red", "学习");
assert.equal(groupName("red"), "学习");
assert.equal(S.getState().settings.pluginGroups.red.name, "学习");
renameGroup("red", "   ");
assert.equal(groupName("red"), "红色组", "改名留空即恢复默认");
assert.ok(!("name" in (S.getState().settings.pluginGroups.red || {})), "恢复默认不该留空 name");

assert.equal(isGroupCollapsed("red"), false, "默认展开");
assert.equal(toggleGroupCollapsed("red"), true);
assert.equal(isGroupCollapsed("red"), true);
assert.equal(toggleGroupCollapsed("red"), false, "再点一次展开");
renameGroup("blue", "信息");
toggleGroupCollapsed("blue");
assert.equal(groupName("blue"), "信息", "收起不能抹掉组名");

assert.ok(!Array.isArray(S.getState().settings.pluginGroups), "pluginGroups 是表不是数组");
S.getState().settings.pluginGroups = ["脏数据"];
assert.equal(groupName("red"), "红色组", "脏数据下取组名不能抛错");
assert.equal(toggleGroupCollapsed("red"), true, "脏数据下收起仍可用");
assert.equal(typeof S.getState().settings.pluginGroups, "object");

console.log("PASS: 插件颜色分组（色板校验 / 同色吸附 / 整组移动 / 组名与收起）");
