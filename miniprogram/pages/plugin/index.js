const store = require("../../core/store.js");
const catalog = require("../../core/pluginCatalog.js");
const runtime = require("../../core/pluginRuntime.js");
const timeParser = require("../../core/timeParser.js");

const POMO_MODES = [
  { id: "focus", label: "专注 25", min: 25 },
  { id: "short", label: "短休 5", min: 5 },
  { id: "long", label: "长休 15", min: 15 },
];

function pad2(n) { return n < 10 ? "0" + n : String(n); }
function secText(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60);
}
function normalizeTime(s) {
  const m = String(s || "").match(/^(\d{1,2}):(\d{2})$/);
  return m ? pad2(+m[1]) + ":" + m[2] : "09:00";
}

/* 番茄自定义时长：以「秒」为唯一事实源（storage 键 customSec），分 / 秒两个输入框只是它的两种视图。 */
const CUSTOM_MAX_SEC = 240 * 60;
function clampCustomSec(min, sec) {
  const total = Math.round((Number(min) || 0) * 60 + (Number(sec) || 0));
  return Math.max(1, Math.min(CUSTOM_MAX_SEC, total));
}
/** 老数据只存了 customMin（分钟，可能是 1.5 这种小数），读不到 customSec 时按分钟换算。 */
function readCustomSec() {
  const savedSec = store.pluginStorageGet("pomodoro", "customSec", null);
  if (savedSec !== null && savedSec !== undefined && Number.isFinite(Number(savedSec))) {
    return Math.max(1, Math.min(CUSTOM_MAX_SEC, Math.round(Number(savedSec))));
  }
  return clampCustomSec(Number(store.pluginStorageGet("pomodoro", "customMin", 25)) || 25, 0);
}

