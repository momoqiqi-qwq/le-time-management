const CONFIG = require("../../config.js");

Page({
  data: {
    dateStr: "",
    blocks: [],
    tasks: [],
    kw: "",
    err: "",
    updated: "",
  },

  onLoad() { this.load(); },

  onPullDownRefresh() { this.load(); },

  load() {
    const now = new Date();
    const ds = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    const wk = "日一二三四五六"[now.getDay()];
    this.setData({ dateStr: ds + " · 周" + wk });
    wx.request({
      url: CONFIG.base + "/api/state",
      data: { token: CONFIG.token },
      timeout: 6000,
      success: (r) => {
        if (r.statusCode !== 200 || !r.data || !r.data.tasks) { this.setData({ err: "连接失败：请确认U-Time在电脑上运行、地址与令牌正确、勾选了「不校验合法域名」" }); return; }
        this.setData({ err: "", updated: now.toTimeString().slice(0, 5) });
        this.render(r.data, ds, now);
      },
      fail: () => this.setData({ err: "连接失败：请确认U-Time在电脑上运行、手机与电脑同一 Wi-Fi、勾选了「不校验合法域名」" }),
    });
  },

  render(d, ds, now) {
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const blocks = (d.blocks || []).filter((b) => b.date === ds).sort((a, b) => a.start.localeCompare(b.start))
      .map((b) => {
        const sm = Number(b.start.slice(0, 2)) * 60 + Number(b.start.slice(3));
        return { ...b, past: sm + b.durMin < nowMin, now: sm <= nowMin && nowMin < sm + b.durMin, end: this.end(b.start, b.durMin) };
      });
    const sched = new Set(blocks.map((b) => b.taskId).filter(Boolean));
    const kw = this.data.kw.trim().toLowerCase();
    const tasks = (d.tasks || []).filter((t) => !sched.has(t.id))
      .filter((t) => !kw || t.title.toLowerCase().indexOf(kw) >= 0)
      .sort((a, b) => Number(a.done) - Number(b.done) || a.quad - b.quad);
    this.setData({ blocks, tasks });
  },

  end(start, dur) {
    const t = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + dur;
    const h = String(Math.floor(t / 60)).padStart(2, "0"), m = String(t % 60).padStart(2, "0");
    return h + ":" + m;
  },

  kwInput(e) { this.setData({ kw: e.detail.value }); this.load(); },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    wx.request({
      url: CONFIG.base + "/api/command",
      data: { token: CONFIG.token },
      method: "POST",
      header: { "content-type": "application/json" },
      data: JSON.stringify({ action: "toggle", id }),
      success: () => this.load(),
    });
  },

  addTask() {
    const v = this.data.newTitle && this.data.newTitle.trim();
    if (!v) return;
    wx.request({
      url: CONFIG.base + "/api/command",
      data: { token: CONFIG.token },
      method: "POST",
      header: { "content-type": "application/json" },
      data: JSON.stringify({ action: "add", title: v }),
      success: () => { this.setData({ newTitle: "" }); this.load(); },
    });
  },
  newTitleInput(e) { this.setData({ newTitle: e.detail.value }); },
});
