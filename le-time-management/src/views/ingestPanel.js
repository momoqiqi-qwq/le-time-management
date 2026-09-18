// AI 解析确认面板：把模型识别出的事件逐条摆出来，让用户勾选 / 改类型 / 改时间后再落盘。
//
// 为什么一定要有这一步：模型会认错。课表照片里「第 3-4 节」被读成「3 月 4 日」、
// 通知里的「本周五」被算成下周，这类错误肉眼一扫就能发现，但**静默写进日历后
// 用户根本不知道要去哪找**。所以解析结果一律先过确认面板，绝不由 AI 直接落盘。
import { el, toast } from "../ui.js";
import { closeLayer } from "../motion.js";
import { applyIngestEvents, normalizeIngestEvent, revertIngest, INGEST_KINDS } from "../aiIngest.js";

const KIND_LABEL = { task: "任务", timeblock: "时间块", inbox: "收件箱", course: "课程表" };
const KIND_HINT = {
  task: "进四象限待办",
  timeblock: "排进时间轴",
  inbox: "先收着，不排时间",
  course: "合并进课程表",
};

function rowOf(ev, index) {
  const check = el("input", { type: "checkbox", checked: true, "aria-label": `选择第 ${index + 1} 条` });
  const kindSel = el("select", { class: "ingest-kind", "aria-label": "落点" });
  for (const k of INGEST_KINDS) kindSel.append(el("option", { value: k }, KIND_LABEL[k]));
  kindSel.value = ev.kind;

  const titleIn = el("input", { type: "text", class: "ingest-title", value: ev.title, "aria-label": "标题" });
  const dateIn = el("input", { type: "date", class: "ingest-date", value: ev.date || "", "aria-label": "日期" });
  const timeIn = el("input", { type: "time", class: "ingest-time", value: ev.start || "", "aria-label": "开始时间" });

  const when = el("span", { class: "ingest-when" },
    dateIn,
    timeIn,
    ev.end ? el("span", { class: "ingest-end" }, `→ ${ev.end}`) : null,
    !ev.start ? el("span", { class: "ingest-dur" }, `${ev.durMin} 分钟`) : null,
  );

  const conf = Math.round(ev.confidence * 100);
  const low = ev.confidence < 0.5;
  const meta = el("div", { class: "ingest-meta" },
    el("span", { class: `ingest-badge${low ? " low" : ""}` }, low ? `把握不大 ${conf}%` : `置信 ${conf}%`),
    el("span", { class: "ingest-hint" }, KIND_HINT[ev.kind] || ""),
    ev.note ? el("span", { class: "ingest-note", title: ev.note }, ev.note) : null,
  );

  const row = el("div", { class: `ingest-row${ev.kind === "course" ? " is-course" : ""}` },
    el("label", { class: "ingest-pick" }, check),
    el("div", { class: "ingest-body" },
      el("div", { class: "ingest-line" }, kindSel, titleIn),
      el("div", { class: "ingest-line" }, when),
      meta,
    ),
  );

  // 换落点时同步提示文案，让用户知道这一条会被写到哪儿。
  kindSel.addEventListener("change", () => {
    row.classList.toggle("is-course", kindSel.value === "course");
    meta.querySelector(".ingest-hint").textContent = KIND_HINT[kindSel.value] || "";
  });

  return { ev, check, kindSel, titleIn, dateIn, timeIn, row };
}

/**
 * 打开确认面板。
 *
 * `attachments` 会挂到最终创建的**任务**上（时间块没有附件字段）——
 * 让截图跟任务一起留着，事后能回头核对 AI 读得对不对。
 */
export function openIngestPanel({ result, source = "AI 解析", attachments = [] } = {}) {
  const events = Array.isArray(result?.events) ? result.events : [];
  document.querySelector(".ingest-mask")?.remove();
  if (!events.length) {
    toast("没从这份内容里认出时间安排");
    return;
  }

  const rows = events.map(rowOf);
  const pickedCount = el("b", {}, String(rows.length));
  const list = el("div", { class: "ingest-list" }, ...rows.map((r) => r.row));

  const refreshCount = () => {
    pickedCount.textContent = String(rows.filter((r) => r.check.checked).length);
  };
  rows.forEach((r) => r.check.addEventListener("change", refreshCount));

  const mask = el("div", { class: "drawer-mask ingest-mask", onclick: close });
  const panel = el("div", { class: "ingest-panel", role: "dialog", "aria-label": "AI 解析结果" },
    el("div", { class: "ingest-head" },
      el("div", {},
        el("b", {}, "AI 解析结果"),
        el("small", {}, String(result?.summary || "").slice(0, 120)),
      ),
      el("button", { class: "btn ghost sm", onclick: close }, "关闭"),
    ),
    list,
    el("div", { class: "ingest-foot" },
      el("span", { class: "ingest-count" }, "将写入 ", pickedCount, " 条"),
      el("button", { class: "btn ghost sm", onclick: () => { rows.forEach((r) => { r.check.checked = true; }); refreshCount(); } }, "全选"),
      el("button", { class: "btn ghost sm", onclick: () => { rows.forEach((r) => { r.check.checked = false; }); refreshCount(); } }, "全不选"),
      el("button", { class: "btn pri", onclick: submit }, "确认写入"),
    ),
  );

  async function submit() {
    const picked = rows
      .filter((r) => r.check.checked)
      // 用户在面板里改过的值要重新过一遍归一 —— 面板是唯一的写入闸口，
      // 不能因为「输入框是 date 类型」就假设值一定合法。
      .map((r) => normalizeIngestEvent({
        ...r.ev,
        kind: r.kindSel.value,
        title: r.titleIn.value,
        date: r.dateIn.value,
        start: r.timeIn.value,
      }, new Date()))
      .filter((ev) => ev.title);

    if (!picked.length) { toast("至少勾选一条要写入的内容"); return; }

    const btn = panel.querySelector(".ingest-foot .btn.pri");
    btn.disabled = true;
    btn.textContent = "写入中…";
    try {
      const res = await applyIngestEvents(picked, { source, attachments });
      close();
      report(res);
    } catch (error) {
      btn.disabled = false;
      btn.textContent = "确认写入";
      toast(`写入失败：${error?.message || error}`);
    }
  }

  function report(res) {
    const parts = [];
    if (res.routed.task) parts.push(`任务 ${res.routed.task}`);
    if (res.routed.timeblock) parts.push(`时间块 ${res.routed.timeblock}`);
    if (res.routed.inbox) parts.push(`收件箱 ${res.routed.inbox}`);
    if (res.courseHandled) parts.push(`课程表 ${res.courseHandled}`);
    if (res.courseDegraded) parts.push(`课表未启用，${res.courseDegraded} 条课程转入收件箱`);
    const summary = parts.length ? `已写入：${parts.join(" · ")}` : "没有可写入的内容";
    if (res.skipped && !parts.length) { toast(`${summary}（${res.skipped} 条被跳过）`); return; }
    toast(summary, {
      actionLabel: "撤销",
      ms: 9000,
      action: () => { revertIngest(res.before); toast("已撤销本次写入"); },
    });
  }

  function close() {
    closeLayer(panel, mask, () => document.removeEventListener("keydown", onKey, true));
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  document.addEventListener("keydown", onKey, true);

  document.body.append(mask, panel);
  refreshCount();
  return { close };
}
