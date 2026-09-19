// 四象限视图 —— 概念稿 03「权衡」
import * as S from "../store.js";
import { el, QUADS, popmenu, toast } from "../ui.js";
import { taskActions } from "../pluginHost.js";
import { pluginDisplayName, pluginDisplayIcon } from "../pluginAppearance.js";
import { openTaskDrawer } from "./drawer.js";
import { reducedMotion } from "../motion.js";

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
    if (document.body.dataset.dragReorder === "1") return; // 长按拖拽会话中不弹菜单（触屏长按进入拖拽时浏览器会补发 contextmenu）
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

/* ── v0.52.0 四象限卡片拖拽排序 ──
 * 桌面：按住卡片移动 ≥6px 即进入拖拽；触屏：长按 240ms 进入（期间移动 >8px 视为滚动意图）。
 * 拖动中幽灵卡（drag-ghost）跟随指针，其余卡片用 WAAPI FLIP 平滑让位；松手把顺序写回
 * store（moveTaskRelative 懒回填 order），新卡从幽灵落点平滑接位。
 * 手势会话期间置 document.body.dataset.swipeSuspended = "1"，shell 的滑动返回让路
 * （touchend 检查），清除延迟 80ms 覆盖到 touchend 之后（pointerup 先于 touchend 发出）。
 */
