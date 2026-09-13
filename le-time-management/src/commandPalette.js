// 全局搜索 / 命令面板：任务、时间块、插件与常用命令统一入口。
import * as S from "./store.js";
import { el } from "./ui.js";
import { getRegistry, pluginViews } from "./pluginHost.js";
import { openTaskDrawer } from "./views/drawer.js";
import { openQuickCapture } from "./capture.js";
import { closeLayer } from "./motion.js";

let modal = null;
let input = null;
let list = null;
let activeIndex = 0;
let visible = [];

function navigate(view) {
  window.dispatchEvent(new CustomEvent("tide:navigate", { detail: view }));
}

function normalize(text) { return String(text || "").trim().toLowerCase(); }
function score(entry, q) {
  if (!q) return entry.priority || 0;
  const title = normalize(entry.title), sub = normalize(entry.sub), keys = normalize(entry.keywords);
  if (title === q) return 1000;
  if (title.startsWith(q)) return 800;
  if (title.includes(q)) return 600;
  if (sub.includes(q)) return 350;
  if (keys.includes(q)) return 250;
  return -1;
}

function entries() {
  const core = [
    { kind: "命令", title: "快速捕获", sub: "粘贴一句话，自动识别日期和时间", keywords: "capture 新建 收集", priority: 90, run: () => openQuickCapture() },
    { kind: "命令", title: "新建任务", sub: "创建一条任务并立即编辑", keywords: "task 待办", priority: 85, run: () => { const t = S.addTask({ title: "新任务" }); navigate("quadrant"); setTimeout(() => openTaskDrawer(t.id), 40); } },
    { kind: "导航", title: "今天的时间块", sub: S.todayStr(), keywords: "today 日程 时间轴", priority: 80, run: () => { S.getState().settings.lastDate = S.todayStr(); S.persistSoon(); navigate("timeblock"); } },
    { kind: "导航", title: "四象限", sub: "任务优先级", keywords: "quadrant 任务", priority: 70, run: () => navigate("quadrant") },
    { kind: "导航", title: "插件中心", sub: "搜索、启停和管理插件", keywords: "plugin market 插件", priority: 70, run: () => navigate("market") },
    { kind: "导航", title: "设置", sub: "提醒、同步、快捷键、插件权限", keywords: "settings 配置", priority: 60, run: () => navigate("settings") },
  ];

  const tasks = S.getState().tasks.map((t) => ({
    kind: t.done ? "已完成任务" : "任务",
    title: t.title,
    sub: [t.project, t.due ? `截止 ${t.due}${t.dueTime ? ` ${t.dueTime}` : ""}` : "", ...(t.tags || [])].filter(Boolean).join(" · "),
    keywords: `${t.note || ""} ${t.project || ""} ${(t.tags || []).join(" ")}`,
    priority: t.done ? 5 : 30,
    run: () => { navigate("quadrant"); setTimeout(() => openTaskDrawer(t.id), 40); },
  }));

  const blocks = S.getState().blocks.map((b) => ({
    kind: "时间块",
    title: b.title,
    sub: `${b.date} ${b.start} · ${S.durLabel(b.durMin)}`,
    keywords: `${b.date} ${b.start} ${b.cat || ""}`,
    priority: b.date === S.todayStr() ? 35 : 12,
    run: () => { S.getState().settings.lastDate = b.date; S.persistSoon(); navigate("timeblock"); },
  }));

  const regs = getRegistry();
  const plugins = regs.map((rec) => {
    const man = rec.manifest || {};
    const pv = pluginViews.find((v) => v.pluginId === rec.id);
    const enabled = S.pluginState(rec.id).enabled !== false;
    return {
      kind: enabled ? "插件" : "已停用插件",
      title: man.name || rec.id,
      sub: enabled && pv ? "打开插件" : enabled ? "插件已开启 · 前往插件设置" : "插件已关闭 · 前往插件设置",
      keywords: `${rec.id} ${man.description || ""} ${man.author || ""}`,
      priority: enabled ? 40 : 10,
      run: () => enabled && pv ? navigate(`plug:${pv.id}`) : navigate("settings"),
    };
  });
  return [...core, ...plugins, ...tasks, ...blocks];
}

function renderResults() {
  if (!list || !input) return;
  const q = normalize(input.value);
  visible = entries()
    .map((entry) => ({ entry, score: score(entry, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, "zh-CN"))
    .slice(0, 30)
    .map((x) => x.entry);
  activeIndex = Math.max(0, Math.min(activeIndex, visible.length - 1));
  list.replaceChildren();
  if (!visible.length) {
    list.append(el("div", { class: "cmd-empty" }, `没有找到“${input.value.trim()}”`));
    return;
  }
  visible.forEach((item, idx) => {
    const row = el("button", { class: `cmd-row${idx === activeIndex ? " on" : ""}`, type: "button" },
      el("span", { class: "cmd-kind" }, item.kind),
      el("span", { class: "cmd-main" }, el("b", {}, item.title), item.sub ? el("small", {}, item.sub) : null),
      el("span", { class: "cmd-enter" }, idx === activeIndex ? "↵" : ""),
    );
    row.addEventListener("mouseenter", () => { activeIndex = idx; paintSelection(); });
    row.addEventListener("click", () => run(idx));
    list.append(row);
  });
}

function paintSelection() {
  [...(list?.querySelectorAll(".cmd-row") || [])].forEach((node, idx) => node.classList.toggle("on", idx === activeIndex));
}

function run(index = activeIndex) {
  const item = visible[index];
  if (!item) return;
  closeCommandPalette();
  try { item.run(); } catch (e) { console.error(e); }
}

export function closeCommandPalette() {
  if (!modal) return;
  const closingModal = modal;
  const closingMask = modal._mask;
  modal = input = list = null;
  visible = [];
  closeLayer(closingModal, closingMask);
}

export function openCommandPalette(initialQuery = "") {
  if (modal) { input.value = initialQuery; renderResults(); input.focus(); return; }
  const mask = el("div", { class: "cmd-mask", onclick: closeCommandPalette });
  input = el("input", { class: "cmd-input", type: "search", placeholder: "搜索任务、时间块、插件，或输入命令…", value: initialQuery, "aria-label": "全局搜索" });
  list = el("div", { class: "cmd-list", role: "listbox" });
  modal = el("div", { class: "cmd-palette", role: "dialog", "aria-label": "全局搜索与命令面板" },
    el("div", { class: "cmd-search" }, el("span", {}, "⌕"), input, el("kbd", {}, "Esc")),
    list,
    el("div", { class: "cmd-foot" }, "↑↓ 选择 · Enter 打开 · Ctrl+K 随时呼出"),
  );
  modal._mask = mask;
  input.addEventListener("input", () => { activeIndex = 0; renderResults(); });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(visible.length - 1, activeIndex + 1); paintSelection(); list.querySelectorAll(".cmd-row")[activeIndex]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); paintSelection(); list.querySelectorAll(".cmd-row")[activeIndex]?.scrollIntoView({ block: "nearest" }); }
    else if (e.key === "Enter") { e.preventDefault(); run(); }
    else if (e.key === "Escape") { e.preventDefault(); closeCommandPalette(); }
  });
  document.body.append(mask, modal);
  renderResults();
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

export function initCommandPalette() {
  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === "Escape" && modal && !inField) closeCommandPalette();
  });
  window.addEventListener("tide:command-palette", () => openCommandPalette());
}
