// 网页收藏 / RSS 小程序原生能力：相同存储键和条目 id，联网只在用户明确刷新时发生。
const store = require("./store.js");
const R = require("./rssModel.js");
const net = require("./pluginNet.js");
const flow = require("./captureFlow.js");
const BOOKS = "web-collector", RSS = "rss-reader";
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function rows(id, key) { const data = store.pluginStorageGet(id, key, []); return Array.isArray(data) ? data : []; }
function safeUrl(value) {
  const raw = String(value || "").trim();
  if (/[\s<>"'`\\\u0000-\u001f]/.test(raw)) throw new Error("网址包含无效字符");
  const url = R.normalizeFeedUrl(raw);
  if (!url || !/^https?:\/\/[^/?#@\s:]+(?::\d{1,5})?(?:[/?#]|$)/i.test(url)) throw new Error("请输入有效的 http / https 网址");
  return url;
}
function bookmarks(query) {
  const q = String(query || "").trim().toLowerCase();
  return rows(BOOKS, "items").filter(x => x && x.id).filter(x => !q || [x.title, x.url, x.note, x.host].join(" ").toLowerCase().includes(q));
}
function saveBookmark(input) {
  const list = clone(rows(BOOKS, "items")), url = safeUrl(input.url);
  const existing = list.find(x => x.id === input.id);
  const duplicate = list.find(x => x.url === url && x.id !== input.id);
  if (duplicate) throw new Error("这个网址已收藏，可搜索后编辑原条目");
  const item = Object.assign({}, existing || {}, input, { id: existing ? existing.id : store.uid("web"), url, host: R.hostOf(url),
    title: String(input.title || R.hostOf(url)).trim().slice(0, 180), note: String(input.note || "").slice(0, 4000),
    createdAt: existing ? existing.createdAt : Date.now(), updatedAt: Date.now(), iconName: (existing && existing.iconName) || "globe" });
  if (existing) list[list.indexOf(existing)] = item; else list.unshift(item);
  store.pluginStorageSet(BOOKS, "items", list); return item;
}
function deleteBookmark(id) { store.pluginStorageSet(BOOKS, "items", rows(BOOKS, "items").filter(x => x.id !== id)); }
function feeds() {
  const raw = store.pluginStorageGet(RSS, "feeds", null);
  if (Array.isArray(raw)) return raw.filter(x => x && x.id && x.url);
  const defaults = R.DEFAULT_FEEDS.map((f, i) => makeFeed(f.url, f.title, i));
  store.pluginStorageSet(RSS, "feeds", defaults); return defaults;
}
function makeFeed(url, title, index) {
  return { id: R.hashId(url), url, title: title || R.hostOf(url), color: R.FEED_COLORS[(index || 0) % R.FEED_COLORS.length], enabled: true, addedAt: Date.now(), lastAt: 0, lastError: "", count: 0 };
}
function saveFeed(input) {
  const list = clone(feeds()), url = safeUrl(input.url);
  const existing = input.id && list.find(x => x.id === input.id);
  if (existing && existing.url !== url) throw new Error("修改地址请新增订阅源，避免已有已读/星标失去关联");
  if (list.some(x => x.url === url && x.id !== input.id)) throw new Error("已经订阅这个地址");
  const record = Object.assign({}, existing || makeFeed(url, input.title, list.length), { title: String(input.title || R.hostOf(url)).slice(0, 120) });
  if (existing) list[list.indexOf(existing)] = record; else list.push(record);
  store.pluginStorageSet(RSS, "feeds", list); return record;
}
function setFeedEnabled(id, enabled) { store.pluginStorageSet(RSS, "feeds", feeds().map(f => f.id === id ? Object.assign({}, f, { enabled: !!enabled }) : f)); }
function deleteFeed(id) {
  store.batchChanges(() => {
    store.pluginStorageSet(RSS, "feeds", feeds().filter(f => f.id !== id));
    store.pluginStorageSet(RSS, "items", rows(RSS, "items").filter(item => item.feedId !== id));
  });
}
function items(options) {
  const opt = options || {}, q = String(opt.query || "").trim().toLowerCase();
  return rows(RSS, "items").filter(x => x && x.id && x.feedId)
    .filter(x => !opt.feedId || opt.feedId === "all" || x.feedId === opt.feedId)
    .filter(x => !opt.unread || !x.read).filter(x => !opt.star || x.star)
    .filter(x => !q || [x.title, x.snippet, x.author].join(" ").toLowerCase().includes(q))
    .slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}
function updateItem(id, patch) { store.pluginStorageSet(RSS, "items", rows(RSS, "items").map(x => x.id === id ? Object.assign({}, x, patch) : x)); }
function markVisibleRead(ids) {
  const set = new Set(ids); store.pluginStorageSet(RSS, "items", rows(RSS, "items").map(x => set.has(x.id) ? Object.assign({}, x, { read: true }) : x));
}
function mergeFeed(feed, parsed) {
  const map = new Map(rows(RSS, "items").filter(x => x && x.id).map(x => [x.id, clone(x)]));
  let added = 0;
  parsed.items.forEach(raw => {
    const id = feed.id + ":" + R.hashId(raw.key), previous = map.get(id);
    if (previous) {
      for (const key of ["title", "link", "date", "author", "snippet", "cover"]) if (raw[key]) previous[key] = raw[key];
    } else {
      map.set(id, { id, feedId: feed.id, title: raw.title, link: raw.link, date: raw.date, author: raw.author, snippet: raw.snippet, cover: raw.cover, read: false, star: false }); added++;
    }
  });
  const all = [...map.values()].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  // 只裁已读且未收藏的旧缓存，绝不偷偷丢掉未读或星标。
  const countByFeed = {}, kept = []; let ordinary = 0;
  all.forEach(item => {
    if (!item.read || item.star || ((countByFeed[item.feedId] || 0) < 60 && ordinary < 600)) {
      kept.push(item);
      if (item.read && !item.star) { countByFeed[item.feedId] = (countByFeed[item.feedId] || 0) + 1; ordinary++; }
    }
  });
  const next = clone(store.getState()), record = next.plugins[RSS] || { enabled:true, storage:{} };
  record.storage = Object.assign({}, record.storage, {
    items:kept, fetchedAt:Date.now(),
    feeds:feeds().map(f => f.id === feed.id ? Object.assign({}, f, { title:f.title || parsed.title, lastAt:Date.now(), lastError:"", count:kept.filter(x => x.feedId === f.id).length }) : clone(f)),
  });
  next.plugins[RSS] = record;
  store.commitSnapshot(next); // XML 导入/刷新也要确认保存成功，不能只改内存后提示完成。
  return added;
}
function importFeedText(id, text) {
  const feed = feeds().find(f => f.id === id); if (!feed) throw new Error("请先选择订阅源");
  const parsed = R.parseFeed(text, feed.url); if (!parsed) throw new Error("没有识别到 RSS / Atom / RDF 内容");
  return { added: mergeFeed(feed, parsed), count: parsed.items.length };
}
async function refreshFeed(id) {
  const feed = feeds().find(f => f.id === id), owner = store.getState();
  if (!feed || feed.enabled === false) throw new Error("订阅源未启用");
  if (!/^https:\/\//i.test(feed.url)) throw new Error("小程序刷新需要 HTTPS；HTTP 源可使用离线 XML 导入");
  try {
    const response = await net.request({ url: safeUrl(feed.url), dataType: "text", timeout: 15000 });
    if (store.getState() !== owner) throw new Error("数据已被恢复或替换，请重新刷新");
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error("订阅源返回 HTTP " + response.statusCode);
    if (typeof response.data !== "string" || response.data.length > 2 * 1024 * 1024) throw new Error("订阅内容无效或超过 2MB");
    if (!store.isPluginEnabled(RSS) || !feeds().some(f => f.id === id && f.enabled !== false)) throw new Error("订阅源已停用或移除");
    return importFeedText(id, response.data);
  } catch (error) {
    let message = (error && (error.message || error.errMsg)) || "刷新失败";
    if (/domain|url not in|合法域名/i.test(message)) message = "微信未允许此订阅域名，请在小程序后台配置 request 合法域名；也可离线导入 XML";
    if (store.getState() === owner) store.pluginStorageSet(RSS, "feeds", feeds().map(f => f.id === id ? Object.assign({}, f, { lastError: message }) : f));
    throw new Error(message);
  }
}
function itemToTask(id) {
  const item = rows(RSS, "items").find(x => x.id === id); if (!item) return null;
  if (item.taskId && store.taskById(item.taskId)) return store.taskById(item.taskId);
  const cap = flow.buildCapture([item.title, item.snippet].filter(Boolean).join("\n"));
  let task;
  store.batchChanges(() => {
    task = store.addTask({ title: item.title, note: [item.snippet, item.link].filter(Boolean).join("\n\n"), quad: cap.quad, estMin: cap.estMin,
      due: cap.due || null, dueTime: cap.hasTime ? cap.start : "23:59", tags: ["RSS"], sourcePlugin: RSS, sourceItemId: item.id });
    updateItem(id, { taskId: task.id, read: true });
  });
  return task;
}
function exportData(id) {
  if (![BOOKS, RSS].includes(id)) throw new Error("不支持的资料类型");
  const record = store.pluginState(id);
  return JSON.stringify({ plugin: id, storage: clone(record.storage), exportedAt: new Date().toISOString() }, null, 2);
}
function importData(id, text) {
  const transfer = require("./transfer.js");
  const parsed = transfer.parseJson(text), app = parsed && parsed.format === "le-time-backup" ? parsed.data : parsed;
  const data = (app && app.plugins && app.plugins[id] && app.plugins[id].storage) || (parsed && parsed.storage) || (Array.isArray(parsed) ? { items: parsed } : parsed);
  if (!data || !Array.isArray(data.items) || (id === RSS && !Array.isArray(data.feeds))) throw new Error("资料文件格式不匹配");
  const next = clone(store.getState()), old = next.plugins[id] || { enabled: true, storage: {} };
  const current = old.storage || {}, patch = Object.assign({}, data, current);
  let added = 0;
  if (id === BOOKS) {
    const list = clone(Array.isArray(current.items) ? current.items : []), urls = new Set(list.map(x => x.url)), ids = new Set(list.map(x => x.id));
    data.items.forEach(row => {
      if (!row || typeof row !== "object") throw new Error("收藏条目格式无效");
      const url = safeUrl(row.url); if (urls.has(url)) return;
      const key = typeof row.id === "string" && row.id && !ids.has(row.id) ? row.id : store.uid("web");
      list.push(Object.assign({}, row, { id: key, url, title: String(row.title || R.hostOf(url)), host: R.hostOf(url) }));
      ids.add(key); urls.add(url); added++;
    }); patch.items = list;
  } else if (id === RSS) {
    const feedList = clone(Array.isArray(current.feeds) ? current.feeds : []), feedIds = new Set(feedList.map(x => x.id));
    data.feeds.forEach(feed => {
      if (!feed || !feed.id || typeof feed.id !== "string") throw new Error("订阅源 id 无效");
      safeUrl(feed.url);
      if (!feedIds.has(feed.id)) { feedList.push(feed); feedIds.add(feed.id); }
    });
    const list = clone(Array.isArray(current.items) ? current.items : []), ids = new Set(list.map(x => x.id));
    data.items.forEach(item => {
      if (!item || typeof item.id !== "string" || typeof item.feedId !== "string") throw new Error("RSS 条目格式无效");
      if (!ids.has(item.id)) { list.push(item); ids.add(item.id); added++; }
    });
    patch.feeds = feedList; patch.items = list;
  } else throw new Error("不支持的资料类型");
  old.storage = patch; next.plugins[id] = old; store.commitSnapshot(next); return added;
}
module.exports = { exportData, importData, BOOKS, RSS, safeUrl, bookmarks, saveBookmark, deleteBookmark, feeds, saveFeed, setFeedEnabled, deleteFeed, items, updateItem, markVisibleRead, importFeedText, refreshFeed, itemToTask };
