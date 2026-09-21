// 原生适配入口与实际边界。native 表示原生实现，不表示具备桌面全部系统权限。
const store = require("./store.js");
const SPECIAL = {
  "shiguang-schedule": "/pages/schedule/index",
  "web-collector": "/pages/library/index?id=web-collector",
  "rss-reader": "/pages/library/index?id=rss-reader",
};
const GENERIC = ["pomodoro", "weekly-report", "cn-holiday", "exam-calendar", "dorm-duty", "inbox-drop", "plugin-guide", "wechat-push", "gx-news", "chaoxing-notify"];
const NOTES = {
  "shiguang-schedule": "原生课表、课程编辑、JSON/CSV/TSV/HTML 导入与时间块联动；不提供教务网页自动登录/OCR。",
  "web-collector": "原生收藏、编辑、搜索与复制链接；不抓取任意网站，不承诺任意网页内嵌。",
  "rss-reader": "原生摘要阅读、已读/收藏、转任务和 XML 导入；联网刷新需要 HTTPS 与微信合法域名配置。",
  "school-notice": "学校网站任意域名抓取依赖桌面网络桥，当前小程序不提供这一能力。",
  "cppu-notify": "教务/门户登录、验证码与网络环境尚未完成原生适配。",
};
function route(id) { return Object.prototype.hasOwnProperty.call(SPECIAL,id) ? SPECIAL[id] : "/pages/plugin/index?id=" + encodeURIComponent(String(id || "")); }
function enabled(id) {
  if (store.isPluginEnabled(id)) return true;
  wx.showModal({ title: "插件未启用", content: "请先在插件中心启用，再打开此功能。", showCancel: false, success() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: "/pages/quadrant/index" }) });
  } });
  return false;
}
module.exports = { SPECIAL, GENERIC, NOTES, route, enabled };