Page({
  data: {
    id: "",
    plugin: null,
    pomodoro: null,
    weekly: null,
    holiday: null,
    exams: [],
    examFilters: runtime.EXAM_FILTERS || [],
    examFilterIndex: 0,
    examFlow: null,
    examTotal: 0,
    examVisible: 0,
    examQuery: "",
    examConfirmedOnly: false,
    examPast: [],
    examPastTotal: 0,
    examPastOpen: false,
  },

  onLoad(options) {
    const id = decodeURIComponent((options && options.id) || "");
    const plugin = catalog.byId[id];
    if (!plugin || !plugin.platforms || plugin.platforms.miniprogram !== "native") {
      wx.showToast({ title: "这个插件没有小程序适配", icon: "none" });
      setTimeout(() => wx.navigateBack(), 300);
      return;
    }
    if (!store.isPluginEnabled(id)) {
      wx.showToast({ title: "插件已停用", icon: "none" });
      setTimeout(() => wx.navigateBack(), 300);
      return;
    }
    this.setData({ id, plugin: { ...plugin, iconPath: `/images/plugins/${plugin.id}.png` } });
    wx.setNavigationBarTitle({ title: plugin.name });
    this.initPlugin(id);
  },

  onShow() {
    if (this.data.id === "weekly-report") this.loadWeekly();
    if (this.data.id === "pomodoro" && this._pomoReady) this.restorePomodoro();
  },

  onHide() { this.stopTickOnly(); },
  onUnload() { this.stopTickOnly(); },

  initPlugin(id) {
    if (id === "pomodoro") this.loadPomodoro();
    else if (id === "weekly-report") this.loadWeekly();
    else if (id === "cn-holiday") this.loadHoliday();
    else if (id === "exam-calendar") this.loadExams();
  },

  /* ── 番茄专注 ── */
  loadPomodoro() {
    const tasks = [{ id: "", title: "（不关联任务）" }].concat(
      (store.getState().tasks || []).filter((t) => !t.done).map((t) => ({ id: t.id, title: t.title }))
    );
    const rt = store.pluginStorageGet("pomodoro", "timerRuntimeMini", null) || {};
    const customSec = readCustomSec();
    this._customSec = customSec;
    const modes = POMO_MODES.concat([{ id: "custom", label: "自定义", min: customSec / 60 }]);
    const mode = modes.find((m) => m.id === rt.modeId) || POMO_MODES[0];
    const taskIndex = Math.max(0, tasks.findIndex((t) => t.id === (rt.taskId || "")));
    const left = Number.isFinite(Number(rt.left)) ? Number(rt.left) : mode.min * 60;
    this._pomo = { mode, left, running: !!rt.running, endAt: Number(rt.endAt) || 0, taskId: tasks[taskIndex].id };
    this._pomoReady = true;
    this.setData({
      pomodoro: {
        modes: modes.map((m) => ({ id: m.id, label: m.label, active: m.id === mode.id })),
        customMinPart: Math.floor(customSec / 60), customSecPart: customSec % 60,
        newTaskTitle: "",
        timeText: secText(left),
        running: !!rt.running,
        tasks,
        taskIndex,
        doneCount: Number(store.pluginStorageGet("pomodoro", "doneCount", 0)) || 0,
        focusMin: Number(store.pluginStorageGet("pomodoro", "focusMin", 0)) || 0,
      },
    });
    this.restorePomodoro();
  },

  restorePomodoro() {
    if (!this._pomo) return;
    const rt = store.pluginStorageGet("pomodoro", "timerRuntimeMini", null) || {};
    if (rt.modeId) {
      const customSec = readCustomSec();
      this._customSec = customSec;
      const mode = POMO_MODES.concat([{ id: "custom", label: "自定义", min: customSec / 60 }]).find((m) => m.id === rt.modeId) || this._pomo.mode;
      this._pomo.mode = mode;
      this._pomo.taskId = rt.taskId || "";
      this._pomo.running = !!rt.running;
      this._pomo.endAt = Number(rt.endAt) || 0;
      this._pomo.left = Number(rt.left) || mode.min * 60;
    }
    if (this._pomo.running) {
      this._pomo.left = Math.max(0, Math.ceil((this._pomo.endAt - Date.now()) / 1000));
      if (this._pomo.left <= 0) {
        this.finishPomodoro();
        return;
      }
      this.startTickOnly();
    }
    this.paintPomodoro();
  },

  persistPomodoro() {
    if (!this._pomo) return;
    store.pluginStorageSet("pomodoro", "timerRuntimeMini", {
      modeId: this._pomo.mode.id,
      left: this._pomo.left,
      running: this._pomo.running,
      endAt: this._pomo.endAt,
      taskId: this._pomo.taskId || "",
    });
  },

  paintPomodoro() {
    if (!this._pomo || !this.data.pomodoro) return;
    this.setData({
      "pomodoro.timeText": secText(this._pomo.left),
      "pomodoro.running": this._pomo.running,
      "pomodoro.modes": POMO_MODES.concat([{ id: "custom", label: "自定义", min: (this._customSec || 1500) / 60 }]).map((m) => ({ id: m.id, label: m.label, active: m.id === this._pomo.mode.id })),
    });
  },

  startTickOnly() {
    this.stopTickOnly();
    if (!this._pomo || !this._pomo.running) return;
    this._tickTimer = setInterval(() => {
      if (!this._pomo || !this._pomo.running) return;
      this._pomo.left = Math.max(0, Math.ceil((this._pomo.endAt - Date.now()) / 1000));
      this.paintPomodoro();
      if (this._pomo.left <= 0) this.finishPomodoro();
    }, 1000);
  },

  stopTickOnly() {
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
  },

  onPomoMode(e) {
    const id = e.currentTarget.dataset.id;
    const mode = POMO_MODES.concat([{ id: "custom", label: "自定义", min: (this._customSec || 1500) / 60 }]).find((m) => m.id === id);
    if (!mode || !this._pomo) return;
    this.stopTickOnly();
    this._pomo.mode = mode;
    this._pomo.left = mode.min * 60;
    this._pomo.running = false;
    this._pomo.endAt = 0;
    this.persistPomodoro();
    this.paintPomodoro();
  },

  onPomoCustomMinInput(e) { this.setData({ "pomodoro.customMinPart": e.detail.value }); },
  onPomoCustomSecInput(e) { this.setData({ "pomodoro.customSecPart": e.detail.value }); },
  onPomoSetCustom() {
    if (!this._pomo) return;
    const sec = clampCustomSec(this.data.pomodoro.customMinPart, this.data.pomodoro.customSecPart);
    this._customSec = sec;
    store.pluginStorageSet("pomodoro", "customSec", sec);
    // 两个输入框回填归一化后的值：填 90 秒会被进位成 1 分 30 秒。
    this.setData({ "pomodoro.customMinPart": Math.floor(sec / 60), "pomodoro.customSecPart": sec % 60 });
    this.stopTickOnly(); this._pomo.mode = { id: "custom", label: "自定义", min: sec / 60 }; this._pomo.left = sec; this._pomo.running = false; this._pomo.endAt = 0;
    this.persistPomodoro(); this.paintPomodoro();
  },
  onPomoNewTaskInput(e) { this.setData({ "pomodoro.newTaskTitle": e.detail.value }); },
  onPomoAddTask() {
    const title = String(this.data.pomodoro.newTaskTitle || "").trim();
    if (!title) return wx.showToast({ title: "请先输入任务名称", icon: "none" });
    const task = store.addTask({ title, quad: 2, estMin: this._pomo.mode.min, tags: ["番茄专注"] });
    const tasks = [{ id: "", title: "（不关联任务）" }].concat((store.getState().tasks || []).filter(t => !t.done).map(t => ({ id:t.id, title:t.title })));
    const taskIndex = Math.max(0, tasks.findIndex(t => t.id === task.id)); this._pomo.taskId = task.id;
    this.setData({ "pomodoro.tasks": tasks, "pomodoro.taskIndex": taskIndex, "pomodoro.newTaskTitle": "" }); this.persistPomodoro();
    wx.showToast({ title: "任务已创建", icon: "success" });
  },

  onPomoTask(e) {
    if (!this._pomo || !this.data.pomodoro) return;
    const index = Number(e.detail.value) || 0;
    const task = this.data.pomodoro.tasks[index] || this.data.pomodoro.tasks[0];
    this._pomo.taskId = task.id;
    this.setData({ "pomodoro.taskIndex": index });
    this.persistPomodoro();
  },

  onPomoToggle() {
    if (!this._pomo) return;
    if (this._pomo.running) {
      this._pomo.left = Math.max(0, Math.ceil((this._pomo.endAt - Date.now()) / 1000));
      this._pomo.running = false;
      this._pomo.endAt = 0;
      this.stopTickOnly();
    } else {
      if (this._pomo.left <= 0) this._pomo.left = this._pomo.mode.min * 60;
      this._pomo.running = true;
      this._pomo.endAt = Date.now() + this._pomo.left * 1000;
      this.startTickOnly();
    }
    this.persistPomodoro();
    this.paintPomodoro();
  },

  onPomoReset() {
    if (!this._pomo) return;
    this.stopTickOnly();
    this._pomo.running = false;
    this._pomo.endAt = 0;
    this._pomo.left = this._pomo.mode.min * 60;
    this.persistPomodoro();
    this.paintPomodoro();
  },

  finishPomodoro() {
    if (!this._pomo) return;
    const focus = this._pomo.mode.id === "focus" || this._pomo.mode.id === "custom";
    this.stopTickOnly();
    this._pomo.left = 0;
    this._pomo.running = false;
    this._pomo.endAt = 0;
    this.persistPomodoro();
    if (focus) {
      const done = (Number(store.pluginStorageGet("pomodoro", "doneCount", 0)) || 0) + 1;
      // 自定义时长可能是 30 秒这种，累加会产生 0.30000000000000004，收敛到 1 位小数。
      const mins = Math.round(((Number(store.pluginStorageGet("pomodoro", "focusMin", 0)) || 0) + this._pomo.mode.min) * 10) / 10;
      store.pluginStorageSet("pomodoro", "doneCount", done);
      store.pluginStorageSet("pomodoro", "focusMin", mins);
      this.setData({ "pomodoro.doneCount": done, "pomodoro.focusMin": mins });
    }
    this.paintPomodoro();
    try { wx.vibrateShort({ type: "medium" }); } catch (e) { /* ignore */ }
    wx.showModal({ title: focus ? "完成 1 个番茄" : "休息结束", content: focus ? "专注记录已写入插件统计。" : "可以开始下一轮专注了。", showCancel: false });
  },

  /* ── 周度报告 ── */
  loadWeekly() { this.setData({ weekly: runtime.weeklyReport() }); },

  /* ── 中国节假日 ── */
  loadHoliday() { this.setData({ holiday: runtime.holidaySummary() }); },

  /* ── 考试日历 ── */
  loadExams() {
    const filters = runtime.EXAM_FILTERS || [];
    let filterIndex = Number(store.pluginStorageGet("exam-calendar", "filterIndex", 0)) || 0;
    if (filterIndex < 0 || filterIndex >= filters.length) filterIndex = 0;
    const filterId = filters[filterIndex] ? filters[filterIndex].id : "all";
    const today = store.todayStr();

    const all = runtime.futureExams(today, 60, filterId).map((x) =>
      Object.assign({}, x, { scheduled: this.isExamScheduled(x) })
    );
    this._examAll = all;
    this._examMap = {};
    all.forEach((x) => { this._examMap[x.key] = x; });

    const past = runtime.pastExamGroups(today, filterId);
    this.setData({
      examFilters: filters,
      examFilterIndex: filterIndex,
      examFlow: runtime.examFlow(today, filterId),
      examTotal: all.length,
      examPast: past.groups,
      examPastTotal: past.total,
      examConfirmedOnly: !!this._examConfirmedOnly,
      examPastOpen: !!this._examPastOpen,
    }, () => this.applyExamFilter());
  },

  isExamScheduled(ev) {
    const title = ev.name + "（" + ev.typeName + "）";
    return store.blocksOf(ev.date).some((b) => b.title === title);
  },

  /* 搜索与「只看官方」只切显隐、不重新拉数据，避免输入框失焦 */
  applyExamFilter() {
    const q = String(this._examQuery || "").trim().toLowerCase();
    const only = !!this._examConfirmedOnly;
    const all = this._examAll || [];
    const shown = all.filter((x) => {
      if (only && !x.confirmed) return false;
      if (q && (x.name + " " + x.category + " " + x.typeName).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    this.setData({ exams: shown, examVisible: shown.length, examQuery: this._examQuery || "" });
  },

  onExamSearch(e) {
    this._examQuery = (e.detail && e.detail.value) || "";
    this.applyExamFilter();
  },

  onToggleExamConfirmed() {
    this._examConfirmedOnly = !this._examConfirmedOnly;
    this.setData({ examConfirmedOnly: this._examConfirmedOnly }, () => this.applyExamFilter());
  },

  onToggleExamHistory() {
    this._examPastOpen = !this._examPastOpen;
    this.setData({ examPastOpen: this._examPastOpen });
  },

  onExamFilter(e) {
    const index = Number(e.detail.value) || 0;
    store.pluginStorageSet("exam-calendar", "filterIndex", index);
    this.loadExams();
  },

  onExamFullFlow(e) {
    const ev = this._examMap && this._examMap[e.currentTarget.dataset.key];
    if (!ev) return;
    let target = ev.examId;
    if (target === "cet-set4") target = "cet4";
    if (target === "cet-set6") target = "cet6";
    const filters = runtime.EXAM_FILTERS || [];
    const index = filters.findIndex((x) => x.id === target);
    if (index < 0) {
      wx.showToast({ title: "该项目暂不支持独立全流程筛选", icon: "none" });
      return;
    }
    // 再点一次同一个项目 → 回到全部考试
    const next = this.data.examFilterIndex === index ? 0 : index;
    store.pluginStorageSet("exam-calendar", "filterIndex", next);
    this.loadExams();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onOpenExamSignup() {
    const flow = this.data.examFlow;
    if (!flow || !flow.signupUrl) return;
    wx.setClipboardData({ data: flow.signupUrl, success: () => wx.showToast({ title: "报名网址已复制", icon: "none" }) });
  },

  examDays(ev) {
    const out = [];
    const n = runtime.dayDiff(ev.date, ev.endDate || ev.date);
    for (let i = 0; i <= n; i++) out.push(store.addDays(ev.date, i));
    return out;
  },

  /* 时长口径与桌面端一致：有起止时间就用实际时长，否则按类型给默认值 */
  examDuration(ev) {
    if (ev.startTime && ev.endTime) {
      const d = store.mmOf(normalizeTime(ev.endTime)) - store.mmOf(normalizeTime(ev.startTime));
      if (d > 0) return d;
    }
    return ev.type === "written" ? 150 : 60;
  },

  onAddExam(e) {
    const ev = this._examMap && this._examMap[e.currentTarget.dataset.key];
    if (!ev) return;
    const title = ev.name + "（" + ev.typeName + "）";
    // 跨日考试（NCRE 连考 3 天、教资 2 天）整个区间都要排上，只排第一天会让后续几天凭空消失
    const days = this.examDays(ev);
    if (days.some((d) => store.blocksOf(d).some((b) => b.title === title))) {
      wx.showToast({ title: "这场考试已经排进日程", icon: "none" });
      return;
    }
    const dur = this.examDuration(ev);
    const task = store.addTask({
      title,
      note: (ev.confirmed ? "官方公告已确认" : "规则推算，待官方公告确认") + (ev.url ? "\n" + ev.url : ""),
      quad: timeParser.guessQuad(ev.date),
      estMin: dur,
      tags: ["考试"],
      project: "考试日历",
      due: ev.endDate || ev.date,
    });
    const start = normalizeTime(ev.startTime || "09:00");
    days.forEach((d) => {
      store.addBlock({ date: d, start, durMin: dur, title, taskId: task.id, cat: "study" });
    });
    wx.showToast({ title: days.length > 1 ? "已排进连续 " + days.length + " 天" : "已排进日程", icon: "success" });
    this._examAll = (this._examAll || []).map((x) => (x.key === ev.key ? Object.assign({}, x, { scheduled: true }) : x));
    this._examMap[ev.key] = Object.assign({}, ev, { scheduled: true });
    this.applyExamFilter();
  },

  onCopyExamLink(e) {
    const ev = this._examMap && this._examMap[e.currentTarget.dataset.key];
    if (!ev || !ev.url) return;
    wx.setClipboardData({ data: ev.url });
  },
});
