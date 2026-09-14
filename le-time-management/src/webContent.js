// 通用网页内容工具：网页收藏、学校公告等插件共用。
// 只处理 http/https，不执行抓取到的脚本，也不会绕过站点验证码。
export function normalizeWebUrl(input) {
  let raw = String(input || "").trim();
  if (!raw) throw new Error("请输入网站地址");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "https://" + raw;
  const u = new URL(raw);
  if (!/^https?:$/.test(u.protocol)) throw new Error("仅支持 http/https 网站");
  u.hash = "";
  return u.toString();
}

export function resolveWebUrl(href, baseUrl) {
  try {
    const u = new URL(String(href || "").trim(), baseUrl);
    return /^https?:$/.test(u.protocol) ? u.toString() : "";
  } catch { return ""; }
}

// ── 响应体编码 ────────────────────────────────────────────────────────────
// 中文站点常见做法：响应头只给 `text/html`（**不带 charset**），编码只在
// `<meta http-equiv=Content-Type content="text/html; charset=gb2312">` 或
// `<meta charset="gbk">` 里声明。`Response.text()` 按规范恒按 UTF-8 解，
// 这种情况会解出满屏 `�` —— 所以自己按「响应头 → meta → UTF-8」解。
// Rust 侧 `decode_body()` 用同一套优先级，两端行为保持一致。

/** 从 Content-Type 头（或直接喂一个 `<meta>` 标签字符串）里取 charset 标签。 */
export function charsetFromContentType(contentType) {
  const m = String(contentType || "").match(/charset\s*=\s*["']?([\w.-]+)/i);
  return m ? m[1].toLowerCase() : "";
}

/** 从 HTML 头部（前 4KB）的 `<meta>` 里嗅探 charset。 */
export function charsetFromMeta(bytes) {
  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 4096));
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    if (/charset/i.test(tag)) {
      const v = charsetFromContentType(tag);
      if (v) return v;
    }
  }
  return "";
}

/**
 * 正文本身是不是一份标记文档（而不是「含有标记片段的 JSON」）。
 * 首字符必须是 `<`，且 512 字节内出现 html / doctype / head / meta / ?xml 之一。
 * 这道判别是必要的：否则 `{"html":"<meta charset=gbk>"}` 这种 JSON 会被误判成
 * 声明了 gbk，反而把本来正确的 UTF-8 中文解坏。
 */
export function looksLikeMarkup(bytes) {
  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 512)).replace(/^\uFEFF/, "");
  return /^\s*</.test(head) && /<(?:\/?html\b|!doctype\b|head\b|meta\b|\?xml\b)/i.test(head);
}

/**
 * 按声明编码解码响应体：响应头 charset → HTML meta charset → UTF-8 兜底。
 * 只在 content-type 为空或 html/xml、**且正文看起来确实是标记文档**时才嗅探 meta ——
 * JSON 按规范恒 UTF-8，不该被正文里偶然出现的 `<meta charset=...>` 带偏。
 */
export function decodeWebBody(bytes, contentType) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const ct = String(contentType || "").toLowerCase();
  const htmlish = !ct || ct.includes("html") || ct.includes("xml");
  const label = charsetFromContentType(contentType)
    || (htmlish && looksLikeMarkup(buf) ? charsetFromMeta(buf) : "")
    || "utf-8";
  try { return new TextDecoder(label).decode(buf); }
  catch { return new TextDecoder("utf-8").decode(buf); }
}

function cleanText(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
}

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = String(tag || "").match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
}

function metaContent(html, keys) {
  for (const tag of String(html || "").match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
    if (keys.includes(key)) return cleanText(attr(tag, "content"));
  }
  return "";
}

export function inferSiteIconName(title, url) {
  const t = String(title || "").toLowerCase();
  const s = `${title || ""} ${url || ""}`.toLowerCase();
  if (/图书|library|book/.test(t)) return "book-open";
  if (/学校|大学|学院|校园|教务|education/.test(t)) return "school";
  const rules = [
    [/图书|library|book/, "book-open"], [/新闻|news|公告|通知/, "newspaper"],
    [/代码|github|gitlab|developer|开发/, "code"], [/视频|video|bilibili|youtube/, "circle-play"],
    [/音乐|music|audio|网易云|spotify/, "music"], [/邮箱|mail|email/, "envelope"],
    [/云盘|drive|disk|storage/, "cloud"], [/购物|shop|store|商城|taobao|jd\./, "cart-shopping"],
    [/地图|map|导航/, "map-location-dot"], [/论坛|forum|community|社区/, "comments"],
    [/文档|docs|wiki|知识/, "file-lines"], [/日历|calendar/, "calendar-days"],
    [/学校|大学|学院|edu\.|education|教务|校园/, "school"],
  ];
  return rules.find(([re]) => re.test(s))?.[1] || "globe";
}

