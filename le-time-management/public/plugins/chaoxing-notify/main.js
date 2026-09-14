// 学习通通知 v2 for Le时间管理
// Based on the user-provided chaoxing-notify-skill v2 flow:
// fanyalogin -> reusable Cookie session -> notice.chaoxing.com inbox (no IP allow-list)
// -> courses -> full notification body -> todo extraction -> local reminders.
(function () {
  const LOGIN_PAGE = "https://passport2.chaoxing.com/login?fid=&newversion=true&refer=https%3A%2F%2Fi.chaoxing.com";
  const LOGIN_URL = "https://passport2.chaoxing.com/fanyalogin";
  const INBOX_URL = "https://notice.chaoxing.com/pc/notice/getNoticeList";
  const COURSES_URL = "https://mooc2-ans.chaoxing.com/visit/courses/list";
  const NOTICE_URL = (code) => `https://sharewh3.xuexi365.com/share/notice/${encodeURIComponent(code)}/notice_data?pt=&wxsn=`;
  const SHARE_PAGE = (code) => `https://sharewh3.xuexi365.com/share/${encodeURIComponent(code)}?t=4`;
  const DES_KEY = "u2oh6Vu^";
  const MAX_KEEP = 1000;
  // 带登录态的浏览器跳板：学习通 passport 会在登录完成后按 refer 跳回目标页；
  // 浏览器本身已登录时，该地址会立即 302 到目标页，属于“两种情况都对”的打开方式。
  const LOGIN_JUMP = (target) => `https://passport2.chaoxing.com/login?fid=&newversion=true&refer=${encodeURIComponent(target)}`;
  const ANON_HOST_RE = /^sharewh\d*\.xuexi365\.com$/i;
  const PROBE_TIMEOUT_MS = 8000;

  const state = {
    sid: null,
    cookie: "",
    loggedIn: false,
    remember: true,
    creds: null,
    inbox: [],
    courses: [],
    newIds: new Set(),
    knownIds: new Set(),
    ignoredIds: new Set(),
    tab: "inbox",
    filter: { kw: "", category: "全部", onlyUnread: false },
    course: { year: null, searchOpen: false },
    notice: null,
    loading: false,
    busy: "",
    error: "",
    lastSync: "",
    cacheLoaded: false,
    workStatus: {},
  };
  let host = null;

  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const stripHtml = (html) => String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\u200b/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const pad = (n) => String(n).padStart(2, "0");
  function timeText(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 1000000000) {
      const d = new Date(n > 100000000000 ? n : n * 1000);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    return String(v || "").slice(0, 16);
  }
  function classify(item) {
    const t = `${item.title || ""} ${item.body || ""}`;
    if (/考试|测验|补考|缓考/.test(t)) return "考试";
    if (/作业|习题|任务点/.test(t)) return "作业";
    if (/签到|打卡/.test(t)) return "签到";
    return "通知";
  }
  function deadline(text) {
    const m = String(text || "").match(/(?:结束时间|截止时间)[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
    return m ? `${m[1]} ${m[2].padStart(5, "0")}` : "";
  }

  /* ── 通知里的真实链接：正文 HTML 里的作业 / 考试 / 课程地址 ── */

  const decodeEntities = (s) => String(s || "")
    .replace(/&amp;/gi, "&").replace(/&#38;/g, "&").replace(/&#x26;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ""; }
  }
  // 公开分享页无需登录即可看到正文，浏览器直接打开即可，不做跳板。
  function isAnonymousUrl(url) { return ANON_HOST_RE.test(hostOf(url)); }
  function linkScore(url) {
    if (/\/work\/|doHomeWorkNew|workId|workRelationId|homework/i.test(url)) return 100;
    if (/\/exam\/|exam-ans|examId|testpaper|mock/i.test(url)) return 90;
    if (/mooc1(-ans)?\.chaoxing\.com|mooc2-ans\.chaoxing\.com/i.test(url)) return 70;
    if (/notice\.chaoxing\.com\/pc\/notice/i.test(url)) return 50;
    if (/^sharewh\d*\.xuexi365\.com$/i.test(hostOf(url))) return 10;
    if (/(^|\.)(chaoxing\.com|xuexi365\.com|chaoxing\.cn)$/i.test(hostOf(url))) return 30;
    return 0;
  }
  // 图片 / 静态资源 / 接口端点不是「可打开的通知页」，先剔掉再打分。
  const NOT_A_PAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|css|js|woff2?|ttf)(\?|$)/i;
  // 正文正文被 stripHtml 之后链接就没了，所以必须回到原始 rtf_content / content 里找。
  function pickTargetLink(item) {
    const raw = decodeEntities([item?.raw?.rtf_content, item?.raw?.content, item?.body].filter(Boolean).join("\n"));
    const found = (raw.match(/https?:\/\/[^\s"'<>，。、）】]+/gi) || [])
      .map((u) => u.replace(/[),.;:!?）】、，。]+$/, ""))
      .filter((u) => !NOT_A_PAGE_RE.test(u) && !/\/notice_data\b/i.test(u));
    const best = found.map((u) => ({ u, s: linkScore(u) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
    if (best) return best.u;
    return item?.idCode ? SHARE_PAGE(item.idCode) : "";
  }

  const withTimeout = (promise, ms, fallback) => Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

  // 用本机会话探一次目标页：被扔到 passport 就是需要登录。
  async function probeNeedsLogin(url) {
    if (!state.cookie) return true;
    if (!state.sid) state.sid = await tide.http.session();
    const res = await tide.http.fetch(state.sid, "GET", url, {
      headers: authHeaders({ "Referer": "https://notice.chaoxing.com/pc/notice/index", "Accept": "text/html, */*" }),
    });
    if (Array.isArray(res?.cookies) && res.cookies.length) state.cookie = mergeCookies(state.cookie, res.cookies);
    if (/passport2\.chaoxing\.com/.test(String(res?.finalUrl || ""))) return true;
    const head = String(res?.body || "").slice(0, 4000);
    return /请先登录|用户登录|登录学习通|fanyalogin|账号登录/.test(head);
  }

  // 浏览器打开：能直接开就直接开；需要登录就改走 passport 跳板，登录后自动回到该页。
  async function openTarget(item) {
    const target = pickTargetLink(item);
    if (!target) { tide.notify("这条通知里没有可打开的链接"); return; }
    if (isAnonymousUrl(target)) { tide.util.openUrl(target); return; }
    state.busy = "open"; paintMain();
    let needLogin = true;
    try { needLogin = await withTimeout(probeNeedsLogin(target), PROBE_TIMEOUT_MS, true); }
    catch { needLogin = true; }
    finally { state.busy = ""; paintMain(); }
    if (needLogin) {
      tide.util.openUrl(LOGIN_JUMP(target));
      tide.notify("已用系统浏览器打开：若浏览器未登录学习通，登录后会自动跳回该页面");
    } else {
      tide.util.openUrl(target);
    }
  }
  function cookieObject(cookie) {
    const out = {};
    String(cookie || "").split(";").forEach((part) => {
      const p = part.trim(); const i = p.indexOf("=");
      if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
    });
    return out;
  }
  function mergeCookies(base, setCookies) {
    const jar = cookieObject(base);
    for (const line of setCookies || []) {
      const first = String(line).split(";", 1)[0];
      const i = first.indexOf("=");
      if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim();
    }
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  function authHeaders(extra = {}) { return state.cookie ? { ...extra, Cookie: state.cookie } : extra; }
  function assertJsonResponse(res, label) {
    const head = String(res.body || "").slice(0, 500);
    if (/用户登录|passport2\.chaoxing\.com|登录学习通/.test(head) || /passport2\.chaoxing\.com/.test(res.finalUrl || "")) {
      throw new Error(`${label}失败：登录会话已失效，请重新登录`);
    }
    try { return JSON.parse(res.body || "{}"); }
    catch { throw new Error(`${label}失败：接口返回了非 JSON 内容，可能是会话失效或平台风控`); }
  }
  async function saveAuth() {
    await tide.storage.set("sessionCookie", state.remember ? state.cookie : null);
    await tide.storage.set("creds", state.remember ? state.creds : null);
  }
  async function saveKnown() { await tide.storage.set("knownIds", [...state.knownIds].slice(-MAX_KEEP)); }
  async function saveIgnored() { await tide.storage.set("ignoredIds", [...state.ignoredIds].slice(-MAX_KEEP)); }
  async function savePrefs() { await tide.storage.set("filter", state.filter); }

  /* 配色一律走主题变量（--ink / --ink-2 / --ink-3 / --panel / --paper / --line / --deep / --sea / --coral / --sun / --mint），
     八套主题（含夜间）自动跟随。语义色用 color-mix 就地调深/调浅，不再依赖宿主 styles.css 的深色兼容层 —— 
     那层用的是 !important 白名单，会把这里的胶囊底色、分类标签色和 KPI 文字色一起压掉。 */
  function ensureStyle() {
    if (document.getElementById("cx2-style")) return;
    const s = document.createElement("style"); s.id = "cx2-style"; s.textContent = `
      .cx2{max-width:1180px;margin:0 auto;padding:clamp(12px,2vw,24px);color:var(--ink)}
      .cx2 *{box-sizing:border-box}
      .cx2 button,.cx2 input,.cx2 select,.cx2 textarea{font:inherit}
      .cx2-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .cx2 h2{margin:0;font-size:clamp(22px,3vw,30px)}
      .cx2-sub{font-size:12.5px;color:var(--ink-2);margin:4px 0}
      .cx2-actions{display:flex;gap:7px;flex-wrap:wrap}
      .cx2 button{border:1px solid var(--line);background:var(--panel);color:var(--deep);border-radius:9px;min-height:40px;padding:7px 12px;cursor:pointer}
      .cx2 button:hover{background:var(--paper)}
      .cx2 button.primary{background:var(--deep);color:#fff;border-color:var(--deep);font-weight:650}
      .cx2 button.danger{color:color-mix(in srgb,var(--coral) 50%,var(--ink));border-color:color-mix(in srgb,var(--coral) 34%,var(--line))}
      .cx2 button:disabled{opacity:.5;cursor:default}
      .cx2-nav{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0 10px;padding-bottom:10px;border-bottom:1px solid var(--line)}
      .cx2-nav button.on{background:var(--deep);color:#fff;border-color:var(--deep)}
      .cx2-pill{display:inline-block;font-size:10px;border-radius:999px;padding:2px 7px;background:color-mix(in srgb,var(--deep) 16%,var(--panel));color:var(--deep);margin-left:5px}
      .cx2-new{background:var(--coral);color:#fff}
      .cx2-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
      .cx2-search{flex:1;min-width:220px;border:1px solid var(--line);border-radius:9px;min-height:40px;padding:8px 11px;background:var(--panel);color:var(--ink)}
      .cx2-search::placeholder{color:var(--ink-2);opacity:1}
      .cx2-select{border:1px solid var(--line);border-radius:9px;min-height:40px;padding:6px 9px;background:var(--panel);color:var(--ink)}
      .cx2-check{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--ink-2);white-space:nowrap}
      .cx2-status{font-size:12px;color:var(--ink-2);margin:7px 0 11px}
      .cx2-status.err{background:color-mix(in srgb,var(--coral) 16%,var(--panel));border:1px solid color-mix(in srgb,var(--coral) 34%,var(--line));color:color-mix(in srgb,var(--coral) 50%,var(--ink));padding:10px;border-radius:9px}
      .cx2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .cx2-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px;min-width:0}
      .cx2-card.unread{border-left:4px solid var(--sea)}
      .cx2-title{font-weight:650;font-size:14px;line-height:1.45;overflow-wrap:anywhere}
      .cx2-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:5px 0;font-size:11px;color:var(--ink-2)}
      .cx2-tag{padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--deep) 14%,var(--panel));color:var(--deep)}
      .cx2-tag.作业{background:color-mix(in srgb,var(--sun) 20%,var(--panel));color:color-mix(in srgb,var(--sun) 50%,var(--ink))}
      .cx2-tag.考试{background:color-mix(in srgb,var(--coral) 20%,var(--panel));color:color-mix(in srgb,var(--coral) 50%,var(--ink))}
      .cx2-tag.签到{background:color-mix(in srgb,var(--mint) 20%,var(--panel));color:color-mix(in srgb,var(--mint) 50%,var(--ink))}
      .cx2-grading{display:inline-block;vertical-align:1px;margin-left:7px;padding:1px 8px;border-radius:999px;background:color-mix(in srgb,var(--sun) 20%,var(--panel));color:color-mix(in srgb,var(--sun) 50%,var(--ink));border:1px solid color-mix(in srgb,var(--sun) 34%,var(--line));font-size:10.5px;font-weight:500;cursor:help}
      .cx2-body{font-size:12px;color:color-mix(in srgb,var(--ink) 78%,var(--ink-2));line-height:1.65;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
      .cx2-card.open .cx2-body{display:block;-webkit-line-clamp:unset;max-height:320px;overflow:auto}
      .cx2-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
      .cx2-card-actions button{min-height:34px;padding:5px 9px;font-size:11.5px}
      .cx2-empty{border:1.5px dashed var(--line);border-radius:12px;padding:24px;text-align:center;color:var(--ink-3);font-size:12.5px}
      .cx2-courses{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}
      .cx2-course{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:11px}
      .cx2-course b{display:block;font-size:13px}
      .cx2-course span{display:block;font-size:11px;color:var(--ink-2);margin-top:4px}
      .cx2-grade{margin:14px 0 4px}
      .cx2-grade-head{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin:0 0 8px;font-size:14px;color:var(--ink)}
      .cx2-grade-sub{font-size:11px;font-weight:400;color:var(--ink-2)}
      .cx2-course{position:relative}
      .cx2-course b{padding-right:64px}
      .cx2-course .cx2-mark{position:absolute;top:9px;right:9px;display:inline-flex;align-items:center;gap:5px;margin:0;padding:2px 8px;border-radius:999px;font-size:10.5px;line-height:1.65;font-weight:500;letter-spacing:.2px}
      .cx2-course .cx2-mark::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
      .cx2-course .cx2-mark.st-red{background:#dc2626;color:#fff;border:1px solid #dc2626}
      .cx2-course .cx2-mark.st-blue{background:#2563eb;color:#fff;border:1px solid #2563eb}
      .cx2-course .cx2-mark.st-green{background:#16a34a;color:#fff;border:1px solid #16a34a}
      .cx2-course .cx2-mark.st-gray{background:#9ca3af;color:#fff;border:1px solid #9ca3af}
      .cx2-course.st-red{background:color-mix(in srgb,var(--coral) 16%,var(--panel));border-color:color-mix(in srgb,var(--coral) 32%,var(--line))}
      .cx2-course.st-red b,.cx2-course.st-red span{color:color-mix(in srgb,var(--coral) 52%,var(--ink))}
      .cx2-course.st-blue{background:color-mix(in srgb,var(--sea) 16%,var(--panel));border-color:color-mix(in srgb,var(--sea) 32%,var(--line))}
      .cx2-course.st-blue b,.cx2-course.st-blue span{color:color-mix(in srgb,var(--sea) 52%,var(--ink))}
      .cx2-course.st-green{background:color-mix(in srgb,var(--mint) 16%,var(--panel));border-color:color-mix(in srgb,var(--mint) 32%,var(--line))}
      .cx2-course.st-green b,.cx2-course.st-green span{color:color-mix(in srgb,var(--mint) 44%,var(--ink))}
      .cx2-course.st-gray{background:var(--paper);border-color:var(--line)}
      .cx2-course.st-gray b,.cx2-course.st-gray span{color:var(--ink-2)}
      .cx2-status-sec{margin:12px 0 2px}
      .cx2-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}
      .dot-red{background:#dc2626}
      .dot-blue{background:#2563eb}
      .dot-green{background:#16a34a}
      .dot-gray{background:#9ca3af}
      .cx2-search-toggle{width:40px;min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 11px}
      .cx2-course .cx2-termline{color:var(--ink-2)}
      .cx2-hint{margin-top:14px;font-size:11px;color:var(--ink-2);line-height:1.7}
      .cx2-login{max-width:650px;margin:18px auto;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:clamp(18px,3vw,28px)}
      .cx2-login h3{margin:0 0 4px}
      .cx2-tabs{display:flex;gap:6px;margin:14px 0}
      .cx2-tabs button.on{background:var(--deep);color:#fff;border-color:var(--deep)}
      .cx2-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .cx2 label{font-size:12px;color:var(--ink-2)}
      .cx2 label span{display:block;margin-bottom:4px;font-weight:600}
      .cx2 input,.cx2 textarea{width:100%;border:1px solid var(--line);border-radius:9px;min-height:40px;padding:8px 10px;background:var(--panel);color:var(--ink)}
      .cx2 input::placeholder,.cx2 textarea::placeholder{color:var(--ink-2);opacity:1}
      .cx2 textarea{min-height:100px;resize:vertical}
      .cx2-wide{grid-column:1/-1}
      .cx2-note{font-size:11px;color:var(--ink-2);line-height:1.65;background:var(--paper);padding:9px 10px;border-radius:8px;margin-top:10px}
      .cx2-lookup{max-width:820px}
      .cx2-detail{margin-top:10px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px}
      .cx2-detail .body{white-space:pre-line;max-height:420px;overflow:auto;font-size:12.5px;line-height:1.7;color:color-mix(in srgb,var(--ink) 78%,var(--ink-2))}
      .cx2-todo{display:grid;gap:9px;max-width:900px}
      .cx2-due{font-weight:700;color:color-mix(in srgb,var(--sun) 50%,var(--ink));font-size:12px}
      .cx2-kpis{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
      .cx2-kpi{background:var(--paper);border:1px solid var(--line);border-radius:9px;padding:7px 10px;font-size:11.5px;color:var(--ink)}
      .cx2 footer{margin-top:24px;border-top:1px solid var(--line);padding-top:12px;font-size:11px;color:var(--ink-2)}
      @media(max-width:760px){.cx2{padding:12px}.cx2-grid{grid-template-columns:1fr}.cx2-fields{grid-template-columns:1fr}.cx2-wide{grid-column:auto}.cx2-actions{width:100%}.cx2-actions button{flex:1}.cx2-nav{overflow-x:auto;flex-wrap:nowrap;padding-bottom:8px}.cx2-nav button{white-space:nowrap}.cx2-toolbar .cx2-search{width:100%;flex-basis:100%}}
      @media(pointer:coarse){.cx2 button,.cx2 input,.cx2 select{min-height:46px}.cx2-card-actions button{min-height:40px}}
    `; document.head.append(s);
  }

  async function loadPrefs() {
    state.creds = await tide.storage.get("creds", null);
    state.cookie = await tide.storage.get("sessionCookie", "") || "";
    state.knownIds = new Set(await tide.storage.get("knownIds", []));
    state.ignoredIds = new Set(await tide.storage.get("ignoredIds", []));
    state.filter = { ...state.filter, ...(await tide.storage.get("filter", null) || {}) };
    state.workStatus = await tide.storage.get("workStatus", null) || {};
    const cached = await tide.storage.get("inboxCache", []);
    if (Array.isArray(cached) && cached.length) { state.inbox = cached; state.cacheLoaded = true; }
  }

  async function cxLogin(uname, password) {
    state.sid = await tide.http.session();
    let res = await tide.http.fetch(state.sid, "GET", LOGIN_PAGE, { headers: authHeaders() });
    state.cookie = mergeCookies(state.cookie, res.cookies);
    const pwd = await tide.util.desEncryptHex(password, DES_KEY);
    res = await tide.http.fetch(state.sid, "POST", LOGIN_URL, {
      headers: authHeaders({
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://passport2.chaoxing.com",
        "Referer": LOGIN_PAGE,
      }),
      body: `fid=-1&uname=${encodeURIComponent(uname)}&password=${encodeURIComponent(pwd)}&refer=https%3A%2F%2Fi.chaoxing.com&t=true&forbidotherlogin=0&validate=`,
    });
    state.cookie = mergeCookies(state.cookie, res.cookies);
    let j; try { j = JSON.parse(res.body); } catch { throw new Error("登录接口返回异常，请稍后重试"); }
    if (!j.status) throw new Error(j.msg2 || j.msg || "登录失败，请检查账号密码；若频繁登录触发风控，可改用 Cookie 登录");
    state.loggedIn = true;
    await saveAuth();
    return cookieObject(state.cookie)._uid || "";
  }

  async function startCookieSession(cookie) {
    state.sid = await tide.http.session(); state.cookie = String(cookie || "").trim();
    if (!state.cookie) throw new Error("Cookie 不能为空");
    await fetchInbox(1, false);
    state.loggedIn = true; await saveAuth();
  }

  function normalizeNotice(it) {
    const body = stripHtml(it.rtf_content) || stripHtml(it.content);
    const id = String(it.idCode || it.id || `${it.insertTime || ""}-${it.title || ""}`);
    const tag = String(it.tag || "");
    return {
      id, idCode: String(it.idCode || ""), title: stripHtml(it.title || "(无标题)"), body,
      sender: stripHtml(it.createrName || it.sender || ""), time: timeText(it.insertTime || it.sendTime),
      insertTime: Number(it.insertTime || 0), unread: !(it.isread === 1 || it.isread === "1" || it.isread === true),
      tag, courseId: (tag.match(/courseId(\d+)/i) || [])[1] || "", raw: it,
    };
  }

  async function fetchInbox(limit = 0, commit = true, incremental = false) {
    if (!state.sid) state.sid = await tide.http.session();
    const items = []; let last = ""; let pages = 0;
    while (pages < 50) {
      const res = await tide.http.fetch(state.sid, "POST", INBOX_URL, {
        headers: authHeaders({
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Origin": "https://notice.chaoxing.com",
          "Referer": "https://notice.chaoxing.com/pc/notice/index",
          "X-Requested-With": "XMLHttpRequest",
        }),
        body: `type=2&year=${new Date().getFullYear()}&lastValue=${encodeURIComponent(last)}`,
      });
      state.cookie = mergeCookies(state.cookie, res.cookies);
      const root = assertJsonResponse(res, "收件箱加载");
      const notices = root.notices || {};
      const list = Array.isArray(notices.list) ? notices.list : [];
      items.push(...list); pages += 1;
      const pageIds = list.map((x) => String(x.idCode || x.id || `${x.insertTime || ""}-${x.title || ""}`));
      const overlapped = incremental && pageIds.some((id) => state.knownIds.has(id));
      if ((limit && items.length >= limit) || notices.lastPage || !list.length || overlapped) break;
      last = String(notices.lastGetId || ""); if (!last) break;
    }
    const fresh = items.slice(0, limit || items.length).map(normalizeNotice);
    const merged = incremental ? [...fresh, ...state.inbox] : fresh;
    const dedup = new Map(); for (const x of merged) if (x.id && !dedup.has(x.id)) dedup.set(x.id, x);
    const normalized = [...dedup.values()].sort((a,b)=>(b.insertTime||0)-(a.insertTime||0));
    if (commit) {
      const ids = fresh.map((x) => x.id).filter(Boolean);
      if (!state.knownIds.size) state.newIds = new Set();
      else state.newIds = new Set(ids.filter((id) => !state.knownIds.has(id)));
      ids.forEach((id) => state.knownIds.add(id));
      state.inbox = normalized;
      await tide.storage.set("inboxCache", state.inbox.slice(0, 2000));
      await saveKnown(); await saveAuth();
    }
    return normalized;
  }

  async function loadCourses() {
    const res = await tide.http.fetch(state.sid, "GET", `${COURSES_URL}?v=${Date.now()}`, {
      headers: authHeaders({ "Accept": "text/html, */*; q=0.01", "Referer": "https://mooc2-ans.chaoxing.com/visit/interaction" }),
    });
    state.cookie = mergeCookies(state.cookie, res.cookies);
    if (res.status !== 200 || /passport2\.chaoxing\.com/.test(res.finalUrl || "")) throw new Error("课程列表加载失败：登录态可能失效");
    const courses = [], pick = (s, re) => (s.match(re) || [])[1] || "";
    for (const li of String(res.body || "").split('<li class="course ').slice(1)) {
      const cid = pick(li, /class="courseId"\s+name="courseId"\s+value="(\d+)"/);
      const clz = pick(li, /class="clazzId"\s+name="clazzId"\s+value="(\d+)"/);
      const name = pick(li, /class="course-name[^"]*"\s+[^>]*title="([^"]+)"/);
      if (!cid || !clz || !name) continue;
      courses.push({ name: stripHtml(name), courseid: cid, clazzid: clz,
        cpi: pick(li, /info="\d+_(\d+)"/), teacher: stripHtml(pick(li, /class="line2 color3"[^>]*title="([^"]+)"/)),
        clazz: stripHtml(pick(li, /班级：([^<]+)/)).trim(),
        // 卡片里还有一行「开课时间：2025-09-01～2027-09-01」，课程页的年级分组与完成状态全靠它推断。
        start: pick(li, /开课时间：\s*(\d{4}-\d{2}-\d{2})/),
        end: pick(li, /开课时间：\s*\d{4}-\d{2}-\d{2}\s*[～~\-]\s*(\d{4}-\d{2}-\d{2})/) });
    }
    state.courses = courses; await saveAuth(); return courses;
  }

  async function loadNotice(code) {
    const clean = String(code || "").trim().match(/[0-9a-fA-F]{32}/)?.[0] || String(code || "").trim();
    if (!/^[0-9a-fA-F]{32}$/.test(clean)) throw new Error("通知分享码应为 32 位 idCode，也可以直接粘贴包含 idCode 的分享链接");
    const res = await tide.http.fetch(state.sid || await tide.http.session(), "GET", NOTICE_URL(clean), {
      headers: { "Accept": "application/json, text/javascript, */*; q=0.01", "Referer": SHARE_PAGE(clean), "X-Requested-With": "XMLHttpRequest" },
    });
    const j = assertJsonResponse(res, "通知详情查询");
    if (String(j.result) !== "1") throw new Error(j.msg || "通知详情查询失败");
    const d = j.data || {};
    state.notice = { idCode: clean, title: stripHtml(d.title || "(无标题)"), body: stripHtml(d.rtf_content) || stripHtml(d.content), sender: stripHtml(d.createrName || ""), time: timeText(d.insertTime), toNames: stripHtml(d.toNames || ""), raw: d };
  }

  async function toReminder(item) {
    const text = `${item.title || ""} ${item.body || ""}`;
    const due = deadline(text); const p = tide.util.parseWhen(due ? `${item.title} ${due}` : text.slice(0, 700));
    const date = due ? due.slice(0, 10) : p.date; const startMin = due ? (()=>{const [h,m]=due.slice(11).split(':').map(Number);return h*60+m;})() : p.startMin;
    const title = item.title || "学习通提醒";
    const link = item.idCode ? SHARE_PAGE(item.idCode) : "";
    const task = tide.tasks.create({ title, quad: tide.util.guessQuad(date), estMin: 60, due: date || null, tags: ["学习通", classify(item)], note: [item.sender, link, item.body?.slice(0, 500)].filter(Boolean).join("\n") });
    if (date) {
      const start = tide.util.hhmmOf(startMin == null ? 9 * 60 : startMin);
      tide.blocks.create({ date, start, durMin: 60, title, taskId: task.id, cat: tide.util.guessCategory(text) });
      tide.notify(`已创建提醒：${date.slice(5)} ${start} · ${title.slice(0, 24)}`, { actionLabel: "查看", action: () => tide.util.navigate("timeblock") });
    } else tide.notify("没有识别到明确日期，已保存到任务池");
  }

  const isIgnored = (n) => n && state.ignoredIds.has(n.id);
  function visibleInbox() { return state.inbox.filter((n) => !isIgnored(n)); }

  function filteredInbox() {
    const kw = state.filter.kw.trim().toLowerCase();
    return visibleInbox().filter((n) => {
      const cat = classify(n);
      if (state.filter.category !== "全部" && cat !== state.filter.category) return false;
      if (state.filter.onlyUnread && !n.unread) return false;
      if (kw && !`${n.title} ${n.body} ${n.sender}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }
  function todos() {
    const now = Date.now();
    return visibleInbox().map((n) => ({ ...n, dueText: deadline(n.body) })).filter((n) => n.dueText && new Date(n.dueText.replace(' ', 'T')).getTime() >= now).sort((a,b)=>a.dueText.localeCompare(b.dueText));
  }

  async function ignoreNotice(n) {
    if (!n || !n.id) return;
    state.ignoredIds.add(n.id);
    state.newIds.delete(n.id);
    await saveIgnored(); paintMain();
    tide.notify("已从本机列表移除（不影响学习通平台数据），顶部可恢复");
  }
  async function restoreIgnored() {
    const n = state.ignoredIds.size;
    state.ignoredIds.clear();
    await saveIgnored(); paintMain();
    tide.notify(n ? `已恢复 ${n} 条通知` : "当前没有被忽略的通知");
  }
  function linkHintHtml(n) {
    const t = pickTargetLink(n);
    if (!t || isAnonymousUrl(t)) return "";
    const s = linkScore(t);
    return `<span class="cx2-pill" title="${esc(t)}">${s >= 100 ? "已识别作业页" : s >= 90 ? "已识别考试页" : "已识别页面"}</span>`;
  }
  const OPEN_TIP = "用系统浏览器打开该通知对应的真实页面：会自动带上学习通登录态；若浏览器本身未登录，会先跳到登录页并在登录后自动回到该页面";
  const OPEN_SHARE_TIP = "用系统浏览器打开学习通公开分享页，无需登录即可看正文";
  const SHARE_TIP = "打开学习通公开分享页，无需登录即可看正文";
  // 卡片按钮统一在这里生成，收件箱 / 待办作业两个列表共用，避免两处漂移。
  function cardActionsHtml(n, kind) {
    const target = pickTargetLink(n);
    const real = !!target && !isAnonymousUrl(target);
    const btns = [];
    if (kind === "inbox") btns.push(`<button data-act="toggle">展开/收起</button>`);
    btns.push(`<button data-act="remind">${kind === "todo" ? "加入时间管理" : "转为提醒"}</button>`);
    if (n.idCode) btns.push(`<button data-act="share" title="${esc(SHARE_TIP)}">打开通知</button>`);
    if (target) btns.push(`<button data-act="open" title="${esc(real ? OPEN_TIP : OPEN_SHARE_TIP)}">浏览器打开${real ? "（带登录态）" : ""}</button>`);
    btns.push(`<button class="danger" data-act="del" title="仅从本机列表移除并记住，不影响学习通平台，也不影响已创建的提醒；顶部「恢复已移除」可一键放回">移除</button>`);
    return `<div class="cx2-card-actions">${btns.join("")}</div>`;
  }

  function navHtml() {
    const t = todos();
    return `<div class="cx2-nav">${[
      ["inbox", `收件箱 <span class="cx2-pill">${visibleInbox().length}</span>${state.newIds.size?`<span class="cx2-pill cx2-new">+${state.newIds.size}</span>`:""}`],
      ["todo", `待办作业 <span class="cx2-pill">${t.length}</span>`],
      ["courses", `课程 <span class="cx2-pill">${state.courses.length}</span>`],
      ["lookup", "分享码查询"],
    ].map(([id,label])=>`<button data-tab="${id}" class="${state.tab===id?'on':''}">${label}</button>`).join('')}</div>`;
  }

  function inboxHtml() {
    const rows = filteredInbox();
    return `<div class="cx2-toolbar"><input class="cx2-search" data-search value="${esc(state.filter.kw)}" placeholder="搜索课程 / 教师 / 作业 / 考试 / 正文…"><select class="cx2-select" data-category>${["全部","通知","作业","考试","签到"].map(x=>`<option ${state.filter.category===x?'selected':''}>${x}</option>`).join('')}</select><label class="cx2-check"><input type="checkbox" data-unread ${state.filter.onlyUnread?'checked':''}> 只看平台未读</label></div>
      <div class="cx2-kpis"><span class="cx2-kpi">本次新增 ${state.newIds.size}</span><span class="cx2-kpi">平台未读 ${visibleInbox().filter(x=>x.unread).length}</span><span class="cx2-kpi">显示 ${visibleInbox().length} / 共 ${state.inbox.length}</span>${state.ignoredIds.size?`<span class="cx2-kpi" title="仅在本机列表隐藏，原始通知仍在本地缓存里；点右上角「恢复已移除」可放回">已移除 ${state.ignoredIds.size}</span>`:''}</div>
      ${rows.length?`<div class="cx2-grid">${rows.map((n)=>{const cat=classify(n),isNew=state.newIds.has(n.id);return `<article class="cx2-card ${n.unread?'unread':''}" data-id="${esc(n.id)}"><div class="cx2-title">${esc(n.title)}${isNew?'<span class="cx2-pill cx2-new">NEW</span>':''}${gradingBadge(n)}</div><div class="cx2-meta"><span class="cx2-tag ${cat}">${cat}</span>${n.sender?`<span>${esc(n.sender)}</span>`:''}<span>${esc(n.time||'未知时间')}</span>${n.unread?'<span>未读</span>':'<span>已读</span>'}${linkHintHtml(n)}</div><div class="cx2-body">${esc(n.body||'（无正文）')}</div>${cardActionsHtml(n,'inbox')}</article>`;}).join('')}</div>`:'<div class="cx2-empty">没有匹配的通知。</div>'}`;
  }
  function todoHtml() {
    const list=todos();
    return list.length?`<div class="cx2-todo">${list.map(n=>`<article class="cx2-card" data-id="${esc(n.id)}"><div class="cx2-title">${esc(n.title)}${gradingBadge(n)}</div><div class="cx2-meta"><span class="cx2-tag 作业">作业</span><span>${esc(n.sender)}</span>${linkHintHtml(n)}</div><div class="cx2-due">截止 ${esc(n.dueText)}</div><div class="cx2-body">${esc(n.body)}</div>${cardActionsHtml(n,'todo')}</article>`).join('')}</div>`:'<div class="cx2-empty">当前拉取范围内没有识别到未截止作业。识别规则来自 v2 包：正文中的“结束时间/截止时间：YYYY-MM-DD HH:MM”。</div>';
  }
  /* ── 作业提交状态探测：通知正文里没有提交/批改状态，只能拿附件里的作业入口实地看一眼 ──
     附件 iframe 的 name 是 Base64(URL编码的 JSON)，里面带 workId 和作业入口 URL。
     实测落地页（真实账号 12 条样本）：
       · title「作业作答」→ 还能作答，即未提交；
       · title「作答详情 / 查看详情 / 作业详情」→ 已提交后的查看页；
     是否已批改没有静态信号（批改结果页是 Vue 异步渲染），所以已提交统一记为「正在批改」，
     批改完成以平台通知为准。每轮刷新最多探 6 条未知项、逐条间隔进行，避免触发风控。 */

  function parseWorkRef(n) {
    const m = String(n?.raw?.rtf_content || "").match(/<iframe[^>]*\bname="([A-Za-z0-9+/=]{40,})"/);
    if (!m) return null;
    try {
      const w = JSON.parse(decodeURIComponent(atob(m[1]))).att_web || {};
      if (!w.url || !w.examOrWorkId) return null;
      return { id: String(w.examOrWorkId), url: w.url };
    } catch { return null; }
  }
  async function saveWorkStatus() { await tide.storage.set("workStatus", state.workStatus); }
  function statusOf(n) {
    const ref = parseWorkRef(n);
    return ref ? (state.workStatus[ref.id] || "") : "";
  }
  const gradingBadge = (n) => statusOf(n) === "grading"
    ? `<span class="cx2-grading" title="已提交：作业页打开是查看页而非作答页；批改完成后以平台通知为准">正在批改</span>`
    : "";
  async function probeWorkStatus(n) {
    const ref = parseWorkRef(n);
    if (!ref || state.workStatus[ref.id]) return;
    try {
      const res = await tide.http.fetch(state.sid || await tide.http.session(), "GET", ref.url, {
        headers: authHeaders({ "Accept": "text/html,*/*; q=0.9", "Referer": "https://i.chaoxing.com/" }),
      });
      state.cookie = mergeCookies(state.cookie, res.cookies);
      const title = (String(res.body || "").match(/<title>([^<]*)<\/title>/) || [])[1] || "";
      state.workStatus[ref.id] = /作业作答/.test(title) ? "unsent" : /详情/.test(title) ? "grading" : "";
    } catch { return; } // 探测失败不留记录，下次刷新再试
    await saveWorkStatus();
  }
  let probing = false;
  async function probePendingWorks() {
    if (probing || !state.loggedIn) return;
    const targets = todos().filter((n) => { const r = parseWorkRef(n); return r && !state.workStatus[r.id]; }).slice(0, 6);
    if (!targets.length) return;
    probing = true;
    try {
      for (const n of targets) { await probeWorkStatus(n); paintMain(); }
    } finally { probing = false; paintMain(); }
  }

  /* ── 课程分类：全部是本地推断，学习通接口并不返回年级和完成状态 ──────────────
     课程接口只给 courseId / clazzId / 课程名 / 教师 / 班级；唯一的时间信号是卡片里的
     「开课时间：YYYY-MM-DD～YYYY-MM-DD」（注意结课时间一律是开课 +2 年，不能拿它判完成）。
     推断规则：
       · 开课月份 ≥ 7 → 秋季学期（学年 = 当年），否则春季学期（学年 = 上一年）；
       · 开课学期早于当前学期 → 已完成；否则未完成；
       · 年级 = 开课学年 − 入学学年 + 1；入学学年由班级名里的「25防火」、文本里的「20XX 级」投票决定。
     页面上会写明这是推断值，不假装成平台原始数据。                                        */

  function termOf(dateStr) {
    const m = String(dateStr || "").match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    const y = Number(m[1]), mo = Number(m[2]);
    if (!y || mo < 1 || mo > 12) return null;
    const autumn = mo >= 7;
    return { year: autumn ? y : y - 1, half: autumn ? "上" : "下", rank: (autumn ? y : y - 1) * 2 + (autumn ? 0 : 1), label: `${autumn ? y : y - 1}-${autumn ? y + 1 : y} 学年${autumn ? "上" : "下"}学期` };
  }
  function currentTerm(now) {
    const d = now || new Date();
    return termOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }
  const GRADE_NAMES = ["大一", "大二", "大三", "大四", "大五", "大六"];
  function gradeOf(termYear, enrollYear) {
    if (!termYear || !enrollYear) return "";
    const n = termYear - enrollYear + 1;
    if (n < 1) return "入学前";
    return GRADE_NAMES[n - 1] || `大${n}`;
  }
  // 入学学年：班级名里的「25防火」与文本里的「2025 级」各投一票取众数；都没票时退回最早的开课学年。
  function detectEnrollYear(courses) {
    const votes = new Map();
    const bump = (y) => { if (y >= 2000 && y <= 2100) votes.set(y, (votes.get(y) || 0) + 1); };
    const years = [];
    for (const c of courses || []) {
      const clazz = String(c?.clazz || "");
      for (const m of `${c?.name || ""} ${clazz}`.matchAll(/(20\d{2})\s*级/g)) bump(Number(m[1]));
      for (const m of clazz.matchAll(/(?:^|[^\d])(\d{2})(?=防火|英普|侦查|治安|消防|警犬|法学)/g)) bump(2000 + Number(m[1]));
      const t = termOf(c?.start);
      if (t) years.push(t.year);
    }
    let best = 0, bestVotes = 0;
    for (const [y, n] of votes) if (n > bestVotes || (n === bestVotes && y > best)) { best = y; bestVotes = n; }
    if (bestVotes) return best;
    return years.length ? Math.min(...years) : 0;
  }
  // 四态：红=未完成（开课学期在未来）、蓝=正在进行（当前学期）、绿=已完成（学期已结束）、灰=未知
  const courseStatus = (c, now) => {
    const t = termOf(c?.start);
    if (!t) return "gray";
    const cur = currentTerm(now).rank;
    if (t.rank < cur) return "green";
    if (t.rank === cur) return "blue";
    return "red";
  };
  const STATUS_META = {
    red: { label: "未完成", title: "开课学期在未来，按本地推断为未完成" },
    blue: { label: "正在进行", title: "开课学期是当前学期，按本地推断为正在进行" },
    green: { label: "已完成", title: "开课学期已经过去，按本地推断为已完成" },
    gray: { label: "状态未知", title: "没有开课时间，无法推断状态" },
  };
  function courseCardHtml(c, enrollYear, now) {
    const st = courseStatus(c, now);
    const t = termOf(c?.start);
    const g = t ? gradeOf(t.year, enrollYear) : "";
    const mark = `<span class="cx2-mark st-${st}" title="${STATUS_META[st].title}">${STATUS_META[st].label}</span>`;
    const termLine = t ? `${g ? g + t.half : `学年 ${t.year}${t.half}`} · 开课 ${c.start}` : "无开课时间";
    return `<div class="cx2-course st-${st}">${mark}<b>${esc(c.name)}</b><span>${esc([c.teacher, c.clazz].filter(Boolean).join(' · ') || '—')}</span><span class="cx2-termline">${esc(termLine)}</span><span>courseId ${esc(c.courseid)} · clazzId ${esc(c.clazzid)}</span></div>`;
  }
  function coursesHtml() {
    const all = state.courses;
    const now = new Date();
    const enrollYear = detectEnrollYear(all);
    const kw = state.filter.kw.trim().toLowerCase();
    if (kw) state.course.searchOpen = true;
    const list = kw ? all.filter(c=>`${c.name} ${c.teacher} ${c.clazz}`.toLowerCase().includes(kw)) : all;
    // 第一层：按学年分 tab，最新学年在前；无开课时间的归「未知学年」排最后。每次打开默认选中最近学年。
    const yearMap = new Map();
    for (const c of list) {
      const t = termOf(c?.start);
      const y = t ? t.year : 0;
      if (!yearMap.has(y)) yearMap.set(y, []);
      yearMap.get(y).push(c);
    }
    const years = [...yearMap.keys()].sort((a, b) => ((a === 0 ? 1 : 0) - (b === 0 ? 1 : 0)) || b - a);
    if (!years.includes(state.course.year)) state.course.year = years.find((y) => y !== 0) ?? years[0] ?? 0;
    const inYear = yearMap.get(state.course.year) || [];
    // 第二层：学年内按完成状态分组（红未完成 → 蓝正在进行 → 绿已完成 → 灰未知）
    const groups = { red: [], blue: [], green: [], gray: [] };
    for (const c of inYear) groups[courseStatus(c, now)].push(c);
    const yearLabel = (y) => (y === 0 ? "未知学年" : `${y}-${y + 1} 学年`);
    const tabs = `<div class="cx2-tabs" role="tablist" aria-label="按学年筛选课程">${years.map((y) => `<button class="${y === state.course.year ? "on" : ""}" data-year="${y}" role="tab" aria-selected="${y === state.course.year}">${esc(yearLabel(y))}（${yearMap.get(y).length}）</button>`).join("")}</div>`;
    const search = state.course.searchOpen
      ? `<input class="cx2-search" data-search value="${esc(state.filter.kw)}" placeholder="搜索课程 / 教师 / 班级…">`
      : `<button class="cx2-search-toggle" data-search-toggle title="搜索课程 / 教师 / 班级" aria-label="展开搜索"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg></button>`;
    const body = inYear.length
      ? ["red", "blue", "green", "gray"].filter((k) => groups[k].length).map((k) =>
          `<section class="cx2-status-sec"><h4 class="cx2-grade-head"><span class="cx2-dot dot-${k}"></span>${STATUS_META[k].label}<span class="cx2-grade-sub">${groups[k].length} 门</span></h4><div class="cx2-courses">${groups[k].map((c) => courseCardHtml(c, enrollYear, now)).join("")}</div></section>`).join("")
      : '<div class="cx2-empty">这个学年没有匹配课程。</div>';
    return `<div class="cx2-toolbar">${search}<span style="flex:1"></span></div>${tabs}${body}<div class="cx2-hint">每次打开默认显示最近学年。卡片底色与角标是本地按课程卡片里的「开课时间」推断的完成状态：红=未完成（开课学期在未来）、蓝=正在进行（当前学期）、绿=已完成（开课学期已结束）${enrollYear ? `；年级按 ${enrollYear} 级入学计算` : ""}。学习通接口本身不返回该状态，可能与平台显示不一致。</div>`;
  }
  function lookupHtml() {
    const n=state.notice;
    return `<div class="cx2-lookup"><div class="cx2-toolbar"><input class="cx2-search" data-code placeholder="粘贴 32 位 idCode 或学习通分享链接"><button class="primary" data-lookup>查询全文</button></div>${n?`<div class="cx2-detail"><div class="cx2-title">${esc(n.title)}</div><div class="cx2-meta"><span>${esc(n.sender)}</span><span>${esc(n.time)}</span>${n.toNames?`<span>发送给 ${esc(n.toNames)}</span>`:''}</div><div class="body">${esc(n.body||'（无正文）')}</div><div class="cx2-card-actions"><button data-notice-remind>转为提醒</button><button data-notice-open title="${esc(OPEN_TIP)}">浏览器打开（带登录态）</button><button class="danger" data-notice-del title="仅从本机收件箱列表移除并记住，可在顶部「恢复已移除」放回">移除</button></div></div>`:'<div class="cx2-empty">收件箱本身已经包含 rtf_content 全文；这里只用于按分享码单独查询通知。</div>'}</div>`;
  }

  function paintMain() {
    if (!host) return;
    host.innerHTML = `<div class="cx2"><div class="cx2-head"><div><h2>学习通</h2><p class="cx2-sub">收件箱通知 · 未截止作业 · 课程列表 · 分享码全文</p></div><div class="cx2-actions"><button class="primary" data-refresh ${state.loading?'disabled':''}>${state.loading?'刷新中…':'快速刷新'}</button><button data-full-sync ${state.loading?'disabled':''}>完整同步</button>${state.ignoredIds.size?`<button data-ignore-reset title="把被移除的通知重新放回列表，不需要重新同步">恢复已移除（${state.ignoredIds.size}）</button>`:''}<button data-switch>切换登录</button></div></div>${navHtml()}<div class="cx2-status ${state.error?'err':''}">${state.error?esc(state.error):`${state.busy==='open'?'正在校验学习通登录态，随后交给系统浏览器 · ':''}${state.lastSync?`上次刷新 ${esc(state.lastSync)} · `:''}收件箱使用 notice.chaoxing.com 无 IP 白名单主路径`}</div><div data-body>${state.tab==='inbox'?inboxHtml():state.tab==='todo'?todoHtml():state.tab==='courses'?coursesHtml():lookupHtml()}</div><footer>基于 chaoxing-notify-skill v2.0.0 的已验证接口流程。Cookie/账号信息仅在选择“保存登录信息”时写入本机；Cookie 等同账号登录身份，请勿外传。</footer></div>`;
  }

  async function refreshAll() {
    if (!state.loggedIn || state.loading) return;
    state.loading = true; state.error = ""; paintMain();
    try {
      await fetchInbox(0, true, state.inbox.length > 0);
      try { await loadCourses(); } catch (e) { state.error = String(e.message || e); }
      state.lastSync = new Date().toLocaleString();
      probePendingWorks(); // 后台串行探测作业提交状态，不阻塞刷新
    } catch (e) {
      state.error = String(e.message || e);
      if (/登录|会话/.test(state.error)) state.loggedIn = false;
    } finally { state.loading = false; paintMain(); }
  }

  async function fullSync() {
    if (!state.loggedIn || state.loading) return;
    state.loading = true; state.error = ""; paintMain();
    try {
      await fetchInbox(0, true, false);
      state.lastSync = new Date().toLocaleString();
      tide.notify(`完整同步完成，共 ${state.inbox.length} 条通知`);
    } catch (e) { state.error = String(e.message || e); }
    finally { state.loading = false; paintMain(); }
  }

  function loginHtml(message = "") {
    host.innerHTML = `<div class="cx2"><div class="cx2-login"><h3>登录学习通</h3><p class="cx2-sub">推荐账号密码登录；若频繁登录触发风控，可粘贴浏览器/App 已登录 Cookie 直接复用会话。</p><div class="cx2-tabs"><button class="on" data-login-tab="password">账号密码</button><button data-login-tab="cookie">Cookie</button></div><div data-login-password><div class="cx2-fields"><label><span>账号（手机号 / 学号）</span><input data-u autocomplete="username"></label><label><span>密码</span><input data-p type="password" autocomplete="current-password"></label></div><div class="cx2-actions" style="margin-top:12px"><button class="primary" data-login>登录</button></div></div><div data-login-cookie hidden><label><span>Cookie</span><textarea data-cookie placeholder="例如：_uid=...; route=...; ..."></textarea></label><div class="cx2-actions" style="margin-top:12px"><button class="primary" data-cookie-login>使用 Cookie</button></div></div><label class="cx2-check" style="margin-top:12px"><input type="checkbox" data-remember checked> 保存登录信息到本机，便于下次直接复用</label><div class="cx2-status ${message?'err':''}" data-login-status>${esc(message)}</div><div class="cx2-note">账号密码登录使用 fanyalogin + DES-ECB/PKCS5；密码加密在本机 Tauri 后端完成。收件箱改用 v2 包确认的 getNoticeList 接口，不再依赖 specie.chaoxing.com 的来源 IP 白名单。</div></div></div>`;
  }

  async function autoLogin() {
    if (state.cookie) {
      try { state.remember = true; await startCookieSession(state.cookie); return true; } catch { state.cookie = ""; await tide.storage.set("sessionCookie", null); }
    }
    if (state.creds?.uname && state.creds?.password) {
      try { state.remember = true; await cxLogin(state.creds.uname, state.creds.password); return true; } catch { state.creds = null; await tide.storage.set("creds", null); }
    }
    return false;
  }

  function wire() {
    host.addEventListener("click", async (e) => {
      const loginTab=e.target.closest('[data-login-tab]');if(loginTab){const cookie=loginTab.dataset.loginTab==='cookie';host.querySelectorAll('[data-login-tab]').forEach(b=>b.classList.toggle('on',b===loginTab));host.querySelector('[data-login-password]').hidden=cookie;host.querySelector('[data-login-cookie]').hidden=!cookie;return;}
      if(e.target.closest('[data-login]')){const u=host.querySelector('[data-u]').value.trim(),p=host.querySelector('[data-p]').value,status=host.querySelector('[data-login-status]');if(!u||!p){status.textContent='请填写账号和密码';return;}state.remember=host.querySelector('[data-remember]').checked;state.creds={uname:u,password:p};status.textContent='正在登录…';try{await cxLogin(u,p);paintMain();await refreshAll();}catch(err){status.textContent=err.message||err;}return;}
      if(e.target.closest('[data-cookie-login]')){const c=host.querySelector('[data-cookie]').value.trim(),status=host.querySelector('[data-login-status]');state.remember=host.querySelector('[data-remember]').checked;state.creds=null;status.textContent='正在验证 Cookie…';try{await startCookieSession(c);paintMain();await refreshAll();}catch(err){status.textContent=err.message||err;}return;}
      const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;paintMain();return;}
      const yearBtn=e.target.closest('[data-year]');if(yearBtn){state.course.year=Number(yearBtn.dataset.year)||0;paintMain();return;}
      if(e.target.closest('[data-search-toggle]')){state.course.searchOpen=true;paintMain();return;}
      if(e.target.closest('[data-refresh]')){await refreshAll();return;}
      if(e.target.closest('[data-switch]')){state.loggedIn=false;state.sid=null;state.cookie='';state.creds=null;await tide.storage.set('sessionCookie',null);await tide.storage.set('creds',null);loginHtml();return;}
      const lookup=e.target.closest('[data-lookup]');if(lookup){const input=host.querySelector('[data-code]');try{state.error='';await loadNotice(input.value);paintMain();}catch(err){state.error=err.message||String(err);paintMain();}return;}
      if(e.target.closest('[data-ignore-reset]')){await restoreIgnored();return;}
      if(e.target.closest('[data-notice-remind]')&&state.notice){await toReminder(state.notice);return;}
      if(e.target.closest('[data-notice-open]')&&state.notice){await openTarget(state.notice);return;}
      if(e.target.closest('[data-notice-del]')&&state.notice){const hit=state.inbox.find(x=>x.idCode&&x.idCode===state.notice.idCode);if(hit)await ignoreNotice(hit);else tide.notify('这条分享码对应的通知不在当前收件箱列表里');return;}
      const card=e.target.closest('[data-id]'),act=e.target.closest('[data-act]');if(card&&act){const n=state.inbox.find(x=>x.id===card.dataset.id);if(!n)return;const a=act.dataset.act;if(a==='toggle'){card.classList.toggle('open');return;}if(a==='remind'){await toReminder(n);return;}if(a==='share'&&n.idCode){tide.util.openUrl(SHARE_PAGE(n.idCode));return;}if(a==='open'){await openTarget(n);return;}if(a==='del'){await ignoreNotice(n);return;}}
    });
    host.addEventListener("input", (e) => { if(e.target.matches('[data-search]')){state.filter.kw=e.target.value;savePrefs();const pos=e.target.selectionStart;paintMain();const next=host.querySelector('[data-search]');if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch{}}} });
    host.addEventListener("change", (e) => { if(e.target.matches('[data-category]')){state.filter.category=e.target.value;savePrefs();paintMain();}if(e.target.matches('[data-unread]')){state.filter.onlyUnread=e.target.checked;savePrefs();paintMain();} });
    host.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))e.stopPropagation();if(e.target.matches('[data-search]')&&e.key==='Escape'){state.course.searchOpen=false;state.filter.kw='';paintMain();}});
  }

  async function render(el) {
    host = el; ensureStyle(); host.innerHTML = '<div class="cx2"><div class="cx2-empty">正在读取学习通登录信息…</div></div>';
    wire(); await loadPrefs();
    if (state.inbox.length) paintMain();
    const ok = await autoLogin();
    if (ok) { paintMain(); await refreshAll(); } else loginHtml();
  }

  tide.ui.registerView({ id: "chaoxing-notify", title: "学习通", icon: 'graduation-cap', render });
})();
