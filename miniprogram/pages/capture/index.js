// 捕获页 —— 桌面端「拖/粘贴文本自动建块」的小程序等价物
// 复制带时间的消息 → 读取剪贴板/输入 → 实时解析预览；
// 预览里的日期/开始/时长/分类可直接点改，确认后创建（core/captureFlow.js）。
const store = require("../../core/store.js");
const flow = require("../../core/captureFlow.js");
const files = require("../../core/files.js");

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
    this._parsedText = text; this._dateEdited = false; this._timeEdited = false;
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
  onEditDate(e) { this._dateEdited = true; this.setData({ "edit.date": e.detail.value }); },
  onEditStart(e) { this._timeEdited = true; this.setData({ "edit.start": e.detail.value }); },
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

  ensureCurrent() { clearTimeout(this._pt); if ((this.data.text || "").trim() !== this._parsedText) this.parseNow(); },
  onCreate() {
    this.ensureCurrent();
    if (!this._cap) return;
    const cap = this._cap;
    const edit = this.currentEdit();
    let made;
    try { made = flow.createFromCapture(Object.assign({}, cap, { hasTime:cap.hasTime || this._timeEdited }), edit); } catch (error) { files.notifyError(error); return; }
    this._cap = null; this._parsedText = "";
    let msg = "已捕获 → " + edit.date.slice(5).replace("-", "/") + " " + edit.start +
      " · " + store.durLabel(edit.durMin);
    if (!cap.hasDate) msg = "原文未识别到日期（使用预览日期）· " + msg;
    if (!cap.hasTime && !this._timeEdited) msg += " · 时间默认 09:00";
    if (made.blocksCount > 1) msg += " · 跨天拆为两段";
    this.setData({
      result: { show: true, msg, hasBlock: true },
      text: "",
      preview: { show: false },
    });
    wx.vibrateShort({ type: "light" });
  },

  onTaskOnly() {
    this.ensureCurrent();
    if (!this._cap) return;
    const cap = this._cap, edit = this.currentEdit();
    const task = store.addTask({
      title: cap.title,
      quad: cap.quad,
      estMin: edit.durMin,
      due: cap.hasDate || this._dateEdited ? edit.date : null,
      dueTime: cap.hasTime || this._timeEdited ? edit.start : "23:59",
      tags: [store.catLabel(edit.cat), "捕获"],
      note: cap.note,
    });
    this._cap = null; this._parsedText = "";
    this.setData({
      result: { show: true, msg: "已保存任务「" + task.title + "」", hasBlock: false },
      text: "",
      preview: { show: false },
    });
  },

  onSaveInbox() {
    this.ensureCurrent();if(!this._cap)return;
    const cap=this._cap,edit=this.currentEdit(),date=cap.hasDate||this._dateEdited?edit.date:null,time=cap.hasTime||this._timeEdited?edit.start:null;
    store.addInbox({title:cap.title,note:cap.note,date,time,when:[date,time].filter(Boolean).join(" "),source:"快捷捕获",suggestion:"create-task"});
    this._cap=null;this._parsedText="";this.setData({text:"",preview:{show:false},result:{show:true,msg:"已存入收件箱，稍后再决定是否建任务",hasBlock:false}});
  },
  onInbox() { wx.navigateTo({url:"/pages/inbox/index"}); },

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
