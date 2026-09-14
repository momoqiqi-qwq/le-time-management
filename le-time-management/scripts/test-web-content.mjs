import assert from 'node:assert/strict';
import { normalizeWebUrl, resolveWebUrl, parseSiteMeta, inferSiteIconName, extractNoticeLinks, formEncode,
  charsetFromContentType, charsetFromMeta, looksLikeMarkup, decodeWebBody } from '../src/webContent.js';
assert.equal(normalizeWebUrl('example.edu.cn'), 'https://example.edu.cn/');
assert.equal(resolveWebUrl('../notice/1.htm', 'https://www.example.edu.cn/xw/list.htm'), 'https://www.example.edu.cn/notice/1.htm');
const html=`<html><head><meta property="og:site_name" content="示例大学"><link rel="icon" href="/logo.ico"></head><body><ul class="notice-list"><li><a href="/info/1001/1234.htm">关于开展 2026 年奖学金申报的通知</a><span>2026-09-10</span></li><li><a href="/">首页</a></li></ul></body></html>`;
const meta=parseSiteMeta(html,'https://www.example.edu.cn/news/');
assert.equal(meta.title,'示例大学');assert.equal(meta.iconUrl,'https://www.example.edu.cn/logo.ico');assert.equal(meta.iconName,'school');
const rows=extractNoticeLinks(html,'https://www.example.edu.cn/news/');assert.equal(rows.length,1);assert.equal(rows[0].url,'https://www.example.edu.cn/info/1001/1234.htm');assert.equal(rows[0].date,'2026-09-10');
const plain=`<ul><li><a href="/2026/0911/c123a456/page.htm">2026 年秋季学期本科生选课安排</a><span>2026-09-11</span></li></ul>`;
const plainRows=extractNoticeLinks(plain,'https://jwc.example.edu.cn/tzgg/');assert.equal(plainRows.length,1);assert.equal(plainRows[0].date,'2026-09-11');
assert.equal(inferSiteIconName('校园图书馆','https://lib.example.edu.cn'),'book-open');
assert.equal(formEncode({username:'张三',password:'a&b'}),'username=%E5%BC%A0%E4%B8%89&password=a%26b');

/* ── 响应体编码：中文站点常只在 <meta> 里声明 gb2312 ──
   真实取证：http://daxue.qiyemulu.cn/ 的响应头只有 `Content-Type: text/html`（不带 charset），
   编码只在 <meta http-equiv=Content-Type content="text/html; charset=gb2312"> 里声明。
   reqwest 的 text() 与 Response.text() 都不读 meta，会按 UTF-8 解 —— 标题就变成一串 `�`。 */
// GBK 编码的「大学网站大全」= b4f3 d1a7 cdf8 d5be b4f3 c8ab
const GBK_TITLE = new Uint8Array([0xb4, 0xf3, 0xd1, 0xa7, 0xcd, 0xf8, 0xd5, 0xbe, 0xb4, 0xf3, 0xc8, 0xab]);
const enc = new TextEncoder();
const GBK_PAGE = new Uint8Array([
  ...enc.encode('<html><head><meta http-equiv=Content-Type content="text/html; charset=gb2312"><title>'),
  ...GBK_TITLE,
  ...enc.encode('</title></head></html>'),
]);

assert.equal(charsetFromContentType('text/html; charset=gb2312'), 'gb2312');
assert.equal(charsetFromContentType('text/html; charset="UTF-8"'), 'utf-8', '带引号、大小写混写都要认，且统一成小写');
assert.equal(charsetFromContentType('text/html'), '', '头里没声明 charset 必须返回空串，好让 meta 兜底');
assert.equal(charsetFromContentType('<meta charset=gbk>'), 'gbk', '直接喂 meta 标签也要能取出来');

assert.equal(charsetFromMeta(GBK_PAGE), 'gb2312', '必须能从 <meta http-equiv> 里嗅出 gb2312');
assert.equal(charsetFromMeta(enc.encode('<meta charset="big5">')), 'big5', '简写 <meta charset> 也要认');
assert.equal(charsetFromMeta(enc.encode('<html><head><title>无声明</title>')), '', '没有 meta 声明就该返回空串');

// 核心回归：gb2312 正文必须解对，且不能残留替换字符
const decoded = decodeWebBody(GBK_PAGE, 'text/html');
assert.ok(decoded.includes('大学网站大全'), `gb2312 正文必须解对，实际：${decoded.slice(0, 60)}`);
assert.ok(!decoded.includes('\uFFFD'), 'gb2312 正文里不该出现替换字符 �');
// 端到端：刷新名称拿到的就是真标题（而不是乱码）
assert.equal(parseSiteMeta(decoded, 'http://daxue.qiyemulu.cn/').title, '大学网站大全');
assert.equal(inferSiteIconName(parseSiteMeta(decoded, 'http://daxue.qiyemulu.cn/').title, 'http://daxue.qiyemulu.cn/'), 'school',
  '标题解对之后图标推断也该跟着对上，而不是退回 globe');

// 响应头声明优先，且此时不去嗅探 meta
assert.equal(decodeWebBody(enc.encode('<meta charset="gbk">中文'), 'text/html; charset=utf-8'), '<meta charset="gbk">中文');

// 「正文是不是标记文档」这道判别必须挡得住「含标记片段的 JSON」
assert.equal(looksLikeMarkup(GBK_PAGE), true, '真 HTML 页面应判定为标记文档');
assert.equal(looksLikeMarkup(enc.encode('\r\n<!DOCTYPE html><html>')), true, '前置空白的 doctype 也要认');
assert.equal(looksLikeMarkup(enc.encode('{"html":"<meta charset=gbk>"}')), false, 'JSON 不能被当成标记文档');

// JSON 按规范恒 UTF-8：正文里出现 <meta charset=...> 也不能被带偏
const jsonBody = enc.encode('{"html":"<meta charset=gbk>","t":"中文"}');
assert.equal(decodeWebBody(jsonBody, 'application/json'), '{"html":"<meta charset=gbk>","t":"中文"}');
assert.equal(decodeWebBody(jsonBody, ''), '{"html":"<meta charset=gbk>","t":"中文"}',
  'content-type 缺失时也不能被 JSON 里的 <meta charset> 带偏');
// 反过来：content-type 缺失但正文确实是 HTML 页面时，仍要走 meta 兜底
assert.ok(decodeWebBody(GBK_PAGE, '').includes('大学网站大全'), '没有 content-type 的 gb2312 页面同样要解对');
// 未知 / 非法标签不能抛，回落 UTF-8
assert.equal(decodeWebBody(enc.encode('中文'), 'text/html; charset=x-unknown-9'), '中文');

console.log('PASS: web URL normalization, site metadata, favicon, FA icon inference, generic notice extraction, form encoding and charset decoding');
