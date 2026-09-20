// Optional Chromium component checks (not Tauri/Android E2E).
// Requires Playwright + its Chromium browser. No runtime dependency is added to the app.
// PLAYWRIGHT_PACKAGE_ROOT may point to a separate npm prefix containing node_modules/playwright.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = process.env.PLAYWRIGHT_PACKAGE_ROOT
  ? createRequire(join(resolve(process.env.PLAYWRIGHT_PACKAGE_ROOT), "package.json"))
  : createRequire(import.meta.url);
const { chromium } = require("playwright");
const read = path => readFileSync(join(root, path), "utf8");
const styles = read("src/styles.css");
const shell = read("src/shell.js");
const cardSource = shell.slice(shell.indexOf('class: `mcard market-manage-card'));
const keyHandler = cardSource.match(/onkeydown:\s*(\(e\) => \{[\s\S]*?\n          \})/)?.[1];
const clickHandler = cardSource.match(/onclick:\s*(\(e\) => \{[\s\S]*?\n          \})/)?.[1];
assert.ok(keyHandler && clickHandler, "market-card handler fixture must follow current shell source");
const railCss = styles.match(/\.rail-dock \{[\s\S]*?\.rail-dock-ghost \.ic \.fa-ic \{[^}]*\}/)?.[0];
const topCss = styles.match(/\.topbar \{ position: relative; \}[\s\S]*?\.topbar-drag-ghost \.fa-ic \{[^}]*\}/)?.[0];
assert.ok(railCss && topCss, "use production toolbar/ghost CSS, not hand-written substitutes");
const modulePaths = ["src/toolbarDrag.js", "src/motion.js", "src/uiScale.js", "src/railActions.js", "src/ui.js"];
const sourceHashes = Object.fromEntries(modulePaths.map(path => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
const html = `<!doctype html><meta charset="utf-8"><title>U-Time interaction component checks</title>
<style>
:root { --panel:#fff; --ink:#17323a; --ink-2:#50656b; --line:#d7e0e2; --deep:#31746c; --paper:#fff; }
* { box-sizing:border-box; } body { margin:0; padding:40px; font:14px sans-serif; }
button { font:inherit; height:40px; min-width:40px; padding:4px; }
#list { display:flex; flex-direction:row; flex-wrap:nowrap; gap:4px; width:max-content; margin-bottom:30px; }
#card, #off-parent, #dynamic-parent { margin:16px 0; padding:12px; width:max-content; border:1px solid #ddd; }
.window-controls { display:flex; gap:2px; }
.window-control { min-width:32px; width:32px; }
${read("src/styles/interactions.css")}
${railCss}
${topCss}
</style><main id="fixture"></main>
<script type="module">
import { attachToolbarDrag } from '/src/toolbarDrag.js';
import { initMotionInteractions } from '/src/motion.js';
import { el, isSelfActivationKey } from '/src/ui.js';
import { applyUiScale } from '/src/uiScale.js';
initMotionInteractions();
const originalRaf = window.requestAnimationFrame.bind(window), originalCancel = window.cancelAnimationFrame.bind(window);
const pending = new Set();
window.requestAnimationFrame = fn => { let id = originalRaf(t => { pending.delete(id); fn(t); }); pending.add(id); return id; };
window.cancelAnimationFrame = id => { pending.delete(id); originalCancel(id); };
const nativeRects = Element.prototype.getClientRects, nativeStyle = window.getComputedStyle;
let measured = { rects:0, styles:0 };
Element.prototype.getClientRects = function() { if (this.parentElement?.id === 'list') measured.rects++; return nativeRects.call(this); };
window.getComputedStyle = function(node, pseudo) { if (node.parentElement?.id === 'list') measured.styles++; return nativeStyle.call(this, node, pseudo); };
let binding, state;
const settle = () => new Promise(resolve => originalRaf(() => originalRaf(resolve)));
async function setup({ scale=100, motion='full', kind='rail', composite=false }={}) {
  binding?.destroy();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.documentElement.dataset.uiMotion = motion;
  applyUiScale(scale);
  state = { commits:0, actions:0, toggles:0, navigations:0, keys:[] };
  const list = el('div', { id:'list', class:kind === 'rail' ? 'rail-bottom rail-dock' : 'topbar-action-card' });
  for (const id of ['a','b','c']) {
    const classes = kind === 'rail' ? 'rail-dock-btn' : 'topbar-sortable top-mini-btn';
    const attrs = { id, class:classes };
    if (kind === 'topbar') attrs['data-topbar-part'] = id; else attrs['data-rail-id'] = id;
    let node;
    if (id === 'a' && composite) {
      node = el('div', { ...attrs, class:'window-controls topbar-sortable' },
        ...['minimize','maximize','close'].map(name => el('button', { id:name, class:'window-control', onclick:() => state.actions++ }, name[0])));
    } else node = el('button', { ...attrs, onclick:() => state.actions++ }, el('span', { class:'ic' }, id));
    list.append(node);
  }
  const pv = { id:'component' }, enabled = true;
  const toast = () => {};
  const switchTo = () => { state.navigations++; };
  const card = el('div', { id:'card', role:'button', tabindex:'0', onkeydown:${keyHandler}, onclick:${clickHandler} },
    el('button', { id:'toggle', role:'switch', onclick:e => { e.stopPropagation(); state.toggles++; } }, 'Toggle'));
  const off = el('button', { id:'off', 'data-motion':'off', onclick:() => state.actions++ }, 'Off');
  const offParent = el('div', { id:'off-parent', 'data-motion':'off' }, el('button', { id:'inherited-off', onclick:() => state.actions++ }, 'Inherited off'));
  const dynamic = el('div', { id:'dynamic-parent' }, el('button', { id:'dynamic', onclick:() => state.actions++ }, 'Dynamic off'));
  document.getElementById('fixture').replaceChildren(list, card, off, offParent, dynamic);
  binding = attachToolbarDrag(list, () => state.commits++, kind === 'topbar' ? {
    selector:'[data-topbar-part]', ghostClass:'topbar-drag-ghost', dragClass:'topbar-dragging', liveClass:'topbar-drag-live'
  } : {});
  measured = { rects:0, styles:0 };
  await settle();
}
document.addEventListener('keydown', e => { if (e.altKey && e.key.startsWith('Arrow')) state.keys.push({ key:e.key, prevented:e.defaultPrevented }); });
window.harness = { setup, settle, scale:applyUiScale,
  state:() => ({ ...state, order:[...document.getElementById('list').children].map(n => n.id), pending:pending.size }),
  async idle() { measured = { rects:0, styles:0 }; await new Promise(resolve => setTimeout(resolve, 220)); return { ...measured, pending:pending.size }; }
};
await setup(); window.ready = true;
</script>`;
const assets = new Map(modulePaths.map(path => [`/${path}`, read(path)]));
// Test-local ephemeral server, closed in finally; it is not an application dev server.
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://test.invalid").pathname;
  if (path === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); }
  else if (assets.has(path)) { res.setHeader("Content-Type", "text/javascript; charset=utf-8"); res.end(assets.get(path)); }
  else { res.statusCode = path === "/favicon.ico" ? 204 : 404; res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const passed = [], errors = [];
try {
  browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1440, height:1000 }, hasTouch:true });
  const page = await context.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(6000);
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready);
  const setup = options => page.evaluate(options => harness.setup(options), options);
  const state = () => page.evaluate(() => harness.state());
  const settle = () => page.evaluate(() => harness.settle());
  const box = selector => page.locator(selector).boundingBox();
  const startDrag = async (selector="#a") => {
    const a = await box(selector), c = await box("#c");
    await page.mouse.move(a.x+a.width/2, a.y+a.height/2);
    await page.mouse.down();
    await page.mouse.move(a.x+a.width/2+8, a.y+a.height/2);
    await page.mouse.move(c.x+c.width+18, a.y+a.height/2, { steps:5 });
    await settle();
  };

  for (const kind of ["rail", "topbar"]) {
    await setup({ kind });
    await page.locator("#a").focus(); await page.keyboard.press("Alt+ArrowLeft");
    await page.locator("#c").focus(); await page.keyboard.press("Alt+ArrowRight");
    let s = await state();
    assert.deepEqual(s.keys.map(e => e.prevented), [true,true]);
    assert.deepEqual(s.order, ["a","b","c"]); assert.equal(s.commits, 0);
    await page.locator("#a").focus(); await page.keyboard.press("Alt+ArrowRight");
    s = await state(); assert.deepEqual(s.order, ["b","a","c"]); assert.equal(s.commits, 1);
    assert.equal(await page.evaluate(() => document.activeElement.id), "a");
    passed.push(`${kind}: native Alt-arrow boundaries and focus`);
  }
  await setup({});
  await page.locator("#toggle").focus(); await page.keyboard.press("Space"); await page.keyboard.press("Enter");
  let s = await state(); assert.equal(s.toggles, 2); assert.equal(s.navigations, 0);
  await page.locator("#card").focus(); await page.keyboard.press("Enter");
  s = await state(); assert.equal(s.navigations, 1);
  passed.push("market card: native bubbling and inner-button activation");

  for (const id of ["off", "inherited-off"]) {
    await setup({});
    const a = await box(`#${id}`); await page.mouse.move(a.x+15,a.y+15); await page.mouse.down();
    const quiet = await page.locator(`#${id}`).evaluate(node => ({ press:node.classList.contains('motion-pressing'), ripples:node.querySelectorAll('.motion-ripple').length, transform:getComputedStyle(node).transform }));
    assert.deepEqual(quiet, { press:false, ripples:0, transform:"none" });
    await page.mouse.up(); assert.equal((await state()).actions, 1);
    passed.push(`${id}: no visual feedback, business click retained`);
  }
  await setup({});
  const d = await box("#dynamic"); await page.mouse.move(d.x+15,d.y+15); await page.mouse.down();
  const dynamic = await page.evaluate(() => {
    document.getElementById('dynamic-parent').setAttribute('data-motion','off');
    const n = document.getElementById('dynamic');
    return { transform:getComputedStyle(n).transform, rippleDisplay:getComputedStyle(n.querySelector('.motion-ripple')).display };
  });
  assert.deepEqual(dynamic, { transform:"none", rippleDisplay:"none" }); await page.mouse.up();
  passed.push("motion flag changed during press: inherited CSS suppression");

  for (const scale of [80,100,125,150]) for (const kind of ["rail","topbar"]) {
    await setup({ scale, kind }); await startDrag();
    assert.deepEqual((await state()).order, ["b","c","a"]);
    const idle = await page.evaluate(() => harness.idle());
    assert.deepEqual(idle, { rects:0, styles:0, pending:0 });
    const ratio = await page.evaluate(() => document.querySelector('.rail-dock-ghost, .topbar-drag-ghost').getBoundingClientRect().width / document.getElementById('a').getBoundingClientRect().width);
    assert.ok(Math.abs(ratio - 1.025) < .02, `ghost zoom ratio: ${ratio}`);
    await page.mouse.up();
    s = await state(); assert.equal(s.commits, 1); assert.equal(s.actions, 0); assert.equal(s.pending, 0);
    assert.equal(await page.locator('.rail-dock-ghost, .topbar-drag-ghost').count(), 0);
    passed.push(`${kind}: mouse reorder + idle + click suppression at ${scale}%`);
  }
  await setup({ motion:"reduced" }); await startDrag();
  assert.equal(await page.locator('.rail-dock-ghost, .topbar-drag-ghost').count(), 0);
  assert.equal(await page.locator('#list').evaluate(n => n.getAnimations({ subtree:true }).length), 0);
  await page.mouse.up(); assert.equal((await state()).commits, 1);
  passed.push("reduced motion: reorder without ghosts or animations");

  await setup({ kind:"topbar", composite:true }); await startDrag("#minimize");
  const ghostSafety = await page.evaluate(() => {
    const ghost = document.querySelector('.topbar-drag-ghost'), child = ghost.querySelector('button');
    child.focus();
    return { inert:ghost.inert, ids:ghost.querySelectorAll('[id]').length, tabs:[...ghost.querySelectorAll('button')].map(n => n.tabIndex), focused:document.activeElement === child, pressed:ghost.querySelectorAll('.motion-pressing, .motion-clicked').length };
  });
  assert.deepEqual(ghostSafety, { inert:true, ids:0, tabs:[-1,-1,-1], focused:false, pressed:0 });
  await page.mouse.up(); assert.equal((await state()).actions, 0);
  passed.push("composite window controls: inert ghost, no duplicate ids or focus");

  await setup({}); await startDrag(); await page.keyboard.press("Escape"); await page.mouse.up();
  s = await state(); assert.deepEqual(s.order, ["a","b","c"]); assert.equal(s.commits, 0); assert.equal(s.pending, 0);
  passed.push("native Escape cancellation restores order");

  await setup({}); await startDrag();
  await page.evaluate(() => harness.scale(125)); await page.mouse.up();
  s = await state(); assert.deepEqual(s.order, ["a","b","c"]); assert.equal(s.commits, 0);
  assert.equal(await page.locator('.rail-dock-ghost').count(), 0);
  passed.push("scale changed during drag: safe cancellation");

  await setup({}); await startDrag();
  await page.evaluate(() => document.getElementById('list').remove()); await page.mouse.up();
  assert.equal(await page.locator('.rail-dock-ghost').count(), 0);
  passed.push("detached toolbar: document pointerup cleans the session");

  const cdp = await context.newCDPSession(page);
  for (const drift of [0,3]) {
    await setup({});
    const a = await box("#a"), c = await box("#c");
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{ x:a.x+a.width/2, y:a.y+a.height/2 }] });
    if (drift) await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:a.x+a.width/2+drift, y:a.y+a.height/2 }] });
    await page.waitForSelector('.rail-dock-ghost');
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{ x:c.x+c.width+18, y:a.y+a.height/2 }] });
    await settle();
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    s = await state(); assert.deepEqual(s.order, ["b","c","a"]); assert.equal(s.commits, 1); assert.equal(s.actions, 0);
    passed.push(`native Chromium touch: long press + ${drift}px pre-drag jitter`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scope:"Chromium components with actual modules/CSS/card handlers, not full app/native E2E", browser:browser.version(), cases:passed.length, passed, sourceHashes, pageErrors:errors }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed, pageErrors:errors, failed:error.message }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
