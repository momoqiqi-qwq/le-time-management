// 任务详情抽屉（四象限右滑出）
import * as S from "../store.js";
import { el, QUADS, toast } from "../ui.js";
import { taskActions } from "../pluginHost.js";
import { PRESET_OFFSETS, normalizeOffsets, reminderLabel } from "../taskReminder.js";
import { closeLayer } from "../motion.js";
import { toggleSwitch } from "../switchControl.js";
import { pluginDisplayName, pluginDisplayIcon } from "../pluginAppearance.js";

export function openTaskDrawer(taskId) {
  document.querySelector(".drawer")?._close?.();
  document.querySelector(".drawer-mask")?.remove();

  const t = S.taskById(taskId);
  if (!t) return;

  const mask = el("div", { class: "drawer-mask", onclick: close });
  const body = el("div", { class: "dbody" });

  const title = el("h3", {}, t.title);
  const titleInput = el("input", { value: t.title, "aria-label": "任务名称" });
  titleInput.addEventListener("change", () => {
    const value = titleInput.value.trim();
    if (!value) { titleInput.value = t.title; toast("任务名称不能为空"); return; }
    S.updateTask(t.id, { title: value }); refresh();
  });
  const tagsInput = el("input", { value: (t.tags || []).join("，"), placeholder: "用逗号分隔" });
  tagsInput.addEventListener("change", () => S.updateTask(t.id, { tags: [...new Set(tagsInput.value.split(/[,，]/).map(x => x.trim()).filter(Boolean))] }));
  const quadBtns = QUADS.map((qd) => el("button", {
    class: t.quad === qd.q ? "on" : "", "data-q": qd.q,
    onclick: () => { S.updateTask(t.id, { quad: qd.q }); refresh(); },
  }, ["I", "II", "III", "IV"][qd.q - 1]));

  const estSel = el("select", {});
  for (const m of [15, 30, 45, 60, 90, 120, 180]) estSel.append(el("option", { value: m }, S.durLabel(m)));
  if (![15, 30, 45, 60, 90, 120, 180].includes(t.estMin)) estSel.append(el("option", { value: t.estMin }, S.durLabel(t.estMin)));
  estSel.value = String(t.estMin);
  estSel.addEventListener("change", () => { S.updateTask(t.id, { estMin: Number(estSel.value) }); refresh(); });

  const dueInput = el("input", { type: "date", value: t.due || "" });
  dueInput.addEventListener("change", () => { S.updateTask(t.id, { due: dueInput.value || null }); refresh(); });
  const dueTimeInput = el("input", { type: "time", value: t.dueTime || "23:59" });
  dueTimeInput.addEventListener("change", () => { S.updateTask(t.id, { dueTime: dueTimeInput.value || "23:59" }); refresh(); });
  const reminderSwitch = toggleSwitch({
    checked: t.reminderEnabled !== false,
    ariaLabel: "启用此任务的提醒",
    onChange: (value) => { S.updateTask(t.id, { reminderEnabled: value }); refresh(); },
  });
  const reminderBox = el("div", { class: "reminder-picks" });
  const customOffset = el("input", { type: "number", min: "0", max: "43200", placeholder: "自定义分钟", class: "reminder-custom" });
  const renderReminderPicks = () => {
    const cur = S.taskById(t.id);
    const defaults = S.getState().settings.taskReminder?.defaultOffsets || [60, 10, 0];
    const offsets = Array.isArray(cur?.reminderOffsets) ? normalizeOffsets(cur.reminderOffsets) : normalizeOffsets(defaults);
    reminderBox.replaceChildren();
    for (const off of PRESET_OFFSETS) {
      const on = offsets.includes(off);
      reminderBox.append(el("button", {
        type: "button", class: `reminder-chip${on ? " on" : ""}`,
        onclick: () => {
          const next = on ? offsets.filter((x) => x !== off) : normalizeOffsets([...offsets, off]);
          S.updateTask(t.id, { reminderOffsets: next }); refresh();
        },
      }, off === 0 ? "到点" : reminderLabel(off).replace("截止", "")));
    }
    for (const off of offsets.filter((x) => !PRESET_OFFSETS.includes(x))) {
      reminderBox.append(el("button", { type: "button", class: "reminder-chip on", onclick: () => { S.updateTask(t.id, { reminderOffsets: offsets.filter((x) => x !== off) }); refresh(); } }, `${off} 分钟 ×`));
    }
    reminderBox.append(customOffset, el("button", { type: "button", class: "btn ghost sm", onclick: () => {
      const n = Math.round(Number(customOffset.value));
      if (!Number.isFinite(n) || n < 0 || n > 43200) return toast("请输入 0～43200 分钟");
      S.updateTask(t.id, { reminderOffsets: normalizeOffsets([...offsets, n]) }); customOffset.value = ""; refresh();
    } }, "添加"));
  };

  const projInput = el("input", { type: "text", value: t.project || "", placeholder: "无" });
  projInput.addEventListener("change", () => { S.updateTask(t.id, { project: projInput.value.trim() }); refresh(); });

  const noteInput = el("textarea", { placeholder: "补充说明…" });
  noteInput.value = t.note || "";
  noteInput.addEventListener("change", () => { S.updateTask(t.id, { note: noteInput.value }); refresh(); });

  const plugBox = el("div", { class: "plug-actions" });
  const renderPlugActions = () => {
    plugBox.replaceChildren();
    if (!taskActions.length) return;
    plugBox.append(el("div", { class: "lab" }, "插 件 动 作"));
    for (const a of taskActions) {
      plugBox.append(el("button", {
        class: "btn ghost sm",
        onclick: () => { try { a.run(JSON.parse(JSON.stringify(S.taskById(t.id)))); } catch (e) { toast(`插件动作出错：${e.message}`); } },
      }, a.icon ? `${a.icon} ` : "", a.label));
    }
  };

  const attBox = el("div", {});
  const renderAtts = () => {
    attBox.replaceChildren();
    const atts = (S.taskById(t.id)?.attachments) || [];
    if (!atts.length) return;
    attBox.append(el("div", { class: "lab" }, "图 片 附 件"), el("div", { class: "att-imgs" },
      ...atts.map((u) => el("img", { src: u, onclick: () => window.open(u, "_blank") }))));
  };

  body.append(
    el("div", { class: "kv" }, el("span", {}, "任务名称"), titleInput),
    // 插件联动提醒：显示来源插件图标与名称（手动创建的任务没有这一行）
    t.sourcePlugin ? el("div", { class: "kv" }, el("span", {}, "来源插件"),
      el("span", { class: "src-plug", title: "这条提醒由插件创建" },
        pluginDisplayIcon(t.sourcePlugin, pluginDisplayName(t.sourcePlugin)),
        el("span", {}, pluginDisplayName(t.sourcePlugin)))) : null,
    el("div", { class: "kv" }, el("span", {}, "标签"), tagsInput),
    el("div", { class: "kv" }, el("span", {}, "所属象限"), el("span", { class: "quadpick" }, ...quadBtns)),
    el("div", { class: "kv" }, el("span", {}, "预估耗时"), estSel),
    el("div", { class: "kv" }, el("span", {}, "截止日期"), dueInput),
    el("div", { class: "kv" }, el("span", {}, "截止时间"), dueTimeInput),
    el("div", { class: "kv" }, el("span", {}, "任务提醒"), el("label", { class: "reminder-toggle" }, reminderSwitch, el("span", {}, "启用"))),
    el("div", { class: "kv reminder-kv" }, el("span", { class: "reminder-kv-lab" }, "提前预警"), reminderBox),
    el("div", { class: "kv" }, el("span", {}, "所属项目"), projInput),
    el("div", { class: "kv", style: "align-items:flex-start" }, el("span", { style: "padding-top:8px" }, "备注"), noteInput),
    attBox,
    el("div", { class: "lab" }, "快 捷 操 作"),
    plugBox,
  );

  const foot = el("div", { class: "dfoot" },
    el("button", { class: "btn pri", onclick: () => { scheduleToToday(t); } }, "排入今天时间块"),
    el("button", {
      class: "btn ghost",
      onclick: () => { S.toggleTask(t.id); refresh(); },
    }, t.done ? "↩ 标记未完成" : "✓ 标记完成"),
    el("button", {
      class: "btn danger",
      onclick: () => {
        const undo = S.deleteTaskUndoable(t.id);
        close();
        toast(`已删除「${t.title}」`, { actionLabel: "撤销", action: undo });
      },
    }, "删除"),
  );

  const drawer = el("div", { class: "drawer" },
    el("div", { class: "dh" }, title, el("button", { class: "btn ghost sm", onclick: close }, "✕ 关闭")),
    body, foot,
  );
  drawer._close = close;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  document.body.append(mask, drawer);
  renderPlugActions();
  renderAtts();
  renderReminderPicks();

  function refresh() {
    const cur = S.taskById(t.id);
    if (!cur) return close();
    title.textContent = cur.title;
    foot.children[1].textContent = cur.done ? "↩ 标记未完成" : "✓ 标记完成";
    quadBtns.forEach((b) => b.classList.toggle("on", Number(b.dataset.q) === cur.quad));
    estSel.value = String(cur.estMin);
    dueInput.value = cur.due || "";
    dueTimeInput.value = cur.dueTime || "23:59";
    reminderSwitch.checked = cur.reminderEnabled !== false;
    renderReminderPicks();
    noteInput.value = cur.note || "";
    renderPlugActions();
  }
  function close() { closeLayer(drawer, mask, () => document.removeEventListener("keydown", onKey)); }
}

// 找今天第一个放得下的空闲时段；失败时保留已有安排。
export function scheduleToToday(t) {
  try {
    const b = S.placeTask(t, S.todayStr());
    toast(`已排入今天 ${b.start} · ${S.durLabel(b.durMin)}`);
  } catch (e) { toast(e.message); }
}
