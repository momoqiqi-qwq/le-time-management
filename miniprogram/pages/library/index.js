const store = require("../../core/store.js");
const lib = require("../../core/library.js");
const files = require("../../core/files.js");
const routes = require("../../core/pluginRoutes.js");
Page({
  data: { id: "", title: "资料库", note: "", query: "", items: [], feeds: [], feedLabels: ["全部订阅"], feedIndex: 0, unread: false, star: false, total: 0, shown: 0, busy: false, error: "", form: null, importOpen: false, importText: "", fileName: "", manage: false },
  onLoad(options) {
    this.id = options && options.id;
    if (![lib.BOOKS, lib.RSS].includes(this.id)) { wx.navigateBack(); return; }
    this._page = 0; this._unloaded = false;
    this.setData({ id: this.id, title: this.id === lib.BOOKS ? "网页收藏" : "RSS 信息流", note: routes.NOTES[this.id] });
    wx.setNavigationBarTitle({ title: this.data.title });
  },
  onShow() {
    if (!this.id || !routes.enabled(this.id)) return;
    this._unsub && this._unsub(); this._unsub = store.subscribe(() => this.refresh()); this.refresh();
  },
  onHide() { if (this._unsub) { this._unsub(); this._unsub = null; } },
  onUnload() { this._unloaded = true; this.onHide(); },
  onPullDownRefresh() { if (this.id === lib.RSS) this.onRefresh().finally(() => wx.stopPullDownRefresh()); else { this.refresh(); wx.stopPullDownRefresh(); } },
  refresh() {
    if (!this.id || this._unloaded) return;
    const allFeeds = this.id === lib.RSS ? lib.feeds() : [];
    const feedIndex = Math.min(this.data.feedIndex, allFeeds.length);
    const feedId = feedIndex ? allFeeds[feedIndex - 1].id : "all";
    const list = this.id === lib.BOOKS ? lib.bookmarks(this.data.query) : lib.items({ query: this.data.query, feedId, unread: this.data.unread, star: this.data.star });
    const names = new Map(allFeeds.map(f => [f.id, f.title]));
    this._page = Math.min(this._page || 0, Math.floor(Math.max(0, list.length - 1) / 40));
    this.setData({ feeds: allFeeds.map(f => ({ id: f.id, title: f.title, url: f.url, enabled: f.enabled !== false, lastError: String(f.lastError || "").slice(0, 350) })),
      feedLabels: ["全部订阅"].concat(allFeeds.map(f => f.title)), feedIndex, total: list.length,
      pageNumber: this._page + 1, hasPrev: this._page > 0, hasNext: (this._page + 1) * 40 < list.length,
      items: list.slice(this._page * 40, (this._page + 1) * 40).map(x => ({ id: x.id, title: String(x.title || "未命名").slice(0, 180), url: x.url || x.link || "", note: String(x.note || x.snippet || "").slice(0, 600), read: !!x.read, star: !!x.star, date: x.date || "", feedName: names.get(x.feedId) || "", taskId: x.taskId || "" })), shown: Math.min(list.length, (this._page + 1) * 40) });
  },
  onSearch(e) { this._page = 0; this.setData({ query: e.detail.value }); this.refresh(); },
  onMore() { this._page++; this.refresh(); wx.pageScrollTo({ scrollTop: 0, duration: 150 }); },
  onPrevPage() { this._page = Math.max(0, this._page - 1); this.refresh(); wx.pageScrollTo({ scrollTop: 0, duration: 150 }); },
  onFilter(e) { const field = e.currentTarget.dataset.field; if (!["unread", "star"].includes(field)) return; this.setData({ [field]: !this.data[field] }); this._page = 0; this.refresh(); },
  onFeedChange(e) { this._page = 0; this.setData({ feedIndex: Number(e.detail.value) }); this.refresh(); },
  onManage() { this.setData({ manage: !this.data.manage }); },
  onAdd() { this.setData({ form: { id: "", title: "", url: "", note: "" } }); },
  onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const record = (this.id === lib.BOOKS ? lib.bookmarks() : lib.feeds()).find(x => x.id === id);
    if (record) this.setData({ form: { id, title: record.title || "", url: record.url || "", note: record.note || "" } });
  },
  onFormInput(e) { const field = e.currentTarget.dataset.field; if (["title", "url", "note"].includes(field)) this.setData({ ["form." + field]: e.detail.value }); },
  onFormCancel() { this.setData({ form: null }); },
  onFormSave() {
    try { if (this.id === lib.BOOKS) lib.saveBookmark(this.data.form); else lib.saveFeed(this.data.form); this.setData({ form: null }); this.refresh(); }
    catch (e) { files.notifyError(e); }
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({ title: "确认删除", content: this.id === lib.RSS ? "删除这个订阅及其缓存（包括该源的星标），其他订阅不受影响。可先导出备份。" : "删除此收藏，其他记录不受影响。", confirmText: "删除", confirmColor: "#C43C3C", success: r => {
      if (!r.confirm) return;
      if (this.id === lib.BOOKS) lib.deleteBookmark(id); else lib.deleteFeed(id);
      this.setData({ feedIndex: 0 }); this.refresh();
    } });
  },
  onFeedEnabled(e) { lib.setFeedEnabled(e.currentTarget.dataset.id, e.detail.value); },
  onCopy(e) {
    const row = this.data.items.find(x => x.id === e.currentTarget.dataset.id);
    if (row && row.url) files.copyText(row.url).catch(files.notifyError);
  },
  onRead(e) { const row = this.data.items.find(x => x.id === e.currentTarget.dataset.id); if (row) lib.updateItem(row.id, { read: !row.read }); },
  onStar(e) { const row = this.data.items.find(x => x.id === e.currentTarget.dataset.id); if (row) lib.updateItem(row.id, { star: !row.star }); },
  onReadAll() { lib.markVisibleRead(this.data.items.map(x => x.id)); },
  onTask(e) {
    const task = lib.itemToTask(e.currentTarget.dataset.id);
    if (task) { wx.showToast({ title: "任务已就绪", icon: "none" }); wx.navigateTo({ url: "/pages/task/index?id=" + encodeURIComponent(task.id) }); }
  },
  async onRefresh() {
    if (this.data.busy || this.id !== lib.RSS) return;
    const list = lib.feeds().filter(f => f.enabled !== false && (!this.data.feedIndex || f.id === this.data.feeds[this.data.feedIndex - 1].id));
    this.setData({ busy: true, error: "" }); let added = 0; const errors = [];
    for (const feed of list) {
      if (this._unloaded) break;
      try { const result = await lib.refreshFeed(feed.id); added += result.added; }
      catch (e) { errors.push(feed.title + "：" + files.errorText(e)); }
    }
    if (this._unloaded) return;
    this.setData({ busy: false, error: errors.slice(0, 4).join("；") }); this.refresh();
    wx.showToast({ title: "新增 " + added + " 条" + (errors.length ? "，部分源未完成" : ""), icon: "none" });
  },
  async onExport() { try { await files.exportText(this.id + ".json", lib.exportData(this.id)); } catch (e) { files.notifyError(e); } },
  onImportToggle() { this._fileText = null; this.setData({ importOpen: !this.data.importOpen, importText: "", fileName: "" }); },
  onImportText(e) { this._fileText = null; this.setData({ importText: e.detail.value, fileName: "" }); },
  async onChooseFile() {
    try { const file = await files.readText(this.id === lib.RSS ? ["json", "xml", "rss", "atom", "txt"] : ["json"]); if (file && !this._unloaded) { this._fileText = file.text; this.setData({ fileName: file.name, importText: "" }); } }
    catch (e) { files.notifyError(e); }
  },
  onImport() {
    const text = this._fileText || this.data.importText;
    if (!String(text || "").trim()) { wx.showToast({ title: "请选择文件或粘贴内容", icon: "none" }); return; }
    const xml = this.id === lib.RSS && /^\s*</.test(text);
    if (xml && !this.data.feedIndex) { wx.showToast({ title: "导入 XML 前先选择对应订阅源", icon: "none" }); return; }
    const feedId = xml ? this.data.feeds[this.data.feedIndex - 1].id : null;
    wx.showModal({ title: "合并导入", content: "仅补充新记录，重复记录保留本机内容与已读/收藏状态，不覆盖其他数据。", success: r => {
      if (!r.confirm) return;
      try {
        const added = xml ? lib.importFeedText(feedId, text).added : lib.importData(this.id, text);
        this._fileText = null; this.setData({ importText: "", fileName: "", importOpen: false }); this.refresh();
        wx.showToast({ title: "新增 " + added + " 条", icon: "none" });
      } catch (e) { files.notifyError(e); }
    } });
  },
  onShareAppMessage() { return { title: "U-Time · " + this.data.title, path: routes.route(this.id) }; },
});
