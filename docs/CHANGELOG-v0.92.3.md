# v0.92.3

## 警大校园服务栏加「一卡通」

- 「警大门户通知」左侧「校园服务」栏新增第六个入口「一卡通」，指向校园一卡通充值页。
- 图标用 FontAwesome `credit-card`，与既有的 `id-card`（学工）区分开，无法读 favicon 时兜底。
- 刻意**不**进 `TICKET_LINKS`：实测一卡通平台（慧新易校 / 新中新）走它自己的 OAuth2 登录
  （`/berserker-auth/oauth/token` + 图形验证码 `/berserker-auth/oauth/captcha`），
  **不接学校统一身份认证** —— 运行期配置 `casUrl` 指向占位符 `xxx.xxx.edu.cn`、
  `client_id=xxxxxxxxxxxxx`，SSO 换票链路是坏的，换不到免登票据，裸开即可。
  进了 `TICKET_LINKS` 只会白等一次换票再回退。

## 影响范围与限制

- 修改 `public/plugins/cppu-notify/main.js` 与插件清单，影响 Windows / Android 共用前端的
  「警大门户通知」校园服务栏。
- 插件版本升到 `1.14.0`；应用版本升到 `0.92.3`。
- 无数据迁移。

## 已知限制（平台侧，插件无解）

- 一卡通登录态存 `sessionStorage`（键 `access_token`），关标签页即失效；bundle 里
  `refresh_token` / `rememberMe` / `autoLogin` / `expires_in` 命中数全为 0，无自动续期。
  ⇒ 与「教务」（统一身份认证现场换票免密）、「教育邮箱」（复用密钥库密码自动登录）不同，
  **这个入口每次新会话都要重登**（学/工号 + 密码 + 图形验证码）。
- 入口落在**充值页**。若想落到「卡包」首页，把 URL 换成
  `https://yktcard.cppu.edu.cn/campus-card/campusCard?name=campusCard&appId=2&loginFrom=h5&type=app`
  （该 SPA 是 history 模式路由，登录后的表现未实测）。

## 验证

- `node --check public/plugins/cppu-notify/main.js`
- `node scripts/test-cppu.mjs` —— 新增 2 条断言（入口存在 + 自带语义图标），并钉住反面判据
  「一卡通 URL 只出现在 QUICK_LINKS 一处，不得进 TICKET_LINKS」。
- 变异测试 2 条全被拦下：删掉入口 → `校园服务栏必须包含 …` 失败；
  把 URL 混进 `TICKET_LINKS` → `一卡通 URL 只应出现在 QUICK_LINKS 一处` 失败。
- `node ../tools/sync-version.js --check` ✓（三端 v0.92.3）；
  `node scripts/run-tests.mjs` 73 个测试脚本全部通过。
