// 任务截止提醒：每个任务可设置截止时刻与多级提前预警。
import * as S from "./store.js";
import { toast } from "./ui.js";

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

let audioCtx = null;
export async function playReminderSound(test = false) {
  const c = cfg();
  if (!c.enabled || c.volume <= 0) return;
  if (c.sound === "custom" && c.customAudio) {
    try {
      const a = new Audio(c.customAudio);
      a.volume = c.volume;
      await a.play();
      return;
    } catch (e) { if (!test) console.warn("自定义提醒音播放失败", e); }
  }
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const gain = audioCtx.createGain();
    const osc = audioCtx.createOscillator();
    gain.gain.value = Math.max(0.001, c.volume * 0.16);
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.18);
  } catch (e) { if (!test) console.warn("提醒音播放失败", e); }
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
