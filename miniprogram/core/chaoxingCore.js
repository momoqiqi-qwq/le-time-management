// 学习通插件纯逻辑核心（小程序端）。
// 从桌面端 public/plugins/chaoxing-notify/main.js 移植：去掉 DOM / tide.* 依赖，
// 网络一律由页面层通过 pluginNet.js 发起；本文件全部是可被 Node 测试覆盖的纯函数。
// 存储键名与桌面端保持一致（sessionCookie / creds / knownIds / ignoredIds /
// readOverrides / filter / inboxCache / workStatus），备份 JSON 跨端导入后登录态与已读标记可互通。

/* ── Cookie 工具 ── */
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
  return Object.keys(jar).map((k) => k + "=" + jar[k]).join("; ");
}

/* ── DES-ECB / PKCS5（fanyalogin 密码加密，key "u2oh6Vu^"，输出 hex） ──
   纯 JS 实现（FIPS 46-3 标准表），与 Python pyDes.ECB + PAD_PKCS5 结果一致，测试里有已知向量。 */
const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const S = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];
function utf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++; // 代理对
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function toBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}
function permute(bits, table) { return table.map((i) => bits[i - 1]); }
function xor(a, b) { return a.map((v, i) => v ^ b[i]); }
function makeSubkeys(keyBytes8) {
  const k = permute(toBits(keyBytes8), PC1);
  let c = k.slice(0, 28), d = k.slice(28);
  const keys = [];
  for (let r = 0; r < 16; r++) {
    const s = SHIFTS[r];
    c = c.slice(s).concat(c.slice(0, s));
    d = d.slice(s).concat(d.slice(0, s));
    keys.push(permute(c.concat(d), PC2));
  }
  return keys;
}
function feistel(rBits, subkey) {
  const x = xor(permute(rBits, E), subkey);
  const out = [];
  for (let g = 0; g < 8; g++) {
    const b = x.slice(g * 6, g * 6 + 6);
    const row = (b[0] << 1) | b[5];
    const col = (b[1] << 3) | (b[2] << 2) | (b[3] << 1) | b[4];
    const v = S[g][row * 16 + col];
    for (let i = 3; i >= 0; i--) out.push((v >> i) & 1);
  }
  return permute(out, P);
}
function encryptBlock(bits64, subkeys) {
  const b = permute(bits64, IP);
  let l = b.slice(0, 32), r = b.slice(32);
  for (let i = 0; i < 16; i++) {
    const f = feistel(r, subkeys[i]);
    const next = xor(l, f);
    l = r; r = next;
  }
  return permute(r.concat(l), FP); // 最后一轮左右不交换
}
function desEncryptHex(message, key) {
  const kb = utf8Bytes(key);
  if (kb.length !== 8) throw new Error("DES 密钥必须为 8 字节");
  const subkeys = makeSubkeys(kb);
  const data = utf8Bytes(message).slice();
  const pad = 8 - (data.length % 8);
  for (let i = 0; i < pad; i++) data.push(pad); // PKCS5/7
  let hex = "";
  for (let off = 0; off < data.length; off += 8) {
    const bits = encryptBlock(toBits(data.slice(off, off + 8)), subkeys);
    for (let i = 0; i < 64; i += 4) hex += (bits[i] << 3 | bits[i + 1] << 2 | bits[i + 2] << 1 | bits[i + 3]).toString(16);
  }
  return hex;
}

