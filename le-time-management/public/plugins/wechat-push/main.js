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

  /* 插件消息攒批参数（对照 PushPlus 官方限制：相同内容 1 小时限 3 条、每分钟限 5 次、内容 ≤20000 字）：
     新消息先攒 2 分钟再合并成「一条」推送，一批带上队列里全部待发消息，把请求数压到最低。 */
  const PLUGIN_QUEUE_CAP = 60;                  // 队列上限（超出丢最旧的）
  const PLUGIN_BATCH_WINDOW_MS = 2 * 60 * 1000; // 攒批窗口：首条入队后等 2 分钟再发
  const PLUGIN_CONTENT_LIMIT = 18000;           // 单条推送正文字数上限（官方 20000，留余量）

  const state = {
    enabled: false, provider: "pushplus", token: "", topic: "", oldKey: "",
    blockEnabled: true, taskEnabled: true, lead: 5,
    pushScope: ["block", "task"],   // 多选：block=时间块 / task=任务截止 / plugin=插件收集的新消息
    pluginQueue: [],                // 待推送的插件新消息（内存队列，攒批窗口到了合并发送）
    pluginTimer: null,              // 攒批窗口计时器（节流式：窗口内新消息只进队列，不重置窗口）
    timer: null, pushed: [], log: [], sid: null,
  };
  let ui = null;
  let prefsPromise = null;

  async function loadPrefs() {
    const [enabled, provider, token, topic, oldKey, blockEnabled, taskEnabled, lead, pushed, log, pushScope] = await Promise.all([
      tide.storage.get("enabled", false), tide.storage.get("provider", ""), tide.storage.get("pushplusToken", ""),
      tide.storage.get("pushplusTopic", ""), tide.storage.get("key", ""), tide.storage.get("blockEnabled", true),
      tide.storage.get("taskEnabled", true), tide.storage.get("lead", 5), tide.storage.get("pushed", []), tide.storage.get("log", []),
      tide.storage.get("pushScope", null),
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
    // pushScope 是 v1.7.0 的多选存储；老配置没有它时从旧的两个开关反推（含旧「全关」→ 回默认两项），
    // 保证升级不丢用户选择。blockEnabled/taskEnabled 从此作为 pushScope 的镜像维护，tick 逻辑不变。
    const valid = (v) => Array.isArray(v) && (v = v.filter((k) => ["block", "task", "plugin"].includes(k))).length ? v : null;
    state.pushScope = valid(pushScope)
      || (state.blockEnabled && state.taskEnabled ? ["block", "task"] : state.blockEnabled ? ["block"] : state.taskEnabled ? ["task"] : ["block", "task"]);
    state.blockEnabled = state.pushScope.includes("block");
    state.taskEnabled = state.pushScope.includes("task");
  }
  const ensurePrefs = () => (prefsPromise ||= loadPrefs());

  const save = () => Promise.all([
    tide.storage.set("enabled", state.enabled), tide.storage.set("provider", state.provider),
    tide.storage.set("pushplusToken", state.token), tide.storage.set("pushplusTopic", state.topic),
    tide.storage.set("key", state.oldKey), tide.storage.set("blockEnabled", state.blockEnabled),
    tide.storage.set("taskEnabled", state.taskEnabled), tide.storage.set("lead", state.lead),
    tide.storage.set("pushed", state.pushed), tide.storage.set("log", state.log),
    tide.storage.set("pushScope", state.pushScope),
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
    // 攒批窗口没在倒计时才补发（失败重试 / 兜底走这里）；窗口倒计时中不动队列，等窗口到点一次性发
    if (!state.pluginTimer) await flushPluginNotices();
  }

  /* ── 插件消息通道：订阅 notice:new（学习通等插件抓到新通知时广播），攒批合并为一条推送 ──
     PushPlus 官方限制：相同内容 1 小时限 3 条、每分钟限 5 次、内容 ≤20000 字。
     策略：首条消息入队后开 2 分钟攒批窗口（节流式，窗口内新消息只进队列不重置窗口），
     到点把队列里「全部」待发消息合并成一条推送；失败留在队列里，下一分钟的 tick 重试。
     推送内容勾选「插件收集的新消息」才生效。 */
  function queuePluginNotice(p) {
    if (!p || !Array.isArray(p.items) || !p.items.length) return;
    const name = String(p.sourceName || p.source || "插件").slice(0, 12);
    for (const it of p.items.slice(0, 5)) {
      state.pluginQueue.push({ source: name, title: String(it.title || "(无标题)").slice(0, 60), time: String(it.time || "").slice(0, 16) });
    }
    if (state.pluginQueue.length > PLUGIN_QUEUE_CAP) state.pluginQueue = state.pluginQueue.slice(-PLUGIN_QUEUE_CAP);
    paintQueue();
    if (!state.pluginTimer) {
      state.pluginTimer = setTimeout(async () => {
        state.pluginTimer = null;
        await flushPluginNotices();
      }, PLUGIN_BATCH_WINDOW_MS);
    }
  }

  async function flushPluginNotices() {
    if (!state.pluginQueue.length) return;
    if (!state.enabled || !configured() || !state.pushScope.includes("plugin")) return;
    const batch = state.pluginQueue.slice(); // 一批带上队列里全部待发消息，把请求数压到最低
    const now = new Date().toTimeString().slice(0, 5);
    const title = `🔔 插件新消息 ${batch.length} 条（${now}）`;
    let body = batch.map((x) => `· [${x.source}] ${x.title}${x.time ? `（${x.time}）` : ""}`).join("\n");
    if (body.length > PLUGIN_CONTENT_LIMIT) body = `${body.slice(0, PLUGIN_CONTENT_LIMIT)}\n…（内容过长已截断）`;
    const ok = await push(title, `${body}\n\n来自 Le时间管理 · 插件消息推送`);
    if (ok) { state.pluginQueue.splice(0, batch.length); paintQueue(); }
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
      // PushPlus 返回码：999=服务端验证错误（常见于相同内容 1 小时超 3 条 / 每分钟超 5 次的频次拦截），
      // 903=token 不正确，905=未实名认证，900=当日请求超限。带上 code 方便对官方返回码表排查。
      throw new Error(`PushPlus[${data ? data.code : `HTTP ${res.status}`}]${data?.msg || "请求失败"}`);
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
      const msg = String(e.message || e);
      // 999=PushPlus 频次拦截（相同内容 1 小时限 3 条、每分钟限 5 次），给一句能自助解决的提示。
      const hint = /999|服务端验证/.test(msg) ? "（PushPlus 相同内容 1 小时只能发 3 条、每分钟最多 5 次；多为短时间重复测试所致，等一会或改下内容即可）" : "";
      state.log.unshift(`${new Date().toTimeString().slice(0, 5)} ✗ 推送「${title.slice(0, 20)}」：${msg}${hint}`);
      state.log = state.log.slice(0, 12); await save(); paintLog(); tide.notify(`推送失败：${msg}`); return false;
    }
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }
  // 多选面板里的待推送计数：攒批窗口倒计时中会标注，发完自动隐藏
  function paintQueue() {
    if (!ui?.msQueue) return;
    const n = state.pluginQueue.length;
    if (!n) { ui.msQueue.hidden = true; return; }
    ui.msQueue.hidden = false;
    ui.msQueue.textContent = `待推送：${n} 条${state.pluginTimer ? " · 攒批中，最多 2 分钟后合并发送" : ""}`;
  }
  function ensureStyle() {
    if (document.getElementById("wp-push-style")) return;
    const st = document.createElement("style"); st.id = "wp-push-style";
    st.textContent = `.wp-wrap{max-width:680px;margin:0 auto}.wp-card{background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-radius:16px;padding:20px 22px}.wp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.wp-field{margin-top:12px}.wp-field label{display:block;font-size:calc(11px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);margin-bottom:4px}.wp-field input:not(.switch),.wp-field select,.wp-row select{height:38px;border:1px solid var(--line,#E4DFD6);border-radius:9px;padding:0 10px;background:var(--panel,#fff);color:var(--ink,#22303A)}.wp-field input:not(.switch){width:100%}.wp-btn{font-size:calc(12px * var(--ui-text-scale));border:1px solid var(--line,#E4DFD6);border-radius:8px;padding:8px 13px;background:var(--panel,#fff);cursor:pointer;color:var(--ink,#22303A)}.wp-btn.pri{background:var(--deep,#0F4C5C);color:#fff;border-color:var(--deep,#0F4C5C)}.wp-check{display:inline-flex;gap:8px;align-items:center;font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2,#667780)}.wp-check .switch{margin-top:0}.wp-note{font-size:calc(11.5px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);line-height:1.75;margin-top:10px;background:var(--paper,#f6f7f7);padding:9px 10px;border-radius:9px}.wp-docs{margin-top:10px;font-size:calc(11.5px * var(--ui-text-scale));color:var(--ink-2,#7E8B94)}.wp-link{color:var(--sea,#118AB2);cursor:pointer;text-decoration:underline;text-underline-offset:2px}.wp-log{margin-top:14px;border-top:1px dashed var(--line,#EFEAE1);padding-top:8px}.wp-provider{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.wp-provider button{padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--panel,#fff);cursor:pointer}.wp-provider button.on{border-color:var(--deep,#0F4C5C);box-shadow:inset 0 0 0 1px var(--deep,#0F4C5C)}.wp-multi{position:relative;display:inline-flex}.wp-multi b{font-weight:650;color:var(--ink,#22303A)}.wp-ms-panel{position:absolute;top:calc(100% + 6px);left:0;z-index:40;background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:9px;min-width:250px;box-shadow:0 10px 26px rgba(0,0,0,.14);opacity:0;transform:translateY(-6px);visibility:hidden;pointer-events:none;transition:opacity .18s ease,transform .18s ease,visibility 0s linear .18s}.wp-ms-panel.on{opacity:1;transform:translateY(0);visibility:visible;pointer-events:auto;transition:opacity .18s ease,transform .18s ease,visibility 0s}.wp-ms-caret{display:inline-block;transition:transform .18s ease}.wp-multi.open .wp-ms-caret{transform:rotate(180deg)}@media (prefers-reduced-motion:reduce){.wp-ms-panel,.wp-ms-caret{transition:none}}.wp-ms-note{font-size:calc(11px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);line-height:1.6}@media(max-width:620px){.wp-provider{grid-template-columns:1fr}.wp-row>*{flex:1}.wp-row .wp-check{flex:auto}}`;
    document.head.append(st);
  }

  function render(el) {
    ensureStyle(); el.innerHTML = "";
    const wrap = document.createElement("div"); wrap.className = "wp-wrap";
    wrap.innerHTML = `<div style="font-size:calc(11px * var(--ui-text-scale));letter-spacing:.3em;color:var(--ink-2,#7E8B94);margin:14px 0 12px">微 信 信 息 推 送 · PushPlus</div><div class="wp-card"><div style="font-size:calc(15px * var(--ui-text-scale));font-weight:750">微信推送通道</div><div class="wp-note">推荐使用 PushPlus：点「一键获取 Token」打开一对一消息页，微信扫码登录后复制页面上的 Token 粘贴回来。默认通过微信公众号渠道发送；如填写群组编码 Topic，则发到对应群组。旧版 Server酱配置继续保留兼容。</div><div class="wp-docs">官方文档：<span class="wp-link" data-doc="${PUSHPLUS_DOCS[0][1]}">${PUSHPLUS_DOCS[0][0]}</span> · <span class="wp-link" data-doc="${PUSHPLUS_DOCS[1][1]}">${PUSHPLUS_DOCS[1][0]}</span></div><div class="wp-provider"><button data-provider="pushplus">PushPlus（推荐）</button><button data-provider="serverchan">Server酱（兼容）</button></div><div data-pp><div class="wp-field"><label>PushPlus Token</label><input data-token type="password" autocomplete="off" placeholder="粘贴 Token"></div><div class="wp-row" style="margin-top:8px"><button class="wp-btn pri" data-gettoken>↗ 一键获取 Token</button><span style="font-size:calc(11px * var(--ui-text-scale));color:var(--ink-2,#7E8B94)">打开「一对一消息」页（未登录会先跳登录），登录后即可复制 Token</span></div><div class="wp-field"><label>Topic（可选，群组编码）</label><input data-topic type="text" placeholder="不填则只推送给自己"></div></div><div data-sct><div class="wp-field"><label>Server酱 SendKey</label><input data-key type="password" autocomplete="off" placeholder="SCT…"></div></div><div class="wp-row"><label class="wp-check"><input class="switch" role="switch" data-en type="checkbox">启用微信推送</label><div class="wp-multi" data-ms><button type="button" class="wp-btn" data-ms-btn aria-haspopup="true" aria-expanded="false">推送内容：<b data-ms-label></b> <span class="wp-ms-caret" aria-hidden="true">▾</span></button><div class="wp-ms-panel" data-ms-panel><label class="wp-check"><input type="checkbox" data-ms="block">时间块提醒</label><label class="wp-check"><input type="checkbox" data-ms="task">任务截止提醒</label><label class="wp-check"><input type="checkbox" data-ms="plugin">插件收集的新消息</label><div class="wp-ms-note">插件消息：学习通等插件抓到新通知时先攒 2 分钟，再把队列里全部待发消息合并成一条推送，尽量少占 PushPlus 频次额度（相同内容 1 小时限 3 条、每分钟限 5 次）。</div><div class="wp-ms-note" data-ms-queue hidden></div></div></div></div><div class="wp-row"><span style="font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2,#7E8B94)">时间块提前</span><select data-lead><option value="3">3 分钟</option><option value="5">5 分钟</option><option value="10">10 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option></select><span style="flex:1"></span><button class="wp-btn" data-show>显示/隐藏凭据</button><button class="wp-btn pri" data-test>发送测试消息</button></div><div class="wp-log" data-log></div><div class="wp-note">日志里 ✓ 表示消息已成功<b>提交</b>到推送服务（官方接口为异步，code=200 只代表已接收）；公众号实际送达以微信为准，受平台频控影响。收不到消息时先用「发送测试消息」验证，再对照上方官方文档排查。</div></div>`;
    el.append(wrap);
    ui = { log: wrap.querySelector("[data-log]"), token: wrap.querySelector("[data-token]"), topic: wrap.querySelector("[data-topic]"), key: wrap.querySelector("[data-key]"), en: wrap.querySelector("[data-en]"), lead: wrap.querySelector("[data-lead]"), pp: wrap.querySelector("[data-pp]"), sct: wrap.querySelector("[data-sct]"), msQueue: wrap.querySelector("[data-ms-queue]") };
    const msBtn = wrap.querySelector("[data-ms-btn]"), msPanel = wrap.querySelector("[data-ms-panel]"), msLabel = wrap.querySelector("[data-ms-label]");
    const msBoxes = [...wrap.querySelectorAll("[data-ms]")];
    const SCOPE_NAMES = { block: "时间块", task: "任务截止", plugin: "插件消息" };
    function paintScope() {
      msBoxes.forEach((b) => { b.checked = state.pushScope.includes(b.dataset.ms); });
      msLabel.textContent = state.pushScope.length ? state.pushScope.map((k) => SCOPE_NAMES[k]).join(" + ") : "未选择";
    }
    // v1.8.1：面板不再用 hidden 属性开关 —— .wp-ms-panel 的 display:flex 是作者样式，
    // 永远压过 UA 的 [hidden]{display:none}，hidden 切了也收不回去（正是「展开后无法收起」的根因）。
    // 改成 .on 类切换，顺带补上展开/收起过渡动画（不认 reduced-motion 时）与箭头旋转。
    function setMsOpen(open) {
      msPanel.classList.toggle("on", open);
      msPanel.closest("[data-ms]").classList.toggle("open", open);
      msBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    msBtn.addEventListener("click", () => { setMsOpen(!msPanel.classList.contains("on")); });
    msBoxes.forEach((b) => b.addEventListener("change", async () => { readFields(); await save(); paintScope(); }));
    document.addEventListener("click", (e) => { if (!e.target.closest("[data-ms]")) setMsOpen(false); });

    ensurePrefs().then(() => {
      ui.token.value = state.token; ui.topic.value = state.topic; ui.key.value = state.oldKey; ui.en.checked = state.enabled;
      ui.lead.value = String(state.lead); paintScope();
      paintProvider(); paintLog(); paintQueue(); if (state.enabled && configured()) startTimer();
    });

    function readFields() {
      state.pushScope = msBoxes.filter((b) => b.checked).map((b) => b.dataset.ms);
      if (!state.pushScope.length) state.pushScope = ["block", "task"]; // 全不选没有意义，回默认
      state.blockEnabled = state.pushScope.includes("block");
      state.taskEnabled = state.pushScope.includes("task");
      state.token = ui.token.value.trim(); state.topic = ui.topic.value.trim(); state.oldKey = ui.key.value.trim(); state.lead = Number(ui.lead.value) || 5;
    }
    function paintProvider() {
      wrap.querySelectorAll("[data-provider]").forEach((b) => b.classList.toggle("on", b.dataset.provider === state.provider));
      ui.pp.style.display = state.provider === "pushplus" ? "block" : "none"; ui.sct.style.display = state.provider === "serverchan" ? "block" : "none";
    }
    wrap.querySelectorAll("[data-doc]").forEach((a) => a.addEventListener("click", () => {
      tide.util.openUrl(a.dataset.doc).catch((e) => tide.notify(`打开官方文档失败：${e.message || e}`));
    }));
    wrap.querySelector("[data-gettoken]")?.addEventListener("click", () => {
      tide.util.openUrl("https://www.pushplus.plus/push1.html").catch((e) => tide.notify(`打开 Token 页失败：${e.message || e}`));
    });
    wrap.querySelectorAll("[data-provider]").forEach((b) => b.addEventListener("click", async () => { readFields(); state.provider = b.dataset.provider; paintProvider(); await save(); }));
    ui.en.addEventListener("change", async () => { readFields(); state.enabled = ui.en.checked; if (state.enabled && !configured()) { state.enabled = false; ui.en.checked = false; tide.notify(state.provider === "pushplus" ? "请先填写 PushPlus Token" : "请先填写 Server酱 SendKey"); return; } await save(); if (state.enabled) { startTimer(); tick(); tide.notify("微信推送已开启"); } else { if (state.timer) clearInterval(state.timer); state.timer = null; tide.notify("微信推送已关闭"); } });
    [ui.lead].forEach((x) => x.addEventListener("change", async () => { readFields(); await save(); }));
    [ui.token, ui.topic, ui.key].forEach((x) => x.addEventListener("change", async () => { readFields(); await save(); }));
    wrap.querySelector("[data-show]").addEventListener("click", () => { const next = ui.token.type === "password" ? "text" : "password"; ui.token.type = next; ui.key.type = next; });
    // 测试推送：标题带时间戳（PushPlus 相同内容 1 小时限 3 条，重复内容会被 999 拒绝）+ 1 分钟防连点。
    let lastTestAt = 0;
    wrap.querySelector("[data-test]").addEventListener("click", async () => {
      readFields(); await save();
      if (Date.now() - lastTestAt < 65000) { tide.notify("1 分钟内刚发过测试推送（PushPlus 每分钟限 5 次、相同内容每小时限 3 条），稍后再试"); return; }
      lastTestAt = Date.now();
      const at = new Date().toTimeString().slice(0, 5);
      await push(`Le时间管理测试推送 ${at}`, `如果你在微信里看到这条消息，说明推送通道正常 ✓（${at} 发出）`);
    });
  }

  function paintLog() {
    if (!ui?.log) return;
    ui.log.innerHTML = state.log.length ? state.log.map((l) => `<div style="font-size:calc(11px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);padding:3px 0">${esc(l)}</div>`).join("") : `<div style="font-size:calc(11px * var(--ui-text-scale));color:var(--ink-3,#A9B2BA)">还没有推送记录</div>`;
  }

  tide.ui.registerView({ id: "wechat-push", title: "微信推送", icon: "comment-dots", render });
  // 插件消息通道：学习通等插件抓到新通知时广播 notice:new，这里入队并按批推送
  try { tide.events.on("notice:new", queuePluginNotice); } catch {}
  ensurePrefs().then(() => { if (state.enabled && configured()) { startTimer(); tick(); } });
})();
