// 轮换值日 —— 内置插件：把「按成员顺序轮换」的公共事务（宿舍值日 / 公区卫生 / 打水…）
// 排成多套互相独立的轮换，到点提醒当班的人。
//
// 四个建模决定（改之前先读）：
//   · **一个插件里放多套轮换**（`groups`）：每套各有成员、周期、起始日、换人记录与提醒设置。
//     互不影响 —— A 组临时换人不改 B 组排班，A 组的提醒时刻与 B 组无关。宿舍和公区就是典型的两套。
//   · 用「轮次」而不是「每天算一个人」：起始日按周期切段，一段一人。这样「每周轮换」的整周都显示
//     同一个人，提醒也只在每段第一天触发一次 —— 否则会天天催人。
//   · 临时换人按**轮次起始日**记 override，一次换人管一整轮（周期 = 1 时就是当天）。
//   · 提醒靠自己的 setInterval（宿主没有「定时回调」API）。要扛住宿主两个行为：
//       ① 停用再启用会**重新执行整个模块**，旧实例的 interval 还活着 → 用 storage 里的「代号」
//          让旧实例发现被顶掉后自己 clearInterval 退出，否则会双份提醒；
//       ② 停用（不重启用）只摘注册、interval 仍在 → tick 里查侧栏里本插件入口还在不在，不在就自杀。
//
// 存储（`dorm-duty` 命名空间）：
//   groups   : [{ id, name, startDate, periodDays, remindEnabled, remindTime, sound,
//                 members, removed, overrides, lastNotified }]
//   activeId : 界面当前选中的那套轮换
//   gen      : 实例代号（防双份提醒）
// 旧版（单套轮换）把数据平铺在 members / config / overrides / removed / lastNotified 上，
// 这里首次加载时自动迁移成一组。**旧键留着不删**：删了就没法回退到旧版本。
// 注意旧键迁移后不会再被写入 —— 旧版本客户端读到的是迁移前的快照，请用新版本。
(function () {
  const DAY_MS = 86400000;
  const WEEK_CN = ["日", "一", "二", "三", "四", "五", "六"];
  const VIEW_ID = "dorm-duty";
  const UPCOMING = 6;                 // 首页展示的后续轮次数量
  const REMOVED_KEEP = 12;            // 「已移除」可恢复名单上限
  const GROUP_MAX = 12;               // 最多几套轮换（防病态数据把界面撑爆）
  const NAME_MAX = 12;                // 轮换名（宿舍值日 / 公区卫生）
  const MEMBER_MAX = 16;              // 成员名
  const DEFAULT_GROUP_NAME = "值日";
  const PERIOD_CHIPS = [1, 3, 7, 14];
  const PERIOD_LABEL = { 1: "每天", 3: "每 3 天", 7: "每周", 14: "每两周" };

  const state = {
    groups: [],       // 多套轮换；顺序即界面上标签的顺序
    activeId: "",     // 当前选中的那套
    soundPresets: [], // 宿主音效目录（只取一次，供下拉用）
    timer: null,
    gen: 0,
    busy: false,
  };
  let root = null;
  let MY_GEN = 0;

  /* ── 日期助手：一律用 UTC 零点算差值，避开时区与夏令时偏移（与 cn-holiday 同款） ── */
  const toUTC = (s) => { const [y, m, d] = String(s).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
  const addDays = (s, n) => fromUTC(toUTC(s) + n * DAY_MS);
  const diffDays = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(toUTC(s));
  const weekday = (s) => `周${WEEK_CN[new Date(toUTC(s)).getUTCDay()]}`;
  const fmt = (s) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const faIcon = (name) => `<svg class="dd-ico" viewBox="0 0 512 512" aria-hidden="true"><use href="/icons/fontawesome/solid.svg#${name}"></use></svg>`;
  /** 二次确认。宿主把插件代码跑在主窗口里（`new Function("tide", …)`），所以 window.confirm 可用；
      单测沙箱里没有 window，退回「允许」—— 那种环境没有用户点得到，由测试自己塞 window 桩。 */
  const confirmFn = (msg) => {
    try {
      if (typeof window !== "undefined" && typeof window.confirm === "function") return window.confirm(msg);
    } catch { /* 忽略：确认框本身不该把删除流程卡死 */ }
    return true;
  };

  /* ── 归一化：数据损坏不能把插件变成白屏，一律退回可用默认值 ── */
  /** 合法时刻 → "HH:MM"；非法返回 null。
      只校验 /^\d{2}:\d{2}$/ 是不够的："25:99" 能过格式校验，但它换算成分钟是 1599，
      超过一天的最大值 1439 —— 于是 tick() 里「now < 到点」永远成立，提醒被**静默关掉**
      （不报错、不提示，最难查的一类失效）。时 0–23、分 0–59 必须真校验。 */
  function normalizeTime(v) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? "" : v).trim());
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (!(h >= 0 && h <= 23) || !(mi >= 0 && mi <= 59)) return null;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  /** 成员 / 已移除名单：丢掉没有 id 的脏数据（否则「移除某人」会命中 undefined）。 */
  function normalizeMembers(raw) {
    return Array.isArray(raw)
      ? raw.filter((m) => m && m.id)
        .map((m) => ({ id: String(m.id), name: String(m.name || "").slice(0, MEMBER_MAX).trim() || "未命名" }))
      : [];
  }
  /** 一套轮换的默认值。 */
  function defaultGroup(today, name) {
    return {
      id: uid("g"),
      name: String(name || "").trim().slice(0, NAME_MAX) || DEFAULT_GROUP_NAME,
      startDate: validDate(today) ? today : tide.util.today(),
      periodDays: 7,
      remindEnabled: true,
      remindTime: "08:00",
      sound: "beep",
      members: [],
      removed: [],
      overrides: {},
      lastNotified: "",
    };
  }
  /** 归一化一组。未识别的键原样保留 —— 别端（小程序）不展示 sound，但也不能把它抹掉。 */
  function normalizeGroup(raw, today) {
    const base = defaultGroup(today, null);
    const g = { ...base, ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) };
    g.id = String(g.id || "").trim() || base.id;
    g.name = String(g.name || "").trim().slice(0, NAME_MAX) || DEFAULT_GROUP_NAME;
    if (!validDate(g.startDate)) g.startDate = base.startDate;
    g.periodDays = Math.min(365, Math.max(1, Math.round(Number(g.periodDays) || 7)));
    g.remindTime = normalizeTime(g.remindTime) || "08:00";
    g.remindEnabled = g.remindEnabled !== false;
    g.sound = String(g.sound || "beep");
    g.members = normalizeMembers(g.members);
    g.removed = normalizeMembers(g.removed).slice(0, REMOVED_KEEP);
    g.overrides = g.overrides && typeof g.overrides === "object" && !Array.isArray(g.overrides) ? { ...g.overrides } : {};
    g.lastNotified = String(g.lastNotified || "");
    return g;
  }
  /** 归一化整份组列表。重复 id 会让「切换轮换」指错对象，必须剔掉。 */
  function normalizeGroups(raw, today) {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(raw) ? raw : []) {
      if (out.length >= GROUP_MAX) break;
      const g = normalizeGroup(item, today);
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push(g);
    }
    return out;
  }
  /** 旧版单套轮换 → 一组。没有任何旧数据时返回空数组（由 load() 决定要不要建默认组）。 */
  function migrateLegacy(legacy, today) {
    const L = legacy && typeof legacy === "object" ? legacy : {};
    const hasAny = (Array.isArray(L.members) && L.members.length > 0)
      || !!L.config
      || !!L.lastNotified
      || (L.overrides && typeof L.overrides === "object" && Object.keys(L.overrides).length > 0);
    if (!hasAny) return [];
    const cfg = L.config && typeof L.config === "object" ? L.config : {};
    return [normalizeGroup({
      name: cfg.dutyName,
      startDate: cfg.startDate,
      periodDays: cfg.periodDays,
      remindEnabled: cfg.remindEnabled,
      remindTime: cfg.remindTime,
      sound: cfg.sound,
      members: L.members,
      removed: L.removed,
      overrides: L.overrides,
      lastNotified: L.lastNotified,
    }, today)];
  }

  /* ── 存储 ── */
  /** 宿主音效目录。真宿主的 `presets()` 是**同步**返回数组（见 src/pluginHost.js），
      这里用 Promise.resolve 兼容同步 / 异步两种实现，再滤掉形状不对的条目 ——
      目录读坏了最多是下拉少几项，不该把整页画崩（与番茄专注同一套写法）。 */
  async function loadSoundPresets() {
    try {
      const list = await Promise.resolve(tide.sound.presets());
      return (Array.isArray(list) ? list : [])
        .filter((p) => p && p.id)
        .map((p) => ({ id: String(p.id), label: String(p.label || p.id) }));
    } catch { return []; }
  }
  async function load() {
    const today = tide.util.today();
    const [groups, activeId, legacyMembers, legacyConfig, legacyOverrides, legacyRemoved, legacyLast, gen] = await Promise.all([
      tide.storage.get("groups", null),
      tide.storage.get("activeId", ""),
      tide.storage.get("members", null),
      tide.storage.get("config", null),
      tide.storage.get("overrides", null),
      tide.storage.get("removed", null),
      tide.storage.get("lastNotified", null),
      tide.storage.get("gen", 0),
    ]);
    let list = normalizeGroups(groups, today);
    let needPersist = false;
    // 只有「新版数据完全不存在」时才看旧键：groups 一旦存在就说明已经迁移过，
    // 不能再被旧快照（旧版本客户端写的）盖回去。
    if (!groups) {
      const migrated = migrateLegacy({ members: legacyMembers, config: legacyConfig, overrides: legacyOverrides, removed: legacyRemoved, lastNotified: legacyLast }, today);
      if (migrated.length) { list = migrated; needPersist = true; }
    }
    if (!list.length) { list = [defaultGroup(today, null)]; needPersist = true; }
    state.groups = list;
    state.activeId = list.some((g) => g.id === activeId) ? String(activeId) : list[0].id;
    state.gen = Number(gen) || 0;
    // 迁移 / 兜底建组要立刻落盘：不写的话「已迁移」和「未迁移」在存储上分不出来，
    // 每次 load 都会重新生成一个随机 id 的默认组，用户在那上面做的设置下一次就没了。
    if (needPersist) await save();
    // 音效目录只在首次（或上次读空）时取一次，不必每次 tick 都问宿主
    if (!state.soundPresets.length) state.soundPresets = await loadSoundPresets();
  }
  async function save() {
    await Promise.all([
      tide.storage.set("groups", state.groups),
      tide.storage.set("activeId", state.activeId),
    ]);
  }

  const activeGroup = () => state.groups.find((g) => g.id === state.activeId) || state.groups[0] || null;
  const periodOf = (g) => Math.max(1, Math.round(Number(g && g.periodDays) || 1));

  /* ── 轮换计算（纯函数：只吃传入的那一组，可被探针在任意「今天」下复算） ── */
  /** 某天落在哪一轮：返回该轮起始日；起始日之前返回 null（轮换还没开始）。 */
  function cycleStartOf(g, date) {
    const start = g && g.startDate;
    if (!validDate(start) || !validDate(date)) return null;
    const diff = diffDays(start, date);
    if (diff < 0) return null;
    const p = periodOf(g);
    return addDays(start, Math.floor(diff / p) * p);
  }
  /** 轮次序号（从 0 起）。 */
  const cycleIndexAt = (g, cycleStart) => Math.round(diffDays(g.startDate, cycleStart) / periodOf(g));
  /** 某一轮的换人是否**真的生效**：override 指向的人必须还在名单里。
      指向已被移除的人时不算换人 —— 否则界面会显示「已换人 · 原 X」而实际当班的就是 X。 */
  function overrideHit(g, cycleStart) {
    const id = cycleStart ? (g.overrides || {})[cycleStart] : "";
    if (!id) return null;
    return g.members.find((m) => m.id === id) || null;
  }
  /** 某天的当班人：没成员 / 没开始 → null；有临时换人 → 换的人。 */
  function assigneeFor(g, date) {
    const cycle = cycleStartOf(g, date);
    if (!cycle || !g.members.length) return null;
    return overrideHit(g, cycle) || g.members[cycleIndexAt(g, cycle) % g.members.length];
  }
  const isCycleStartDay = (g, date) => cycleStartOf(g, date) === date;
  /** 某组此刻是否该提醒。纯函数 —— 任意「今天 / 当前分钟」都能真跑。
      五个条件缺一不可：开着提醒 + 有成员 + 今天是本轮第一天 + 已过设定时刻 + 这一轮还没提醒过。 */
  function reminderDue(g, today, nowMinutes) {
    if (!g.remindEnabled || !g.members.length) return false;
    if (!isCycleStartDay(g, today)) return false;
    if (g.lastNotified === today) return false;
    const [h, m] = String(g.remindTime).split(":").map(Number);
    return nowMinutes >= h * 60 + m;
  }

  /* ── 定时提醒 ── */
  function stopTimer() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }
  function startTimer() {
    stopTimer();
    state.timer = setInterval(tick, 60 * 1000);
  }
  /** 宿主停用插件时只摘注册，本实例的 interval 还活着 —— 拿侧栏入口在不在当判据。
      启动早期导航还没渲染（没有 nav.nav）时不算停用，避免误自杀。 */
  function navEntryAlive() {
    try {
      const nav = document.querySelector("nav.nav");
      if (!nav) return true;
      return !!nav.querySelector(`[data-view="plug:${VIEW_ID}"]`);
    } catch { return true; }
  }
  async function tick() {
    if (state.busy) return;
    state.busy = true;
    try {
      await load();                                  // 每次全量重读：设置改动立刻生效
      if (state.gen !== MY_GEN) return stopTimer();  // 本实例被重新加载过（停用再启用）→ 退出
      if (!navEntryAlive()) return stopTimer();      // 插件已停用 → 入口消失 → 退出
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const today = tide.util.today();
      // 逐组判断：每套轮换有各自的周期、提醒时刻与「已提醒」记录，互不干扰。
      const due = state.groups.filter((g) => reminderDue(g, today, nowMinutes) && assigneeFor(g, today));
      if (!due.length) return;
      // 先落盘再提醒：万一还有旧实例同时 tick，也只有一个能抢到写入
      for (const g of due) g.lastNotified = today;
      await tide.storage.set("groups", state.groups);
      for (const g of due) {
        const who = assigneeFor(g, today);
        tide.notify(`「${g.name}」今天轮到 ${who.name}`, {
          actionLabel: "查看",
          action: () => tide.util.navigate(`plug:${VIEW_ID}`),
        });
      }
      // 同一次 tick 里多组同时到点时只响一声 —— 叠着播会糊成一片噪音
      playSound(due[0].sound);
    } catch (e) {
      console.warn("dorm-duty: 提醒检查失败", e);
    } finally {
      state.busy = false;
    }
  }
  function playSound(sound) {
    try { tide.sound.play({ sound }); } catch (e) { console.warn("dorm-duty: 提示音播放失败", e); }
  }

  /* ── 样式：配色一律走主题变量，深色模式下自动跟随 ── */
  function ensureStyle() {
    if (document.getElementById("dorm-duty-style")) return;
    const st = document.createElement("style");
    st.id = "dorm-duty-style";
    st.textContent = `
      .dd-wrap{max-width:900px;margin:0 auto;padding-bottom:28px;color:var(--ink,#22303A)}
      .dd-groups{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:12px 0 4px}
      .dd-glist{display:flex;gap:7px;flex-wrap:wrap;min-width:0}
      .dd-gchip{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line,#DCD6CB);background:var(--panel,#fff);cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--ink-2,#59656D);max-width:100%}
      .dd-gchip:hover{border-color:color-mix(in srgb,var(--deep,#0F4C5C) 42%,var(--line,#DCD6CB))}
      .dd-gchip.on{background:var(--deep,#0F4C5C);border-color:var(--deep,#0F4C5C);color:var(--on-deep,#fff)}
      .dd-gchip .dd-gwho{font-style:normal;font-size:11px;opacity:.72}
      .dd-hero{display:grid;grid-template-columns:1.35fr .65fr;gap:14px;margin:12px 0 14px}
      .dd-card{background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-radius:18px;padding:20px 22px}
      .dd-kicker{font-size:10px;color:var(--ink-3,#8B979F);letter-spacing:.24em;text-transform:uppercase;margin-bottom:8px}
      .dd-title{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:750;margin-bottom:12px}
      .dd-ico{width:14px;height:14px;flex:none;fill:currentColor;color:var(--deep,#0F4C5C)}
      .dd-who{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .dd-who b{font-size:30px;font-weight:800;letter-spacing:.01em}
      .dd-badge{font-size:10.5px;font-weight:700;border-radius:999px;padding:4px 9px;background:color-mix(in srgb,var(--mint,#2ec4b6) 14%,var(--panel,#fff));color:var(--deep,#176C60)}
      .dd-badge.warn{background:color-mix(in srgb,var(--sun,#e3a008) 16%,var(--panel,#fff));color:var(--ink,#8A5A10)}
      .dd-range{font-size:12px;color:var(--ink-2,#7E8B94);line-height:1.8;margin-top:8px}
      .dd-big{font-size:22px;font-weight:750;margin:6px 0}
      .dd-big em{font-style:normal;color:var(--deep,#0F4C5C);font-size:30px;margin-right:3px}
      .dd-muted{font-size:12px;color:var(--ink-2,#7E8B94);line-height:1.75}
      .dd-note{font-size:11px;color:var(--ink-3,#A1A9AF);line-height:1.7;margin-top:9px}
      .dd-err{color:#B34747}
      .dd-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
      .dd-btn{height:34px;border-radius:9px;border:1px solid var(--line,#DCD6CB);background:var(--panel,#fff);padding:0 13px;cursor:pointer;font-size:12px;font-family:inherit;color:var(--ink,#22303A);display:inline-flex;align-items:center;gap:6px}
      .dd-btn.pri{background:var(--deep,#0F4C5C);border-color:var(--deep,#0F4C5C);color:var(--on-deep,#fff)}
      .dd-btn.pri .dd-ico{color:var(--on-deep,#fff)}
      .dd-btn.danger{color:var(--coral,#D64545);border-color:color-mix(in srgb,var(--coral,#D64545) 38%,var(--line,#DCD6CB))}
      .dd-btn:disabled{opacity:.45;cursor:not-allowed}
      .dd-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .dd-list{background:var(--panel,#fff);border:1px solid var(--line,#E4DFD6);border-radius:18px;overflow:hidden}
      /* 列宽：轮次名固定宽（各行才对得齐）→ 日期取内容宽 → 标签吃掉剩余空间并靠右。
         曾经写成 150px 1fr auto，日期落在 1fr 里 —— 「10月12日 — 10月18日 · 周一」
         这种最长的串会被挤成两行（实测 1280 宽下折了 2 行）。日期是固定格式的短串，
         不该折行，把弹性让给右侧的标签列。 */
      .dd-row{display:grid;grid-template-columns:96px auto 1fr;gap:12px;align-items:center;padding:13px 17px;border-bottom:1px solid var(--line-soft,#F0ECE5)}
      .dd-row:last-child{border-bottom:0}
      .dd-row b{font-size:13px}
      .dd-row .dd-d{font-size:12px;color:var(--ink-2,#687780);white-space:nowrap}
      .dd-tag{font-size:11px;border-radius:999px;padding:4px 9px;background:color-mix(in srgb,var(--mint,#2ec4b6) 10%,var(--panel,#fff));color:var(--deep,#0F4C5C);white-space:nowrap;justify-self:end}
      .dd-row.now{background:color-mix(in srgb,var(--deep,#0F4C5C) 5%,var(--panel,#fff))}
      .dd-row.past b,.dd-row.past .dd-d{color:var(--ink-3,#A9B2BA)}
      .dd-mrow{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line-soft,#F0ECE5)}
      .dd-mrow:last-child{border-bottom:0}
      .dd-mno{font-size:11px;color:var(--ink-3,#A1A9AF);text-align:center;font-variant-numeric:tabular-nums}
      .dd-in{height:34px;border:1px solid var(--line,#DDD7CD);border-radius:9px;padding:0 10px;background:var(--panel,#fff);color:var(--ink,#22303A);font:inherit;font-size:13px;min-width:0;width:100%}
      .dd-in:focus{outline:2px solid color-mix(in srgb,var(--deep,#0F4C5C) 18%,transparent);border-color:var(--deep,#0F4C5C)}
      .dd-mbtns{display:flex;gap:5px;flex:none}
      .dd-mini{height:32px;min-width:32px;padding:0 9px;border-radius:8px;border:1px solid var(--line,#DCD6CB);background:var(--panel,#fff);cursor:pointer;font-size:12px;font-family:inherit;color:var(--ink-2,#59656D)}
      .dd-mini:hover{border-color:color-mix(in srgb,var(--deep,#0F4C5C) 42%,var(--line,#DCD6CB));color:var(--deep,#0F4C5C)}
      .dd-mini.danger:hover{border-color:var(--coral,#D64545);color:var(--coral,#D64545)}
      .dd-mini:disabled{opacity:.4;cursor:not-allowed}
      .dd-add{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
      .dd-add .dd-in{flex:1;min-width:140px}
      .dd-chips{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .dd-chip{height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line,#DCD6CB);background:var(--panel,#fff);cursor:pointer;font-size:12px;font-family:inherit;color:var(--ink-2,#59656D)}
      .dd-chip.on{background:var(--deep,#0F4C5C);border-color:var(--deep,#0F4C5C);color:var(--on-deep,#fff)}
      .dd-field{display:grid;grid-template-columns:104px 1fr;gap:10px;align-items:center;padding:8px 0}
      .dd-field > span{font-size:12px;color:var(--ink-2,#7E8B94)}
      .dd-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .dd-num{width:76px}
      .dd-switch-row{display:flex;align-items:center;gap:10px}
      .dd-switch-row label{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink,#22303A);cursor:pointer}
      .dd-removed{margin-top:12px;border-top:1px dashed var(--line,#E4DFD6);padding-top:10px}
      .dd-removed-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-2,#7E8B94)}
      @media(max-width:720px){
        .dd-hero,.dd-grid{grid-template-columns:1fr}
        .dd-card{padding:17px}
        .dd-who b{font-size:25px}
        .dd-groups{margin-top:8px}
        /* 显式定位，别靠自动排布：DOM 顺序是 b → .dd-d → .dd-tag，
           而 .dd-d 要跨满整行，自动排布就会把 .dd-tag 挤到下一行的第 1 列，
           1fr 列让它撑成整行横幅（实测截图里「小北 · 4 天后」被拉满一整行）。 */
        .dd-row{grid-template-columns:1fr auto;gap:6px 10px;padding:12px}
        .dd-row > b{grid-column:1;grid-row:1}
        .dd-row > .dd-tag{grid-column:2;grid-row:1;justify-self:end;white-space:nowrap}
        .dd-row > .dd-d{grid-column:1/-1;grid-row:2}
        .dd-mrow{grid-template-columns:22px 1fr;gap:6px 8px}
        .dd-mbtns{grid-column:2;justify-content:flex-end}
        .dd-field{grid-template-columns:1fr;gap:6px}
      }
    `;
    document.head.append(st);
  }

  /* ── 组装页面数据 ── */
  function snapshot(g) {
    const today = tide.util.today();
    const p = periodOf(g);
    const cycle = cycleStartOf(g, today);
    const started = !!cycle;
    const current = assigneeFor(g, today);
    const nextStart = cycle ? addDays(cycle, p) : (validDate(g.startDate) ? g.startDate : null);
    const rows = [];
    for (let i = 0; i < UPCOMING && nextStart; i++) {
      const start = addDays(nextStart, i * p);
      rows.push({
        start,
        end: addDays(start, p - 1),
        who: assigneeFor(g, start),
        index: cycleIndexAt(g, start) + 1,
        daysUntil: diffDays(today, start),
        swapped: !!overrideHit(g, start),
      });
    }
    return { g, today, cycle, started, current, nextStart, nextWho: nextStart ? assigneeFor(g, nextStart) : null, rows, period: p };
  }
  const relLabel = (n) => (n === 0 ? "今天" : n === 1 ? "明天" : n > 0 ? `${n} 天后` : `${-n} 天前`);
  /** 「下次换人」大数字：没开始的阶段说的是「开始」而不是「换人」。 */
  function nextBigText(s) {
    const d = diffDays(s.today, s.nextStart);
    const verb = s.started ? "换人" : "开始";
    if (d <= 0) return `<em>今天</em>${verb}`;
    if (d === 1) return `<em>明天</em>${verb}`;
    return `<em>${d}</em>天后${verb}`;
  }

  /** 顶部轮换切换条：每套轮换一个标签，顺手带上它今天当班的人（一眼看全所有轮换）。 */
  function groupChipsHtml() {
    return state.groups.map((g) => {
      const who = assigneeFor(g, tide.util.today());
      const on = g.id === state.activeId;
      return `<button class="dd-gchip${on ? " on" : ""}" data-group="${esc(g.id)}" type="button" aria-pressed="${on ? "true" : "false"}" title="切到「${esc(g.name)}」">
        <span>${esc(g.name)}</span><em class="dd-gwho">${esc(who ? who.name : "未排班")}</em>
      </button>`;
    }).join("");
  }

  function heroHtml(s) {
    const g = s.g;
    const kicker = `${esc(g.name)} · ${PERIOD_LABEL[s.period] || `每 ${s.period} 天`}一轮`;
    if (!g.members.length) {
      return `<div class="dd-kicker">${kicker}</div>
        <div class="dd-who"><b>先添加成员</b></div>
        <div class="dd-range">在下面的「成员」里按顺序填写名字，第一个人先当班；<br>之后按你设定的周期自动轮换，到点会提醒当班的人。</div>`;
    }
    if (!s.started) {
      return `<div class="dd-kicker">${kicker}</div>
        <div class="dd-who"><b>轮换还没开始</b><span class="dd-badge warn">未开始</span></div>
        <div class="dd-range">将于 <b>${fmt(g.startDate)}（${weekday(g.startDate)}）</b> 开始，第一位是 <b>${esc(s.rows[0]?.who?.name || "—")}</b>。<br>想从今天开始就把下面的「起始日期」改成今天。</div>`;
    }
    const onSwitch = s.cycle === s.today;
    // 「已换人 · 原 X」里的 X 是**正常轮换本该当班的人**，不是换上去的那个 ——
    // overrideHit() 返回的是替补，别直接拿来当「原」。
    const normal = s.cycle ? g.members[cycleIndexAt(g, s.cycle) % g.members.length] : null;
    const rangeEnd = addDays(s.cycle, s.period - 1);
    return `<div class="dd-kicker">${kicker}</div>
      <div class="dd-who"><b>${esc(s.current?.name || "—")}</b>${onSwitch ? '<span class="dd-badge">今天换人</span>' : ""}${overrideHit(g, s.cycle) ? `<span class="dd-badge warn">已换人 · 原 ${esc(normal?.name || "—")}</span>` : ""}</div>
      <div class="dd-range">本轮 ${fmt(s.cycle)}${s.period > 1 ? ` — ${fmt(rangeEnd)}` : `（${weekday(s.cycle)}）`}${s.period > 1 ? ` · ${weekday(s.cycle)}起` : ""} · 第 ${cycleIndexAt(g, s.cycle) + 1} 轮</div>`;
  }

  function swapHtml(s) {
    const g = s.g;
    if (!g.members.length) return "";
    const key = s.cycle || g.startDate;
    const hasOverride = !!overrideHit(g, s.cycle);
    const options = g.members.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("");
    return `<div class="dd-field"><span>本轮换人</span>
      <div class="dd-inline">
        <select class="dd-in" data-swap style="max-width:150px" aria-label="选择本轮代班的人">${options}</select>
        <button class="dd-btn" data-swap-apply type="button">换成他</button>
        ${hasOverride ? '<button class="dd-btn" data-swap-clear type="button">撤销换人</button>' : ""}
      </div>
    </div>`;
  }

  function rowsHtml(s) {
    const g = s.g;
    if (!g.members.length) return `<div class="dd-row"><span class="dd-d">还没有成员，添加后会自动排班。</span></div>`;
    if (!s.rows.length) return `<div class="dd-row"><span class="dd-d">还没有可排的轮次。</span></div>`;
    return s.rows.map((r) => `<div class="dd-row${r.daysUntil === 0 ? " now" : ""}">
      <b>${r.daysUntil === 0 ? "本轮" : `第 ${r.index} 轮`}</b>
      <span class="dd-d">${s.period > 1 ? `${fmt(r.start)} — ${fmt(r.end)} · ${weekday(r.start)}起` : `${fmt(r.start)}（${weekday(r.start)}）`}</span>
      <span class="dd-tag">${esc(r.who?.name || "—")}${r.swapped ? " · 换人" : ""} · ${relLabel(r.daysUntil)}</span>
    </div>`).join("");
  }

  function membersHtml(g) {
    if (!g.members.length) return `<div class="dd-muted">还没有成员。按你填写的顺序轮换，第一个人先当班。</div>`;
    return g.members.map((m, i) => `<div class="dd-mrow" data-id="${esc(m.id)}">
      <span class="dd-mno">${i + 1}</span>
      <input class="dd-in" data-name value="${esc(m.name)}" maxlength="${MEMBER_MAX}" aria-label="第 ${i + 1} 位成员的名字">
      <span class="dd-mbtns">
        <button class="dd-mini" data-up type="button" ${i === 0 ? "disabled" : ""} title="往前排（更早当班）" aria-label="把 ${esc(m.name)} 往前排">↑</button>
        <button class="dd-mini" data-down type="button" ${i === g.members.length - 1 ? "disabled" : ""} title="往后排" aria-label="把 ${esc(m.name)} 往后排">↓</button>
        <button class="dd-mini danger" data-del type="button" title="从轮换里移除（可在下方恢复）" aria-label="移除 ${esc(m.name)}">移除</button>
      </span>
    </div>`).join("");
  }

  function removedHtml(g) {
    if (!g.removed.length) return "";
    const names = g.removed.map((m) => esc(m.name)).join("、");
    return `<div class="dd-removed"><div class="dd-removed-row">
      <span>已移除：${names}</span>
      <button class="dd-btn" data-restore type="button">恢复已移除（${g.removed.length}）</button>
    </div><div class="dd-note">恢复会加回轮换末尾，不改动已经过去的轮次。</div></div>`;
  }

  function rulesHtml(s) {
    const g = s.g;
    const custom = !PERIOD_CHIPS.includes(s.period);
    const lastOne = state.groups.length <= 1;
    return `<div class="dd-field"><span>轮换名称</span>
        <input class="dd-in" data-group-name value="${esc(g.name)}" maxlength="${NAME_MAX}" placeholder="宿舍值日 / 公区卫生 / 打水">
      </div>
      <div class="dd-field"><span>起始日期</span>
        <div class="dd-inline">
          <input class="dd-in" data-start type="date" value="${esc(g.startDate)}" style="max-width:170px" aria-label="轮换起始日期">
          <button class="dd-mini" data-start-today type="button">今天</button>
        </div>
      </div>
      <div class="dd-field"><span>轮换周期</span>
        <div class="dd-chips">
          ${PERIOD_CHIPS.map((p) => `<button class="dd-chip${p === s.period ? " on" : ""}" data-period="${p}" type="button">${PERIOD_LABEL[p]}</button>`).join("")}
          <input class="dd-in dd-num" data-period-custom type="number" min="1" max="365" value="${custom ? s.period : ""}" placeholder="N" aria-label="自定义周期天数">
          <span class="dd-muted">天一轮</span>
        </div>
      </div>
      <div class="dd-note">起始日期就是「第一个人开始当班」的那天；改周期不会打乱已经排好的顺序。<br>每套轮换各自独立 —— 这里的成员、周期、换人与提醒都只影响「${esc(g.name)}」。</div>
      <div class="dd-actions">
        <button class="dd-btn danger" data-group-del type="button"${lastOne ? " disabled" : ""} title="${lastOne ? "至少要留一套轮换" : `删除「${esc(g.name)}」`}">${faIcon("trash")}删除这个轮换</button>
      </div>`;
  }

  function remindHtml(s) {
    const g = s.g;
    const opts = state.soundPresets
      .map((p) => `<option value="${esc(p.id)}"${p.id === g.sound ? " selected" : ""}>${esc(p.label)}</option>`)
      .join("");
    return `<div class="dd-field"><span>提醒</span>
        <span class="dd-switch-row"><label><input class="switch" role="switch" type="checkbox" data-remind${g.remindEnabled ? " checked" : ""} aria-label="开启轮换提醒">每轮第一天提醒当班的人</label></span>
      </div>
      <div class="dd-field"><span>提醒时刻</span>
        <div class="dd-inline"><input class="dd-in" data-time type="time" value="${esc(g.remindTime)}" style="max-width:140px" aria-label="提醒时刻">
        <button class="dd-btn" data-test type="button">试一下</button></div>
      </div>
      <div class="dd-field"><span>提示音</span>
        <div class="dd-inline">
          <select class="dd-in" data-sound style="max-width:170px" aria-label="提示音">${opts || '<option value="beep">默认提示音</option>'}</select>
          <button class="dd-btn" data-sound-try type="button">试听</button>
        </div>
      </div>
      <div class="dd-note">只在每轮的第一天提醒一次（周期 = 1 就是每天），不会天天催。<br>当天没打开应用、之后才打开时会补提醒一次；提醒依赖应用在运行（与「任务提醒」同一套通道）。</div>`;
  }

  async function paint() {
    if (!root) return;
    ensureStyle();
    const g = activeGroup();
    if (!g) return;
    const s = snapshot(g);
    root.innerHTML = `<div class="dd-wrap">
      <div class="dd-groups">
        <div class="dd-glist" role="tablist" aria-label="轮换列表">${groupChipsHtml()}</div>
        <button class="dd-btn" data-group-new type="button">${faIcon("circle-plus")}新建轮换</button>
      </div>
      <div class="dd-hero">
        <section class="dd-card">${heroHtml(s)}
          <div class="dd-actions">
            <button class="dd-btn pri" data-task type="button"${s.current ? "" : " disabled"}>${faIcon("circle-plus")}加入今日任务</button>
            <button class="dd-btn" data-today type="button">看今天</button>
          </div>
          ${s.current ? swapHtml(s) : ""}
        </section>
        <section class="dd-card">
          <div class="dd-kicker">${s.started ? "下次换人" : "轮换开始"}</div>
          ${g.members.length && s.nextStart ? `<div class="dd-big">${nextBigText(s)}</div>
          <div class="dd-muted">${fmt(s.nextStart)} ${weekday(s.nextStart)} · 轮到 <b>${esc(s.nextWho?.name || "—")}</b></div>` : `<div class="dd-muted">${g.members.length ? "还没有可排的轮次。" : "还没有成员，无法排班。"}</div>`}
        </section>
      </div>
      <div class="dd-grid" style="margin-bottom:14px">
        <section class="dd-card" style="padding:0">
          <div class="dd-title" style="padding:17px 17px 0">${faIcon("calendar-days")}接下来的轮次</div>
          <div class="dd-list" style="border:0">${rowsHtml(s)}</div>
        </section>
        <section class="dd-card">
          <div class="dd-title">${faIcon("people-group")}成员 · 轮换顺序</div>
          <div data-members>${membersHtml(g)}</div>
          <div class="dd-add">
            <input class="dd-in" data-new maxlength="${MEMBER_MAX}" placeholder="输入成员名字，回车即可添加" aria-label="新成员名字">
            <button class="dd-btn pri" data-add type="button">${faIcon("user-plus")}添加成员</button>
          </div>
          ${removedHtml(g)}
        </section>
      </div>
      <div class="dd-grid">
        <section class="dd-card">
          <div class="dd-title">${faIcon("arrows-rotate")}轮换规则</div>
          ${rulesHtml(s)}
        </section>
        <section class="dd-card">
          <div class="dd-title">${faIcon("bell")}提醒</div>
          ${remindHtml(s)}
        </section>
      </div>
    </div>`;
    bind();
  }

  /* ── 轮换组的增删改（抽成具名函数：绑定时只负责调用，逻辑才能在 Node 里真跑） ── */
  /** 切换当前轮换。返回是否真的切了。 */
  async function setActiveGroup(id) {
    if (!id || id === state.activeId) return false;
    if (!state.groups.some((x) => x.id === id)) return false;
    state.activeId = id;
    await save();
    return true;
  }
  /** 新建一套轮换并切过去。到上限返回 null（由调用方提示）。 */
  async function addGroup() {
    if (state.groups.length >= GROUP_MAX) return null;
    const created = defaultGroup(tide.util.today(), `轮换 ${state.groups.length + 1}`);
    state.groups.push(created);
    state.activeId = created.id;
    await save();
    return created;
  }
  /** 删除一套轮换。**最后一套不许删** —— 删光界面就没有可编辑的对象了，
      用户想重来应该改名 + 清成员，而不是把自己删到没有落脚点。 */
  async function removeGroup(id) {
    if (state.groups.length <= 1) return false;
    const idx = state.groups.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    state.groups.splice(idx, 1);
    if (state.activeId === id) state.activeId = (state.groups[idx] || state.groups[idx - 1]).id;
    await save();
    return true;
  }
  /** 改名。空名退回默认名，不留空白标签。 */
  async function renameGroup(id, name) {
    const g = state.groups.find((x) => x.id === id);
    if (!g) return false;
    const next = String(name || "").trim().slice(0, NAME_MAX) || DEFAULT_GROUP_NAME;
    if (next === g.name) return false;
    g.name = next;
    await save();
    return true;
  }

  /* ── 加入今日任务 ── */
  /** 把这一组本轮的人做成一条今天的任务。同日同名的未完成任务视为重复，不重复添加。 */
  async function addTodayTask(g) {
    if (!g) return null;
    const today = tide.util.today();
    const who = assigneeFor(g, today);
    if (!who) { tide.notify("这一组还没有当班安排"); return null; }
    const title = `${g.name} · ${who.name}`;
    const dup = (await tide.tasks.list()).find((t) => !t.done && t.due === today && t.title === title);
    if (dup) { tide.notify(`今天的「${title}」任务已经在列表里了`); return null; }
    try {
      const created = tide.tasks.create({ title, due: today, quad: 2, estMin: 15, tags: [g.name] });
      tide.notify(`已把「${title}」加进今天的任务`);
      return created;
    } catch (e) {
      tide.notify(`加入任务失败：${e.message || e}`);
      return null;
    }
  }

  /* ── 交互绑定：每次 paint() 后重绑（节点都是新的） ── */
  function bind() {
    const q = (sel) => root.querySelector(sel);
    const g = activeGroup();
    if (!g) return;
    const commit = async (mutate) => { mutate(); await save(); await paint(); };

    // 切换 / 新建 / 改名 / 删除轮换
    root.querySelectorAll("[data-group]").forEach((btn) => btn.addEventListener("click", async () => {
      if (await setActiveGroup(btn.dataset.group)) await paint();
    }));
    q("[data-group-new]")?.addEventListener("click", async () => {
      const created = await addGroup();
      if (!created) { tide.notify(`最多 ${GROUP_MAX} 套轮换，先删掉不用的`); return; }
      await paint();
      tide.notify(`已新建「${created.name}」——在「轮换规则」里改名，再加成员`);
    });
    q("[data-group-name]")?.addEventListener("change", async () => {
      const input = q("[data-group-name]");
      const next = String(input.value || "").trim().slice(0, NAME_MAX) || DEFAULT_GROUP_NAME;
      if (!await renameGroup(g.id, next)) { input.value = g.name; return; }
      await paint();
    });
    q("[data-group-del]")?.addEventListener("click", async () => {
      if (state.groups.length <= 1) { tide.notify("至少要留一套轮换"); return; }
      if (!confirmFn(`删除轮换「${g.name}」？\n\n它的成员、换人记录和提醒设置会一起删掉。`)) return;
      const name = g.name;
      if (!await removeGroup(g.id)) return;
      await paint();
      tide.notify(`已删除轮换「${name}」`);
    });

    // 成员：改名 / 排序 / 移除
    root.querySelectorAll(".dd-mrow").forEach((row) => {
      const id = row.dataset.id;
      const idx = g.members.findIndex((m) => m.id === id);
      if (idx < 0) return;
      const nameIn = row.querySelector("[data-name]");
      nameIn?.addEventListener("change", async () => {
        const next = String(nameIn.value || "").trim().slice(0, MEMBER_MAX) || g.members[idx].name;
        if (next === g.members[idx].name) { nameIn.value = next; return; }
        await commit(() => { g.members[idx].name = next; });
      });
      row.querySelector("[data-up]")?.addEventListener("click", async () => {
        if (idx <= 0) return;
        await commit(() => { const [m] = g.members.splice(idx, 1); g.members.splice(idx - 1, 0, m); });
      });
      row.querySelector("[data-down]")?.addEventListener("click", async () => {
        if (idx >= g.members.length - 1) return;
        await commit(() => { const [m] = g.members.splice(idx, 1); g.members.splice(idx + 1, 0, m); });
      });
      row.querySelector("[data-del]")?.addEventListener("click", async () => {
        const m = g.members[idx];
        if (!m) return;
        await commit(() => {
          g.members.splice(idx, 1);
          g.removed = [{ id: m.id, name: m.name }, ...g.removed.filter((x) => x.id !== m.id)].slice(0, REMOVED_KEEP);
          // 清掉指向他的换人记录，避免出现「换给一个已经不在名单里的人」
          for (const [k, v] of Object.entries(g.overrides)) if (v === m.id) delete g.overrides[k];
        });
        tide.notify(`已把「${m.name}」移出轮换，可在「恢复已移除」里找回`);
      });
    });

    // 添加成员
    const addMember = async () => {
      const input = q("[data-new]");
      const name = String(input?.value || "").trim().slice(0, MEMBER_MAX);
      if (!name) { tide.notify("先输入名字再添加"); input?.focus(); return; }
      await commit(() => { g.members.push({ id: uid("m"), name }); });
    };
    q("[data-add]")?.addEventListener("click", addMember);
    q("[data-new]")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addMember(); } });

    // 恢复已移除
    q("[data-restore]")?.addEventListener("click", async () => {
      const back = g.removed.slice().reverse();
      await commit(() => {
        const ids = new Set(g.members.map((m) => m.id));
        for (const m of back) if (!ids.has(m.id)) g.members.push({ id: m.id, name: m.name });
        g.removed = [];
      });
      tide.notify(`已恢复 ${back.length} 位成员`);
    });

    // 规则
    q("[data-start]")?.addEventListener("change", async () => {
      const input = q("[data-start]");
      if (!validDate(input.value)) { tide.notify("起始日期无效，已保留原值"); await paint(); return; }
      await commit(() => { g.startDate = input.value; });
    });
    q("[data-start-today]")?.addEventListener("click", async () => {
      await commit(() => { g.startDate = tide.util.today(); });
    });
    root.querySelectorAll("[data-period]").forEach((btn) => btn.addEventListener("click", async () => {
      const p = Math.max(1, Math.round(Number(btn.dataset.period) || 7));
      if (p === periodOf(g)) return;
      await commit(() => { g.periodDays = p; });
    }));
    q("[data-period-custom]")?.addEventListener("change", async () => {
      const input = q("[data-period-custom]");
      const raw = Math.round(Number(input.value));
      if (!Number.isFinite(raw) || raw < 1 || raw > 365) { tide.notify("周期请填 1～365 天"); await paint(); return; }
      await commit(() => { g.periodDays = raw; });
    });

    // 提醒
    q("[data-remind]")?.addEventListener("change", async (e) => {
      const on = !!e.currentTarget.checked;
      await commit(() => { g.remindEnabled = on; });
      tide.notify(on ? `「${g.name}」提醒已开启` : `「${g.name}」提醒已关闭`);
    });
    q("[data-time]")?.addEventListener("change", async () => {
      const input = q("[data-time]");
      const t = normalizeTime(input.value);
      if (!t) { tide.notify("提醒时刻无效（时 0–23、分 0–59），已保留原值"); await paint(); return; }
      await commit(() => { g.remindTime = t; });
    });
    q("[data-sound]")?.addEventListener("change", async () => {
      const input = q("[data-sound]");
      await commit(() => { g.sound = input.value; });
      playSound(input.value);
    });
    q("[data-sound-try]")?.addEventListener("click", () => playSound(g.sound));
    q("[data-test]")?.addEventListener("click", () => {
      const who = assigneeFor(g, tide.util.today());
      tide.notify(who ? `提醒测试：「${g.name}」今天轮到 ${who.name}` : `提醒测试：「${g.name}」还没有成员，正式提醒时会跳过`);
      playSound(g.sound);
    });

    // 本轮换人 / 撤销
    q("[data-swap-apply]")?.addEventListener("click", async () => {
      const sel = q("[data-swap]");
      const id = sel?.value;
      const member = g.members.find((m) => m.id === id);
      if (!member) return;
      const s = snapshot(g);
      const key = s.cycle || g.startDate;
      await commit(() => { g.overrides[key] = id; });
      tide.notify(`「${g.name}」本轮改由 ${member.name} 当班`);
    });
    q("[data-swap-clear]")?.addEventListener("click", async () => {
      const s = snapshot(g);
      const key = s.cycle || g.startDate;
      await commit(() => { delete g.overrides[key]; });
      tide.notify("已撤销本轮换人");
    });

    // 加入今日任务
    q("[data-task]")?.addEventListener("click", () => { addTodayTask(g); });

    // 看今天：滚到本轮那行
    q("[data-today]")?.addEventListener("click", () => {
      root.querySelector(".dd-row.now")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  let bootPromise = null;

  function render(el) {
    ensureStyle();
    root = el;
    // 首绘必须等 boot() 读完 storage：render() 可能早于插件初始化完成（宿主渲染视图 vs 模块启动），
    // 直接 paint() 会拿着空 members 画出「先添加成员」的空态，而且之后没人再重绘。
    el.innerHTML = `<div class="dd-wrap"><section class="dd-card"><div class="dd-muted">正在读取轮换设置…</div></section></div>`;
    boot()
      .then(() => { if (root === el) paint(); })
      .catch((e) => {
        if (root !== el) return;
        el.innerHTML = `<div class="dd-wrap"><section class="dd-card"><div class="dd-title dd-err">轮换设置读取失败</div><div class="dd-muted">${esc(e?.message || e)}</div><div class="dd-actions"><button class="dd-btn pri" data-retry type="button">重试</button></div></section></div>`;
        el.querySelector("[data-retry]")?.addEventListener("click", () => { bootPromise = null; render(el); });
      });
    return () => { if (root === el) root = null; };
  }

  tide.ui.registerView({ id: VIEW_ID, title: "轮换值日", icon: "broom", render });

  /* 启动：读配置 → 领代号（顶掉旧实例的定时器）→ 起定时器 → 立刻查一次（补当天已过点的提醒） */
  function boot() {
    if (!bootPromise) bootPromise = (async () => {
      await load();
      MY_GEN = (Number(await tide.storage.get("gen", 0)) || 0) + 1;
      await tide.storage.set("gen", MY_GEN);
      startTimer();
      await tick();
    })();
    return bootPromise;
  }
  boot().catch((e) => console.warn("dorm-duty: 初始化失败", e));
})();
