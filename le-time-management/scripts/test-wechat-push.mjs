import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/plugins/wechat-push/main.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/plugins/wechat-push/manifest.json', import.meta.url), 'utf8'));

/* ── 1. 官方文档入口：链接必须是 pushplus 官方域名，且经 openUrl 系统浏览器打开 ── */
assert.ok(source.includes('https://www.pushplus.plus/doc/guide/sdk.html'), '必须链接官方使用说明/SDK 文档');
assert.ok(source.includes('https://www.pushplus.plus/doc/guide/api.html'), '必须链接官方消息接口文档');
assert.ok(source.includes('tide.util.openUrl'), '文档链接必须用 openUrl 经系统浏览器打开');
assert.equal(manifest.version, '1.2.0');
assert.ok((manifest.permissions || []).includes('openUrl'), 'manifest 必须声明 openUrl 权限');
const catalog = fs.readFileSync(new URL('../src/pluginCatalog.js', import.meta.url), 'utf8');
const entry = catalog.slice(catalog.indexOf('"id": "wechat-push"'));
const block = entry.slice(0, entry.indexOf('},\n  {'));
assert.match(block, /"1\.2\.0"/, 'pluginCatalog 必须同步插件新版本号');
assert.match(block, /"openUrl"/, 'pluginCatalog 必须同步 openUrl 权限');

/* ── 2. vm 实测 pushPlus：请求体、成功判定、失败透传 ── */
const calls = [];
let pushplusResp = { status: 200, body: JSON.stringify({ code: 200, msg: '请求成功', data: 'x' }) };
const context = vm.createContext({
  URL, Set, Map, Date, console, setTimeout, clearTimeout, Promise,
  document: { createElement: () => ({ set innerHTML(x) { this.value = x; } }) },
  tide: {
    ui: { registerView() {} },
    storage: { get: async () => null, set: async () => {} },
    http: {
      session: async () => 's1',
      fetch: async (...args) => { calls.push(args); return typeof pushplusResp === 'function' ? pushplusResp(...args) : pushplusResp; },
      get: async () => { throw new Error('not used'); },
    },
    util: { openUrl: async () => {} },
    notify: () => {},
  },
});
vm.runInContext(source.replace('  tide.ui.registerView(', '  globalThis.testApi = {pushPlus, serverChan, state};\n  tide.ui.registerView('), context);
const { pushPlus, state } = context.testApi;

// 等模块加载期的 loadPrefs 微任务完成，避免其覆盖测试注入的凭据
await new Promise((resolve) => setTimeout(resolve, 0));
state.token = 'd-order-token';
state.topic = 'group-1';
await pushPlus('测试标题', '测试内容');
const [sid, method, url, opts] = calls.at(-1);
assert.equal(sid, 's1');
assert.equal(method, 'POST');
assert.equal(url, 'https://www.pushplus.plus/send');
assert.equal(opts.headers['Content-Type'], 'application/json');
const payload = JSON.parse(opts.body);
assert.equal(payload.token, 'd-order-token');
assert.equal(payload.title, '测试标题');
assert.equal(payload.content, '测试内容');
assert.equal(payload.template, 'txt');
assert.equal(payload.channel, 'wechat');
assert.equal(payload.topic, 'group-1', '填写 Topic 时必须带上群组编码');

// 官方接口：code=200 才算提交成功
pushplusResp = { status: 200, body: JSON.stringify({ code: 903, msg: '发送频率过快' }) };
await assert.rejects(() => pushPlus('t', 'c'), /发送频率过快/, '非 200 返回码必须把官方 msg 透传给用户');
// HTTP 错误也必须抛出
pushplusResp = { status: 403, body: '' };
await assert.rejects(() => pushPlus('t', 'c'), /HTTP 403/);

console.log('PASS: wechat-push 官方文档入口、openUrl 权限、PushPlus 请求体与成功/失败判定');
