import assert from "node:assert/strict";
import fs from "node:fs";

const read = (relativePath) => fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
const css = read("../src/styles/interactions.css");
const motion = read("../src/motion.js");
const ui = read("../src/ui.js");
const commandPalette = read("../src/commandPalette.js");
const capture = read("../src/capture.js");
const drawer = read("../src/views/drawer.js");
const timeblock = read("../src/views/timeblock.js");
const automationPanel = read("../src/views/aiAutomationPanel.js");
const shell = read("../src/shell.js");

assert.match(css, /\.motion-pressing/);
assert.match(css, /\.motion-ripple/);
assert.match(css, /motion-button-release/);
assert.match(css, /motion-close-button-release/);
assert.match(css, /motion-drawer-in/);
assert.match(css, /motion-drawer-out/);
assert.match(css, /motion-center-layer-in/);
assert.match(css, /motion-top-layer-out/);
assert.match(css, /motion-page-forward-in/);
assert.match(css, /motion-page-back-in/);
assert.match(css, /prefers-reduced-motion:\s*reduce/);
assert.match(css, /data-ui-motion="reduced"/);
assert.match(motion, /export function initMotionInteractions/);
assert.match(motion, /export function closeLayer/);
assert.match(motion, /function addRipple/);
assert.match(motion, /panel\.dataset\.motionLayer = layerKind/);
assert.match(motion, /event\.target !== target/);
assert.match(ui, /removeWithMotion\(t\)/);
assert.match(shell, /removeWithMotion\(menu\)/);
for (const source of [commandPalette, capture, drawer, timeblock, automationPanel]) {
  assert.match(source, /closeLayer\(/);
}

console.log("PASS: smooth button feedback, layered enter/exit motion and reduced-motion fallback");
