// 启动窗口大小：默认开得更大 + 可在「总设置 → 界面与交互」里选。
//
// 这里只测纯逻辑（resolveWindowSize / 夹取 / 偏好归一），Tauri 的 setSize 调用靠
// 「非桌面环境直接返回 applied:false 且不抛异常」来守住 —— 真正的窗口行为只能在装好的桌面版里看。
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  WINDOW_SIZE_PRESETS,
  CUSTOM_SIZE_LIMITS,
  clampWindowSize,
  resolveWindowSize,
  isDesktopRuntime,
  applyWindowSize,
  windowSizeHint,
} from "../src/windowSize.js";
import {
  DEFAULT_UI_PREFERENCES,
  WINDOW_SIZE_MODES,
  WINDOW_SIZE_OPTIONS,
  normalizeUiPreferences,
} from "../src/uiPreferences.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

/* ── 一、默认值：不再写死 1280×820 ── */
assert.equal(DEFAULT_UI_PREFERENCES.startupWindowMode, "auto", "默认必须是「跟随屏幕」，否则小屏用户会被开出屏幕外");
assert.deepEqual([DEFAULT_UI_PREFERENCES.startupWindowWidth, DEFAULT_UI_PREFERENCES.startupWindowHeight], [1440, 900]);
assert.equal(resolveWindowSize({}, null).width, 1440);
assert.equal(resolveWindowSize({}, null).height, 900);

/* ── 二、模式表 / 选项表 / 预设表必须对齐（三处写 id 最容易漂） ── */
assert.deepEqual(WINDOW_SIZE_OPTIONS.map((x) => x[0]), [...WINDOW_SIZE_MODES], "设置页选项必须与模式表逐项对应");
for (const [id, label] of WINDOW_SIZE_OPTIONS) assert.ok(label && label.length > 1, `模式 ${id} 缺中文说明`);
for (const id of Object.keys(WINDOW_SIZE_PRESETS)) {
  assert.ok(WINDOW_SIZE_MODES.includes(id), `预设 ${id} 不在可选模式里，选了会静默回落`);
}
for (const id of ["auto", "full", "custom"]) {
  assert.equal(WINDOW_SIZE_PRESETS[id], undefined, `${id} 是算出来的，不该出现在预设表里`);
}
for (const preset of Object.values(WINDOW_SIZE_PRESETS)) {
  assert.ok(preset.width >= CUSTOM_SIZE_LIMITS.minWidth && preset.height >= CUSTOM_SIZE_LIMITS.minHeight);
  assert.ok(preset.width <= CUSTOM_SIZE_LIMITS.maxWidth && preset.height <= CUSTOM_SIZE_LIMITS.maxHeight);
}

/* ── 三、auto：按屏幕算，且不能比旧默认值小 ── */
const auto = resolveWindowSize({ startupWindowMode: "auto" }, { width: 1920, height: 1040 });
assert.deepEqual(auto, { mode: "size", width: 1651, height: 894 });
assert.ok(auto.width > 1280 && auto.height > 820, `跟随屏幕在 1920×1040 上应大于旧的 1280×820，实际 ${auto.width}×${auto.height}`);
const autoSmall = resolveWindowSize({ startupWindowMode: "auto" }, { width: 1366, height: 768 });
assert.ok(autoSmall.width <= 1366 - 24 && autoSmall.height <= 768 - 24, "小屏上必须缩到可用区域内");
assert.equal(autoSmall.mode, "size");

/* ── 四、预设 + 屏幕夹取 ── */
const largeOnSmallScreen = resolveWindowSize({ startupWindowMode: "large" }, { width: 1366, height: 768 });
assert.deepEqual(largeOnSmallScreen, { mode: "size", width: 1342, height: 744 }, "装不下时要退到「可用区域 − 余量」");
const largeOnBigScreen = resolveWindowSize({ startupWindowMode: "large" }, { width: 2560, height: 1440 });
assert.deepEqual(largeOnBigScreen, { mode: "size", ...WINDOW_SIZE_PRESETS.large }, "装得下就用预设值，不要莫名放大");
assert.deepEqual(resolveWindowSize({ startupWindowMode: "compact" }, null), { mode: "size", ...WINDOW_SIZE_PRESETS.compact });

