// 微信小程序原生插件适配层：只放纯数据逻辑，页面负责交互。
const store = require("./store.js");
const holidayData = require("./pluginData/holiday.js");
const examData = require("./pluginData/exams.js");

const WEEK_CN = "日一二三四五六";
const CAT_LABEL = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function dateMs(ds) {
  const p = String(ds || "").split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]).getTime();
}
function dayDiff(a, b) { return Math.round((dateMs(b) - dateMs(a)) / 86400000); }
function weekday(ds) {
  const p = String(ds || "").split("-").map(Number);
  return "周" + WEEK_CN[new Date(p[0], p[1] - 1, p[2]).getDay()];
}
function durationLabel(min) {
  min = Math.max(0, Number(min) || 0);
  if (min < 60) return min + "m";
  const h = Math.floor(min / 60), r = min % 60;
  return h + "h" + (r ? r + "m" : "");
}
function weeklyReport(today) {
  today = today || store.todayStr();
  const days = [];
  for (let i = -6; i <= 0; i++) days.push(store.addDays(today, i));
  const perDay = days.map((date) => {
    const blocks = store.blocksOf(date);
    const minutes = blocks.reduce((sum, b) => sum + (Number(b.durMin) || 0), 0);
    return { date, weekday: weekday(date), minutes, label: durationLabel(minutes) };
  });
  const max = Math.max(60, ...perDay.map((x) => x.minutes));
  perDay.forEach((x) => { x.pct = Math.max(3, Math.round((x.minutes / max) * 100)); });
  const byCat = {};
  for (const date of days) {
    for (const b of store.blocksOf(date)) byCat[b.cat] = (byCat[b.cat] || 0) + (Number(b.durMin) || 0);
  }
  const cats = store.CATEGORIES.map((c) => ({
    id: c.id,
    label: CAT_LABEL[c.id] || c.label || c.id,
    minutes: byCat[c.id] || 0,
    value: durationLabel(byCat[c.id] || 0),
  }));
  const tasks = store.getState().tasks || [];
  const done = tasks.filter((t) => t.done).length;
  const total = perDay.reduce((sum, x) => sum + x.minutes, 0);
  return { days: perDay, cats, total, totalLabel: durationLabel(total), averageLabel: durationLabel(Math.round(total / 7)), done, taskCount: tasks.length };
}

function holidaySummary(today) {
  today = today || store.todayStr();
  const year = today.slice(0, 4);
  const doc = holidayData[year] || null;
  if (!doc) return { available: false, year, today, todayText: "当前年份没有内置节假日数据", upcoming: [] };
  const map = Object.create(null);
  for (const d of doc.days || []) map[d.date] = d;
  const special = map[today];
  const dow = new Date(dateMs(today)).getDay();
  let todayText;
  if (special) todayText = special.isOffDay ? `${special.name} · 放假` : `${special.name} · 调休上班`;
  else todayText = dow === 0 || dow === 6 ? "周末 · 休息日" : "普通工作日";

  const groups = [];
  const days = (doc.days || []).filter((d) => d.isOffDay && d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.name === d.name && dayDiff(last.endDate, d.date) === 1) {
      last.endDate = d.date;
      last.days += 1;
    } else {
      groups.push({ name: d.name, startDate: d.date, endDate: d.date, days: 1 });
    }
  }
  const upcoming = groups.slice(0, 8).map((g) => {
    const diff = dayDiff(today, g.startDate);
    return Object.assign({}, g, {
      countdown: diff === 0 ? "今天" : diff === 1 ? "明天" : `${diff} 天后`,
      range: g.startDate === g.endDate ? g.startDate : `${g.startDate} → ${g.endDate}`,
    });
  });
  return { available: true, year, today, todayText, upcoming, papers: doc.papers || [] };
}

