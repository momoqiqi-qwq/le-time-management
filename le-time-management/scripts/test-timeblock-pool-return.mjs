import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../src/store.js";

const source = readFileSync(new URL("../src/views/timeblock.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/ui.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

assert.match(source, /const pointInPool = \(x, y\)/, "任务池必须按实际矩形判断落点");
assert.match(source, /canReturnToPool && pointInPool\(ev\.clientX, ev\.clientY\)/, "拖动中必须实时计算任务池接收态");
assert.match(source, /const removed = S\.removeBlock\(b\.id\)/, "落入任务池后才移除排程");
assert.match(source, /animateReturnedTask\(b\.taskId, fromRect\)/, "任务回池后必须有落位动画");
assert.match(source, /onCancel: \(\) => \{ hideHint\(\); paintPoolReturn\(\); \}/, "取消拖动必须清理任务池状态");
assert.match(ui, /onCancel\?\.\(\{ payload \}\)/, "通用指针拖拽必须暴露取消清理回调");
assert.match(css, /\.pool\.block-return-ready \.pool-return-target/, "任务池必须有明确的可放置视觉状态");

const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key), setItem: (key, value) => memory.set(key, value) };
await S.initStore({ tasks: [], blocks: [], settings: {}, plugins: {} });
const task = S.addTask({ title: "可拖回的任务", estMin: 30 });
const block = S.placeTask(task, "2026-09-20", 480);
assert.equal(S.poolOf("2026-09-20").some(item => item.id === task.id), false);
const removed = S.removeBlock(block.id);
assert.equal(removed.taskId, task.id);
assert.equal(S.poolOf("2026-09-20").some(item => item.id === task.id), true, "移除当天排程后任务应重新进入任务池");
S.addBlock(removed);
assert.equal(S.poolOf("2026-09-20").some(item => item.id === task.id), false, "撤销应恢复原排程并移出任务池");

console.log("PASS: 时间块可拖回任务池、取消清理、落位动效与撤销语义");
