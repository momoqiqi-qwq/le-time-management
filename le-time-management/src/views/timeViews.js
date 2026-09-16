import * as S from "../store.js";
import { el } from "../ui.js";

const VIEW_META = [
  ["day", "日时间轴", "当前可拖拽编辑的日程"],
  ["wakeup", "课程表", "七日课程表式周视图"],
  ["milestone", "里程碑", "彩色箭头式阶段时间轴"],
  ["chronicle", "横向时间轴", "高密度事件年表"],
  ["cards", "卡片时间轴", "左右交错的叙事时间线"],
  ["gantt", "年度甘特", "按项目/任务展示跨月计划"],
  ["swimlane", "阶段甘特", "按分类分泳道查看时间占用"],
];

const CAT_COLOR = {
  work: "#2d8ee6", study: "#68b7ef", sport: "#ef6a6a", life: "#ffb64d", rest: "#79c77d",
};
const CAT_NAME = { work: "工作", study: "学习", sport: "运动", life: "生活", rest: "休息" };
const PALETTE = ["#2397e5", "#62b2ea", "#7bc886", "#ffbb52", "#e86d70", "#ff3d35", "#9061bd", "#42b6a2"];

/* ═══════════════════ 视图切换栏 ═══════════════════
   7 个样式原来平铺成一行横向滚动 chips：手机上一屏只看得见 4 个半，
   「卡片时间轴 / 年度甘特 / 阶段甘特」藏在滑动条后面，用户根本不知道有几种视图。
   现在收成「当前样式名 + 展开按钮」，点开列出全部 7 项并带一句说明。
   桌面端同样收起 —— 省出的整条横向空间还给内容，且两端行为一致。 */
export function createTimeViewSwitcher({ current = "day", onChange }) {
  // 同一时刻只允许存在一个菜单：视图重进会重建 switcher，旧菜单节点还挂在 body 上，
  // 不清掉就会叠出第二个（也会让「选完不关闭」看起来像没生效）。
  document.querySelectorAll(".time-viewmenu").forEach((m) => m.remove());
  const labelOf = (id) => VIEW_META.find(([key]) => key === id)?.[1] ?? "日时间轴";
  const bar = el("div", { class: "time-viewbar" });
  const menu = el("div", { class: "time-viewmenu", role: "menu" });
  menu.hidden = true;
  const buttons = new Map();

  // 菜单挂到 <body>：切换栏自己带 overflow，菜单作为子节点会被裁掉。
  const toggle = el("button", {
    class: "time-viewtoggle", type: "button",
    "aria-haspopup": "menu", "aria-expanded": "false",
    title: "切换时间视图",
  }, el("b", { class: "time-viewname" }, labelOf(current)), el("i", { class: "time-viewcaret", "aria-hidden": "true" }));

  for (const [id, label, title] of VIEW_META) {
    const b = el("button", {
      class: `time-viewitem${id === current ? " on" : ""}`,
      role: "menuitemradio", "aria-checked": id === current ? "true" : "false",
      onclick: () => { close(); onChange(id); },
    }, el("b", {}, label), el("span", {}, title));
    buttons.set(id, b); menu.append(b);
  }

  let opened = false;
  const onDocPointer = (e) => { if (!menu.contains(e.target) && !toggle.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    if (!opened) return;
    opened = false;
    // 🔴 必须写布尔值。`menu.hidden = ""` 赋的是空字符串（falsy），
    // 属性不会变成 hidden，菜单会赖在屏幕上不消失。
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKey, true);
  }
  function open() {
    if (opened) return;
    opened = true;
    const r = toggle.getBoundingClientRect();
    menu.hidden = false; menu.style.visibility = "hidden"; document.body.append(menu);
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    // 右对齐展开按钮，但不许越出视口（窄屏时贴左右安全边）。
    menu.style.left = `${Math.max(8, Math.min(r.right - mw, innerWidth - mw - 8))}px`;
    menu.style.top = `${Math.min(r.bottom + 6, innerHeight - mh - 8)}px`;
    menu.style.visibility = "";
    toggle.setAttribute("aria-expanded", "true");
    setTimeout(() => {
      if (!opened) return;   // 可能在这次 task 结束前就被关掉了
      document.addEventListener("pointerdown", onDocPointer, true);
      document.addEventListener("keydown", onKey, true);
    });
  }

  toggle.addEventListener("click", () => (opened ? close() : open()));
  bar.append(el("span", { class: "time-viewlead" }, "时间视图"), toggle);

  bar.setCurrent = (id) => {
    for (const [key, b] of buttons) {
      const on = key === id;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    }
    toggle.querySelector(".time-viewname").textContent = labelOf(id);
  };
  bar._closeMenu = close;
  return bar;
}

