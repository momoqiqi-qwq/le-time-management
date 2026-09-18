/**
 * v0.67.0 · 局域网直连（单向拉取）的回归守卫。
 *
 * 这个功能的全部安全性建立在两件事上，两条都必须钉住：
 *  ① 电脑端的 HTTP 服务对数据**只读** —— 网络上不存在能覆盖电脑的路径；
 *  ② 手机侧覆盖本机之前先落一个恢复点，且「拉回本机」在探到电脑概况之前是锁着的。
 * 外加 parseLanTarget：小白只会往一个框里粘一样东西，认不出链接就等于没有这功能。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const cardSrc = read('../src/views/settings/sync.js');

/* ── 假 Tauri 后端：一台开着联动服务的电脑 ── */
const TOKEN = 'ab12cd34';
const LAN_PORT = 27123;
const STATE = { tasks: [{ id: 't1' }, { id: 't2' }], blocks: [{ id: 'b1' }], settings: {} };
const routes = [];
let info = { ok: true, appVersion: '9.9.9', savedAtEpoch: 1760000000, dataOk: true, tasks: 2, blocks: 1 };

globalThis.window = {
  __TAURI_INTERNALS__: {
    invoke: async (cmd, args = {}) => {
      if (cmd === 'http_session_new') return 's1';
      if (cmd !== 'http_fetch') throw new Error(`测试桩没实现命令 ${cmd}`);
      const url = new URL(args.url);
      const route = `${args.method} ${url.pathname}`;
      routes.push(route);
      // 端口上挂着别的服务：连接成功但没有我们的路由 → 真服务器会回 404
      if (url.port !== String(LAN_PORT)) {
        return { status: 404, body: 'not found', finalUrl: '', contentType: 'text/plain', location: '', cookies: [] };
      }
      if (url.searchParams.get('token') !== TOKEN) {
        return { status: 403, body: '{"error":"token 无效"}', finalUrl: '', contentType: 'application/json', location: '', cookies: [] };
      }
      const json = (obj) => ({ status: 200, body: JSON.stringify(obj), finalUrl: '', contentType: 'application/json', location: '', cookies: [] });
      if (url.pathname === '/api/info') return json(info);
      if (url.pathname === '/api/state') return json(STATE);
      return { status: 404, body: '{"error":"not found"}', finalUrl: '', contentType: 'application/json', location: '', cookies: [] };
    },
  },
};

const LAN = await import('../src/lanSync.js');
assert.equal(LAN.DEFAULT_LAN_PORT, LAN_PORT, "引导卡提示的默认端口要跟 lanSync 一致");

/* ──  parseLanTarget：一个框要吃下所有粘法 ── */
const pair = LAN.parseLanTarget(`http://192.168.1.5:27123/m?token=${TOKEN}`);
assert.deepEqual(pair, { base: 'http://192.168.1.5:27123', token: TOKEN }, '整条配对链接直接粘进来就该能用');
assert.deepEqual(LAN.parseLanTarget('  http://192.168.1.5:27123/m/?x=1&token=zz  '), { base: 'http://192.168.1.5:27123', token: 'zz' }, '多余参数与空格不影响');
assert.equal(LAN.parseLanTarget('192.168.1.5', TOKEN).base, 'http://192.168.1.5:27123', '只给 IP 时补默认端口');
assert.equal(LAN.parseLanTarget(`192.168.1.5:27123 ${TOKEN}`).token, TOKEN, '地址空一格跟配对码也认');
assert.equal(LAN.parseLanTarget('10.0.0.9:8080/', 'tk').base, 'http://10.0.0.9:8080', '结尾斜杠吃掉');
assert.equal(LAN.parseLanTarget('https://192.168.1.5/m', 'tk').base, 'https://192.168.1.5', 'https 也允许（自建带证书的局域网盒子）');
assert.equal(LAN.parseLanTarget(`http://h:1/m?token=${TOKEN}`, '别的码').token, TOKEN, '链接里带了码就以链接为准');
assert.throws(() => LAN.parseLanTarget(''), /贴进来/);
assert.throws(() => LAN.parseLanTarget('192.168.1.5'), /配对码/);
assert.throws(() => LAN.parseLanTarget('ftp://192.168.1.5', TOKEN), /http/);
assert.throws(() => LAN.parseLanTarget('27123', TOKEN), /192\.168\.1\.5/, '只填了端口这种半截地址要指出缺什么');

