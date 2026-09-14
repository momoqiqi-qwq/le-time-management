// 提醒声音的单一事实源：内置提示音（Web Audio 现场合成，不需要任何音频资源文件）
// + 用户导入的自定义音频（data URL）。
//
// 三个消费方共用这一份：应用设置页的「任务提醒」、src/taskReminder.js 的到点提醒、
// 插件侧的 tide.sound（见 src/pluginHost.js）。改音效只改这里。

/** 内置提示音。`t` = 相对起始秒数，`f` = 频率 Hz，`d` = 时长秒，`g` = 相对音量。 */
export const BUILTIN_SOUNDS = [
  { id: "beep", label: "清脆提示", note: "短促一声（旧版内置音）", tones: [{ f: 880, d: 0.18 }] },
  { id: "chime", label: "三音铃", note: "上行三音，较悦耳", tones: [
    { f: 659.25, d: 0.22 }, { f: 783.99, t: 0.16, d: 0.22 }, { f: 1046.5, t: 0.32, d: 0.42 },
  ] },
  { id: "bell", label: "钟声", note: "低沉一声，余音长", tones: [
    { f: 233.08, d: 1.4 }, { f: 466.16, t: 0.01, d: 1.05, g: 0.34 }, { f: 1398.5, t: 0.02, d: 0.6, g: 0.1 },
  ] },
  { id: "marimba", label: "木琴", note: "两音轻敲", tones: [
    { f: 523.25, d: 0.3 }, { f: 784, t: 0.14, d: 0.5, g: 0.85 },
  ] },
  { id: "digital", label: "电子哔", note: "两声电子音", tones: [
    { f: 1244.5, d: 0.08, type: "square", g: 0.5 }, { f: 1244.5, t: 0.19, d: 0.08, type: "square", g: 0.5 },
  ] },
  { id: "urgent", label: "急促三连", note: "四声短促，适合催办", tones: [
    { f: 1046.5, d: 0.09 }, { f: 1046.5, t: 0.15, d: 0.09 }, { f: 1046.5, t: 0.3, d: 0.09 }, { f: 1046.5, t: 0.45, d: 0.16 },
  ] },
  { id: "soft", label: "柔和低音", note: "安静场合，音量偏小", tones: [
    { f: 392, d: 0.5, g: 0.7 }, { f: 523.25, t: 0.07, d: 0.55, g: 0.45 },
  ] },
];

/** 自定义音频：值存在配置里，播放时直接交给 <audio>。 */
export const CUSTOM_SOUND_ID = "custom";

export const DEFAULT_SOUND_ID = "beep";

export function isKnownSound(id) {
  return id === CUSTOM_SOUND_ID || BUILTIN_SOUNDS.some((s) => s.id === id);
}

/** 未知 id 一律退回默认音，避免配置损坏后彻底没声音。 */
export function resolveSound(id) {
  return isKnownSound(id) ? id : DEFAULT_SOUND_ID;
}

export function soundLabel(id) {
  if (id === CUSTOM_SOUND_ID) return "自定义音频";
  return BUILTIN_SOUNDS.find((s) => s.id === id)?.label || BUILTIN_SOUNDS[0].label;
}

let audioCtx = null;
function context() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx ||= new Ctx();
  return audioCtx;
}

/** 基准音量系数：与旧版 playReminderSound 的 0.16 保持一致，设置页的百分比刻度才不变味。 */
const BASE_GAIN = 0.16;

/**
 * 播放提醒声音。
 * @returns {Promise<"custom"|"builtin"|"silent">} 实际用了哪一路，测试和日志都靠它。
 */
export async function playSound({ sound = DEFAULT_SOUND_ID, volume = 0.75, customAudio = null } = {}) {
  const level = Math.min(1, Math.max(0, Number(volume) || 0));
  const id = resolveSound(sound);
  if (level <= 0) return "silent";

  if (id === CUSTOM_SOUND_ID) {
    if (customAudio) {
      try {
        const audio = new Audio(customAudio);
        audio.volume = level;
        await audio.play();
        return "custom";
      } catch (e) {
        console.warn("自定义提醒音播放失败，退回内置提示音", e);
      }
    }
    // 自定义音频缺失或播不动 —— 别静默，退到默认音。
    return playBuiltin(DEFAULT_SOUND_ID, level);
  }
  return playBuiltin(id, level);
}

async function playBuiltin(id, level) {
  const preset = BUILTIN_SOUNDS.find((s) => s.id === id) || BUILTIN_SOUNDS[0];
  try {
    const ctx = context();
    if (!ctx) return "silent";
    if (ctx.state === "suspended") await ctx.resume();
    const start = ctx.currentTime;
    for (const tone of preset.tones) {
      const at = start + (tone.t || 0);
      const dur = Math.max(0.02, tone.d || 0.18);
      const peak = Math.max(0.0002, level * BASE_GAIN * (tone.g ?? 1));
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = tone.type || "sine";
      osc.frequency.value = tone.f;
      // 两端都留极短斜坡，避免起停的爆音。
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + Math.min(0.02, dur / 3));
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    }
    return "builtin";
  } catch (e) {
    console.warn("提醒音播放失败", e);
    return "silent";
  }
}
