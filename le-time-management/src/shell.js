// 应用外壳：侧栏导航 + 顶栏 + 视图切换
import * as S from "./store.js";
import { appIcon } from "./icons.js";
import { api } from "./api.js";
import { appConfirm, appPrompt, el, toast } from "./ui.js";
import { renderQuadrant } from "./views/quadrant.js";
import { renderTimeblock } from "./views/timeblock.js";
import { renderSettings } from "./views/settings.js";
import { renderInbox } from "./views/inbox.js";
import { openQuickCapture } from "./capture.js";
import { pluginViews, onNavChanged, getRegistry, setEnabled, rescan, removeExternalPlugin } from "./pluginHost.js";
import { getPluginOverride, pluginAccent, pluginDisplayIcon, pluginDisplayName, resetPluginOverride, setPluginOverride } from "./pluginAppearance.js";
import { getUiPreferences } from "./uiPreferences.js";
import { closeLayer, observePluginMotion, removeWithMotion } from "./motion.js";
import { isDesktopRuntime } from "./windowSize.js";
import { initBackNav, noteViewChange } from "./backNav.js";

// 注意：模块导入阶段 state 还未初始化，activeView 必须延迟到 renderShell 时读取
let activeView = null;
let marketQuery = "";
let marketFilter = "all";
let marketSearchOpen = false;
function ensureActiveView() {
  if (activeView === null) {
    const prefs = getUiPreferences();
    const saved = S.getState().settings.lastView;
    const fixedStart = prefs.startupView !== "last" ? prefs.startupView : null;
    if (fixedStart && ["quadrant", "timeblock", "inbox", "market"].includes(fixedStart)) activeView = fixedStart;
    else if (["quadrant", "timeblock", "inbox", "market"].includes(saved)) activeView = saved;
    else if (typeof saved === "string" && saved.startsWith("plug:")) activeView = saved;
    else activeView = "quadrant";
  }
  return activeView;
}

const VIEWS = [
  { id: "quadrant", icon: "table-cells-large", title: "四象限", sub: "先决定，再动手" },
  { id: "timeblock", icon: "clock", title: "时间块", sub: "把任务装进一天的格子" },
  { id: "inbox", icon: "inbox", title: "收件箱", sub: "自动化与待确认事项" },
  { id: "market", icon: "puzzle-piece", title: "插件", sub: "扩展能力集中在这里" },
];
const PLUGIN_ICONS = {
  "pomodoro": "hourglass-half",
  "weekly-report": "chart-column",
  "gx-news": "trophy",
  "chaoxing-notify": "graduation-cap",
  "cppu-notify": "building-columns",
  "wechat-push": "comment-dots",
};
const TOPBAR_PARTS = ["search", "quick", "stats", "window"];

function topbarOrderState() {
  const settings = S.getState().settings;
  const saved = Array.isArray(settings.topbarOrder) ? settings.topbarOrder : [];
  settings.topbarOrder = [...saved.filter((id) => TOPBAR_PARTS.includes(id)), ...TOPBAR_PARTS.filter((id) => !saved.includes(id))];
  return settings.topbarOrder;
}

function moveTopbarPart(source, target, after = false) {
  if (!TOPBAR_PARTS.includes(source) || !TOPBAR_PARTS.includes(target) || source === target) return false;
  const order = [...topbarOrderState()];
  order.splice(order.indexOf(source), 1);
  const targetIndex = order.indexOf(target);
  order.splice(targetIndex + (after ? 1 : 0), 0, source);
  S.getState().settings.topbarOrder = order;
  S.persistSoon();
  return true;
}
function viewDef(id) {
  if (id.startsWith("plug:")) {
    const v = pluginViews.find((x) => `plug:${x.id}` === id);
    // 插件视图副标题不放 manifest.description（长简介会把桌面标题卡撑爆、名称被裁），
    // 顶栏只保留插件名称；核心视图的短文案副标题不受影响
    return v ? { id, icon: PLUGIN_ICONS[v.pluginId] || v.icon || "puzzle-piece", title: pluginDisplayName(v.pluginId, v.title), sub: "", pluginView: v } : null;
  }
  return VIEWS.find((v) => v.id === id) || VIEWS[0];
}

function pluginOrderState() {
  const settings = S.getState().settings;
  settings.pluginOrder = Array.isArray(settings.pluginOrder) ? settings.pluginOrder.filter(Boolean) : [];
  return settings.pluginOrder;
}

function orderedPluginViews() {
  const order = pluginOrderState();
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...pluginViews].sort((a, b) => {
    const ar = rank.has(a.pluginId) ? rank.get(a.pluginId) : Number.MAX_SAFE_INTEGER;
    const br = rank.has(b.pluginId) ? rank.get(b.pluginId) : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    return String(a.title || a.id).localeCompare(String(b.title || b.id), "zh-CN");
  });
}

function movePluginBefore(sourcePluginId, targetPluginId) {
  if (!sourcePluginId || !targetPluginId || sourcePluginId === targetPluginId) return false;
  const ids = [...new Set(pluginViews.map((x) => x.pluginId))];
  const saved = pluginOrderState();
  const current = [...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))];
  const from = current.indexOf(sourcePluginId);
  const to = current.indexOf(targetPluginId);
  if (from < 0 || to < 0) return false;
  current.splice(from, 1);
  current.splice(current.indexOf(targetPluginId), 0, sourcePluginId);
  S.getState().settings.pluginOrder = current;
  S.persistSoon();
  return true;
}

