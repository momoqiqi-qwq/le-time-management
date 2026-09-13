// 番茄专注插件 —— 演示 registerView / storage / notify / events / tasks
(function () {
  const MODES = [
    { id: "focus", label: "专注 25", min: 25 },
    { id: "break", label: "短休 5", min: 5 },
    { id: "long", label: "长休 15", min: 15 },
  ];
  const R = 86, CIRC = 2 * Math.PI * R;

  let mode = MODES[0], left = 25 * 60, timer = null, currentTaskId = "", customMin = 25;
  let box, timeText, ring, taskSel, dotsBox;

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function paint() {
    timeText.textContent = fmt(left);
    const totalMin = mode.id === "custom" ? customMin : mode.min;
    const done = 1 - left / Math.max(1, totalMin * 60);
    ring.style.strokeDashoffset = String(CIRC * (1 - done));
  }

  function stop() { clearInterval(timer); timer = null; }

  function tick() {
    left -= 1;
    if (left <= 0) {
      stop();
      left = 0; paint();
      finish();
      return;
    }
    paint();
  }

  async function finish() {
    const isFocus = mode.id === "focus";
    const n = ((await tide.storage.get("doneCount", 0)) || 0) + (isFocus ? 1 : 0);
    const sessionMin = mode.id === "custom" ? customMin : mode.min;
    const mins = ((await tide.storage.get("focusMin", 0)) || 0) + (isFocus ? sessionMin : 0);
    await tide.storage.set("doneCount", n);
    await tide.storage.set("focusMin", mins);
    tide.notify(isFocus ? `完成 1 个番茄！今日累计 ${n} 个 / ${mins} 分钟` : "休息结束，回来继续吧 🍃");
    tide.events.emit("pomodoro:finished", { mode: mode.id, taskId: currentTaskId || null });
    renderDots();
    if (isFocus && currentTaskId) {
      const t = tide.tasks.list().find((x) => x.id === currentTaskId);
      if (t) tide.notify(`下一个番茄继续：「${t.title}」`);
    }
  }

  function renderDots() {
    tide.storage.get("doneCount", 0).then((n) => {
      dotsBox.replaceChildren();
      for (let i = 0; i < Math.min(8, n); i++) {
        const d = document.createElement("span");
        d.style.cssText = "width:11px;height:11px;border-radius:50%;display:inline-block;background:#2EC4B6;";
        dotsBox.append(d);
      }
      const lab = document.createElement("span");
      lab.style.cssText = "font-size:11px;color:var(--ink-2,#7E8B94);margin-left:8px";
      lab.textContent = `累计 ${n} 个番茄 · ${n * 25} 分钟`;
      dotsBox.append(lab);
    });
  }

  function render(el2) {
    box = el2;
    el2.innerHTML = "";

    const card = document.createElement("div");
    card.style.cssText = "max-width:520px;margin:30px auto;text-align:center;background:var(--panel,#fff);color:var(--ink,#22303A);border:1px solid var(--line,#E4DFD6);border-radius:18px;padding:34px 30px;box-shadow:var(--shadow,0 2px 10px rgba(34,48,58,.07))";

    const title = document.createElement("div");
    title.style.cssText = "font-size:11px;letter-spacing:.3em;color:var(--ink-2,#7E8B94);margin-bottom:14px";
    title.textContent = "番 茄 专 注 · 内 置 插 件";

    // 模式切换
    const modes = document.createElement("div");
    modes.style.cssText = "display:flex;justify-content:center;gap:8px;margin-bottom:22px";
    [...MODES, { id: "custom", label: "自定义", min: customMin }].forEach((m) => {
      const b = document.createElement("button");
      b.textContent = m.label;
      b.dataset.m = m.id;
      b.style.cssText = "font-size:12px;border-radius:16px;padding:7px 16px;border:1px solid var(--line,#E4DFD6);color:var(--ink-2,#7E8B94);background:var(--panel,#fff);cursor:pointer";
      b.addEventListener("click", () => {
        stop(); mode = m; left = (m.id === "custom" ? customMin : m.min) * 60;
        modes.querySelectorAll("button").forEach((x) => {
          const on = x.dataset.m === m.id;
          x.style.background = on ? "var(--deep,#0F4C5C)" : "var(--panel,#fff)";
          x.style.color = on ? "#fff" : "#7E8B94";
          x.style.borderColor = on ? "var(--deep,#0F4C5C)" : "var(--line,#E4DFD6)";
        });
        paint();
      });
      modes.append(b);
    });

    const customRow = document.createElement("div");
    customRow.style.cssText = "display:flex;justify-content:center;align-items:center;gap:8px;margin:-10px 0 18px;flex-wrap:wrap";
    const customInput = document.createElement("input");
    customInput.type = "number"; customInput.min = "1"; customInput.max = "240"; customInput.value = String(customMin);
    customInput.style.cssText = "width:82px;height:34px;border:1px solid var(--line,#E4DFD6);border-radius:9px;padding:0 9px;background:var(--paper,#fff);color:var(--ink,#22303A)";
    const customBtn = mkBtn("设置倒计时", "var(--panel,#fff)", "var(--ink-2,#7E8B94)", true); customBtn.style.height="34px"; customBtn.style.minWidth="96px";
    customBtn.addEventListener("click", async () => { const v=Math.max(1,Math.min(240,Number(customInput.value)||25)); customMin=v; await tide.storage.set("customMin",v); stop(); mode={id:"custom",label:"自定义",min:v}; left=v*60; paint(); });
    customRow.append("自定义分钟", customInput, customBtn);

    // 环
    const ringWrap = document.createElement("div");
    ringWrap.style.cssText = "position:relative;width:220px;height:220px;margin:0 auto 18px";
    ringWrap.innerHTML = `
      <svg width="220" height="220" viewBox="0 0 220 220" style="transform:rotate(-90deg)">
        <circle cx="110" cy="110" r="${R}" fill="none" stroke="var(--line-soft,#EFEAE1)" stroke-width="9"></circle>
        <circle class="ring" cx="110" cy="110" r="${R}" fill="none" stroke="#2EC4B6" stroke-width="9"
          stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"></circle>
      </svg>`;
    ring = ringWrap.querySelector(".ring");
    timeText = document.createElement("div");
    timeText.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:300;font-variant-numeric:tabular-nums";
    timeText.textContent = fmt(left);
    ringWrap.append(timeText);

    // 任务选择
    taskSel = document.createElement("select");
    taskSel.style.cssText = "width:100%;max-width:340px;height:36px;border:1px solid var(--line,#E4DFD6);border-radius:9px;padding:0 10px;background:var(--paper,#fff);color:var(--ink,#22303A);margin-bottom:18px";
    fillTasks();
    const selLab = document.createElement("div");
    selLab.style.cssText = "font-size:11px;color:var(--ink-2,#7E8B94);margin-bottom:6px";
    selLab.textContent = "专注哪个任务（可选）";

    const newTaskRow=document.createElement("div"); newTaskRow.style.cssText="display:flex;gap:8px;max-width:340px;margin:-8px auto 18px";
    const newTaskInput=document.createElement("input"); newTaskInput.placeholder="直接新建本次专注任务"; newTaskInput.style.cssText="flex:1;min-width:0;height:36px;border:1px solid var(--line,#E4DFD6);border-radius:9px;padding:0 10px;background:var(--paper,#fff);color:var(--ink,#22303A)";
    const addTaskBtn=mkBtn("+ 新建任务","var(--panel,#fff)","var(--deep,#0F4C5C)",true); addTaskBtn.style.cssText += ";min-width:92px;height:36px";
    addTaskBtn.addEventListener("click",()=>{ const title=newTaskInput.value.trim(); if(!title) return tide.notify("请先输入任务名称"); const t=tide.tasks.create({title,quad:2,estMin:mode.id==="custom"?customMin:mode.min,tags:["番茄专注"]}); newTaskInput.value=""; fillTasks(t.id); tide.notify(`已新建任务「${title}」`); });
    newTaskInput.addEventListener("keydown",e=>{if(e.key==="Enter") addTaskBtn.click();}); newTaskRow.append(newTaskInput,addTaskBtn);

    // 控制
    const ctrl = document.createElement("div");
    ctrl.style.cssText = "display:flex;justify-content:center;gap:10px";
    const startBtn = mkBtn("▶ 开始", "var(--deep,#0F4C5C)", "#fff");
    startBtn.addEventListener("click", () => {
      if (timer) { stop(); startBtn.textContent = "▶ 继续"; }
      else { timer = setInterval(tick, 1000); startBtn.textContent = "⏸ 暂停"; }
    });
    const resetBtn = mkBtn("↺ 重置", "var(--panel,#fff)", "var(--ink-2,#7E8B94)", true);
    resetBtn.addEventListener("click", () => { stop(); left = mode.min * 60; paint(); startBtn.textContent = "▶ 开始"; });
    ctrl.append(startBtn, resetBtn);

    dotsBox = document.createElement("div");
    dotsBox.style.cssText = "display:flex;justify-content:center;align-items:center;gap:6px;margin-top:22px";
    renderDots();

    card.append(title, modes, customRow, ringWrap, selLab, taskSel, newTaskRow, ctrl, dotsBox);
    el2.append(card);
    paint();
  }

  function fillTasks(selectId = currentTaskId) {
    taskSel.innerHTML = "";
    taskSel.append(Object.assign(document.createElement("option"), { value: "", textContent: "（不关联任务）" }));
    for (const t of tide.tasks.list().filter((x) => !x.done)) {
      const o = document.createElement("option");
      o.value = t.id; o.textContent = t.title;
      taskSel.append(o);
    }
    if (selectId && [...taskSel.options].some(o => o.value === selectId)) taskSel.value = selectId;
    currentTaskId = taskSel.value;
    taskSel.onchange = () => { currentTaskId = taskSel.value; };
  }

  function mkBtn(text, bg, fg, ghost) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `min-width:110px;height:40px;border-radius:20px;font-size:13.5px;font-weight:600;cursor:pointer;background:${bg};color:${fg};border:${ghost ? "1px solid var(--line,#E4DFD6)" : "none"}`;
    return b;
  }

  tide.storage.get("customMin",25).then(v=>{ customMin=Math.max(1,Math.min(240,Number(v)||25)); });

  tide.ui.registerView({ id: "pomodoro", title: "番茄专注", icon: 'hourglass-half', render });
  tide.events.on("tasks:changed", () => { if (taskSel) fillTasks(); });
})();
