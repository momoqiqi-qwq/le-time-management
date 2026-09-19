import { initStore, getState } from "./store.js";
import { renderShell } from "./shell.js";
import { initPluginHost } from "./pluginHost.js";
import { initCapture } from "./capture.js";
import { api } from "./api.js";
import { initTheme } from "./theme.js";
import { initUiPreferences, getUiPreferences } from "./uiPreferences.js";
import { initUiScale } from "./uiScale.js";
import { applyWindowSize } from "./windowSize.js";
import { applyTouchZoomViewport } from "./mobileViewport.js";
import { initTaskReminders } from "./taskReminder.js";
import { initCommandPalette } from "./commandPalette.js";
import { initGlobalShortcuts } from "./globalShortcuts.js";
import { initAutomation } from "./automation.js";
import { initMotionInteractions } from "./motion.js";
import { initLanPushGate } from "./lanPushGate.js";
import { initUpdateChecker } from "./updateChecker.js";

// 首次启动的初始数据 —— 刻意全空，让空状态引导用户自己建第一条（对接 Rust seed_data()）。
// ⚠️ 这里不要再塞示例任务：首启四象限/时间块该是干净的。样例请做成显式入口（如「恢复示例数据」）。
function seed() {
  return {
    version: 1,
    tasks: [],
    blocks: [],
    settings: {},
    plugins: {},
  };
}

async function boot() {
  // 手机端放开双指缩放：必须在首屏渲染前改 viewport（原生侧 builtInZoomControls 在
  // MainActivity.onWebViewCreate 里打开，两边缺一不可）。
  applyTouchZoomViewport();
  await initStore(seed());
  initTheme();
  initUiPreferences();
  // 界面缩放的 resize 监听必须无条件挂上（即使当前是 100%）：用户随后在设置里调大缩放时，
  // --ui-vw/--ui-vh 需要跟着窗口尺寸重算，不能等到下次启动才生效。
  // 缩放值本身已由 initUiPreferences → applyUiPreferences → applyUiScale 套用，
  // 这里只负责补挂监听（applyUiScale 幂等，重复调用无副作用）。
  initUiScale();
  // 启动窗口大小：桌面端按设置套一次（不阻塞首屏，失败也不影响启动）
  applyWindowSize(getUiPreferences()).catch(() => {});
  initMotionInteractions();
  renderShell(document.getElementById("app"));
  initCapture();
  initTaskReminders();
  initCommandPalette();
  initGlobalShortcuts().catch((e) => console.warn("全局快捷键不可用:", e));
  // 应用内更新：内部自己延迟 8s 再查，且不 await —— 绝不挡住首屏。
  initUpdateChecker();
  api.appInfo().then((x) => initAutomation(x?.version || "")).catch(() => initAutomation(""));
  // 手机端（局域网）指令 → 应用统一数据层
  if (api.isTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    listen("lan-command", (e) => {
      const c = e.payload || {};
      if (c.action === "toggle" && c.id) {
        import("./store.js").then((S) => S.toggleTask(c.id));
      } else if (c.action === "add" && c.title) {
        import("./store.js").then((S) => S.addTask({ title: c.title, quad: 1, estMin: 30, due: S.todayStr(), tags: ["手机"] }));
      }
    });
    // 自动启动局域网联动服务
    const st = getState().settings;
    if (st.lanAuto && st.lanPort && st.lanToken) {
      api.lanStart(Number(st.lanPort), st.lanToken, Boolean(st.lanPush)).catch((e) => console.error("联动服务启动失败:", e));
    }
    // 托盘「退出」：Rust 侧广播 app-quit 后**等这里的存盘回执**再退出（最多 2s 兜底）。
    // 回执必须成功、失败都发 —— 否则写盘报错时 Rust 会白等满 2s 才退出。
    listen("app-quit", () => {
      const ack = () => api.quitAck().catch(() => {});
      import("./store.js")
        .then((S) => S.saveNow())
        .then(ack, ack);
    });
    // 手机推回来的数据要不要接收，由电脑端这个确认门决定（挂在全局：推送来的时候
    // 用户多半没开着设置页）。版本带上是为了恢复点能记住是哪版存的。
    api.appInfo()
      .then((x) => initLanPushGate(x?.version || ""))
      .catch(() => initLanPushGate(""));
  }
  // 插件加载放在界面之后，不阻塞首屏
  initPluginHost().catch((e) => console.error("插件宿主初始化失败:", e));
}

boot();
