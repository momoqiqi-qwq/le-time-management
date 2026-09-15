# v0.37.14 · 校园服务「教务」免密直达

## 背景

左侧「校园服务」栏的五个入口里，只有「教务」是**必须登录才能进**的站点：裸开
`https://jw.cppu.edu.cn/index.html` 会 302 到 `sso-jw.cppu.edu.cn/tpass/login`，最终落在
统一身份认证登录页，点了等于没点。

门户侧给出的替代方案是带 token 的链接（形如
`https://jw.cppu.edu.cn/index.html?token=…&platform=qywx`，`platform=qywx` 表示票据由企业微信
工作台签发）。实测该 `token` 会被前端写进 `authorization` cookie，带它调
`/je/rbac/user/getCurrentUserInfo` 返回的是**具体某个账户**，不带则退化成 `SYSTEM` 游客——
也就是说它是一张**个人账号凭据**（实测签发时间 2026-09-13 21:57，两天后仍有效，属长期会话票据）。
把它写进插件源码等于随公开仓库一起发出去，且必然过期。**因此本版不接收、不保存、不内置任何 token。**

## 变更

`public/plugins/cppu-notify/main.js` 新增换票入口：

- `TICKET_LINKS`：声明哪些入口需要先换票，以及目标站的 CAS 回调
  （`service = https://jw.cppu.edu.cn/cas_callback`，`origin` / `path` 供白名单校验）。
- `mintTicket()`：用插件自身那份统一身份认证会话现场换一张**一次性 ticket**：
  1. 先向 `sso-jw/tpass/login?service=<目标>` 要票，会话还在时一次请求即可；
  2. 要不到（`sso-jw` 域没会话）时，用主 SSO 的 CASTGC 补走一次 `tpass/bridge` 落会话，再要一次。
- `openSideLink()`：点击入口时换票并交给系统浏览器；**任何一步拿不到票就退回裸链接**，
  并提示「可能需要先登录一次」，入口不会点了没反应。
- 换票期间按钮置 `aria-busy="1"`（`opacity:.55` + `cursor:progress`）给出反馈。

**关键约束**：换票链路每一段都必须 `followRedirects:false`。ticket 是一次性的，跟着重定向跑到底
就等于插件自己把票吃了，浏览器拿到的反而是一张废票——所以只取 `Location`，绝不消费。
`redirectTarget()` 同时校验协议、域名与路径，票指向别处一律丢弃。

标题提示（`title`）里为这类入口追加「用统一身份认证自动换票，免密直达」，便于发现。
其余四个入口（WebVPN / 教育邮箱 / 学工 / 一网通办）行为不变，仍是直接打开、不发任何请求。

## 影响端

- 桌面（Windows）与 Android：同一份前端，均生效。
- 微信小程序：本插件 `platforms.miniprogram = unavailable`，不受影响。

## 数据迁移

无。插件不新增任何持久化字段（票据只活在这一次点击的内存里）。

## 验证

- `scripts/test-cppu.mjs` 新增：① 会话有效时只发一次换票请求且禁止自动重定向；
  ② 要不到票时必须是「要票 → bridge → 落票 → 再要票」四段，每段都禁用重定向；
  ③ 彻底换不到票时退回裸链接并提示；④ 未声明换票的入口仍然直开且不发请求。
  另加 5 条源码守卫（必须声明 `TICKET_LINKS` / 必须能补走 bridge / 源码里不得出现写死的 `token=`）。
- 真机探测记录：裸开 `index.html` → 302 `sso-jw…/tpass/login?service=…jw/cas_callback`；
  带 token 打开 → 200 且 `/je/…/getCurrentUserInfo` 返回真实账户；`sso-jw/tpass/login` 在持有会话时
  返回带 `ticket=` 的 302。
- 三端版本一致：`sync-version.js --check` ✓，主题派生 `--check` ✓，课程表生成物 `--check` ✓。
