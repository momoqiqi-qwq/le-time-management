import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/plugins/wechat-push/main.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/plugins/wechat-push/manifest.json', import.meta.url), 'utf8'));

/* ── 1. 官方文档入口：链接必须是 pushplus 官方域名，且经 openUrl 系统浏览器打开 ── */
assert.ok(source.includes('https://www.pushplus.plus/doc/guide/sdk.html'), '必须链接官方使用说明/SDK 文档');
assert.ok(source.includes('https://www.pushplus.plus/doc/guide/api.html'), '必须链接官方消息接口文档');
assert.ok(source.includes('tide.util.openUrl'), '文档链接必须用 openUrl 经系统浏览器打开');
assert.equal(manifest.version, '1.8.1');
assert.ok((manifest.permissions || []).includes('openUrl'), 'manifest 必须声明 openUrl 权限');
assert.ok((manifest.permissions || []).includes('events'), '订阅 notice:new 必须在 manifest 声明 events 权限');
const catalog = fs.readFileSync(new URL('../src/pluginCatalog.js', import.meta.url), 'utf8');
const entry = catalog.slice(catalog.indexOf('"id": "wechat-push"'));
const block = entry.slice(0, entry.indexOf('},\n  {'));
assert.match(block, /"1\.8\.1"/, 'pluginCatalog 必须同步插件新版本号');
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
// 错误信息必须带官方返回码（999=服务端验证错误 等要对官方返回码表排查，只有 msg 对不上号）
pushplusResp = { status: 200, body: JSON.stringify({ code: 999, msg: '服务端验证错误' }) };
await assert.rejects(() => pushPlus('t', 'c'), /PushPlus\[999\]服务端验证错误/, '失败信息必须带 PushPlus 返回码');
// HTTP 错误也必须抛出
pushplusResp = { status: 403, body: '' };
await assert.rejects(() => pushPlus('t', 'c'), /HTTP 403/);

/* ── 3. v1.5.0：PushPlus 频次限制防护 ──
   官方规则：相同内容 1 小时限 3 条、每分钟限 5 次，超限返回 999「服务端验证错误」。
   实测事故：15:04 连发 3 条相同测试推送成功，15:05 起第 4 条开始全部 999。 */
assert.match(source, /Le时间管理测试推送 \$\{at\}/, '测试推送标题必须带时间戳，避免撞「相同内容 1 小时 3 条」限制');
assert.match(source, /lastTestAt/, '测试推送必须有防连点节流');
assert.match(source, /999\|服务端验证/, '失败日志必须识别 999 并给出频次限制提示');
assert.match(source, /推送「\$\{title\.slice\(0, 20\)\}」/, '失败日志必须带上推送标题，便于对号入座');

/* ── 4. v1.7.0 多选 + v1.8.0 攒批：插件消息合并成一条推送 ──
   旧单选下拉（data-scope）已移除；pushScope 数组持久化，老配置从 blockEnabled/taskEnabled 反推。
   v1.8.0 攒批策略（对照 PushPlus 官方限制：相同内容 1 小时限 3 条、每分钟限 5 次、内容 ≤20000 字）：
   首条入队后攒 2 分钟（节流式窗口），到点把队列里全部待发消息合并成一条推送，请求数压到最低。 */
assert.match(block, /"1\.8\.1"/, 'pluginCatalog 必须同步插件新版本号');
assert.match(source, /data-ms="block"/, '多选面板要有「时间块」选项');
assert.match(source, /data-ms="task"/, '多选面板要有「任务截止」选项');
assert.match(source, /data-ms="plugin"/, '多选面板要有「插件收集的新消息」选项');
assert.match(source, /pushScope/, '多选结果必须存进 pushScope');
assert.match(source, /state\.blockEnabled = state\.pushScope\.includes\("block"\)/, 'blockEnabled 必须由 pushScope 派生（tick 逻辑不变）');
assert.match(source, /state\.blockEnabled && state\.taskEnabled \? \["block", "task"\] : state\.blockEnabled \? \["block"\] : state\.taskEnabled \? \["task"\] : \["block", "task"\]/, '老配置必须能反推出初始多选状态');
assert.match(source, /tide\.events\.on\("notice:new", queuePluginNotice\)/, '必须订阅 notice:new 事件');
assert.match(source, /PLUGIN_BATCH_WINDOW_MS = 2 \* 60 \* 1000/, '插件消息必须攒批 2 分钟再发，不能每条广播立即推送');
assert.match(source, /state\.pluginQueue\.slice\(\)/, '一批必须带上队列里全部待发消息，把请求数压到最低');
assert.match(source, /state\.pluginQueue\.length > PLUGIN_QUEUE_CAP/, '消息队列必须有上限');
assert.match(source, /PLUGIN_QUEUE_CAP = 60/, '队列上限 60 条（攒批窗口内足够缓存多个插件的广播）');
assert.match(source, /PLUGIN_CONTENT_LIMIT = 18000/, '单条推送正文必须按 PushPlus 2 万字上限留余量截断');
assert.match(source, /if \(ok\) \{ state\.pluginQueue\.splice\(0, batch\.length\); paintQueue\(\); \}/, '推送成功才出队，失败留下次重试');
assert.match(source, /if \(!state\.pluginTimer\) await flushPluginNotices\(\)/, 'tick 只做失败重试/兜底，攒批窗口倒计时中不得提前发送');
assert.match(source, /\$\{batch\.length\} 条（\$\{now\}）/, '批量推送标题要带条数和时间，避免撞「相同内容 1 小时 3 条」');
assert.doesNotMatch(source, /data-scope/, '旧单选下拉不应残留');

/* ── 5. v1.8.1 多选面板可收起 + 展开/收起动画 ──
   事故：.wp-ms-panel 的 display:flex 是作者样式，永远压过 UA 的 [hidden]{display:none}，
   msPanel.hidden 切了也没用 → 面板恒展开收不回去。改为 .on 类切换 + 过渡动画。 */
assert.match(source, /\.wp-ms-panel\.on\{/, '面板必须用 .on 类控制展开态（hidden 属性被 display:flex 压住，不可用）');
assert.doesNotMatch(source, /msPanel\.hidden/, '不得再用 hidden 属性开关面板（根因所在）');
assert.match(source, /setMsOpen\(!msPanel\.classList\.contains\("on"\)\)/, '点按钮必须按当前状态取反开合');
assert.match(source, /if \(!e\.target\.closest\("\[data-ms\]"\)\) setMsOpen\(false\)/, '点外部必须收起面板');
assert.match(source, /aria-expanded/, '按钮必须同步 aria-expanded');
assert.match(source, /wp-ms-caret/, '箭头必须可随开合旋转');
assert.match(source, /transition:opacity \.18s ease,transform \.18s ease/, '展开/收起必须有过渡动画');
assert.match(source, /@media \(prefers-reduced-motion:reduce\)\{\.wp-ms-panel,\.wp-ms-caret\{transition:none\}\}/, '必须尊重 reduced-motion 关掉动画');
assert.match(source, /<div class="wp-ms-panel" data-ms-panel>/, '面板初始为收起态（不再带 hidden 属性）');

console.log('PASS: wechat-push 官方文档入口、openUrl 权限、PushPlus 请求体与成功/失败判定、返回码透传与频次限制防护、多选面板可收起与开合动画');