/* ── ② 探电脑 / 拉快照 ── */
routes.length = 0;
const seen = await LAN.lanInfo(pair);
assert.equal(seen.savedAt, new Date(1760000000 * 1000).toISOString(), '落盘时间要转成 ISO 给界面用');
assert.match(LAN.describeLanInfo(seen), /电脑上有 2 条任务、1 个时间块/, '条数要说人话');
assert.match(LAN.describeLanInfo(seen), /电脑上是 v9\.9\.9/, '概况里带上电脑端的版本号，好让人确认连对了机器');
assert.deepEqual(routes, ['GET /api/info'], '探概况只读 /api/info，不多发请求');

const snap = await LAN.lanPullSnapshot(pair);
assert.equal(snap.format, 'legacy-data-json', '电脑端 /api/state 给的是裸 data.json，靠同步层的老格式兼容接住');
assert.deepEqual(snap.data.tasks.map((t) => t.id), ['t1', 't2']);
assert.deepEqual(routes, ['GET /api/info', 'GET /api/state']);

await assert.rejects(() => LAN.lanInfo({ base: 'http://192.168.1.5:27123', token: '错的码' }), /配对码不对/);
await assert.rejects(() => LAN.lanInfo({ base: 'http://192.168.1.5:9999', token: TOKEN }), /没在跑本程序/);
info = { ...info, dataOk: false };
await assert.rejects(() => LAN.lanInfo(pair), /数据文件读不出来/);
info = { ...info, dataOk: true, savedAtEpoch: null };
assert.equal((await LAN.lanInfo(pair)).savedAt, '', '拿不到 mtime 时不硬造时间');

/* ── ③ 电脑端必须只读：写入口一个都不许有 ── */
const lan = read('../src-tauri/src/lan.rs');
assert.match(lan, /&tiny_http::Method::Get, "\/api\/info"/, '/api/info 必须是 GET');
assert.match(lan, /"savedAtEpoch": saved_at/);
assert.match(lan, /"dataOk": parsed\.is_some\(\)/, '数据文件读不出来时要如实说，别让手机拉到一份空数据');
assert.doesNotMatch(lan, /Method::Post, "[^"]*\/api\/(snapshot|state|data|import)/,
  '局域网这条只能拉：一旦出现 POST 数据的路由，同网段拿到配对码的人就能整台覆盖电脑数据');
assert.match(lan, /唯一的写入口是 \/api\/command/, '顶部注释要讲清只读边界，否则下一个人会"顺手"加个推送');

/* ── ④ 引导卡接线：先探后拉、覆盖前留恢复点、配对码不落盘 ── */
assert.match(cardSrc, /const pullBtn = el\("button", \{[^}]*disabled: true/, '没连上之前「拉回本机」必须是锁着的');
assert.match(cardSrc, /pullBtn\.disabled = false/, '探到电脑概况后才解锁');
assert.match(cardSrc, /target = null;\s*\n\s*pullBtn\.disabled = true/, '连接失败要重新锁回去');
assert.match(cardSrc, /createAutoBackup\("局域网拉回前"/, '局域网覆盖本机前先存恢复点');
assert.match(cardSrc, /createAutoBackup\("从网盘拉回前"/, '网盘那条同样要先存恢复点');
assert.match(cardSrc, /lanCfg\.host = target\.base\.replace/, '只记地址');
/* v0.67.0 开发中真踩到的一次：卡片里写了 info?.os，而 info 是 settings.js 的模块级变量，
 * 引导卡当场抛错 → 整个设置页空白。卡片模块只许用传进来的参数。
 * 用子串断言而非正则：这条守卫的字面量里全是点号问号，正则转义一坏就退化成永远通过的假断言。 */
assert.equal(cardSrc.includes("info?."), false, "sync.js 里不许出现 info —— 那是 settings.js 的模块级变量，卡片拿不到（拿到了就是整页空白）");
assert.equal(cardSrc.includes("info.version"), false);
assert.ok(cardSrc.includes('appVersion = "", os = ""'), "os 必须由 settings.js 显式传进来");
assert.match(cardSrc, /只能「手机拉电脑」/);
for (const cls of new Set([...cardSrc.matchAll(/sync-[a-z-]+/g)].map((m) => m[0]))) {
  const styles = read('../src/styles.css');
  assert.match(styles, new RegExp(`\\.${cls}[\\s,{:]`), `styles.css 里没有 .${cls} 这条规则`);
}

console.log('PASS: v0.67.0 局域网直连（配对链接解析 / 只读探测与拉取 / 电脑端无任何写入口 / 覆盖前先存恢复点 / 配对码不落盘）');
