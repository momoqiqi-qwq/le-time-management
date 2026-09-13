import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const shell = read("../src/shell.js");
const pluginSettings = read("../src/views/settings/plugins.js");
const pluginHost = read("../src/pluginHost.js");
const icons = read("../src/icons.js");
const cppu = read("../public/plugins/cppu-notify/main.js");

assert.doesNotMatch(shell, /权限\s*\/\s*管理/);
assert.doesNotMatch(pluginSettings, /getPluginPermissions|setPluginPermission|plugin-perm/);
assert.doesNotMatch(pluginHost, /export function getPluginPermissions|export async function setPluginPermission/);
assert.match(shell, /market-plugin-switch/);
assert.match(pluginSettings, /plugin-enable-switch/);
assert.match(icons, /img\.icons8\.com\/ios-filled/);
assert.match(cppu, /pp-detail-shell/);
assert.match(cppu, /grid-template-rows:0fr/);
assert.match(cppu, /setCardExpanded\(card, false\)/);
assert.match(cppu, /prefers-reduced-motion:reduce/);

console.log("PASS: v0.11.4 plugin switch simplification, Icons8 iOS Filled icons and smooth notice expansion");
