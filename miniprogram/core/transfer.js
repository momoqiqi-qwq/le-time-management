// 与桌面 dataCenter 的备份封装 / CSV 列名一致；不依赖 DOM、文件选择器或网络。
const store = require("./store.js");
const UNSAFE = new Set(["__proto__", "prototype", "constructor"]);
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function parseJson(raw) {
  return JSON.parse(typeof raw === "string" ? raw.replace(/^\ufeff/, "") : JSON.stringify(raw), (key, value) => {
    if (UNSAFE.has(key)) throw new Error("备份包含不安全字段，请只导入可信的 U-Time 备份");
    return value;
  });
}
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const p = value.split("-").map(Number);
  return store.fmtDate(new Date(p[0], p[1] - 1, p[2], 12)) === value;
}
function isTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ""); }
function uniqueRows(rows, label) {
  const ids = new Set();
  rows.forEach(row => {
    if (!row || typeof row !== "object" || Array.isArray(row) || typeof row.id !== "string" || !row.id || ids.has(row.id)) throw new Error(label + "含无效或重复 id");
    ids.add(row.id);
  });
}
function validate(data) {
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.blocks)) throw new Error("不是有效的 U-Time 备份：需要 tasks 和 blocks");
  if (Number(data.dataSchemaVersion || 0) > 1) throw new Error("备份来自更新的数据版本，请先升级小程序");
  uniqueRows(data.tasks, "任务"); uniqueRows(data.blocks, "时间块");
  data.tasks.forEach(t => {
    if (typeof t.title !== "string" || !t.title.trim()) throw new Error("备份中有无标题任务");
    if (![1, 2, 3, 4].includes(Number(t.quad))) throw new Error("任务象限须为 1～4");
    t.quad = Number(t.quad);
    if (typeof t.done !== "boolean") t.done = t.done === 1 || t.done === "true";
    if (t.note != null && typeof t.note !== "string") throw new Error("任务备注格式无效");
    if (t.tags != null && (!Array.isArray(t.tags) || t.tags.some(x=>typeof x!=="string"))) throw new Error("任务标签格式无效");
    if (t.attachments != null && (!Array.isArray(t.attachments) || t.attachments.some(x => typeof x !== "string"))) throw new Error("任务附件格式无效");
    // 旧版偶尔把截止日期与时间拼在同一字段，拆开兼容而非静默丢失。
    const legacy = typeof t.due === "string" && t.due.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    if (legacy) { t.due = legacy[1]; t.dueTime = t.dueTime || legacy[2]; }
    if (t.due && !isDate(t.due)) throw new Error("任务截止日期无效");
    if (t.dueTime && !isTime(t.dueTime)) throw new Error("任务截止时刻无效");
    if (t.estMin != null && (!Number.isFinite(Number(t.estMin)) || Number(t.estMin) <= 0)) throw new Error("任务预计时长无效");
  });
  data.blocks.forEach(b => {
    if (!isDate(b.date) || !isTime(b.start) || !Number.isFinite(Number(b.durMin)) || Number(b.durMin) <= 0) throw new Error("备份中有无效时间块");
    b.durMin = Number(b.durMin);
  });
  return store.normalize(data);
}
function parseFullBackup(raw) {
  const obj = parseJson(raw);
  if (obj && obj.format === "le-time-backup" && Number(obj.schema) > 2) throw new Error("备份封装来自更新版本，请先升级");
  return validate(obj && obj.format === "le-time-backup" ? obj.data : obj);
}
function fullBackup(version) {
  if (store.storageStatus().locked) throw new Error("当前数据处于保护状态，不能把空白保护视图当作备份导出");
  return { format: "le-time-backup", schema: 2, appVersion: version || "", exportedAt: new Date().toISOString(), data: copy(store.getState()) };
}
function summary(data) {
  return { tasks: data.tasks.length, blocks: data.blocks.length, inbox: (data.inbox || []).length, plugins: Object.keys(data.plugins || {}).length };
}
// 合并只新增缺少的 id/设置键；重号保留本机，覆盖恢复必须走用户单独确认的 replace。
function merge(current, incoming) {
  const base = copy(current), added = copy(incoming);
  const out = Object.assign({}, added, base);
  for (const key of ["tasks", "blocks", "inbox"]) {
    const existing = Array.isArray(base[key]) ? base[key] : [];
    const ids = new Set(existing.map(x => x.id));
    out[key] = existing.concat((added[key] || []).filter(x => !x.id || !ids.has(x.id)));
  }
  out.settings = Object.assign({}, added.settings, base.settings);
  out.automation = Object.assign({}, added.automation, base.automation);
  out.plugins = Object.assign({}, added.plugins, base.plugins);
  return store.normalize(out);
}
function importBackup(data, mode) {
  if (mode === "merge" && store.storageStatus().locked) throw new Error("原存档不可读，请选择替换恢复有效备份");
  const incoming = validate(copy(data));
  if (mode !== "merge" && mode !== "replace") throw new Error("请选择合并或替换恢复");
  return store.commitSnapshot(mode === "merge" ? merge(store.getState(), incoming) : incoming);
}
function csvCell(value) {
  let s = value == null ? "" : String(value);
  // 防止用户内容在 Excel 中被当作公式执行；JSON 备份仍保留完整原始内容。
  if (/^[=+@-]/.test(s) || /^[\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(rows) { return "\ufeff" + rows.map(row => row.map(csvCell).join(",")).join("\r\n"); }
function tasksToCsv(tasks) {
  return csv([["id", "title", "note", "quadrant", "done", "estimate_min", "tags", "project", "due", "due_time", "created_at"]]
    .concat((tasks || store.getState().tasks).map(t => [t.id, t.title, t.note, t.quad, t.done ? 1 : 0, t.estMin, (t.tags || []).join("|"), t.project, t.due, t.dueTime, t.createdAt])));
}
function blocksToCsv(blocks) {
  return csv([["id", "date", "start", "duration_min", "title", "task_id", "category"]]
    .concat((blocks || store.getState().blocks).map(b => [b.id, b.date, b.start, b.durMin, b.title, b.taskId, b.cat])));
}
function csvRows(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  const src = String(text || "").replace(/^\ufeff/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (quoted) throw new Error("CSV 引号没有闭合");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
function parseTasksCsv(text) {
  const rows = csvRows(text);
  if (rows.length < 2) throw new Error("CSV 没有任务记录");
  const header = rows.shift().map(x => x.trim().toLowerCase());
  if (!["title", "标题", "任务"].some(key => header.includes(key))) throw new Error("CSV 缺少 title / 标题列");
  const get = (row, names) => { const at = names.map(key => header.indexOf(key)).find(i => i >= 0); return at == null ? "" : row[at] || ""; };
  const tasks = rows.filter(row => row.some(Boolean)).map(row => ({
    id: get(row, ["id"]) || store.uid("t"), title: get(row, ["title", "标题", "任务"]), note: get(row, ["note", "备注"]),
    quad: Number(get(row, ["quadrant", "quad", "象限"])) || 1, done: ["1", "true", "yes", "是"].includes(get(row, ["done", "完成"]).toLowerCase()),
    estMin: Number(get(row, ["estimate_min", "estmin", "预计分钟"])) || 30,
    tags: get(row, ["tags", "标签"]).split(/[|,，、]/).map(x => x.trim()).filter(Boolean), project: get(row, ["project", "项目"]),
    due: get(row, ["due", "截止日期"]) || null, dueTime: get(row, ["due_time", "截止时间"]) || "23:59", createdAt: Number(get(row, ["created_at"])) || Date.now(),
  }));
  return validate({ tasks, blocks: [], settings: {}, plugins: {}, inbox: [] });
}
function icsEscape(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function stamp(date, time) { return date.replace(/-/g, "") + "T" + time.replace(":", "") + "00"; }
function foldLine(line) {
  let bytes = 0, out = "";
  for (const ch of line) {
    const n = ch.codePointAt(0); const size = n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
    if (bytes + size > 75) { out += "\r\n "; bytes = 1; }
    out += ch; bytes += size;
  }
  return out;
}
function toIcs(blocks, tasks) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//U-Time//Mini Program//CN", "CALSCALE:GREGORIAN"];
  (blocks || store.getState().blocks).forEach(b => {
    const end = store.mmOf(b.start) + Number(b.durMin);
    lines.push("BEGIN:VEVENT", "UID:" + icsEscape(b.id) + "@le-time", "DTSTART:" + stamp(b.date, b.start),
      "DTEND:" + stamp(store.addDays(b.date, Math.floor(end / 1440)), store.hhmmOf(end)), "SUMMARY:" + icsEscape(b.title), "CATEGORIES:" + icsEscape(b.cat), "END:VEVENT");
  });
  (tasks || store.getState().tasks).filter(t => isDate(t.due)).forEach(t => {
    lines.push("BEGIN:VTODO", "UID:" + icsEscape(t.id) + "@le-time", "SUMMARY:" + icsEscape(t.title), "DUE:" + stamp(t.due, t.dueTime || "23:59"),
      "STATUS:" + (t.done ? "COMPLETED" : "NEEDS-ACTION"), "DESCRIPTION:" + icsEscape(t.note), "END:VTODO");
  });
  lines.push("END:VCALENDAR"); return lines.map(foldLine).join("\r\n") + "\r\n";
}
module.exports = { copy, parseJson, validate, isDate, isTime, parseFullBackup, fullBackup, summary, merge, importBackup, tasksToCsv, blocksToCsv, parseTasksCsv, csvRows, toIcs, foldLine };