const EXAM_FILTERS = [
  { id: "all", label: "全部考试" },
  { id: "cet4", label: "大学英语四级（CET4）" },
  { id: "cet6", label: "大学英语六级（CET6）" },
  { id: "ncre", label: "全国计算机等级考试（NCRE）" },
  { id: "ntce", label: "中小学教师资格考试（NTCE）" },
  { id: "putonghua", label: "普通话水平测试（PSC）" },
  { id: "kaoyan", label: "全国硕士研究生招生考试" },
  { id: "tem4", label: "英语专业四级（TEM4）" },
  { id: "tem8", label: "英语专业八级（TEM8）" },
];
// 与桌面端 public/plugins/exam-calendar/main.js 的 SIGNUP_GUIDES 保持一致
const CET_GUIDE = {
  signupUrl: "https://cet-bm.neea.edu.cn/",
  signupAction: "复制 CET 报名系统网址",
  signupNotice: "CET 报名时间可能因省份、学校或考点不同而不同。请考生按所在学校规定时间登录 CET 全国网上报名系统（cet-bm.neea.edu.cn），完成资格审核、笔试报名缴费及口试报名缴费。",
};
const SIGNUP_GUIDES = {
  cet4: CET_GUIDE,
  cet6: CET_GUIDE,
  putonghua: {
    signupUrl: "https://bm.cltt.org/",
    signupAction: "复制普通话报名系统网址",
    signupNotice: "普通话水平测试（PSC）没有全国统一考试日期，由各省（市）语委与测试站分批组织，频次从每年 1 次到每月开考不等，报名与测试时间各省不同。请登录国家普通话水平测试在线报名系统（bm.cltt.org），选择所在省份查看测试站计划并报名。",
  },
};
function examFamilyIds(id) {
  if (id === "cet4") return ["cet4", "cet-set4"];
  if (id === "cet6") return ["cet6", "cet-set6"];
  return [id];
}
function eventBelongsToExam(ev, id) {
  if (!id || id === "all") return true;
  const ids = examFamilyIds(id);
  if (ids.indexOf(ev.examId) >= 0) return true;
  const merged = Array.isArray(ev.mergedFrom) ? ev.mergedFrom : [];
  return merged.some((x) => ids.indexOf(x) >= 0);
}
/* 考试列表展示口径必须与桌面端插件（public/plugins/exam-calendar/main.js）保持一致：
 * 日期只留 月-日 + 星期（年份由分组承担），倒计时分档，进行中用 endDate 判断。 */
function examSpanDays(ev) {
  return (ev.endDate && ev.endDate !== ev.date) ? dayDiff(ev.date, ev.endDate) + 1 : 1;
}
function examDateLines(ev) {
  const md = (s) => String(s).slice(5);
  const end = (ev.endDate && ev.endDate !== ev.date) ? ev.endDate : "";
  if (!end) return { top: md(ev.date), bottom: weekday(ev.date) };
  return { top: md(ev.date) + " → " + md(end), bottom: weekday(ev.date) + " → " + weekday(end) };
}
/* 报名窗口类条目（普通话这类各省分批、无全国统一日期的考试）不编造「剩 N 天」的截止感 */
function isExamWindow(ev) {
  return ev.type === "registration" || ev.type === "pre-registration";
}
/* 进行中必须用 endDate 判断：多日考试从第 2 天起 date 已经过去，
 * 只按 date 算差值会显示成「-1 天后」（旧版就是这个 bug）。 */
