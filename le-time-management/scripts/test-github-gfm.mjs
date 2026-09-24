/* GitHub Flavored Markdown 渲染器守卫测试。
 *
 * 为什么单独一个文件：这个解析器是全插件唯一「会把别人的文本变成活标签」的地方，
 * README 内容完全由第三方仓库决定，属于外部不可信输入。表格 / 代码块 / 白名单
 * 三块各自要一大把断言，混进插件逻辑测试里两边都读不动。
 *
 * 契约：先整体 esc()，再由解析器自己注入白名单标签 —— 与 ai-chat 的 md() 同一范式。
 * 白名单外的标签按源码显示（GitHub 会渲染出来，我们刻意不渲染）。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/plugins/github-readme/main.js', import.meta.url), 'utf8');
const context = vm.createContext({
  URL, Set, Map, Date, console, setTimeout, clearTimeout, setInterval, clearInterval,
  document: { getElementById: () => null, createElement: () => ({}), head: { append() {} } },
  tide: { ui: { registerView() {} }, storage: { get: async () => null, set: async () => {} } },
});
vm.runInContext(source.replace(
  '  tide.ui.registerView({',
  '  globalThis.testApi = { gfm };\n  tide.ui.registerView({',
), context);
const { gfm } = context.testApi;

const ctx = { owner: 'foo', repo: 'bar', branch: 'main', dir: '' };
const render = (md, extra) => gfm(md, { ...ctx, ...extra });

/* ── 段落与行内 ── */
assert.equal(render('hello\n\nworld'), '<p>hello</p><p>world</p>', '空行分段');
assert.equal(render('a **b** _c_ `d` ~~e~~'), '<p>a <strong>b</strong> <em>c</em> <code>d</code> <del>e</del></p>', '粗斜删与行内码');
assert.ok(render('see https://x.dev/a?b=1&c=2').includes('<a href="https://x.dev/a?b=1&amp;c=2"'), '裸 URL 自动成链');
assert.equal(render('<https://a.dev>'), '<p><a href="https://a.dev" rel="noopener noreferrer">https://a.dev</a></p>', '尖括号 autolink');
assert.ok(render('mail me <me@x.dev>').includes('mailto:me@x.dev'), '尖括号邮箱转 mailto');

/* ── 标题与页内锚点：README 里 [Features](#features) 极常见，id 必须对得上 ── */
assert.equal(render('## Features'), '<h2 id="features">Features</h2>', '标题带锚点 id');
assert.equal(render('### 1. Quick Start!'), '<h3 id="1-quick-start">1. Quick Start!</h3>', 'id 用 GitHub 的 slug 规则：小写、非字母数字转连字符');
assert.ok(render('[跳](#1-quick-start)').includes('href="#1-quick-start"'), '页内锚点链接保留');
assert.equal(render('Title\n-----'), '<h2 id="title">Title</h2>', 'setext 二级标题（下划线紧跟文字时不是分隔线），同样带锚点 id');
assert.equal(render('---'), '<hr>', '独占一行的 --- 是分隔线');

/* ── 表格：本插件的核心诉求 ── */
assert.equal(
  render('| a | b |\n| --- | --- |\n| 1 | 2 |'),
  '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
  'GFM 表格必须渲染成真 table',
);
assert.equal(
  render('| l | c | r |\n| :-- | :-: | --: |\n| x | y | z |'),
  '<table><thead><tr><th align="left">l</th><th align="center">c</th><th align="right">r</th></tr></thead>'
  + '<tbody><tr><td align="left">x</td><td align="center">y</td><td align="right">z</td></tr></tbody></table>',
  '表格对齐用 align 属性（不用 style，属性白名单里没有 style）',
);
assert.equal(render('| a \\| b |\n| --- |\n| c |'),
  '<table><thead><tr><th>a | b</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>', '转义竖线不算列分隔');
assert.equal(render('| a | b |\n| --- | --- |\n| 1 |'),
  '<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td></td></tr></tbody></table>', '缺列补空单元格');
assert.ok(!render('| a | b |\n| 1 | 2 |').includes('<table'), '没有分隔行的竖线文本不算表格，按段落走');
assert.ok(!render('a | b').includes('<table'), '行内出现竖线不触发表格');
assert.ok(render('| a |\n| - |\n| 1 |\n\n后一段').endsWith('<p>后一段</p>'), '表格结束于空行，后面正常分段');

/* ── 围栏代码块：里面的东西一个都不许解析 ── */
assert.equal(render('```js\nconst a = 1;\n```'),
  '<pre lang="js"><code>const a = 1;\n</code></pre>', '围栏代码块带语言标记');
