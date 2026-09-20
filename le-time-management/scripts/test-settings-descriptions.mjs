import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const prefs = read("../src/uiPreferences.js");
const appearance = read("../src/views/settings/appearance.js");
const styles = read("../src/styles.css");
const search = read("../src/settingsSearchIndex.js");

assert.match(prefs, /showSettingsDescriptions:\s*true/, "设置说明默认应显示，兼容旧数据");
assert.match(prefs, /next\.showSettingsDescriptions\s*=\s*next\.showSettingsDescriptions\s*!==\s*false/);
assert.match(prefs, /dataset\.settingsDescriptions\s*=\s*cfg\.showSettingsDescriptions\s*\?\s*"on"\s*:\s*"off"/);

assert.match(appearance, /},\s*"无描述"\s*\),/, "界面预设中应有“无描述”按钮");
assert.match(appearance, /applyPreset\("无描述",\s*\{\s*showSettingsDescriptions:\s*false\s*\}\)/);
assert.match(appearance, /aria-pressed/, "无描述按钮应暴露按下状态");
assert.match(search, /无描述 隐藏说明/, "全局设置搜索应能找到无描述模式");

assert.match(styles, /:root\[data-settings-descriptions="off"\] \.settings-nav-item-copy small/);
assert.match(styles, /:root\[data-settings-descriptions="off"\] \.settings-section \.setting-copy small/);
assert.match(styles, /\.pref-no-description\.on/, "启用后按钮需要明确选中态");

console.log("PASS: 设置中心无描述模式（持久化 / 搜索 / 导航与内容说明隐藏 / 按钮状态）");
