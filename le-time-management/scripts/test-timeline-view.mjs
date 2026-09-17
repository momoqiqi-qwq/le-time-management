import assert from "node:assert/strict";

// 时间线视图的纯函数部分（不碰 DOM）：事件收集 / 排序 / 分组 / 年份徽章 / 状态标记。
// 渲染层（renderTimeline）由无头 Chrome 截图目检覆盖，不在这里测。
import { collectTimelineEvents, buildTimelineModel } from "../src/views/timeline.js";

const TODAY = "2026-09-18";

const state = {
  tasks: [
    { id: "t1", title: "带正文与截止", note: "第三章习题 1~5，交到学委邮箱", due: "2026-09-18", dueTime: "23:59", done: false, quad: 1, project: "高数", tags: ["学习"] },
    { id: "t2", title: "已完成的老任务", note: "", due: "2026-09-01", dueTime: "12:00", done: true, quad: 2, project: "", tags: [] },
    { id: "t3", title: "过期未完成", note: "", due: "2026-09-10", dueTime: "08:00", done: false, quad: 3, project: "", tags: [] },
    { id: "t4", title: "无截止不上线", note: "", due: null, dueTime: "23:59", done: false, quad: 4, project: "", tags: [] },
    { id: "t5", title: "跨年任务", note: "元旦提交终稿", due: "2027-01-03", dueTime: "09:30", done: false, quad: 2, project: "论文", tags: ["论文"] },
  ],
  blocks: [
    { id: "b2", date: "2026-09-18", start: "14:00", durMin: 90, title: "下午自习", taskId: "t1", cat: "study" },
    { id: "b1", date: "2026-09-18", start: "08:30", durMin: 30, title: "晨跑", taskId: null, cat: "sport" },
    { id: "b3", date: "2026-09-20", start: "09:00", durMin: 60, title: "周会", taskId: null, cat: "work" },
    { id: "b4", date: "2026-09-10", start: "10:00", durMin: 45, title: "补课", taskId: null, cat: "study" },
  ],
};

/* ── collectTimelineEvents ── */
const events = collectTimelineEvents(state);

// 无 due 的任务不上线；其余 4 任务 + 4 块 = 8 条
assert.equal(events.length, 8, "无截止日任务不进时间线，其余全收");

// 排序：日期升序 → 同日内时间点升序（08:30 晨跑必须在 14:00 自习前）
const sameDay = events.filter((e) => e.date === "2026-09-18");
assert.deepEqual(sameDay.map((e) => e.time), ["08:30", "14:00", "23:59"], "同一天按时间点升序：块在前、截止在后");
assert.equal(sameDay[0].title, "晨跑");

// 事件形态：块带时长与关联任务，任务带正文
const run = events.find((e) => e.id === "blk:b1");
assert.equal(run.kind, "block");
assert.equal(run.durMin, 30);
const t1 = events.find((e) => e.id === "task:t1");
assert.equal(t1.note, "第三章习题 1~5，交到学委邮箱", "任务正文进事件");
assert.equal(t1.done, false);

/* ── buildTimelineModel ── */
const model = buildTimelineModel(state, TODAY);

// 5 个日期组，升序
assert.deepEqual(model.groups.map((g) => g.date), ["2026-09-01", "2026-09-10", "2026-09-18", "2026-09-20", "2027-01-03"]);

// 年份徽章：首组必标；跨年（2027-01-03）必标；同年中间组不标
assert.equal(model.groups[0].yearChanged, true, "首组出现年份徽章");
assert.equal(model.groups[1].yearChanged, false, "同年内不重复标年");
assert.equal(model.groups[3].yearChanged, false);
const ny = model.groups[4];
assert.equal(ny.yearChanged, true, "跨年处出现年份徽章");
assert.equal(ny.year, 2027);

// 今天 / 过去 / 过期标记
const todayGroup = model.groups[2];
assert.equal(todayGroup.isToday, true);
assert.equal(todayGroup.isPast, false);
assert.equal(todayGroup.hasOverdue, false, "今天不算过期");
const pastGroup = model.groups[1];
assert.equal(pastGroup.isPast, true);
assert.equal(pastGroup.hasOverdue, true, "过期未完成任务触发红点");
const doneGroup = model.groups[0];
assert.equal(doneGroup.hasOverdue, false, "已完成的过期任务不触发红点");
assert.equal(doneGroup.hasDone, true);

// 日期徽章文案与完整标签
assert.equal(todayGroup.monthDay, "9/18");
assert.equal(todayGroup.fullLabel, "2026年9月18日 周五");
assert.equal(ny.fullLabel, "2027年1月3日 周日");

// 空数据：空组数组，渲染层显示空态
assert.deepEqual(buildTimelineModel({ tasks: [], blocks: [] }, TODAY).groups, []);

console.log("PASS: 时间线事件收集 / 排序 / 分组 / 年份徽章 / 今天与过期标记");
