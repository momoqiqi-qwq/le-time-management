// 端到端验证「JSON 接口型站点」适配链路 —— 打真网络，取证用。
// 覆盖 src/webContent.js 的 detectSpaShell / matchJsonSiteAdapter /
// buildJsonSiteListUrl / parseJsonSiteList，也就是插件 school-notice
// 里 collectNotices() 走的同一条路径。
// 用法：node test-results/buaa-adapter-probe.mjs
import { detectSpaShell, matchJsonSiteAdapter, buildJsonSiteListUrl, parseJsonSiteList } from '../le-time-management/src/webContent.js';

const PAGE = 'https://it.buaa.edu.cn/portal/pages/newsite/site/informationPc/zixun?system=news';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const get = async (url, accept) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': accept, 'Referer': PAGE } });
  return { status: r.status, text: await r.text() };
};

const page = await get(PAGE, 'text/html,application/xhtml+xml');
console.log(`① 页面 ${page.status} · ${page.text.length} 字节 · <a> 标签 ${(page.text.match(/<a\b[^>]*href/gi) || []).length} 个`);

const shell = detectSpaShell(page.text);
console.log('② SPA 空壳判定：', shell);

const adapter = matchJsonSiteAdapter(PAGE);
console.log('③ 命中适配器：', adapter);
if (!adapter) { console.error('未命中，后续无法验证'); process.exit(1); }

const apiUrl = buildJsonSiteListUrl(adapter.id, PAGE, { max: 100 });
console.log('④ 推出接口地址：', apiUrl);

const api = await get(apiUrl, 'application/json, text/plain, */*');
console.log(`⑤ 接口 ${api.status} · ${api.text.length} 字节`);

const rows = parseJsonSiteList(adapter.id, api.text, PAGE, { max: 100 });
console.log(`⑥ 解析出 ${rows.length} 条，前 5 条：`);
for (const r of rows.slice(0, 5)) console.log(`   ${r.date || '无日期'} [${r.kind}] ${r.title}\n        ${r.snippet || '（无摘要）'}`);
console.log('⑦ 首条详情页地址：', rows[0] && rows[0].url);