export function renderTimeView(host, mode, anchorDate) {
  host.replaceChildren();
  host.dataset.view = mode;
  const data = collectTimelineData(anchorDate);
  const view = mode === "wakeup" ? wakeupView(data, anchorDate)
    : mode === "milestone" ? milestoneView(data)
    : mode === "chronicle" ? chronicleView(data)
      : mode === "cards" ? cardTimelineView(data)
        : mode === "gantt" ? ganttView(data)
          : swimlaneView(data, anchorDate);
  host.append(view);
}

function parseDate(s) { const [y, m, d] = String(s || "").slice(0, 10).split("-").map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); }
function dateKey(d) { return S.fmtDate(d); }
function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function shortDate(s) { return String(s || "").slice(5).replace("-", "/"); }
function safeDateFromCreated(ts) { const d = new Date(Number(ts) || Date.now()); return Number.isNaN(d.getTime()) ? S.todayStr() : dateKey(d); }

function collectTimelineData(anchorDate) {
  const st = S.getState();
  const tasks = (st.tasks || []).filter(t => !t.done);
  const blocks = st.blocks || [];
  const events = [];
  for (const b of blocks) events.push({ id: b.id, date: b.date, title: b.title, subtitle: `${b.start} · ${S.durLabel(b.durMin)}`, cat: b.cat || "work", kind: "时间块" });
  for (const t of tasks) if (t.due) events.push({ id: t.id, date: t.due.slice(0, 10), title: t.title, subtitle: t.project || (t.tags || []).join(" · ") || "任务截止", cat: taskCat(t), kind: "截止" });
  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const projectMap = new Map();
  for (const t of tasks) {
    const key = t.project || (t.tags && t.tags[0]) || "未分类任务";
    const blockDates = blocks.filter(b => b.taskId === t.id).map(b => b.date).sort();
    const start = blockDates[0] || safeDateFromCreated(t.createdAt);
    const end = (t.due || blockDates.at(-1) || start).slice(0, 10);
    const row = { id: t.id, group: key, title: t.title, start: start <= end ? start : end, end: end >= start ? end : start, cat: taskCat(t) };
    if (!projectMap.has(key)) projectMap.set(key, []);
    projectMap.get(key).push(row);
  }
  const courseTable = st.plugins?.["shiguang-schedule"]?.storage?.table || null;
  return { events, projects: [...projectMap.entries()], blocks, anchorDate, courseTable };
}

function taskCat(t) {
  const tag = (t.tags || [])[0] || "";
  return ({ 论文: "work", 工作: "work", 学习: "study", 读书: "study", 运动: "sport", 健身: "sport", 跑步: "sport", 生活: "life", 休息: "rest" })[tag] || "work";
}

function empty(title = "暂无可展示的数据") {
  return el("div", { class: "tv-empty" }, el("div", { class: "tv-empty-icon" }, "⌁"), el("b", {}, title), el("span", {}, "添加带日期的任务或时间块后，这里会自动生成可视化。"));
}

/* 面板标题条：只留视图名。
   原来每个视图下面还挂一句「参考箭头阶段图：…」的占位说明，不承载信息也不可交互，
   只是把内容往下推（用户截图反馈「占位置的东西删掉」）。说明参数保留但不再渲染，
   以后要恢复只需改这里一处。 */
function head(title, desc) {
  void desc;
  return el("div", { class: "tv-head" }, el("div", {}, el("h2", {}, title)));
}

/* 手机上一个视图动辄几十条事件。「全部平铺」既滚不到底，也看不清结构 ——
   统一改成 <details> 分组折叠：桌面端由 CSS 强制展开（display:contents 让内容
   直接参与父级 flex/grid 布局），窄屏才变成真正可收放的分组。
   折叠用的原生 <details> 不需要额外 JS，键盘与读屏也自带支持。 */
