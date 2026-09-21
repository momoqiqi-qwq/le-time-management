// U-Time · 微信小程序版
// 与桌面端（Tauri）共用同一套数据结构与中文时间解析逻辑；
// 核心数据默认本地保存；联网插件/局域网同步由用户主动操作，后台不保证持续执行。
const store = require("./core/store.js");
const taskReminder = require("./core/taskReminder.js");

App({
  globalData: {
    // 捕获/详情页跳转时间块页时，希望时间块页定位到的日期（YYYY-MM-DD 或 null）
    pendingTimeblockDate: null,
  },

  onShow() { taskReminder.start(); },
  onHide() { taskReminder.stop(); store.saveNow(); },
  onLaunch() {
    store.initStore(store.seed());
  },
});
