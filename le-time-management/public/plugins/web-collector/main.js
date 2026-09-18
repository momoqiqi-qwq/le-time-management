(function () {
  // 默认「应用内显示」：点卡片「打开」直接在本应用的面板里加载，不跳出到系统浏览器。
  // 用户仍可在工具栏下拉里改成「浏览器打开」，该选择会存进 storage 并被尊重。
  const DEFAULT_OPEN_MODE = "inside";
  let host = null, items = [], query = "", busy = false, openMode = DEFAULT_OPEN_MODE, iconPreview = null;
  const DEFAULT_ITEMS = [
    { url: "http://daxue.qiyemulu.cn/", title: "大学名录", host: "daxue.qiyemulu.cn", iconUrl: "http://daxue.qiyemulu.cn/favicon.ico", iconName: "school", note: "默认：大学名录" },
    { url: "https://www.resource.edu.cn/", title: "国家教育资源公共服务平台", host: "resource.edu.cn", iconUrl: "https://www.resource.edu.cn/favicon.ico", iconName: "school", note: "默认：教育资源入口" },
  ];
  // v1.1.0 起默认条目的备注前缀由「默认收集：」改为「默认：」。老用户的条目早已存进
  // storage，只改 DEFAULT_ITEMS 不会生效 —— 下面做一次性改写兜住老数据。
  const LEGACY_NOTE_PREFIX = "默认收集：";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const fa = (name) => `<svg viewBox="0 0 512 512" aria-hidden="true"><use href="/icons/fontawesome/solid.svg#${esc(name || "globe")}"></use></svg>`;

  function styles() {
    if (document.getElementById("web-collector-style")) return;
    const s = document.createElement("style"); s.id = "web-collector-style";
    s.textContent = `
      .wc{max-width:1100px;margin:0 auto;padding:14px 0 30px;color:var(--ink)}.wc-hero{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px}.wc-input{height:42px;border:1px solid var(--line);border-radius:10px;padding:0 12px;background:var(--paper);color:var(--ink);min-width:0}.wc-btn{height:42px;border-radius:10px;border:1px solid var(--line);padding:0 15px;background:var(--panel);color:var(--ink);font-weight:650}.wc-btn.pri{background:var(--deep);border-color:var(--deep);color:white}.wc-btn:disabled{opacity:.55}.wc-icon-preview{grid-column:1/-1;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line-soft);border-radius:12px;background:var(--paper);margin-top:2px}.wc-icon-preview .wc-icon{flex:none;width:38px;height:38px;border-radius:10px}.wc-icon-preview .wc-icon img{width:24px;height:24px}.wc-preview-text{flex:1;min-width:0;font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2)}.wc-preview-text code{display:block;font-size:calc(11.5px * var(--ui-text-scale));color:var(--ink-3);white-space:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.wc-icon-preview .wc-btn{height:32px;padding:0 12px;font-size:calc(12px * var(--ui-text-scale));flex:none}.wc-toolbar{display:flex;gap:9px;align-items:center;margin:10px 0 12px}.wc-toolbar .wc-input{flex:1}.wc-open-mode{height:42px;border:1px solid var(--line);border-radius:10px;padding:0 10px;background:var(--paper);color:var(--ink);font-size:calc(12px * var(--ui-text-scale))}.wc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:11px}.wc-card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;display:grid;grid-template-columns:46px minmax(0,1fr);gap:11px;content-visibility:auto;contain-intrinsic-size:120px}.wc-icon{width:46px;height:46px;border-radius:12px;background:var(--paper);border:1px solid var(--line-soft);display:grid;place-items:center;overflow:hidden}.wc-icon img{width:30px;height:30px;object-fit:contain}.wc-icon svg{width:24px;height:24px;fill:var(--deep)}.wc-title{font-size:calc(14px * var(--ui-text-scale));font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wc-host{font-size:calc(11px * var(--ui-text-scale));color:var(--ink-3);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wc-note{font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2);margin-top:8px;line-height:1.55;min-height:19px;overflow-wrap:anywhere}.wc-actions{grid-column:1/-1;display:flex;gap:7px;flex-wrap:wrap;margin-top:2px}.wc-actions button{border:1px solid var(--line);border-radius:8px;background:var(--paper);padding:6px 10px;font-size:calc(11px * var(--ui-text-scale));color:var(--ink)}.wc-empty{border:1.5px dashed var(--line);border-radius:16px;padding:32px;text-align:center;color:var(--ink-3)}.wc-edit{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-top:4px}.wc-edit input{height:34px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);padding:0 9px;min-width:0;width:100%;font-size:calc(13px * var(--ui-text-scale))}.wc-badge{display:inline-flex;font-size:calc(10px * var(--ui-text-scale));padding:2px 7px;border-radius:999px;background:color-mix(in srgb,var(--deep) 10%,var(--panel));color:var(--deep);margin-top:6px}.wc-web-mask{position:fixed;inset:0;z-index:1980;background:rgba(15,23,42,.42);backdrop-filter:blur(3px)}.wc-web-panel{position:fixed;inset:calc(18px + var(--sat,env(safe-area-inset-top,0px))) calc(18px + var(--sar,env(safe-area-inset-right,0px))) calc(18px + var(--sab,env(safe-area-inset-bottom,0px))) calc(18px + var(--sal,env(safe-area-inset-left,0px)));z-index:1981;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 24px 70px rgba(15,23,42,.26)}.wc-web-head{height:52px;flex:none;display:flex;align-items:center;gap:10px;padding:0 12px;border-bottom:1px solid var(--line-soft)}.wc-web-head b{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wc-web-head button{border:1px solid var(--line);border-radius:8px;background:var(--paper);padding:6px 10px;color:var(--ink)}.wc-web-panel iframe{flex:1;width:100%;border:0;background:var(--paper)}
      @media(max-width:640px){.wc-hero{grid-template-columns:1fr}.wc-hero .wc-btn{width:100%}.wc-icon-preview .wc-btn{width:auto}.wc-icon-preview{flex-wrap:wrap}.wc-preview-text{flex-basis:100%}.wc-grid{grid-template-columns:1fr}.wc-edit{grid-template-columns:1fr}}
    `; document.head.append(s);
  }

  async function save() { await tide.storage.set("items", items); }
  async function ensureDefaults() {
    const seen = new Set(items.map((x) => String(x.url || "").replace(/\/$/, "")));
    let changed = false;
    for (const item of DEFAULT_ITEMS) {
      if (seen.has(item.url.replace(/\/$/, ""))) continue;
      items.push({ id: uid(), createdAt: Date.now(), updatedAt: Date.now(), ...item });
      changed = true;
    }
    if (changed) await save();
  }
  /** 只改写「默认条目」上的旧前缀，避免误伤用户自己写的、碰巧以同样文字开头的备注。 */
  async function migrateNotes() {
    const defaults = new Set(DEFAULT_ITEMS.map((x) => x.url.replace(/\/$/, "")));
    let changed = false;
    for (const item of items) {
      if (!defaults.has(String(item.url || "").replace(/\/$/, ""))) continue;
      if (typeof item.note === "string" && item.note.startsWith(LEGACY_NOTE_PREFIX)) {
        item.note = "默认：" + item.note.slice(LEGACY_NOTE_PREFIX.length);
        changed = true;
      }
    }
    if (changed) await save();
  }
  function favicon(item) {
    const fallback = fa(item.iconName || "globe");
    if (!item.iconUrl) return fallback;
    return `<img loading="lazy" decoding="async" src="${esc(item.iconUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">` + `<span style="display:none">${fallback}</span>`;
  }
  function visible() {
    const q = query.trim().toLowerCase(); if (!q) return items;
    return items.filter((x) => `${x.title} ${x.url} ${x.host} ${x.note || ""}`.toLowerCase().includes(q));
  }
  function paint() {
    if (!host?.isConnected) return;
    const rows = visible();
    host.innerHTML = `<div class="wc"><div class="wc-hero"><input class="wc-input" data-url placeholder="输入网站，例如 https://www.example.edu.cn"><button class="wc-btn pri" data-add ${busy ? "disabled" : ""}>${busy ? "正在识别…" : "自动识别并收藏"}</button><button class="wc-btn" data-probe-icon ${busy ? "disabled" : ""}>${busy ? "获取中…" : "自动获取网站图标"}</button></div>${iconPreview ? `<div class="wc-icon-preview"><span class="wc-icon">${favicon(iconPreview)}</span><span class="wc-preview-text">图标地址：<code>${esc(iconPreview.iconUrl || "未取到")}</code></span><button class="wc-btn" data-preview-save ${busy ? "disabled" : ""}>存为新条目</button><button class="wc-btn" data-preview-clear>清空</button></div>` : ""}</div><div class="wc-toolbar"><input class="wc-input" data-search value="${esc(query)}" placeholder="搜索已收藏网站"><select class="wc-open-mode" data-open-mode aria-label="网站打开方式"><option value="external"${openMode === "external" ? " selected" : ""}>浏览器打开</option><option value="inside"${openMode === "inside" ? " selected" : ""}>应用内显示</option></select><span style="font-size:calc(12px * var(--ui-text-scale));color:var(--ink-2)">${rows.length} / ${items.length}</span></div><div class="wc-grid">${rows.map((x) => `<article class="wc-card" data-id="${esc(x.id)}"><div class="wc-icon">${favicon(x)}</div><div><div class="wc-title" title="${esc(x.title)}">${esc(x.title)}</div><div class="wc-host">${esc(x.host || x.url)}</div><span class="wc-badge">FA: ${esc(x.iconName || "globe")}</span><div class="wc-note">${esc(x.note || "暂无备注")}</div></div><div class="wc-edit"><input data-title value="${esc(x.title)}" aria-label="名称"><input data-note value="${esc(x.note || "")}" placeholder="备注" aria-label="备注"></div><div class="wc-actions"><button data-open>打开</button><button data-save>保存修改</button><button data-fetch-icon title="只重新抓取这个网站的图标，标题与备注保持不变">换图标</button><button data-refresh>刷新名称/图标</button><button data-remove>删除</button></div></article>`).join("") || `<div class="wc-empty">还没有收藏网页。输入网址后会自动获取网站名称和图标。</div>`}</div></div>`;
    fitInputFonts();
  }

  /** 名称/备注超长时自动缩小字号适配框宽，缩到 11px 为止（再放不下交给省略号）——
   *  缩太小读起来难受，11px 是「能看清」的下限。
   *  字号一律写成 `calc(Npx * var(--ui-text-scale))`：scrollWidth/clientWidth 量的是
   *  缩放后的实际渲染宽度，收缩循环在任意「文字大小」档位下逻辑不变。 */
  function fitInputFonts() {
    const MAX = 13, MIN = 11;
    for (const input of host.querySelectorAll(".wc-edit input")) {
      let size = MAX;
      input.style.fontSize = `calc(${size}px * var(--ui-text-scale, 1))`;
      while (size > MIN && input.scrollWidth > input.clientWidth) {
        size -= 0.5;
        input.style.fontSize = `calc(${size}px * var(--ui-text-scale, 1))`;
      }
    }
  }

  function openInside(item) {
    document.querySelector(".wc-web-panel")?._close?.();
    const mask = document.createElement("div"); mask.className = "wc-web-mask";
    const panel = document.createElement("div"); panel.className = "wc-web-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", item.title || "网站");
    const close = () => { mask.remove(); panel.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    panel._close = close;
    mask.addEventListener("click", close);
    panel.innerHTML = `<div class="wc-web-head"><b title="${esc(item.url)}">${esc(item.title || item.url)}</b><button data-web-external>浏览器打开</button><button data-web-close>关闭</button></div><iframe src="${esc(item.url)}" title="${esc(item.title || "网站")}"></iframe>`;
    panel.querySelector("[data-web-close]").addEventListener("click", close);
    panel.querySelector("[data-web-external]").addEventListener("click", () => tide.util.openUrl(item.url));
    document.addEventListener("keydown", onKey);
    document.body.append(mask, panel);
  }

  function openItem(item) {
    if (openMode === "inside") openInside(item);
    else tide.util.openUrl(item.url);
  }

  async function inspect(url) {
    const normalized = tide.util.web.normalizeUrl(url);
    let finalUrl = normalized, meta;
    try {
      const res = await tide.http.getCached(normalized, 10 * 60 * 1000);
      finalUrl = res.finalUrl || normalized;
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      meta = tide.util.web.parseSiteMeta(res.body, finalUrl);
    } catch (e) {
      const u = new URL(normalized);
      meta = { title: u.hostname.replace(/^www\./, ""), host: u.hostname.replace(/^www\./, ""), iconUrl: new URL("/favicon.ico", normalized).toString(), iconName: tide.util.web.inferIconName("", normalized), warning: e.message || String(e) };
    }
    return { url: finalUrl, ...meta };
  }

  /* ── 只取网站图标，不碰名称与备注 ──
     和 inspect() 的区别：inspect 是「整体识别」（标题 + 图标 + FA 名），
     会覆盖用户手改过的标题；这里只解决「图标不对/是白板」这一件事，
     所以只回写 iconUrl / iconName，其他字段原样保留。 */
  async function fetchIcon(url) {
    const normalized = tide.util.web.normalizeUrl(url);
    let finalUrl = normalized, iconUrl = "", iconName = "";
    try {
      const res = await tide.http.getCached(normalized, 10 * 60 * 1000);
      finalUrl = res.finalUrl || normalized;
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      const meta = tide.util.web.parseSiteMeta(res.body, finalUrl);
      iconUrl = meta.iconUrl || "";
      iconName = meta.iconName || "";
    } catch (e) {
      iconUrl = new URL("/favicon.ico", normalized).toString();
      iconName = tide.util.web.inferIconName("", normalized);
    }
    if (!iconUrl) iconUrl = new URL("/favicon.ico", finalUrl).toString();
    return { iconUrl, iconName: iconName || "globe" };
  }

  /** 顶栏「自动获取网站图标」：拿输入框里的网址试抓一次，只回显结果，不动已有条目。 */
  async function probeIcon() {
    if (busy) return;
    const input = host.querySelector("[data-url]"); const raw = input?.value || "";
    if (!raw.trim()) return tide.notify("请先输入网站地址");
    busy = true; paint();
    try {
      const got = await fetchIcon(raw);
      iconPreview = { url: tide.util.web.normalizeUrl(raw), ...got };
      busy = false; paint();
      tide.notify(got.iconUrl ? `已获取图标：${got.iconUrl.split("/").pop() || got.iconUrl}` : "没有取到图标，已回退为默认域名图标");
    } catch (e) { busy = false; paint(); tide.notify(`获取图标失败：${e.message || e}`); }
  }

  /** 卡片上的「换图标」：只刷新这一个条目的图标。 */
  async function refreshIcon(id) {
    const item = items.find((x) => x.id === id); if (!item) return;
    try {
      const got = await fetchIcon(item.url);
      Object.assign(item, got, { updatedAt: Date.now() });
      await save(); paint(); tide.notify("图标已更新");
    } catch (e) { tide.notify(`获取图标失败：${e.message || e}`); }
  }

  /** 把顶栏预览到的图标落成一条收藏（用输入框里的网址，走一次完整识别拿标题）。 */
  async function savePreviewAsItem() {
    if (!iconPreview || busy) return;
    busy = true; paint();
    try {
      const data = await inspect(iconPreview.url);
      // 图标以用户刚刚预览到的那张为准 —— 说明他就是要这个。
      Object.assign(data, { iconUrl: iconPreview.iconUrl || data.iconUrl, iconName: iconPreview.iconName || data.iconName });
      const existing = items.find((x) => x.url.replace(/\/$/, "") === data.url.replace(/\/$/, ""));
      if (existing) Object.assign(existing, data, { updatedAt: Date.now() });
      else items.unshift({ id: uid(), note: "", createdAt: Date.now(), updatedAt: Date.now(), ...data });
      iconPreview = null;
      await save(); busy = false; paint();
      tide.notify(`已收藏「${data.title}」`);
    } catch (e) { busy = false; paint(); tide.notify(`收藏失败：${e.message || e}`); }
  }

  async function add() {
    if (busy) return;
    const input = host.querySelector("[data-url]"); const raw = input?.value || ""; if (!raw.trim()) return tide.notify("请先输入网站地址");
    busy = true; paint();
    try {
      const data = await inspect(raw);
      const existing = items.find((x) => x.url.replace(/\/$/, "") === data.url.replace(/\/$/, ""));
      if (existing) Object.assign(existing, data, { updatedAt: Date.now() });
      else items.unshift({ id: uid(), note: "", createdAt: Date.now(), updatedAt: Date.now(), ...data });
      await save(); tide.notify(data.warning ? `已收藏；元信息读取失败，已使用域名：${data.warning}` : `已收藏「${data.title}」`);
    } catch (e) { tide.notify(`收藏失败：${e.message || e}`); }
    busy = false; paint();
  }
  async function refresh(id) {
    const item = items.find((x) => x.id === id); if (!item) return;
    try { Object.assign(item, await inspect(item.url), { updatedAt: Date.now() }); await save(); paint(); tide.notify("网站信息已刷新"); }
    catch (e) { tide.notify(`刷新失败：${e.message || e}`); }
  }
  async function render(el) {
    host = el; styles(); items = await tide.storage.get("items", []); if (!Array.isArray(items)) items = [];
    openMode = await tide.storage.get("openMode", DEFAULT_OPEN_MODE); if (!["external", "inside"].includes(openMode)) openMode = DEFAULT_OPEN_MODE;
    await ensureDefaults(); await migrateNotes(); paint();
    host.addEventListener("click", (e) => {
      // ⚠️ 顶栏按钮与卡片按钮必须用**不同**的 data 标记：
      // 两者都叫 data-fetch-icon 的话，这行会抢先命中，卡片的「换图标」永远拿不到 id。
      if (e.target.closest("[data-add]")) return add();
      if (e.target.closest("[data-probe-icon]")) return probeIcon();
      if (e.target.closest("[data-preview-clear]")) { iconPreview = null; return paint(); }
      if (e.target.closest("[data-preview-save]")) return savePreviewAsItem();
      const card = e.target.closest("[data-id]"); if (!card) return; const id = card.dataset.id; const item = items.find((x) => x.id === id); if (!item) return;
      if (e.target.closest("[data-open]")) openItem(item);
      else if (e.target.closest("[data-fetch-icon]")) refreshIcon(id);
      else if (e.target.closest("[data-refresh]")) refresh(id);
      else if (e.target.closest("[data-remove]")) { items = items.filter((x) => x.id !== id); save().then(paint); }
      else if (e.target.closest("[data-save]")) { item.title = card.querySelector("[data-title]").value.trim() || item.title; item.note = card.querySelector("[data-note]").value.trim(); save().then(() => { paint(); tide.notify("已保存"); }); }
    });
    host.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-url]")) add(); });
    host.addEventListener("input", (e) => { if (e.target.matches("[data-search]")) { query = e.target.value; paint(); const next = host.querySelector("[data-search]"); next?.focus(); next?.setSelectionRange(query.length, query.length); } });
    host.addEventListener("change", async (e) => { if (e.target.matches("[data-open-mode]")) { openMode = e.target.value; await tide.storage.set("openMode", openMode); tide.notify(openMode === "inside" ? "网站将在应用内显示" : "网站将在浏览器打开"); paint(); } });
    return () => { if (host === el) host = null; };
  }
  tide.ui.registerView({ id: "web-collector", title: "网页收集", icon: "bookmark", render });
})();
