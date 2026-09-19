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
  // 长鸣预设：带 `loop` 而不是 `tones` —— 一个 period 内排完就整段无缝循环，
  // 用于「已到截止时间」的持续催办（见 startAlarmLoop）。period 末尾刻意留白，
  // 循环接缝落在静音上，才不会有每圈一声的咔哒。
  { id: "clock", label: "时钟长鸣", note: "电子钟闹铃，循环不止（持续提醒默认音）", loop: {
    period: 0.9, tones: [
      { f: 1046.5, d: 0.11 }, { f: 783.99, t: 0.15, d: 0.11 },
      { f: 1046.5, t: 0.3, d: 0.11 }, { f: 783.99, t: 0.45, d: 0.11 },
    ],
  } },
];

/** 可循环的长鸣预设 id（设置页的「长鸣音效」只列这些）。 */
export const LOOP_SOUND_IDS = BUILTIN_SOUNDS.filter((s) => s.loop).map((s) => s.id);

/** 默认长鸣音：电子钟闹铃。找不到（预设被删）就退回第一个可循环预设。 */
export const DEFAULT_LOOP_SOUND_ID = LOOP_SOUND_IDS[0] || "clock";

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
  // 长鸣预设（只有 loop）当一次性音效试听时就播满一个 period，听得出节奏。
  const tones = preset.tones || preset.loop?.tones || [];
  try {
    const ctx = context();
    if (!ctx) return "silent";
    if (ctx.state === "suspended") await ctx.resume();
    const start = ctx.currentTime;
    for (const tone of tones) {
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

/* ───────────── 长鸣：持续提醒的循环播放 ───────────── */

/** 一个预设能不能循环。自定义音频靠 `<audio loop>`，内置靠渲染出的 period 缓冲。 */
export function isLoopableSound(id) {
  if (id === CUSTOM_SOUND_ID) return true;
  return LOOP_SOUND_IDS.includes(resolveSound(id));
}

let ring = null;

/**
 * 把一个 period 直接渲染成 PCM 采样，之后交给 AudioBufferSourceNode 做无缝循环。
 *
 * 为什么不用 setInterval 反复排振荡器：那要依赖页面定时器，而 Android 的
 * `WebView.onPause()` 会挂起页面定时器（本项目为此专门在 MainActivity.onPause 里
 * 把 WebView 拉回 running，见 android/gradle/.../MainActivity.kt）。
 * 采样一次算完之后，循环完全跑在音频线程上，一帧 JS 都不用叫。
 */
function renderLoopBuffer(ctx, loop, level) {
  const sr = ctx.sampleRate;
  const period = Math.max(0.2, Number(loop.period) || 0.9);
  const length = Math.max(1, Math.round(period * sr));
  const buffer = ctx.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);
  for (const tone of loop.tones || []) {
    const from = Math.round((Number(tone.t) || 0) * sr);
    const dur = Math.max(0.02, Number(tone.d) || 0.18);
    const count = Math.min(length - from, Math.round(dur * sr));
    if (count <= 0) continue;
    const peak = Math.max(0.0002, level * BASE_GAIN * (tone.g ?? 1));
    // 起停各留几毫秒斜坡：循环接缝与每声起止都不留咔哒。
    const attack = Math.max(1, Math.round(0.006 * sr));
    const release = Math.max(1, Math.round(0.012 * sr));
    for (let i = 0; i < count; i++) {
      const env = Math.min(1, i / attack, (count - i) / release);
      data[from + i] += Math.sin(2 * Math.PI * (Number(tone.f) || 880) * (i / sr)) * env * peak;
    }
  }
  return buffer;
}

function startSynthLoop(id, level) {
  try {
    const ctx = context();
    if (!ctx) return "silent";
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const preset = BUILTIN_SOUNDS.find((s) => s.id === id && s.loop) || BUILTIN_SOUNDS.find((s) => s.loop);
    if (!preset) return "silent";
    const source = ctx.createBufferSource();
    source.buffer = renderLoopBuffer(ctx, preset.loop, level);
    source.loop = true;
    source.connect(ctx.destination);
    source.start(0);
    ring = { source };
    return "loop";
  } catch (e) {
    console.warn("长鸣播放失败", e);
    return "silent";
  }
}

/**
 * 开始长鸣。已在响就先停再起 —— 换音量 / 换音效都走这条，不做原地改参数：
 * 峰值是烧在采样里的，改音量必须重渲染。
 * @returns {("custom"|"loop"|"silent")} 实际用了哪一路。
 */
export function startAlarmLoop({ sound = DEFAULT_LOOP_SOUND_ID, volume = 0.75, customAudio = null } = {}) {
  const level = Math.min(1, Math.max(0, Number(volume) || 0));
  stopAlarmLoop();
  if (level <= 0) return "silent";
  const id = resolveSound(sound);

  if (id === CUSTOM_SOUND_ID && customAudio) {
    try {
      const audio = new Audio(customAudio);
      audio.loop = true;
      audio.volume = level;
      // play() 可能被自动播放策略拒：拒了要退回合成闹铃，不能变成「按了没声音」。
      audio.play().catch((e) => {
        console.warn("自定义长鸣播放失败，退回合成闹铃", e);
        if (ring?.audio === audio) { ring = null; startSynthLoop(DEFAULT_LOOP_SOUND_ID, level); }
      });
      ring = { audio };
      return "custom";
    } catch (e) {
      console.warn("自定义长鸣创建失败，退回合成闹铃", e);
    }
  }
  return startSynthLoop(id, level);
}

/** 停止长鸣。没在响也无害（幂等，供自动停 watchdog 与「停止响铃」按钮共用）。 */
export function stopAlarmLoop() {
  const current = ring;
  ring = null;
  if (!current) return false;
  try {
    current.source?.stop(0);
  } catch {}
  try {
    current.audio?.pause();
  } catch {}
  return true;
}

/** 当前是否正在长鸣。 */
export function alarmRinging() {
  return !!ring;
}