function examCountdown(ev, today) {
  const start = ev.date;
  const end = ev.endDate || ev.date;
  const win = isExamWindow(ev);
  if (today >= start && today <= end) {
    if (win) return { text: "报名中 · 各省分批", tone: "live" };
    const total = dayDiff(start, end) + 1;
    return { text: total > 1 ? "进行中 · 第 " + (dayDiff(start, today) + 1) + " 天" : "今天", tone: "live" };
  }
  const d = dayDiff(today, start);
  if (d <= 0) return { text: win ? "本批已结束" : "已结束", tone: "far" };
  if (d === 1) return { text: win ? "明天开始报名" : "明天", tone: "urgent" };
  if (d <= 3) return { text: d + " 天后" + (win ? "开始报名" : ""), tone: "urgent" };
  if (d <= 14) return { text: d + " 天后" + (win ? "开始报名" : ""), tone: "soon" };
  if (d <= 60) return { text: d + " 天后" + (win ? "开始报名" : ""), tone: "near" };
  if (d <= 180) return { text: "约 " + Math.round(d / 30) + " 个月后", tone: "far" };
  return { text: start, tone: "far" };
}
function examMetaText(ev) {
  const parts = [];
  if (ev.category) parts.push(ev.category);
  const span = examSpanDays(ev);
  if (span > 1 && !isExamWindow(ev)) parts.push("连续 " + span + " 天");
  if (ev.startTime) parts.push(ev.startTime + "–" + (ev.endTime || ""));
  parts.push(ev.confirmed ? "官方已确认" : "规则推算");
  return parts.join(" · ");
}
function futureExams(today, limit, examFilter) {
  today = today || store.todayStr();
  limit = Number(limit) || 30;
  examFilter = examFilter || "all";
  return (examData.events || [])
    .filter((ev) => ev && (ev.endDate || ev.date) >= today && eventBelongsToExam(ev, examFilter))
    .slice()
    // 只按日期排序（依赖稳定排序保留同日多条的数据顺序），与桌面端 allEvents() 口径一致。
    // 分批报名窗口（普通话这类）排在同年的具体考试之后，先按年分桶保证年份连续。
    .sort((a, b) => {
      const ay = a.date.slice(0, 4), by = b.date.slice(0, 4);
      if (ay !== by) return ay < by ? -1 : 1;
      const aw = isExamWindow(a) ? 1 : 0, bw = isExamWindow(b) ? 1 : 0;
      if (aw !== bw) return aw - bw;
      return a.date.localeCompare(b.date);
    })
    .slice(0, limit)
    .map((ev) => {
      const dl = examDateLines(ev);
      const cd = examCountdown(ev, today);
      return {
        examId: ev.examId,
        name: ev.name,
        type: ev.type,
        typeName: ev.typeName || "考试",
        category: ev.category || "考试",
        date: ev.date,
        endDate: ev.endDate || ev.date,
        dateTop: dl.top,
        dateBottom: dl.bottom,
        metaText: examMetaText(ev),
        confirmed: !!ev.confirmed,
        statusText: ev.confirmed ? "官方已确认" : "规则推算",
        url: ev.url || "",
        startTime: ev.startTime || "",
        endTime: ev.endTime || "",
        countdown: cd.text,
        tone: cd.tone,
        hot: cd.tone === "urgent" || cd.tone === "live",
        linkLabel: isExamWindow(ev) ? "复制报名网址" : "复制官方链接",
        key: [ev.examId, ev.type, ev.date].join("|"),
      };
    });
}
/* 已结束的场次：小程序端默认折叠，按年倒序分组 */
function pastExamGroups(today, examFilter) {
  today = today || store.todayStr();
  examFilter = examFilter || "all";
  const list = (examData.events || [])
    .filter((ev) => ev && (ev.endDate || ev.date) < today && eventBelongsToExam(ev, examFilter))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((ev) => ({
      key: [ev.examId, ev.type, ev.date].join("|"),
      examId: ev.examId,
      name: ev.name,
      type: ev.type,
      typeName: ev.typeName || "考试",
      date: ev.date,
      year: String(ev.date).slice(0, 4),
      dateText: ev.date + ((ev.endDate && ev.endDate !== ev.date) ? " ~ " + String(ev.endDate).slice(5) : ""),
      nameText: ev.name + ((ev.type !== "written" && ev.typeName) ? " · " + ev.typeName : ""),
      url: ev.url || "",
    }));
  const groups = [];
  list.forEach((x) => {
    let g = groups[groups.length - 1];
    if (!g || g.year !== x.year) { g = { year: x.year, count: 0, items: [] }; groups.push(g); }
    g.items.push(x);
    g.count += 1;
  });
  return { total: list.length, groups };
}
function examFlow(today, examFilter) {
  today = today || store.todayStr();
  examFilter = examFilter || "all";
  const option = EXAM_FILTERS.find((x) => x.id === examFilter) || EXAM_FILTERS[0];
  if (examFilter === "all") return { id: "all", label: option.label, registrations: [], registrationText: "", signupNotice: "", signupUrl: "", signupAction: "" };
  const regs = (examData.events || [])
    .filter((ev) => ev && eventBelongsToExam(ev, examFilter) && (ev.type === "registration" || ev.type === "pre-registration") && (ev.endDate || ev.date) >= today)
    .sort((a,b) => a.date.localeCompare(b.date));
  const registrationText = regs.length
    ? "已收录报名时间：" + regs.map((r) => (r.type === "pre-registration" ? "预报名 " : "报名 ") + r.date + (r.endDate && r.endDate !== r.date ? " ～ " + r.endDate : "") + (r.confirmed ? "（官方）" : "（预计）")).join("；")
    : "报名时间：当前离线数据尚未收录可用的全国统一报名起止时间，请以考试官网及所在学校/考点通知为准。";
  const guide = SIGNUP_GUIDES[examFilter] || null;
  return {
    id: examFilter,
    label: option.label,
    registrations: regs,
    registrationText,
    signupNotice: guide ? guide.signupNotice : "",
    signupUrl: guide ? guide.signupUrl : "",
    signupAction: guide ? guide.signupAction : "",
  };
}

