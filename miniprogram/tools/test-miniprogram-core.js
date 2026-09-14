// 小程序核心逻辑测试（Node 环境跑，mock wx 存储）
// 用法：node tools/test-miniprogram-core.js
// 覆盖：core/store.js 的 CRUD / 派生 / 持久化，core/timeParser.js 的解析规则
const BASE = new Date(2026, 8, 6); // 2026-09-06，周日，保证用例确定性

/* ── mock wx ── */
const mem = {};
global.wx = {
  getStorageSync(k) { return mem[k]; },
  setStorageSync(k, v) { mem[k] = v; },
};

const store = require("../core/store.js");
const parser = require("../core/timeParser.js");

let pass = 0, fail = 0;
function ok(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ✓", name); }
  else { fail++; console.error("  ✗", name, "\n    期望", e, "\n    实际", a); }
}

/* ── store ── */
console.log("[store]");
store.initStore(store.seed());
let st = store.getState();
ok("种子数据 8 任务 3 时间块", [st.tasks.length, st.blocks.length], [8, 3]);

const t = store.addTask({ title: "测试任务", quad: 2, estMin: 45, due: "2026-09-08" });
ok("addTask 返回带 id 的新任务", [st.tasks.length, st.tasks[0].title], [9, "测试任务"]);

store.updateTask(t.id, { quad: 3 });
ok("updateTask 生效", st.tasks.find((x) => x.id === t.id).quad, 3);

store.toggleTask(t.id);
ok("toggleTask 置完成", st.tasks.find((x) => x.id === t.id).done, true);
store.toggleTask(t.id);

const b = store.addBlock({ date: store.todayStr(), start: "08:00", durMin: 30, title: "早读", taskId: t.id, cat: "study" });
ok("poolOf 排除已安排任务", store.poolOf(store.todayStr()).some((x) => x.id === t.id), false);
ok("poolOf 未完成的都在池里", store.poolOf(store.todayStr()).length, 7); // 种子 8 个减去完成的 t1，新任务已排程被排除

ok("blocksOf 按开始时间排序", store.blocksOf(store.todayStr()).map((x) => x.start), ["08:00", "09:00", "11:00", "11:45"]);

store.removeTask(t.id);
ok("removeTask 级联删时间块", st.blocks.some((x) => x.id === b.id), false);
ok("删除后任务数复原", st.tasks.length, 8);

// 象限排序：未完成在前；同为未完成时按截止日期升序；完成的垫底
store.updateTask("t2", { due: "2026-09-20" });
store.updateTask("t3", { due: "2026-09-08" });
ok("tasksOfQuad：未完成在前、截止升序、完成垫底",
  store.tasksOfQuad(1).map((x) => x.id), ["t3", "t2", "t1"]);

// 持久化：saveNow 后重新 init 能读回
store.updateTask("t2", { title: "修复登录页线上 bug v2" });
store.saveNow();
store.initStore(store.seed()); // 应读回存储而不是种子
ok("持久化读回（防抖写盘生效）", store.getState().tasks.find((x) => x.id === "t2").title, "修复登录页线上 bug v2");

// replaceAll：导入备份（带兜底字段）
store.replaceAll({ tasks: [{ id: "x1", title: "导入的任务", quad: 1 }] });
ok("replaceAll 归一化缺省字段",
  [store.getState().tasks.length, store.getState().blocks.length, typeof store.getState().settings],
  [1, 0, "object"]);

/* ── timeParser ── */
console.log("[timeParser]");
function P(s) { return parser.parseWhen(s, BASE); }

let r = P("明天下午3点到4点 与导师讨论开题修改");
ok("明天下午3点到4点 → 日期/起止", [r.date, r.startMin, r.endMin], ["2026-09-07", 900, 960]);
ok("区间标题清洗", r.title.includes("导师讨论开题修改") && !r.title.includes("3点"), true);

r = P("9月10日 14:00 复查眼睛");
ok("X月X日 + HH:MM", [r.date, r.startMin], ["2026-09-10", 840]);

r = P("周五下午4点半 项目周会");
ok("周X + X点半", [r.date, r.startMin], ["2026-09-11", 990]);

r = P("今晚8点吃饭");
ok("今晚8点 → 今天 晚上8点", [r.date, r.startMin], ["2026-09-06", 1200]);

r = P("大后天 09:15 晨会");
ok("大后天 + HH:MM", [r.date, r.startMin], ["2026-09-09", 555]);

r = P("15号 交房租");
ok("X号（本月未来）", r.date, "2026-09-15");

r = P("月底 整理账目");
ok("月底", r.date, "2026-09-30");

r = P("下下周三 交论文初稿");
ok("下下周三", r.date, "2026-09-16");

r = P("2026-10-01 国庆出发");
ok("YYYY-MM-DD", [r.date, r.title], ["2026-10-01", "国庆出发"]);

r = P("回飞书群消息 12 条");
ok("无日期 → null", r.date, null);
ok("无日期 → 标题保留原文", r.title.includes("回飞书群消息"), true);

r = P("明天上午10点到下午3点 值班");
ok("跨时段区间（上午10点到下午3点）", [r.startMin, r.endMin], [600, 900]);

