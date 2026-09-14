// 番茄专注的提醒设置：音效目录、开关分支、以及插件界面的构建。
// 插件源码是 IIFE，这里在 vm 里注入一个 fixture 把它内部的 finish / render / reminder 暴露出来，
// 再用一套极简 DOM 驱动真源码 —— 比读源码猜行为可靠。
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { BUILTIN_SOUNDS, CUSTOM_SOUND_ID, DEFAULT_SOUND_ID, resolveSound, soundLabel, playSound } from '../src/sound.js';

/* ── 一、音效目录 ── */
assert.ok(BUILTIN_SOUNDS.length >= 5, `内置音效太少：${BUILTIN_SOUNDS.length}`);
assert.equal(BUILTIN_SOUNDS[0].id, DEFAULT_SOUND_ID, '默认音必须排在首位');
assert.equal(DEFAULT_SOUND_ID, 'beep', '默认音 id 必须保持 beep —— 老用户的设置里存的就是它');
assert.equal(new Set(BUILTIN_SOUNDS.map((s) => s.id)).size, BUILTIN_SOUNDS.length, '音效 id 不能重复');
for (const preset of BUILTIN_SOUNDS) {
  assert.ok(preset.label && preset.note, `音效 ${preset.id} 缺少 label / note`);
  assert.ok(Array.isArray(preset.tones) && preset.tones.length, `音效 ${preset.id} 没有音调`);
  for (const tone of preset.tones) {
    assert.ok(Number(tone.f) > 0, `音效 ${preset.id} 的频率非法：${tone.f}`);
    assert.ok(Number(tone.d) > 0, `音效 ${preset.id} 的时长非法：${tone.d}`);
    assert.ok(tone.t === undefined || Number(tone.t) >= 0, `音效 ${preset.id} 的起始偏移非法：${tone.t}`);
  }
}
assert.equal(resolveSound('不存在的音效'), DEFAULT_SOUND_ID, '未知音效必须退回默认音，否则到点会一声不响');
assert.equal(resolveSound(CUSTOM_SOUND_ID), CUSTOM_SOUND_ID);
assert.equal(soundLabel(CUSTOM_SOUND_ID), '自定义音频');

// Node 里没有 AudioContext / Audio，playSound 必须自己吞掉异常并如实返回 silent，绝不抛给调用方。
assert.equal(await playSound({}), 'silent');
assert.equal(await playSound({ volume: 0 }), 'silent');
assert.equal(await playSound({ sound: 'custom', customAudio: 'data:audio/mpeg;base64,AA' }), 'silent');
assert.equal(await playSound({ sound: 'chime', volume: 2 }), 'silent');

/* ── 二、应用侧接线 ── */
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const taskReminder = read('../src/taskReminder.js');
assert.match(taskReminder, /import \{ playSound \} from "\.\/sound\.js"/, '任务提醒必须复用共享音效模块');
assert.ok(!/AudioContext/.test(taskReminder), '任务提醒不该再自己维护一份 AudioContext');
assert.match(taskReminder, /return playSound\(\{ sound: c\.sound, volume: level, customAudio: c\.customAudio \}\)/);

const pluginHost = read('../src/pluginHost.js');
assert.match(pluginHost, /import \{ BUILTIN_SOUNDS, playSound, resolveSound \} from "\.\/sound\.js"/);
assert.equal((pluginHost.match(/requirePermission\(man, pid, "sound"\)/g) || []).length, 2, 'tide.sound 的 presets / play 都要校验 sound 权限');
assert.match(pluginHost, /sound: "播放提醒音"/, '新权限缺少中文标签');

const settingsView = read('../src/views/settings.js');
assert.match(settingsView, /for \(const preset of BUILTIN_SOUNDS\)/, '设置页的提示音下拉应来自同一份音效目录');

/* ── 三、插件行为 ── */
const PLUGIN = new URL('../public/plugins/pomodoro/main.js', import.meta.url);
const manifest = JSON.parse(read('../public/plugins/pomodoro/manifest.json'));
assert.ok(manifest.permissions.includes('sound'), '番茄专注的 manifest 必须声明 sound 权限，否则 tide.sound 会被宿主拒绝');
assert.equal(manifest.version, '0.2.0');