/* ── 五、自定义尺寸要夹在可用范围内 ── */
assert.deepEqual(clampWindowSize(200, 99999), { width: CUSTOM_SIZE_LIMITS.minWidth, height: CUSTOM_SIZE_LIMITS.maxHeight });
assert.deepEqual(clampWindowSize(99999, 100), { width: CUSTOM_SIZE_LIMITS.maxWidth, height: CUSTOM_SIZE_LIMITS.minHeight });
assert.deepEqual(clampWindowSize("1720", "1080"), { width: 1720, height: 1080 }, "表单送来的字符串数值要能用");
assert.deepEqual(resolveWindowSize({ startupWindowMode: "custom", startupWindowWidth: 1720, startupWindowHeight: 1080 }, { width: 2560, height: 1440 }),
  { mode: "size", width: 1720, height: 1080 });

/* ── 六、full / 未知模式 / 脏输入 ── */
assert.deepEqual(resolveWindowSize({ startupWindowMode: "full" }, { width: 1920, height: 1080 }), { mode: "full" });
for (const bad of [undefined, null, "", "huge", 123, {}]) {
  const out = resolveWindowSize({ startupWindowMode: bad }, { width: 1920, height: 1040 });
  assert.deepEqual(out, { mode: "size", width: 1651, height: 894 }, `模式 ${String(bad)} 必须退回「跟随屏幕」而不是开出 0 尺寸窗口`);
}
assert.ok(resolveWindowSize(null, null).width > 0, "整个偏好丢失时也要给出可用尺寸");

/* ── 七、偏好归一化：非法模式与越界尺寸都要被修正 ── */
assert.equal(normalizeUiPreferences({ startupWindowMode: "huge" }).startupWindowMode, "auto");
assert.equal(normalizeUiPreferences({ startupWindowMode: "full" }).startupWindowMode, "full");
assert.equal(normalizeUiPreferences({ startupWindowWidth: 10 }).startupWindowWidth, CUSTOM_SIZE_LIMITS.minWidth);
assert.equal(normalizeUiPreferences({ startupWindowWidth: 99999 }).startupWindowWidth, CUSTOM_SIZE_LIMITS.maxWidth);
assert.equal(normalizeUiPreferences({ startupWindowHeight: 1 }).startupWindowHeight, CUSTOM_SIZE_LIMITS.minHeight);
assert.equal(normalizeUiPreferences({ startupWindowWidth: "1600" }).startupWindowWidth, 1600);
assert.deepEqual(normalizeUiPreferences({}), DEFAULT_UI_PREFERENCES, "空偏好必须等于默认值（老用户升级后走这条）");

/* ── 八、提示文案 ── */
for (const mode of WINDOW_SIZE_MODES) {
  const hint = windowSizeHint(mode, { startupWindowWidth: 1500, startupWindowHeight: 960 });
  assert.ok(typeof hint === "string" && hint.length > 8, `模式 ${mode} 缺少说明文案`);
  if (!["auto", "full"].includes(mode)) assert.match(hint, /\d+ × \d+/, `模式 ${mode} 的说明里应给出具体尺寸`);
}
assert.match(windowSizeHint("full"), /最大化/);
assert.match(windowSizeHint("auto"), /86%/);

/* ── 九、非桌面环境：不抛异常，如实返回 not-desktop ── */
assert.equal(isDesktopRuntime(), false, "Node 里没有 Tauri，不该被当成桌面端");
const notDesktop = await applyWindowSize(DEFAULT_UI_PREFERENCES);
assert.equal(notDesktop.applied, false);
assert.equal(notDesktop.reason, "not-desktop");

/* ── 十、接线守卫：设置页与启动流程真的用上了 ── */
const mainSrc = read("../src/main.js");
assert.match(mainSrc, /applyWindowSize\(getUiPreferences\(\)\)/, "启动流程必须套用窗口大小设置");
const appearanceSrc = read("../src/views/settings/appearance.js");
for (const marker of ["startupWindowMode", "WINDOW_SIZE_OPTIONS", "立即应用", "windowSizeHint"]) {
  assert.ok(appearanceSrc.includes(marker), `设置页缺少启动窗口大小相关片段：${marker}`);
}
const windowSizeSrc = read("../src/windowSize.js");
assert.ok(!/from\s+"\.\/uiPreferences\.js"/.test(windowSizeSrc), "windowSize 不能反向依赖 uiPreferences，会形成循环导入");

/* ── 十一、窗口初值也一起放大了（老用户重装后不至于还是小小的） ── */
const tauri = JSON.parse(read("../src-tauri/tauri.conf.json"));
const win = tauri.app.windows[0];
assert.ok(win.width > 1280 && win.height > 820, `tauri.conf.json 默认窗口应比原来的 1280×820 大，实际 ${win.width}×${win.height}`);
assert.equal(win.minWidth, 400);
assert.equal(win.minHeight, 560);
assert.ok(win.center === true, "放大后必须居中，否则会溢出屏幕右下");

console.log("PASS: startup window size presets, screen fitting, preference normalization and boot wiring");