/* ── 文本工具 ── */
function stripHtml(html) {
  return String(html || "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/　/g, " ")
    .replace(/[\u200b\ufeff]/g, "").replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function pad2(n) { return n < 10 ? "0" + n : String(n); }
function timeText(v) {
  const n = Number(v);
  if (Number.isFinite(n) && n > 1000000000) {
    const d = new Date(n > 100000000000 ? n : n * 1000);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  return String(v || "").slice(0, 16);
}

/* ── 通知分类 / 截止时间识别（与桌面端同一套规则） ── */
function classify(item) {
  const t = (item.title || "") + " " + (item.body || "");
  if (/考试|测验|补考|缓考/.test(t)) return "考试";
  if (/作业|习题|任务点/.test(t)) return "作业";
  if (/签到|打卡/.test(t)) return "签到";
  return "通知";
}
function deadline(text) {
  const m = String(text || "").match(/(?:结束时间|截止时间)[：:]\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  return m ? m[1] + " " + m[2].padStart(5, "0") : "";
}

/* ── 通知正文里的真实链接：作业 / 考试页打分排序，图片与接口端点剔掉 ── */
const decodeEntities = (s) => String(s || "")
  .replace(/&amp;/gi, "&").replace(/&#38;/g, "&").replace(/&#x26;/gi, "&")
  .replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
function hostOf(url) {
  const m = String(url || "").match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}
function isAnonymousUrl(url) { return /^sharewh\d*\.xuexi365\.com$/i.test(hostOf(url)); }
const NOT_A_PAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|ico|css|js|woff2?|ttf)(\?|$)/i;
const SHARE_PAGE = (code) => "https://sharewh3.xuexi365.com/share/" + encodeURIComponent(code) + "?t=4";
function linkScore(url) {
  if (/\/work\/|doHomeWorkNew|workId|workRelationId|homework/i.test(url)) return 100;
  if (/\/exam\/|exam-ans|examId|testpaper|mock/i.test(url)) return 90;
  if (/mooc1(-ans)?\.chaoxing\.com|mooc2-ans\.chaoxing\.com/i.test(url)) return 70;
  if (/notice\.chaoxing\.com\/pc\/notice/i.test(url)) return 50;
  if (/^sharewh\d*\.xuexi365\.com$/i.test(hostOf(url))) return 10;
  if (/(^|\.)(chaoxing\.com|xuexi365\.com|chaoxing\.cn)$/i.test(hostOf(url))) return 30;
  return 0;
}
function pickTargetLink(item) {
  const raw = decodeEntities([item && item.raw && item.raw.rtf_content, item && item.raw && item.raw.content, item && item.body].filter(Boolean).join("\n"));
  const found = (raw.match(/https?:\/\/[^\s"'<>，。、）】]+/gi) || [])
    .map((u) => u.replace(/[),.;:!?）】、，。]+$/, ""))
    .filter((u) => !NOT_A_PAGE_RE.test(u) && !/\/notice_data\b/i.test(u));
  const best = found.map((u) => ({ u, s: linkScore(u) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)[0];
  if (best) return best.u;
  return item && item.idCode ? SHARE_PAGE(item.idCode) : "";
}

/* ── 通知归一化（对齐桌面端 normalizeNotice） ── */
function normalizeNotice(it) {
  const body = stripHtml(it.rtf_content) || stripHtml(it.content);
  const id = String(it.idCode || it.id || (it.insertTime || "") + "-" + (it.title || ""));
  const tag = String(it.tag || "");
  return {
    id, idCode: String(it.idCode || ""),
    title: stripHtml(it.title || "(无标题)"), body,
    sender: stripHtml(it.createrName || it.sender || ""),
    time: timeText(it.insertTime || it.sendTime),
    insertTime: Number(it.insertTime || 0),
    unread: !(it.isread === 1 || it.isread === "1" || it.isread === true),
    tag, courseId: (tag.match(/courseId(\d+)/i) || [])[1] || "", raw: it,
  };
}

/* ── 列表筛选 / 待办（对齐桌面端 filteredInbox / todos） ── */
function effUnread(n, readOverrides) {
  return readOverrides.has(n.id) ? readOverrides.get(n.id) === true : !!n.unread;
}
function filteredInbox(inbox, opts) {
  const { ignoredIds, readOverrides, filter } = opts;
  const kw = (filter.kw || "").trim().toLowerCase();
  return (inbox || []).filter((n) => {
    if (ignoredIds.has(n.id)) return false;
    const cat = classify(n);
    if (filter.category !== "全部" && cat !== filter.category) return false;
    if (filter.onlyUnread && !effUnread(n, readOverrides)) return false;
    if (kw && !(n.title + " " + n.body + " " + n.sender).toLowerCase().includes(kw)) return false;
    return true;
  });
}
function todos(inbox, opts) {
  const now = Date.now();
  return filteredInbox(inbox, opts)
    .map((n) => Object.assign({}, n, { dueText: deadline(n.body) }))
    .filter((n) => n.dueText && new Date(n.dueText.replace(" ", "T")).getTime() >= now)
    .sort((a, b) => a.dueText.localeCompare(b.dueText));
}

/* ── 作业提交状态探测：附件 iframe name 是 Base64(URI 编码 JSON) ── */
function parseWorkRef(n) {
  const m = String(n && n.raw && n.raw.rtf_content || "").match(/<iframe[^>]*\bname="([A-Za-z0-9+/=]{40,})"/);
  if (!m) return null;
  try {
    const w = JSON.parse(decodeURIComponent(atob(m[1]))).att_web || {};
    if (!w.url || !w.examOrWorkId) return null;
    return { id: String(w.examOrWorkId), url: w.url };
  } catch (e) { return null; }
}

/* ── 课程学期推断（对齐桌面端 termOf / courseStatus / detectEnrollYear） ── */
function termOf(dateStr) {
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]);
  if (!y || mo < 1 || mo > 12) return null;
  const autumn = mo >= 7;
  const year = autumn ? y : y - 1;
  return { year, half: autumn ? "上" : "下", rank: year * 2 + (autumn ? 0 : 1), label: year + "-" + (year + 1) + " 学年" + (autumn ? "上" : "下") + "学期" };
}
function currentTerm(now) {
  const d = now || new Date();
  return termOf(d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-01");
}
const GRADE_NAMES = ["大一", "大二", "大三", "大四", "大五", "大六"];
function gradeOf(termYear, enrollYear) {
  if (!termYear || !enrollYear) return "";
  const n = termYear - enrollYear + 1;
  if (n < 1) return "入学前";
  return GRADE_NAMES[n - 1] || "大" + n;
}
function detectEnrollYear(courses) {
  const votes = new Map();
  const bump = (y) => { if (y >= 2000 && y <= 2100) votes.set(y, (votes.get(y) || 0) + 1); };
  const years = [];
  for (const c of courses || []) {
    const clazz = String(c && c.clazz || "");
    const text = (c && c.name || "") + " " + clazz;
    let m;
    const reLevel = /(20\d{2})\s*级/g;
    while ((m = reLevel.exec(text))) bump(Number(m[1]));
    const reClz = /(?:^|[^\d])(\d{2})(?=防火|英普|侦查|治安|消防|警犬|法学)/g;
    while ((m = reClz.exec(clazz))) bump(2000 + Number(m[1]));
    const t = termOf(c && c.start);
    if (t) years.push(t.year);
  }
  let best = 0, bestVotes = 0;
  for (const [y, n] of votes) if (n > bestVotes || (n === bestVotes && y > best)) { best = y; bestVotes = n; }
  if (bestVotes) return best;
  return years.length ? Math.min.apply(null, years) : 0;
}
/* 四态：红=未完成（开课学期在未来）、蓝=正在进行、绿=已完成、灰=未知 */
function courseStatus(c, now) {
  const t = termOf(c && c.start);
  if (!t) return "gray";
  const cur = currentTerm(now).rank;
  if (t.rank < cur) return "green";
  if (t.rank === cur) return "blue";
  return "red";
}
const STATUS_META = {
  red: { label: "未完成" },
  blue: { label: "正在进行" },
  green: { label: "已完成" },
  gray: { label: "状态未知" },
};
/* 课程页视图模型：学年分 tab + 学年内按状态分组（对齐桌面端 coursesHtml 的两层结构） */
function courseGroups(courses, now, kw) {
  const all = courses || [];
  const enrollYear = detectEnrollYear(all);
  const q = String(kw || "").trim().toLowerCase();
  const list = q ? all.filter((c) => (c.name + " " + c.teacher + " " + c.clazz).toLowerCase().includes(q)) : all;
  const yearMap = new Map();
  for (const c of list) {
    const t = termOf(c.start);
    const y = t ? t.year : 0;
    if (!yearMap.has(y)) yearMap.set(y, []);
    yearMap.get(y).push(c);
  }
  const years = Array.from(yearMap.keys()).sort((a, b) => ((a === 0 ? 1 : 0) - (b === 0 ? 1 : 0)) || b - a);
  const groupsOf = (y) => {
    const groups = { red: [], blue: [], green: [], gray: [] };
    for (const c of yearMap.get(y) || []) groups[courseStatus(c, now)].push(c);
    return groups;
  };
  return { enrollYear, years, yearMap, groupsOf, yearLabel: (y) => (y === 0 ? "未知学年" : y + "-" + (y + 1) + " 学年") };
}

/* ── 课程列表 HTML 解析（mooc2-ans /visit/courses/list 返回的课程卡片） ── */
function parseCoursesHtml(body) {
  const courses = [];
  const pick = (s, re) => (s.match(re) || [])[1] || "";
  for (const li of String(body || "").split('<li class="course ').slice(1)) {
    const cid = pick(li, /class="courseId"\s+name="courseId"\s+value="(\d+)"/);
    const clz = pick(li, /class="clazzId"\s+name="clazzId"\s+value="(\d+)"/);
    const name = pick(li, /class="course-name[^"]*"\s+[^>]*title="([^"]+)"/);
    if (!cid || !clz || !name) continue;
    courses.push({
      name: stripHtml(name), courseid: cid, clazzid: clz,
      cpi: pick(li, /info="\d+_(\d+)"/),
      teacher: stripHtml(pick(li, /class="line2 color3"[^>]*title="([^"]+)"/)),
      clazz: stripHtml(pick(li, /班级：([^<]+)/)).trim(),
      start: pick(li, /开课时间：\s*(\d{4}-\d{2}-\d{2})/),
      end: pick(li, /开课时间：\s*\d{4}-\d{2}-\d{2}\s*[～~\-]\s*(\d{4}-\d{2}-\d{2})/),
    });
  }
  return courses;
}

/* ── 登录请求体（fanyalogin） ── */
const LOGIN_BODY = (uname, pwdHex) =>
  "fid=-1&uname=" + encodeURIComponent(uname) + "&password=" + encodeURIComponent(pwdHex) +
  "&refer=https%3A%2F%2Fi.chaoxing.com&t=true&forbidotherlogin=0&validate=";
function assertJsonResponse(res, label) {
  const head = String(res.body || res.data || "").slice(0, 500);
  if (/用户登录|passport2\.chaoxing\.com|登录学习通/.test(head)) {
    throw new Error(label + "失败：登录会话已失效，请重新登录");
  }
  if (res.data && typeof res.data === "object") return res.data;
  try { return JSON.parse(res.body || res.data || "{}"); }
  catch (e) { throw new Error(label + "失败：接口返回了非 JSON 内容，可能是会话失效或平台风控"); }
}

module.exports = {
  cookieObject, mergeCookies, desEncryptHex, stripHtml, timeText,
  classify, deadline, normalizeNotice, effUnread, filteredInbox, todos,
  parseWorkRef, pickTargetLink, linkScore, isAnonymousUrl, SHARE_PAGE,
  termOf, currentTerm, gradeOf, detectEnrollYear, courseStatus, STATUS_META, courseGroups,
  parseCoursesHtml, LOGIN_BODY, assertJsonResponse,
};