// 翻页顺序：滑动/翻页沿此序（插件页夹在时间块和插件市场之间）
function allViewIds() {
  return ["quadrant", "timeblock", "inbox", ...orderedPluginViews().map((pv) => `plug:${pv.id}`), "market"];
}

export function renderShell(root) {
  ensureActiveView();
  const desktopWindow = isDesktopRuntime();
  const dragRegion = desktopWindow ? "" : null;
  const settings = S.getState().settings;
  settings.quickDock ??= { left: null, top: 92, collapsed: false, alwaysOnTop: false };
  const quickDockState = settings.quickDock;
  const nav = el("nav", { class: "nav" });
  const view = el("div", { class: "view" });
  const titleEl = el("h1", {});
  const subEl = el("span", { class: "sub" });
  // v0.39.0：标题卡左侧恢复小框 —— 但不再是 v0.38.2 之前那颗恒装 Le 应用图标的
  // 42px 死框，而是紧凑尺寸（22px，窄屏 20px），图标跟随当前视图：
  // 插件页装插件自己的图标（如竞赛消息的奖杯），核心页装各视图导航图标。
  const titleMark = el("span", { class: "topbar-title-mark", "aria-hidden": "true" });
  const statPill = el("span", { class: "pill" });
  const quickDockToggle = el("button", { class: "top-mini-btn quick-menu-trigger", title: "快捷入口", type: "button", "aria-haspopup": "menu", "aria-expanded": "false" },
    el("span", { class: "quick-menu-avatar", "aria-hidden": "true" }, "YL"),
    el("span", { class: "quick-menu-trigger-label" }, "快捷入口"),
  );

  let settingsDockBtn = null;
  let quickDock = null;
  let pinActionBtn = null;
  let navTransitionSeq = 0;

  const rail = el("aside", { class: "rail" },
      el("div", { class: "brand" },
      el("span", { class: "mark" }),
      el("div", {}, el("b", {}, "Le时间管理"), el("small", {}, "LE · TIME MANAGEMENT")),
    ),
    nav,
    el("div", { class: "rail-bottom" },
      settingsDockBtn = settingsButton(),
    ),
  );

  const makeWindowControl = (kind, label, handler) => el("button", {
    class: `window-control window-control-${kind}`,
    type: "button",
    title: label,
    "aria-label": label,
    onclick: handler,
  }, el("span", { class: `window-control-glyph window-control-glyph-${kind}`, "aria-hidden": "true" }));

  const windowControls = desktopWindow ? el("div", { class: "window-controls", "data-noswipe": "", title: "拖动可调整顶栏位置" },
    makeWindowControl("minimize", "最小化", () => withCurrentWindow((win) => win.minimize())),
    makeWindowControl("maximize", "最大化 / 还原", () => withCurrentWindow((win) => win.toggleMaximize())),
    makeWindowControl("close", "关闭", () => withCurrentWindow((win) => win.close())),
  ) : null;

  const topSearch = el("button", { class: "top-search", title: "全局搜索 / 命令面板（Ctrl+K）· 拖动可调整位置", type: "button", onclick: () => window.dispatchEvent(new CustomEvent("tide:command-palette")) },
    el("span", {}, "⌕"), el("span", { class: "top-search-label" }, "搜索 / 命令"), el("kbd", {}, "Ctrl K"));
  const topbarActionCard = el("div", { class: "topbar-action-card", "aria-label": "可拖动排序的顶栏工具" });
  const topbar = el("header", { class: "topbar", "data-tauri-drag-region": dragRegion },
      el("div", { class: "topbar-title-card", "data-tauri-drag-region": dragRegion },
        // v0.39.0：小框回归（紧凑版），图标随视图切换（见 renderTitleMark）；
        // 右侧标题仍直接写在顶栏这两条横线之间（v0.37.15「框太多」只针对右侧工具卡）。
        titleMark,
        el("div", { class: "topbar-title-copy", "data-tauri-drag-region": dragRegion }, titleEl, subEl),
      ),
      desktopWindow ? el("span", { class: "window-drag-strip", "data-tauri-drag-region": dragRegion }) : null,
      topbarActionCard,
    );
  const main = el("main", { class: "main" },
    topbar,
    view,
  );

  const appFrame = el("div", { class: "app" }, rail, main);
  root.append(appFrame);

  function renderTopbarOrder() {
    const parts = { search: topSearch, quick: quickDockToggle, stats: statPill, window: windowControls };
    topbarActionCard.replaceChildren(...topbarOrderState().map((id) => parts[id]).filter(Boolean));
    for (const [id, node] of Object.entries(parts)) {
      if (!node) continue;
      node.draggable = desktopWindow;
      node.dataset.topbarPart = id;
      node.classList.add("topbar-sortable");
      if (!desktopWindow) continue;
      if (node.dataset.topbarDragBound) continue;
      node.dataset.topbarDragBound = "true";
      node.addEventListener("dragstart", (event) => {
        node.classList.add("topbar-dragging");
        event.dataTransfer?.setData("text/topbar-part", id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      node.addEventListener("dragend", () => {
        topbarActionCard.querySelectorAll(".topbar-dragging,.topbar-drop-before,.topbar-drop-after").forEach((item) => item.classList.remove("topbar-dragging", "topbar-drop-before", "topbar-drop-after"));
      });
      node.addEventListener("dragover", (event) => {
        event.preventDefault();
        const after = event.clientX > node.getBoundingClientRect().left + node.getBoundingClientRect().width / 2;
        node.classList.toggle("topbar-drop-before", !after);
        node.classList.toggle("topbar-drop-after", after);
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      node.addEventListener("dragleave", () => node.classList.remove("topbar-drop-before", "topbar-drop-after"));
      node.addEventListener("drop", (event) => {
        event.preventDefault();
        const source = event.dataTransfer?.getData("text/topbar-part");
        const after = node.classList.contains("topbar-drop-after");
        node.classList.remove("topbar-drop-before", "topbar-drop-after");
        if (moveTopbarPart(source, id, after)) {
          renderTopbarOrder();
          toast("顶栏顺序已保存");
        }
      });
    }
  }
  renderTopbarOrder();

  let pluginContextMenu = null;
  let pendingPluginIconId = null;
  const pluginZipInput = el("input", { type: "file", accept: ".zip,application/zip", multiple: true, hidden: true });
  const pluginIconInput = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml", hidden: true });
  root.append(pluginZipInput, pluginIconInput);

  function refreshPluginPresentation() {
    renderNav();
    if (activeView === "market" || activeView.startsWith("plug:")) switchTo(activeView, undefined, { history: false });
  }

  pluginZipInput.addEventListener("change", async () => {
    const files = [...pluginZipInput.files];
    if (!files.length) return;
    try {
      const imported = [];
      for (const file of files) {
        const bytes = [...new Uint8Array(await file.arrayBuffer())];
        imported.push(...await api.importPluginZip(bytes));
      }
      await rescan();
      toast(`已导入 ${new Set(imported).size} 个插件`);
    } catch (error) {
      toast(`插件导入失败：${error.message || error}`);
    } finally {
      pluginZipInput.value = "";
    }
  });

  pluginIconInput.addEventListener("change", async () => {
    const file = pluginIconInput.files?.[0];
    const pluginId = pendingPluginIconId;
    pendingPluginIconId = null;
    if (!file || !pluginId) return;
    try {
      if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
      if (file.size > 1024 * 1024) throw new Error("图标不能超过 1 MB");
      const icon = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图标失败"));
        reader.readAsDataURL(file);
      });
      setPluginOverride(pluginId, { icon });
      refreshPluginPresentation();
      toast("插件图标已更新");
    } catch (error) {
      toast(`修改图标失败：${error.message || error}`);
    } finally {
      pluginIconInput.value = "";
    }
  });

  function closePluginContextMenu(immediate = false) {
    const menu = pluginContextMenu;
    pluginContextMenu = null;
    if (!menu) return;
    if (immediate) menu.remove();
    else removeWithMotion(menu);
  }

  function openPluginContextMenu(event, pluginId) {
    event.preventDefault();
    event.stopPropagation();
    closePluginContextMenu(true);
    const rec = getRegistry().find((item) => item.id === pluginId);
    if (!rec) return;
    const fallbackName = rec.manifest?.name || pluginViews.find((item) => item.pluginId === pluginId)?.title || pluginId;
    const displayName = pluginDisplayName(pluginId, fallbackName);
    const menuButton = (label, onClick, { danger = false, disabled = false, title = "" } = {}) => el("button", {
      class: `plugin-context-item${danger ? " danger" : ""}`,
      type: "button",
      disabled: disabled ? true : null,
      title: title || null,
      onclick: async () => {
        if (disabled) return;
        closePluginContextMenu();
        await onClick();
      },
    }, label);
    const menu = el("div", { class: "plugin-context-menu", role: "menu", "aria-label": `${displayName}插件菜单` },
      el("div", { class: "plugin-context-head" }, pluginDisplayIcon(pluginId, displayName), el("span", {}, el("b", {}, displayName), el("small", {}, rec.source === "builtin" ? "内置插件" : "用户插件"))),
      menuButton("重命名", async () => {
        const value = await appPrompt("重命名插件", { label: "输入插件显示名称（留空恢复默认名称）", value: displayName, confirmText: "保存" });
        if (value === null) return;
        setPluginOverride(pluginId, { name: value });
        refreshPluginPresentation();
        toast(value ? "插件名称已更新" : "已恢复默认名称");
      }),
      menuButton("修改图标…", () => {
        pendingPluginIconId = pluginId;
        pluginIconInput.click();
      }),
      menuButton("恢复默认名称与图标", () => {
        resetPluginOverride(pluginId);
        refreshPluginPresentation();
        toast("已恢复插件默认外观");
      }, { disabled: !Object.keys(getPluginOverride(pluginId)).length }),
      el("div", { class: "plugin-context-separator", role: "separator" }),
      menuButton("导入插件…", () => pluginZipInput.click()),
      menuButton("删除插件", async () => {
        if (!(await appConfirm(`删除用户插件「${displayName}」？`, "插件文件夹和保存状态将一并移除。", { confirmText: "删除", danger: true }))) return;
        try {
          await removeExternalPlugin(pluginId);
          resetPluginOverride(pluginId);
          toast(`已删除「${displayName}」`);
        } catch (error) {
          toast(`删除失败：${error.message || error}`);
        }
      }, { danger: true, disabled: rec.source === "builtin", title: rec.source === "builtin" ? "内置插件不能删除，可在插件中心关闭" : "" }),
    );
    document.body.append(menu);
    pluginContextMenu = menu;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - rect.height - 8))}px`;
    requestAnimationFrame(() => menu.querySelector("button:not(:disabled)")?.focus());
  }

  document.addEventListener("pointerdown", (event) => {
    if (pluginContextMenu && !pluginContextMenu.contains(event.target)) closePluginContextMenu();
  }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePluginContextMenu(); });

  function renderNav() {
    nav.replaceChildren();
    for (const v of VIEWS.filter((x) => x.id !== "settings")) nav.append(navBtn(v.id));
    if (pluginViews.length) {
      // 桌面端侧栏仍保留插件直达列表；移动端底栏只留核心入口（.plug-list 被隐藏）
      const box = el("div", { class: "plug-list" }, el("div", { class: "sec" }, "插 件 视 图"));
      for (const pv of orderedPluginViews()) box.append(navBtn(`plug:${pv.id}`, true));
      nav.append(box);
    }
  }
  function navBtn(id, isPlug = false) {
    const def = viewDef(id);
    if (!def) return null;
    // 插件市场高亮条件：在市场页或任何插件页里（插件从市场进入）
    const on = activeView === id || (id === "market" && activeView.startsWith("plug:"));
    const b = el("button", { class: on ? "on" : "", "data-view": id },
      el("span", { class: "ic", style: isPlug ? `--plugin-accent:${pluginAccent(def.pluginView?.pluginId)}` : null }, isPlug ? pluginDisplayIcon(def.pluginView.pluginId, def.title) : appIcon(id)),
      el("span", { class: "lb" }, def.title),
      isPlug ? el("span", { class: "pv-count" }, "插件") : null,
    );
    b.addEventListener("click", () => switchTo(id));
    if (desktopWindow && isPlug && def.pluginView?.pluginId) {
      b.draggable = true;
      b.dataset.pluginId = def.pluginView.pluginId;
      b.title = `${def.title} · 可拖动调整插件顺序`;
      b.addEventListener("contextmenu", (event) => openPluginContextMenu(event, def.pluginView.pluginId));
      b.addEventListener("dragstart", (e) => {
        b.classList.add("nav-dragging");
        e.dataTransfer?.setData("text/plugin-id", def.pluginView.pluginId);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      });
      b.addEventListener("dragend", () => {
        b.classList.remove("nav-dragging");
        nav.querySelectorAll(".nav-drop-target").forEach((node) => node.classList.remove("nav-drop-target"));
      });
      b.addEventListener("dragover", (e) => {
        e.preventDefault();
        b.classList.add("nav-drop-target");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      b.addEventListener("dragleave", () => b.classList.remove("nav-drop-target"));
      b.addEventListener("drop", (e) => {
        e.preventDefault();
        b.classList.remove("nav-drop-target");
        const source = e.dataTransfer?.getData("text/plugin-id");
        if (movePluginBefore(source, def.pluginView.pluginId)) {
          renderNav();
          toast("插件顺序已保存，并会随同步快照一起同步");
        }
      });
    }
    return b;
  }

  function settingsButton() {
    const b = el("button", { class: "settings-icon-button", "data-view": "settings", title: "设置", "aria-label": "设置" },
      el("span", { class: "ic" }, appIcon("settings")),
      el("span", { class: "lb" }, "设置"),
    );
    b.addEventListener("click", () => openSettingsModal());
    return b;
  }

  // 标题卡小框的图标跟随当前视图：插件页 → 插件自己的图标（含用户自定义覆盖），
  // 核心页 → 该视图的导航图标。图标由 pluginDisplayIcon/appIcon 每次新建，直接替换子节点即可。
  function renderTitleMark(def) {
    titleMark.replaceChildren();
    if (!def) return;
    if (def.pluginView?.pluginId) {
      titleMark.style.setProperty("--plugin-accent", pluginAccent(def.pluginView.pluginId));
      titleMark.append(pluginDisplayIcon(def.pluginView.pluginId, def.title));
    } else {
      titleMark.style.removeProperty("--plugin-accent");
      titleMark.append(appIcon(def.id, def.title));
    }
  }

  function renderStat() {
    const t = S.getState().tasks;
    const open = t.filter((x) => !x.done).length;
    statPill.replaceChildren("待办 ", el("b", {}, String(open)), " · 已完成 ", el("b", {}, String(t.length - open)));
  }

  async function withCurrentWindow(run, fallbackMessage = "当前环境不支持窗口控制") {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      return await run(getCurrentWindow());
    } catch (err) {
      toast(fallbackMessage);
      return null;
    }
  }

  function openSettingsModal(section = "") {
    document.querySelector(".settings-modal")?._close?.();
    const mask = el("div", { class: "drawer-mask settings-modal-mask", onclick: close });
    const panel = el("section", { class: "settings-modal", role: "dialog", "aria-modal": "true", "aria-label": "设置" },
      el("header", { class: "settings-modal-head", "data-tauri-drag-region": dragRegion },
        el("div", {}, el("h2", {}, "设置")),
        el("button", { class: "btn ghost sm", type: "button", onclick: close }, "关闭"),
      ),
      el("div", { class: "settings-modal-body" }),
    );
    function onKey(event) { if (event.key === "Escape") close(); }
    function close() { closeLayer(panel, mask, () => document.removeEventListener("keydown", onKey)); }
    panel._close = close;
    document.addEventListener("keydown", onKey);
    document.body.append(mask, panel);
    renderSettings(panel.querySelector(".settings-modal-body"), { section });
  }

  function updateQuickDockToggle() {
    const open = !quickDockState.collapsed;
    quickDockToggle.classList.toggle("on", open);
    quickDockToggle.setAttribute("aria-expanded", String(open));
    quickDockToggle.title = open ? "收起快捷入口" : "展开快捷入口";
  }

  function positionQuickDock(node, left = quickDockState.left, top = quickDockState.top) {
    const rect = node.getBoundingClientRect();
    const margin = window.innerWidth <= 760 ? 12 : 20;
    const safeTop = window.innerWidth <= 760 ? 72 : 84;
    const width = rect.width || 152;
    const height = rect.height || 320;
    let x = Number.isFinite(left) ? left : (window.innerWidth - width - 22);
    let y = Number.isFinite(top) ? top : 92;
    x = Math.min(window.innerWidth - width - margin, Math.max(margin, x));
    y = Math.min(window.innerHeight - height - margin, Math.max(safeTop, y));
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    quickDockState.left = x;
    quickDockState.top = y;
  }

  function bindQuickDockDrag(node, handle) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;
    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      positionQuickDock(node, baseX + ev.clientX - startX, baseY + ev.clientY - startY);
      ev.preventDefault();
    };
    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      pointerId = null;
      node.classList.remove("dragging");
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      S.persistSoon();
    };
    handle.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      const rect = node.getBoundingClientRect();
      baseX = rect.left;
      baseY = rect.top;
      node.classList.add("dragging");
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
      ev.preventDefault();
    });
  }

  function updatePinButtonState() {
    if (!pinActionBtn) return;
    pinActionBtn.classList.toggle("on", !!quickDockState.alwaysOnTop);
    pinActionBtn.setAttribute("aria-pressed", String(!!quickDockState.alwaysOnTop));
  }

  async function syncWindowPinState() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      quickDockState.alwaysOnTop = await getCurrentWindow().isAlwaysOnTop();
      updatePinButtonState();
    } catch {}
  }

  // 顶栏组件可拖动换位 → 面板每次展开都重新贴着触发按钮定位，而不是固定在屏幕右侧
  function positionQuickDockNear(node) {
    if (!quickDock) return;
    const rect = node.getBoundingClientRect();
    const box = quickDock.getBoundingClientRect();
    const margin = 12;
    const width = box.width || 292;
    const height = box.height || 320;
    let x = rect.left;
    let y = rect.bottom + 8;
    x = Math.min(window.innerWidth - width - margin, Math.max(margin, x));
    y = Math.min(window.innerHeight - height - margin, Math.max(margin, y));
    quickDock.style.left = `${x}px`;
    quickDock.style.top = `${y}px`;
    quickDock.style.right = "auto";
    quickDockState.left = x;
    quickDockState.top = y;
  }

  function toggleQuickDock(force) {
    quickDockState.collapsed = typeof force === "boolean" ? force : !quickDockState.collapsed;
    if (quickDock) {
      quickDock.classList.toggle("collapsed", quickDockState.collapsed);
      if (!quickDockState.collapsed) positionQuickDockNear(quickDockToggle);
    }
    updateQuickDockToggle();
    S.persistSoon();
  }

  // 快捷菜单图标：用打包内自带的 Font Awesome solid（插件同款根路径），别再回退成汉字/ASCII
  function faIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "fa-ic");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `/icons/fontawesome/solid.svg#${name}`);
    svg.append(use);
    return svg;
  }

  function createQuickDockButton(iconName, label, handler, extraClass = "") {
    return el("button", {
      class: `quick-dock-btn${extraClass ? ` ${extraClass}` : ""}`,
      type: "button",
      title: label,
      "aria-label": label,
      role: "menuitem",
      onclick: async () => {
        await handler();
        if (!quickDockState.collapsed) toggleQuickDock(true);
      },
    },
      el("span", { class: "quick-dock-glyph" }, faIcon(iconName)),
      el("small", {}, label),
    );
  }

  function mountQuickDock() {
    quickDock?.remove();
    quickDockState.collapsed = true;
    const dock = el("div", { class: "quick-dock collapsed", role: "menu", "aria-label": "快捷入口" },
      el("div", { class: "quick-dock-head" },
        el("span", { class: "quick-menu-avatar", "aria-hidden": "true" }, "YL"),
        el("div", { class: "quick-dock-title" }, el("b", {}, "Yile Liang"), el("small", {}, "Plus")),
      ),
      el("div", { class: "quick-dock-grid" },
        createQuickDockButton("plus", "快速新建", () => openQuickCapture()),
        createQuickDockButton("magnifying-glass", "命令搜索", () => window.dispatchEvent(new CustomEvent("tide:command-palette"))),
        createQuickDockButton("table-cells", "四象限", () => switchTo("quadrant")),
        createQuickDockButton("clock", "时间块", () => switchTo("timeblock")),
        createQuickDockButton("inbox", "收件箱", () => switchTo("inbox")),
        createQuickDockButton("puzzle-piece", "插件中心", () => switchTo("market")),
        createQuickDockButton("gear", "设置", () => openSettingsModal()),
        desktopWindow ? (pinActionBtn = createQuickDockButton("thumbtack", "窗口置顶", async () => {
          await withCurrentWindow(async (win) => {
            const next = !(await win.isAlwaysOnTop());
            await win.setAlwaysOnTop(next);
            quickDockState.alwaysOnTop = next;
            updatePinButtonState();
            S.persistSoon();
            toast(next ? "已置顶窗口" : "已取消置顶");
          });
        }, "pin")) : null,
        desktopWindow ? createQuickDockButton("minus", "最小化", () => withCurrentWindow((win) => win.minimize())) : null,
        desktopWindow ? createQuickDockButton("xmark", "关闭", () => withCurrentWindow((win) => win.close())) : null,
      ),
    );
    quickDock = dock;
    root.append(dock);
    updateQuickDockToggle();
    updatePinButtonState();
    const closeOnOutside = (event) => {
      if (quickDockState.collapsed) return;
      if (dock.contains(event.target) || quickDockToggle.contains(event.target)) return;
      toggleQuickDock(true);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    syncWindowPinState();
  }

  // opts.history=false：程序性重渲染（刷新当前视图、注册表变化后回正、首屏）不该压历史栈，
  // 否则 Android 返回键要多按好几下才退得出去（见 backNav.js）。
  function switchTo(id, dirHint, opts = {}) {
    if (id === "settings") {
      openSettingsModal();
      return;
    }
    if (id.startsWith("plug:") && !viewDef(id)) id = "market";
    const targetId = id;
    const prevId = activeView;
    const ids = allViewIds();
    const dir = dirHint || (ids.indexOf(targetId) >= ids.indexOf(prevId) ? "left" : "right");
    const seq = ++navTransitionSeq;

    const commit = () => {
      if (seq !== navTransitionSeq) return;
      activeView = targetId;
      S.getState().settings.lastView = targetId;
      S.persistSoon();
      document.querySelector(".drawer")?._close?.();
      view._unsub?.();
      view._unsub = null;
      view.classList.remove("tb-root");
      view.replaceChildren();
      const def = viewDef(targetId);
      if (!def) return switchTo("market", dirHint);
      titleEl.textContent = def.title;
      subEl.textContent = def.sub ? ` · ${def.sub}` : "";
      renderTitleMark(def);
      renderNav();
      if (settingsDockBtn) settingsDockBtn.classList.remove("on");
      renderStat();
      if (def.pluginView) {
        const box = el("div", {
          class: "plugview",
          "data-plugin-id": def.pluginView.pluginId || def.pluginView.id,
        });
        view.append(box);
        try {
          const cleanup = def.pluginView.render(box, { refresh: () => switchTo(targetId, undefined, { history: false }) });
          const stopPluginMotion = observePluginMotion(box);
          view._unsub = () => {
            stopPluginMotion();
            if (typeof cleanup === "function") cleanup();
          };
        }
        catch (e) { box.append(el("p", { class: "desc" }, `插件视图出错：${e.message}`)); }
      } else if (targetId === "quadrant") renderQuadrant(view);
      else if (targetId === "timeblock") renderTimeblock(view);
      else if (targetId === "inbox") renderInbox(view);
      else if (targetId === "market") renderMarket(view);

      view.classList.remove("page-l", "page-r");
      if (prevId !== targetId) {
        void view.offsetWidth;
        view.classList.add(dir === "left" ? "page-l" : "page-r");
        const titleCard = titleEl.closest(".topbar-title-card");
        if (titleCard?.animate && getUiPreferences().motion !== "reduced") {
          const titleOffset = dir === "left" ? 7 : -7;
          titleCard.animate([
            { opacity: .36, transform: `translate3d(${titleOffset}px, 0, 0) scale(.99)` },
            { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
          ], { duration: 240, easing: "cubic-bezier(.22,.8,.22,1)" });
        }
      }
      // 用户真的换了界面才压历史：返回键据此回到上一个界面
      if (opts.history !== false) noteViewChange(targetId);
    };

    // 「弹 2 下」修复：切视图只保留入场动画，不再先播放旧页滑出——
    // 出场 + 入场 + 插件首绘三层动画叠在一起，小窗口里看起来就是界面弹两下。
    commit();
  }

  // ── 插件中心：搜索、筛选、启停与直达 ──
  function renderMarket(container) {
    const wrap = el("div", { class: "market" });
    let query = marketQuery;
    let filter = marketFilter;

    const search = el("input", { class: "market-search", type: "search", value: query, placeholder: "搜索插件名称 / ID / 功能 / 作者…", "aria-label": "搜索插件" });
    const count = el("span", { class: "market-count" });
    const filterBox = el("div", { class: "market-filters" });
    const grid = el("div", { class: "market-grid" });

    const filters = [
      ["all", "全部"], ["enabled", "已启用"], ["disabled", "已停用"], ["builtin", "内置"], ["user", "用户插件"],
    ];
    // 各筛选档的数量跟随当前搜索词（忽略筛选维度本身），直接显示在按钮里
    function countFor(id) {
      const q = query.trim().toLowerCase();
      return getRegistry().filter((rec) => {
        const man = rec.manifest || {};
        const enabled = S.pluginState(rec.id).enabled !== false;
        if (id === "enabled" && !enabled) return false;
        if (id === "disabled" && enabled) return false;
        if (id === "builtin" && rec.source !== "builtin") return false;
        if (id === "user" && rec.source === "builtin") return false;
        if (!q) return true;
        return `${man.name || ""} ${rec.id} ${man.description || ""} ${man.author || ""}`.toLowerCase().includes(q);
      }).length;
    }
    function paintFilters() {
      filterBox.replaceChildren(...filters.map(([id, label]) => el("button", {
        class: `market-filter${filter === id ? " on" : ""}`,
        onclick: () => { filter = id; marketFilter = id; paintFilters(); paintCards(); },
      }, label, el("span", { class: "market-filter-count" }, String(countFor(id))))));
    }
    function match(rec) {
      const man = rec.manifest || {};
      const enabled = S.pluginState(rec.id).enabled !== false;
      if (filter === "enabled" && !enabled) return false;
      if (filter === "disabled" && enabled) return false;
      if (filter === "builtin" && rec.source !== "builtin") return false;
      if (filter === "user" && rec.source === "builtin") return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${man.name || ""} ${rec.id} ${man.description || ""} ${man.author || ""}`.toLowerCase().includes(q);
    }
    function paintCards() {
      const customOrder = pluginOrderState();
      const rank = new Map(customOrder.map((id, index) => [id, index]));
      const rows = getRegistry().filter(match).sort((a, b) => {
        const ar = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
        const br = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
        return ar - br || (a.manifest?.order || 999) - (b.manifest?.order || 999) || String(a.manifest?.name || a.id).localeCompare(String(b.manifest?.name || b.id), "zh-CN");
      });
      count.textContent = `显示 ${rows.length} / ${getRegistry().length}`;
      grid.replaceChildren();
      if (!rows.length) {
        grid.append(el("div", { class: "market-empty" }, query ? `没有找到“${query}”相关插件` : "当前筛选下没有插件"));
        return;
      }
      for (const [rowIndex, rec] of rows.entries()) {
        const man = rec.manifest || {};
        const pluginName = pluginDisplayName(rec.id, man.name || rec.id);
        const enabled = S.pluginState(rec.id).enabled !== false;
        const pv = pluginViews.find((v) => v.pluginId === rec.id);
        const open = el("button", { class: "btn pri sm", disabled: !enabled || !pv ? true : null, onclick: () => {
          if (!enabled) return toast("请先开启这个插件");
          if (pv) switchTo(`plug:${pv.id}`);
          else toast("这个插件没有注册可打开的视图");
        } }, pv ? "打开" : "无视图");
        const toggle = el("button", {
          class: `switch market-plugin-switch${enabled ? " on" : ""}`,
          role: "switch",
          "aria-checked": String(enabled),
          "aria-label": `${enabled ? "关闭" : "开启"}${pluginName}`,
          title: enabled ? "关闭插件" : "开启插件",
          onclick: async (e) => {
            e.stopPropagation();
            const next = !enabled;
            const btn = e.currentTarget;
            btn.classList.toggle("on", next);
            btn.setAttribute("aria-checked", String(next));
            btn.closest(".market-switch-control")?.querySelector(".market-switch-text")?.replaceChildren(next ? "已开启" : "已关闭");
            try {
              await setEnabled(rec.id, next);
              toast(next ? `已开启「${pluginName}」` : `已关闭「${pluginName}」`);
              setTimeout(() => renderMarket(container), 120);
            } catch (err) {
              btn.classList.toggle("on", enabled);
              btn.setAttribute("aria-checked", String(enabled));
              toast(`切换失败：${err.message || err}`);
            }
          },
        });
        const switchControl = el("div", { class: "market-switch-control" },
          el("span", { class: "market-switch-text" }, enabled ? "已开启" : "已关闭"),
          toggle,
        );
        const card = el("div", {
          class: `mcard market-manage-card market-card-enter${enabled ? "" : " disabled"}`,
          style: `--market-enter-index:${Math.min(rowIndex, 8)}`,
          role: pv ? "button" : null,
          tabindex: pv ? "0" : null,
          onclick: (e) => {
            if (e.target.closest?.("button, input, select, a")) return;
            if (!enabled) return toast("请先开启这个插件");
            if (pv) switchTo(`plug:${pv.id}`);
          },
          onkeydown: (e) => {
            if (!pv || !enabled || !["Enter", " "].includes(e.key)) return;
            e.preventDefault();
            switchTo(`plug:${pv.id}`);
          },
        },
          el("div", { class: "market-card-head" },
            el("span", { class: "mi", style: `--plugin-accent:${pluginAccent(rec.id)}` }, pluginDisplayIcon(rec.id, pluginName)),
            el("span", { class: "market-card-title" }, el("b", {}, pluginName), el("small", {}, `v${man.version || "?"} · ${rec.source === "builtin" ? "内置" : "用户"}`)),
          ),
          el("p", { class: "market-card-desc" }, man.description || "（无描述）"),
          el("div", { class: "market-card-meta" }, `${man.author ? `作者 ${man.author}` : rec.source === "builtin" ? "内置扩展" : "用户插件"}${rec.error ? " · 加载失败" : ""}`),
          rec.error ? el("div", { class: "perr" }, rec.error) : null,
          el("div", { class: "market-card-actions" }, open, switchControl),
        );
        card.addEventListener("contextmenu", (event) => openPluginContextMenu(event, rec.id));
        grid.append(card);
      }
    }

    search.addEventListener("input", () => { query = search.value; marketQuery = query; paintFilters(); paintCards(); });
    // 手机上搜索默认收成一个图标（用户反馈：不要独占一行）；点了才展开输入框
    const searchToggle = el("button", {
      class: "market-search-toggle", type: "button", title: "搜索插件", "aria-label": "搜索插件",
      "aria-expanded": String(marketSearchOpen), "aria-controls": "market-search-row",
      onclick: () => {
        marketSearchOpen = !marketSearchOpen;
        searchToggle.setAttribute("aria-expanded", String(marketSearchOpen));
        wrap.classList.toggle("open-search", marketSearchOpen);
        if (marketSearchOpen) search.focus();
        else if (!query) paintCards();
      },
    }, el("span", { class: "market-search-glyph", "aria-hidden": "true" }, "⌕"));
    if (marketSearchOpen) wrap.classList.add("open-search");
    // 搜索开关与计数放在筛选按钮下面（用户反馈：顶部只留筛选档，别多占一行）
    wrap.append(
      filterBox,
      el("div", { class: "market-head" },
        el("div", { class: "market-head-tools" }, searchToggle, count),
      ),
      el("div", { class: "market-search-row", id: "market-search-row" }, search),
      grid,
    );
    container.replaceChildren(wrap);
    paintFilters();
    paintCards();
  }

  // ── 内容区左右滑动 = 翻页（与底栏点按互补）──
  // 只排除真正占有横向手势的元素：可拖拽时间块、横向滚动池、抽屉、输入控件
  let swX = 0, swY = 0, swOn = false;
  const SWIPE_SKIP = ".plist, .block, .drawer, .popmenu, input, textarea, select, [data-noswipe]";
  view.addEventListener("touchstart", (e) => {
    swOn = false;
    if (e.touches.length !== 1) return;
    if (e.target.closest?.(SWIPE_SKIP)) return;
    swX = e.touches[0].clientX; swY = e.touches[0].clientY; swOn = true;
  }, { passive: true });
  view.addEventListener("touchcancel", () => { swOn = false; }, { passive: true });
  view.addEventListener("touchend", (e) => {
    if (!swOn) return;
    if (!getUiPreferences().swipeNavigation) { swOn = false; return; }
    swOn = false;
    const dx = e.changedTouches[0].clientX - swX;
    const dy = e.changedTouches[0].clientY - swY;
    // 横向主导 + 足够长才翻页，避免误伤纵向滚动
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const ids = allViewIds();
    const i = ids.indexOf(activeView);
    const next = dx < 0 ? ids[i + 1] : ids[i - 1];
    if (next) switchTo(next, dx < 0 ? "left" : "right");
  }, { passive: true });

  mountQuickDock();
  quickDockToggle.addEventListener("click", () => toggleQuickDock());
  window.addEventListener("resize", () => { if (quickDock?.isConnected && !quickDockState.collapsed) positionQuickDockNear(quickDockToggle); }, { passive: true });
  renderNav();
  onNavChanged(() => {
    const missingActivePlugin = activeView.startsWith("plug:") && !viewDef(activeView);
    renderNav();
    if (missingActivePlugin) switchTo("market", undefined, { history: false });
    else if (activeView.startsWith("plug:") || activeView === "market") switchTo(activeView, undefined, { history: false });
  });
  // 捕获/插件可请求跳转视图
  window.addEventListener("tide:navigate", (e) => switchTo(e.detail));
  // 别处（如更新提示条的「立即更新」）可以直接点名打开设置里的某一节
  window.addEventListener("tide:open-settings", (e) => openSettingsModal(e.detail?.section || ""));
  switchTo(activeView, undefined, { history: false });
  // Android 返回键的历史栈：必须在首屏视图定下来之后挂（readView 要读到它）。
  // 桌面端没有返回键，但浏览器/WebView 的后退（Alt+←）也走同一条逻辑。
  initBackNav({
    readView: () => activeView,
    applyView: (id) => switchTo(id, undefined, { history: false }),
  });
  S.subscribe(renderStat);
}
