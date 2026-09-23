// AI 对话插件 —— 问一句，它把本机的任务、时间块和其他插件推来的消息读成快照交给模型，
// 答完还能把整理结果勾回来落库。
//
// 为什么做成插件而不是核心视图：AI 能力完全依赖「设置 › AI 与自动任务」里用户自己配的
// 模型与密钥，没配就是一块死界面；插件可以被整体关掉，核心视图不该有这种空转状态。
//
// 为什么写回必须经过勾选：模型会一本正经地编出不存在的作业。所有建议先停在回答下面的
// 待确认列表里，逐条勾选、点了「写入」才落库，落库后给一条带「撤销」的提示 ——
// 与截图识别（aiIngest）同一套「先预览后落库」。
//
// 三条硬约束（都不是本地能改的）：
//   · 上游非流式：一次请求拿回整段文本，所以发送后必须自己画等待态；
//   · 宿主限制：一次 ≤24 条消息、文本总量 ≤60000 字符 ⇒ 历史按轮数截断、快照按条数封顶；
//   · 安全区：本视图不建浮层、不往宿主容器外挂节点、不按视口尺寸定位（铁律四与
//     scripts/test-plugin-safe-area.mjs 会拦这三类）；吸底输入框靠 .plugview 的满高 flex 列实现。
(function () {
  const VIEW_ID = "ai-chat";
  const THREAD_KEY = "thread";
  const CTX_KEY = "withContext";
  const NOTICE_KEY = "notices";
  const KEEP = 40;          // 本地留存的对话条数
  const SEND_TURNS = 10;    // 送给模型的最近条数（含本轮提问，24 条上限留足余量）
  const SNAP_CAP = 25;      // 快照每段最多列几条
  const NOTICE_KEEP = 120;  // 消息环形队列长度（与宿主抄收队列同宽）
  const NOTICE_PER_SOURCE = 6;

  let thread = [];
  let notices = [];         // 跨插件消息（新的在前），跨重启保留
  let loaded = false;
  let busy = false;
  let withContext = true;
  let modelLabel = "";
  let configured = false;
  let ui = null;          // 当前渲染出来的 DOM（切走再回来会重建）

  const noticeKey = (m) => `${m.source}|${m.time}|${m.title}`;

  /**
   * 把宿主抄收的 notice:new 并进本地环形队列。
   *
   * 为什么两头都要：宿主的队列只在本次运行期（重启即空），插件私有存储又能跨重启，
   * 但反过来插件自己听不到早于它加载时广播的消息 —— 合起来才是完整的一份。
   */
  async function syncNotices() {
    const fresh = (await tide.messages.list(NOTICE_KEEP)) || [];
    if (!fresh.length) return;
    const seen = new Set(notices.map(noticeKey));
    const add = fresh.filter((m) => m && m.title && !seen.has(noticeKey(m)));
    if (!add.length) return;
    notices = add.concat(notices).slice(0, NOTICE_KEEP);
    tide.storage.set(NOTICE_KEY, notices);
  }

  /* ───────────────────────── 小工具 ───────────────────────── */

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const QUAD_LABEL = { 1: "象限I", 2: "象限II", 3: "象限III", 4: "象限IV" };

  function weekday(ds) {
    const [y, m, d] = String(ds).split("-").map(Number);
    return "日一二三四五六"[new Date(y, m - 1, d).getDay()];
  }

  /** 极简 markdown：先整体转义，再补粗体 / 行内码 / 短列表 / 换行。 */
  function md(text) {
    const inline = (s) => s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    const out = [];
    let list = null;
    String(text || "").split("\n").forEach((raw) => {
      const line = esc(raw).trimEnd();
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        if (!list) { out.push("<ul>"); list = true; }
        out.push(`<li>${inline(bullet[1])}</li>`);
        return;
      }
      if (list) { out.push("</ul>"); list = null; }
      if (!line.trim()) out.push("");
      else out.push(`<p>${inline(line)}</p>`);
    });
    if (list) out.push("</ul>");
    return out.join("\n").replace(/(<p><\/p>)+/g, '<p class="gap"></p>');
  }

  function node(html) {
    const box = document.createElement("div");
    box.innerHTML = html;
    return box;
  }

  /* ───────────────────────── 本机数据快照 ───────────────────────── */

  /** 把任务与时间块压成一段文本喂给模型：只给事实，不给判断。 */
  function snapshot() {
    const today = tide.util.today();
    const plus7 = tide.util.addDays(today, 7);
    const tasks = tide.tasks.list();
    const buckets = { overdue: [], today: [], soon: [], later: [], free: [] };
    tasks.filter((t) => !t.done).forEach((t) => {
      if (!t.due) buckets.free.push(t);
      else if (t.due < today) buckets.overdue.push(t);
      else if (t.due === today) buckets.today.push(t);
      else if (t.due <= plus7) buckets.soon.push(t);
      else buckets.later.push(t);
    });
    const line = (t) => {
      const bits = [`id=${t.id}`, t.title];
      if (t.due) bits.push(`截止 ${t.due}${t.dueTime ? " " + t.dueTime : ""}`);
      if (t.quad) bits.push(QUAD_LABEL[t.quad] || `象限${t.quad}`);
      if (t.estMin) bits.push(`估 ${t.estMin} 分钟`);
      if (t.note) bits.push(`备注：${String(t.note).slice(0, 40)}`);
      return `- ${bits.join(" · ")}`;
    };
    const section = (label, list, cap = SNAP_CAP) => {
      if (!list.length) return "";
      const shown = list.slice(0, cap).map(line);
      if (list.length > cap) shown.push(`- （其余 ${list.length - cap} 条略）`);
      return `【${label} 共 ${list.length} 条】\n${shown.join("\n")}`;
    };

    const parts = [`今天：${today}（周${weekday(today)}）`];
    parts.push(section("已逾期未完成", buckets.overdue.sort((a, b) => String(a.due).localeCompare(String(b.due)))));
    parts.push(section("今天到期", buckets.today));
    parts.push(section("未来 7 天到期", buckets.soon.sort((a, b) => String(a.due).localeCompare(String(b.due)))));
    parts.push(section("更远 / 无截止", buckets.later.concat(buckets.free), 15));
    const done = tasks.filter((t) => t.done);
    if (done.length) {
      parts.push(`【已完成 ${done.length} 条，最近 ${Math.min(12, done.length)} 条】\n`
        + done.slice(-12).reverse().map((t) => `- id=${t.id} ${t.title}`).join("\n"));
    }

    // 时间块：今天与后两天（模型要排期就得知道哪些格子已被占）
    const blockLines = [];
    for (let i = 0; i < 3; i += 1) {
      const ds = tide.util.addDays(today, i);
      const bs = tide.blocks.list(ds).sort((a, b) => a.start.localeCompare(b.start));
      if (!bs.length) continue;
      const tag = i === 0 ? "今天" : i === 1 ? "明天" : "后天";
      blockLines.push(`【${tag} ${ds}（周${weekday(ds)}）】`);
      bs.slice(0, 20).forEach((b) => {
        const bits = [`- ${b.start} 起 ${b.durMin} 分钟 ${b.title}`];
        if (b.cat) bits.push(b.cat);
        if (b.taskId) bits.push(`关联 id=${b.taskId}`);
        blockLines.push(bits.join(" · "));
      });
    }
    parts.push(blockLines.join("\n") || "【今天起 3 天没有时间块】");
    parts.push(noticeBlock());

    const text = parts.filter(Boolean).join("\n\n");
    // 60000 字符是整次请求的上限，快照单独卡一道，给对话历史留位置。
    return text.length > 9000 ? `${text.slice(0, 9000)}\n…（数据较多，快照已截断）` : text;
  }

  /** 其他插件推来的消息，按来源分组。没收到过就整段不出现，不给模型留一句空话。 */
  function noticeBlock() {
    if (!notices.length) return "";
    const bySource = new Map();
    notices.forEach((m) => {
      const key = m.sourceName || m.source;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(m);
    });
    const blocks = [...bySource.entries()].map(([name, list]) => {
      const shown = list.slice(0, NOTICE_PER_SOURCE).map((m) => {
        const bits = [m.title];
        if (m.time) bits.push(m.time);
        if (m.sender) bits.push(m.sender);
        return `  - ${bits.join(" · ")}`;
      });
      if (list.length > NOTICE_PER_SOURCE) shown.push(`  - （其余 ${list.length - NOTICE_PER_SOURCE} 条略）`);
      return `【${name} 共 ${list.length} 条】\n${shown.join("\n")}`;
    });
    return `【其他插件推来的消息（本机收到过的，按来源分组）】\n${blocks.join("\n")}`;
  }

  function systemPrompt() {
    const head = [
      "你是 U-Time（一款时间块 + 四象限任务管理应用）里的助手，用户就在应用内与你对话。",
      "规则：",
      "1. 只依据下面给出的本机数据回答；数据里没有的事实直说不知道，绝不编造任务、日期或 id。",
      "2. 中文回答，尽量短：先一句结论，再给要点；不要 Markdown 标题与表格，不要 emoji。",
      "3. 涉及日期一律写 YYYY-MM-DD，涉及时间写 HH:MM。",
      "4. 快照里可能有【其他插件推来的消息】一段，那是门户 / 学习通 / 学校通知 / 竞赛 / RSS 等插件推来的新消息；"
      + "它们只代表「收到了」，不代表用户已经处理过。要据此提醒或安排时，说清是哪来的消息。",
    ].join("\n");
    if (!withContext) return `${head}\n\n（用户已关闭「带本机数据」，本轮没有任何本机数据，只能回答通用问题。）`;
    return `${head}\n\n本机数据快照：\n${snapshot()}\n\n当用户要你「整理 / 安排 / 拆分 / 改期」时，除了正文说明，在回复**最后**单独输出一个 json 代码块（不要包在正文里），格式严格如下：\n`
      + '```json\n{"suggestions":[{"action":"create-task","title":"…","due":"YYYY-MM-DD","dueTime":"HH:MM","quad":2,"estMin":45,"note":"…"}]}\n```\n'
      + "action 只能取：create-task（新建任务）、create-block（新建时间块，字段 date/start/durMin/title/cat，cat 取 work|study|sport|life|rest）、update-task（改已有任务，字段 id + 要改的字段）、done-task（标记完成，字段 id）。"
      + "id 必须是上面快照里出现过的真实 id。没有要落库的东西就输出 {\"suggestions\":[]}。";
  }

  /* ───────────────────────── 建议解析与落库 ───────────────────────── */

  const ACTIONS = {
    "create-task": "新建任务",
    "create-block": "新建时间块",
    "update-task": "改任务",
    "done-task": "标记完成",
  };
  const CATS = new Set(["work", "study", "sport", "life", "rest"]);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /** 取回复里最后一个 json 代码块当建议，其余算正文。 */
  function parseReply(text) {
    const raw = String(text || "");
    const blocks = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      let parsed = null;
      try { parsed = JSON.parse(blocks[i][1]); } catch { continue; }
      const list = Array.isArray(parsed?.suggestions) ? parsed.suggestions
        : Array.isArray(parsed) ? parsed : null;
      if (!list) continue;
      const cut = blocks[i].index;
      return {
        body: raw.slice(0, cut).trimEnd(),
        suggestions: list.map(normalizeSuggestion).filter(Boolean),
      };
    }
    return { body: raw.trim(), suggestions: [] };
  }

  function normalizeSuggestion(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const action = ACTIONS[s.action] ? s.action : "";
    if (!action) return null;
    const out = { action, checked: true, applied: false };
    const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
    const int = (v, lo, hi) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
    };
    // 只有模型真给了值的字段才进 out：update-task 靠「字段在不在」判断要改什么，
    // 塞一个空串进去会把任务标题清空。
    const title = str(s.title, 120); if (title) out.title = title;
    if (s.note) out.note = str(s.note, 200);
    if (s.id) out.id = str(s.id, 40);
    if (DATE_RE.test(String(s.due || ""))) out.due = s.due;
    if (DATE_RE.test(String(s.date || ""))) out.date = s.date;
    if (TIME_RE.test(String(s.dueTime || ""))) out.dueTime = s.dueTime;
    if (TIME_RE.test(String(s.start || ""))) out.start = s.start;
    if (s.cat && CATS.has(s.cat)) out.cat = s.cat;
    const dur = int(s.durMin, 5, 1440); if (dur) out.durMin = dur;
    const est = int(s.estMin, 5, 1440); if (est) out.estMin = est;
    const quad = int(s.quad, 1, 4); if (quad) out.quad = quad;

    // 落地前就能判掉的非法项直接标出来，不等用户点了才发现写不进去。
    if (action === "create-task" && !out.title) out.reason = "缺任务标题";
    if (action === "create-block" && (!out.title || !out.date || !out.start)) out.reason = "缺 date/start/title";
    if ((action === "update-task" || action === "done-task")) {
      if (!out.id) out.reason = "缺任务 id";
      else if (!tide.tasks.list().some((t) => t.id === out.id)) out.reason = `id ${out.id} 不在本机任务里`;
    }
    return out;
  }

  function describe(s) {
    const head = ACTIONS[s.action];
    if (s.action === "done-task") return `${head}：${s.title || s.id}`;
    if (s.action === "update-task") {
      const to = [s.due ? `改到 ${s.due}${s.dueTime ? " " + s.dueTime : ""}` : "", s.title ? `标题「${s.title}」` : "", s.quad ? QUAD_LABEL[s.quad] : ""]
        .filter(Boolean).join("、") || "（模型没给出要改的字段）";
      return `${head} ${s.id}：${to}`;
    }
    if (s.action === "create-block") return `${head} · ${s.title} · ${s.date} ${s.start}${s.durMin ? ` 起 ${s.durMin} 分钟` : ""}`;
    return `${head} · ${s.title} · ${s.due ? `${s.due}${s.dueTime ? " " + s.dueTime : ""}` : "无截止"}`;
  }

  /** 只把模型真给了值的字段传下去，缺的交给 store 默认值（别把 dueTime 写成空串）。 */
  function taskPatch(s) {
    return {
      title: s.title,
      ...(s.note ? { note: s.note } : {}),
      ...(s.due ? { due: s.due } : {}),
      ...(s.dueTime ? { dueTime: s.dueTime } : {}),
      ...(s.quad ? { quad: s.quad } : {}),
      ...(s.estMin ? { estMin: s.estMin } : {}),
    };
  }

  /** 勾选的建议落库；返回一条可撤销的记录。 */
  function applySuggestions(list) {
    const record = { tasks: [], blocks: [], updates: [] };
    const errors = [];
    list.forEach((s) => {
      try {
        if (s.action === "create-task") {
          const t = tide.tasks.create(taskPatch(s));
          record.tasks.push(t.id);
        } else if (s.action === "create-block") {
          const r = tide.blocks.createSmart({
            title: s.title, date: s.date, start: s.start, durMin: s.durMin || 60, cat: s.cat || "work",
          });
          record.blocks.push(r.block.id);
          if (r.moved) s.movedTo = r.block.start;
        } else {
          const before = tide.tasks.list().find((t) => t.id === s.id);
          if (!before) throw new Error(`找不到任务 ${s.id}`);
          const patch = s.action === "done-task" ? { done: true }
            : ["title", "note", "due", "dueTime", "quad", "estMin"].reduce((acc, k) => {
              if (s[k] !== undefined) acc[k] = s[k];
              return acc;
            }, {});
          if (!Object.keys(patch).length) throw new Error("模型没给出要改的字段");
          const restore = Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]]));
          tide.tasks.update(s.id, patch);
          record.updates.push({ id: s.id, before: restore });
        }
        s.applied = true;
      } catch (e) {
        errors.push(`${s.title || s.id || s.action}：${e.message || e}`);
        s.reason = String(e.message || e).slice(0, 60);
      }
    });
    return { record, errors };
  }

  /** 撤销一次写入：新建的删掉，改过的还原成落库前那份字段值。 */
  function undoRecord(rec) {
    if (!rec) return;
    rec.tasks.forEach((id) => { try { tide.tasks.remove(id); } catch { /* 已被用户删掉 */ } });
    rec.blocks.forEach((id) => { try { tide.blocks.remove(id); } catch { /* 同上 */ } });
    rec.updates.forEach((u) => { try { tide.tasks.update(u.id, u.before); } catch { /* 同上 */ } });
    tide.notify("已撤销这次写入");
    refresh();
  }

  /* ───────────────────────── 发送 ───────────────────────── */

  function buildMessages() {
    const history = thread
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-SEND_TURNS)
      .map((m) => ({ role: m.role, content: m.text }));
    return [{ role: "system", content: systemPrompt() }].concat(history);
  }

  async function ask(question) {
    const q = String(question || "").trim();
    if (!q || busy) return;
    busy = true;
    thread.push({ role: "user", text: q, at: Date.now() });
    renderThread();
    paintBusy();
    try {
      await syncNotices();          // 发送前再并一次，刚推来的消息这一轮就能被问到
      const reply = await tide.ai.chat(buildMessages(), { temperature: 0.3 });
      const parsed = parseReply(reply);
      thread.push({ role: "assistant", text: parsed.body, at: Date.now(), suggestions: parsed.suggestions });
    } catch (e) {
      thread.push({ role: "error", text: String((e && e.message) || e), at: Date.now() });
    } finally {
      busy = false;
      paintBusy();
    }
    thread = thread.slice(-KEEP);
    tide.storage.set(THREAD_KEY, thread);
    renderThread();
  }

  /* ───────────────────────── 界面 ───────────────────────── */

  const CHIPS = [
    { label: "今天做什么", ask: "今天该做什么？按优先级一条条列出来，每条说清从哪一步开始。" },
    { label: "本周盘点", ask: "盘点一下现在这些任务：还欠着多少、哪些已经拖了很久、接下来最该先动哪个。" },
    { label: "拆掉拖延的", ask: "挑出明显被拖了很久的任务，各给一个不超过 30 分钟就能起步的下一步。" },
    { label: "处理逾期", ask: "逐条给出逾期任务的处理建议：改到哪一天、还是直接关掉，并说明理由。" },
    { label: "最近的通知", ask: "把最近收到的插件消息按「要办事 / 要知道 / 可忽略」分三类，各条说清是哪个来源推来的。" },
  ];

  function ensureStyle() {
    if (document.getElementById("ai-chat-style")) return;
    const st = document.createElement("style");
    st.id = "ai-chat-style";
    st.textContent = `
.aichat{height:100%;max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px;color:var(--ink,#22303A)}
.aichat-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.aichat-eyebrow{font-size:calc(11px * var(--ui-text-scale));letter-spacing:.3em;color:var(--ink-3,#A9B2BA);flex:1;min-width:120px}
.aichat-model{font-size:calc(11px * var(--ui-text-scale));color:var(--ink-2,#7E8B94);border:1px solid var(--line,#E4DFD6);border-radius:999px;padding:3px 10px;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aichat-chip{font-size:calc(11.5px * var(--ui-text-scale));border:1px solid var(--line,#E4DFD6);background:var(--panel,#fff);color:var(--ink-2,#7E8B94);border-radius:999px;padding:4px 11px;cursor:pointer;flex:none}
.aichat-chip.on{background:var(--deep,#0F4C5C);border-color:var(--deep,#0F4C5C);color:var(--on-deep,#fff);font-weight:600}
.aichat-log{flex:1;min-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 0}
.aichat-feed{font-size:calc(11px * var(--ui-text-scale));color:var(--ink-3,#A9B2BA);flex:none}
.aichat-empty{border:1px dashed var(--line,#E4DFD6);border-radius:14px;padding:18px;background:var(--panel,#fff)}
.aichat-empty b{display:block;font-size:calc(13.5px * var(--ui-text-scale));margin-bottom:6px}
.aichat-empty p{margin:0 0 10px;font-size:calc(12px * var(--ui-text-scale));line-height:1.7;color:var(--ink-2,#7E8B94)}
.aichat-msg{border-radius:14px;padding:10px 13px;font-size:calc(12.5px * var(--ui-text-scale));line-height:1.75}
.aichat-msg.user{align-self:flex-end;max-width:82%;background:var(--deep,#0F4C5C);color:var(--on-deep,#fff);border-bottom-right-radius:5px}
.aichat-msg.ai{align-self:stretch;background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-bottom-left-radius:5px}
.aichat-msg.err{align-self:stretch;background:color-mix(in srgb,var(--danger,#B03535) 7%,var(--panel,#fff));border:1px solid color-mix(in srgb,var(--danger,#B03535) 34%,var(--line,#E4DFD6));color:var(--danger,#B03535)}
.aichat-msg p{margin:0 0 6px}.aichat-msg p:last-child{margin-bottom:0}
.aichat-msg .gap{height:6px}
.aichat-msg ul{margin:0 0 6px;padding-left:18px}.aichat-msg li{margin:2px 0}
.aichat-msg code{background:var(--paper,#F7F6F2);border:1px solid var(--line,#E4DFD6);border-radius:5px;padding:0 4px}
.aichat-when{margin-top:6px;font-size:calc(10.5px * var(--ui-text-scale));color:var(--ink-3,#A9B2BA)}
.aichat-think{display:inline-flex;gap:5px;align-items:center;color:var(--ink-2,#7E8B94)}
.aichat-think i{width:6px;height:6px;border-radius:50%;background:var(--deep,#0F4C5C);animation:aichat-dot 1s infinite ease-in-out}
.aichat-think i:nth-child(2){animation-delay:.15s}.aichat-think i:nth-child(3){animation-delay:.3s}
@keyframes aichat-dot{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
.aichat-sug{margin-top:10px;border-top:1px dashed var(--line,#E4DFD6);padding-top:9px}
.aichat-sug-t{font-size:calc(11px * var(--ui-text-scale));letter-spacing:.14em;color:var(--ink-3,#A9B2BA);margin-bottom:6px}
.aichat-sug-row{display:flex;align-items:flex-start;gap:8px;padding:5px 0;font-size:calc(12px * var(--ui-text-scale));line-height:1.6}
.aichat-sug-row input{margin-top:3px;flex:none;accent-color:var(--deep,#0F4C5C)}
.aichat-sug-row .no{color:var(--danger,#B03535)}
.aichat-sug-row small{display:block;color:var(--ink-3,#A9B2BA)}
.aichat-sug-act{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.aichat-btn{height:32px;padding:0 14px;border-radius:9px;border:1px solid var(--line,#E4DFD6);background:var(--panel,#fff);color:var(--ink,#22303A);font-size:calc(12px * var(--ui-text-scale));cursor:pointer;flex:none}
.aichat-btn:hover{border-color:var(--deep,#0F4C5C);color:var(--deep,#0F4C5C)}
.aichat-btn.pri{background:var(--deep,#0F4C5C);border-color:var(--deep,#0F4C5C);color:var(--on-deep,#fff);font-weight:600}
.aichat-btn:disabled{opacity:.45;cursor:default}
.aichat-bar{display:flex;gap:8px;align-items:flex-end;flex:none;padding-top:2px}
.aichat-input{flex:1;min-width:0;resize:none;max-height:130px;min-height:40px;border:1px solid var(--line,#E4DFD6);border-radius:12px;padding:10px 12px;background:var(--panel,#fff);color:var(--ink,#22303A);font:inherit;font-size:calc(12.5px * var(--ui-text-scale));line-height:1.5}
.aichat-input:focus{outline:none;border-color:var(--deep,#0F4C5C)}
@media (max-width:640px){.aichat-msg.user{max-width:90%}.aichat{gap:8px}}
`;
    document.head.append(st);
  }

  function renderThread() {
    if (!ui) return;
    const log = ui.log;
    log.innerHTML = "";
    if (!thread.length) { log.append(node(emptyHtml())); wireEmpty(); }
    thread.forEach((m, idx) => { log.append(node(messageHtml(m, idx))); wireMessage(log.lastChild, m); });
    if (busy) {
      const t = node('<div class="aichat-msg ai"><span class="aichat-think"><i></i><i></i><i></i> 正在思考…</span></div>');
      log.append(t);
    }
    log.scrollTop = log.scrollHeight;
  }

  function emptyHtml() {
    if (!configured) {
      return `<div class="aichat-empty">
        <b>还没有配置模型</b>
        <p>AI 对话复用「设置 › AI 与自动任务」里的 Base URL、模型名与 API Key。填好并保存后回到这里就能直接问。</p>
        <button class="aichat-btn pri" data-go-ai>去配置模型</button>
      </div>`;
    }
    return `<div class="aichat-empty">
      <b>问点什么</b>
      <p>我会把你本机未完成的任务、近三天的时间块，以及其他插件推来的消息读成一份数据快照一起发过去，所以回答只依据你真实存在的事，不会凭空编。${withContext ? "" : "（当前已关闭「带本机数据」，只能问通用问题。）"}</p>
      <div class="aichat-sug-act">${CHIPS.map((c, i) => `<button class="aichat-btn" data-chip="${i}">${esc(c.label)}</button>`).join("")}</div>
    </div>`;
  }

  function messageHtml(m, idx) {
    const cls = m.role === "user" ? "user" : m.role === "error" ? "err" : "ai";
    const when = new Date(m.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const body = m.role === "error"
      ? `<p>这次没成功：${esc(m.text)}</p><div class="aichat-sug-act"><button class="aichat-btn" data-retry="${idx}">重试这一条</button></div>`
      : md(m.text);
    const sug = (!m.suggestions || !m.suggestions.length || m.role !== "assistant") ? "" : `
      <div class="aichat-sug">
        <div class="aichat-sug-t">整理出的改动 · 勾选后才写入</div>
        ${m.suggestions.map((s, i) => `
          <label class="aichat-sug-row">
            <input type="checkbox" data-sug="${i}" ${s.applied ? "disabled" : ""} ${s.checked && !s.applied ? "checked" : ""}>
            <span class="${s.reason ? "no" : ""}">${esc(describe(s))}
              ${s.reason ? `<small>${esc(s.reason)}</small>` : ""}
              ${s.applied ? "<small>已写入</small>" : ""}
              ${s.movedTo ? `<small>该时段冲突，已自动挪到 ${esc(s.movedTo)}</small>` : ""}
            </span>
          </label>`).join("")}
        <div class="aichat-sug-act"><button class="aichat-btn pri" data-apply="${idx}">写入所选</button></div>
      </div>`;
    return `<div class="aichat-msg ${cls}">${body}<div class="aichat-when">${when}</div>${sug}</div>`;
  }

  function wireEmpty() {
    const go = ui.log.querySelector("[data-go-ai]");
    if (go) go.onclick = () => window.dispatchEvent(new CustomEvent("tide:open-settings", { detail: { section: "ai" } }));
    ui.log.querySelectorAll("[data-chip]").forEach((btn) => {
      btn.onclick = () => ask(CHIPS[Number(btn.dataset.chip)].ask);
    });
  }

  function wireMessage(box, m) {
    const retry = box.querySelector("[data-retry]");
    if (retry) {
      retry.onclick = () => {
        const at = thread.indexOf(m);
        let qAt = at - 1;
        while (qAt >= 0 && thread[qAt].role !== "user") qAt -= 1;
        if (qAt < 0) { thread.splice(at, 1); renderThread(); return; }
        const question = thread[qAt].text;
        // 提问与错误一起摘掉再重发，否则重试一次就多一条重复提问。
        thread.splice(qAt, at - qAt + 1);
        ask(question);
      };
    }
    const apply = box.querySelector("[data-apply]");
    if (apply) {
      apply.onclick = () => {
        const picked = m.suggestions.filter((s) => s.checked && !s.applied && !s.reason);
        if (!picked.length) { tide.notify("没有可写入的条目（先勾掉有问题的再试）"); return; }
        const { record, errors } = applySuggestions(picked);
        tide.storage.set(THREAD_KEY, thread);
        renderThread();
        const n = record.tasks.length + record.blocks.length + record.updates.length;
        if (n) tide.notify(`已写入 ${n} 条${errors.length ? `，${errors.length} 条失败` : ""}`, { action: () => undoRecord(record), actionLabel: "撤销", ms: 10000 });
        else if (errors.length) tide.notify(`写入失败：${errors[0]}`);
        refresh();
      };
    }
    box.querySelectorAll("[data-sug]").forEach((cb) => {
      cb.onchange = () => { m.suggestions[Number(cb.dataset.sug)].checked = cb.checked; };
    });
  }

  function paintBusy() {
    if (!ui) return;
    ui.send.disabled = busy || !configured;
    ui.input.disabled = busy;
    renderThread();
  }

  function setContext(on) {
    withContext = on;
    tide.storage.set(CTX_KEY, on);
    ui.ctx.classList.toggle("on", on);
    ui.ctx.title = on ? "每次提问都会把本机任务与时间块一起发给模型" : "已关闭：只问通用问题，不上传本机数据";
    renderThread();
  }

  async function loadOnce() {
    if (loaded) return;
    const st = await tide.ai.status().catch(() => ({ configured: false }));
    configured = !!st?.configured;
    modelLabel = st?.model || "";
    withContext = await tide.storage.get(CTX_KEY, true) !== false;
    thread = await tide.storage.get(THREAD_KEY, []) || [];
    notices = (await tide.storage.get(NOTICE_KEY, [])) || [];
    loaded = true;
  }

  /** 头部那行「已收集 N 条」：让用户知道 AI 看得见的不只是自己的任务清单。 */
  function paintFeed() {
    if (!ui || !ui.feed) return;
    const sources = new Set(notices.map((m) => m.sourceName || m.source));
    ui.feed.textContent = notices.length
      ? `已收集 ${notices.length} 条插件消息 · 来自 ${sources.size} 个来源`
      : "还没收到其他插件的消息";
    ui.feed.title = notices.length
      ? "各消息类插件（门户 / 学习通 / 学校通知 / 竞赛 / RSS）推来的新消息，会随快照一起发给模型"
      : "消息类插件推出新东西时会自动抄收到这里，也可以直接问 AI「最近有什么通知」";
  }

  async function refresh() {
    const st = await tide.ai.status().catch(() => null);
    if (st) { configured = !!st.configured; modelLabel = st.model || ""; }
    if (ui) {
      ui.model.textContent = configured ? (modelLabel || "已配置模型") : "未配置模型";
      paintBusy();
    }
  }

  async function render(el2) {
    ensureStyle();
    await loadOnce();
    el2.innerHTML = "";
    ui = null;

    const root = node(`<div class="aichat">
      <div class="aichat-head">
        <span class="aichat-eyebrow">A I 对 话</span>
        <span class="aichat-model"></span>
        <button class="aichat-chip" data-ctx>带本机数据</button>
        <button class="aichat-chip" data-clear>新对话</button>
      </div>
      <div class="aichat-feed"></div>
      <div class="aichat-log"></div>
      <div class="aichat-bar">
        <textarea class="aichat-input" rows="1" placeholder="问点什么，例如：帮我把这周的事理一遍"></textarea>
        <button class="aichat-btn pri" data-send>发送</button>
      </div>
    </div>`).firstChild;
    el2.append(root);

    ui = {
      log: root.querySelector(".aichat-log"),
      input: root.querySelector(".aichat-input"),
      send: root.querySelector("[data-send]"),
      model: root.querySelector(".aichat-model"),
      feed: root.querySelector(".aichat-feed"),
      ctx: root.querySelector("[data-ctx]"),
      clear: root.querySelector("[data-clear]"),
    };
    ui.model.textContent = configured ? (modelLabel || "已配置模型") : "未配置模型";
    ui.ctx.classList.toggle("on", withContext);
    ui.ctx.onclick = () => setContext(!withContext);
    ui.clear.onclick = () => {
      thread = [];
      tide.storage.set(THREAD_KEY, thread);
      renderThread();
      tide.notify("已开新对话（之前的记录不再带给模型）");
    };
    const send = () => {
      const q = ui.input.value.trim();
      if (!q) return;
      ui.input.value = "";
      ui.input.style.height = "auto";
      ask(q);
    };
    ui.send.onclick = send;
    ui.input.oninput = () => {
      ui.input.style.height = "auto";
      ui.input.style.height = `${Math.min(130, ui.input.scrollHeight)}px`;
    };
    // 中文输入法回车是在选词，不能当发送；Shift+Enter 留作换行。
    ui.input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    };
    paintBusy();
    paintFeed();
    // 进页面先抄一次：消息类插件多半在启动阶段就广播完了，晚加载的这一轮才补得回来。
    syncNotices().then(() => { paintFeed(); renderThread(); });
    return () => { ui = null; };
  }

  tide.ui.registerView({ id: VIEW_ID, title: "AI 对话", icon: "robot", render });
})();
