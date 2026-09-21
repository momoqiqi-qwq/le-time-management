// 课程表原生适配：模型由桌面事实源生成，存储键与 Windows / Android 完全一致。
const store = require("./store.js");
const M = require("./scheduleModel.js").ShiguangModel;
const transfer = require("./transfer.js");
const ID = "shiguang-schedule";
function pack(name, data) { return { id: store.uid("table"), name: String(name || "我的课表").slice(0, 80), createdAt: Date.now(), data: M.normalize(data) }; }
function load() {
  const raw = store.pluginStorageGet(ID, "tables", null);
  const tables = Array.isArray(raw) && raw.length ? transfer.copy(raw).map((p, i) => Object.assign({}, p, {
    id: String(p.id || p.tableId || "legacy-table-" + i), name: String(p.name || p.tableName || "课表 " + (i + 1)), data: p.data || p.tableData,
  })) : [Object.assign(pack("我的课表", store.pluginStorageGet(ID, "table", M.empty(store.todayStr()))), { id: "table-default" })];
  const saved = store.pluginStorageGet(ID, "currentTableId", "");
  const currentId = tables.some(p => p.id === saved) ? saved : tables[0].id;
  const current = tables.find(p => p.id === currentId);
  return { tables, currentId, table: M.normalize(current.data), name: current.name };
}
function save(tables, currentId) {
  if (!tables.length) throw new Error("至少保留一张课表");
  const current = tables.find(p => p.id === currentId);
  if (!current) throw new Error("请选择有效课表");
  current.data = M.normalize(current.data);
  const next = transfer.copy(store.getState());
  const rec = next.plugins[ID] || { enabled: true, storage: {} };
  rec.storage = Object.assign({}, rec.storage, { tables, currentTableId: currentId, table: current.data });
  next.plugins[ID] = rec;
  store.commitSnapshot(next); // 文件导入/批量课程不会显示“成功”却没落盘。
  return load();
}
function saveTable(data) {
  const st = load(); st.tables.find(p => p.id === st.currentId).data = M.normalize(data);
  return save(st.tables, st.currentId);
}
function addTable(name) { const st = load(), row = pack(name, M.empty(store.todayStr())); st.tables.push(row); return save(st.tables, row.id); }
function renameTable(name) {
  const label = String(name || "").trim(); if (!label) throw new Error("课表名称不能为空");
  const st = load(); st.tables.find(p => p.id === st.currentId).name = label.slice(0, 80); return save(st.tables, st.currentId);
}
function selectTable(id) { const st = load(); return save(st.tables, id); }
function deleteTable(id) {
  const st = load(); if (st.tables.length === 1) throw new Error("最后一张课表不能删除，可单独删除课程");
  const remaining = st.tables.filter(p => p.id !== id);
  return save(remaining, remaining.some(p => p.id === st.currentId) ? st.currentId : remaining[0].id);
}
function upsertCourse(input) {
  const st = load(), row = Object.assign({}, input, { id: input.id || store.uid("course") });
  const courses = st.table.courses.filter(c => c.id !== row.id).concat([row]);
  return saveTable(Object.assign({}, st.table, { courses }));
}
function deleteCourse(id) { const st = load(); return saveTable(Object.assign({}, st.table, { courses: st.table.courses.filter(c => c.id !== id) })); }
function importPreview(text, name) {
  const base = load().table, raw = String(text || "").trim();
  if (!raw) throw new Error("请先选择文件或粘贴课表内容");
  if (/^[{[]/.test(raw)) {
    const parsed = transfer.parseJson(raw);
    const app = parsed.format === "le-time-backup" ? parsed.data : parsed;
    const plugin = app && app.plugins && app.plugins[ID];
    const data = plugin ? plugin.storage : parsed;
    let rows;
    if (Array.isArray(data.tables)) rows = data.tables.map(p => ({ name: p.name || p.tableName, data: p.data || p.tableData }));
    else if (data.table && Array.isArray(data.table.courses)) rows = [{ name: name || "导入课表", data: data.table }];
    else rows = M.packs(data);
    if (!rows.length || rows.length > 100) throw new Error("课表数量无效（最多 100 张）");
    const tables = rows.map(p => pack(p.name || name, p.data));
    return { tables, warnings: [], count: tables.reduce((n, p) => n + p.data.courses.length, 0) };
  }
  const result = M.parseAcademicText(raw, base);
  return { tables: [pack(name || "教务导入", result.table)], warnings: result.warnings, count: result.table.courses.length };
}
function applyImport(preview, mode) {
  const st = load();
  if (!preview || !preview.tables || !preview.tables.length) throw new Error("没有可导入的课表");
  if (mode === "merge") {
    if (preview.tables.length !== 1) throw new Error("多张课表请使用新增导入");
    return saveTable(M.mergeTables(st.table, preview.tables[0].data));
  }
  if (mode !== "append") throw new Error("请选择导入方式");
  const rows = preview.tables.map(p => pack(p.name, p.data));
  return save(st.tables.concat(rows), rows[0].id);
}
function exportJson() {
  const st = load();
  return JSON.stringify({ allTables: st.tables.map(p => ({ tableName: p.name, tableData: p.data })), exportedAt: new Date().toISOString() }, null, 2);
}
function syncWeek(week) {
  const st = load();
  if (!Number.isInteger(Number(week)) || week < 1 || week > st.table.config.semesterTotalWeeks) throw new Error("周次无效");
  const rows = M.occurrences(st.table, Number(week)), next = transfer.copy(store.getState());
  let added = 0, duplicates = 0, conflicts = 0;
  rows.forEach(c => {
    const start = M.minutes(c.start), end = M.minutes(c.end);
    if (next.blocks.some(b => b.date === c.date && b.start === c.start && b.title === c.name && Number(b.durMin) === end-start)) { duplicates++; return; }
    if (next.blocks.some(b => b.date === c.date && start < store.mmOf(b.start) + Number(b.durMin) && end > store.mmOf(b.start))) { conflicts++; return; }
    next.blocks.push({ id: store.uid("b"), date: c.date, start: c.start, durMin: end - start, title: c.name, taskId: null, cat: "study", sourcePlugin: ID, sourceCourseId: c.id, sourceTableId: st.currentId, note: [c.teacher, c.position].filter(Boolean).join(" · ") });
    added++;
  });
  if (added) store.commitSnapshot(next);
  return { added, duplicates, conflicts };
}
function exportIcs() {
  const st = load(), blocks = [];
  for (let week = 1; week <= st.table.config.semesterTotalWeeks; week++) {
    M.occurrences(st.table, week).forEach(c => blocks.push({ id: c.id + "-" + c.date, date: c.date, start: c.start, durMin: M.minutes(c.end) - M.minutes(c.start), title: c.name + (c.position ? " · " + c.position : ""), cat: "study" }));
  }
  return transfer.toIcs(blocks, []);
}
function view(week, mode) {
  const st = load(), realWeek = M.weekOf(st.table.config.semesterStartDate, store.todayStr());
  const shown = Math.max(1, Math.min(st.table.config.semesterTotalWeeks, Number(week) || realWeek));
  const rows = M.occurrences(st.table, shown), conflicting = M.conflicts(rows);
  const startDate = M.addDays(M.monday(st.table.config.semesterStartDate), (shown - 1) * 7);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: i + 1, date: M.addDays(startDate, i), label: "周" + "一二三四五六日"[i], courses: [] }));
  rows.forEach(c => days[c.day - 1].courses.push(Object.assign({}, c, { timeLabel: c.start + "–" + c.end, conflict: conflicting.has(c.id), colorClass: "course-color-" + (Math.abs(c.color || 0) % 6) })));
  return { state: st, week: shown, realWeek, inSemester: realWeek >= 1 && realWeek <= st.table.config.semesterTotalWeeks, days: mode === "today" ? days.filter(d => d.date === store.todayStr()) : days, count: rows.length, conflicts: conflicting.size };
}
module.exports = { M, ID, load, save, saveTable, addTable, renameTable, selectTable, deleteTable, upsertCourse, deleteCourse, importPreview, applyImport, exportJson, syncWeek, exportIcs, view };