/* ════ 轮换值日（dorm-duty）════
   与桌面端 public/plugins/dorm-duty/main.js **同源的轮换数学**：用「起始日 + 周期」切段，一段一人。
   为什么不是「每天算一个人」：每周轮换时整周都该是同一个人，否则会天天催人。

   一个插件里可以放**多套轮换**（宿舍值日 / 公区卫生…），每套各有成员、周期、起始日、换人记录
   与提醒设置，互不影响。存储结构（与桌面端逐字一致，备份可跨端恢复）：
     groups   : [{ id, name, startDate, periodDays, remindEnabled, remindTime, sound,
                   members, removed, overrides, lastNotified }]
     activeId : 界面当前选中的那一套
   旧版（单套轮换）把数据平铺在 members / config / overrides / removed / lastNotified 上，
   `ddMigrateLegacy()` 会把它迁成一组。**旧键留着不删**：删了就没法回退到旧版本。

   这里只放纯函数，**一律接收显式数据**（不在函数内部读 store），这样 Node 下能直接真跑边界；
   `dormDutySummary()` 是唯一读 store 的入口，页面用它取视图模型。 */
const DD_NAME_DEFAULT = "值日";
const DD_GROUP_MAX = 12;    // 最多几套轮换（防病态数据把界面撑爆）
const DD_PERIODS = [
  { days: 1, label: "每天" },
  { days: 3, label: "每 3 天" },
  { days: 7, label: "每周" },
  { days: 14, label: "每两周" },
];
const DD_UPCOMING = 6;      // 后续轮次展示条数
const DD_REMOVED_KEEP = 12; // 「已移除」最多保留几个
const DD_NAME_MAX = 12;     // 轮换名（如「宿舍值日」/「公区卫生」）
const DD_MEMBER_MAX = 16;   // 成员名

function ddValidDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
/** 合法时刻 → "HH:MM"；非法返回 null。
    只校验 /^\d{2}:\d{2}$/ 是不够的："25:99" 能过格式校验，换算成分钟是 1599，
    超过一天的最大值 1439 —— 于是「还没到点」永远成立，提醒被**静默关掉**（不报错不提示）。
    时 0–23、分 0–59 必须真校验。桌面端踩过这个坑，这里同一套规则。 */
function ddNormalizeTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? "" : v).trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (!(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59)) return null;
  return pad2(h) + ":" + pad2(mi);
}
function ddPeriodLabel(days) {
  const hit = DD_PERIODS.filter((p) => p.days === days)[0];
  return hit ? hit.label : "每 " + days + " 天";
}
function ddDefaultConfig(today) {
  return { dutyName: DD_NAME_DEFAULT, startDate: today, periodDays: 7, remindEnabled: true, remindTime: "08:00", sound: "beep" };
}
/** 旧版「配置」的归一化。现在只在**迁移**时用到（新结构把字段平铺在组上）。
    配置损坏不能把插件变成白屏，一律退回可用默认值；未识别的键（如桌面端的 sound）原样保留。
    只接受**普通对象**：字符串 / 数组也能被 Object.assign 展开成 {"0":…,"1":…} 这种垃圾键，
    会被原样写回 storage 跟着备份走。 */
