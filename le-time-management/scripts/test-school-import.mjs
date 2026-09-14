import fs from 'node:fs';
import assert from 'node:assert/strict';

/*
 * 教务导入窗口的退出通道。
 *
 * 背景（用户反馈）：手机端导入课表后无法返回，点「返回」也没用。
 * 根因：手机端这个教务窗口没有标题栏关闭按钮，而注入工具栏里唯一的「返回」
 * 只是 history.back() —— 停在教务站首屏（没有站内历史）时它是个死按钮，
 * 用户被卡在教务页里出不来。桌面端有窗口的关闭按钮所以一直没暴露。
 *
 * 这里守三条：① 工具栏有真正的关闭通道；② Rust 侧真的处理它；
 * ③ 导入流程走完后自动关窗（适配器最后一步会发 notifyTaskCompletion）。
 */

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const rust = read('../src-tauri/src/lib.rs');

/* ① 注入脚本：能提取 + 语法有效 */
const bootstrap = (rust.match(/const SCHOOL_IMPORT_BOOTSTRAP: &str = r#"\n([\s\S]*?)\n"#;/) || [])[1];
assert.ok(bootstrap, 'SCHOOL_IMPORT_BOOTSTRAP 原始字符串必须能被提取');
// 注入脚本写在 Rust 原始字符串里，语法错了编译器不会报错，只会在手机上静默失效 —— 必须自检。
assert.doesNotThrow(() => new Function(bootstrap), '教务窗口的注入脚本必须语法有效');

/* ② 工具栏必须有真正的关闭通道，且「后退」不能是死按钮 */
assert.ok(bootstrap.includes('data-close'), '教务窗口工具栏必须有「关闭」按钮');
assert.ok(bootstrap.includes('letime-import://close'), '「关闭」按钮必须走 letime-import://close');
assert.match(
  bootstrap,
  /\[data-back\]'\)\.onclick[\s\S]{0,160}?close\(\)/,
  '「后退」在教务站首屏（无站内历史）时必须回退到关闭，否则又是个点不动的死按钮',
);

/* ③ Rust 侧必须真的处理 close，并真的关掉那个窗口 */
assert.match(rust, /"close"\s*=>/, 'on_navigation 必须处理 letime-import://close');
assert.match(
  rust,
  /"close"\s*=>[\s\S]{0,240}?window\.close\(\)/,
  'letime-import://close 必须真的关闭 school-import 窗口',
);

/* ④ 导入流程走完要自动关窗，用户不必自己找按钮 */
assert.match(
  rust,
  /action == "notifyTaskCompletion"[\s\S]{0,300}?window\.close\(\)/,
  '导入完成（notifyTaskCompletion）后必须自动关闭教务窗口',
);

/* ⑤ 自动关窗依赖适配器发完成信号 —— 没发就永远不会触发 */
const adapter = read('../public/plugins/shiguang-schedule/adapters/cppu.js');
assert.match(adapter, /notifyTaskCompletion/, '适配器必须在导入结束时发 notifyTaskCompletion，否则自动关窗不会触发');

/* ⑥ 别退回「只有 history.back()」的老写法 */
assert.doesNotMatch(
  bootstrap,
  /\[data-back\]'\)\.onclick\s*=\s*\(\)\s*=>\s*history\.back\(\);/,
  '工具栏不能只剩 history.back()：手机端停在首屏时用户会被卡住',
);

console.log('PASS: school import window has a working exit path (toolbar close / back fallback / auto-close on completion)');
