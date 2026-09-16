// 时间块视图 —— 概念稿 04「潮汐」的小程序版
// 任务池（点击自动安排到第一个空闲位）+ 24h/07:00 起时间轴
// 时间块用 movable-view 原生手势上下拖动，15 分钟吸附；点空白处加空白块
const parser = require("../../core/timeParser.js");
const store = require("../../core/store.js");

const DAY_START = 7 * 60;   // 07:00
const DAY_END = 24 * 60;    // 24:00
const HOUR_PX = 54;         // 每小时像素高
const PX = HOUR_PX / 60;    // 每分钟像素
const TOP_PAD = 10;
const CANVAS_H = ((DAY_END - DAY_START) / 60) * HOUR_PX + TOP_PAD;

const TAG_CAT = {
  论文: "work", 工作: "work", 学习: "study", 读书: "study",
  运动: "sport", 健身: "sport", 跑步: "sport", 生活: "life", 休息: "rest",
};
const CAT_NAMES = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };

Page({
  data: {
    curDate: "",
    dateLabel: "",
    sumLabel: "",
    canvasH: CANVAS_H,
    hours: [],
    blocks: [],
    pool: [],
    daysBar: [],
    placing: null,
    dragId: "",
    emptyDay: false,
    nowLine: { show: false, top: 0, label: "" },
    hint: { show: false, top: 0, label: "" },
    meter: [],
    legend: [],
    rhythm: [],
    tomorrow: [],
    tomEmpty: true,
    totalLabel: "",
    awakeLabel: "",
    quick: "",
    viewMode: "day",
    viewMenuOpen: false,
    viewModeLabel: "日时间轴",
    // 说明文案与桌面端 VIEW_META 的第三列对齐（桌面菜单同样渲染 label + 说明）：
    // 7 个名字里「横向时间轴 / 卡片时间轴 / 年度甘特 / 阶段甘特」光看名字分不清。
    viewTabs: [
      { id: "day", label: "日时间轴", desc: "当前可拖拽编辑的日程" },
      { id: "wakeup", label: "课程表", desc: "按天看这一周的安排" },
      { id: "milestone", label: "里程碑", desc: "按日期排序的关键节点" },
      { id: "chronicle", label: "横向时间轴", desc: "高密度事件年表" },
      { id: "cards", label: "卡片时间轴", desc: "带说明与备注的卡片流" },
      { id: "gantt", label: "年度甘特", desc: "按项目 / 任务展示跨月计划" },
      { id: "swimlane", label: "阶段甘特", desc: "按分类查看本月时间占用" },
    ],
    visualEvents: [], visualGantt: [], visualSwim: [], wakeupDays: [], wakeupWeekLabel: "",
    // 折叠状态：key → 是否展开。key 形如 `2026-09-15`（课程表某天）/ `gm-9`（9 月）/ `sm-work`（分类）
    folds: {},
    ganttMonths: [], ganttYear: 0, swimCats: [], swimMonthLabel: "",
  },

  onLoad() {
    const saved = store.getState().settings.lastDate;
    const mode = store.getState().settings.timeViewModeMini || "day";
    this.setData({ curDate: saved || store.todayStr(), viewMode: mode, viewModeLabel: this.labelOf(mode) });
  },
  onShow() {
    // 捕获页「查看时间块」跳转：先定位到目标日期
    const app = getApp();
    if (app.globalData.pendingTimeblockDate) {
      this.setData({ curDate: app.globalData.pendingTimeblockDate });
      app.globalData.pendingTimeblockDate = null;
    }
    this._unsub = store.subscribe(() => this.refresh());
    this.refresh();
    this._timer = setInterval(() => this.refreshNowLine(), 30000);
  },
  onHide() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.data.placing) this.setData({ placing: null });
  },
  onUnload() { this.onHide(); },

  persistDate() {
    store.getState().settings.lastDate = this.data.curDate;
    store.saveNow();
  },

  /* ── 渲染 ── */
  refresh() {
    const curDate = this.data.curDate;
    const isToday = curDate === store.todayStr();

    // 时刻行
    const hours = [];
    for (let m = DAY_START; m <= DAY_END; m += 60) {
      hours.push({ label: store.hhmmOf(m), top: (m - DAY_START) * PX + TOP_PAD });
    }

    // 时间块
    const list = store.blocksOf(curDate).map((b) => {
      const h = Math.max(24, b.durMin * PX - 3);
      return {
        id: b.id,
        title: b.title,
        cat: b.cat,
        h,
        y: (store.mmOf(b.start) - DAY_START) * PX,
        tiny: b.durMin <= 25,
        showMeta: h > 44,
        timeLabel: b.start + " – " + store.hhmmOf(store.mmOf(b.start) + b.durMin),
        catLabel: CAT_NAMES[b.cat] || b.cat,
      };
    });

    // 任务池
    const pool = store.poolOf(curDate).map((t) => {
      const cat = TAG_CAT[(t.tags || [])[0] || ""] || "work";
      return {
        id: t.id,
        title: t.title,
        cat,
        catLabel: CAT_NAMES[cat] || cat,
        estLabel: store.durLabel(t.estMin),
        dueLabel: t.due ? "截止 " + t.due.slice(5) : "",
      };
    });

    // 「现在」红线
    const nowLine = this.calcNowLine();

    // 标题与合计
    const parts = curDate.split("-");
    const dateLabel = (+parts[1]) + "月" + (+parts[2]) + "日 · 周" + store.weekdayCN(curDate) + (isToday ? " · 今天" : "");
    const blocks = store.blocksOf(curDate);
    const total = blocks.reduce((a, b) => a + b.durMin, 0);
    const sumLabel = "已排 " + store.durLabel(total) + " · " + blocks.length + " 块";

    // 分类占比
    const byCat = {};
    for (const b of blocks) byCat[b.cat] = (byCat[b.cat] || 0) + b.durMin;
    const meter = Object.keys(byCat).map((c) => ({ cat: c, w: (byCat[c] / Math.max(total, 1)) * 100 }));
    const legend = Object.keys(byCat).map((c) => ({ cat: c, label: CAT_NAMES[c] + " " + store.durLabel(byCat[c]) }));

    // 近 7 天节奏
    const rhythm = [];
    for (let i = -6; i <= 0; i++) {
      const d = store.addDays(curDate, i);
      const v = store.blocksOf(d).reduce((a, b) => a + b.durMin, 0);
      rhythm.push({ i, h: Math.min(100, (v / 480) * 100), day: "周" + store.weekdayCN(d), today: i === 0 });
    }

    // 近 7 天日期条（当前日期往前 1 天到往后 5 天）
    const daysBar = [];
    for (let i = -1; i <= 5; i++) {
      const d = store.addDays(curDate, i);
      const dp = d.split("-");
      daysBar.push({
        date: d,
        md: (+dp[1]) + "/" + (+dp[2]),
        wk: d === store.todayStr() ? "今天" : (i === 0 ? "当前" : "周" + store.weekdayCN(d)),
        active: i === 0,
      });
    }

    // 明日预告
    const tom = store.blocksOf(store.addDays(curDate, 1)).slice(0, 4);
    const tomorrow = tom.map((b) => ({
      id: b.id,
      cat: b.cat,
      label: b.start + " " + b.title,
      dur: store.durLabel(b.durMin),
    }));

    const visual = this.buildVisualData(curDate);
    const wakeup = this.buildWakeupData(curDate);
    const gm = this.buildGanttMonths(curDate, visual.gantt);
    const sm = this.buildSwimCats(curDate, visual.swim);
    // 折叠默认值只在「该 key 从没被用户动过」时兜底 ——
    // 否则每次 refresh（订阅触发、定时器触发）都会把用户手动收起的分组又弹开。
    const folds = { ...this.data.folds };
    for (const d of wakeup.days) if (!(d.date in folds)) folds[d.date] = d.today;
    for (const m of gm.months) if (!("gm-" + m.m in folds)) folds["gm-" + m.m] = m.isNow;
    // 分类默认最多展开 2 个有内容的 —— 5 个全展开在手机上滚不到底，折叠失去意义。
    let openedCats = 0;
    for (const c of sm.cats) {
      if ("sm-" + c.cat in folds) { if (folds["sm-" + c.cat]) openedCats++; continue; }
      const open = c.bars.length > 0 && openedCats < 2;
      if (open) openedCats++;
      folds["sm-" + c.cat] = open;
    }
    this._wakeupDays = wakeup.days;
    this._ganttMonths = gm.months;
    this._swimCats = sm.cats;
    this.setData({
      hours, blocks: list, pool, nowLine,
      dateLabel, sumLabel,
      daysBar,
      emptyDay: list.length === 0,
      meter, legend, rhythm, tomorrow,
      tomEmpty: tomorrow.length === 0,
      totalLabel: store.durLabel(total),
      awakeLabel: store.durLabel(DAY_END - DAY_START),
      visualEvents: visual.events,
      visualGantt: visual.gantt,
      visualSwim: visual.swim,
      wakeupDays: wakeup.days, wakeupWeekLabel: wakeup.label,
      ganttMonths: gm.months, ganttYear: gm.year,
      swimCats: sm.cats, swimMonthLabel: sm.label,
      folds,
    });
  },


  onViewTap(e) {
    const mode = e.currentTarget.dataset.mode || "day";
    this.setData({ viewMode: mode, viewMenuOpen: false, viewModeLabel: this.labelOf(mode) });
    store.getState().settings.timeViewModeMini = mode;
    store.saveNow();
  },

  labelOf(id) {
    return (this.data.viewTabs.find((t) => t.id === id) || {}).label || "日时间轴";
  },

  onViewMenuToggle() {
    this.setData({ viewMenuOpen: !this.data.viewMenuOpen });
  },

  onViewMenuClose() {
    this.setData({ viewMenuOpen: false });
  },

  /* 通用折叠开关：课程表按天 / 年度甘特按月 / 阶段甘特按分类共用一份状态。
     用一个 `folds` 字典而不是给每个数组元素塞 `open` 字段 —— 后者要在
     refresh() 里重建数据时把展开状态再搬回去，容易在重建时被清空。 */
  onFoldTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    const folds = { ...this.data.folds, [key]: !this.data.folds[key] };
    this.setData({ folds });
    // 折叠状态影响的是「哪些条目要渲染成展开」，必须重算派生数据
    this.applyFolds();
  },

  /* 把 folds 落到各视图的派生数据上（WXML 里无法读字典的任意 key，只能先摊平）。 */
  applyFolds() {
    const f = this.data.folds;
    const patch = {};
    if (this._wakeupDays) {
      patch.wakeupDays = this._wakeupDays.map((d) => ({ ...d, open: !!f[d.date] }));
    }
    if (this._ganttMonths) {
      patch.ganttMonths = this._ganttMonths.map((m) => ({ ...m, open: !!f["gm-" + m.m] }));
    }
    if (this._swimCats) {
      patch.swimCats = this._swimCats.map((c) => ({ ...c, open: !!f["sm-" + c.cat] }));
    }
    if (Object.keys(patch).length) this.setData(patch);
  },

  buildWakeupData(anchorDate) {
    const d = new Date((anchorDate || store.todayStr()) + "T12:00:00");
    const wd = d.getDay() || 7;
    const monday = store.addDays(anchorDate || store.todayStr(), 1 - wd);
    const today = store.todayStr();
    const names = ["周一","周二","周三","周四","周五","周六","周日"];
    const days = [];
    for (let i=0;i<7;i++) {
      const date = store.addDays(monday,i), md = date.slice(5).replace("-","/");
      const raw = store.blocksOf(date);
      // 折叠视图是「按天看日程」，不是「按时间轴看课程格」——
      // 所以按开始时间排序后输出成行，不再算 top/height 像素。
      const list = raw.slice().sort((a,b)=>store.mmOf(a.start)-store.mmOf(b.start));
      const sum = list.reduce((acc,b)=>acc+(Number(b.durMin)||0),0);
      days.push({
        name: names[i], date, md, today: date === today,
        count: list.length,
        sumLabel: store.durLabel(sum),
        blocks: list.map((b) => {
          const dur = Number(b.durMin) || 30;
          return {
            id: b.id,
            title: b.title,
            cat: b.cat || "work",
            catLabel: CAT_NAMES[b.cat] || "安排",
            timeLabel: b.start + " – " + store.hhmmOf(store.mmOf(b.start) + dur),
            meta: (b.note || "").trim(),
          };
        }),
      });
    }
    return { label: monday.slice(5).replace("-","/") + " ～ " + store.addDays(monday,6).slice(5).replace("-","/"), days, monday };
  },

  /* 年度甘特：只保留有任务的月份 + 当前月，空月份不占屏。
     12 个月全列出来时，8 个空月份的标题会把有内容的月份推出屏幕（桌面端同款问题，实测）。 */
  buildGanttMonths(anchorDate, gantt) {
    const year = +(anchorDate || store.todayStr()).slice(0, 4);
    const y0 = year + "-01-01";
    const toDay = (s) => Math.round((new Date(s + "T00:00:00") - new Date(y0 + "T00:00:00")) / 86400000);
    const nowY = +store.todayStr().slice(0, 4), nowM = +store.todayStr().slice(5, 7);
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const first = toDay(year + "-" + String(m).padStart(2,"0") + "-01");
      const dim = new Date(year, m, 0).getDate();
      const last = toDay(year + "-" + String(m).padStart(2,"0") + "-" + String(dim).padStart(2,"0"));
      const hit = gantt
        .filter((g) => g._a <= last && g._b >= first)
        .map((g) => ({ title: g.title, group: g.group, color: g.color, width: g.width, rangeLabel: g.rangeLabel }));
      if (hit.length || (year === nowY && m === nowM)) months.push({ m, hit, isNow: year === nowY && m === nowM });
    }
    return { months, year };
  },

  /* 阶段甘特：按分类折叠 + 占比条。分类内按日期排序，条宽表示这一天排了多久。 */
  buildSwimCats(anchorDate, swim) {
    const [yy, mm] = (anchorDate || store.todayStr()).split("-").map(Number);
    const catColors = { work:"#168f88", study:"#26b99a", sport:"#e28aa1", life:"#6b8be0", rest:"#5bbf8f" };
    const dim = new Date(yy, mm, 0).getDate();
    const raw = ["work", "study", "sport", "life", "rest"].map((cat) => {
      const src = (swim || []).find((s) => s.cat === cat) || { bars: [] };
      return { cat, src };
    });
    // 占比口径与桌面端一致：**该分类时长 / 当月总时长**（`sum/totalMin`）。
    // 不要拿条宽去反推 —— 条宽是「一根条占 31 格多少」，凑出来的百分数没有意义。
    const totalMin = raw.reduce((acc, { src }) => acc + (src.sumMin || 0), 0);
    const cats = raw.map(({ cat, src }) => {
      const bars = (src.bars || []).map((b) => {
        // 折叠列表要显示日期，从 left 反推日序号（left = (d-1)/days*100）
        const day = Math.round((b.left / 100) * dim) + 1;
        return { title: b.title, day, color: b.color, durMin: b.durMin || 30 };
      });
      bars.sort((a, b) => a.day - b.day);
      const sumMin = bars.reduce((acc, b) => acc + b.durMin, 0);
      const pct = totalMin ? Math.round((sumMin / totalMin) * 100) : 0;
      return { cat, label: CAT_NAMES[cat] || cat, bars, sumLabel: store.durLabel(sumMin), pct, color: catColors[cat] };
    });
    return { cats, label: yy + " 年 " + mm + " 月" };
  },

  buildVisualData(anchorDate) {
    const st = store.getState();
    const colors = ["#2397e5", "#62b2ea", "#7bc886", "#ffbb52", "#e86d70", "#ff3d35", "#9061bd", "#42b6a2"];
    const catNames = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };
    const events = [];
    (st.blocks || []).forEach((b) => events.push({ date: b.date, title: b.title, sub: b.start + " · " + store.durLabel(b.durMin), cat: b.cat || "work" }));
    (st.tasks || []).filter((t) => !t.done && t.due).forEach((t) => events.push({ date: t.due.slice(0, 10), title: t.title, sub: t.project || "任务截止", cat: "work" }));
    events.sort((a, b) => a.date.localeCompare(b.date));
    const ve = events.slice(0, 16).map((e, i) => ({ ...e, color: colors[i % colors.length], side: i % 2 ? "right" : "left", catLabel: catNames[e.cat] || "安排", year: e.date.slice(0,4), md: e.date.slice(5).replace("-", "/") }));

    const year = +(anchorDate || store.todayStr()).slice(0, 4);
    const y0 = year + "-01-01", y1 = year + "-12-31";
    const toDay = (s) => Math.round((new Date(s + "T00:00:00") - new Date(y0 + "T00:00:00")) / 86400000);
    const gantt = (st.tasks || []).filter((t) => !t.done).slice(0, 14).map((t, i) => {
      const due = (t.due || anchorDate || store.todayStr()).slice(0, 10);
      const created = new Date(Number(t.createdAt) || Date.now());
      let start = created.getFullYear() === year ? store.fmtDate(created) : y0;
      let end = due.slice(0,4) === String(year) ? due : y1;
      const a = Math.max(0, Math.min(364, toDay(start)));
      const b = Math.max(a, Math.min(364, toDay(end)));
      // `_a` / `_b` 是年内日序号（0~364），月份折叠时用它判断「这条和该月是否相交」。
      // 不叫 a/b 是为了避免和下面的 left/width 计算混在一起看错。
      return { title: t.title, group: t.project || ((t.tags || [])[0]) || "任务", left: a / 365 * 100, width: Math.max(2, (b - a + 1) / 365 * 100), color: colors[i % colors.length], _a: a, _b: b, rangeLabel: start.slice(5).replace("-","/") + " → " + end.slice(5).replace("-","/") };
    });

    const [yy, mm] = (anchorDate || store.todayStr()).split("-").map(Number);
    const days = new Date(yy, mm, 0).getDate();
    const swim = ["work", "study", "sport", "life", "rest"].map((cat, ci) => {
      const bars = (st.blocks || [])
        .filter((b) => b.cat === cat && b.date.slice(0,7) === String(yy) + "-" + String(mm).padStart(2,"0"))
        .map((b, i) => ({
          title: b.title,
          left: (+b.date.slice(8,10) - 1) / days * 100,
          width: Math.max(7, Math.min(26, b.durMin / 8)),
          color: colors[(ci + i) % colors.length],
          // durMin 要带上：分类占比按「时长 / 当月总时长」算（与桌面端同口径），
          // 拿条宽反推出来的百分数没有意义。
          durMin: Number(b.durMin) || 0,
        }));
      return { cat, label: catNames[cat], bars, sumMin: bars.reduce((a, b) => a + b.durMin, 0) };
    });
    return { events: ve, gantt, swim };
  },
  calcNowLine() {
    if (this.data.curDate !== store.todayStr()) return { show: false, top: 0, label: "" };
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < DAY_START || min > DAY_END) return { show: false, top: 0, label: "" };
    return {
      show: true,
      top: (min - DAY_START) * PX + TOP_PAD,
      label: "现在 " + store.hhmmOf(min),
    };
  },
  refreshNowLine() {
    this.setData({ nowLine: this.calcNowLine() });
  },

  /* ── 日期导航 ── */
  onPrevDay() { this.shiftDate(-1); },
  onNextDay() { this.shiftDate(1); },
  onToday() { this.setData({ curDate: store.todayStr(), placing: null }); this.persistDate(); this.refresh(); },
  onDateChange(e) { this.setData({ curDate: e.detail.value, placing: null }); this.persistDate(); this.refresh(); },
  onDayTap(e) {
    const d = e.currentTarget.dataset.date;
    if (!d || d === this.data.curDate) return;
    this.setData({ curDate: d, placing: null });
    this.persistDate();
    this.refresh();
  },
  shiftDate(n) {
    this.setData({ curDate: store.addDays(this.data.curDate, n), placing: null });
    this.persistDate();
    this.refresh();
  },

  /* ── 任务池：点击自动安排 ── */
  onPoolTap(e) {
    const t = store.taskById(e.currentTarget.dataset.id);
    if (!t) return;
    const dur = Math.max(15, t.estMin || 30);
    const min = this.findSlot(dur);
    if (min === null) { wx.showToast({ title: "这一天已经排满了", icon: "none" }); return; }
    // 该任务若已在别处排程，先移除，避免重复
    store.getState().blocks.filter((b) => b.taskId === t.id).forEach((b) => store.removeBlock(b.id));
    store.addBlock({
      date: this.data.curDate,
      start: store.hhmmOf(min), durMin: dur,
      title: t.title, taskId: t.id,
      cat: TAG_CAT[(t.tags || [])[0] || ""] || "work",
    });
    wx.showToast({ title: "已排入 " + store.hhmmOf(min), icon: "none" });
  },

  // 长按任务卡进入「点轴放置」模式：找回桌面端拖拽意图的移动端方案
  onPoolLongPress(e) {
    const t = store.taskById(e.currentTarget.dataset.id);
    if (!t) return;
    wx.vibrateShort({ type: "medium" });
    this.setData({ placing: { id: t.id, title: t.title, dur: Math.max(15, t.estMin || 30) } });
  },
  onPlaceCancel() {
    this.setData({ placing: null });
  },

  findSlot(dur) {
    const busy = store.blocksOf(this.data.curDate)
      .map((b) => [store.mmOf(b.start), store.mmOf(b.start) + b.durMin])
      .sort((a, b) => a[0] - b[0]);
    let cursor = DAY_START;
    for (const seg of busy) {
      if (seg[1] <= cursor) continue;
      if (seg[0] - cursor >= dur) break;
      cursor = Math.max(cursor, seg[1]);
    }
    if (DAY_END - cursor < dur) return null;
    return cursor;
  },

  /* ── 时间块拖动 / 点按菜单 ── */
  onBlockTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    const b = store.getState().blocks.find((x) => x.id === id);
    this.drag = b ? { id, durMin: b.durMin, moved: false, y: null } : null;
  },
  onBlockChange(e) {
    if (!this.drag) return;
    const src = e.detail.source;
    if (src !== "touch" && src !== "touch-out-of-bounds") return;
    if (!this.drag.moved) {
      this.drag.moved = true;
      wx.vibrateShort({ type: "light" });
      this.setData({ dragId: this.drag.id });
    }
    this.drag.y = e.detail.y;
    const min = this.snapMin(e.detail.y, this.drag.durMin);
    this.setData({
      hint: {
        show: true,
        top: (min - DAY_START) * PX + TOP_PAD,
        label: store.hhmmOf(min) + " – " + store.hhmmOf(min + this.drag.durMin),
      },
    });
  },
  onBlockTouchEnd() {
    if (this.drag) {
      if (this.drag.moved && this.drag.y !== null) {
        const min = this.snapMin(this.drag.y, this.drag.durMin);
        store.updateBlock(this.drag.id, { date: this.data.curDate, start: store.hhmmOf(min) });
      } else {
        this.blockMenu(this.drag.id);
      }
    }
    this.drag = null;
    this.setData({ dragId: "", hint: { show: false, top: 0, label: "" } });
  },
  snapMin(y, durMin) {
    const min = Math.round(y / PX / 15) * 15 + DAY_START;
    return Math.min(DAY_END - durMin, Math.max(DAY_START, min));
  },
  blockMenu(id) {
    const b = store.getState().blocks.find((x) => x.id === id);
    if (!b) return;
    const cats = ["work", "study", "sport", "life", "rest"];
    const items = ["时长 +15 分钟", "时长 −15 分钟", "换分类"];
    if (b.taskId) items.push("移回任务池");
    items.push("删除时间块");
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const label = items[res.tapIndex];
        if (label === "时长 +15 分钟") {
          store.updateBlock(id, { durMin: Math.min(480, b.durMin + 15) });
        } else if (label === "时长 −15 分钟") {
          store.updateBlock(id, { durMin: Math.max(15, b.durMin - 15) });
        } else if (label === "换分类") {
          store.updateBlock(id, { cat: cats[(cats.indexOf(b.cat) + 1) % cats.length] });
        } else if (label === "移回任务池") {
          store.updateBlock(id, { taskId: null });
        } else if (label === "删除时间块") {
          wx.showModal({
            title: "删除时间块",
            content: "「" + b.title + "」将被删除",
            confirmText: "删除",
            confirmColor: "#C43C3C",
            success: (r) => { if (r.confirm) store.removeBlock(id); },
          });
        }
      },
    });
  },

  /* ── 点空白处：放置模式 / 快速加块 ── */
  onCanvasTap(e) {
    // 点在时间块上时不触发（block 自己的 touchend 已处理）
    if (e.target.dataset.id) return;
    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    const placing = this.data.placing;
    wx.createSelectorQuery().in(this)
      .select(".canvas")
      .boundingClientRect((rect) => {
        if (!rect) return;
        const y = touch.clientY - rect.top - TOP_PAD;
        if (y < -TOP_PAD || y > CANVAS_H - TOP_PAD) return;
        const min = this.snapMin(Math.max(0, y), placing ? placing.dur : 30);

        if (placing) {
          // 长按任务卡后：点时间轴即把任务放到该位置
          store.getState().blocks.filter((b) => b.taskId === placing.id).forEach((b) => store.removeBlock(b.id));
          const t = store.taskById(placing.id);
          store.addBlock({
            date: this.data.curDate,
            start: store.hhmmOf(min), durMin: placing.dur,
            title: placing.title, taskId: placing.id,
            cat: t ? (TAG_CAT[(t.tags || [])[0] || ""] || "work") : "work",
          });
          this.setData({ placing: null });
          wx.vibrateShort({ type: "light" });
          wx.showToast({ title: "已放到 " + store.hhmmOf(min), icon: "none" });
          return;
        }

        wx.showModal({
          title: "加一段 " + store.hhmmOf(min) + "（30 分钟）",
          editable: true,
          placeholderText: "这一段做什么？如「午休」",
          success: (res) => {
            if (!res.confirm) return;
            const title = (res.content || "").trim() || "空白时间";
            store.addBlock({
              date: this.data.curDate,
              start: store.hhmmOf(min), durMin: 30,
              title, taskId: null,
              cat: parser.guessCategory(title),
            });
          },
        });
      })
      .exec();
  },

  /* ── 底部快速输入 ── */
  onQuickInput(e) { this.setData({ quick: e.detail.value }); },
  onQuickAdd() {
    const title = (this.data.quick || "").trim();
    if (!title) return;
    const dur = 30;
    const min = this.findSlot(dur);
    if (min === null) { wx.showToast({ title: "这一天已经排满了", icon: "none" }); return; }
    store.addBlock({
      date: this.data.curDate,
      start: store.hhmmOf(min), durMin: dur,
      title, taskId: null,
      cat: parser.guessCategory(title),
    });
    this.setData({ quick: "" });
    wx.showToast({ title: "已放到 " + store.hhmmOf(min), icon: "none" });
  },
});