function ddNormalizeConfig(raw, today) {
  const base = ddDefaultConfig(today);
  const usable = raw && typeof raw === "object" && !Array.isArray(raw);
  const c = Object.assign({}, base, usable ? raw : {});
  c.dutyName = String(c.dutyName || "").trim().slice(0, DD_NAME_MAX) || DD_NAME_DEFAULT;
  if (!ddValidDate(c.startDate)) c.startDate = base.startDate;
  c.periodDays = Math.min(365, Math.max(1, Math.round(Number(c.periodDays) || 7)));
  c.remindTime = ddNormalizeTime(c.remindTime) || "08:00";
  c.remindEnabled = c.remindEnabled !== false;
  c.sound = String(c.sound || "beep");
  return c;
}
function ddMembers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((m) => m && m.id)
    .map((m) => ({ id: String(m.id), name: String(m.name || "").slice(0, DD_MEMBER_MAX).trim() || "未命名" }));
}
function ddUid(prefix) { return (prefix || "m") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ── 轮换组的归一化 / 迁移 ── */
/** 一套轮换的默认值。 */
function ddDefaultGroup(today, name) {
  return {
    id: ddUid("g"),
    name: String(name || "").trim().slice(0, DD_NAME_MAX) || DD_NAME_DEFAULT,
    startDate: ddValidDate(today) ? today : store.todayStr(),
    periodDays: 7,
    remindEnabled: true,
    remindTime: "08:00",
    sound: "beep",
    members: [], removed: [], overrides: {}, lastNotified: "",
  };
}
/** 归一化一组。未识别的键原样保留 —— 别端（桌面）字段不能被抹掉。 */
function ddNormalizeGroup(raw, today) {
  const base = ddDefaultGroup(today, null);
  const usable = raw && typeof raw === "object" && !Array.isArray(raw);
  const g = Object.assign({}, base, usable ? raw : {});
  g.id = String(g.id || "").trim() || base.id;
  g.name = String(g.name || "").trim().slice(0, DD_NAME_MAX) || DD_NAME_DEFAULT;
  if (!ddValidDate(g.startDate)) g.startDate = base.startDate;
  g.periodDays = Math.min(365, Math.max(1, Math.round(Number(g.periodDays) || 7)));
  g.remindTime = ddNormalizeTime(g.remindTime) || "08:00";
  g.remindEnabled = g.remindEnabled !== false;
  g.sound = String(g.sound || "beep");
  g.members = ddMembers(g.members);
  g.removed = ddMembers(g.removed).slice(0, DD_REMOVED_KEEP);
  g.overrides = g.overrides && typeof g.overrides === "object" && !Array.isArray(g.overrides)
    ? Object.assign({}, g.overrides) : {};
  g.lastNotified = String(g.lastNotified || "");
  return g;
}
/** 归一化整份组列表。重复 id 会让「切换轮换」指错对象，必须剔掉。 */
function ddGroups(raw, today) {
  const out = [];
  const seen = {};
  const list = Array.isArray(raw) ? raw : [];
  for (let i = 0; i < list.length && out.length < DD_GROUP_MAX; i++) {
    const g = ddNormalizeGroup(list[i], today);
    if (seen[g.id]) continue;
    seen[g.id] = 1;
    out.push(g);
  }
  return out;
}
/** 旧版单套轮换 → 一组。没有任何旧数据时返回空数组（由调用方决定要不要建默认组）。 */
function ddMigrateLegacy(legacy, today) {
  const L = legacy && typeof legacy === "object" ? legacy : {};
  const hasAny = (Array.isArray(L.members) && L.members.length > 0)
    || !!L.config
    || !!L.lastNotified
    || (L.overrides && typeof L.overrides === "object" && Object.keys(L.overrides).length > 0);
  if (!hasAny) return [];
  const cfg = ddNormalizeConfig(L.config, today);
  return [ddNormalizeGroup({
    name: cfg.dutyName,
    startDate: cfg.startDate,
    periodDays: cfg.periodDays,
    remindEnabled: cfg.remindEnabled,
    remindTime: cfg.remindTime,
    sound: cfg.sound,
    members: L.members,
    removed: L.removed,
    overrides: L.overrides,
    lastNotified: L.lastNotified,
  }, today)];
}
/** 当前该显示哪一组：存的 activeId 有效就用它，否则退回第一组；没有组时返回 ""。 */
function ddActiveId(groups, activeId) {
  const list = groups || [];
  if (!list.length) return "";
  return list.some((g) => g.id === activeId) ? String(activeId) : list[0].id;
}

/* ── 轮换数学（纯函数，只吃传入的那一组） ── */
const ddPeriod = (g) => Math.max(1, Math.round(Number(g && g.periodDays) || 1));
/** 某天落在哪一轮：返回该轮起始日；起始日之前返回 null（轮换还没开始）。 */
function ddCycleStartOf(g, date) {
  const start = g && g.startDate;
  if (!ddValidDate(start) || !ddValidDate(date)) return null;
  const diff = dayDiff(start, date);
  if (diff < 0) return null;
  return store.addDays(start, Math.floor(diff / ddPeriod(g)) * ddPeriod(g));
}
const ddCycleIndexAt = (g, cycleStart) => Math.round(dayDiff(g.startDate, cycleStart) / ddPeriod(g));
const ddIsCycleStartDay = (g, date) => ddCycleStartOf(g, date) === date;
/** 某一轮「正常轮换」该谁（不看临时换人）。 */
function ddNormalFor(g, cycleStart) {
  if (!cycleStart || !g.members.length) return null;
  return g.members[ddCycleIndexAt(g, cycleStart) % g.members.length];
}
/** 某一轮的换人是否**真的生效**：override 指向的人必须还在名单里。
    指向已被移除的人时不算换人 —— 否则界面会显示「已换人 · 原 X」而实际当班的就是 X。 */
function ddOverrideHit(g, cycleStart) {
  const id = cycleStart ? (g.overrides || {})[cycleStart] : "";
  if (!id) return null;
  return g.members.filter((m) => m.id === id)[0] || null;
}
/** 某天的当班人：没成员 / 没开始 → null；有临时换人 → 换的人。 */
function ddAssigneeFor(g, date) {
  const cycle = ddCycleStartOf(g, date);
  if (!cycle || !g.members.length) return null;
  return ddOverrideHit(g, cycle) || ddNormalFor(g, cycle);
}

/* ── 组的增删改（不可变：一组进、一组出；页面只负责把结果写回 storage） ── */
/** 把某一组替换成 fn 处理后的新组。 */
function ddWithGroup(groups, id, fn) {
  return (groups || []).map((g) => (g.id === id ? fn(g) : g));
}
function ddGroupPatch(g, patch) {
  return Object.assign({}, g, patch || {});
}
function ddGroupAddMember(g, name) {
  const n = String(name || "").trim().slice(0, DD_MEMBER_MAX);
  if (!n) return g;
  return Object.assign({}, g, { members: (g.members || []).concat([{ id: ddUid("m"), name: n }]) });
}
function ddGroupRenameMember(g, id, name) {
  const n = String(name || "").trim().slice(0, DD_MEMBER_MAX);
  if (!n) return g;
  return Object.assign({}, g, { members: (g.members || []).map((m) => (m.id === id ? { id: m.id, name: n } : m)) });
}
function ddGroupMoveMember(g, id, delta) {
  const members = g.members || [];
  const i = members.map((m) => m.id).indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= members.length) return g;
  const next = members.slice();
  const tmp = next[i]; next[i] = next[j]; next[j] = tmp;
  return Object.assign({}, g, { members: next });
}
/** 移除成员：进「已移除」可恢复，并把指向他的临时换人一并清掉（否则会留一条永远命中不了的 override）。 */
function ddGroupRemoveMember(g, id) {
  const hit = (g.members || []).filter((m) => m.id === id)[0];
  if (!hit) return g;
  const ov = {};
  Object.keys(g.overrides || {}).forEach((k) => { if (g.overrides[k] !== id) ov[k] = g.overrides[k]; });
  return Object.assign({}, g, {
    members: g.members.filter((m) => m.id !== id),
    removed: [{ id: hit.id, name: hit.name }].concat(g.removed || []).slice(0, DD_REMOVED_KEEP),
    overrides: ov,
  });
}
function ddGroupRestoreMember(g, id) {
  const hit = (g.removed || []).filter((m) => m.id === id)[0];
  if (!hit) return g;
  return Object.assign({}, g, {
    members: (g.members || []).concat([{ id: hit.id, name: hit.name }]),
    removed: (g.removed || []).filter((m) => m.id !== id),
  });
}
/** 记 / 撤临时换人。memberId 传空 = 撤销这一轮的换人。 */
function ddGroupSetOverride(g, cycle, memberId) {
  const next = Object.assign({}, g.overrides || {});
  if (memberId) next[cycle] = memberId; else delete next[cycle];
  return Object.assign({}, g, { overrides: next });
}
/** 新建一套轮换（返回新组，由调用方 concat 进列表并切过去）。到上限返回 null。 */
function ddAddGroup(groups, today, name) {
  if ((groups || []).length >= DD_GROUP_MAX) return null;
  return ddDefaultGroup(today, name);
}
/** 删除一套轮换。**最后一套不许删** —— 删光界面就没有可编辑的对象了。
    返回 { ok, groups, activeId }：删掉的正是当前组时，activeId 落到邻居。 */
