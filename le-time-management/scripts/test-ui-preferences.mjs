import assert from "node:assert/strict";
import { DEFAULT_UI_PREFERENCES, TEXT_SCALE_LIMITS, normalizeUiPreferences } from "../src/uiPreferences.js";

assert.deepEqual(normalizeUiPreferences({}), DEFAULT_UI_PREFERENCES);
assert.equal(normalizeUiPreferences({ density: "weird" }).density, "compact");
assert.equal(normalizeUiPreferences({ motion: "none" }).motion, "system");
assert.equal(normalizeUiPreferences({ startupView: "settings" }).startupView, "last");
// v0.55.0 起区间 80~150（TEXT_SCALE_LIMITS 单一事实源），步进仍 5
assert.equal(normalizeUiPreferences({ textScale: 117 }).textScale, 115);
assert.equal(normalizeUiPreferences({ textScale: 999 }).textScale, TEXT_SCALE_LIMITS.max);
assert.equal(normalizeUiPreferences({ textScale: 1 }).textScale, TEXT_SCALE_LIMITS.min);
assert.equal(normalizeUiPreferences({ textScale: 80 }).textScale, 80);
assert.equal(normalizeUiPreferences({ textScale: 150 }).textScale, 150);
assert.equal(normalizeUiPreferences({ textScale: 78 }).textScale, 80);   // 下边界外夹回
assert.equal(normalizeUiPreferences({ textScale: 152 }).textScale, 150); // 上边界外夹回
assert.equal(normalizeUiPreferences({ textScale: 84 }).textScale, 85);   // 步进对齐
assert.equal(normalizeUiPreferences({ textScale: "110" }).textScale, 110);
assert.equal(normalizeUiPreferences({ swipeNavigation: false }).swipeNavigation, false);
assert.equal(normalizeUiPreferences({ showTopStats: false }).showTopStats, false);
assert.equal(normalizeUiPreferences({ centerTopStats: true }).centerTopStats, true);
assert.equal(normalizeUiPreferences({ centerTopStats: "true" }).centerTopStats, false);
assert.equal(normalizeUiPreferences({ showViewSubtitle: false }).showViewSubtitle, false);
// 底栏高度档位：非法值回标准档，三档合法值原样保留（CSS 变量消费，见 styles.css :root[data-navbar]）
assert.equal(normalizeUiPreferences({ navBarSize: "weird" }).navBarSize, "standard");
for (const id of ["compact", "standard", "relaxed"]) {
  assert.equal(normalizeUiPreferences({ navBarSize: id }).navBarSize, id);
}

console.log("PASS: UI preference normalization and compatibility defaults");
