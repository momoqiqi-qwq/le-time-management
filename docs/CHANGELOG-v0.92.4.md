# v0.92.4

## 警大校园服务栏加「我的请假」

- 「警大门户通知」左侧「校园服务」栏新增第七个入口「我的请假」，直达学工系统的请假列表页。
- 入口用的是学工 SPA（`xg.cppu.edu.cn/XGPhone/Phone`）的 **hash 路由** `#/StuDailyLeaveList`
  —— 与既有「学工」入口同源，只是落到具体页面。hash 不参与请求，所以既有的站点元信息
  抓取（`parseSiteMeta`）与 favicon 兜底逻辑照常工作。
- 图标用 FontAwesome `calendar-check`，与既有的 `id-card`（学工）区分开，无法读 favicon 时兜底。
- 刻意**不**进 `TICKET_LINKS`：实测裸开 `index.html` 返回 **200 静态壳、没有服务端 302**
  （ASP.NET + Vue SPA，主包里路由表有自己的 `/Login`），登录由该 SPA 自身的体系处理
  ⇒ 不属于「302 到统一身份认证」那一类，CAS `service` 换票链路不适用，裸开即可。

## ⚠️ 用户给的原始地址不能照抄

用户给的地址形如
`…/index.html?code=<UUID>&state=QYState&url=#/StuDailyLeaveList` —— 那是**登录后的落地页**，
`code` 是一次性授权码、用完即废。**原样写进入口必然点开失败**，所以实现里只保留
**裸地址 + hash 路由**，并加了反面断言钉死这一点：源码里一旦出现 `index.html?code=` 或
`state=QYState` 就红。

## 影响范围与限制

- 修改 `public/plugins/cppu-notify/main.js` 与插件清单，影响 Windows / Android 共用前端的
  「警大门户通知」校园服务栏。
- 插件版本升到 `1.15.0`；应用版本升到 `0.92.4`。
- 无数据迁移。

## 已知限制（平台侧，插件无解）

- 若浏览器里没有学工会话，该 SPA 会走它自己的 `/Login`，回跳后可能落在首页而不是请假页 ——
  与「学工」入口同源同行为。插件侧无法代登：该站不接受 CAS `service` 换票，
  用户给的 `code` 又只活一次，写死无意义。

## 验证

- `node --check public/plugins/cppu-notify/main.js`
- `node scripts/test-cppu.mjs` —— 入口清单加新 URL，新增 1 条语义图标断言 + 2 条反面判据
  （不得进 `TICKET_LINKS`；不得写死带 `code` / `state` 的地址）。
- 变异测试 3 条全被对应断言拦下（且每轮 `finally` 还原后回读比对为真）：
  删掉入口 → `校园服务栏必须包含 …` 失败；
  把 URL 混进 `TICKET_LINKS` → `「我的请假」URL 只应出现在 QUICK_LINKS 一处` 失败；
  原样抄带 `code` 的地址 → `不得写死带一次性授权码` 失败。
- `node ../tools/sync-version.js --check` ✓（三端 v0.92.4）；
  `gen-theme-dark` / `build-schedule-plugin` / `build-exam-calendar-plugin` /
  `sync-android-native` 四个 `--check` 全 ✓。
- 逐脚本跑完 `scripts/test-*.mjs`：**72 通过 / 1 失败**。
  唯一失败是 `test-dorm-duty.mjs`，属**并行会话在途**的宿舍值日小程序适配半成品
  （断言 `miniprogram/pages/plugin/index.js` 里的 `onDdGroupMenu` 尚未实现），与本版本无关。
  ⚠️ 注意 `npm test`（`run-tests.mjs`）遇首个失败即 `exit`，会被这个半成品**中断**在
  d 开头处，看不到后面的脚本 —— 需要完整结论时用逐脚本循环跑。
