import { el, toast } from "../ui.js";
import {
  aiPlanAutomation,
  aiScheduleLabel,
  deleteAiAutomationRule,
  getAiAutomationRules,
  normalizeAiRule,
  runAiAutomationRule,
  saveAiAutomationRule,
  setAiAutomationEnabled,
} from "../aiAutomation.js";
import { closeLayer } from "../motion.js";

const WEEKDAYS = [[1, "一"], [2, "二"], [3, "三"], [4, "四"], [5, "五"], [6, "六"], [0, "日"]];

function openRuleEditor(raw, onSaved) {
  const draft = normalizeAiRule(raw || {});
  const mask = el("div", { class: "drawer-mask ai-rule-mask" });
  const panel = el("div", { class: "ai-rule-editor", role: "dialog", "aria-label": "AI 自动任务编辑器" });
  const name = el("input", { type: "text", value: draft.name, maxlength: "80", placeholder: "自动任务名称" });
  const instruction = el("textarea", { rows: "7", maxlength: "6000", placeholder: "例如：每天检查未完成任务，把最重要的 3 个安排到明天，并在收件箱写一条摘要。" }, draft.instruction);
  const type = el("select", {},
    el("option", { value: "daily" }, "每天"),
    el("option", { value: "weekdays" }, "指定星期"),
    el("option", { value: "weekly" }, "每周一次"),
    el("option", { value: "once" }, "仅一次"),
  );
  type.value = draft.schedule.type;
  const time = el("input", { type: "time", value: draft.schedule.time || "09:00" });
  const date = el("input", { type: "date", value: draft.schedule.date || "" });
  const weekday = el("select", {});
  for (const [v, n] of WEEKDAYS) weekday.append(el("option", { value: String(v) }, `星期${n}`));
  weekday.value = String(draft.schedule.weekday ?? 1);
  const checks = new Map();
  const weekdays = el("div", { class: "ai-weekdays" });
  for (const [v, n] of WEEKDAYS) {
    const ck = el("input", { type: "checkbox", checked: draft.schedule.weekdays.includes(v) ? true : null });
    checks.set(v, ck);
    weekdays.append(el("label", {}, ck, el("span", {}, n)));
  }
  const scheduleExtra = el("div", { class: "ai-schedule-extra" });

  function paintSchedule() {
    scheduleExtra.replaceChildren();
    if (type.value === "once") scheduleExtra.append(el("label", { class: "ai-field" }, el("span", {}, "日期"), date));
    else if (type.value === "weekly") scheduleExtra.append(el("label", { class: "ai-field" }, el("span", {}, "星期"), weekday));
    else if (type.value === "weekdays") scheduleExtra.append(el("div", { class: "ai-field" }, el("span", {}, "星期"), weekdays));
  }
  type.addEventListener("change", paintSchedule);
  paintSchedule();

  function close() {
    closeLayer(panel, mask, () => document.removeEventListener("keydown", onKey, true));
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  mask.addEventListener("click", close);
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("keydown", onKey, true);

  panel.append(
    el("div", { class: "ai-rule-editor-head" },
      el("div", {}, el("h3", {}, raw?.id ? "编辑 AI 自动任务" : "新建 AI 自动任务"), el("p", { class: "desc" }, "到点后 AI 只会执行时间管理白名单操作，不具备本地文件权限。")),
      el("button", { class: "btn ghost sm", onclick: close }, "关闭"),
    ),
    el("div", { class: "ai-rule-editor-body" },
      el("label", { class: "ai-field" }, el("span", {}, "名称"), name),
      el("label", { class: "ai-field" }, el("span", {}, "执行说明"), instruction),
      el("div", { class: "ai-editor-schedule" },
        el("label", { class: "ai-field" }, el("span", {}, "频率"), type),
        el("label", { class: "ai-field" }, el("span", {}, "时间"), time),
        scheduleExtra,
      ),
      el("div", { class: "ai-security-note compact" },
        el("b", {}, "不会操作本地文件"),
        el("span", {}, "允许：创建/更新任务、创建时间块、添加收件箱。禁止：读写/删除文件、执行命令、打开任意本地路径。"),
      ),
    ),
    el("div", { class: "ai-rule-editor-foot" },
      el("button", { class: "btn ghost", onclick: close }, "取消"),
      el("button", { class: "btn pri", onclick: () => {
        if (!name.value.trim()) return toast("请输入自动任务名称");
        if (!instruction.value.trim()) return toast("请输入执行说明");
        if (!time.value) return toast("请选择执行时间");
        const rule = saveAiAutomationRule({
          ...draft,
          name: name.value.trim(),
          instruction: instruction.value.trim(),
          schedule: {
            type: type.value,
            time: time.value,
            date: date.value,
            weekday: Number(weekday.value),
            weekdays: [...checks].filter(([, ck]) => ck.checked).map(([v]) => v),
          },
        });
        close();
        onSaved?.(rule);
        toast("AI 自动任务已保存");
      } }, "保存自动任务"),
    ),
  );
  document.body.append(mask, panel);
  setTimeout(() => name.focus(), 0);
}

export function createAiAutomationCard({ rerender = () => {} } = {}) {
  const card = el("section", { class: "card set-card ai-automation-card" },
    el("div", { class: "ai-automation-head" },
      el("div", {}, el("h3", {}, "AI 自动任务"), el("p", { class: "desc" }, "可以创建多个定时 AI 任务。也可以直接用一句话让 AI 帮你设置执行时间和规则。")),
      el("button", { class: "btn ghost sm", onclick: () => openRuleEditor(null, rerender) }, "手动添加"),
    ),
  );

  const planner = el("textarea", {
    class: "ai-plan-input",
    rows: "3",
    placeholder: "例如：每晚 22:30 检查今天没完成的任务，把最重要的 3 个安排到明天；工作日早上 8 点提醒今天最重要的事情。",
  });
  const planBtn = el("button", { class: "btn pri sm" }, "AI 生成自动任务");
  const planState = el("span", { class: "desc ai-plan-state" }, "AI 会把自然语言解析成时间 + 执行说明，生成后仍可编辑。 ");
  planBtn.addEventListener("click", async () => {
    const text = planner.value.trim();
    if (!text) return toast("先描述什么时候执行什么自动任务");
    planBtn.disabled = true;
    planBtn.textContent = "AI 解析中…";
    planState.textContent = "正在让 AI 生成定时规则…";
    try {
      const draft = await aiPlanAutomation(text);
      planState.textContent = `已解析：${aiScheduleLabel(draft)}`;
      openRuleEditor(draft, () => { planner.value = ""; rerender(); });
    } catch (e) {
      planState.textContent = `解析失败：${e.message || e}`;
      toast(`AI 解析失败：${e.message || e}`);
    } finally {
      planBtn.disabled = false;
      planBtn.textContent = "AI 生成自动任务";
    }
  });
  card.append(
    el("div", { class: "ai-planner-box" }, planner, el("div", { class: "ai-planner-actions" }, planBtn, planState)),
  );

  const list = el("div", { class: "ai-rule-list" });
  const rules = getAiAutomationRules();
  if (!rules.length) {
    list.append(el("div", { class: "ai-rule-empty" }, "还没有 AI 自动任务。可以让 AI 生成，也可以手动添加。"));
  }
  for (const rule of rules) {
    const toggle = el("button", {
      class: `switch ai-rule-switch${rule.enabled ? " on" : ""}`,
      role: "switch",
      "aria-checked": String(rule.enabled),
      title: rule.enabled ? "停用" : "启用",
      onclick: () => { setAiAutomationEnabled(rule.id, !rule.enabled); rerender(); },
    });
    const statusText = rule.lastError ? `上次失败：${rule.lastError}` : rule.lastRunAt ? `上次：${new Date(rule.lastRunAt).toLocaleString("zh-CN")} · ${rule.lastResult || "已执行"}` : "尚未执行";
    list.append(el("div", { class: `ai-rule-row${rule.enabled ? "" : " disabled"}` },
      el("div", { class: "ai-rule-main" },
        el("div", { class: "ai-rule-title-line" }, el("b", {}, rule.name), el("span", { class: "ai-rule-time" }, aiScheduleLabel(rule))),
        el("p", {}, rule.instruction),
        el("small", { class: rule.lastError ? "error" : "" }, statusText),
      ),
      el("div", { class: "ai-rule-actions" },
        toggle,
        el("button", { class: "btn ghost sm", onclick: () => openRuleEditor(rule, rerender) }, "编辑"),
        el("button", { class: "btn ghost sm", onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = "执行中…";
          try {
            const result = await runAiAutomationRule(rule.id, { force: true });
            toast(`AI 自动任务已执行：${result.summary || `${result.applied || 0} 项操作`}`);
          } catch (err) {
            toast(`执行失败：${err.message || err}`);
          } finally {
            rerender();
          }
        } }, "立即执行"),
        el("button", { class: "btn ghost sm", onclick: () => {
          if (!confirm(`删除 AI 自动任务「${rule.name}」？`)) return;
          deleteAiAutomationRule(rule.id);
          rerender();
          toast("AI 自动任务已删除");
        } }, "删除"),
      ),
    ));
  }
  card.append(list);
  return card;
}
