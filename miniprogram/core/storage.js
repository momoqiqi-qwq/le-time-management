// 小程序持久化：小快照直接保存，大快照分块后原子切换清单。
// 不改备份的数据结构；旧 key 只读迁移，绝不删除旧用户数据。
const KEY = "letime-data";
const LEGACY_KEY = "tidebalance-data";
const PREFIX = KEY + ":part:";
const FORMAT = "utime-chunks-v1";
let sequence = 0;
const CHUNK_CHARS = 180000; // UTF-8 最坏情况下也远低于单 key 容量。

function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
function partKeys(record) {
  if (!record || record.format !== FORMAT) return [];
  if (!/^[a-z0-9-]+$/.test(record.generation || "") || !Number.isInteger(record.count) || record.count < 1 || record.count > 100) {
    throw new Error("本机数据清单损坏，请从备份恢复");
  }
  return Array.from({ length: record.count }, (_, i) => PREFIX + record.generation + ":" + i);
}
function decode(record) {
  if (!record) return null;
  if (record.format !== FORMAT) return typeof record === "string" ? JSON.parse(record) : record;
  const text = partKeys(record).map(key => {
    const part = wx.getStorageSync(key);
    if (typeof part !== "string") throw new Error("本机数据分块缺失，请从备份恢复");
    return part;
  }).join("");
  if (text.length !== record.length || checksum(text) !== record.checksum) throw new Error("本机数据校验失败，请从备份恢复");
  return JSON.parse(text);
}
function read() {
  const current = wx.getStorageSync(KEY);
  if (current) return { data: decode(current), legacy: false };
  const legacy = wx.getStorageSync(LEGACY_KEY);
  return { data: legacy ? decode(legacy) : null, legacy: !!legacy };
}
function removeKeys(keys) {
  if (typeof wx.removeStorageSync !== "function") return;
  keys.forEach(key => { try { wx.removeStorageSync(key); } catch (e) { /* 只清理自己的过期分块，不影响已提交快照 */ } });
}
function write(data) {
  const text = JSON.stringify(data);
  if (typeof text !== "string") throw new Error("数据无法保存");
  const previous = wx.getStorageSync(KEY);
  let oldParts = [];
  try { oldParts = partKeys(previous); } catch (e) { /* 显式恢复可覆盖损坏清单，但不猜测要删除的键 */ }
  if (text.length <= CHUNK_CHARS) {
    try { wx.setStorageSync(KEY, data); }
    catch (error) {
      let committed = false;
      try { committed = JSON.stringify(wx.getStorageSync(KEY)) === text; } catch (ignored) {}
      if (!committed) throw error;
    }
    removeKeys(oldParts);
    return;
  }
  let generation = Date.now().toString(36) + "-" + (++sequence).toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  if (previous && previous.generation === generation) generation += "-next";
  const count = Math.ceil(text.length / CHUNK_CHARS);
  if (count > 100) throw new Error("备份过大，请先在桌面端清理缓存或附件");
  const written = []; let headAttempted = false;
  try {
    for (let i = 0; i < count; i++) {
      const key = PREFIX + generation + ":" + i;
      wx.setStorageSync(key, text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
      written.push(key);
    }
    // 清单是提交点：写失败仍指向上一份完整快照。
    const head = { format: FORMAT, generation, count, length: text.length, checksum: checksum(text) };
    headAttempted = true;
    try { wx.setStorageSync(KEY, head); }
    catch (error) {
      let committed = false;
      try { const saved = wx.getStorageSync(KEY); committed = saved && saved.generation === generation && saved.count === count && saved.checksum === head.checksum; } catch (ignored) {}
      if (!committed) throw error;
    }
  } catch (e) {
    // 回执不明时不能删掉可能已被清单引用的分块。只在确认未提交时回收。
    let safeToRemove = !headAttempted;
    if (headAttempted) { try { const saved = wx.getStorageSync(KEY); safeToRemove = !saved || saved.generation !== generation; } catch (ignored) {} }
    if (safeToRemove) removeKeys(written);
    throw e;
  }
  removeKeys(oldParts);
}
module.exports = { KEY, LEGACY_KEY, CHUNK_CHARS, read, write };
