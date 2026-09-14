import assert from "node:assert/strict";
import { DEFAULT_UI_PREFERENCES, normalizeUiPreferences } from "../src/uiPreferences.js";

assert.deepEqual(normalizeUiPreferences({}), DEFAULT_UI_PREFERENCES);
assert.equal(normalizeUiPreferences({ density: "weird" }).density, "comfortable");
assert.equal(normalizeUiPreferences({ motion: "none" }).motion, "system");
assert.equal(normalizeUiPreferences({ startupView: "settings" }).startupView, "last");
assert.equal(normalizeUiPreferences({ textScale: 117 }).textScale, 115);
assert.equal(normalizeUiPreferences({ textScale: 999 }).textScale, 120);
assert.equal(normalizeUiPreferences({ textScale: 1 }).textScale, 90);
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