function attachListDrag(list) {
  let pd = null; // 当前按下会话
  const clearLong = (st) => { if (st.longTimer) { clearTimeout(st.longTimer); st.longTimer = null; } };
  const visibleCards = () => [...list.querySelectorAll(".tkc:not(.dragging)")];

  // document 捕获阶段兜底：setPointerCapture 失败（或环境不支持）时，指针在列表区域外
  // 松手的 pointerup/pointercancel 不会冒泡回 list，会话会挂起（幽灵卡不消失、顺序不落库）。
  // endDrag / cancel 自身幂等，与 list 级监听双触发无害。
  const detachDoc = (st) => {
    if (st.docUp) document.removeEventListener("pointerup", st.docUp, true);
    if (st.docCancel) document.removeEventListener("pointercancel", st.docCancel, true);
    st.docUp = st.docCancel = null;
  };

  const moveGhost = (st, x, y) => {
    st.ghost?.style.setProperty("transform", `translate(${x - st.gx}px, ${y - st.gy}px) scale(1.03)`);
  };

  const endSession = (st) => {
    clearLong(st);
    detachDoc(st);
    delete document.body.dataset.dragReorder;
    // swipeSuspended 要活过 touchend（swipe 返回在 touchend 判定，而 pointerup 先发），延迟清
    setTimeout(() => { if (!pd?.active) delete document.body.dataset.swipeSuspended; }, 80);
    st.ghost?.remove();
    st.ghost = null;
    st.card?.classList.remove("dragging");
    list.classList.remove("drag-live");
    if (st.pointerId != null && st.card) { try { st.card.releasePointerCapture(st.pointerId); } catch { /* 已释放 */ } }
    if (pd === st) pd = null;
  };

  const cancel = () => {
    const st = pd;
    if (!st) return;
    if (st.active) for (const c of st.originOrder || []) list.append(c); // DOM 已被重排 → 按启动时顺序复原
    st.active = false;
    endSession(st);
  };

  const computeSlot = (st, y) => {
    // 插入槽判定用几何推演（offsetHeight + rowGap 递推），不读 getBoundingClientRect：
    // FLIP 让位动画进行中 rect 含残余 transform，会把槽位判定污染到动画中间态（实测探针抓到）
    const all = [...list.children].filter((c) => c.classList.contains("tkc"));
    let acc = list.getBoundingClientRect().top;
    const mids = all.map((c) => {
      const m = acc + (st.h[c.dataset.id] || c.offsetHeight) / 2;
      acc += (st.h[c.dataset.id] || c.offsetHeight) + st.gap;
      return m;
    });
    const vis = all.filter((c) => c !== st.card);
    let k = vis.length;
    for (let i = 0; i < all.length; i++) {
      if (all[i] === st.card) continue;
      if (y < mids[i]) { k = vis.indexOf(all[i]); break; }
    }
    // 完成的卡片永远沉底：插入槽夹在「与拖拽卡同完成态」的连续区间内
    const dragDone = st.card.classList.contains("done");
    const dones = vis.map((c) => c.classList.contains("done"));
    const first = dones.indexOf(dragDone);
    if (first >= 0) {
      let last = first;
      while (last + 1 < dones.length && dones[last + 1] === dragDone) last++;
      k = Math.min(Math.max(k, first), last + 1);
    }
    return k;
  };

  const reorderDOM = (st, k) => {
    const cards = visibleCards();
    const before = cards.map((c) => c.getBoundingClientRect());
    list.insertBefore(st.card, cards[k] ?? null);
    if (reducedMotion()) return;
    cards.forEach((c, i) => {
      const dy = before[i].top - c.getBoundingClientRect().top;
      if (dy) c.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
        { duration: 180, easing: "cubic-bezier(.22,.8,.22,1)" });
    });
  };

  const beginDrag = (st, x, y) => {
    if (!list.contains(st.card) || st.card.classList.contains("dragging")) { if (pd === st) pd = null; return; }
    st.active = true;
    clearLong(st);
    document.body.dataset.swipeSuspended = "1"; // 滑动返回让路（shell touchend 检查）
    document.body.dataset.dragReorder = "1";    // 卡片 contextmenu 让路
    navigator.vibrate?.(10);                    // 触屏进入拖拽的触觉反馈（不支持则静默）
    const rect = st.card.getBoundingClientRect();
    st.gx = x - rect.left; st.gy = y - rect.top;
    if (!reducedMotion()) {
      const ghost = st.card.cloneNode(true);
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${rect.width}px`;
      document.body.append(ghost);
      st.ghost = ghost;
      moveGhost(st, x, y);
    }
    st.originOrder = [...list.querySelectorAll(".tkc")];
    // 槽位推演用的高度表：offsetHeight 不含 transform，拖拽中卡片高度不变
    st.gap = parseFloat(getComputedStyle(list).rowGap) || 0;
    st.h = {};
    for (const c of list.querySelectorAll(".tkc")) st.h[c.dataset.id] = c.offsetHeight;
    st.card.classList.add("dragging");
    list.classList.add("drag-live");
    try { st.card.setPointerCapture(st.pointerId); } catch { /* 部分环境拿不到 capture，下面有 document 兜底 */ }
    st.docUp = (e) => {
      if (e.pointerId !== st.pointerId) return;
      detachDoc(st);
      if (st.active) endDrag(st); else endSession(st);
    };
    st.docCancel = (e) => {
      if (e.pointerId !== st.pointerId) return;
      detachDoc(st);
      cancel();
    };
    document.addEventListener("pointerup", st.docUp, true);
    document.addEventListener("pointercancel", st.docCancel, true);
    st.slot = computeSlot(st, y);
    reorderDOM(st, st.slot);
  };

  const endDrag = (st) => {
    if (!st.active) return;
    st.active = false;
    const ghostRect = st.ghost?.getBoundingClientRect() ?? null;
    const dragId = st.id;
    // 当前 DOM 序就是用户拖出的序 → 翻译成「相邻卡」写回 store
    const kids = [...list.children];
    const at = kids.indexOf(st.card);
    const next = kids[at + 1], prev = kids[at - 1];
    st.card.classList.remove("dragging");
    list.classList.remove("drag-live");
    if (next && next !== st.card) S.moveTaskRelative(dragId, next.dataset.id, true);
    else if (prev && prev !== st.card) S.moveTaskRelative(dragId, prev.dataset.id, false);
    // moveTaskRelative → changed() → 订阅同步 renderList 重建；新卡从幽灵落点平滑接位
    const newCard = list.querySelector(`.tkc[data-id="${dragId}"]`);
    if (newCard && ghostRect && !reducedMotion()) {
      const r1 = newCard.getBoundingClientRect();
      newCard.animate([
        { transform: `translate(${ghostRect.left - r1.left}px, ${ghostRect.top - r1.top}px) scale(1.03)` },
        { transform: "none" },
      ], { duration: 200, easing: "cubic-bezier(.22,.8,.22,1)" });
    }
    endSession(st);
  };

  list.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const card = e.target.closest?.(".tkc");
    if (!card || !list.contains(card)) return;
    pd = { id: card.dataset.id, card, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false, ghost: null, slot: -1, originOrder: null, longTimer: null };
    if (e.pointerType !== "mouse") {
      // 触屏：长按 240ms 进入拖拽；期间移动 >8px 视为滚动意图，取消长按
      pd.longTimer = setTimeout(() => { if (pd && pd.card === card && !pd.active) beginDrag(pd, pd.x, pd.y); }, 240);
    }
  });
  list.addEventListener("pointermove", (e) => {
    const st = pd;
    if (!st || e.pointerId !== st.pointerId) return;
    if (st.active) {
      if (st.ghost) moveGhost(st, e.clientX, e.clientY);
      const k = computeSlot(st, e.clientY);
      if (k !== st.slot) { st.slot = k; reorderDOM(st, k); }
      return;
    }
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (st.longTimer) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLong(st);
      return;
    }
    if (e.pointerType === "mouse" && Math.hypot(dx, dy) >= 6) beginDrag(st, e.clientX, e.clientY);
  });
  list.addEventListener("pointerup", (e) => {
    const st = pd;
    if (!st || e.pointerId !== st.pointerId) return;
    if (st.active) endDrag(st); else endSession(st);
  });
  list.addEventListener("pointercancel", (e) => {
    const st = pd;
    if (!st || e.pointerId !== st.pointerId) return;
    cancel();
  });
  // 长按进入拖拽后浏览器可能仍尝试滚动（touch-action pan-y）→ 会话活跃时阻断
  list.addEventListener("touchmove", (e) => { if (pd?.active) e.preventDefault(); }, { passive: false });

  return { cancel };
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

  const dragCtl = attachListDrag(list);

  const renderList = () => {
    dragCtl.cancel(); // 拖拽会话中外部刷新（插件/订阅）→ 先复位再重建，防孤儿引用
    const tasks = S.tasksOfQuad(def.q).filter(matches);
    list.replaceChildren(...tasks.map(taskCard));
    cell.querySelector(".cnt").textContent = `${tasks.filter((t) => !t.done).length} 项`;
  };
  renderList();
  cell._refresh = renderList;

  // Alt+↑/↓ 键盘重排（与拖拽同一条 store 路径；只在同完成态组内移动，到边界忽略）
  list.addEventListener("keydown", (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const card = e.target.closest?.(".tkc");
    if (!card) return;
    const id = card.dataset.id;
    const seq = S.tasksOfQuad(def.q);
    const i = seq.findIndex((t) => t.id === id);
    if (i < 0) return;
    const dir = e.key === "ArrowUp" ? -1 : 1;
    let j = i + dir;
    while (j >= 0 && j < seq.length && seq[j].done !== seq[i].done) j += dir;
    if (j < 0 || j >= seq.length) return;
    S.moveTaskRelative(id, seq[j].id, dir < 0);
    // 订阅同步刷新后焦点回到被移动的卡片，支持连续按键
    list.querySelector(`.tkc[data-id="${id}"]`)?.focus();
    e.preventDefault();
  });

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
    const done = all.length - open.length;
    clearDoneBtn.disabled = done === 0;
    clearDoneBtn.textContent = done ? `清理已完成 ${done} 项` : "清理已完成";
  };
  const chips = el("div", {});

  // 一键清理已完成：与单条删除同一套「删了给撤销」语义，整批一次撤销（连同各自的排程）。
  const clearDoneBtn = el("button", {
    class: "chip clear-done",
    title: "删除全部已完成任务（连同它们已排入的时间块），删除后可在提示条撤销",
    onclick: () => {
      const done = S.getState().tasks.filter((t) => t.done);
      if (!done.length) return;
      const ids = new Set(done.map((t) => t.id));
      const blockCount = S.getState().blocks.filter((b) => ids.has(b.taskId)).length;
      const undo = S.deleteDoneTasksUndoable();
      toast(`已删除 ${done.length} 个已完成任务${blockCount ? `（含 ${blockCount} 个时间块）` : ""}`, { actionLabel: "撤销", action: undo });
    },
  }, "清理已完成");

  const wrap = el("div", { class: "quad-wrap" },
    el("div", { class: "quad-head" },
      el("span", { class: "motto" }, "把任务放进象限，就是做决定 · 象限 I 的面积最大，因为它值得你最多时间"),
      el("span", { class: "sp" }),
      chips,
      clearDoneBtn,
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