assert.equal(render('```\nplain\n```'), '<pre><code>plain\n</code></pre>', '无语言标记时不写 lang');
assert.ok(!render('```\n| a |\n| - |\n| b |\n```').includes('<table'), '代码块里的竖线表格不解析');
assert.ok(!render('```\n**x**\n```').includes('<strong'), '代码块里的强调标记不解析');
assert.ok(render('```\n<b>x</b>\n```').includes('&lt;b&gt;x&lt;/b&gt;'), '代码块里的标签必须转义');
assert.ok(render('```js\nfor (let i=0;i<a;i++) {}\n```').includes('i&lt;a'), '代码里的 < 转义');
assert.ok(render('文本\n\n    indented code\n').includes('<pre><code>indented code'), '四空格缩进块按代码处理');
assert.ok(render('```js\ncode\n```没闭合的尾巴').includes('<pre lang="js">'), '围栏未闭合也要收尾，不能把后文吞成代码');

/* ── 列表与任务清单 ── */
assert.equal(render('- a\n- b'), '<ul><li>a</li><li>b</li></ul>', '无序列表');
assert.equal(render('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>', '有序列表');
assert.equal(render('- a\n  - b'), '<ul><li>a<ul><li>b</li></ul></li></ul>', '两空格缩进嵌套列表');
assert.equal(render('- [ ] todo\n- [x] done'),
  '<ul class="task"><li class="off">todo</li><li class="on">done</li></ul>', '任务清单转 class，不产出可交互 checkbox');

/* ── 引用块 ── */
assert.equal(render('> quoted\n> more'), '<blockquote><p>quoted more</p></blockquote>', '引用块合并相邻行');

/* ── 图片：相对路径必须绝对化，否则读出来的 README 全是碎图 ── */
assert.ok(render('![logo](media/a.png)').includes('src="https://raw.githubusercontent.com/foo/bar/main/media/a.png"'), '相对图片按仓库根解析');
assert.ok(render('![x](./b.png)').includes('/main/b.png'), './ 前缀归一');
assert.ok(render('![x](/root.png)').includes('/main/root.png'), '/ 前缀从仓库根起');
assert.ok(render('![x](media/a.png)').includes('loading="lazy"'), '图片懒加载');
assert.ok(!render('![x](media/a.png)').includes('src="media'), '不留未改写的相对 src');
assert.ok(render('![x](docs/a.png)', { dir: 'docs' }).includes('/main/docs/docs/a.png'),
  'README 在子目录时相对路径基于它所在目录');
assert.ok(render('![x](http://insecure/a.png)').includes('data-insecure'), 'http 图源标成降级（APK 会拦混合内容）');
assert.ok(render('[![badge](s.svg)](https://t.dev)').includes('<a href="https://t.dev"'), '链接套图片（徽章）两层都要成立');

/* ── 链接：相对 .md 指向 GitHub blob 页，锚点保留，危险协议剥掉 ── */
assert.ok(render('[d](docs/x.md)').includes('href="https://github.com/foo/bar/blob/main/docs/x.md"'), '相对 md 链接改写成 GitHub 页面');
assert.ok(render('[d](docs/x.md#s)').includes('blob/main/docs/x.md#s'), '相对链接带锚点要留住');
assert.ok(!render('[x](javascript:alert(1))').includes('href="javascript'), 'javascript: 协议不给 href');
assert.equal(render('[x](javascript:alert(1))'), '<p>[x](javascript:alert(1))</p>', '危险协议的链接整条降级成原文');
assert.ok(render('[mail](mailto:a@b.c)').includes('href="mailto:a@b.c"'), 'mailto 放行');
assert.ok(render('[x](https://a.dev)').includes('rel="noopener noreferrer"'), '外链一律 rel=noopener');

/* ── 裸 HTML 白名单：标签 + 属性双白名单，style 永远不放行 ── */
assert.ok(render('<br>').includes('<br>'), 'br 放行');
assert.ok(render('<b>粗</b>').includes('<b>粗</b>'), 'b 放行');
assert.ok(render('<kbd>Ctrl</kbd>').includes('<kbd>'), 'kbd 放行');
assert.ok(render('<sup>注</sup>').includes('<sup>'), 'sup 放行');
assert.ok(render('<details><summary>更多</summary>藏</details>').includes('<summary>更多</summary>'), 'details/summary 放行');
assert.ok(render('<div align="center" onclick="x()">hi</div>').includes('<div class="gh-center">hi</div>'),
  'align 转 class，onclick 剥掉');
assert.ok(render('<p align="center">c</p>').includes('<p class="gh-center">'), 'p 的 align 同样转 class');
assert.ok(!render('<td align="left">x</td>').includes('onclick'), '属性白名单外的全剥');
assert.ok(render('<img src="a.png" onerror="alert(1)" width="40">').includes('width="40"'), 'img 的 width 留住');
assert.ok(!render('<img src="a.png" onerror="alert(1)">').includes('onerror'), '🔴 img 的事件属性必须剥掉');
assert.ok(!render('<script>alert(1)</script>').includes('<script>'), '🔴 script 不得成为活标签');
assert.ok(render('<script>alert(1)</script>').includes('&lt;script&gt;'), '🔴 script 以源码形式可见');
assert.ok(!render('<iframe src="https://evil.dev"></iframe>').includes('<iframe'), '🔴 iframe 不得成活标签');
assert.ok(!render('<a href="https://a" style="position:fixed">x</a>').includes('style='), '🔴 style 属性一律不放行');
assert.ok(!render('<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pjwvc2NyaXB0Pj48L3N2Zz4=">').includes('src="data:'),
  '🔴 data: 图源一律拦掉（svg 能带脚本）');
assert.ok(render('a &lt; b').includes('&amp;lt;'), '源码里已有的实体不得被二次解码');
assert.ok(!render('&amp;lt;script&amp;gt;').includes('<script'), '🔴 双重编码的 script 不能解码成活标签');

/* ── picture 深浅色：应用内主题 ≠ 系统主题，原生 media query 会拿错图 ── */
const pic = render('<picture><source media="(prefers-color-scheme: dark)" srcset="d.svg"><source srcset="l.svg"><img alt="x" src="l.svg" width="200"></picture>');
assert.ok(pic.includes('gh-theme-dark') && pic.includes('d.svg'), '深色图源挂 gh-theme-dark 类');
assert.ok(pic.includes('gh-theme-light') && pic.includes('l.svg'), '浅色图源挂 gh-theme-light 类');
assert.ok(!pic.includes('media='), '不保留原生 media 属性（交给 data-theme-mode 选择器）');
assert.ok(pic.match(/width="200"/), 'picture 里 img 的尺寸属性要带到改写后的 img 上');

/* ── 混合大文档不能崩 ── */
const mixed = [
  '<p align="center"><img src="logo.svg" width="120"></p>',
  '',
  '# 标题',
  '',
  '一段带 [链接](a.md) 和 `代码` 的正文。',
  '',
  '| 键 | 值 |',
  '| --- | --- |',
  '| `a` | <b>1</b> |',
  '',
  '```sh',
  'npm i',
  '```',
  '',
  '- [ ] 未做',
  '- [x] 已做',
  '  - 子项',
  '',
  '> 注：见 <https://x.dev>。',
].join('\n');
const out = render(mixed);
assert.ok(out.includes('<table>') && out.includes('<pre lang="sh">') && out.includes('class="task"'), '混合文档三块特性同时成立');
for (const tag of ['table', 'ul', 'ol', 'pre', 'blockquote', 'p']) {
  const open = (out.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
  const close = (out.match(new RegExp(`</${tag}>`, 'g')) || []).length;
  assert.equal(close, open, `标签配平：${tag} 开了 ${open} 个却闭了 ${close} 个`);
}
assert.equal((out.match(/<li/g) || []).length, 3, '任务清单两项 + 子项共三个 li');

/* ── 缩进的裸 HTML 不许被当成四空格代码块（vite README 顶部就是这么写的，实测踩到） ── */
assert.ok(!render("正文\n\n    <br>\n    <img src='a.png'>\n").includes("<pre"), "缩进的裸标签是 HTML 块，不是缩进代码块");
assert.ok(!render("<p align=\"center\">\n    <picture><source srcset=\"l.svg\"><img src=\"l.svg\"></picture>\n</p>").includes("<pre"),
  "缩进的 <picture> 必须渲染成图，不能掉进 <pre>");
assert.ok(!/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*<p\b/.test(render("<p align=\"center\">\n  <br>\n  <b>x</b>\n</p>")),
  "块级 HTML 逐行落地，不许造出 <p> 套 <p>（浏览器会自动纠形，结构就和作者写的不一样了）");
assert.ok(render("行内 <b>粗</b> 混排").includes("<p>行内 <b>粗</b> 混排</p>"), "只占一行的标签仍是行内，照常包在段落里");

console.log('PASS: GitHub markdown 渲染器 —— 表格/代码块/任务清单/嵌套列表/锚点/相对路径改写/HTML 双白名单/深浅色图源，共 60+ 条断言');
