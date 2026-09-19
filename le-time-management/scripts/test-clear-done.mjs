/* 一键清理已完成任务（store 层行为）。
 * 守的三件事：只删 done、连带排程一起消失、撤销把任务和各自的排程成对放回且不重复。
 */
import assert from "node:assert/strict";
import * as S from "../src/store.js";

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k), setItem: (k, v) => memory.set(k, v) };
await S.initStore({ tasks: [], blocks: [], settings: {}, plugins: {} });

const open = S.addTask({ title: "还没做", quad: 1 });
const a = S.addTask({ title: "已完成 A", quad: 1, done: true });
const b = S.addTask({ title: "已完成 B", quad: 2, done: true });
S.placeTask(a, "2026-09-09");
S.placeTask(a, "2026-09-10");
const bBlock = S.placeTask(b, "2026-09-09");
const openBlock = S.placeTask(open, "2026-09-09");

const undo = S.deleteDoneTasksUndoable();
assert.deepEqual(S.getState().tasks.map((t) => t.id), [open.id], "只删已完成，未受影响");
assert.deepEqual(S.getState().blocks.map((x) => x.id), [openBlock.id], "已完成任务的排程一起删除");

assert.equal(S.deleteDoneTasksUndoable(), null, "没有已完成任务时不动数据");
assert.equal(S.getState().tasks.length, 1);

undo();
assert.deepEqual(S.getState().tasks.map((t) => t.id).sort(), [a.id, b.id, open.id].sort());
assert.equal(S.getState().blocks.filter((x) => x.taskId === a.id).length, 2, "跨两天的排程都回来");
assert.ok(S.getState().blocks.some((x) => x.id === bBlock.id), "排程按原 ID 放回");
assert.equal(S.getState().tasks.filter((t) => t.done).length, 2);
assert.equal(S.getState().tasks.filter((t) => t.id === a.id).length, 1);

const before = JSON.stringify(S.getState());
undo();
assert.equal(JSON.stringify(S.getState()), before, "撤销重复调用不重复插入");

await S.saveNow();
await S.initStore({});
assert.equal(S.getState().tasks.filter((t) => t.done).length, 2, "清理结果落盘");

console.log("PASS: 一键清理已完成只删 done、连带排程、空表 no-op、整批撤销幂等、结果持久化");
