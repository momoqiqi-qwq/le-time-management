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

const store = require("../miniprogram/core/store.js");
const parser = require("../miniprogram/core/timeParser.js");

let pass = 0, fail = 0;
function ok(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ✓", name); }
  else { fail++; console.error("  ✗", name, "\n    期望", e, "\n    实际", a); }
}

/* ── store ── */
console.log("[store]");
store.initStore(store.seed());
/* v0.37.17 起 seed() 刻意全空（首启四象限干净），测试改为显式构造确定性数据 */
store.replaceAll({
  version: 1,
  tasks: [
    { id: "t1", title: "已完成的任务", quad: 1, done: true, estMin: 30 },
    { id: "t2", title: "象限一任务甲", quad: 1, estMin: 30 },
    { id: "t3", title: "象限一任务乙", quad: 1, estMin: 30 },
    { id: "t4", title: "象限二任务", quad: 2, estMin: 30 },
    { id: "t5", title: "任务五", quad: 2, estMin: 30 },
    { id: "t6", title: "任务六", quad: 3, estMin: 30 },
    { id: "t7", title: "任务七", quad: 4, estMin: 30 },
    { id: "t8", title: "任务八", quad: 2, estMin: 30 },
  ],
  blocks: [
    { id: "b1", date: store.todayStr(), start: "09:00", durMin: 30, title: "上午块", cat: "work" },
    { id: "b2", date: store.todayStr(), start: "11:00", durMin: 45, title: "上午块二", cat: "study" },
    { id: "b3", date: store.todayStr(), start: "11:45", durMin: 30, title: "上午块三", cat: "work" },
  ],
});
let st = store.getState();
ok("空种子策略下测试数据 8 任务 3 时间块", [st.tasks.length, st.blocks.length], [8, 3]);

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
const flow = require("../miniprogram/core/captureFlow.js");

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
const catalog = require("../miniprogram/core/pluginCatalog.js");
const pluginRuntime = require("../miniprogram/core/pluginRuntime.js");
ok("内置插件清单同步为 12 个", catalog.plugins.length, 12);
ok("小程序原生适配 8 个", catalog.plugins.filter((x) => x.platforms.miniprogram === "native").length, 8);
["plugin-guide", "wechat-push", "gx-news", "chaoxing-notify"].forEach((id) =>
  ok("新适配插件 " + id + " 标记 native", (catalog.byId[id].platforms || {}).miniprogram, "native"));
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

/* ── 学习通适配纯逻辑（chaoxingCore） ── */
console.log("[chaoxing]");
const cxCore = require("../miniprogram/core/chaoxingCore.js");
const pluginNet = require("../miniprogram/core/pluginNet.js");

/* DES 向量：与本机 Python pyDes（ECB + PKCS5，key "u2oh6Vu^"）实测对照 */
ok("DES 加密 123456", cxCore.desEncryptHex("123456", "u2oh6Vu^"), "218b246a6f42ee81");
ok("DES 加密 Passw0rd!", cxCore.desEncryptHex("Passw0rd!", "u2oh6Vu^"), "d61c001d2e492b5b946fca742802e4d2");
ok("DES 加密中文（多字节 UTF-8）", cxCore.desEncryptHex("你好学习通", "u2oh6Vu^"), "2bf01b815965bd893690d8083f0f72b7");
ok("DES 加密单字符（PKCS5 填充到 8 字节）", cxCore.desEncryptHex("a", "u2oh6Vu^"), "9524e6bb60f41487");
ok("登录请求体包含加密密码与编码账号",
  cxCore.LOGIN_BODY("13800000000", "abcd"), "fid=-1&uname=13800000000&password=abcd&refer=https%3A%2F%2Fi.chaoxing.com&t=true&forbidotherlogin=0&validate=");

ok("Cookie 合并保留新值并去重",
  cxCore.mergeCookies("UID=1; FUID=2", ["UID=9; Path=/", "VC3=abc; HttpOnly"]),
  "UID=9; FUID=2; VC3=abc");
ok("Set-Cookie 提取兼容大小写与数组",
  pluginNet.setCookiesOf({ "set-cookie": ["A=1; Path=/", "B=2"], "Content-Type": "text/html" }),
  ["A=1; Path=/", "B=2"]);

