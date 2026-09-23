// 「设置 › 关于 › 卸载应用」面板 —— 卸载这一步的最后一道确认在系统界面里，
// 这一层负责的是：让用户在按下按钮之前就知道会丢什么、以及顺手给一条备份退路。
//
// 为什么嵌在「关于」里：与上面的「软件更新」对称 —— 一个装新版、一个交系统卸，
// 主语都是「这台设备上的这个安装包」。独立的「危险操作」分区在这套设置页里没有先例，
// 也不该为这一个按钮开一个。挂载点是 src/views/aboutCard.js。
//
// 为什么桌面端不渲染：Windows / Linux 的卸载归系统管（NSIS 自带卸载器），
// 应用内做入口只是多一次间接，且没有「先退干净再拉卸载器」的可靠路径。
// Rust 侧对非 Android 恒返回 {launched:false}（见 src-tauri/src/uninstaller.rs）。
//
// 为什么浏览器调试模式仍然渲染：手机端的界面预览与录屏都跑在 :1420 的浏览器实例里，
// 这里一隐藏就等于这块界面永远截不到图。那种情况下按钮只提示、不会真的拉起什么。
import { el, toast, appConfirm } from "../../ui.js";
import { api } from "../../api.js";
import * as S from "../../store.js";
import { isAndroidRuntime } from "../../androidNotify.js";
import { fullBackup, downloadText } from "../../dataCenter.js";

/** 交给系统卸载 —— 只有 Android APK 做得到。 */
const canHandOff = () => isAndroidRuntime();

/** 二次确认文案：把「会丢什么」写在按钮前面，而不是丢了之后再解释。导出给测试盯措辞。 */
export function uninstallConfirmMessage(version) {
  const st = S.getState();
  const tasks = st.tasks?.length || 0;
  const blocks = st.blocks?.length || 0;
  const data = tasks || blocks
    ? `本机现有 ${tasks} 个任务、${blocks} 个时间块`
    : "本机目前没有任务与时间块";
  return [
    `${data}。这些数据只存在这台手机上，卸载后无法找回。`,
    // 浏览器调试模式给的是 "web-dev" 这种占位值，别把它当版本号印出来。
    /^\d+\.\d+\.\d+$/.test(version) ? `当前版本 v${version}。` : "",
    "点「继续卸载」只是把卸载交给系统的卸载程序，最终仍由你在系统弹窗里确认。",
    "需要先留一份的话，取消后用旁边的「导出完整备份」。",
  ].filter(Boolean).join("\n");
}

/**
 * @param {{ version?: string }} opts 当前版本号，只用于确认文案与备份文件署名
 * @returns {HTMLElement|null} 桌面端返回 null（调用方据此连分区标题一起跳过）
 */
export function createUninstallPanel({ version = "" } = {}) {
  if (!canHandOff() && api.isTauri) return null;

  const exportBtn = el("button", { class: "btn ghost sm", onclick: () => exportBackup(version) }, "导出完整备份");

  const uninstallBtn = el("button", {
    class: "btn danger",
    onclick: async () => {
      if (!canHandOff()) {
        toast("浏览器调试模式拉不起系统卸载程序，请在 APK 里操作");
        return;
      }
      const ok = await appConfirm("卸载 U-Time？", uninstallConfirmMessage(version), {
        confirmText: "继续卸载",
        cancelText: "先不卸载",
        danger: true,
        // 这类对话框的意义是「有人点头才算数」：没人看着就自动取消，
        // 而不是挂着一句「继续卸载」等下一次误触。
        timeoutMs: 20000,
        timeoutNote: "不操作",
      });
      if (!ok) return;
      try {
        const r = await api.appUninstall();
        if (r && r.launched === false) {
          toast(r.reason || "系统没有返回可用的卸载入口");
          return;
        }
        toast("已交给系统卸载程序，请在弹窗里最终确认", { ms: 8000 });
      } catch (e) {
        // 最常见的两种：清单漏了 REQUEST_DELETE_PACKAGES、或 gen/android 被
        // `tauri android init` 重建过丢了原生代码。原样报出来，别静默。
        toast(`拉不起系统卸载程序：${e.message || e}`);
      }
    },
  }, "卸载 U-Time");

  return el("div", { class: "uninstall-panel" },
    el("p", { class: "set-hint" }, "卸载由手机系统的卸载程序完成，这个入口只负责把它调起来。应用数据不会自动上传，也不会随卸载保留。"),
    el("div", { class: "data-actions" }, exportBtn, uninstallBtn),
  );
}

/**
 * 备份落盘：Android 上必须走 `save_download`。
 *
 * `<a download>` + blob 在 WebView 里不可靠（同「下载插件开发文档」那条路径的判断），
 * 所以这里失败就直接报错而不偷偷退回 blob 下载 —— 备份静默失败比导出失败更糟。
 */
async function exportBackup(version) {
  const name = `U-Time-full-backup-${S.todayStr()}.json`;
  const text = JSON.stringify(fullBackup(version), null, 2);
  if (!api.isTauri) {
    downloadText(name, text, "application/json");
    toast("完整备份已导出（浏览器调试模式）");
    return;
  }
  try {
    const path = await api.saveDownload(name, text);
    toast(`完整备份已保存：${path}`, { ms: 8000 });
  } catch (e) {
    toast(`备份写入下载目录失败：${e.message || e}`);
  }
}