function ddRemoveGroup(groups, id, activeId) {
  const list = groups || [];
  if (list.length <= 1) return { ok: false, groups: list, activeId: activeId };
  const idx = list.map((g) => g.id).indexOf(id);
  if (idx < 0) return { ok: false, groups: list, activeId: activeId };
  const next = list.slice(0, idx).concat(list.slice(idx + 1));
  const nextActive = activeId === id ? next[Math.min(idx, next.length - 1)].id : activeId;
  return { ok: true, groups: next, activeId: nextActive };
}

/* ── 视图模型（纯函数，页面与测试共用） ── */
const ddRelLabel = (n) => (n === 0 ? "今天" : n === 1 ? "明天" : n > 0 ? n + " 天后" : -n + " 天前");
const ddRangeText = (start, end) => (start === end ? start : start + " → " + end);
const ddMonthDay = (s) => Number(s.slice(5, 7)) + "月" + Number(s.slice(8, 10)) + "日";

function ddSnapshot(today, group) {
  today = today || store.todayStr();
  const g = ddNormalizeGroup(group, today);
  const period = ddPeriod(g);
  const cycle = ddCycleStartOf(g, today);
  const started = !!cycle;
  const current = ddAssigneeFor(g, today);
  const nextStart = cycle ? store.addDays(cycle, period) : (ddValidDate(g.startDate) ? g.startDate : null);

  const rows = [];
  for (let i = 0; i < DD_UPCOMING && nextStart; i++) {
    const start = store.addDays(nextStart, i * period);
    const who = ddAssigneeFor(g, start);
    rows.push({
      start,
      end: store.addDays(start, period - 1),
      // 周几要标出来，但别重复：单日轮次写成「9月18日（周五）」，
      // 多日轮次写成「9月14日 → 9月20日 · 周五起」。与桌面端文案一致。
      range: period > 1
        ? ddRangeText(ddMonthDay(start), ddMonthDay(store.addDays(start, period - 1))) + " · " + weekday(start) + "起"
        : ddMonthDay(start) + "（" + weekday(start) + "）",
      whoId: who ? who.id : "",
      whoName: who ? who.name : "—",
      index: ddCycleIndexAt(g, start) + 1,
      daysUntil: dayDiff(today, start),
      daysText: ddRelLabel(dayDiff(today, start)),
      swapped: !!ddOverrideHit(g, start),
    });
  }
  const nextWho = nextStart ? ddAssigneeFor(g, nextStart) : null;
  const nextDiff = nextStart ? dayDiff(today, nextStart) : 0;
  // 本轮换人是否真的生效（override 指向的人还在名单里才算）
  const swapHit = cycle ? ddOverrideHit(g, cycle) : null;
  const normalWho = cycle ? ddNormalFor(g, cycle) : null;

  return {
    today,
    todayText: weekday(today),
    groupId: g.id,
    groupName: g.name,
    cfg: {
      name: g.name, startDate: g.startDate, periodDays: g.periodDays,
      remindTime: g.remindTime, remindEnabled: g.remindEnabled, sound: g.sound,
    },
    periodLabel: ddPeriodLabel(period),
    periods: DD_PERIODS.map((p) => ({ days: p.days, label: p.label, on: p.days === period })),
    hasMembers: g.members.length > 0,
    empty: g.members.length === 0,
    started,
    cycle: cycle || "",
    cycleIndex: cycle ? ddCycleIndexAt(g, cycle) + 1 : 0,
    cycleText: cycle
      ? (period > 1
        ? ddMonthDay(cycle) + " — " + ddMonthDay(store.addDays(cycle, period - 1)) + " · " + weekday(cycle) + " 起"
        : ddMonthDay(cycle) + "（" + weekday(cycle) + "）")
      : "还没开始",
    current: current ? { id: current.id, name: current.name } : null,
    swapped: !!swapHit,
    /** 被换掉的那个人（正常轮换本该当班的人），用来在界面上说明「原本是谁」。 */
    swapName: swapHit && normalWho ? normalWho.name : "",
    nextStart: nextStart || "",
    nextStartText: nextStart ? ddMonthDay(nextStart) + " " + weekday(nextStart) : "",
    nextWhoName: nextWho ? nextWho.name : "—",
    nextBigEm: nextDiff <= 0 ? "今天" : nextDiff === 1 ? "明天" : String(nextDiff),
    nextBigUnit: nextDiff <= 0 ? "" : nextDiff === 1 ? "" : " 天后",
    nextVerb: started ? "换人" : "开始",
    rows,
    members: g.members.map((m, i) => ({
      id: m.id, name: m.name, no: i + 1,
      isCurrent: !!(current && current.id === m.id),
      canUp: i > 0, canDown: i < g.members.length - 1,
    })),
    removed: g.removed,
    lastNotified: g.lastNotified,
  };
}