function collapsible(summaryText, extraClass, open) {
  const box = el("details", { class: `tv-fold${extraClass ? ` ${extraClass}` : ""}` });
  if (open) box.setAttribute("open", "");
  box.append(el("summary", { class: "tv-fold-head" }, el("span", { class: "tv-fold-title" }, summaryText), el("i", { class: "tv-fold-caret", "aria-hidden": "true" })));
  const body = el("div", { class: "tv-fold-body" });
  box.append(body);
  return { box, body };
}

function mondayOf(dateStr) {
  const d = parseDate(dateStr); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return dateKey(d);
}
function addDate(dateStr, n) { const d = parseDate(dateStr); d.setDate(d.getDate() + n); return dateKey(d); }
function minutes(hhmm) { const [h, m] = String(hhmm || "0:0").split(":").map(Number); return h * 60 + m; }

/* ── 课程表（内部 id 仍叫 wakeup，改 id 会让用户已保存的视图选择失效）──
   桌面仍是一屏 7 天的真课表；窄屏改成「按天分组的日程列表」：
   7 列 × 10 节 = 70 个格子在 390px 宽里最小可读宽度约 700px，
   横向滚动能滚但不实用 —— 直接换布局，一天一段更符合手机阅读。
   行高不写死：`--slot-count` 提到根节点上，CSS 用
   `minmax(下限, 1fr)` 按剩余空间平分，让 1–10 节一屏看完（见 styles.css）。 */
