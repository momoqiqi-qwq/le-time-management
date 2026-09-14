// 番茄专注插件 —— registerView / storage / notify / sound / events / tasks
(function () {
  const MODES = [
    { id: "focus", label: "专注 25", min: 25 },
    { id: "break", label: "短休 5", min: 5 },
    { id: "long", label: "长休 15", min: 15 },
  ];
  const R = 86, CIRC = 2 * Math.PI * R;

  // 提醒设置：专注 / 休息各自控制「通知」与「声音」。提示音走宿主的 tide.sound，
  // 与应用设置里的「任务提醒」共用同一份音效目录（内置音效 + 自定义音频）。
  const REMINDER_DEFAULT = {
    focusNotify: true, focusSound: true,
    breakNotify: true, breakSound: true,
    sound: "beep", volume: 0.75,
    customAudio: null, customAudioName: "",
  };
  // 自定义音频以 data URL 存进插件设置，会跟着应用数据一起备份，所以卡在 4 MB。
  const AUDIO_MAX_BYTES = 4 * 1024 * 1024;

  let mode = MODES[0], left = 25 * 60, timer = null, currentTaskId = "", customMin = 25;
  let box, timeText, ring, taskSel, dotsBox;

  let reminder = { ...REMINDER_DEFAULT };
  const reminderReady = (async () => {
    try {
      const saved = await tide.storage.get("reminder", null);
      if (saved && typeof saved === "object") reminder = normalizeReminder(saved);
    } catch (e) { console.warn("番茄专注：提醒设置读取失败", e); }
    return reminder;
  })();

  function normalizeReminder(raw) {
    const out = { ...REMINDER_DEFAULT, ...raw };
    for (const key of ["focusNotify", "focusSound", "breakNotify", "breakSound"]) out[key] = out[key] !== false;
    out.volume = Math.min(1, Math.max(0, Number(out.volume) || REMINDER_DEFAULT.volume));
    out.sound = typeof out.sound === "string" && out.sound ? out.sound : REMINDER_DEFAULT.sound;
    out.customAudio = typeof out.customAudio === "string" && out.customAudio ? out.customAudio : null;
    out.customAudioName = String(out.customAudioName || "");
    // 音频丢了就别停在「自定义」上，否则到点会一声不响。
    if (out.sound === "custom" && !out.customAudio) out.sound = REMINDER_DEFAULT.sound;
    return out;
  }

  function saveReminder() {
    return Promise.resolve(tide.storage.set("reminder", reminder)).catch((e) => console.warn("番茄专注：提醒设置保存失败", e));
  }

  /** preview = 试听：无视提醒开关，音量给一个听得见的下限。 */
  function playReminderSound(preview = false) {
    try {
      return Promise.resolve(tide.sound.play({
        sound: reminder.sound,
        volume: preview ? Math.max(reminder.volume, 0.3) : reminder.volume,
        customAudio: reminder.customAudio,
      })).catch(() => {});
    } catch (e) {
      console.warn("番茄专注：提示音播放失败", e);
      return Promise.resolve();
    }
  }

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
    await reminderReady;
    const isFocus = mode.id === "focus";
    const n = ((await tide.storage.get("doneCount", 0)) || 0) + (isFocus ? 1 : 0);
    const sessionMin = mode.id === "custom" ? customMin : mode.min;
    const mins = ((await tide.storage.get("focusMin", 0)) || 0) + (isFocus ? sessionMin : 0);
    await tide.storage.set("doneCount", n);
    await tide.storage.set("focusMin", mins);

    const notifyOn = isFocus ? reminder.focusNotify : reminder.breakNotify;
    const soundOn = isFocus ? reminder.focusSound : reminder.breakSound;
    if (notifyOn) tide.notify(isFocus ? `完成 1 个番茄！今日累计 ${n} 个 / ${mins} 分钟` : "休息结束，回来继续吧 🍃");
    if (soundOn) playReminderSound();

    tide.events.emit("pomodoro:finished", { mode: mode.id, taskId: currentTaskId || null });
    renderDots();
    if (isFocus && currentTaskId && notifyOn) {
      const t = tide.tasks.list().find((x) => x.id === currentTaskId);
      if (t) tide.notify(`下一个番茄继续：「${t.title}」`);
    }
  }

  function renderDots() {
    tide.storage.get("doneCount", 0).then((n) => {
      dotsBox.replaceChildren();
      for (let i = 0; i < Math.min(8, n); i++) {
        const d = document.createElement("span");
        d.style.cssText = "width:11px;height:11px;border-radius:50%;display:inline-block;background:var(--mint,#2EC4B6);";
        dotsBox.append(d);
      }
      const lab = document.createElement("span");
      lab.style.cssText = "font-size:11px;color:var(--ink-2,#7E8B94);margin-left:8px";
      lab.textContent = `累计 ${n} 个番茄 · ${n * 25} 分钟`;
      dotsBox.append(lab);
    });
  }

  function chip(text, onClick, primary = false) {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = `height:28px;padding:0 11px;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`
      + `background:${primary ? "var(--deep,#0F4C5C)" : "var(--panel,#fff)"};`
      + `color:${primary ? "var(--on-deep,#fff)" : "var(--ink-2,#7E8B94)"};`
      + `border:1px solid ${primary ? "var(--deep,#0F4C5C)" : "var(--line,#E4DFD6)"}`;
    b.addEventListener("click", onClick);
    return b;
  }

  /**
   * 提醒设置面板。返回 { node, sync }：sync 在 storage 读完后再对齐一次控件，
   * 因为 render() 是同步的、设置是异步读的。
   */
  function reminderPanel() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-top:20px;border-top:1px solid var(--line,#E4DFD6);padding-top:13px;text-align:left";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;background:transparent;border:0;padding:2px 0;cursor:pointer;color:var(--ink,#22303A);font:inherit;font-size:13px;font-weight:650";
    const toggleText = document.createElement("span");
    toggleText.textContent = "提醒设置";
    const summary = document.createElement("span");
    summary.style.cssText = "font-size:11px;font-weight:500;color:var(--ink-3,#8FA2A8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    toggle.append(toggleText, summary);

    const body = document.createElement("div");
    body.style.cssText = "margin-top:11px;display:grid;gap:9px";

    const controls = {};
    const presetLabels = { custom: "自定义音频" };
    const presetNotes = {};

    const row = (label, ...nodes) => {
      const line = document.createElement("div");
      line.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px";
      const name = document.createElement("span");
      name.style.cssText = "flex:0 0 auto;font-size:12.5px;color:var(--ink-2,#7E8B94)";
      name.textContent = label;
      const right = document.createElement("span");
      right.style.cssText = "flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap";
      right.append(...nodes);
      line.append(name, right);
      return line;
    };

    const check = (key, text) => {
      const label = document.createElement("label");
      label.style.cssText = "display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--ink,#22303A);cursor:pointer";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = reminder[key] !== false;
      input.style.cssText = "width:15px;height:15px;margin:0;accent-color:var(--deep,#0F4C5C);cursor:pointer";
      input.addEventListener("change", () => { reminder[key] = input.checked; saveReminder(); updateSummary(); });
      label.append(input, document.createTextNode(text));
      controls[key] = input;
      return label;
    };

    const soundSel = document.createElement("select");
    soundSel.style.cssText = "max-width:150px;height:30px;border:1px solid var(--line,#E4DFD6);border-radius:8px;padding:0 8px;background:var(--paper,#fff);color:var(--ink,#22303A);font-size:12px";
    const soundNote = document.createElement("div");
    soundNote.style.cssText = "font-size:11px;color:var(--ink-3,#8FA2A8);margin-top:-2px";
    // 宿主没回话时的最小兜底：至少保住原来那一项。
    const fillSounds = (presets) => {
      soundSel.replaceChildren();
      for (const p of presets) {
        const o = document.createElement("option");
        o.value = p.id; o.textContent = p.label;
        if (p.note) o.title = p.note;
        presetLabels[p.id] = p.label;
        if (p.note) presetNotes[p.id] = p.note;
        soundSel.append(o);
      }
      const custom = document.createElement("option");
      custom.value = "custom"; custom.textContent = "自定义音频";
      soundSel.append(custom);
      soundSel.value = reminder.sound;
      updateSummary();
      updateNote();
    };
    fillSounds([{ id: REMINDER_DEFAULT.sound, label: "清脆提示" }]);
    soundSel.addEventListener("change", () => {
      reminder.sound = soundSel.value;
      saveReminder();
      updateSummary();
      updateNote();
      if (reminder.sound !== "custom") playReminderSound(true);
    });
    try {
      Promise.resolve(tide.sound.presets()).then(fillSounds).catch(() => {});
    } catch (e) { console.warn("番茄专注：音效目录读取失败", e); }

    const vol = document.createElement("input");
    vol.type = "range"; vol.min = "0"; vol.max = "100"; vol.step = "1";
    vol.value = String(Math.round(reminder.volume * 100));
    vol.style.cssText = "width:128px;accent-color:var(--deep,#0F4C5C)";
    const volText = document.createElement("b");
    volText.style.cssText = "min-width:36px;text-align:right;font-size:12px;color:var(--ink,#22303A)";
    volText.textContent = `${vol.value}%`;
    vol.addEventListener("input", () => { volText.textContent = `${vol.value}%`; reminder.volume = Number(vol.value) / 100; saveReminder(); });
    vol.addEventListener("change", () => playReminderSound(true));

    const audioInput = document.createElement("input");
    audioInput.type = "file";
    audioInput.accept = "audio/*,.mp3,.wav,.m4a,.aac,.ogg";
    audioInput.style.display = "none";
    const audioName = document.createElement("span");
    audioName.style.cssText = "max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--ink-3,#8FA2A8)";
    const clearAudio = chip("清除", () => {
      reminder.customAudio = null;
      reminder.customAudioName = "";
      if (reminder.sound === "custom") reminder.sound = REMINDER_DEFAULT.sound;
      saveReminder();
      sync();
    });
    audioInput.addEventListener("change", () => {
      const file = audioInput.files && audioInput.files[0];
      audioInput.value = "";
      if (!file) return;
      if (file.size > AUDIO_MAX_BYTES) {
        tide.notify(`音频请控制在 ${AUDIO_MAX_BYTES / 1024 / 1024} MB 以内（当前 ${(file.size / 1048576).toFixed(1)} MB）`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        reminder.customAudio = String(reader.result || "");
        reminder.customAudioName = file.name;
        reminder.sound = "custom";
        saveReminder();
        sync();
        playReminderSound(true);
        tide.notify(`已导入自定义提示音：${file.name}`);
      };
      reader.onerror = () => tide.notify("音频读取失败，请换一个文件试试");
      reader.readAsDataURL(file);
    });

    body.append(
      row("专注结束", check("focusNotify", "通知"), check("focusSound", "声音")),
      row("休息结束", check("breakNotify", "通知"), check("breakSound", "声音")),
      row("提示音", soundSel, chip("试听", () => playReminderSound(true), true)),
      soundNote,
      row("音量", vol, volText),
      row("自定义音频", audioName, chip("导入", () => audioInput.click()), clearAudio),
      audioInput,
    );

    function updateSummary() {
      const on = (key) => reminder[key] !== false;
      const both = (a, b) => (on(a) || on(b) ? "开" : "关");
      const name = reminder.sound === "custom" ? (reminder.customAudioName || "自定义音频") : (presetLabels[reminder.sound] || reminder.sound);
      summary.textContent = `专注 ${both("focusNotify", "focusSound")} · 休息 ${both("breakNotify", "breakSound")} · ${name} ${Math.round(reminder.volume * 100)}%`;
    }

    function updateNote() {
      soundNote.textContent = reminder.sound !== "custom" ? (presetNotes[reminder.sound] || "")
        : (reminder.customAudio ? "使用你导入的音频文件" : "还没导入音频，到点会退回内置提示音");
    }

    /** 把当前 reminder 值灌回控件（storage 读完之后、以及导入 / 清除音频之后）。 */
    function sync() {
      for (const key of ["focusNotify", "focusSound", "breakNotify", "breakSound"]) if (controls[key]) controls[key].checked = reminder[key] !== false;
      soundSel.value = reminder.sound;
      vol.value = String(Math.round(reminder.volume * 100));
      volText.textContent = `${vol.value}%`;
      audioName.textContent = reminder.customAudio ? (reminder.customAudioName || "已导入音频") : "未导入";
      audioName.title = reminder.customAudio ? (reminder.customAudioName || "已导入音频") : "可选：导入一段本地音频作为到点提示音";
      clearAudio.style.display = reminder.customAudio ? "" : "none";
      updateSummary();
      updateNote();
    }

    toggle.addEventListener("click", () => {
      // 摘要两种状态都留着：收起时它就是「当前提醒配置」的一行速览。
      body.style.display = body.style.display === "none" ? "grid" : "none";
    });

    sync();
    wrap.append(toggle, body);
    return { node: wrap, sync };
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
          x.style.color = on ? "var(--on-deep,#fff)" : "var(--ink-2,#7E8B94)";
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
        <circle cx="110" cy="110" r="${R}" fill="none" style="stroke:var(--line-soft,#EFEAE1)" stroke-width="9"></circle>
        <circle class="ring" cx="110" cy="110" r="${R}" fill="none" style="stroke:var(--mint,#2EC4B6)" stroke-width="9"
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
    const startBtn = mkBtn("▶ 开始", "var(--deep,#0F4C5C)", "var(--on-deep,#fff)");
    startBtn.addEventListener("click", () => {
      if (timer) { stop(); startBtn.textContent = "▶ 继续"; }
      else { timer = setInterval(tick, 1000); startBtn.textContent = "⏸ 暂停"; }
    });
    const resetBtn = mkBtn("↺ 重置", "var(--panel,#fff)", "var(--ink-2,#7E8B94)", true);
    resetBtn.addEventListener("click", () => { stop(); left = (mode.id === "custom" ? customMin : mode.min) * 60; paint(); startBtn.textContent = "▶ 开始"; });
    ctrl.append(startBtn, resetBtn);

    dotsBox = document.createElement("div");
    dotsBox.style.cssText = "display:flex;justify-content:center;align-items:center;gap:6px;margin-top:22px";
    renderDots();

    const panel = reminderPanel();

    card.append(title, modes, customRow, ringWrap, selLab, taskSel, newTaskRow, ctrl, dotsBox, panel.node);
    el2.append(card);
    paint();
    // 同步的 render 先按默认值画，设置读完后再对齐一次。
    reminderReady.then(() => panel.sync());
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