/** 整份视图模型：当前组的完整快照（字段与旧版一致，页面直接 dd.xxx 用）+ 顶部的轮换标签条。 */
function ddSummaryFrom(groups, activeId, today) {
  const list = groups || [];
  const active = list.filter((g) => g.id === activeId)[0] || list[0] || null;
  const snap = ddSnapshot(today, active);
  snap.groups = list.map((g) => {
    const who = ddAssigneeFor(g, today);
    return { id: g.id, name: g.name, who: who ? who.name : "", on: !!active && g.id === active.id };
  });
  snap.activeId = active ? active.id : "";
  snap.groupCount = list.length;
  snap.canAddGroup = list.length < DD_GROUP_MAX;
  snap.canDelGroup = list.length > 1;
  return snap;
}

/** 页面入口：读 store → 视图模型。
    ⚠️ 它有**写**副作用：旧数据迁移、以及「一组都没有」的兜底建组都要立刻落盘 ——
    不写的话「已迁移」和「未迁移」在存储上分不出来，每次进页面都会重新生成一个随机 id 的
    默认组，用户刚做的设置下一次就没了。 */
function dormDutySummary(today) {
  today = today || store.todayStr();
  const raw = store.pluginStorageGet("dorm-duty", "groups", null);
  let groups = ddGroups(raw, today);
  let needPersist = false;
  // 只有「新版数据完全不存在」时才看旧键：groups 一旦存在就说明已经迁移过，
  // 不能再被旧快照（旧版本客户端写的）盖回去。
  if (!raw) {
    const migrated = ddMigrateLegacy({
      members: store.pluginStorageGet("dorm-duty", "members", []),
      config: store.pluginStorageGet("dorm-duty", "config", null),
      overrides: store.pluginStorageGet("dorm-duty", "overrides", {}),
      removed: store.pluginStorageGet("dorm-duty", "removed", []),
      lastNotified: store.pluginStorageGet("dorm-duty", "lastNotified", ""),
    }, today);
    if (migrated.length) { groups = migrated; needPersist = true; }
  }
  if (!groups.length) { groups = [ddDefaultGroup(today, null)]; needPersist = true; }
  const storedActive = store.pluginStorageGet("dorm-duty", "activeId", "");
  const activeId = ddActiveId(groups, storedActive);
  // activeId 变了（首次落盘 / 存的指针失效）也要写回 —— 让存储里的指针**始终有效**，
  // 而不是每次进页面都靠兜底。落盘的 groups 与 activeId 必须是一对，否则指针会指空。
  if (needPersist || activeId !== storedActive) {
    store.pluginStorageSet("dorm-duty", "groups", groups);
    store.pluginStorageSet("dorm-duty", "activeId", activeId);
  }
  return ddSummaryFrom(groups, activeId, today);
}