function wakeupView(data, anchorDate) {
  const root = el("section", { class: "tv-panel wakeup-view" });
  const anchor = anchorDate || S.todayStr(); const monday = mondayOf(anchor); const today = S.todayStr();
  const table = data.courseTable;
  let slots = table?.timeSlots?.length ? [...table.timeSlots].sort((a, b) => Number(a.number) - Number(b.number)) : [];
  let courses = []; let week = null;
  if (table?.config?.semesterStartDate && table?.courses?.length) {
    const semMonday = mondayOf(table.config.semesterStartDate);
    week = Math.floor((parseDate(monday) - parseDate(semMonday)) / 604800000) + 1;
    const map = new Map(slots.map((x, i) => [Number(x.number), i]));
    if (week >= 1 && week <= Number(table.config.semesterTotalWeeks || 20)) {
      courses = table.courses.filter(c => (c.weeks || []).map(Number).includes(week)).map((c, i) => {
        let start = c.customStartTime, end = c.customEndTime, r1, r2;
        if (!c.isCustomTime) { const a = map.get(Number(c.startSection)), b = map.get(Number(c.endSection)); r1 = a; r2 = b; start = slots[a]?.startTime; end = slots[b]?.endTime; }
        else { r1 = slots.findIndex(x => minutes(x.endTime) > minutes(start)); r1 = Math.max(0, r1); r2 = slots.findLastIndex?.(x => minutes(x.startTime) < minutes(end)); if (r2 == null || r2 < r1) r2 = r1; }
        return { ...c, start, end, r1, r2, color: PALETTE[(Number(c.color) || i) % PALETTE.length] };
      });
    }
  }
  if (!slots.length) {
    slots = Array.from({ length: 16 }, (_, i) => { const m = 7 * 60 + i * 60; return { number: i + 1, startTime: S.hhmmOf(m), endTime: S.hhmmOf(m + 50) }; });
    const mapDate = new Map(Array.from({ length: 7 }, (_, i) => [addDate(monday, i), i + 1]));
    courses = data.blocks.filter(b => mapDate.has(b.date)).map((b, i) => { const sm = minutes(b.start), em = sm + Number(b.durMin || 30); const r1 = clamp(Math.floor((sm - 420) / 60), 0, 15), r2 = clamp(Math.floor((Math.max(sm + 1, em) - 421) / 60), r1, 15); return { name: b.title, day: mapDate.get(b.date), position: CAT_NAME[b.cat] || "时间块", start: b.start, end: S.hhmmOf(em), r1, r2, color: CAT_COLOR[b.cat] || PALETTE[i % PALETTE.length] }; });
  }
  // `--slot-count` 挂在根节点上（而不是网格自己）：CSS 要用它算「自然高度上限」，
  // 那个 max-height 写在 .wakeup-scroll（网格的父级）上，变量只能向下继承。
  root.style.setProperty("--slot-count", String(slots.length));
  root.append(head("课程表周视图", `${week ? `第 ${week} 周 · ` : ""}${monday} ～ ${addDate(monday, 6)} · 课程表式时间布局，窄屏自动改为按天分组。`));

  // 桌面：真 7 列网格（CSS 在 ≤760px 里隐藏）
  const sc = el("div", { class: "wakeup-scroll" }); const grid = el("div", { class: "wakeup-grid" });
  grid.append(el("div", { class: "wk-corner" }, week ? `第${week}周` : "时间"));
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  for (let i = 0; i < 7; i++) { const d = addDate(monday, i); grid.append(el("div", { class: `wk-day${d === today ? " today" : ""}`, style: `grid-column:${i + 2};grid-row:1` }, el("b", {}, dayNames[i]), el("span", {}, shortDate(d)))); }
  slots.forEach((sl, i) => grid.append(el("div", { class: "wk-slot", style: `grid-column:1;grid-row:${i + 2}` }, el("b", {}, String(sl.number)), el("span", {}, `${sl.startTime}\n${sl.endTime}`))));
  for (let r = 0; r < slots.length; r++) for (let d = 0; d < 7; d++) grid.append(el("div", { class: "wk-cell", style: `grid-column:${d + 2};grid-row:${r + 2}` }));
  courses.forEach((c, i) => {
    const col = clamp(Number(c.day) || 1, 1, 7) + 1;
    const r1 = clamp(Number(c.r1) || 0, 0, slots.length - 1) + 2;
    const r2 = clamp(Number(c.r2 ?? c.r1) || 0, 0, slots.length - 1) + 3;
    grid.append(el("article", { class: "wk-course", style: `grid-column:${col};grid-row:${r1}/${r2};--wk:${c.color || PALETTE[i % PALETTE.length]}`, title: `${c.name || c.title} ${c.start || ""}-${c.end || ""}` },
      el("b", {}, c.name || c.title), c.position ? el("span", {}, c.position) : null,
      el("small", {}, `${c.start || ""}${c.end ? `-${c.end}` : ""}${c.teacher ? ` · ${c.teacher}` : ""}`)));
  });
  sc.append(grid); root.append(sc);

  // 手机：按天分组列表（CSS 在 >760px 里隐藏）
  const mobile = el("div", { class: "wakeup-mobile" });
  for (let i = 0; i < 7; i++) {
    const d = addDate(monday, i);
    const list = courses.filter(c => Number(c.day) === i + 1);
    const fold = collapsible(`${dayNames[i]} · ${shortDate(d)}`, "", d === today || (!courses.length && i === 0));
    fold.box.classList.toggle("is-today", d === today);
    const sorted = list.slice().sort((a, b) => String(a.start).localeCompare(String(b.start)));
    fold.body.append(...(sorted.length
      ? sorted.map(c => el("article", { class: "wm-item", style: `--wk:${c.color}` },
        el("span", { class: "wm-time" }, `${c.start || ""}\n${c.end || ""}`),
        el("div", { class: "wm-copy" }, el("b", {}, c.name || c.title),
          c.position ? el("span", {}, c.position) : null,
          c.teacher ? el("span", {}, c.teacher) : null)))
      : [el("p", { class: "wm-none" }, "这天没有课")]));
    mobile.append(fold.box);
  }
  root.append(mobile);
  if (!courses.length) root.append(el("div", { class: "wk-tip" }, table ? "这一周没有课程。可切换日期查看其他教学周。" : "还没有课程表数据：当前会用本周时间块代替展示。导入“课程表”插件后会自动切换为真实节次和课程。"));
  return root;
}

/* ── 里程碑 ──
   原来是一条横向滚动轨道，每格固定 165px。窄屏改为纵向时间线：
   箭头块横向铺满，节点信息在下方左对齐，一屏能读完整条链路。 */
