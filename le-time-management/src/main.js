import { initStore, todayStr, getState } from "./store.js";
import { renderShell } from "./shell.js";
import { initPluginHost } from "./pluginHost.js";
import { initCapture } from "./capture.js";
import { api } from "./api.js";
import { initTheme } from "./theme.js";
import { initBackground } from "./background.js";
import { initUiPreferences, getUiPreferences } from "./uiPreferences.js";
import { applyWindowSize } from "./windowSize.js";
import { initTaskReminders } from "./taskReminder.js";
import { initCommandPalette } from "./commandPalette.js";
import { initGlobalShortcuts } from "./globalShortcuts.js";
import { initAutomation } from "./automation.js";
import { initMotionInteractions } from "./motion.js";

// 首次启动的种子数据（Tauri 端由 Rust seed_data() 生成；浏览器调试用这份）
function seed() {
  const d = todayStr();
  return {
    version: 1,
    tasks: [
      { id: "t1", title: "回复导师：开题修改稿", note: "", quad: 1, done: true, estMin: 15, tags: ["论文"], project: "毕业设计", due: d, createdAt: Date.now() },
      { id: "t2", title: "修复登录页线上 bug", note: "疑似 token 过期逻辑", quad: 1, done: false, estMin: 60, tags: ["线上"], project: "毕业设计平台", due: d, createdAt: Date.now() },
      { id: "t3", title: "答辩 PPT · 第 3 章图表重绘", note: "", quad: 1, done: false, estMin: 120, tags: ["答辩"], project: "毕业设计", due: d, createdAt: Date.now() },
      { id: "t4", title: "精读《深度工作》第 4 章", note: "", quad: 2, done: false, estMin: 45, tags: ["读书"], project: "读书计划", due: null, createdAt: Date.now() },
      { id: "t5", title: "每周健身 3 次 · 第 2 次", note: "背 + 二头", quad: 2, done: false, estMin: 40, tags: ["运动"], project: "", due: null, createdAt: Date.now() },
      { id: "t6", title: "回飞书群消息 12 条", note: "", quad: 3, done: false, estMin: 10, tags: [], project: "", due: d, createdAt: Date.now() },
      { id: "t7", title: "取快递 + 缴水电费", note: "", quad: 3, done: false, estMin: 20, tags: ["生活"], project: "", due: d, createdAt: Date.now() },
      { id: "t8", title: "整理相册 · 6 月旅行", note: "", quad: 4, done: false, estMin: 30, tags: [], project: "", due: null, createdAt: Date.now() },
    ],
    blocks: [
      { id: "b1", date: d, start: "09:00", durMin: 120, title: "论文写作 · 第 3 章", taskId: null, cat: "work" },
      { id: "b2", date: d, start: "11:00", durMin: 45, title: "整理参考文献", taskId: null, cat: "work" },
      { id: "b3", date: d, start: "11:45", durMin: 75, title: "午餐 + 散步", taskId: null, cat: "life" },
    ],
    settings: {},
    plugins: {},
  };
}

async function boot() {
  await initStore(seed());
  initTheme();
  initBackground();
  initUiPreferences();
  // 启动窗口大小：桌面端按设置套一次（不阻塞首屏，失败也不影响启动）
  applyWindowSize(getUiPreferences()).catch(() => {});
  initMotionInteractions();
  renderShell(document.getElementById("app"));
  initCapture();
  initTaskReminders();
  initCommandPalette();
  initGlobalShortcuts().catch((e) => console.warn("全局快捷键不可用:", e));
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
      api.lanStart(Number(st.lanPort), st.lanToken).catch((e) => console.error("联动服务启动失败:", e));
    }
  }
  // 插件加载放在界面之后，不阻塞首屏
  initPluginHost().catch((e) => console.error("插件宿主初始化失败:", e));
}

boot();