/** 某一组到点提醒的判据（纯函数）。
    小程序**没有后台常驻**，宿主也不给定时回调 —— 这里只能做「打开页面时补提醒」：
    在每轮第一天、且已过设定时刻、且当天没提醒过 → 值得弹一次。 */
function ddReminderDue(group, today, nowMinutes) {
  const g = ddNormalizeGroup(group, today);
  if (!g.remindEnabled || !g.members.length) return null;
  if (!ddIsCycleStartDay(g, today)) return null;          // 只在每轮第一天提醒，否则天天催
  if (g.lastNotified === today) return null;              // 这一轮已经提醒过
  const parts = String(g.remindTime).split(":").map(Number);
  const now = Number.isFinite(nowMinutes) ? nowMinutes : (function () {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();
  if (now < parts[0] * 60 + parts[1]) return null;        // 还没到点
  const who = ddAssigneeFor(g, today);
  if (!who) return null;
  return { groupId: g.id, groupName: g.name, whoId: who.id, whoName: who.name, time: g.remindTime };
}
/** 所有到点的组（多套轮换各有各的时刻与去重，互不影响）。 */
function ddDueReminders(groups, today, nowMinutes) {
  return (groups || []).map((g) => ddReminderDue(g, today, nowMinutes)).filter(Boolean);
}
/** 把这几组标成「今天已提醒」。返回新的 groups（页面写回 storage）。 */
function ddMarkNotified(groups, ids, today) {
  const set = {};
  (ids || []).forEach((id) => { set[id] = 1; });
  return (groups || []).map((g) => (set[g.id] ? Object.assign({}, g, { lastNotified: today }) : g));
}

module.exports = {
  weeklyReport, holidaySummary, futureExams, pastExamGroups, examFlow, EXAM_FILTERS, durationLabel, dayDiff,
  dormDutySummary, ddSummaryFrom, ddSnapshot, ddReminderDue, ddDueReminders, ddMarkNotified, ddPeriodLabel,
  ddDefaultConfig, ddNormalizeConfig, ddNormalizeTime, ddMembers, ddPeriod,
  ddDefaultGroup, ddNormalizeGroup, ddGroups, ddMigrateLegacy, ddActiveId,
  ddCycleStartOf, ddCycleIndexAt, ddIsCycleStartDay, ddAssigneeFor, ddNormalFor, ddOverrideHit,
  ddWithGroup, ddGroupPatch, ddGroupAddMember, ddGroupRenameMember, ddGroupMoveMember,
  ddGroupRemoveMember, ddGroupRestoreMember, ddGroupSetOverride, ddAddGroup, ddRemoveGroup,
  DD_PERIODS, DD_UPCOMING, DD_REMOVED_KEEP, DD_GROUP_MAX, DD_NAME_MAX,
};