function milestoneView(data) {
  const root = el("section", { class: "tv-panel milestone-view" });
  root.append(head("里程碑时间轴", "参考箭头阶段图：按日期排序展示近期关键任务与时间块。"));
  if (!data.events.length) { root.append(empty()); return root; }
  const list = data.events.slice(0, 12);
  const track = el("div", { class: "milestone-scroll" }, el("div", { class: "milestone-track" }));
  const inner = track.firstChild;
  list.forEach((e, i) => {
    const c = PALETTE[i % PALETTE.length];
    const label = e.kind === "截止" ? "目标" : CAT_NAME[e.cat] || "安排";
    inner.append(el("div", { class: "ms-cell", style: `--ms:${c}` },
      el("div", { class: "ms-stage" }, label),
      el("div", { class: "ms-line" }),
      el("div", { class: "ms-arrow" }, el("b", {}, e.date.slice(0, 4)), el("span", {}, shortDate(e.date))),
      el("div", { class: "ms-pin" }, "●"),
      el("div", { class: "ms-copy" }, el("b", {}, e.title), el("span", {}, e.subtitle || e.kind)),
    ));
  });
  root.append(track);
  return root;
}

/* ── 横向时间轴（年表）──
   桌面是 1500px 画布上的绝对定位年表，靠左右交错区分事件。
   窄屏无法靠滚动了事：1500px 画布里 150px 的卡片挤在同一水平线上，
   文字直接叠成一团（用户截图证实）。窄屏换成纵向年表 ——
   一条中轴 + 左右交错卡片，靠日期标签定位，不再有横向滚动。 */
function chronicleView(data) {
  const root = el("section", { class: "tv-panel chronicle-view" });
  root.append(head("横向时间轴", "参考机器人发展史年表：适合信息密度高、事件多的长期回顾。"));
  if (!data.events.length) { root.append(empty()); return root; }
  const events = data.events.slice(0, 30);
  const minDate = events[0].date, maxDate = events.at(-1).date;
  const total = Math.max(1, dayDiff(minDate, maxDate));

  // 桌面：横向年表
  const canvas = el("div", { class: "chronicle-canvas" });
  canvas.append(el("div", { class: "chronicle-axis" }));
  events.forEach((e, i) => {
    const x = clamp(dayDiff(minDate, e.date) / total * 94 + 3, 2, 97);
    const upper = i % 2 === 0;
    canvas.append(el("div", { class: `chronicle-event ${upper ? "up" : "down"}`, style: `left:${x}%;--ec:${PALETTE[i % PALETTE.length]}` },
      el("div", { class: "ce-card" }, el("b", {}, e.title), el("span", {}, `${e.date} · ${e.subtitle || e.kind}`)),
      el("div", { class: "ce-stem" }), el("div", { class: "ce-dot" }),
      el("div", { class: "ce-date" }, e.date),
    ));
  });
  root.append(el("div", { class: "chronicle-scroll" }, canvas));

  // 窄屏：纵向年表
  const vertical = el("div", { class: "chronicle-vertical" });
  events.forEach((e, i) => {
    const side = i % 2 ? "right" : "left";
    vertical.append(el("article", { class: `cv-item ${side}`, style: `--ec:${PALETTE[i % PALETTE.length]}` },
      el("span", { class: "cv-date" }, e.date),
      el("div", { class: "cv-card" }, el("b", {}, e.title), el("span", {}, e.subtitle || e.kind)),
    ));
  });
  root.append(vertical);
  return root;
}

/* ── 卡片时间轴 ──
   本来就有一版窄屏改写（单列 + 中轴挪到左边），但卡片固定 270px 且不换行，
   日期是 15px 的裸文本，一屏只能看到一张半。窄屏改成更紧凑的单列卡片 +
   日期徽章，并保留中轴的视觉连接。 */
function cardTimelineView(data) {
  const root = el("section", { class: "tv-panel card-timeline-view" });
  root.append(head("卡片时间轴", "参考中国近代史时间轴：左右交错卡片，适合展示阶段说明和备注。"));
  if (!data.events.length) { root.append(empty()); return root; }
  const lane = el("div", { class: "card-timeline" });
  data.events.slice(0, 16).forEach((e, i) => {
    const side = i % 2 ? "right" : "left";
    lane.append(el("article", { class: `ct-item ${side}`, style: `--ct:${PALETTE[i % PALETTE.length]}` },
      el("div", { class: "ct-card" },
        el("div", { class: "ct-date" }, e.date),
        el("h3", {}, e.title),
        el("p", {}, e.subtitle || `${e.kind} · ${CAT_NAME[e.cat] || "安排"}`),
      ),
      el("div", { class: "ct-link" }, el("i"), el("span")),
    ));
  });
  root.append(lane); return root;
}