export function parseSiteMeta(html, baseUrl) {
  const source = String(html || "");
  let title = metaContent(source, ["og:site_name", "application-name"]);
  if (!title) title = cleanText((source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  title = title.replace(/\s*[-_|｜·]\s*(首页|主页|home)\s*$/i, "").trim();
  let iconUrl = "";
  const links = source.match(/<link\b[^>]*>/gi) || [];
  const scored = [];
  for (const tag of links) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) continue;
    const sizes = attr(tag, "sizes");
    const size = Math.max(...(sizes.match(/\d+/g) || [0]).map(Number));
    scored.push({ url: resolveWebUrl(href, baseUrl), score: (rel.includes("apple") ? 20 : 10) + size });
  }
  scored.sort((a, b) => b.score - a.score);
  iconUrl = scored.find((x) => x.url)?.url || resolveWebUrl("/favicon.ico", baseUrl);
  let host = "";
  try { host = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch {}
  return { title: title || host || "未命名网站", iconUrl, iconName: inferSiteIconName(title, baseUrl), host };
}

function extractDate(text, yearHint = new Date().getFullYear()) {
  const s = String(text || "");
  let m = s.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = s.match(/(?:^|\s)(\d{1,2})[月\-\/.](\d{1,2})日?(?:\s|$)/);
  if (m) return `${yearHint}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  return "";
}

function noticeScore(title, href, context) {
  const all = `${title} ${href} ${context}`.toLowerCase();
  let score = 0;
  if (/通知|公告|公示|新闻|要闻|动态|notice|news|announcement/.test(all)) score += 7;
  if (/tzgg|gggs|xwzx|news|notice|article|content|info|show|detail/.test(href.toLowerCase())) score += 5;
  if (/list|news|notice|article|content|item/.test(context.toLowerCase())) score += 3;
  if (/\.(?:s?html?|aspx?)(?:[?#]|$)/i.test(href)) score += 2;
  if (/(?:\/|^)(?:20\d{2})[\/-]?(?:0?[1-9]|1[0-2])/.test(href) || /\/c?\d+(?:a\d+)?\//i.test(href)) score += 2;
  if (/20\d{2}[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}|\d{1,2}[月\-\/.]\d{1,2}日?/.test(context)) score += 2;
  if (/登录|注册|首页|english|更多|more|下一页|上一页|下载|附件/.test(title.toLowerCase())) score -= 8;
  if (title.length >= 8 && title.length <= 80) score += 3;
  return score;
}

export function extractNoticeLinks(html, baseUrl, options = {}) {
  const source = String(html || ""), max = Math.max(1, Math.min(200, Number(options.max) || 80));
  const yearHint = Number(options.yearHint) || new Date().getFullYear();
  const rows = [];
  const seen = new Set();
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(source, "text/html");
    for (const a of doc.querySelectorAll("a[href]")) {
      const title = cleanText(a.textContent || a.getAttribute("title") || "");
      if (title.length < 4) continue;
      const href = resolveWebUrl(a.getAttribute("href"), baseUrl);
      if (!href || /(?:javascript:|#)$/i.test(href)) continue;
      const context = cleanText(a.closest("li,tr,article,section,div")?.textContent || a.parentElement?.textContent || title).slice(0, 260);
      const score = noticeScore(title, href, context);
      if (score < 4) continue;
      const key = href.replace(/[?#].*$/, "");
      if (seen.has(key)) continue; seen.add(key);
      rows.push({ title, url: href, date: extractDate(context, yearHint), score, snippet: context === title ? "" : context.slice(0, 160) });
    }
  } else {
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(source))) {
      const title = cleanText(m[2]); if (title.length < 4) continue;
      const href = resolveWebUrl(attr(m[1], "href"), baseUrl); if (!href) continue;
      const context = cleanText(source.slice(Math.max(0, m.index - 140), Math.min(source.length, re.lastIndex + 140)));
      const score = noticeScore(title, href, context); if (score < 4) continue;
      const key = href.replace(/[?#].*$/, ""); if (seen.has(key)) continue; seen.add(key);
      rows.push({ title, url: href, date: extractDate(context, yearHint), score, snippet: "" });
    }
  }
  rows.sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.score - a.score);
  return rows.slice(0, max);
}

export function detectLoginForm(html, baseUrl) {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const forms = [...doc.querySelectorAll("form")];
  const candidates = forms.map((form) => {
    const inputs = [...form.querySelectorAll("input[name],select[name],textarea[name]")].map((el) => ({
      name: el.getAttribute("name") || "", type: (el.getAttribute("type") || (el.tagName === "INPUT" ? "text" : el.tagName) || "text").toLowerCase(),
      value: el.getAttribute("value") || "", placeholder: el.getAttribute("placeholder") || "",
    }));
    const hasPassword = inputs.some((x) => x.type === "password");
    const text = cleanText(form.textContent || "") + " " + inputs.map((x) => `${x.name} ${x.placeholder}`).join(" ");
    let score = hasPassword ? 20 : 0; if (/登录|统一身份|账号|用户名|login|username|password/i.test(text)) score += 8;
    return { form, inputs, score, text };
  }).sort((a, b) => b.score - a.score);
  const hit = candidates[0]; if (!hit || hit.score < 8) return null;
  const user = hit.inputs.find((x) => /user|account|login|name|xh|gh|username|userid|yhm/i.test(`${x.name} ${x.placeholder}`) && x.type !== "hidden" && x.type !== "password") || hit.inputs.find((x) => ["text", "email", "tel"].includes(x.type));
  const password = hit.inputs.find((x) => x.type === "password");
  const captcha = hit.inputs.find((x) => /captcha|verify|validate|vcode|checkcode|yzm|验证码/i.test(`${x.name} ${x.placeholder}`));
  const img = [...hit.form.querySelectorAll("img[src]")].find((x) => /captcha|verify|validate|vcode|checkcode|yzm|code/i.test(`${x.getAttribute("src")} ${x.getAttribute("id")} ${x.getAttribute("class")} ${x.getAttribute("alt")}`));
  return {
    action: resolveWebUrl(hit.form.getAttribute("action") || baseUrl, baseUrl),
    method: (hit.form.getAttribute("method") || "POST").toUpperCase(),
    fields: hit.inputs,
    usernameField: user?.name || "", passwordField: password?.name || "", captchaField: captcha?.name || "",
    captchaImageUrl: img ? resolveWebUrl(img.getAttribute("src"), baseUrl) : "",
  };
}

export function formEncode(fields) {
  return Object.entries(fields || {}).filter(([k, v]) => k && v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}
