// 捕获建块流程（纯函数，供捕获页使用、可被 Node 测试覆盖）
// 对应桌面端 capture.js 的 handleText：解析 → 组装任务/时间块字段
const parser = require("./timeParser.js");
const store = require("./store.js");

// 时长可选项（分钟）；解析出的非整刻时长会动态插入
const DUR_STEPS = [15, 30, 45, 60, 90, 120, 180];

function buildCapture(text, base) {
  const p = parser.parseWhen(text, base);
  const cat = parser.guessCategory(text);
  const span = p.endMin !== null ? p.endMin - p.startMin : 60;
  const dur = span > 0 ? span : span + 1440;
  const estMin = p.endMin !== null ? dur : 60;
  return {
    title: String(p.title || text).split(/\r?\n/)[0].slice(0, 160),
    cat,
    quad: parser.guessQuad(p.date, base),
    estMin,
    due: p.date,
    hasDate: !!p.date,
    hasTime: p.startMin !== null,
    // 无时间时给 09:00 兜底（与桌面端一致）
    start: p.startMin !== null ? store.hhmmOf(p.startMin) : "09:00",
    dur,
    note: text,
  };
}

// 时长选择器：把解析出的时长并入档位，返回 {values, index}
function durOptions(estMin) {
  const values = DUR_STEPS.slice();
  if (!values.includes(estMin)) {
    values.push(estMin);
    values.sort((a, b) => a - b);
  }
  return { values, index: values.indexOf(estMin) };
}

function createFromCapture(cap, edit) {
  const duration = Number(edit.durMin), segments = [];
  if (!Number.isInteger(duration) || duration < 1 || duration > 1440) throw new Error("时长须为 1～1440 整数分钟");
  if (edit.date) {
    const parts = edit.date.split("-").map(Number);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.date) || store.fmtDate(new Date(parts[0], parts[1]-1, parts[2], 12)) !== edit.date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(edit.start)) throw new Error("日期或时间无效");
    const start = store.mmOf(edit.start), first = Math.min(duration, 1440-start);
    segments.push({ date: edit.date, start, dur: first });
    if (first < duration) segments.push({ date: store.addDays(edit.date,1), start:0, dur:duration-first });
    for (const segment of segments) if (store.blocksOf(segment.date).some(b => segment.start < store.mmOf(b.start)+Number(b.durMin) && segment.start+segment.dur > store.mmOf(b.start))) throw new Error("这段时间已有安排，请调整预览，或选择仅建任务");
  }
  let task;
  store.batchChanges(() => {
    task = store.addTask({ title:cap.title,quad:cap.quad,estMin:duration,due:edit.date||null,dueTime:cap.hasTime?edit.start:"23:59",tags:[store.catLabel(edit.cat),"捕获"],note:cap.note });
    segments.forEach(seg => store.addBlock({ date:seg.date,start:store.hhmmOf(seg.start),durMin:seg.dur,title:cap.title,taskId:task.id,cat:edit.cat }));
  });
  return { task, hasBlock:segments.length>0, blocksCount:segments.length };
}

module.exports = { buildCapture, durOptions, createFromCapture, DUR_STEPS };
