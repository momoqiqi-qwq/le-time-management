#!/usr/bin/env node
// 把 exam-calendar 的 src/main.template.js + src/exam-data.json 合成插件入口 main.js。
// main.js 是生成物（插件加载器只认 manifest.entry），手工改它会在下次构建被覆盖 ——
// 这也是它头顶写着「构建产物，不要直接改」的原因。
//
// --check：只校验、不写盘，供 npm test 拦住「改了源忘了重新生成」。
const fs = require('fs');
const path = require('path');

const CHECK = process.argv.includes('--check');
const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'le-time-management', 'public', 'plugins', 'exam-calendar');
const srcDir = path.join(dir, 'src');
const templatePath = path.join(srcDir, 'main.template.js');
const dataPath = path.join(srcDir, 'exam-data.json');
const mainPath = path.join(dir, 'main.js');

const PLACEHOLDER = '__EXAM_DATA__';

// 🔴 缩进规则必须与历史产物逐字节一致：JSON.stringify(_, null, 2) 的首行 "{" 直接跟在
// `const DATA = ` 之后，其余每一行再补 2 空格缩进。改动这里只会产生纯格式 diff，
// 但会让 --check 与旧产物对不上 —— 所以钉死，不要「顺手美化」。
function renderData(data) {
  return JSON.stringify(data, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n');
}

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes(PLACEHOLDER)) {
  console.error(`exam-calendar 模板缺少占位符 ${PLACEHOLDER}：${templatePath}`);
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// 🔴 行尾必须跟随模板，不能固定成 LF。仓库 core.autocrlf=true 且没有 .gitattributes，
// 别人 clone 时 main.template.js 与 main.js 会被一起检出成 CRLF；而 JSON.stringify 只吐 LF。
// 不归一化就会拼出「模板段 CRLF + 数据段 LF」的混合行尾，在那种机器上 --check 永远误报。
// 跟随模板 ⇒ 两种环境下产物都与自己的模板同构，比较才成立。
const EOL = template.includes('\r\n') ? '\r\n' : '\n';
const combined = template.replace(PLACEHOLDER, renderData(data)).replace(/\r?\n/g, EOL);

if (CHECK) {
  const current = fs.existsSync(mainPath) ? fs.readFileSync(mainPath, 'utf8') : '';
  if (current !== combined) {
    console.error('exam-calendar 生成物检查失败：');
    console.error('- main.js 与 src/main.template.js + src/exam-data.json 不一致');
    console.error('请运行：node tools/build-exam-calendar-plugin.js');
    process.exit(1);
  }
  console.log('✓ exam-calendar 生成物与源一致');
  process.exit(0);
}

fs.writeFileSync(mainPath, combined, 'utf8');
console.log('✓ rebuilt exam-calendar/main.js');
