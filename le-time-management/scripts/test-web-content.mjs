import assert from 'node:assert/strict';
import { normalizeWebUrl, resolveWebUrl, parseSiteMeta, inferSiteIconName, extractNoticeLinks, noticeKind, extractArticleText, screenNotice, formEncode,
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

/* ── 导航 / 页脚 / 栏目页必须摘出去 ──
   真实取证：桂林电子科技大学招生信息网首页（2026-09-16 抓取）全页 45 条候选里，
   25 条是导航、页脚和学院目录（`/zs/2119/list.htm`、`桂公网安备…`、`招生动态`），
   真通知被挤在后面。判据用 screenNotice 这个纯函数压 —— Node 里没有 DOMParser，
   extractNoticeLinks 的 DOM 分支只能靠 output/notice-probe.cjs + Chrome 端到端验。 */
const GUET = 'https://www.guet.edu.cn/zs/';
assert.equal(screenNotice('数学与计算科学学院', 'https://www.guet.edu.cn/zs/2119/list.htm', '数学与计算科学学院', '', GUET), null,
  '学院目录指向 list.htm，必须摘掉');
assert.equal(screenNotice('招生动态', 'http://www.guet.edu.cn/zs/550/list.htm', '招生动态', '', GUET), null, '栏目 tab 也是列表页');
assert.equal(screenNotice('桂公网安备45030502000232号', 'http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=45030502000232', '主办单位：桂林电子科技大学招生办公室 桂公网安备45030502000232号', '', GUET), null,
  '页脚备案链接必须摘掉');
assert.equal(screenNotice('桂ICP备05000961号', 'https://beian.miit.gov.cn/', '桂ICP备05000961号', '', GUET), null);
assert.equal(screenNotice('学校简介', 'https://www.guet.edu.cn/zs/2023/0221/c543a58762/page.htm', '学校简介', '', GUET), null,
  '无日期的短栏目名必须摘掉');
const keep = screenNotice('关于临时调整本科招生咨询方式的通知', 'https://www.guet.edu.cn/zs/2023/0808/c551a104240/page.htm',
  '2026-08-16 关于临时调整本科招生咨询方式的通知', '2026-08-16', GUET);
assert.ok(keep >= 4, `真通知必须留下，实际评分 ${keep}`);
// 站外链接（公众号文章、友情链接）不一律排除，但必须带日期
assert.equal(screenNotice('某某大学教务处关于学籍管理工作的若干说明文件', 'https://other.example.com/x', '某某大学教务处关于学籍管理工作的若干说明文件', '', GUET), null,
  '无日期的站外链接要摘');
assert.ok(screenNotice('咨询面对面｜桂电2026年招生咨询活动预告！', 'https://mp.weixin.qq.com/s/abc', '2026-06-15 咨询面对面｜桂电2026年招生咨询活动预告！', '2026-06-15', GUET) >= 4,
  '带日期的公众号文章要留');
assert.equal(noticeKind('关于临时调整本科招生咨询方式的通知'), 'notice');
assert.equal(noticeKind('2026年全日制本科招生宣传册电子书'), 'news', '宣传册属于 news 而不是 notice');
assert.equal(noticeKind('我校2026年统招本科录取工作圆满结束（图）'), 'other');

/* ── 端到端：有 DOM 时才跑（浏览器环境），Node 下跳过 ── */
if (typeof DOMParser !== 'undefined') {
  const guet = `<html><body>
  <nav class="nav-second"><ul><li><a class="nav-second-a" href="/zs/2119/list.htm">数学与计算科学学院</a></li></ul></nav>
  <div class="panel-list"><ul>
    <li><span class="panel-list-date">2026-09-13</span><a href="/zs/2026/0913/c551a159536/page.htm">桂林电子科技大学2027年优秀应届本科毕业生免试攻读研究生拟推荐名单公示</a></li>
    <li><span class="panel-list-date">2026-08-16</span><a href="/zs/2023/0808/c551a104240/page.htm">关于临时调整本科招生咨询方式的通知</a></li>
  </ul></div>
  <footer><a href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=45030502000232">桂公网安备45030502000232号</a></footer>
  </body></html>`;
  const rows = extractNoticeLinks(guet, GUET);
  assert.equal(rows.length, 2, `导航与页脚要摘掉，实际 ${rows.length} 条`);
  const art = extractArticleText(`<html><body><nav><a href="/">首页</a></nav>
    <div id="vsb_content"><p>各学院：</p><p>现将 2026 年秋季学期本科生选课工作安排通知如下，请于 2026 年 9 月 20 日前完成第一轮选课，逾期系统将自动关闭。</p><p>教务处</p></div></body></html>`,
    'https://jwc.example.edu.cn/tzgg/1.htm');
  assert.ok(art.text.includes('现将 2026 年秋季学期本科生选课工作安排通知如下'), '正文没抽对');
  assert.ok(art.text.split('\n').length >= 3, '段落之间要保留换行');
}

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

console.log('PASS: web URL normalization, site metadata, favicon, FA icon inference, generic notice extraction (nav/footer/listing-page screening), notice classification, article body extraction, form encoding and charset decoding');
