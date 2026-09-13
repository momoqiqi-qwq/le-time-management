import * as S from "../store.js";
import { el } from "../ui.js";

const VIEW_META = [
  ["day", "日时间轴", "当前可拖拽编辑的日程"],
  ["wakeup", "WakeUp课表", "七日课程表式周视图"],
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

export function createTimeViewSwitcher({ current = "day", onChange }) {
  const bar = el("div", { class: "time-viewbar", role: "tablist", "aria-label": "时间视图" });
  const buttons = new Map();
  for (const [id, label, title] of VIEW_META) {
    const b = el("button", { class: `time-viewbtn${id === current ? " on" : ""}`, role: "tab", title, "aria-selected": id === current ? "true" : "false" }, label);
    b.onclick = () => onChange(id);
    buttons.set(id, b); bar.append(b);
  }
  bar.setCurrent = (id) => {
    for (const [key, b] of buttons) {
      const on = key === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false");
    }
  };
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
function monthLabel(s) { const d = parseDate(s); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
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

function head(title, desc) {
  return el("div", { class: "tv-head" }, el("div", {}, el("h2", {}, title), el("p", {}, desc)));
}


function mondayOf(dateStr) {
  const d = parseDate(dateStr); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return dateKey(d);
}
function addDate(dateStr, n) { const d = parseDate(dateStr); d.setDate(d.getDate() + n); return dateKey(d); }
function minutes(hhmm) { const [h,m] = String(hhmm || "0:0").split(":").map(Number); return h * 60 + m; }
function wakeupView(data, anchorDate) {
  const root = el("section", { class:"tv-panel wakeup-view" });
  const anchor = anchorDate || S.todayStr(); const monday = mondayOf(anchor); const today = S.todayStr();
  const table = data.courseTable;
  let slots = table?.timeSlots?.length ? [...table.timeSlots].sort((a,b)=>Number(a.number)-Number(b.number)) : [];
  let courses = []; let week = null;
  if (table?.config?.semesterStartDate && table?.courses?.length) {
    const semMonday = mondayOf(table.config.semesterStartDate);
    week = Math.floor((parseDate(monday) - parseDate(semMonday)) / 604800000) + 1;
    const map = new Map(slots.map((x,i)=>[Number(x.number),i]));
    if (week >= 1 && week <= Number(table.config.semesterTotalWeeks || 20)) {
      courses = table.courses.filter(c => (c.weeks || []).map(Number).includes(week)).map((c,i)=>{
        let start = c.customStartTime, end = c.customEndTime, r1, r2;
        if (!c.isCustomTime) { const a=map.get(Number(c.startSection)), b=map.get(Number(c.endSection)); r1=a; r2=b; start=slots[a]?.startTime; end=slots[b]?.endTime; }
        else { r1 = slots.findIndex(x=>minutes(x.endTime)>minutes(start)); r1=Math.max(0,r1); r2=slots.findLastIndex?.(x=>minutes(x.startTime)<minutes(end)); if (r2==null || r2<r1) r2=r1; }
        return {...c, start, end, r1, r2, color:PALETTE[(Number(c.color)||i)%PALETTE.length]};
      });
    }
  }
  if (!slots.length) {
    slots = Array.from({length:16},(_,i)=>{ const m=7*60+i*60; return {number:i+1,startTime:S.hhmmOf(m),endTime:S.hhmmOf(m+50)}; });
    const mapDate = new Map(Array.from({length:7},(_,i)=>[addDate(monday,i),i+1]));
    courses = data.blocks.filter(b=>mapDate.has(b.date)).map((b,i)=>{ const sm=minutes(b.start), em=sm+Number(b.durMin||30); const r1=clamp(Math.floor((sm-420)/60),0,15), r2=clamp(Math.floor((Math.max(sm+1,em)-421)/60),r1,15); return {name:b.title,day:mapDate.get(b.date),position:CAT_NAME[b.cat]||"时间块",start:b.start,end:S.hhmmOf(em),r1,r2,color:CAT_COLOR[b.cat]||PALETTE[i%PALETTE.length]}; });
  }
  root.append(head("WakeUp 课表周视图", `${week ? `第 ${week} 周 · ` : ""}${monday} ～ ${addDate(monday,6)} · 课程表式时间布局，窄屏可横向滚动。`));
  const sc = el("div", {class:"wakeup-scroll"}); const grid = el("div", {class:"wakeup-grid", style:`--slot-count:${slots.length}`});
  grid.append(el("div",{class:"wk-corner"},week?`第${week}周`:"时间"));
  const dayNames=["周一","周二","周三","周四","周五","周六","周日"];
  for(let i=0;i<7;i++){ const d=addDate(monday,i); grid.append(el("div",{class:`wk-day${d===today?" today":""}`,style:`grid-column:${i+2};grid-row:1`},el("b",{},dayNames[i]),el("span",{},shortDate(d)))); }
  slots.forEach((sl,i)=>grid.append(el("div",{class:"wk-slot",style:`grid-column:1;grid-row:${i+2}`},el("b",{},String(sl.number)),el("span",{},`${sl.startTime}
${sl.endTime}`))));
  for(let r=0;r<slots.length;r++) for(let d=0;d<7;d++) grid.append(el("div",{class:"wk-cell",style:`grid-column:${d+2};grid-row:${r+2}`}));
  courses.forEach((c,i)=>{ const col=clamp(Number(c.day)||1,1,7)+1; const r1=clamp(Number(c.r1)||0,0,slots.length-1)+2; const r2=clamp(Number(c.r2??c.r1)||0,0,slots.length-1)+3; const card=el("article",{class:"wk-course",style:`grid-column:${col};grid-row:${r1}/${r2};--wk:${c.color||PALETTE[i%PALETTE.length]}`,title:`${c.name||c.title} ${c.start||""}-${c.end||""}`},el("b",{},c.name||c.title),c.position?el("span",{},c.position):null,el("small",{},`${c.start||""}${c.end?`-${c.end}`:""}${c.teacher?` · ${c.teacher}`:""}`)); grid.append(card); });
  sc.append(grid); root.append(sc);
  if (!courses.length) root.append(el("div",{class:"wk-tip"}, table ? "这一周没有课程。可切换日期查看其他教学周。" : "还没有课程表数据：当前会用本周时间块代替展示。导入“课程表”插件后会自动切换为真实节次和课程。"));
  return root;
}
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
    const cell = el("div", { class: "ms-cell", style: `--ms:${c}` },
      el("div", { class: "ms-stage" }, label),
      el("div", { class: "ms-line" }),
      el("div", { class: "ms-arrow" }, el("b", {}, e.date.slice(0, 4)), el("span", {}, shortDate(e.date))),
      el("div", { class: "ms-pin" }, "●"),
      el("div", { class: "ms-copy" }, el("b", {}, e.title), el("span", {}, e.subtitle || e.kind)),
    );
    inner.append(cell);
  });
  root.append(track);
  return root;
}