/* ── 年度甘特 ──
   桌面 12 个月 × 每列 ≥70px，配 220px 标签列 = 1060px 起。
   窄屏改成「按月分组」折叠：一个月一组，组内是该月有交集的条，横轴改成 1…31 天刻度。
   全年 12 组默认只展开当前月，其余收起来 —— 38 条任务也不会一次糊满屏幕。 */
function ganttView(data) {
  const root = el("section", { class: "tv-panel gantt-view" });
  root.append(head("年度甘特图", "参考年度工作规划：按任务起止日期映射到月份，窄屏按月分组折叠。"));
  const rows = data.projects.flatMap(([group, list]) => list.map(x => ({ ...x, group }))).slice(0, 18);
  if (!rows.length) { root.append(empty("暂无可生成甘特图的任务")); return root; }
  const years = rows.flatMap(r => [parseDate(r.start).getFullYear(), parseDate(r.end).getFullYear()]);
  const year = years.sort((a, b) => a - b)[Math.floor(years.length / 2)] || new Date().getFullYear();
  const start = `${year}-01-01`, end = `${year}-12-31`, total = dayDiff(start, end) + 1;

  // 桌面：整年网格
  const grid = el("div", { class: "gantt-grid" });
  const header = el("div", { class: "gantt-headrow" }, el("div", { class: "gantt-label head" }, `${year} · 项目 / 任务`));
  for (let m = 1; m <= 12; m++) header.append(el("div", { class: "gantt-month" }, `${m}月`));
  grid.append(header);
  rows.forEach((r, i) => {
    const rs = clamp(dayDiff(start, r.start), 0, total - 1), re = clamp(dayDiff(start, r.end), rs, total - 1);
    const left = rs / total * 100, width = Math.max(1.2, (re - rs + 1) / total * 100);
    grid.append(el("div", { class: "gantt-row" },
      el("div", { class: "gantt-label" }, el("b", {}, r.group), el("span", {}, r.title)),
      el("div", { class: "gantt-cells" },
        ...Array.from({ length: 12 }, () => el("i")),
        el("div", { class: "gantt-bar", title: `${r.start} ~ ${r.end} · ${r.title}`, style: `left:${left}%;width:${width}%;background:${PALETTE[i % PALETTE.length]}` }, r.title),
      ),
    ));
  });
  root.append(el("div", { class: "gantt-scroll" }, grid));

  // 窄屏：按月折叠
  // 只列出「有内容的月份」加上当前月：一年 12 个月若全列出来，空月份（实测 8 个）
  // 的折叠标题会把真正有内容的那一个月推到屏幕之外，等于没适配。
  const yearRows = [];
  for (let m = 1; m <= 12; m++) {
    const dim = new Date(year, m, 0).getDate();
    const first = `${year}-${String(m).padStart(2, "0")}-01`, last = `${year}-${String(m).padStart(2, "0")}-${String(dim).padStart(2, "0")}`;
    yearRows.push({ m, dim, first, last, hit: rows.filter(r => r.start <= last && r.end >= first) });
  }
  const todayMonth = parseDate(S.todayStr()).getFullYear() === year ? parseDate(S.todayStr()).getMonth() + 1 : 0;
  const shown = yearRows.filter(r => r.hit.length || r.m === todayMonth);
  const monthly = el("div", { class: "gantt-monthly" });
  if (!shown.length) monthly.append(el("p", { class: "wm-none" }, "本年还没有带日期的任务。"));
  const onlyMonth = !shown.some(r => r.hit.length);
  for (const { m, dim, first, hit } of shown) {
    const fold = collapsible(`${year}.${String(m).padStart(2, "0")} · ${hit.length} 项`, "tv-fold-month", hit.length > 0 || onlyMonth);
    if (!hit.length) { fold.body.append(el("p", { class: "wm-none" }, "本月没有安排")); }
    hit.forEach((r, i) => {
      const from = Math.max(1, dayDiff(first, r.start) + 1), to = Math.min(dim, dayDiff(first, r.end) + 1);
      fold.body.append(el("article", { class: "gm-item" },
        el("div", { class: "gm-copy" }, el("b", {}, r.group), el("span", {}, r.title)),
        el("div", { class: "gm-track", style: `--days:${dim};--gm-from:${from};--gm-to:${to};--gm:${PALETTE[i % PALETTE.length]}` },
          el("i", { class: "gm-span" }),
          el("small", {}, `${from} → ${to} 日`)),
      ));
    });
    monthly.append(fold.box);
  }
  root.append(monthly);
  return root;
}

