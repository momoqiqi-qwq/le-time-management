// 捕获页 —— 桌面端「拖/粘贴文本自动建块」的小程序等价物
// 复制带时间的消息 → 读取剪贴板/输入 → 实时解析预览；
// 预览里的日期/开始/时长/分类可直接点改，确认后创建（core/captureFlow.js）。
const store = require("../../core/store.js");
const flow = require("../../core/captureFlow.js");

const QUAD_SHORT = { 1: "I · 立即做", 2: "II · 排计划", 3: "III · 少快办", 4: "IV · 有空再说" };

Page({
  data: {
    text: "",
    preview: { show: false },
    edit: { date: "", start: "09:00", durIndex: 1, catIndex: 0 },
    durLabels: [],
    catLabels: [],
    result: { show: false, msg: "", hasBlock: false },
  },

  onLoad() {
    this._cap = null;          // 最近一次解析结果（buildCapture 产物）
    this._durValues = flow.DUR_STEPS;
    this.setData({ catLabels: store.CATEGORIES.map((c) => c.label) });
  },
  onUnload() { clearTimeout(this._pt); },

  onInput(e) {
    this.setData({ text: e.detail.value, "result.show": false });
    clearTimeout(this._pt);
    this._pt = setTimeout(() => this.parseNow(), 300);
  },

  parseNow() {
    const text = (this.data.text || "").trim();
    if (!text) {
      this._cap = null;
      this.setData({ preview: { show: false } });
      return;
    }
    const cap = flow.buildCapture(text);
    this._cap = cap;
    const opt = flow.durOptions(cap.estMin);
    this._durValues = opt.values;
    const catIndex = Math.max(0, store.CATEGORIES.findIndex((c) => c.id === cap.cat));
    this.setData({
      preview: {
        show: true,
        title: cap.title,
        hasDate: cap.hasDate,
        hasTime: cap.hasTime,
        quadLabel: "象限 " + QUAD_SHORT[cap.quad],
      },
      edit: {
        date: cap.due || store.todayStr(),
        start: cap.start,
        durIndex: opt.index,
        catIndex,
      },
      durLabels: opt.values.map((m) => store.durLabel(m)),
    });
  },

  /* ── 预览调整 ── */
  onEditDate(e) { this.setData({ "edit.date": e.detail.value }); },
  onEditStart(e) { this.setData({ "edit.start": e.detail.value }); },
  onEditDur(e) { this.setData({ "edit.durIndex": +e.detail.value }); },
  onEditCat(e) { this.setData({ "edit.catIndex": +e.detail.value }); },

  onPasteClip() {
    wx.getClipboardData({
      success: (res) => {
        const v = (res.data || "").trim();
        if (!v) { wx.showToast({ title: "剪贴板是空的", icon: "none" }); return; }
        this.setData({ text: v });
        this.parseNow();
      },
      fail: () => wx.showToast({ title: "读取剪贴板失败", icon: "none" }),
    });
  },

  onClear() {
    clearTimeout(this._pt);
    this._cap = null;
    this.setData({ text: "", preview: { show: false }, result: { show: false, msg: "", hasBlock: false } });
  },

  currentEdit() {
    return {
      date: this.data.edit.date,
      start: this.data.edit.start,
      durMin: this._durValues[this.data.edit.durIndex],
      cat: store.CATEGORIES[this.data.edit.catIndex].id,
    };
  },

  onCreate() {
    if (!this._cap) return;
    const cap = this._cap;
    const edit = this.currentEdit();
    flow.createFromCapture(cap, edit);
    let msg = "已捕获 → " + edit.date.slice(5).replace("-", "/") + " " + edit.start +
      " · " + store.durLabel(edit.durMin);
    if (!cap.hasDate) msg = "原文未识别到日期（默认今天）· " + msg;
    if (!cap.hasTime) msg += " · 时间默认 09:00";
    this.setData({
      result: { show: true, msg, hasBlock: true },
      text: "",
      preview: { show: false },
    });
    wx.vibrateShort({ type: "light" });
  },

  onTaskOnly() {
    if (!this._cap) return;
    const cap = this._cap;
    const task = store.addTask({
      title: cap.title,
      quad: cap.quad,
      estMin: cap.estMin,
      due: cap.due,
      tags: ["捕获"],
      note: cap.note,
    });
    this.setData({
      result: { show: true, msg: "已保存任务「" + task.title + "」", hasBlock: false },
      text: "",
      preview: { show: false },
    });
  },

  onViewTimeblock() {
    getApp().globalData.pendingTimeblockDate = this.data.edit.date || store.todayStr();
    wx.switchTab({ url: "/pages/timeblock/index" });
  },

  onDismiss() {
    this.setData({ "result.show": false });
  },

  onShareAppMessage() {
    return {
      title: "U-Time · 粘贴一句话，自动排进时间块",
      path: "/pages/capture/index",
    };
  },
  onShareTimeline() {
    return { title: "U-Time · 粘贴一句话，自动排进时间块" };
  },
});