function chronicleView(data) {
  const root = el("section", { class: "tv-panel chronicle-view" });
  root.append(head("横向时间轴", "参考机器人发展史年表：适合信息密度高、事件多的长期回顾。"));
  if (!data.events.length) { root.append(empty()); return root; }
  const events = data.events.slice(0, 30);
  const minDate = events[0].date, maxDate = events.at(-1).date;
  const total = Math.max(1, dayDiff(minDate, maxDate));
  const canvas = el("div", { class: "chronicle-canvas" });
  const axis = el("div", { class: "chronicle-axis" });
  canvas.append(axis);
  events.forEach((e, i) => {
    const x = clamp(dayDiff(minDate, e.date) / total * 94 + 3, 2, 97);
    const upper = i % 2 === 0;
    const node = el("div", { class: `chronicle-event ${upper ? "up" : "down"}`, style: `left:${x}%;--ec:${PALETTE[i % PALETTE.length]}` },
      el("div", { class: "ce-card" }, el("b", {}, e.title), el("span", {}, `${e.date} · ${e.subtitle || e.kind}`)),
      el("div", { class: "ce-stem" }), el("div", { class: "ce-dot" }),
      el("div", { class: "ce-date" }, e.date),
    );
    canvas.append(node);
  });
  root.append(el("div", { class: "chronicle-scroll" }, canvas));
  return root;
}

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

function ganttView(data) {
  const root = el("section", { class: "tv-panel gantt-view" });
  root.append(head("年度甘特图", "参考年度工作规划：按任务起止日期映射到月份，可横向滚动查看全年。"));
  const rows = data.projects.flatMap(([group, list]) => list.map(x => ({ ...x, group }))).slice(0, 18);
  if (!rows.length) { root.append(empty("暂无可生成甘特图的任务")); return root; }
  const years = rows.flatMap(r => [parseDate(r.start).getFullYear(), parseDate(r.end).getFullYear()]);
  const year = years.sort((a, b) => a - b)[Math.floor(years.length / 2)] || new Date().getFullYear();
  const start = `${year}-01-01`, end = `${year}-12-31`, total = dayDiff(start, end) + 1;
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
  root.append(el("div", { class: "gantt-scroll" }, grid)); return root;
}

function swimlaneView(data, anchorDate) {
  const root = el("section", { class: "tv-panel swimlane-view" });
  const anchor = parseDate(anchorDate || S.todayStr());
  const y = anchor.getFullYear(), m = anchor.getMonth();
  const startDate = dateKey(new Date(y, m, 1)), endDate = dateKey(new Date(y, m + 1, 0));
  root.append(head("阶段甘特图", `${y}年${m + 1}月 · 参考阶段泳道图：按工作/学习/运动/生活/休息分组。`));
  const monthBlocks = data.blocks.filter(b => b.date >= startDate && b.date <= endDate);
  if (!monthBlocks.length) { root.append(empty("本月暂无时间块")); return root; }
  const days = parseDate(endDate).getDate();
  const lane = el("div", { class: "swim-grid" });
  const hdr = el("div", { class: "swim-head", style: `--days:${days}` }, el("div", { class: "swim-label swim-year" }, `${y}.${String(m + 1).padStart(2, "0")}`));
  for (let d = 1; d <= days; d++) hdr.append(el("div", { class: "swim-day" }, d));
  lane.append(hdr);
  for (const cat of ["work", "study", "sport", "life", "rest"]) {
    const row = el("div", { class: "swim-row" }, el("div", { class: "swim-label", style: `background:${CAT_COLOR[cat]}` }, CAT_NAME[cat]));
    const cells = el("div", { class: "swim-cells", style: `--days:${days}` }, ...Array.from({ length: days }, () => el("i")));
    const list = monthBlocks.filter(b => (b.cat || "work") === cat);
    list.forEach((b, i) => {
      const d = parseDate(b.date).getDate();
      const width = Math.min(6, Math.max(1.3, b.durMin / 120));
      cells.append(el("div", { class: "swim-bar", title: `${b.date} ${b.start} · ${b.title}`, style: `left:${(d - 1) / days * 100}%;width:${width}%;background:${PALETTE[(i + ["work","study","sport","life","rest"].indexOf(cat)) % PALETTE.length]}` }, b.title));
    });
    row.append(cells); lane.append(row);
  }
  root.append(el("div", { class: "swim-scroll" }, lane)); return root;
}
