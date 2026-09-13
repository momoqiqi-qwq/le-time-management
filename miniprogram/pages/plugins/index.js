const store = require("../../core/store.js");
const catalog = require("../../core/pluginCatalog.js");

const STATUS = {
  full: "完整",
  native: "原生适配",
  conditional: "需运行时",
  unavailable: "暂不可用",
};

function platformText(man) {
  const p = man.platforms || {};
  return [
    { key: "windows", label: "Win", status: p.windows, text: STATUS[p.windows] || p.windows },
    { key: "android", label: "Android", status: p.android, text: STATUS[p.android] || p.android },
    { key: "miniprogram", label: "小程序", status: p.miniprogram, text: STATUS[p.miniprogram] || p.miniprogram },
  ];
}

Page({
  data: { allPlugins: [], plugins: [], nativeCount: 0, pluginCount: 0, query: "", filter: "all" },

  onShow() { this.refresh(); },

  refresh() {
    const state = store.getState();
    const customOrder = Array.isArray(state.settings && state.settings.pluginOrder) ? state.settings.pluginOrder : [];
    const rank = {};
    customOrder.forEach((id, index) => { rank[id] = index; });
    const plugins = catalog.plugins.map((man) => ({
      id: man.id,
      name: man.name,
      icon: man.icon || "件",
      iconPath: `/images/plugins/${man.id}.png`,
      version: man.version,
      description: man.description,
      platforms: platformText(man),
      miniNative: man.platforms && man.platforms.miniprogram === "native",
      enabled: store.isPluginEnabled(man.id),
      manifestOrder: Number(man.order) || 999,
    })).sort((a, b) => {
      const ar = Object.prototype.hasOwnProperty.call(rank, a.id) ? rank[a.id] : Number.MAX_SAFE_INTEGER;
      const br = Object.prototype.hasOwnProperty.call(rank, b.id) ? rank[b.id] : Number.MAX_SAFE_INTEGER;
      return ar - br || a.manifestOrder - b.manifestOrder || a.name.localeCompare(b.name);
    });
    this.setData({
      allPlugins: plugins,
      nativeCount: plugins.filter((x) => x.miniNative).length,
      pluginCount: plugins.length,
    }, () => this.applyFilter());
  },

  applyFilter() {
    const q = String(this.data.query || "").trim().toLowerCase();
    const filter = this.data.filter || "all";
    const plugins = (this.data.allPlugins || []).filter((item) => {
      if (filter === "enabled" && !item.enabled) return false;
      if (filter === "disabled" && item.enabled) return false;
      if (filter === "native" && !item.miniNative) return false;
      if (!q) return true;
      return `${item.name} ${item.id} ${item.description || ""}`.toLowerCase().includes(q);
    });
    this.setData({ plugins });
  },

  onSearch(e) { this.setData({ query: e.detail.value || "" }, () => this.applyFilter()); },
  onFilter(e) { this.setData({ filter: e.currentTarget.dataset.filter || "all" }, () => this.applyFilter()); },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    store.setPluginEnabled(id, !!e.detail.value);
    this.refresh();
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    const man = catalog.byId[id];
    if (!man) return;
    if (!store.isPluginEnabled(id)) {
      wx.showToast({ title: "先启用这个插件", icon: "none" });
      return;
    }
    if (!man.platforms || man.platforms.miniprogram !== "native") {
      wx.showModal({
        title: man.name,
        content: "这个插件已与三端清单同步，但微信小程序当前没有可安全复用的运行时。可在 Windows / Android 端使用；启停状态仍会随备份 JSON 同步。",
        showCancel: false,
      });
      return;
    }
    wx.navigateTo({ url: "/pages/plugin/index?id=" + encodeURIComponent(id) });
  },
});
