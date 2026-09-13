// 微信提醒推送 —— PushPlus 主通道，兼容旧 Server酱配置。
(function () {
  const PUSHPLUS_URL = "https://www.pushplus.plus/send";
  // pushplus 官方文档（经系统浏览器打开，不在应用内跳转）
  const PUSHPLUS_DOCS = [
    ["使用说明 / SDK", "https://www.pushplus.plus/doc/guide/sdk.html"],
    ["消息接口文档（参数与返回码）", "https://www.pushplus.plus/doc/guide/api.html"],
  ];
  const SCT = (key, title, desp) =>
    `https://sctapi.ftqq.com/${encodeURIComponent(key)}.send?title=${encodeURIComponent(title)}&desp=${encodeURIComponent(desp)}`;

  const state = {
    enabled: false, provider: "pushplus", token: "", topic: "", oldKey: "",
    blockEnabled: true, taskEnabled: true, lead: 5,
    timer: null, pushed: [], log: [], sid: null,
  };
  let ui = null;
  let prefsPromise = null;

  async function loadPrefs() {
    const [enabled, provider, token, topic, oldKey, blockEnabled, taskEnabled, lead, pushed, log] = await Promise.all([
      tide.storage.get("enabled", false), tide.storage.get("provider", ""), tide.storage.get("pushplusToken", ""),
      tide.storage.get("pushplusTopic", ""), tide.storage.get("key", ""), tide.storage.get("blockEnabled", true),
      tide.storage.get("taskEnabled", true), tide.storage.get("lead", 5), tide.storage.get("pushed", []), tide.storage.get("log", []),
    ]);
    state.enabled = !!enabled;
    state.oldKey = oldKey || "";
    state.provider = provider || (state.oldKey && !token ? "serverchan" : "pushplus");
    state.token = token || "";
    state.topic = topic || "";
    state.blockEnabled = blockEnabled !== false;
    state.taskEnabled = taskEnabled !== false;
    state.lead = Math.max(1, Number(lead) || 5);
    state.pushed = Array.isArray(pushed) ? pushed : [];
    state.log = Array.isArray(log) ? log : [];
  }
  const ensurePrefs = () => (prefsPromise ||= loadPrefs());

  const save = () => Promise.all([
    tide.storage.set("enabled", state.enabled), tide.storage.set("provider", state.provider),
    tide.storage.set("pushplusToken", state.token), tide.storage.set("pushplusTopic", state.topic),
    tide.storage.set("key", state.oldKey), tide.storage.set("blockEnabled", state.blockEnabled),
    tide.storage.set("taskEnabled", state.taskEnabled), tide.storage.set("lead", state.lead),
    tide.storage.set("pushed", state.pushed), tide.storage.set("log", state.log),
  ]);

  function configured() { return state.provider === "pushplus" ? !!state.token : !!state.oldKey; }
  function dueAt(task) {
    if (!task || !task.due) return null;
    const time = /^\d{2}:\d{2}$/.test(task.dueTime || "") ? task.dueTime : "23:59";
    const d = new Date(`${task.due}T${time}:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  function offsetLabel(min) {
    if (min === 0) return "已到截止时间";
    if (min < 60) return `还有 ${min} 分钟截止`;
    if (min % 1440 === 0) return `还有 ${min / 1440} 天截止`;
    if (min % 60 === 0) return `还有 ${min / 60} 小时截止`;
    return `还有 ${Math.floor(min / 60)} 小时 ${min % 60} 分钟截止`;
  }

  function startTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(tick, 60 * 1000);
  }

  async function tick() {
    if (!state.enabled || !configured()) return;
    const now = new Date(), nowMs = now.getTime(), d = tide.util.today();
    let dirty = false;
    const keepAfter = nowMs - 7 * 86400000;
    const kept = state.pushed.filter((k) => {
      const ts = Number(String(k).split("|").pop());
      return !Number.isFinite(ts) || ts >= keepAfter;
    });
    if (kept.length !== state.pushed.length) { state.pushed = kept; dirty = true; }

    if (state.blockEnabled) {
      const blocks = await tide.blocks.list(d);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      for (const b of blocks) {
        const [h, m] = String(b.start || "00:00").split(":").map(Number);
        const delta = h * 60 + m - nowMin;
        const eventAt = new Date(`${d}T${b.start}:00`).getTime();
        const key = `block|${b.id}|${eventAt}`;
        if (delta >= 0 && delta <= state.lead && !state.pushed.includes(key)) {
          state.pushed.push(key); dirty = true;
          await push(`⏰ ${b.start} ${b.title}`, `${b.start} – ${tide.util.hhmmOf(tide.util.mmOf(b.start) + b.durMin)} · ${b.durMin} 分钟\n\n来自 Le时间管理 · 时间块提醒`);
        }
      }
    }

    if (state.taskEnabled) {
      const tasks = await tide.tasks.list();
      for (const task of tasks) {
        if (!task || task.done || task.reminderEnabled === false) continue;
        const due = dueAt(task); if (!due) continue;
        const offsets = Array.isArray(task.reminderOffsets) ? task.reminderOffsets : [60, 10, 0];
        for (const raw of offsets) {
          const offset = Math.max(0, Math.round(Number(raw) || 0));
          const at = due - offset * 60000;
          const key = `task|${task.id}|${offset}|${at}`;
          if (nowMs >= at && nowMs - at <= 90000 && !state.pushed.includes(key)) {
            state.pushed.push(key); dirty = true;
            await push(`📌 ${task.title}`, `${offsetLabel(offset)}\n截止：${task.due} ${task.dueTime || "23:59"}\n\n来自 Le时间管理 · 任务提醒`);
          }
        }
      }
    }
    if (dirty) await save();
  }

  async function pushPlus(title, content) {
    if (!state.token) throw new Error("请先填写 PushPlus Token");
    state.sid ||= await tide.http.session();
    const payload = { token: state.token, title, content, template: "txt", channel: "wechat" };
    if (state.topic) payload.topic = state.topic;
    const res = await tide.http.fetch(state.sid, "POST", PUSHPLUS_URL, {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    let data = null; try { data = JSON.parse(res.body); } catch {}
    if (res.status < 200 || res.status >= 300 || !data || Number(data.code) !== 200) {
      throw new Error(data?.msg || `HTTP ${res.status}`);
    }
    return true;
  }

  async function serverChan(title, content) {
    if (!state.oldKey) throw new Error("请先填写 Server酱 SendKey");
    const res = await tide.http.get(SCT(state.oldKey, title, content));
    let data = null; try { data = JSON.parse(res.body); } catch {}
    if (res.status < 200 || res.status >= 300 || !data || Number(data.code) !== 0) throw new Error(data?.message || `HTTP ${res.status}`);
    return true;
  }

  async function push(title, content) {
    try {
      if (state.provider === "pushplus") await pushPlus(title, content); else await serverChan(title, content);
      state.log.unshift(`${new Date().toTimeString().slice(0, 5)} ✓ ${state.provider === "pushplus" ? "PushPlus" : "Server酱"}已提交：${title.slice(0, 26)}`);
      state.log = state.log.slice(0, 12); await save(); paintLog(); return true;
    } catch (e) {
      state.log.unshift(`${new Date().toTimeString().slice(0, 5)} ✗ ${e.message || e}`);
      state.log = state.log.slice(0, 12); await save(); paintLog(); tide.notify(`推送失败：${e.message || e}`); return false;
    }
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  function ensureStyle() {
    if (document.getElementById("wp-push-style")) return;
    const st = document.createElement("style"); st.id = "wp-push-style";
    st.textContent = `.wp-wrap{max-width:680px;margin:0 auto}.wp-card{background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-radius:16px;padding:20px 22px}.wp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.wp-field{margin-top:12px}.wp-field label{display:block;font-size:11px;color:var(--ink-2,#7E8B94);margin-bottom:4px}.wp-field input,.wp-field select,.wp-row select{height:38px;border:1px solid var(--line,#E4DFD6);border-radius:9px;padding:0 10px;background:var(--panel,#fff);color:var(--ink,#22303A)}.wp-field input{width:100%}.wp-btn{font-size:12px;border:1px solid var(--line,#E4DFD6);border-radius:8px;padding:8px 13px;background:var(--panel,#fff);cursor:pointer;color:var(--ink,#22303A)}.wp-btn.pri{background:var(--deep,#0F4C5C);color:#fff;border-color:var(--deep,#0F4C5C)}.wp-check{display:inline-flex;gap:6px;align-items:center;font-size:12px;color:var(--ink-2,#667780)}.wp-note{font-size:11.5px;color:var(--ink-2,#7E8B94);line-height:1.75;margin-top:10px;background:var(--paper,#f6f7f7);padding:9px 10px;border-radius:9px}.wp-docs{margin-top:10px;font-size:11.5px;color:var(--ink-2,#7E8B94)}.wp-link{color:var(--sea,#118AB2);cursor:pointer;text-decoration:underline;text-underline-offset:2px}.wp-log{margin-top:14px;border-top:1px dashed var(--line,#EFEAE1);padding-top:8px}.wp-provider{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.wp-provider button{padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--panel,#fff);cursor:pointer}.wp-provider button.on{border-color:var(--deep,#0F4C5C);box-shadow:inset 0 0 0 1px var(--deep,#0F4C5C)}@media(max-width:620px){.wp-provider{grid-template-columns:1fr}.wp-row>*{flex:1}.wp-row .wp-check{flex:auto}}`;
    document.head.append(st);
  }

  function render(el) {
    ensureStyle(); el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "wp-wrap";
    wrap.innerHTML = `<div style="font-size:11px;letter-spacing:.3em;color:var(--ink-2,#7E8B94);margin:14px 0 12px">微 信 信 息 推 送 · PushPlus</div><div class="wp-card"><div style="font-size:15px;font-weight:750">微信推送通道</div><div class="wp-note">推荐使用 PushPlus：在 pushplus.plus 微信扫码登录后，进入<b>「一对一推送」</b>页面复制 Token。默认通过微信公众号渠道发送；如填写群组编码 Topic，则发到对应群组。旧版 Server酱配置继续保留兼容。</div><div class="wp-docs">官方文档：<span class="wp-link" data-doc="${PUSHPLUS_DOCS[0][1]}">${PUSHPLUS_DOCS[0][0]}</span> · <span class="wp-link" data-doc="${PUSHPLUS_DOCS[1][1]}">${PUSHPLUS_DOCS[1][0]}</span></div><div class="wp-provider"><button data-provider="pushplus">PushPlus（推荐）</button><button data-provider="serverchan">Server酱（兼容）</button></div><div data-pp><div class="wp-field"><label>PushPlus Token</label><input data-token type="password" autocomplete="off" placeholder="粘贴 Token"></div><div class="wp-field"><label>Topic（可选，群组编码）</label><input data-topic type="text" placeholder="不填则只推送给自己"></div></div><div data-sct><div class="wp-field"><label>Server酱 SendKey</label><input data-key type="password" autocomplete="off" placeholder="SCT…"></div></div><div class="wp-row"><label class="wp-check"><input data-en type="checkbox">启用微信推送</label><label class="wp-check"><input data-block type="checkbox">时间块提醒</label><label class="wp-check"><input data-task type="checkbox">任务截止提醒</label></div><div class="wp-row"><span style="font-size:12px;color:var(--ink-2,#7E8B94)">时间块提前</span><select data-lead><option value="3">3 分钟</option><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option></select><span style="flex:1"></span><button class="wp-btn" data-show>显示/隐藏凭据</button><button class="wp-btn pri" data-test>发送测试消息</button></div><div class="wp-log" data-log></div><div class="wp-note">日志里 ✓ 表示消息已成功<b>提交</b>到推送服务（官方接口为异步，code=200 只代表已接收）；公众号实际送达以微信为准，受平台频控影响。收不到消息时先用「发送测试消息」验证，再对照上方官方文档排查。</div></div>`;
    el.append(wrap);
    ui = { log: wrap.querySelector("[data-log]"), token: wrap.querySelector("[data-token]"), topic: wrap.querySelector("[data-topic]"), key: wrap.querySelector("[data-key]"), en: wrap.querySelector("[data-en]"), block: wrap.querySelector("[data-block]"), task: wrap.querySelector("[data-task]"), lead: wrap.querySelector("[data-lead]"), pp: wrap.querySelector("[data-pp]"), sct: wrap.querySelector("[data-sct]") };

    ensurePrefs().then(() => {
      ui.token.value = state.token; ui.topic.value = state.topic; ui.key.value = state.oldKey; ui.en.checked = state.enabled;
      ui.block.checked = state.blockEnabled; ui.task.checked = state.taskEnabled; ui.lead.value = String(state.lead);
      paintProvider(); paintLog(); if (state.enabled && configured()) startTimer();
    });

    function readFields() { state.token = ui.token.value.trim(); state.topic = ui.topic.value.trim(); state.oldKey = ui.key.value.trim(); state.lead = Number(ui.lead.value) || 5; state.blockEnabled = ui.block.checked; state.taskEnabled = ui.task.checked; }
    function paintProvider() {
      wrap.querySelectorAll("[data-provider]").forEach((b) => b.classList.toggle("on", b.dataset.provider === state.provider));
      ui.pp.style.display = state.provider === "pushplus" ? "block" : "none"; ui.sct.style.display = state.provider === "serverchan" ? "block" : "none";
    }
    wrap.querySelectorAll("[data-doc]").forEach((a) => a.addEventListener("click", () => {
      tide.util.openUrl(a.dataset.doc).catch((e) => tide.notify(`打开官方文档失败：${e.message || e}`));
    }));
    wrap.querySelectorAll("[data-provider]").forEach((b) => b.addEventListener("click", async () => { readFields(); state.provider = b.dataset.provider; paintProvider(); await save(); }));
    ui.en.addEventListener("change", async () => { readFields(); state.enabled = ui.en.checked; if (state.enabled && !configured()) { state.enabled = false; ui.en.checked = false; tide.notify(state.provider === "pushplus" ? "请先填写 PushPlus Token" : "请先填写 Server酱 SendKey"); return; } await save(); if (state.enabled) { startTimer(); tick(); tide.notify("微信推送已开启"); } else { if (state.timer) clearInterval(state.timer); state.timer = null; tide.notify("微信推送已关闭"); } });
    [ui.block, ui.task, ui.lead].forEach((x) => x.addEventListener("change", async () => { readFields(); await save(); }));
    [ui.token, ui.topic, ui.key].forEach((x) => x.addEventListener("change", async () => { readFields(); await save(); }));
    wrap.querySelector("[data-show]").addEventListener("click", () => { const next = ui.token.type === "password" ? "text" : "password"; ui.token.type = next; ui.key.type = next; });
    wrap.querySelector("[data-test]").addEventListener("click", async () => { readFields(); await save(); await push("Le时间管理测试推送", "如果你在微信里看到这条消息，说明推送通道正常 ✓"); });
  }

  function paintLog() {
    if (!ui?.log) return;
    ui.log.innerHTML = state.log.length ? state.log.map((l) => `<div style="font-size:11px;color:var(--ink-2,#7E8B94);padding:3px 0">${esc(l)}</div>`).join("") : `<div style="font-size:11px;color:var(--ink-3,#A9B2BA)">还没有推送记录</div>`;
  }

  tide.ui.registerView({ id: "wechat-push", title: "微信推送", icon: "comment-dots", render });
  ensurePrefs().then(() => { if (state.enabled && configured()) { startTimer(); tick(); } });
})();
