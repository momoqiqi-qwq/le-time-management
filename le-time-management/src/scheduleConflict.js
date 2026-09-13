// 日程冲突检测 2.0：统一提供冲突预览与候选空闲时段。
// 纯函数，供时间块 UI、捕获流程和插件宿主复用。

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

export function blockRange(block) {
  const start = typeof block.startMin === "number" ? block.startMin : minutesOf(block.start);
  const dur = Math.max(1, Number(block.durMin) || 30);
  return { start, end: start + dur, durMin: dur };
}

export function minutesOf(hhmm) {
  if (typeof hhmm === "number") return hhmm;
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function hhmmOf(min) {
  const safe = clamp(Math.round(Number(min) || 0), 0, 1440);
  if (safe === 1440) return "24:00";
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function conflictsFor(blocks, proposal, ignoreId = null) {
  const p = blockRange(proposal);
  return (blocks || []).filter((b) => {
    if (ignoreId && b.id === ignoreId) return false;
    const r = blockRange(b);
    return p.start < r.end && p.end > r.start;
  });
}

export function findAlternatives(blocks, proposal, options = {}) {
  const dayStart = Number(options.dayStart ?? 7 * 60);
  const dayEnd = Number(options.dayEnd ?? 24 * 60);
  const step = Math.max(5, Number(options.step ?? 15));
  const limit = Math.max(1, Number(options.limit ?? 4));
  const ignoreId = options.ignoreId ?? null;
  const p = blockRange(proposal);
  const maxStart = dayEnd - p.durMin;
  if (maxStart < dayStart) return [];

  const candidates = [];
  const seen = new Set();
  const desired = clamp(p.start, dayStart, maxStart);
  const pushIfFree = (start) => {
    start = Math.round(start / step) * step;
    if (start < dayStart || start > maxStart || seen.has(start)) return;
    seen.add(start);
    const hit = conflictsFor(blocks, { startMin: start, durMin: p.durMin }, ignoreId);
    if (!hit.length) candidates.push({ startMin: start, start: hhmmOf(start), durMin: p.durMin });
  };

  // 优先找原时间之后，再找之前；距离相同则更早的排后面，减少“往回挪”造成错过。
  pushIfFree(desired);
  for (let delta = step; candidates.length < limit && (desired + delta <= maxStart || desired - delta >= dayStart); delta += step) {
    pushIfFree(desired + delta);
    if (candidates.length >= limit) break;
    pushIfFree(desired - delta);
  }
  return candidates.slice(0, limit);
}

export function previewSchedule(blocks, proposal, options = {}) {
  const ignoreId = options.ignoreId ?? null;
  const conflicts = conflictsFor(blocks, proposal, ignoreId);
  const alternatives = conflicts.length ? findAlternatives(blocks, proposal, options) : [];
  return { ok: conflicts.length === 0, conflicts, alternatives };
}