/* ── 阶段甘特（泳道）──
   桌面 31 列 × ≥34px + 160px 标签 = 1214px 起，手机上横向滚到手酸。
   窄屏改成「按分类分组的进度条」：一行一个分类，条宽按该分类在本月的占比，
   下面列出该分类的时间块。分类数量固定 5 个，天然适合纵向排列。 */
function swimlaneView(data, anchorDate) {
  const root = el("section", { class: "tv-panel swimlane-view" });
  const anchor = parseDate(anchorDate || S.todayStr());
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const startDate = dateKey(new Date(y, m, 1)), endDate = dateKey(new Date(y, m + 1, 0));
  root.append(head("阶段甘特图", `${y}年${m + 1}月 · 参考阶段泳道图：按工作/学习/运动/生活/休息分组。`));
  const monthBlocks = data.blocks.filter(b => b.date >= startDate && b.date <= endDate);
  if (!monthBlocks.length) { root.append(empty("本月暂无时间块")); return root; }
  const days = parseDate(endDate).getDate();
  const CATS = ["work", "study", "sport", "life", "rest"];

  // 桌面：真泳道网格
  const lane = el("div", { class: "swim-grid" });
  const hdr = el("div", { class: "swim-head", style: `--days:${days}` }, el("div", { class: "swim-label swim-year" }, `${y}.${String(m + 1).padStart(2, "0")}`));
  for (let d = 1; d <= days; d++) hdr.append(el("div", { class: "swim-day" }, d));
  lane.append(hdr);
  for (const cat of CATS) {
    const row = el("div", { class: "swim-row" }, el("div", { class: "swim-label", style: `background:${CAT_COLOR[cat]}` }, CAT_NAME[cat]));
    const cells = el("div", { class: "swim-cells", style: `--days:${days}` }, ...Array.from({ length: days }, () => el("i")));
    const list = monthBlocks.filter(b => (b.cat || "work") === cat);
    list.forEach((b, i) => {
      const d = parseDate(b.date).getDate();
      const width = Math.min(6, Math.max(1.3, b.durMin / 120));
      cells.append(el("div", { class: "swim-bar", title: `${b.date} ${b.start} · ${b.title}`, style: `left:${(d - 1) / days * 100}%;width:${width}%;background:${PALETTE[(i + CATS.indexOf(cat)) % PALETTE.length]}` }, b.title));
    });
    row.append(cells); lane.append(row);
  }
  root.append(el("div", { class: "swim-scroll" }, lane));

  // 窄屏：分类折叠 + 占比条
  // 默认只展开前两个有内容的分类：5 个分类全展开实测 1670px 高，一屏（844px）看不完，
  // 也就失去了「折叠」的意义。占比条在折叠态就能看出结构。
  const totalMin = monthBlocks.reduce((a, b) => a + Number(b.durMin || 0), 0);
  const mobile = el("div", { class: "swim-mobile" });
  let opened = 0;
  for (const cat of CATS) {
    const list = monthBlocks.filter(b => (b.cat || "work") === cat).sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const sum = list.reduce((a, b) => a + Number(b.durMin || 0), 0);
    const pct = totalMin ? Math.round(sum / totalMin * 100) : 0;
    const open = list.length > 0 && opened++ < 2;
    const fold = collapsible(`${CAT_NAME[cat]} · ${list.length} 块 · ${S.durLabel(sum)}`, "tv-fold-cat", open);
    fold.box.style.setProperty("--cat", CAT_COLOR[cat]);
    fold.body.append(el("div", { class: "sm-meter" }, el("i", { style: `width:${pct}%;background:${CAT_COLOR[cat]}` }), el("span", {}, `${pct}%`)));
    fold.body.append(...(list.length
      ? list.map(b => el("article", { class: "sm-item" },
        el("span", { class: "sm-date" }, shortDate(b.date)),
        el("div", { class: "sm-copy" }, el("b", {}, b.title),
          el("span", {}, [b.start, S.durLabel(b.durMin)].filter(Boolean).join(" · "))),
      ))
      : [el("p", { class: "wm-none" }, "本月没有这类安排")]));
    mobile.append(fold.box);
  }
  root.append(mobile);
  return root;
}
