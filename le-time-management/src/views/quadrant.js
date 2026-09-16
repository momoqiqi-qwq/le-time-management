// 四象限视图 —— 概念稿 03「权衡」
import * as S from "../store.js";
import { el, QUADS, popmenu, toast } from "../ui.js";
import { taskActions } from "../pluginHost.js";
import { pluginDisplayName, pluginDisplayIcon } from "../pluginAppearance.js";
import { openTaskDrawer } from "./drawer.js";

// 展开状态跨重渲染保持
const expandedCards = new Set();

function taskCard(t) {
  const scheduled = S.getState().blocks.find((b) => b.taskId === t.id);
  const hasNote = !!(t.note && t.note.trim());
  // 标题现在一律换行完整显示（卡片随内容变高），不再截断，
  // 所以「可展开」只服务于备注/原始消息，不再由标题长度触发。
  const expandable = hasNote;
  const card = el("button", { class: `tkc${t.done ? " done" : ""}${expandedCards.has(t.id) ? " expanded" : ""}`, "data-id": t.id },
    el("span", {
      class: "cb",
      onclick: (e) => { e.stopPropagation(); S.toggleTask(t.id); },
    }, t.done ? "✓" : ""),
    el("span", { class: "tt" },
      // 标题行：标题 + 展开箭头同处一行，标题换行时卡片自动变高，不再截断
      el("span", { class: "tt-top" },
        // 插件联动提醒：任务由插件创建时，标题前显示来源插件图标（悬停看插件名）
        t.sourcePlugin ? el("span", { class: "src-ic", title: `来自插件「${pluginDisplayName(t.sourcePlugin)}」的提醒` },
          pluginDisplayIcon(t.sourcePlugin, pluginDisplayName(t.sourcePlugin))) : null,
        (() => {
          const titleSpan = el("span", { class: "t", title: t.title }, t.title);
          if (expandable) {
            // 点标题就地展开/收起备注，不打开抽屉
            titleSpan.addEventListener("click", (e) => {
              e.stopPropagation();
              if (expandedCards.has(t.id)) expandedCards.delete(t.id);
              else expandedCards.add(t.id);
              card.classList.toggle("expanded", expandedCards.has(t.id));
            });
          }
          return titleSpan;
        })(),
        expandable ? el("span", { class: "exp" }, "⌄") : null,
      ),
      hasNote ? el("span", { class: "tn" }, t.note) : null,
      el("span", { class: "m" },
        t.due ? `截止 ${t.due.slice(5).replace("-", "/")} ${t.dueTime || "23:59"}` : "无截止",
        t.project ? ` · ${t.project}` : "",
        t.attachments?.length ? " · 📷" : ""),
    ),
    scheduled ? el("span", { class: "sch" }, `已排 ${scheduled.start}`) : null,
    el("span", { class: "est" }, S.durLabel(t.estMin)),
  );
  card.addEventListener("click", () => openTaskDrawer(t.id));
  card.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    popmenu(e.clientX, e.clientY, [
      { label: "打开详情", icon: "▸", run: () => openTaskDrawer(t.id) },
      { label: t.done ? "标记为未完成" : "标记完成", icon: "✓", run: () => S.toggleTask(t.id) },
      "-",
      { label: "删除任务", icon: "✕", warn: true, run: () => {
        const undo = S.deleteTaskUndoable(t.id);
        toast(`已删除「${t.title}」`, { actionLabel: "撤销", action: undo });
      } },
    ]);
  });
  return card;
}

function quadrantCell(def, matches) {
  const list = el("div", { class: "tks" });
  const cell = el("div", { class: `q ${def.cls}` },
    el("span", { class: "rn" }, def.rn),
    el("div", { class: "qh" }, el("span", { class: "sq" }), el("b", {}, def.title),
      el("span", { class: "cnt" })),
    el("div", { class: "tip" }, def.tip),
    list,
  );

  const renderList = () => {
    const tasks = S.tasksOfQuad(def.q).filter(matches);
    list.replaceChildren(...tasks.map(taskCard));
    cell.querySelector(".cnt").textContent = `${tasks.filter((t) => !t.done).length} 项`;
  };
  renderList();
  cell._refresh = renderList;

  // 快速添加
  const addBtn = el("button", { class: "addq" }, "添加到这个象限");
  const form = el("div", { class: "addform", style: "display:none" },
    Object.assign(el("input", { placeholder: "要做什么？回车保存", type: "text" }), {}),
    (() => {
      const s = el("select", { class: "estsel", title: "预估时长" });
      for (const m of [15, 30, 45, 60, 90, 120]) s.append(el("option", { value: m }, S.durLabel(m)));
      s.value = "30"; return s;
    })(),
  );
  const input = form.querySelector("input");
  const estSel = form.querySelector("select");
  const submit = () => {
    const v = input.value.trim();
    if (v) S.addTask({ title: v, quad: def.q, estMin: Number(estSel.value) });
    input.value = ""; input.focus();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) submit();
    if (e.key === "Escape") { form.style.display = "none"; addBtn.style.display = ""; }
  });
  addBtn.addEventListener("click", () => { addBtn.style.display = "none"; form.style.display = "flex"; input.focus(); });
  form.addEventListener("focusout", () => setTimeout(() => {
    if (!form.contains(document.activeElement) && !input.value.trim()) { form.style.display = "none"; addBtn.style.display = ""; }
  }, 120));
  form.append(el("button", { class: "btn pri sm", onclick: submit }, "保存"), el("button", { class: "btn ghost sm", onclick: () => { input.value = ""; form.style.display = "none"; addBtn.style.display = ""; } }, "取消"));
  cell.append(addBtn, form);
  cell._refresh = () => { renderList(); };
  return cell;
}

export function renderQuadrant(container) {
  let filter = "all", query = "";
  const matches = (t) => (filter === "all" || (filter === "done" ? t.done : !t.done)) &&
    [t.title, t.note, t.project, ...(t.tags || [])].join(" ").toLowerCase().includes(query);
  const cells = QUADS.map((q) => quadrantCell(q, matches));
  const search = el("input", { class: "task-search", placeholder: "搜索任务 / 备注 / 项目", "aria-label": "搜索任务", oninput: (e) => { query = e.target.value.trim().toLowerCase(); cells.forEach(c => c._refresh()); } });
  const grid = el("div", { class: "quad-grid" }, cells);

  const refreshChips = () => {
    const all = S.getState().tasks;
    const open = all.filter((t) => !t.done);
    chips.innerHTML = "";
    for (const [id, label, count] of [["all", "全部", all.length], ["open", "待办", open.length], ["done", "已完成", all.length - open.length]]) {
      chips.append(el("button", { class: "chip", "aria-pressed": String(filter === id), onclick: () => { filter = id; cells.forEach(c => c._refresh()); refreshChips(); } }, `${label} ${count} 项`));
    }
  };
  const chips = el("div", {});

  const wrap = el("div", { class: "quad-wrap" },
    el("div", { class: "quad-head" },
      el("span", { class: "motto" }, "把任务放进象限，就是做决定 · 象限 I 的面积最大，因为它值得你最多时间"),
      el("span", { class: "sp" }),
      chips,
    ),
    search, grid,
  );
  container.append(wrap);

  refreshChips();
  const un = S.subscribe(() => {
    cells.forEach((c) => c._refresh && c._refresh());
    refreshChips();
  });
  container._unsub = un;
}
