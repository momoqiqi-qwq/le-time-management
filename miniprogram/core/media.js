// 附件仍以 data URL 跨端保存，页面只传本地预览路径，避免大图挤爆 setData。
const LIMIT = 512 * 1024;
function chooseImages(count) {
  return new Promise((resolve, reject) => {
    const success = async result => {
      try {
        const list = result.tempFiles || [], output = [];
        for (const file of list) {
          const path = file.tempFilePath || file.path;
          if (file.size > LIMIT) throw new Error("单张图片请控制在 512KB 内，先压缩或裁剪后重试");
          const base64 = await new Promise((yes, no) => wx.getFileSystemManager().readFile({ filePath: path, encoding: "base64", success: r => yes(r.data), fail: no }));
          if (String(base64).length > Math.ceil(LIMIT * 4 / 3) + 8) throw new Error("图片超过 512KB，请先压缩");
          const match = String(path).match(/\.(png|gif|webp|jpe?g)(?:\?|$)/i), ext = match ? match[1].toLowerCase() : "jpeg";
          output.push("data:image/" + (ext === "jpg" ? "jpeg" : ext) + ";base64," + base64);
        }
        resolve(output);
      } catch (e) { reject(e); }
    };
    const fail = e => /cancel/i.test(e.errMsg || "") ? resolve([]) : reject(new Error("图片选择失败，请检查权限"));
    if (typeof wx.chooseMedia === "function") wx.chooseMedia({ count, mediaType: ["image"], sizeType: ["compressed"], sourceType: ["album", "camera"], success, fail });
    else if (typeof wx.chooseImage === "function") wx.chooseImage({ count, sizeType: ["compressed"], sourceType: ["album", "camera"], success, fail });
    else reject(new Error("当前微信不支持图片选择"));
  });
}
function previewScope() {
  const cache = new Map(), paths = new Set(); let disposed = false, serial = 0;
  const prefix = "utime-preview-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,7);
  const unlink = path => { try { wx.getFileSystemManager().unlink({ filePath:path, fail() {} }); } catch (e) {} };
  function load(url) {
    if (cache.has(url)) return cache.get(url);
    const promise = new Promise((resolve, reject) => {
      const match = String(url).match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)$/i);
      if (!match) { resolve(""); return; } // 远程图片仅在用户明确预览时请求。
      if (match[2].length > 8 * 1024 * 1024) { reject(new Error("附件较大，请在桌面端查看")); return; }
      const path = wx.env.USER_DATA_PATH + "/" + prefix + "-" + (++serial) + "." + (match[1] === "jpeg" ? "jpg" : match[1]);
      wx.getFileSystemManager().writeFile({ filePath:path, data:match[2], encoding:"base64", success() {
        if (disposed) { unlink(path); resolve(""); return; }
        paths.add(path); resolve(path);
      }, fail: () => reject(new Error("附件预览失败，请先导出备份检查图片")) });
    });
    cache.set(url, promise); return promise;
  }
  return { load, dispose() { disposed = true; paths.forEach(unlink); paths.clear(); cache.clear(); } };
}
module.exports = { LIMIT, chooseImages, previewScope };
