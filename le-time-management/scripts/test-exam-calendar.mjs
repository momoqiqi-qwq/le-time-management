import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// exam-calendar 插件：源（src/main.template.js + src/exam-data.json）与产物（main.js）的同步守卫。
// 背景：这个插件的 main.js 头部一直写着「改 src/main.template.js 然后跑 tools/build.mjs」，
// 但仓库里既没有 src/ 也没有 build.mjs —— 构建链只存在于外部采集项目里。
// 结果就是 1952 行的产物无法从源头重新生成，改数据只能手改产物。
// 现在构建链已收回本仓库（tools/build-exam-calendar-plugin.js），这里负责防止它再次脱节。
const pluginDir = new URL('../public/plugins/exam-calendar/', import.meta.url);
const mainPath = new URL('main.js', pluginDir);
const templatePath = new URL('src/main.template.js', pluginDir);
const dataPath = new URL('src/exam-data.json', pluginDir);

/* ── ① 生成物同步：改了源忘了重新生成，必须当场拦住 ── */
const buildCheck = spawnSync(
  process.execPath,
  [fileURLToPath(new URL('../../tools/build-exam-calendar-plugin.js', import.meta.url)), '--check'],
  { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' }
);
assert.equal(
  buildCheck.status,
  0,
  `main.js 与 src/main.template.js + src/exam-data.json 不同步：\n${buildCheck.stdout || ''}${buildCheck.stderr || ''}`
);
console.log('PASS: exam-calendar/main.js 与 src/ 下的源保持同步');

/* ── ② 占位符：正面必须有、反面必须无 ──
   模板缺占位符 ⇒ 构建脚本会直接报错退出（不会静默产出坏文件）；
   产物残留占位符 ⇒ 插件运行时 DATA 是 undefined，整个视图白屏。两边都要钉。 */
const template = fs.readFileSync(templatePath, 'utf8');
const main = fs.readFileSync(mainPath, 'utf8');
assert.ok(template.includes('__EXAM_DATA__'), '模板必须保留 __EXAM_DATA__ 占位符，否则构建会生成坏产物');
assert.ok(!main.includes('__EXAM_DATA__'), '产物里不得残留 __EXAM_DATA__ 占位符（替换失败会让 DATA 变成 undefined）');

/* ── ③ 产物必须是语法合法的 JS，且保持 IIFE 形态 ── */
assert.doesNotThrow(() => new vm.Script(main), 'main.js 必须是语法合法的 JS');
assert.ok(main.includes('"use strict"'), '产物必须保留 "use strict"');
assert.ok(main.trimEnd().endsWith('})();'), '产物必须以 IIFE 收尾（插件契约）');

/* ── ④ 从产物反向提取内嵌 DATA，确认它真的能被 JSON.parse ──
   这是「构建链是否真的把数据装进去了」的唯一直接证据 ——
   只查文件里出现「events」字样是不够的，那证明不了它是合法 JSON。 */
const lines = main.replace(/\r\n/g, '\n').split('\n');
const start = lines.findIndex((l) => l === '  const DATA = {');
assert.ok(start > 0, '产物里必须存在 `  const DATA = {` 声明块');
const end = lines.indexOf('  };', start);
assert.ok(end > start, 'DATA 声明块必须有收尾 `  };`');
const inner = lines.slice(start + 1, end).map((l) => (l.startsWith('  ') ? l.slice(2) : l));
const embedded = JSON.parse(['{'].concat(inner).concat(['}']).join('\n'));

const source = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
assert.equal(embedded.schema, source.schema, '产物的 schema 必须与数据源一致');
assert.equal(embedded.generatedAt, source.generatedAt, '产物的 generatedAt 必须与数据源一致（防止用旧数据重建）');
assert.equal(embedded.events.length, source.events.length, '内嵌事件条数必须与数据源完全一致');
assert.equal(embedded.events.length, 80, '考试数据应为 80 条（若确实增删了，请同步更新这条断言）');

/* ── ⑤ 数据完整性：外部采集来的数据可能带坏行，关键字段与日期格式必须成立 ── */
for (const ev of source.events) {
  assert.ok(ev.examId, '每条事件必须有 examId');
  assert.ok(ev.name, `${ev.examId} 缺少 name`);
  assert.match(ev.date, /^\d{4}-\d{2}-\d{2}$/, `${ev.examId} 的 date 必须是 YYYY-MM-DD，实际为 ${ev.date}`);
  assert.equal(typeof ev.confirmed, 'boolean', `${ev.examId} 的 confirmed 必须是布尔值`);
}

/* ── ⑥ manifest 契约：入口指向产物 ── */
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', pluginDir), 'utf8'));
assert.equal(manifest.entry, 'main.js', 'manifest.entry 必须指向构建产物 main.js');
assert.ok(!/src\/|tools\//.test(manifest.entry), 'manifest.entry 不得指向源码目录');

console.log(`PASS: exam-calendar 构建链自洽（${embedded.events.length} 条考试数据，源与产物逐字节同源）`);
