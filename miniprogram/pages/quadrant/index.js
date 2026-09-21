// 四象限视图 —— 概念稿 03「权衡」的小程序版
// 2×2 象限块 + 当前象限任务列表；支持：
//  左滑任务卡快捷操作（完成/删除）、跨象限搜索、「隐藏已完成」开关（记住偏好）
const store = require("../../core/store.js");
const undo = require("../../core/undo.js");
const files = require("../../core/files.js");
const routes = require("../../core/pluginRoutes.js");

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
    tasks: [], filter: "quad", selecting: false, selectedCount: 0, total: 0, pageNumber: 1, hasPrev: false, hasNext: false, inboxCount: 0, undoMessage: "", searchLabel: "搜索结果",
    estLabels: ["15 分钟", "30 分钟", "45 分钟", "1 小时", "1h 30m", "2 小时"],
    form: { show: false, focus: false, title: "", estIndex: 1 },
  },

  estValues: [15, 30, 45, 60, 90, 120],
  openNotes: null,

  onLoad() {
    this.openNotes = new Set(); this._selected = new Set(); this._page = 0;
    this._openSwipe = null; // 当前左滑展开的任务 id
  },
  onShow() {
    if (this._unsub) this._unsub(); if (this._undoUnsub) this._undoUnsub();
    this._undoUnsub = undo.bind(this);
    this._unsub = store.subscribe(() => this.refresh());
    this.refresh();
  },
  onHide() {
    if (this._unsub) { this._unsub(); this._unsub = null; }
    clearTimeout(this._qt); this._swipe = null;
    if (this._undoUnsub) { this._undoUnsub(); this._undoUnsub = null; }
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
    const liveIds = new Set(all.map(t=>t.id)); this._selected.forEach(id=>{ if(!liveIds.has(id))this._selected.delete(id); });
    const open = all.filter((t) => !t.done).length;
    const quads = QUADS.map((q) => Object.assign({}, q, {
      open: all.filter((t) => t.quad === q.q && !t.done).length,
    }));
    const cur = QUADS.find((x) => x.q === this.data.active) || QUADS[0];
    const hideDone = !!st.settings.hideDone;
    const q = (this.data.q || "").trim().toLowerCase();
    const searching = q.length > 0 || this.data.filter !== "quad";
    let tasks = searching ? QUADS.reduce((out, item) => out.concat(store.tasksOfQuad(item.q)), []) : store.tasksOfQuad(this.data.active);
    if (q) tasks = tasks.filter(t => [t.title,t.note,t.project,(t.tags || []).join(" ")].join(" ").toLowerCase().includes(q));
    if (hideDone) tasks = tasks.filter(t => !t.done);
    const today = store.todayStr();
    if (this.data.filter === "today") tasks = tasks.filter(t => !t.done && String(t.due || "").slice(0,10) === today);
    if (this.data.filter === "overdue") tasks = tasks.filter(t => {
      if (t.done || !t.due) return false;
      const p = String(t.due).slice(0,10).split("-").map(Number), clock = String(t.dueTime || "23:59").split(":").map(Number);
      return new Date(p[0],p[1]-1,p[2],clock[0],clock[1]).getTime() < Date.now();
    });
    if (this.data.filter === "pool") { const ids = new Set(store.poolOf(today).map(t=>t.id)); tasks=tasks.filter(t=>ids.has(t.id)); }
    const total = tasks.length;
    this._page = Math.min(this._page || 0, Math.floor(Math.max(0,total-1)/50));
    tasks = tasks.slice(this._page*50,(this._page+1)*50);
    const schedByTask = Object.create(null);
    const sorted = st.blocks.slice().sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    for (const block of sorted) if (block.taskId && (!schedByTask[block.taskId] || (schedByTask[block.taskId].date < today && block.date >= today))) schedByTask[block.taskId] = block;
    this._swipe = null;
    this.closeSwipe();
    this.setData({
      quads,
      cur,
      chips: { all: all.length, open, done: all.length - open },
      hideDone,
      searching, total, pageNumber:this._page+1, hasPrev:this._page>0, hasNext:(this._page+1)*50<total,
      selectedCount:this._selected.size, inboxCount:(st.inbox || []).filter(x=>x && x.status!=="done").length,
      searchLabel:q?"搜索结果":({all:"全部任务",today:"今日截止",overdue:"逾期待办",pool:"未排入今天"}[this.data.filter]||"任务"),
      tasks: tasks.map((t, i) => {
        const sched = schedByTask[t.id];
        const hasNote = !!(t.note && t.note.trim());
        return {
          id: t.id,
          index: i,
          title: t.title,
          done: t.done, selected:this._selected.has(t.id),
          quadBadge: (QUADS.find((x) => x.q === t.quad) || QUADS[0]).rn,
          quadCls: (QUADS.find((x) => x.q === t.quad) || QUADS[0]).cls,
          hasNote,
          note: hasNote ? String(t.note).slice(0,1800) : "",
          noteOpen: this.openNotes.has(t.id),
          meta: (t.due ? "截止 " + t.due.slice(5).replace("-", "/") : "无截止") +
            (t.project ? " · " + t.project : "") + ((t.tags || []).length ? " · #" + t.tags.slice(0,5).join(" #") : "") +
            (t.attachments && t.attachments.length ? " · 有附件" : ""),
          schedLabel: sched ? "已排 " + sched.date.slice(5) + " " + sched.start : "",
          estLabel: store.durLabel(t.estMin),
          offset: 0,
          moving: false,
        };
      }),
    });
  },

  /* ── 象限切换 ── */
  onTileTap(e) {
    this._page = 0; this._selected.clear();
    this.setData({ active: +e.currentTarget.dataset.q, filter:"quad", q:"" });
    this.refresh();
  },

  /* ── 搜索 / 折叠 ── */
  onSearch(e) {
    clearTimeout(this._qt);
    this._page = 0; this._selected.clear(); this.setData({ q:e.detail.value });
    this._qt = setTimeout(() => this.refresh(), 200);
  },
  onHideDoneTap() {
    const st = store.getState();
    st.settings.hideDone = !st.settings.hideDone;
    store.saveNow();
    this.refresh();
  },

  /* ── 任务卡：左滑快捷操作 ── */
  onCardTouchStart(e) {
    if (this.data.selecting || !e.touches || !e.touches.length) return;
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
      if (!s.hor) { this.setData({ ["tasks["+s.i+"].moving"]:false }); this._swipe = null; return; }
    }
    s.dx = Math.max(-SWIPE_W, Math.min(0, s.base + dx));
    this.setData({ ["tasks[" + s.i + "].offset"]: s.dx });
  },
  onCardTouchEnd() {
    const s = this._swipe;
    this._swipe = null;
    if (!s || !this.data.tasks[s.i]) return;
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
      success: (r) => { if (r.confirm) { this._selected.delete(id); undo.offer(store.deleteTaskUndoable(id), "任务和关联排程已删除"); } },
    });
  },

  /* ── 任务卡：点击 / 勾选 / 备注展开 ── */
  onCardTap(e) {
    if (Date.now() < (this._ignoreTapUntil || 0)) return;
    if (this.data.selecting) { this.selectId(e.currentTarget.dataset.id); return; }
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
    if (this.data.selecting) { this.selectId(e.currentTarget.dataset.id); return; }
    wx.vibrateShort({ type: "light" });
    store.toggleTask(e.currentTarget.dataset.id);
  },
  onNoteTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.openNotes.has(id)) this.openNotes.delete(id);
    else this.openNotes.add(id);
    this.refresh();
  },

  onCardTouchCancel() {
    const swipe=this._swipe; this._swipe=null;
    if(swipe && this.data.tasks[swipe.i]) this.setData({ ["tasks["+swipe.i+"].moving"]:false, ["tasks["+swipe.i+"].offset"]:0 });
  },
  onFilterTap(e) { this._page=0;this._selected.clear();this.setData({filter:e.currentTarget.dataset.filter});this.refresh(); },
  onClearSearch() { clearTimeout(this._qt);this._page=0;this._selected.clear();this.setData({q:"",filter:"quad"});this.refresh(); },
  onPrevPage() { this._page=Math.max(0,this._page-1);this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onNextPage() { this._page++;this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onInbox() { wx.navigateTo({url:"/pages/inbox/index"}); },
  onPlugins() { wx.navigateTo({url:"/pages/plugins/index"}); },
  onSchedulePlugin() { wx.navigateTo({url:routes.route("shiguang-schedule")}); },
  onUndo() { undo.run(); },
  selectId(id) { if(this._selected.has(id))this._selected.delete(id);else this._selected.add(id);this.refresh(); },
  onSelectMode() { this._selected.clear();this.setData({selecting:!this.data.selecting});this.refresh(); },
  onSelectPage() { this.data.tasks.forEach(t=>this._selected.add(t.id));this.refresh(); },
  onBulkDone(e) { const done=e.currentTarget.dataset.done===true||e.currentTarget.dataset.done==="true";store.batchChanges(()=>[...this._selected].forEach(id=>store.updateTask(id,{done})));this._selected.clear();this.refresh(); },
  onBulkMove() { wx.showActionSheet({itemList:QUADS.map(q=>q.short),success:r=>{store.batchChanges(()=>[...this._selected].forEach(id=>store.moveTaskToQuad(id,r.tapIndex+1)));this._selected.clear();this.refresh();}}); },
  onBulkDelete() {
    const ids=[...this._selected];if(!ids.length)return;
    wx.showModal({title:"删除选中的 "+ids.length+" 条任务",content:"将同时删除这些任务的排程，12 秒内可撤销。未选中的记录保留。",confirmColor:"#C43C3C",success:r=>{if(r.confirm){this._selected.clear();undo.offer(store.deleteTasksUndoable(ids),"已删除 "+ids.length+" 条任务");this.refresh();}}});
  },
  onClearDone() {
    const count=store.getState().tasks.filter(t=>t.done).length;if(!count){wx.showToast({title:"没有已完成任务",icon:"none"});return;}
    wx.showModal({title:"清理全部已完成",content:"清理本机全部 "+count+" 条已完成任务及其排程（不只是当前筛选），12 秒内可撤销。",confirmColor:"#C43C3C",success:r=>{if(r.confirm){this._selected.clear();undo.offer(store.deleteDoneTasksUndoable(),"已清理已完成任务");}}});
  },
  onTaskMenu(e) {
    const id=e.currentTarget.dataset.id,task=store.taskById(id);if(!task)return;
    this._ignoreTapUntil=Date.now()+500;this.onCardTouchCancel();
    wx.showActionSheet({itemList:["任务详情","上移","下移","移动象限","排入今天","删除"],success:r=>{
      if(r.tapIndex===0)wx.navigateTo({url:"/pages/task/index?id="+encodeURIComponent(id)});
      else if(r.tapIndex===1||r.tapIndex===2){const seq=store.tasksOfQuad(task.quad).filter(t=>!!t.done===!!task.done),at=seq.findIndex(t=>t.id===id),peer=seq[at+(r.tapIndex===1?-1:1)];if(peer)store.moveTaskRelative(id,peer.id,r.tapIndex===1);else wx.showToast({title:"已到当前分组边界",icon:"none"});}
      else if(r.tapIndex===3)wx.showActionSheet({itemList:QUADS.map(q=>q.short),success:x=>store.moveTaskToQuad(id,x.tapIndex+1)});
      else if(r.tapIndex===4){try{store.placeTask(task,store.todayStr());wx.showToast({title:"已排入今天",icon:"none"});}catch(error){files.notifyError(error);}}
      else if(r.tapIndex===5)this.onSwipeDel({currentTarget:{dataset:{id}}});
    }});
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
      title: "U-Time · 任务表里定的事，排进一天的时间块",
      path: "/pages/quadrant/index",
    };
  },
  onShareTimeline() {
    return { title: "U-Time · 任务表里定的事，排进一天的时间块" };
  },
});