const source = fs.readFileSync(PLUGIN, 'utf8');
for (const marker of ['tide.sound.play', 'tide.sound.presets', 'focusNotify', 'focusSound', 'breakNotify', 'breakSound', 'AUDIO_MAX_BYTES', 'readAsDataURL']) {
  assert.ok(source.includes(marker), `番茄专注缺少提醒能力：${marker}`);
}
assert.ok(!/["']#fff["']/.test(source), '按钮文字不能硬编码 #fff —— 深色主题下主色被提亮，白字会糊在亮底上');
assert.match(source, /var\(--on-deep,#fff\)/);

/* 极简 DOM：够 render() 跑起来即可 */
function fakeEl(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    style: { cssText: '', display: '' },
    dataset: {}, children: [], options: [],
    value: '', checked: false, textContent: '', innerHTML: '', title: '',
    files: null, type: '', accept: '', min: '', max: '', step: '', placeholder: '',
    addEventListener: () => {}, click: () => {}, remove: () => {},
    append: (...n) => { node.children.push(...n); },
    appendChild: (n) => { node.children.push(n); return n; },
    replaceChildren: (...n) => { node.children = [...n]; },
    querySelector: () => fakeEl(),
    querySelectorAll: () => [],
    closest: () => null,
  };
  return node;
}

const notified = [];
const played = [];
const storage = new Map();
const uiCtx = vm.createContext({
  console,
  clearInterval: () => {}, setInterval: () => 1,
  document: { createElement: fakeEl, createTextNode: (text) => ({ textContent: text }) },
  tide: {
    storage: {
      async get(key, fallback) { return storage.has(key) ? storage.get(key) : fallback; },
      async set(key, value) { storage.set(key, value); },
    },
    tasks: { list: () => [{ id: 't1', title: '写测试', done: false }], create: (patch) => ({ id: 't1', ...patch }) },
    notify: (msg) => notified.push(msg),
    sound: {
      presets: async () => BUILTIN_SOUNDS.map(({ id, label, note }) => ({ id, label, note })),
      play: (opts) => { played.push(opts); return Promise.resolve('builtin'); },
    },
    events: { emit: () => {}, on: () => {} },
    ui: { registerView: () => {} },
  },
});

vm.runInContext(
  source.replace('  tide.ui.registerView({',
    '  globalThis.__fx = { render, finish, normalizeReminder, MODES,\n'
    + '    get reminder() { return reminder; }, set reminder(v) { reminder = v; },\n'
    + '    setMode(id) { if (id === "custom") { mode = { id: "custom", label: "自定义", min: customMin }; return; } mode = MODES.find((m) => m.id === id); },\n'
    + '    setTaskId(id) { currentTaskId = id; } };\n'
    + '  tide.ui.registerView({'),
  uiCtx,
);
const fx = uiCtx.__fx;
const tick = () => new Promise((r) => setTimeout(r, 0));

// 界面构建本身：提醒面板里的 TDZ / 变量顺序问题会在这里直接抛出来。
fx.render(fakeEl('div'));
await tick();

const base = { focusNotify: true, focusSound: true, breakNotify: true, breakSound: true, sound: 'chime', volume: 0.6, customAudio: null, customAudioName: '' };
const reset = () => { notified.length = 0; played.length = 0; };

/* 专注结束：通知 + 声音都开 */
reset();
fx.reminder = { ...base };
fx.setMode('focus');
await fx.finish();
assert.equal(notified.length, 1, `专注结束应弹 1 条完成通知，实际 ${notified.length}`);
assert.ok(notified[0].includes('完成 1 个番茄'), notified[0]);
// 逐字段比对：对象来自 vm 的另一个 realm，原型不同会让 deepStrictEqual 误判。
assert.equal(played.length, 1, '专注结束应播放一次提示音');
assert.equal(played[0].sound, 'chime', '提示音 id 必须原样传给宿主');
assert.equal(played[0].volume, 0.6, '音量必须原样传给宿主');
assert.equal(played[0].customAudio, null);

/* 关联了任务时，完成后再补一条「下一个番茄继续」 */
reset();
fx.setTaskId('t1');
await fx.finish();
assert.equal(notified.length, 2, `关联任务时应再补 1 条续接提示，实际 ${notified.length}`);
assert.ok(notified[1].includes('写测试'), notified[1]);
fx.setTaskId('');

/* 专注结束：关掉声音，通知照旧 */
reset();
fx.reminder = { ...base, focusSound: false };
await fx.finish();
assert.equal(played.length, 0, '关掉「声音」后不该播放');
assert.equal(notified.length, 1);

/* 专注结束：关掉通知 —— 续接提示也不能漏出来 */
reset();
fx.reminder = { ...base, focusNotify: false };
fx.setTaskId('t1');
await fx.finish();
assert.equal(notified.length, 0, '关掉「通知」后不该弹任何提示');
assert.equal(played.length, 1);
fx.setTaskId('');

/* 休息结束走的是另一组开关 */
reset();
const focusDone = storage.get('doneCount');
fx.reminder = { ...base, breakSound: false, breakNotify: false };
fx.setMode('break');
await fx.finish();
assert.equal(notified.length, 0, '休息结束的通知开关应独立于专注');
assert.equal(played.length, 0);
reset();
fx.reminder = { ...base, breakSound: true, breakNotify: true };
await fx.finish();
assert.equal(played.length, 1);
assert.ok(notified[0].includes('休息结束'), notified[0]);
assert.equal(storage.get('doneCount'), focusDone, '休息不该计入番茄数');

/* 配置损坏的自愈：选了「自定义」但音频没了 → 退回默认音，不能一声不响 */
const healed = fx.normalizeReminder({ ...base, sound: 'custom', customAudio: null, volume: 'x' });
assert.equal(healed.sound, DEFAULT_SOUND_ID);
assert.equal(healed.volume, 0.75);
assert.equal(fx.normalizeReminder({ ...base, focusSound: false, breakNotify: false }).focusSound, false, '关闭状态必须被保留');

console.log('PASS: 番茄专注的提醒开关（专注 / 休息 × 通知 / 声音）、提示音参数、配置自愈与界面构建');
