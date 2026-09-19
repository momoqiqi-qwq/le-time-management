#!/usr/bin/env node
/*
 * 预置订阅源体检：把 rss-reader 的 DEFAULT_FEEDS / SUGGESTED_FEEDS 逐个真抓一遍，
 * 并用**真解析器**跑一遍，报出「状态码 / 内容类型 / 条目数 / 摘要有无 / 封面数」。
 *
 * 为什么要有这个脚本：预置源写错了，表现是**每个新装用户首屏都有一块抓取失败**，
 * 而 npm test 必须离线可跑，管不到它。实测踩过：一条 GitHub Pages 已迁站的 404 地址
 * （`https://imjuya.github.io/juya-ai-daily/rss.xml`）差点当成可用源发出去。
 *
 * 用法：
 *   node scripts/check-feed-urls.mjs                          # 体检全部预置源
 *   node scripts/check-feed-urls.mjs https://example.com/feed # 加源之前先试这一条
 *
 * 退出码：有任何一条不合格即 1（可直接挂到 CI 或发布前的 checklist 上）。
 */
import fs from 'node:fs';
import vm from 'node:vm';

const TIMEOUT_MS = 25000;
const UA = 'Mozilla/5.0 (compatible; UTime/feed-check)';

/* ── 用真源码取源清单（不写正则去啃数组字面量，改了格式也不会失效） ── */
const src = fs.readFileSync(new URL('../public/plugins/rss-reader/main.js', import.meta.url), 'utf8');
const ctx = vm.createContext({
  console,
  document: {
    getElementById: () => null,
    head: { appendChild() {} },
    addEventListener() {},
    createElement: () => ({
      className: '', innerHTML: '', textContent: '', style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute() {}, append() {}, appendChild() {}, addEventListener() {},
    }),
  },
  tide: {
    storage: { async get(k, d) { return d; }, async set() {} },
    notify: () => {},
    ui: { registerView: () => {} },
    http: { get: async () => ({ status: 200, body: '', finalUrl: '' }) },
    tasks: { create: () => ({ id: 't1' }) },
    blocks: { create: () => ({}) },
    util: {
      today: () => '2026-01-01', addDays: (d) => d, hhmmOf: () => '00:00',
      parseWhen: () => ({ date: '', startMin: null, endMin: null }),
      guessQuad: () => 2, guessCategory: () => '其他',
      navigate: () => {}, openUrl: () => {},
    },
  },
});
vm.runInContext(
  src.replace(
    '  tide.ui.registerView({',
    '  globalThis.__fx = { parseFeed, DEFAULT_FEEDS, SUGGESTED_FEEDS };\n  tide.ui.registerView({',
  ),
  ctx,
);
const fx = ctx.__fx;

/* ── 待检清单 ── */
const arg = process.argv[2];
const targets = arg
  ? [{ url: arg, title: '(命令行给的候选)', group: 'candidate' }]
  : [
    ...fx.DEFAULT_FEEDS.map((f) => ({ ...f, group: '默认源' })),
    ...fx.SUGGESTED_FEEDS.map((f) => ({ ...f, group: '推荐源' })),
  ];

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? 2 : 1), 0)));

async function checkOne(t) {
  const r = { ...t, ok: false, why: '' };
  /* 结构性问题先本地判掉，不浪费一次网络请求 */
  if (!/^https:\/\//i.test(t.url)) { r.why = '不是 https（Android 明文策略会拦掉）'; return r; }
  let res;
  try {
    res = await fetch(t.url, {
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    r.why = '抓取失败：' + (e.name === 'TimeoutError' ? TIMEOUT_MS + 'ms 超时' : e.message);
    return r;
  }
  r.status = res.status;
  r.type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!res.ok) { r.why = 'HTTP ' + res.status; return r; }
  let body;
  try { body = await res.text(); }
  catch (e) { r.why = '读正文失败：' + e.message; return r; }
  r.bytes = Buffer.byteLength(body, 'utf8');

  /* 关键一步：交给**真解析器**。状态 200 但解析不出条目，等于装到应用里是块空屏。 */
  let f = null;
  try { f = fx.parseFeed(body, t.url); }
  catch (e) { r.why = '解析抛错：' + e.message; return r; }
  if (!f) { r.why = '解析器判为「不是 feed」（可能是 HTML 错误页 / 需登录 / 内容协商不对）'; return r; }
  r.feedTitle = f.title;
  r.items = f.items.length;
  r.noDate = f.items.filter((x) => !x.date).length;
  r.noLink = f.items.filter((x) => !x.link).length;
  r.covers = f.items.filter((x) => x.cover).length;
  r.snipMax = f.items.reduce((m, x) => Math.max(m, String(x.snippet || '').length), 0);
  r.firstTitle = f.items[0] ? String(f.items[0].title).slice(0, 34) : '';

  if (f.items.length === 0) { r.why = '解析出 0 条（空 feed 或结构不认识）'; return r; }
  if (r.noLink === f.items.length) { r.why = '所有条目都没有链接（点开原文会落空）'; return r; }
  r.ok = true;
  return r;
}

console.log('体检 ' + targets.length + ' 条订阅源（超时 ' + TIMEOUT_MS + 'ms，用真解析器）\n');
const rows = [];
for (const t of targets) {
  const r = await checkOne(t);
  rows.push(r);
  const head = (r.ok ? '✓' : '✗') + ' [' + r.group + '] ' + pad(r.title || '', 18) + ' ' + r.url;
  console.log(head);
  if (r.ok) {
    console.log('    HTTP ' + r.status + ' ' + r.type + ' ' + (r.bytes / 1024).toFixed(1) + ' KB'
      + ' → 「' + r.feedTitle + '」' + r.items + ' 条'
      + ' | 无日期 ' + r.noDate + ' | 无链接 ' + r.noLink + ' | 有封面 ' + r.covers
      + ' | 摘要最长 ' + r.snipMax);
    if (r.firstTitle) console.log('    最新一条：' + r.firstTitle);
    if (r.noDate) console.log('    ⚠️ ' + r.noDate + ' 条没解析出日期，会落进「时间未知」分组');
    if (r.items < 3) console.log('    ⚠️ 只有 ' + r.items + ' 条，可能是被截断的源');
  } else {
    console.log('    ✗ ' + r.why + (r.status ? '（HTTP ' + r.status + ' ' + (r.type || '') + '）' : ''));
  }
}

const bad = rows.filter((r) => !r.ok);
console.log('\n' + '-'.repeat(76));
console.log('合格 ' + (rows.length - bad.length) + ' / ' + rows.length);
if (bad.length) {
  console.log('不合格：');
  for (const r of bad) console.log('  · ' + r.url + ' —— ' + r.why);
  process.exitCode = 1;
} else if (!arg) {
  console.log('全部预置源可用。改过 DEFAULT_FEEDS / SUGGESTED_FEEDS 后请重跑本脚本。');
}