const n1 = cxCore.normalizeNotice({ idCode: "a".repeat(32), title: "第<b>3</b>章 作业提交", rtf_content: "<p>请在 2026-09-10 23:59 前完成。结束时间：2026-09-10 23:59</p>", createrName: "王老师", insertTime: Math.floor(new Date(2025, 8, 6, 7, 20).getTime() / 1000), isread: 0, tag: "courseId(123)" });
ok("normalizeNotice 去 HTML 并识别截止时间",
  [n1.title, cxCore.deadline(n1.body), cxCore.classify(n1), n1.unread],
  ["第3章 作业提交", "2026-09-10 23:59", "作业", true]);
ok("normalizeNotice 时间戳转文本（秒，按本地时区）", n1.time, "2025-09-06 07:20");
ok("isread=1 视为已读", cxCore.normalizeNotice({ id: "x", isread: 1 }).unread, false);

const overrides = new Map([["a".repeat(32), false]]);
const opts = { ignoredIds: new Set(), readOverrides: overrides, filter: { kw: "", category: "全部", onlyUnread: false } };
ok("本机已读标记覆盖平台未读状态", cxCore.effUnread(n1, overrides), false);
ok("关键词过滤命中正文", cxCore.filteredInbox([n1], { ignoredIds: new Set(), readOverrides: new Map(), filter: { kw: "作业", category: "全部", onlyUnread: false } }).length, 1);
ok("分类过滤排除通知", cxCore.filteredInbox([n1], { ignoredIds: new Set(), readOverrides: new Map(), filter: { kw: "", category: "通知", onlyUnread: false } }).length, 0);
ok("已过期截止不进待办", cxCore.todos([n1], { ignoredIds: new Set(), readOverrides: new Map(), filter: { kw: "", category: "全部", onlyUnread: false } }).length, 0);
const futureN = cxCore.normalizeNotice({ idCode: "b".repeat(32), title: "期末作业", rtf_content: "结束时间：" + (new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) + " 23:59" });
ok("未过期截止进待办且带 dueText", cxCore.todos([futureN], opts).map((x) => !!x.dueText), [true]);
ok("忽略名单把通知挡在列表外",
  cxCore.filteredInbox([n1], { ignoredIds: new Set([n1.id]), readOverrides: new Map(), filter: { kw: "", category: "全部", onlyUnread: false } }).length, 0);

/* 作业附件 iframe：Base64(URL 编码 JSON)，探测「正在批改」用 */
const workPayload = Buffer.from(encodeURIComponent(JSON.stringify({ att_web: { url: "https://mooc1.chaoxing.com/work/doHomeWorkNew?workId=77", examOrWorkId: 77 } })), "utf8").toString("base64");
const workN = cxCore.normalizeNotice({ idCode: "c".repeat(32), title: "作业", rtf_content: '<iframe name="' + workPayload + '"></iframe>' });
const ref = cxCore.parseWorkRef(workN);
ok("作业附件解析出 workId 与入口 URL", [ref && ref.id, /doHomeWorkNew/.test(ref && ref.url)], ["77", true]);
ok("作业链接打分高于普通站内链接", cxCore.linkScore("https://mooc1.chaoxing.com/work/doHomeWorkNew?workId=77") > cxCore.linkScore("https://i.chaoxing.com/"), true);
ok("分享页属匿名可开链接", cxCore.isAnonymousUrl("https://sharewh3.xuexi365.com/share/xxx"), true);

const courses = cxCore.parseCoursesHtml('<li class="course ">' +
  '<input class="courseId" name="courseId" value="555"/>' +
  '<input class="clazzId" name="clazzId" value="666"/>' +
  '<a class="course-name" title="生物化学"></a>' +
  '<a class="line2 color3" title="李老师"></a>班级：25防火<br/>开课时间：2025-09-01～2027-09-01</li>');
const now = new Date(2026, 8, 16);
ok("课程 HTML 解析字段齐全", [courses[0].name, courses[0].teacher, courses[0].clazz, courses[0].start], ["生物化学", "李老师", "25防火", "2025-09-01"]);
ok("开课月份≥7 → 秋季学期", cxCore.termOf("2025-09-01"), { year: 2025, half: "上", rank: 4050, label: "2025-2026 学年上学期" });
ok("秋季学期已过 → 已完成", cxCore.courseStatus(courses[0], now), "green");
ok("班级名投票出入学学年", cxCore.detectEnrollYear(courses), 2025);
ok("年级按入学学年推算", cxCore.gradeOf(2025, 2025), "大一");
const cg = cxCore.courseGroups(courses, now, "");
ok("课程分组视图模型带学年 tab", cg.years, [2025]);
ok("分组视图模型含入学学年推断", cg.enrollYear, 2025);

/* ── 汇总 ── */
console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
