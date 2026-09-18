import assert from "node:assert/strict";
import * as S from "../src/store.js";

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };

await S.initStore({ tasks: [], blocks: [], settings: {}, plugins: {} });
S.addBlock({ id: "late", date: "2026-09-09", start: "13:00", title: "下午" });
S.addBlock({ id: "early", date: "2026-09-09", start: "09:00", title: "上午" });

const first = S.blocksOf("2026-09-09");
assert.deepEqual(first.map((b) => b.id), ["early", "late"]);
first.pop();
assert.deepEqual(S.blocksOf("2026-09-09").map((b) => b.id), ["early", "late"], "blocksOf 返回副本，调用方不能改坏缓存");

S.updateBlock("late", { start: "08:30" });
assert.deepEqual(S.blocksOf("2026-09-09").map((b) => b.id), ["late", "early"], "更新开始时间后缓存失效并重新排序");

S.removeBlock("early");
assert.deepEqual(S.blocksOf("2026-09-09").map((b) => b.id), ["late"], "删除时间块后缓存失效");

S.replaceAll({ tasks: [], blocks: [{ id: "fresh", date: "2026-09-09", start: "10:00" }], settings: {}, plugins: {} });
assert.deepEqual(S.blocksOf("2026-09-09").map((b) => b.id), ["fresh"], "整体替换数据后缓存失效");

/* 自定义背景已在 v0.55.0 移除：settings.background 里可能压着几百 KB 的 base64 图片，
   归一化必须把它剥掉。放在归一化处而不是写一次性迁移，是因为它同时覆盖「打开本地数据」
   与「导入旧备份」两条路径 —— 这里走的是 replaceAll（导入那条）。 */
S.replaceAll({
  tasks: [], blocks: [], plugins: {},
  settings: { theme: "classic", background: { enabled: true, image: "data:image/png;base64," + "A".repeat(4096) } },
});
assert.ok(!("background" in S.getState().settings),
  "导入带 settings.background 的旧备份后，该键必须被剥掉（自定义背景已移除）");
assert.equal(S.getState().settings.theme, "classic", "剥掉 background 不能连带弄丢 settings 里的其他字段");

console.log("PASS: blocksOf 日期缓存、副本保护、更新/删除/整体替换失效 + 旧数据里的 settings.background 被剥掉");