r = P("下周六晚上9点一刻 看电影");
ok("下周X + 9点一刻", [r.date, r.startMin], ["2026-09-12", 1275]);

ok("guessCategory 跑步 → sport", parser.guessCategory("晚上去跑步"), "sport");
ok("guessCategory 吃饭 → life", parser.guessCategory("中午和朋友聚餐"), "life");
ok("guessCategory 复习 → study", parser.guessCategory("复习线性代数"), "study");
ok("guessQuad 近两天 → I", parser.guessQuad("2026-09-07", BASE), 1);
ok("guessQuad 远期 → II", parser.guessQuad("2026-09-20", BASE), 2);
ok("guessQuad 无日期 → II", parser.guessQuad(null, BASE), 2);

/* ── captureFlow（捕获页建块流程） ── */
console.log("[captureFlow]");
const flow = require("../core/captureFlow.js");

let c = flow.buildCapture("明天下午3点到4点 与导师讨论开题", BASE);
ok("buildCapture 字段齐全",
  [c.title.includes("导师讨论开题"), c.due, c.start, c.dur, c.hasDate, c.hasTime, c.quad],
  [true, "2026-09-07", "15:00", 60, true, true, 1]);

c = flow.buildCapture("回飞书群消息", BASE);
ok("无日期捕获：estMin 60 / start 兜底 09:00", [c.hasDate, c.estMin, c.start], [false, 60, "09:00"]);

c = flow.buildCapture("下周六晚上9点一刻 看电影", BASE);
ok("一刻解析 → 21:15 · 时长默认 60", [c.start, c.estMin], ["21:15", 60]);

ok("durOptions 动态插入非档位时长",
  flow.durOptions(37).values, [15, 30, 37, 45, 60, 90, 120, 180]);
ok("durOptions 命中档位不重复", flow.durOptions(45).values.length, 7);

const before = store.getState().tasks.length;
const made = flow.createFromCapture(c, { date: "", start: "09:00", durMin: 60, cat: "work" });
ok("createFromCapture 无日期仅建任务",
  [made.hasBlock, store.getState().tasks.length - before, made.task.due],
  [false, 1, null]);

const b2 = flow.createFromCapture(c, { date: "2026-09-08", start: "10:30", durMin: 45, cat: "life" });
const nb = store.getState().blocks[store.getState().blocks.length - 1];
ok("createFromCapture 有日期建块字段一致",
  [b2.hasBlock, nb.date, nb.start, nb.durMin, nb.cat, nb.taskId === b2.task.id],
  [true, "2026-09-08", "10:30", 45, "life", true]);

/* ── 三端插件同步 / 小程序原生适配 ── */
console.log("[plugins]");
const catalog = require("../core/pluginCatalog.js");
const pluginRuntime = require("../core/pluginRuntime.js");
ok("内置插件清单同步为 12 个", catalog.plugins.length, 12);
ok("小程序原生适配 4 个", catalog.plugins.filter((x) => x.platforms.miniprogram === "native").length, 4);
store.setPluginEnabled("pomodoro", false);
ok("插件启停写入与桌面相同的 plugins 字段", store.getState().plugins.pomodoro.enabled, false);
store.setPluginEnabled("pomodoro", true);
store.pluginStorageSet("pomodoro", "doneCount", 3);
ok("插件 storage 字段可跨端备份", store.getState().plugins.pomodoro.storage.doneCount, 3);
const hs = pluginRuntime.holidaySummary("2026-09-06");
ok("节假日适配读取桌面同源数据", [hs.available, hs.upcoming.length > 0], [true, true]);
const ex = pluginRuntime.futureExams("2026-09-06", 5);
ok("考试日历适配读取桌面内嵌数据", [ex.length > 0, ex.every((x) => x.date >= "2026-09-06")], [true, true]);
const cet4 = pluginRuntime.futureExams("2026-09-06", 60, "cet4");
ok("考试日历可只看 CET4 全流程", [cet4.length > 0, cet4.every((x) => ["cet4", "cet-set4"].includes(x.examId) || String(x.examId).includes("大学英语四六级"))], [true, true]);
const cetFlow = pluginRuntime.examFlow("2026-09-06", "cet4");
ok("CET 报名提示包含学校/考点与报名系统", [cetFlow.signupNotice.includes("学校"), cetFlow.signupNotice.includes("考点"), cetFlow.signupUrl], [true, true, "https://cet-bm.neea.edu.cn/"]);
const pth = pluginRuntime.futureExams("2026-09-06", 60, "putonghua");
ok("普通话水平测试已收录且按报名窗口标注", [pth.length >= 3, pth.every((x) => x.examId === "putonghua"), pth.some((x) => x.countdown.indexOf("报名") >= 0)], [true, true, true]);
const pthFlow = pluginRuntime.examFlow("2026-09-06", "putonghua");
ok("普通话报名提示说明无全国统一日期并给出官方入口", [pthFlow.signupNotice.includes("没有全国统一考试日期"), pthFlow.signupNotice.includes("bm.cltt.org"), pthFlow.signupUrl], [true, true, "https://bm.cltt.org/"]);
const wr = pluginRuntime.weeklyReport("2026-09-08");
ok("周度报告适配输出 7 天", wr.days.length, 7);

/* ── 汇总 ── */
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
