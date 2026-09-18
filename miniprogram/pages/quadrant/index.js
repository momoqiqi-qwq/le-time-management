// 四象限视图 —— 概念稿 03「权衡」的小程序版
// 2×2 象限块 + 当前象限任务列表；支持：
//  左滑任务卡快捷操作（完成/删除）、跨象限搜索、「隐藏已完成」开关（记住偏好）
const store = require("../../core/store.js");

const QUADS = [
  { q: 1, cls: "q1", rn: "I", short: "重要紧急", title: "重要且紧急 · 立即做", tip: "截止压顶，别再犹豫" },
  { q: 2, cls: "q2", rn: "II", short: "重要不紧急", title: "重要不紧急 · 排计划", tip: "人生的复利都在这里" },
  { q: 3, cls: "q3", rn: "III", short: "紧急不重要", title: "紧急不重要 · 少快办", tip: "能批量就批量，能拒绝就拒绝" },
  { q: 4, cls: "q4", rn: "IV", short: "不重要不紧急", title: "不重要不紧急 · 有空再说", tip: "留给真正的休息" },
];

const SWIPE_W = 150; // 左滑完全展开的宽度（px），对应两个操作按钮

Page({
  data: {
    quads: QUADS,
    active: 1,
    cur: QUADS[0],
    chips: { all: 0, open: 0, done: 0 },
    hideDone: false,
    q: "",
    searching: false,
    tasks: [],
    estLabels: ["15 分钟", "30 分钟", "45 分钟", "1 小时", "1h 30m", "2 小时"],
    form: { show: false, focus: false, title: "", estIndex: 1 },
  },

  estValues: [15, 30, 45, 60, 90, 120],
  openNotes: null,

  onLoad() {
    this.openNotes = new Set();
    this._openSwipe = null; // 当前左滑展开的任务 id
  },
  onShow() {
    this._unsub = store.subscribe(() => this.refresh());
    this.refresh();
  },
  onHide() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this.closeSwipe();
  },
  onUnload() { this.onHide(); },

  closeSwipe() {
    if (this._openSwipe === null) return;
    const i = this.data.tasks.findIndex((t) => t.id === this._openSwipe);
    this._openSwipe = null;
    if (i >= 0) this.setData({ ["tasks[" + i + "].offset"]: 0 });
  },

  refresh() {
    const st = store.getState();
    const all = st.tasks;
    const open = all.filter((t) => !t.done).length;
    const quads = QUADS.map((q) => Object.assign({}, q, {
      open: all.filter((t) => t.quad === q.q && !t.done).length,
    }));
    const cur = QUADS.find((x) => x.q === this.data.active) || QUADS[0];
    const hideDone = !!st.settings.hideDone;
    const q = (this.data.q || "").trim().toLowerCase();
    const searching = q.length > 0;

    let tasks;
    if (searching) {
      tasks = all.filter((t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.note || "").toLowerCase().includes(q) ||
        (t.project || "").toLowerCase().includes(q));
    } else {
      tasks = store.tasksOfQuad(this.data.active);
    }
    if (hideDone) tasks = tasks.filter((t) => !t.done);

    const schedByTask = {};
    for (const b of st.blocks) if (b.taskId && !schedByTask[b.taskId]) schedByTask[b.taskId] = b;

    this.closeSwipe();
    this.setData({
      quads,
      cur,
      chips: { all: all.length, open, done: all.length - open },
      hideDone,
      searching,
      tasks: tasks.map((t, i) => {
        const sched = schedByTask[t.id];
        const hasNote = !!(t.note && t.note.trim());
        return {
          id: t.id,
          index: i,
          title: t.title,
          done: t.done,
          quadBadge: QUADS.find((x) => x.q === t.quad).rn,
          quadCls: QUADS.find((x) => x.q === t.quad).cls,
          hasNote,
          note: hasNote ? t.note : "",
          noteOpen: this.openNotes.has(t.id),
          meta: (t.due ? "截止 " + t.due.slice(5).replace("-", "/") : "无截止") +
            (t.project ? " · " + t.project : "") +
            (t.attachments && t.attachments.length ? " · 有附件" : ""),
          schedLabel: sched ? "已排 " + sched.start : "",
          estLabel: store.durLabel(t.estMin),
          offset: 0,
          moving: false,
        };
      }),
    });
  },

  /* ── 象限切换 ── */
  onTileTap(e) {
    this.setData({ active: +e.currentTarget.dataset.q });
    this.refresh();
  },

  /* ── 搜索 / 折叠 ── */
  onSearch(e) {
    clearTimeout(this._qt);
    const v = e.detail.value;
    this._qt = setTimeout(() => {
      this.setData({ q: v });
      this.refresh();
    }, 250);
  },
  onHideDoneTap() {
    const st = store.getState();
    st.settings.hideDone = !st.settings.hideDone;
    store.saveNow();
    this.refresh();
  },

  /* ── 任务卡：左滑快捷操作 ── */
  onCardTouchStart(e) {
    const touch = e.touches[0];
    this._swipe = {
      i: e.currentTarget.dataset.index,
      x: touch.clientX,
      y: touch.clientY,
      base: e.currentTarget.dataset.offset || 0,
      hor: null,
      dx: 0,
    };
    this.setData({ ["tasks[" + e.currentTarget.dataset.index + "].moving"]: true });
  },
  onCardTouchMove(e) {
    const s = this._swipe;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (s.hor === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.hor = Math.abs(dx) > Math.abs(dy);
      if (!s.hor) { this._swipe = null; return; }
    }
    s.dx = Math.max(-SWIPE_W, Math.min(0, s.base + dx));
    this.setData({ ["tasks[" + s.i + "].offset"]: s.dx });
  },
  onCardTouchEnd() {
    const s = this._swipe;
    this._swipe = null;
    if (!s) return;
    const open = s.dx < -SWIPE_W / 2;
    this._openSwipe = open ? this.data.tasks[s.i].id : null;
    this.setData({
      ["tasks[" + s.i + "].moving"]: false,
      ["tasks[" + s.i + "].offset"]: open ? -SWIPE_W : 0,
    });
  },
  onSwipeDone(e) {
    wx.vibrateShort({ type: "light" });
    store.toggleTask(e.currentTarget.dataset.id);
  },
  onSwipeDel(e) {
    const id = e.currentTarget.dataset.id;
    const t = store.taskById(id);
    if (!t) return;
    wx.showModal({
      title: "删除任务",
      content: "「" + t.title + "」及其时间块安排将一并删除",
      confirmText: "删除",
      confirmColor: "#C43C3C",
      success: (r) => { if (r.confirm) store.removeTask(id); },
    });
  },

  /* ── 任务卡：点击 / 勾选 / 备注展开 ── */
  onCardTap(e) {
    const i = e.currentTarget.dataset.index;
    const card = this.data.tasks[i];
    if (card && card.offset) { // 展开状态先归位，不进详情
      this._openSwipe = null;
      this.setData({ ["tasks[" + i + "].offset"]: 0 });
      return;
    }
    wx.navigateTo({ url: "/pages/task/index?id=" + e.currentTarget.dataset.id });
  },
  onCheck(e) {
    wx.vibrateShort({ type: "light" });
    store.toggleTask(e.currentTarget.dataset.id);
  },
  onNoteTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.openNotes.has(id)) this.openNotes.delete(id);
    else this.openNotes.add(id);
    this.refresh();
  },

  /* ── 快速添加 ── */
  onAddTap() {
    this.setData({ form: { show: true, focus: true, title: "", estIndex: 1 } });
  },
  onFormInput(e) {
    this.setData({ "form.title": e.detail.value });
  },
  onEstChange(e) {
    this.setData({ "form.estIndex": +e.detail.value });
  },
  onFormSave() {
    const title = (this.data.form.title || "").trim();
    if (!title) { wx.showToast({ title: "先写点什么吧", icon: "none" }); return; }
    store.addTask({
      title,
      quad: this.data.active,
      estMin: this.estValues[this.data.form.estIndex],
    });
    this.setData({ form: { show: false, focus: false, title: "", estIndex: 1 } });
    wx.showToast({ title: "已添加", icon: "none" });
  },
  onFormCancel() {
    this.setData({ form: { show: false, focus: false, title: "", estIndex: 1 } });
  },

  onShareAppMessage() {
    return {
      title: "Le时间管理 · 任务表里定的事，排进一天的时间块",
      path: "/pages/quadrant/index",
    };
  },
  onShareTimeline() {
    return { title: "Le时间管理 · 任务表里定的事，排进一天的时间块" };
  },
});
