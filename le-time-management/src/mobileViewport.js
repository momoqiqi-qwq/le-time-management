// 手机端放开双指缩放手势。
//
// index.html 的 viewport 写着 `maximum-scale=1.0, user-scalable=no` —— 这是给桌面窗口
// 定的（Tauri 窗口有自己的尺寸设置，Ctrl+滚轮缩放只会让用户以为界面坏了）。但 Blink 会
// 按这一行直接禁掉缩放手势，即使原生侧已经把 builtInZoomControls 打开（见 MainActivity
// 的 onWebViewCreate），双指缩放照样没反应。
//
// 所以只在 Android 上把 viewport 换成允许放大的版本：原生打开内置缩放机制 + 这里放开
// user-scalable，两者缺一不可。桌面（Windows WebView2）保持原样不动。

const MOBILE_ZOOM_VIEWPORT = "width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover";

/** 是否是需要放开缩放的手持设备（Android / iOS，与 isDesktopRuntime 的判断互为反面）。 */
function needsTouchZoom(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /Android|iPhone|iPad|iPod/i.test(String(ua || ""));
}

/**
 * 放开双指缩放。返回是否真的改了 viewport（便于测试与诊断）。
 * @param {Document} doc
 * @param {string} ua
 */
export function applyTouchZoomViewport(doc = document, ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (!needsTouchZoom(ua)) return false;
  const meta = doc.querySelector?.('meta[name="viewport"]');
  if (!meta) return false;
  if (meta.getAttribute("content") === MOBILE_ZOOM_VIEWPORT) return false;
  meta.setAttribute("content", MOBILE_ZOOM_VIEWPORT);
  return true;
}
