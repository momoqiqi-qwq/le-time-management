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

console.log("PASS: blocksOf 日期缓存、副本保护、更新/删除/整体替换失效");
