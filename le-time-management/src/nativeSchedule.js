import { api } from "./api.js";

// Serialize lifecycle changes so a late startup can never cover a different plugin.
let control = Promise.resolve();
function send(action, bounds) {
  const result = control.catch(() => {}).then(() => api.nativeSchedule(action, bounds));
  control = result;
  return result;
}

/**
 * 课表视图入口。
 *
 * 只有走 `tauri.shiguang.conf.json` 打出来的「含原版课表」安装包才会带上
 * `native/shiguang/`（jpackage 产物，300 MB 上下）；默认的 `tauri.conf.json` 不带。
 * 所以原版 Compose 运行时是**增强**而不是**替代**：探测不到它、或者它起不来，
 * 就把视图交回插件自己的课表界面（`public/plugins/shiguang-schedule/`），
 * 而不是留一块只显示一行提示的死面板。见 docs/shiguang-native-port.md。
 *
 * @param {HTMLElement} container 宿主给的 `.plugview` 容器
 * @param {{refresh?: () => void}} ctx 宿主回调
 * @param {(el: HTMLElement) => (() => void) | void} [fallback] 插件自带渲染函数
 * @returns {() => void} 清理函数，宿主切换视图时调用
 */
export function renderNativeSchedule(container, ctx, fallback) {
  const originalStyle = container.style.cssText;
  let disposed = false;
  let delegated = null;              // 回退到插件界面后的清理函数
  let teardownNative = null;         // 原生分支的监听 / DOM 清理

  // 探测运行时期间先给一行状态，避免闪白。
  const probe = document.createElement("p");
  probe.className = "desc";
  probe.textContent = "正在准备课程表…";
  container.append(probe);

  /**
   * 交回插件自带界面。原生侧建出来的 DOM 与监听必须先拆干净，
   * 并把容器样式还原 —— 插件界面要的是 `.plugview` 默认的「撑满 + 可滚动」。
   */
  function degrade() {
    if (disposed || delegated) return;
    teardownNative?.();
    teardownNative = null;
    container.replaceChildren();
    container.style.cssText = originalStyle;
    if (typeof fallback !== "function") {
      container.append(hint("此版本尚未包含原版课表运行时，插件界面也不可用。"));
      return;
    }
    try {
      delegated = fallback(container, ctx) || null;
    } catch (e) {
      container.replaceChildren();
      container.append(hint(`课程表界面加载失败：${e.message || e}`));
    }
  }

  function hint(text) {
    const p = document.createElement("p");
    p.className = "desc";
    p.textContent = text;
    return p;
  }

  function startNative(status) {
    const region = document.createElement("div");
    region.className = "native-schedule-region";
    region.style.cssText = "width:100%;height:100%;min-height:360px;position:relative";
    const message = document.createElement("p");
    message.textContent = "正在打开时光课程表…";
    region.append(message);
    container.replaceChildren(region);
    container.style.cssText = "height:100%;padding:0;overflow:hidden";

    let ready = false, raf = 0, lastBounds = "";
    function resize() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (disposed || !ready) return;
        const r = region.getBoundingClientRect(), scale = window.devicePixelRatio || 1;
        const bounds = { x: Math.round(r.x * scale), y: Math.round(r.y * scale),
          width: Math.max(1, Math.round(r.width * scale)), height: Math.max(1, Math.round(r.height * scale)) };
        const key = JSON.stringify(bounds);
        if (key === lastBounds) return;
        lastBounds = key;
        send("show", bounds).then(() => { if (!disposed) message.textContent = ""; })
          .catch(() => { if (!disposed) { lastBounds = ""; degrade(); } });
      });
    }
    const observer = new ResizeObserver(resize);
    observer.observe(region);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    // The host's page animation changes position without resizing the region.
    const animTarget = container.closest(".view");
    animTarget?.addEventListener("animationend", resize);

    teardownNative = () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
      animTarget?.removeEventListener("animationend", resize);
      region.remove();
    };

    if (status.platform === "android") {
      const open = () => send("show").catch(() => { if (!disposed) degrade(); });
      message.textContent = "时光课程表";
      const button = document.createElement("button");
      button.textContent = "进入课表";
      button.addEventListener("click", open);
      region.append(button);
      open();
      return;
    }
    ready = true;
    resize();
  }

  api.nativeSchedule("status").then(status => {
    if (disposed) return;
    if (!status || !status.available) return degrade();
    startNative(status);
  }).catch(() => { degrade(); });

  return () => {
    // 只有真的起过原生窗口才需要 hide —— 探测阶段就退出的话，Rust 侧也是空操作，
    // 但 Android 会把这次调用转发给原生插件，没必要白跑一趟。
    const native = !!teardownNative;
    disposed = true;
    teardownNative?.();
    teardownNative = null;
    if (native) send("hide").catch(() => {});
    if (typeof delegated === "function") delegated();
  };
}
