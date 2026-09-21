// 任务详情页（桌面端的任务抽屉）
const store = require("../../core/store.js");
const reminder = require("../../core/taskReminder.js");
const files = require("../../core/files.js");
const undo = require("../../core/undo.js");
const media = require("../../core/media.js");

const EST = [15, 30, 45, 60, 90, 120, 180];

Page({
  data: {
    t: null,
    quads: [
      { q: 1, rn: "I" }, { q: 2, rn: "II" }, { q: 3, rn: "III" }, { q: 4, rn: "IV" },
    ],
    estLabels: EST.map((m) => store.durLabel(m)),
    estIndex: 1,
    due: "",
    dueTime: "23:59",
    reminderEnabled: true,
    reminderOptions: reminder.PRESET_OFFSETS.map((o)=>({offset:o,label:o===0?"到点":reminder.label(o).replace("截止","") ,selected:false})),
    reminderOffsets: [],
    customReminderMin: "",
    attachments: [],
    sched: [], tagsText: "", customEst: "30", scheduleDate: "", undoMessage: "", addingImage: false, noteTooLong: false,
  },

  onLoad(options) {
    this.id = options.id;
    if (!store.taskById(this.id)) { try { this.id = decodeURIComponent(this.id); } catch (e) {} }
    this._preview = media.previewScope(); this._unloaded = false;
    this.setData({ scheduleDate: store.todayStr() });
    this.refresh();
  },
  onShow() { this.onHide(); this._unsub = store.subscribe(() => this.refresh()); this._undoUnsub = undo.bind(this); this.refresh(); },
  onHide() { if (this._unsub) this._unsub(); if (this._undoUnsub) this._undoUnsub(); this._unsub = this._undoUnsub = null; },
  onUnload() { this._unloaded = true; this.onHide(); if (this._preview) this._preview.dispose(); },

  refresh() {
    const t = store.taskById(this.id);
    if (!t) { if (!this._deleting) wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/quadrant/index" }) }); return; }
    this._estValues = [...new Set(EST.concat([Number(t.estMin) || 30]))].sort((a,b) => a-b);
    this._tagsOriginal = (t.tags || []).join("、");
    const attachments = Array.isArray(t.attachments) ? t.attachments : [], token = (this._previewToken || 0) + 1;
    this._previewToken = token;
    this.setData({
      t: {
        id: t.id,
        title: t.title,
        quad: t.quad,
        done: t.done,
        project: t.project || "",
        note: String(t.note || "").slice(0, 16000),
      },
      estLabels: this._estValues.map(m => store.durLabel(m)),
      estIndex: Math.max(0, this._estValues.indexOf(Number(t.estMin) || 30)),
      customEst: String(t.estMin || 30), tagsText: this._tagsOriginal, noteTooLong: String(t.note || "").length > 16000,
      due: t.due || "",
      dueTime: t.dueTime || "23:59",
      reminderEnabled: t.reminderEnabled !== false,
      reminderOffsets: reminder.offsets(t),
      reminderOptions: reminder.PRESET_OFFSETS.map((o)=>({offset:o,label:o===0?"到点":reminder.label(o).replace("截止","") ,selected:reminder.offsets(t).includes(o)})),
      customReminderOffsets: reminder.offsets(t).filter((o)=>!reminder.PRESET_OFFSETS.includes(o)),
      attachments: attachments.map((url, i) => ({ index: i, thumb: "", label: "图片 " + (i + 1) })),
      sched: store.getState().blocks
        .filter((b) => b.taskId === t.id)
        .sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start))
        .map((b) => ({
          id: b.id, date: b.date,
          label: b.date.slice(5) + " " + b.start + " – " +
            store.hhmmOf(store.mmOf(b.start) + b.durMin) + " · " + b.title,
        })),
    });
    if (this._preview) attachments.forEach((url, i) => this._preview.load(url).then(path => {
      if (!this._unloaded && token === this._previewToken && path) this.setData({ ["attachments[" + i + "].thumb"]: path });
    }).catch(() => {}));
  },

  onTitleBlur(e) {
    const v = (e.detail.value || "").trim();
    if (v) store.updateTask(this.id, { title: v });
    else this.refresh();
  },
  onQuadTap(e) {
    store.moveTaskToQuad(this.id, +e.currentTarget.dataset.q);
  },
  onEstChange(e) {
    store.updateTask(this.id, { estMin: this._estValues[+e.detail.value] });
  },
  onDueChange(e) {
    store.updateTask(this.id, { due: e.detail.value || null });
  },
  onDueClear() { store.updateTask(this.id, { due: null }); this.refresh(); },
  onDueTimeChange(e) { store.updateTask(this.id, { dueTime: e.detail.value || "23:59" }); this.refresh(); },
  onReminderToggle(e) { store.updateTask(this.id, { reminderEnabled: !!e.detail.value }); this.refresh(); },
  onReminderPreset(e) {
    const off=+e.currentTarget.dataset.offset, cur=reminder.offsets(store.taskById(this.id));
    const next=cur.includes(off)?cur.filter(x=>x!==off):reminder.norm(cur.concat([off]));
    store.updateTask(this.id,{reminderOffsets:next}); this.refresh();
  },
  onReminderCustomInput(e){ this.setData({customReminderMin:e.detail.value}); },
  onReminderCustomAdd(){
    const n=Math.round(Number(this.data.customReminderMin));
    if(!isFinite(n)||n<0||n>43200){wx.showToast({title:"请输入 0～43200 分钟",icon:"none"});return;}
    const cur=reminder.offsets(store.taskById(this.id)); store.updateTask(this.id,{reminderOffsets:reminder.norm(cur.concat([n]))}); this.setData({customReminderMin:""}); this.refresh();
  },
  onProjectBlur(e) {
    store.updateTask(this.id, { project: (e.detail.value || "").trim() });
  },
  onNoteBlur(e) { if (!this.data.noteTooLong) store.updateTask(this.id, { note: e.detail.value }); },
  onTagsBlur(e) {
    if (e.detail.value === this._tagsOriginal) return;
    const tags = [...new Set(String(e.detail.value || "").split(/[,，、|\n]+/).map(s => s.trim()).filter(Boolean))];
    store.updateTask(this.id, { tags });
  },
  onCustomEst(e) {
    const value = Number(e.detail.value);
    if (!Number.isInteger(value) || value < 1 || value > 1440) { wx.showToast({ title: "预估请输入 1～1440 整数分钟", icon: "none" }); this.refresh(); return; }
    store.updateTask(this.id, { estMin: value });
  },
  onScheduleDate(e) { this.setData({ scheduleDate: e.detail.value }); },
  onViewSchedule(e) { getApp().globalData.pendingTimeblockDate = e.currentTarget.dataset.date; wx.switchTab({ url: "/pages/timeblock/index" }); },
  onUnschedule(e) { undo.offer(store.removeBlockUndoable(e.currentTarget.dataset.id), "已移除这条排程"); },
  onUndo() { undo.run(); },
  async onExportNote() { const task=store.taskById(this.id); if(task)try{await files.exportText("U-Time-任务备注.txt", task.note || "");}catch(e){files.notifyError(e);} },
  onToggleDone() {
    wx.vibrateShort({ type: "light" });
    store.toggleTask(this.id);
  },

  async onAttTap(e) {
    const task = store.taskById(this.id), url = task && (task.attachments || [])[Number(e.currentTarget.dataset.i)];
    if (!url) return;
    try {
      const path = /^https?:\/\//i.test(url) ? url : await this._preview.load(url);
      if (!path) throw new Error("此附件格式无法在小程序预览，请在桌面端查看");
      wx.previewImage({ urls: [path], fail: () => files.notifyError(new Error("预览失败，可能需要配置图片域名或在桌面端查看")) });
    } catch (error) { files.notifyError(error); }
  },
  async onAddAttachment() {
    const task = store.taskById(this.id); if (!task || this.data.addingImage) return;
    const remaining = 6 - (task.attachments || []).length;
    if (remaining <= 0) { wx.showToast({ title: "最多新增到 6 张；已有附件不会被删除", icon: "none" }); return; }
    this.setData({ addingImage: true });
    try {
      const images = await media.chooseImages(Math.min(3, remaining)), current = store.taskById(this.id);
      if (images.length && current && !this._unloaded) store.updateTask(this.id, { attachments: (current.attachments || []).concat(images) });
    } catch (e) { files.notifyError(e); }
    finally { if (!this._unloaded) this.setData({ addingImage: false }); }
  },
  onRemoveAttachment(e) {
    const index = Number(e.currentTarget.dataset.i);
    wx.showModal({ title: "移除附件", content: "从本任务移除这张图片？其他附件保留。", success: r => {
      if (!r.confirm) return; const task = store.taskById(this.id);
      if (task) store.updateTask(this.id, { attachments: (task.attachments || []).filter((url, i) => i !== index) });
    } });
  },

  // 校验空闲时段后才替换所选日期的排程，不再删除其他日期。
  onScheduleToday() {
    const t = store.taskById(this.id); if (!t) return;
    try {
      const date = this.data.scheduleDate || store.todayStr();
      const block = store.placeTask(t, date, null, "work");
      wx.showToast({ title: "已排入 " + date.slice(5) + " " + block.start, icon: "none" });
    } catch (e) { files.notifyError(e); }
  },

  onDelete() {
    wx.showModal({
      title: "删除任务",
      content: "任务及其时间块安排将一并删除",
      confirmText: "删除",
      confirmColor: "#C43C3C",
      success: (r) => {
        if (!r.confirm) return;
        this._deleting = true; this.onHide();
        undo.offer(store.deleteTaskUndoable(this.id), "任务与关联排程已删除");
        wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/quadrant/index" }) });
      },
    });
  },
});
