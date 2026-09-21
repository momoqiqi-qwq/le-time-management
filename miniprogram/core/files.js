// 原生文件入口。仅用户点按钮时调用，不上传到第三方服务器。
const MAX_BYTES = 8 * 1024 * 1024;
function errorText(error) { return (error && (error.message || error.errMsg)) || "操作失败"; }
function cancelled(error) { return /cancel/i.test(errorText(error)); }
function readText(extensions, maxBytes) {
  return new Promise((resolve, reject) => {
    if (typeof wx.chooseMessageFile !== "function") { reject(new Error("当前微信不支持选择文件，请使用粘贴导入")); return; }
    wx.chooseMessageFile({ count: 1, type: "file", extension: extensions, success(result) {
      const file = result.tempFiles && result.tempFiles[0];
      if (!file) { resolve(null); return; }
      const ext = String(file.name || "").split(".").pop().toLowerCase();
      if (!extensions.includes(ext)) { reject(new Error("请选择 " + extensions.join(" / ") + " 文件")); return; }
      const limit = maxBytes || MAX_BYTES;
      if (file.size > limit) { reject(new Error("文件过大，请控制在 " + Math.round(limit / 1024 / 1024) + "MB 内")); return; }
      wx.getFileSystemManager().readFile({ filePath: file.path, encoding: "utf8", success(out) {
        const text = String(out.data || "");
        if (text.length > limit) { reject(new Error("文件内容过大")); return; }
        resolve({ name: file.name, text });
      }, fail: err => reject(new Error(errorText(err))) });
    }, fail: err => cancelled(err) ? resolve(null) : reject(new Error(errorText(err))) });
  });
}
function exportText(name, text) {
  return new Promise((resolve, reject) => {
    if (!wx.env || !wx.env.USER_DATA_PATH || typeof wx.getFileSystemManager !== "function") { reject(new Error("文件功能不可用，可改用复制备份")); return; }
    const safeName = String(name || "U-Time.txt").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    const ext = safeName.split(".").pop().toLowerCase();
    if (!["json", "csv", "ics", "txt"].includes(ext)) { reject(new Error("导出格式不支持")); return; }
    // 每种格式复用一个自有临时文件，避免反复导出耗尽沙盒空间。
    const path = wx.env.USER_DATA_PATH + "/utime-export." + ext;
    wx.getFileSystemManager().writeFile({ filePath: path, data: String(text), encoding: "utf8", success() {
      if (typeof wx.shareFileMessage !== "function") {
        reject(new Error("当前微信不支持分享文件，请升级微信或使用复制备份")); return;
      }
      wx.shareFileMessage({ filePath: path, fileName: safeName, success: () => resolve(true), fail: err => cancelled(err) ? resolve(false) : reject(new Error(errorText(err))) });
    }, fail: err => reject(new Error(errorText(err))) });
  });
}
function copyText(text) {
  return new Promise((resolve, reject) => wx.setClipboardData({ data: String(text), success: () => resolve(true), fail: err => reject(new Error(errorText(err))) }));
}
function notifyError(error) { wx.showModal({ title: "未完成操作", content: errorText(error).slice(0, 700), showCancel: false }); }
module.exports = { readText, exportText, copyText, errorText, cancelled, notifyError, MAX_BYTES };
