// U-Time · 微信小程序版
// 与桌面端（Tauri）共用同一套数据结构与中文时间解析逻辑；
// 数据保存在小程序本地存储（单 JSON），无账号、无联网。
const store = require("./core/store.js");
const taskReminder = require("./core/taskReminder.js");

App({
  globalData: {
    // 捕获/详情页跳转时间块页时，希望时间块页定位到的日期（YYYY-MM-DD 或 null）
    pendingTimeblockDate: null,
  },

  onShow() { taskReminder.start(); },
  onHide() { taskReminder.stop(); },
  onLaunch() {
    store.initStore(store.seed());
  },
});
