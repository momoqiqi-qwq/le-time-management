(function () {
  let host = null, sites = [], activeId = "", notices = [], busy = false, query = "";
  const sessions = new Map();
  // 每个站点最近一次读取失败的错误：失败只靠 toast 一闪而过的话，
  // 用户只会看到「正在读取通知…」来回转，不知道到底发生了什么。
  const lastErrors = new Map();
  const loginRuntime = new Map();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => `school-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const active = () => sites.find((x) => x.id === activeId) || sites[0] || null;
  // 看门狗：底层 invoke 一旦挂死（代理失效/连接被吞等），按钮会永远停在「处理中…」。
  // 给所有网络调用兜一个 30 秒超时，超时后 UI 一定恢复并给出错误提示。
  const FETCH_TIMEOUT = 30000;
  const withTimeout = (p, ms = FETCH_TIMEOUT) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`请求超过 ${Math.round(ms / 1000)} 秒未响应，已中断。请检查网络或代理后重试`)), ms)),
  ]);

  function styles() {
    if (document.getElementById("school-notice-style")) return;
    const s = document.createElement("style"); s.id = "school-notice-style";
    s.textContent = `
      .sn{max-width:1120px;margin:0 auto;padding:12px 0 32px;color:var(--ink)}.sn-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:12px}.sn-add{display:grid;grid-template-columns:1fr 1.35fr auto;gap:9px}.sn-in{height:40px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);padding:0 11px;min-width:0}.sn-btn{min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);padding:7px 13px;font-weight:650}.sn-btn.pri{background:var(--deep);border-color:var(--deep);color:white}.sn-btn:disabled{opacity:.5}.sn-note{font-size:12px;color:var(--ink-2);line-height:1.7;margin-top:9px}.sn-tabs{display:flex;gap:8px;overflow:auto;padding:2px 0 10px}.sn-tab{flex:none;border:1px solid var(--line);border-radius:999px;background:var(--panel);padding:7px 12px;color:var(--ink-2);font-size:12px}.sn-tab.on{background:var(--deep);border-color:var(--deep);color:white}.sn-head{display:flex;align-items:flex-start;gap:12px;justify-content:space-between}.sn-head h2{font-size:19px;margin:0 0 4px}.sn-meta{font-size:11px;color:var(--ink-3);line-height:1.6;overflow-wrap:anywhere}.sn-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.sn-login{margin-top:14px;border-top:1px solid var(--line-soft);padding-top:14px}.sn-login-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.sn-login-grid label{display:grid;gap:5px;font-size:11px;color:var(--ink-2)}.sn-login-grid .wide{grid-column:1/-1}.sn-captcha{display:flex;align-items:center;gap:9px}.sn-captcha img{max-width:180px;max-height:72px;border-radius:8px;border:1px solid var(--line);background:white}.sn-toolbar{display:flex;gap:8px;align-items:center;margin:12px 0}.sn-toolbar .sn-in{flex:1}.sn-list{display:grid;gap:8px}.sn-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:13px 14px;content-visibility:auto;contain-intrinsic-size:86px}.sn-title{font-size:13.5px;font-weight:700;line-height:1.5}.sn-date{font-size:11px;color:var(--deep);margin-top:4px}.sn-snip{font-size:11px;color:var(--ink-2);line-height:1.55;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sn-item-actions{display:flex;flex-direction:column;gap:6px}.sn-item-actions button{border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);font-size:11px;padding:5px 9px}.sn-empty{border:1.5px dashed var(--line);border-radius:16px;padding:30px;text-align:center;color:var(--ink-3);line-height:1.7}.sn-warn{background:color-mix(in srgb,var(--sun) 12%,var(--panel));border:1px solid color-mix(in srgb,var(--sun) 35%,var(--line));border-radius:12px;padding:10px 12px;color:var(--ink-2);font-size:12px;line-height:1.65;margin-top:10px}.sn-ok{display:inline-flex;border-radius:999px;padding:3px 8px;background:color-mix(in srgb,var(--mint) 14%,var(--panel));color:var(--deep);font-size:10px;margin-top:5px}
      @media(max-width:720px){.sn-add{grid-template-columns:1fr}.sn-head{display:block}.sn-actions{justify-content:flex-start;margin-top:10px}.sn-login-grid{grid-template-columns:1fr}.sn-login-grid .wide{grid-column:auto}.sn-item{grid-template-columns:1fr}.sn-item-actions{flex-direction:row;flex-wrap:wrap}}
    `; document.head.append(s);
  }
  async function save() { await tide.storage.set("sites", sites.map(({ id, name, url, loginUrl, cms, lastFetchedAt }) => ({ id, name, url, loginUrl, cms, lastFetchedAt }))); }
  async function sessionFor(site) { if (!sessions.has(site.id)) sessions.set(site.id, await tide.http.session()); return sessions.get(site.id); }
  function cmsName(html) {
    const s = String(html || "").toLowerCase();
    if (/vsb_content|_vsb_|visualsitebuilder|v_news_content/.test(s)) return "高校 VSB / VisualSiteBuilder";
    if (/wp-content|wordpress/.test(s)) return "WordPress";
    if (/dede:|dedecms/.test(s)) return "DedeCMS";
    if (/drupal-settings-json|sites\/default\/files/.test(s)) return "Drupal";
    if (/powerby.*siteengine|siteengine/.test(s)) return "SiteEngine";
    if (/siteserver|stl:|siteserver cms/.test(s)) return "SiteServer CMS";
    if (/phpcms|content_list|showid=/i.test(s)) return "PHPCMS";
    if (/joomla|com_content|option=com_/i.test(s)) return "Joomla";
    if (/metinfo|met_[a-z_]+/i.test(s)) return "MetInfo";
    return "通用高校公告解析";
  }
  function filtered() { const q = query.trim().toLowerCase(); return q ? notices.filter((x) => `${x.title} ${x.snippet} ${x.date}`.toLowerCase().includes(q)) : notices; }

  async function fetchPage(site, url, opts = {}) {
    // session() 也要纳入看门狗：否则底层 invoke 挂死时连超时错误都出不来。
    const sid = await withTimeout(sessionFor(site));
    return withTimeout(tide.http.fetch(sid, opts.method || "GET", url, { headers: opts.headers, body: opts.body, binary: opts.binary }));
  }
  async function readNotices(site) {
    const res = await fetchPage(site, site.url);
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    const form = tide.util.web.detectLoginForm(res.body, res.finalUrl || site.url);
    const likelyLogin = !!form && (/login|sso|auth|cas/i.test(res.finalUrl || "") || form.passwordField);
    if (likelyLogin) {
      loginRuntime.set(site.id, { form, pageUrl: res.finalUrl || site.url, message: "检测到登录页面，请完成账号、密码和验证码后登录。" });
      notices = []; return { login: true, html: res.body };
    }
    loginRuntime.delete(site.id);
    site.cms = cmsName(res.body); site.lastFetchedAt = Date.now();
    notices = tide.util.web.extractNoticeLinks(res.body, res.finalUrl || site.url, { max: 100 });
    await tide.storage.set(`notices:${site.id}`, notices.slice(0, 100)); await save();
    return { login: false, html: res.body };
  }

  async function prepareLogin(site) {
    const url = site.loginUrl || site.url;
    const res = await fetchPage(site, tide.util.web.normalizeUrl(url));
    if (res.status >= 400) throw new Error(`登录页 HTTP ${res.status}`);
    const form = tide.util.web.detectLoginForm(res.body, res.finalUrl || url);
    if (!form) throw new Error("没有自动识别到登录表单。可检查登录网址是否正确；使用 JS 加密/扫码/第三方统一认证的网站需要单独适配。");
    const rt = { form, pageUrl: res.finalUrl || url, message: "已识别登录表单。密码仅用于当前会话，不写入本地配置。", captchaData: "" };
    loginRuntime.set(site.id, rt);
    if (form.captchaImageUrl) {
      try {
        const img = await fetchPage(site, form.captchaImageUrl, { binary: true });
        if (img.status < 400 && img.body && img.body.length < 900000) rt.captchaData = `data:${img.contentType || "image/png"};base64,${img.body}`;
      } catch {}
    }
  }

  async function submitLogin(site) {
    const rt = loginRuntime.get(site.id); if (!rt?.form) throw new Error("请先识别登录页");
    const form = rt.form, box = host.querySelector("[data-login-box]"); if (!box) return;
    const username = box.querySelector("[data-user]")?.value || "";
    const password = box.querySelector("[data-pass]")?.value || "";
    const captcha = box.querySelector("[data-captcha]")?.value || "";
    if (form.usernameField && !username) throw new Error("请输入账号");
    if (form.passwordField && !password) throw new Error("请输入密码");
    if (form.captchaField && !captcha) throw new Error("请输入图片中的验证码");
    const fields = {};
    for (const f of form.fields || []) if (f.name && f.value !== undefined) fields[f.name] = f.value;
    if (form.usernameField) fields[form.usernameField] = username;
    if (form.passwordField) fields[form.passwordField] = password;
    if (form.captchaField) fields[form.captchaField] = captcha;
    const body = tide.util.web.formEncode(fields);
    let action = form.action || rt.pageUrl, method = form.method || "POST";
    let res;
    if (method === "GET") res = await fetchPage(site, action + (action.includes("?") ? "&" : "?") + body);
    else res = await fetchPage(site, action, { method, headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": rt.pageUrl }, body });
    if (res.status >= 400) throw new Error(`登录提交失败（HTTP ${res.status}）`);
    const still = tide.util.web.detectLoginForm(res.body, res.finalUrl || action);
    if (still?.passwordField && (/login|sso|auth|cas/i.test(res.finalUrl || "") || res.body.includes(form.passwordField))) {
      rt.message = "登录后仍停留在登录页：可能是账号/密码/验证码错误，或该站点需要 JS 加密/统一认证专用适配。";
      rt.form = still;
      if (still.captchaImageUrl) {
        try { const img = await fetchPage(site, still.captchaImageUrl, { binary: true }); rt.captchaData = img.status < 400 ? `data:${img.contentType || "image/png"};base64,${img.body}` : ""; } catch { rt.captchaData = ""; }
      }
      paint(); return;
    }
    loginRuntime.delete(site.id); tide.notify("登录会话已建立，正在读取学校通知"); await refresh(false);
  }

  async function addSite() {
    const nameInput = host.querySelector("[data-new-name]"), urlInput = host.querySelector("[data-new-url]");
    const raw = urlInput?.value || ""; if (!raw.trim()) return tide.notify("请输入学校通知网站网址");
    busy = true; paint();
    try {
      const url = tide.util.web.normalizeUrl(raw); const id = uid(); const tmp = { id, name: nameInput?.value.trim() || "学校通知", url, loginUrl: "", cms: "自动识别", lastFetchedAt: 0 };
      sites.push(tmp); activeId = id;
      try {
        const res = await fetchPage(tmp, url);
        const finalUrl = res.finalUrl || url;
        const meta = tide.util.web.parseSiteMeta(res.body, finalUrl); if (!nameInput?.value.trim()) tmp.name = meta.title || tmp.name;
        tmp.cms = cmsName(res.body);
        const form = tide.util.web.detectLoginForm(res.body, finalUrl);
        if (form?.passwordField) {
          // 公告页被重定向到登录页时，保留原公告 URL；登录成功后才能回到正确列表。
          tmp.loginUrl = finalUrl !== url ? finalUrl : tmp.loginUrl;
          loginRuntime.set(tmp.id, { form, pageUrl: finalUrl, message: "检测到登录页面，请完成登录。", captchaData: "" });
        } else {
          tmp.url = finalUrl; notices = tide.util.web.extractNoticeLinks(res.body, finalUrl, { max: 100 });
          tmp.lastFetchedAt = Date.now(); await tide.storage.set(`notices:${id}`, notices);
        }
      } catch (e) { lastErrors.set(tmp.id, e.message || String(e)); tide.notify(`网站已保存，但首次读取失败：${e.message || e}`); }
      await save();
    } catch (e) { tide.notify(`添加失败：${e.message || e}`); }
    busy = false; paint();
  }

  async function refresh(notify = true) {
    const site = active(); if (!site || busy) return; busy = true; paint();
    try { await readNotices(site); lastErrors.delete(site.id); if (notify && !loginRuntime.has(site.id)) tide.notify(`已读取 ${notices.length} 条公告`); }
    catch (e) { lastErrors.set(site.id, e.message || String(e)); tide.notify(`读取失败：${e.message || e}`); }
    finally { busy = false; paint(); }
  }
  async function switchSite(id) { activeId = id; notices = await tide.storage.get(`notices:${id}`, []); if (!Array.isArray(notices)) notices = []; paint(); }
  async function toReminder(n) {
    const text = `${n.title} ${n.snippet || ""} ${n.date || ""}`; const p = tide.util.parseWhen(text);
    const task = tide.tasks.create({ title: n.title, quad: tide.util.guessQuad(p.date || n.date), estMin: p.endMin ? p.endMin - p.startMin : 30, due: p.date || n.date || null, tags: ["学校通知"], note: n.url });
    if (p.date && p.startMin !== null) tide.blocks.create({ date: p.date, start: tide.util.hhmmOf(p.startMin), durMin: p.endMin ? p.endMin - p.startMin : 60, title: n.title, taskId: task.id, cat: "study" });
    tide.notify(p.date || n.date ? "已将公告加入提醒" : "已加入任务池；未识别到明确日期");
  }

  function loginHtml(site) {
    const rt = loginRuntime.get(site.id); if (!rt) return ""; const f = rt.form || {};
    return `<div class="sn-login" data-login-box><div class="sn-note">${esc(rt.message || "需要登录")}</div><div class="sn-login-grid">${f.usernameField ? `<label><span>账号 · ${esc(f.usernameField)}</span><input class="sn-in" data-user autocomplete="username"></label>` : ""}${f.passwordField ? `<label><span>密码 · ${esc(f.passwordField)}</span><input class="sn-in" data-pass type="password" autocomplete="current-password"></label>` : ""}${f.captchaField ? `<label><span>验证码 · ${esc(f.captchaField)}</span><input class="sn-in" data-captcha autocomplete="off"></label><div class="sn-captcha">${rt.captchaData ? `<img src="${rt.captchaData}" alt="验证码">` : "验证码图片未自动读取"}<button class="sn-btn" data-reload-login>刷新验证码</button></div>` : ""}</div><div class="sn-actions" style="margin-top:10px"><button class="sn-btn pri" data-submit-login>登录并读取通知</button></div><div class="sn-warn">登录网址可在上方网站配置中修改。验证码不会被绕过或自动识别，需要你按页面图片手动输入。密码仅用于当前运行会话，不保存到本地。若学校统一认证使用动态 JS 加密、扫码、短信或第三方 OAuth，需要为该学校再写专用适配器。</div></div>`;
  }

  function paint() {
    if (!host?.isConnected) return; const site = active(), rows = filtered();
    host.innerHTML = `<div class="sn"><div class="sn-card"><div class="sn-add"><input class="sn-in" data-new-name placeholder="学校名称（可留空自动识别）"><input class="sn-in" data-new-url placeholder="学校通知/公告网站网址"><button class="sn-btn pri" data-add ${busy ? "disabled" : ""}>${busy ? "处理中…" : "添加并自动适配"}</button></div><div class="sn-note">支持常见高校 VSB / VisualSiteBuilder、WordPress、Drupal、DedeCMS 以及通用公告列表结构。登录页面会尝试识别账号、密码、隐藏字段和验证码。</div></div>${sites.length ? `<div class="sn-tabs">${sites.map((x) => `<button class="sn-tab ${x.id === site?.id ? "on" : ""}" data-site="${esc(x.id)}">${esc(x.name)}</button>`).join("")}</div>` : ""}${site ? `<section class="sn-card"><div class="sn-head"><div><h2>${esc(site.name)}</h2><div class="sn-meta">${esc(site.url)}<br>适配模式：${esc(site.cms || "自动识别")}</div><input class="sn-in" style="margin-top:8px;max-width:460px" data-site-login-url value="${esc(site.loginUrl || "")}" placeholder="登录网址（可选；与公告网址不同时填写）">${site.lastFetchedAt ? `<span class="sn-ok">已缓存 · ${new Date(site.lastFetchedAt).toLocaleString()}</span>` : ""}</div><div class="sn-actions"><button class="sn-btn pri" data-refresh ${busy ? "disabled" : ""}>刷新通知</button><button class="sn-btn" data-login>登录配置</button><button class="sn-btn" data-open-site>打开网站</button><button class="sn-btn" data-remove-site>删除</button></div></div>${loginHtml(site)}</section><div class="sn-toolbar"><input class="sn-in" data-search value="${esc(query)}" placeholder="搜索通知"><span class="sn-meta">${rows.length} 条</span></div><div class="sn-list">${rows.map((n, i) => `<article class="sn-item" data-notice="${i}"><div><div class="sn-title">${esc(n.title)}</div>${n.date ? `<div class="sn-date">${esc(n.date)}</div>` : ""}${n.snippet ? `<div class="sn-snip">${esc(n.snippet)}</div>` : ""}</div><div class="sn-item-actions"><button data-open-notice>打开</button><button data-remind>转提醒</button></div></article>`).join("") || `<div class="sn-empty">${loginRuntime.has(site.id) ? "请先完成登录。" : busy ? "正在读取通知…" : lastErrors.has(site.id) ? `读取失败：${esc(lastErrors.get(site.id))}。请检查网络或代理后，再点一次「刷新通知」重试。` : "暂无可识别通知。可尝试换成学校“通知公告”列表页，而不是门户首页。"}</div>`}</div>` : `<div class="sn-empty">先输入学校通知网站网址。插件会自动识别公告列表；如果站点需要登录，会显示登录配置。</div>`}</div>`;
  }

  async function render(el) {
    host = el; styles(); sites = await tide.storage.get("sites", []); if (!Array.isArray(sites)) sites = []; activeId = sites[0]?.id || ""; notices = activeId ? await tide.storage.get(`notices:${activeId}`, []) : []; if (!Array.isArray(notices)) notices = []; paint();
    if (activeId && notices.length) setTimeout(() => refresh(false), 0);
    host.addEventListener("click", async (e) => {
      try {
        const site = active();
        if (e.target.closest("[data-add]")) return addSite();
        const tab = e.target.closest("[data-site]"); if (tab) return switchSite(tab.dataset.site);
        if (!site) return;
        if (e.target.closest("[data-refresh]")) return refresh();
        if (e.target.closest("[data-open-site]")) return tide.util.openUrl(site.url);
        if (e.target.closest("[data-remove-site]")) { sessions.delete(site.id); loginRuntime.delete(site.id); lastErrors.delete(site.id); sites = sites.filter((x) => x.id !== site.id); activeId = sites[0]?.id || ""; notices = activeId ? await tide.storage.get(`notices:${activeId}`, []) : []; await save(); return paint(); }
        if (e.target.closest("[data-login]")) { const v = host.querySelector("[data-site-login-url]")?.value ?? host.querySelector("[data-login-url]")?.value; if (v !== undefined) site.loginUrl = v.trim(); await prepareLogin(site); await save(); return paint(); }
        if (e.target.closest("[data-reload-login]")) { const v = host.querySelector("[data-site-login-url]")?.value ?? host.querySelector("[data-login-url]")?.value; if (v !== undefined) site.loginUrl = v.trim(); await prepareLogin(site); await save(); return paint(); }
        if (e.target.closest("[data-submit-login]")) { const v = host.querySelector("[data-site-login-url]")?.value ?? host.querySelector("[data-login-url]")?.value; if (v !== undefined) site.loginUrl = v.trim(); await save(); return submitLogin(site); }
        const itemEl = e.target.closest("[data-notice]"); if (itemEl) { const n = rowsAt(Number(itemEl.dataset.notice)); if (!n) return; if (e.target.closest("[data-open-notice]")) tide.util.openUrl(n.url); else if (e.target.closest("[data-remind]")) await toReminder(n); }
      } catch (err) { tide.notify(err.message || String(err)); }
    });
    host.addEventListener("input", (e) => { if (e.target.matches("[data-search]")) { query = e.target.value; paint(); const n = host.querySelector("[data-search]"); n?.focus(); n?.setSelectionRange(query.length, query.length); } });
    return () => { if (host === el) host = null; };
  }
  function rowsAt(i) { return filtered()[i]; }
  tide.ui.registerView({ id: "school-notice", title: "学校通知网站", icon: "school", render });
})();
