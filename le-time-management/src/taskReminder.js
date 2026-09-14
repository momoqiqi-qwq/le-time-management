// 任务截止提醒：每个任务可设置截止时刻与多级提前预警。
import * as S from "./store.js";
import { toast } from "./ui.js";
import { playSound } from "./sound.js";

export const PRESET_OFFSETS = [1440, 120, 60, 30, 10, 5, 0];
export const DEFAULT_REMINDER_SETTINGS = {
  enabled: true,
  volume: 0.75,
  sound: "beep",
  customAudio: null,
  defaultOffsets: [60, 10, 0],
};

function cfg() {
  const st = S.getState().settings;
  st.taskReminder ??= {};
  const c = st.taskReminder;
  for (const [k, v] of Object.entries(DEFAULT_REMINDER_SETTINGS)) if (c[k] === undefined) c[k] = Array.isArray(v) ? [...v] : v;
  c.volume = Math.min(1, Math.max(0, Number(c.volume) || 0));
  c.defaultOffsets = normalizeOffsets(c.defaultOffsets);
  st.taskReminderLog ??= {};
  return c;
}

export function normalizeOffsets(input) {
  return [...new Set((Array.isArray(input) ? input : []).map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 43200).map(Math.round))].sort((a, b) => b - a);
}

export function dueAt(task) {
  if (!task?.due) return null;
  const time = /^\d{2}:\d{2}$/.test(task.dueTime || "") ? task.dueTime : "23:59";
  const d = new Date(`${task.due}T${time}:00`);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

export function taskOffsets(task) {
  if (task?.reminderEnabled === false) return [];
  const own = Array.isArray(task?.reminderOffsets) ? normalizeOffsets(task.reminderOffsets) : null;
  return own ?? cfg().defaultOffsets;
}

export function reminderLabel(offset) {
  if (offset === 0) return "已到截止时间";
  if (offset < 60) return `还有 ${offset} 分钟截止`;
  if (offset % 1440 === 0) return `还有 ${offset / 1440} 天截止`;
  if (offset % 60 === 0) return `还有 ${offset / 60} 小时截止`;
  return `还有 ${Math.floor(offset / 60)} 小时 ${offset % 60} 分钟截止`;
}

export function dueReminderEvents(tasks, now = Date.now(), windowMs = 90000) {
  const out = [];
  for (const task of tasks || []) {
    if (!task || task.done || task.reminderEnabled === false) continue;
    const due = dueAt(task);
    if (!due) continue;
    for (const offset of taskOffsets(task)) {
      const at = due - offset * 60000;
      if (now >= at && now - at <= windowMs) out.push({ task, offset, at, due, key: `${task.id}:${due}:${offset}` });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * 播放提醒音。音效目录与合成逻辑在 src/sound.js（插件侧的 tide.sound 走的是同一份）。
 * @param {boolean} test 设置页的「试听」：忽略「启用提醒」开关，且音量有可听见的下限，
 *   否则用户关着提醒点试听会毫无反应、以为坏了。
 */
export async function playReminderSound(test = false) {
  const c = cfg();
  const level = test ? Math.max(c.volume, 0.3) : c.volume;
  if ((!test && !c.enabled) || level <= 0) return "silent";
  return playSound({ sound: c.sound, volume: level, customAudio: c.customAudio });
}

function notifyEvent(ev) {
  const text = `${ev.task.title} · ${reminderLabel(ev.offset)}`;
  toast(text);
  playReminderSound();
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification("Le时间管理 · 任务提醒", { body: text }); } catch {}
  }
}

let timer = null;
function nextReminderDelay(tasks, now = Date.now()) {
  let next = Infinity;
  for (const task of tasks || []) {
    if (!task || task.done || task.reminderEnabled === false) continue;
    const due = dueAt(task); if (!due) continue;
    for (const offset of taskOffsets(task)) {
      const at = due - offset * 60000;
      if (at > now && at < next) next = at;
    }
  }
  // 没有临近提醒时最多每 5 分钟巡检一次；有提醒则精准唤醒。
  return Number.isFinite(next) ? Math.max(1000, Math.min(300000, next - now)) : 300000;
}
export function initTaskReminders() {
  cfg();
  let disposed = false;
  const schedule = (delay) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delay);
  };
  const tick = () => {
    if (disposed) return;
    const c = cfg();
    const now = Date.now();
    if (c.enabled) {
      const log = S.getState().settings.taskReminderLog;
      let dirty = false;
      for (const ev of dueReminderEvents(S.getState().tasks, now)) {
        if (log[ev.key]) continue;
        log[ev.key] = now; dirty = true;
        notifyEvent(ev);
      }
      const cutoff = now - 90 * 86400000;
      for (const [k, t] of Object.entries(log)) if (Number(t) < cutoff) { delete log[k]; dirty = true; }
      if (dirty) S.persistSoon();
    }
    schedule(nextReminderDelay(S.getState().tasks, now));
  };
  const onVisibility = () => { if (!document.hidden) { if (timer) clearTimeout(timer); tick(); } };
  const unsub = S.subscribe(() => schedule(250));
  document.addEventListener("visibilitychange", onVisibility);
  tick();
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer); timer = null;
    unsub();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
