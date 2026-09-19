/**
 * 端内扫一扫：把「电脑上那张配对二维码」变成手机上的一个摄像头取景框。
 *
 * ## 为什么值得单独做这一层
 * 之前手机要连电脑，得在电脑上「复制链接」→ 微信发给自己 → 手机上长按复制 →
 * 回到设置页粘进输入框，四步里任何一步都能把小白劝退。而那张二维码本来就摆在
 * 电脑的设置页上（src-tauri/src/lan.rs 的 /qr.svg），旁边就是相机 —— 差只是一个解码器。
 *
 * ## 为什么解码走网页相机 + jsQR，而不是写 Kotlin
 * wry 在 Android 上已经把 WebView 的 onPermissionRequest 接好了：视频采集请求会
 * 触发系统相机授权，同意了才 grant（wry 的 RustWebChromeClient.kt）。所以端内只要
 * getUserMedia 就能拿到画面，不用自己写 CameraX，也不用引 ML Kit —— 后者依赖 Google
 * 服务，国内机器上一大半没有，做出来就是「时好时坏的扫码」。
 *
 * ## 为什么解码器要动态 import
 * jsQR 压缩前 252 KB，塞进核心 bundle 等于每次启动都白背它。只有真的点开扫码才加载，
 * 桌面端和从不扫码的人永远不为它付流量（同 pinyinInitial 那类「按需才带」的处理）。
 *
 * ## 为什么解出来不直接开干
 * 相机里能扫到的东西不该被信任成指令。这里只负责把字符串交回去，认不认得出配对链接
 * 由调用方拿 parseLanTarget 判定 —— 扫到别的二维码（付款码、网址）就明确说「这不是
 * 本程序的配对码」，绝不静默填进输入框。
 */
import { el } from "./ui.js";

/** 解码用的降采样边长。配对码是纯 ASCII 短链接，480px 足够稳，再大只是白烧 CPU。 */
const SCAN_MAX_EDGE = 480;
/** 两次取帧的间隔。手机解码一帧十几到几十毫秒，太快会把相机和 UI 一起拖住。 */
const SCAN_INTERVAL_MS = 120;

/** 相机不可用时给用户的一句人话。浏览器抛的那些名字没一个看得懂。 */
function describeCameraError(e) {
  const name = String(e?.name || "");
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "没拿到相机权限。授权弹窗里点「允许」再扫一次；之前拒过的话要到 系统设置 → 应用 → U-Time → 权限 里放出来";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "这台设备上没有可用的相机";
  if (name === "NotReadableError") return "相机被别的程序占着（微信、扫码类应用都会这样），先关掉那边再扫";
  return `相机打不开：${e?.message || e || "未知原因"}`;
}

/** 能不能扫：桌面端与浏览器调试环境没有相机（也不是安全上下文），按钮就该干脆藏掉。 */
export function canScanQr() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * 弹一个全屏取景层扫码，成功返回码里的文本，取消返回 null。
 *
 * 根元素带 drawer-mask：这是 backNav 的浮层约定，Android 返回键才会把它当成
 * 最上层关掉（它按「遮罩 → _close → 带「取消」字样的按钮」三条路依次试）。
 * 故意不绑「点遮罩就关」—— 取景的时候误触屏幕不该放弃这次扫码。
 * 无论成功、取消还是出错，相机一定被关掉：留一个开着的摄像头在后台是最恶劣的漏。
 */
export async function scanQr() {
  if (!canScanQr()) throw new Error("这个环境里没有相机可用");
  const { default: jsQR } = await import("jsqr");

  const video = el("video", { class: "qrscan-video", autoplay: true, muted: true, playsinline: true, "aria-label": "扫码取景" });
  const cancel = el("button", { class: "qrscan-cancel", type: "button" }, "取消");
  const box = el("div", { class: "drawer-mask qrscan", role: "dialog", "aria-modal": "true", "aria-label": "扫描配对二维码" },
    video,
    el("div", { class: "qrscan-frame" }),
    el("p", { class: "qrscan-hint" }, "把电脑上的配对二维码放进框里"),
    cancel,
  );
  document.body.append(box);

  let settled = false;
  let resolveResult = null;
  let stream = null;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const onKey = (e) => { if (e.key === "Escape") close(null); };
  const close = (value) => {
    if (settled) return;
    settled = true;
    // 三件事一件都不能漏：停轨道（摄像头）、摘监听（Esc）、拆 DOM。
    stream?.getTracks().forEach((t) => t.stop());
    document.removeEventListener("keydown", onKey, true);
    box.remove();
    resolveResult(value);
  };
  cancel.addEventListener("click", () => close(null));
  document.addEventListener("keydown", onKey, true);

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch (e) {
    close(null);
    throw new Error(describeCameraError(e));
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const loop = () => {
    if (settled) return;
    // 相机还没出画面（授权刚过、首帧未到）就空转下一拍，别在这里抛错。
    if (video.videoWidth && video.videoHeight && ctx) {
      try {
        const scale = Math.min(1, SCAN_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * scale));
        const h = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h);
        // dontInvert：屏幕上的是深码浅底，反相那一遍只是白花时间。
        const code = jsQR(frame.data, w, h, { inversionAttempts: "dontInvert" });
        if (code?.data) {
          close(String(code.data));
          return;
        }
      } catch (e) {
        // 单帧解码抛错不停整个扫码：相机还在转，下一帧接着找。
        console.warn("扫码取帧失败", e);
      }
    }
    setTimeout(loop, SCAN_INTERVAL_MS);
  };
  loop();
  return result;
}
