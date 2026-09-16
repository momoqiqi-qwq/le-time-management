# v0.45.1 版本说明

发布日期：2026-09-16

> 本版含四处改动：① 插件开发文档新增「返回按钮」硬性要求；② school-notice 插件站点卡片新增「编辑」按钮；
> ③ school-notice 插件支持「JSON 接口型」站点（服务端只吐空壳、列表靠 JS 渲染），并登记北航信息门户；
> ④ 番茄专注卡片接入自定义背景的「卡片不透明度 / 卡片毛玻璃」。

## 改动一 · 插件开发文档加「返回按钮」硬性要求

- `public/plugins/plugin-guide/plugin-development.md`（随包分发）第 4 节改为
  「插件页面规范与建议」，新增 **4.1 返回按钮（硬性要求）**：
  - 插件多级子页面自维护页面栈，返回按钮回退上一级；
  - 经 `tide.util.navigate()` 跳到其他视图前先记录来源视图，返回时送用户回去；
  - 返回按钮固定在页面顶部显眼位置（手机端尤其重要）。
  - 附「页面栈 + 顶部返回按钮」「跨视图跳转记来源」两段参考实现
    （宿主没有 `tide.util.back` API，文档不造不存在的接口）。
- 第 6 节发布前自检清单加对应检查项。

## 改动二 · school-notice 插件 · 站点卡片新增「编辑」按钮

- 站点卡片的操作区（刷新通知 / 登录配置 / 打开网站 / 删除）新增**「编辑」**按钮。
- 点「编辑」展开行内编辑框，可修改站点的**名称**与**通知/公告网址**，支持「保存」与「取消」。
- 改名称只影响显示；**改网址会作废旧缓存**（公告列表、已展开正文、适配模式、
  最近读取时间、站点图标）并自动重新读取公告 —— 旧缓存按旧网址抓的，直接复用会串站。
- 切换站点标签或删除站点时自动收回编辑框，避免编辑状态串到别的站点。
- 网址留空保存会被拦截并提示（想移除站点请用「删除」）。

## 改动三 · school-notice 支持「JSON 接口型」站点，登记北航信息门户

### 问题

北航信息门户 `it.buaa.edu.cn/portal/pages/newsite/site/informationPc/zixun?system=news`
在插件里**读不到任何通知，而且不给任何提示** —— 界面只显示「已读取 0 条公告」。

根因：该站是 **Nuxt 3 单页应用**，服务端返回的 HTML 是空壳。实测 HTTP 200 / 11642 字节，
**整页 0 个 `<a>` 标签**、连 `<title>` 都是空的，body 里只有 `<div id="__nuxt">` 与
`window.__NUXT__`；列表由浏览器执行 JS 后调 `/portal/news/frontend/default/news-list` 渲染。
而插件当时只会 DOM 解析（`extractNoticeLinks()` 扫 `a[href]`），遇到空壳必然 0 条。
⇒ 凡是「服务端只吐空壳、列表靠 JS 渲染」的站点，通用解析全都拿不到东西。

### 改动

**① 新增「JSON 接口型站点」适配层**（`src/webContent.js`）

表驱动，加新学校只需往 `JSON_SITE_ADAPTERS` 加一条登记，不必改插件代码：

| 函数 | 作用 |
|---|---|
| `detectSpaShell(html)` | 认出 Nuxt / Next.js / React / Angular / Vue 的 JS 渲染空壳，返回框架名与页面里现成的链接数（提示文案要用） |
| `matchJsonSiteAdapter(url)` | 页面 URL 命中哪个已登记站点，返回 `{ id, label }` |
| `buildJsonSiteListUrl(id, url)` | 由**页面 URL** 推出列表接口地址（页面上的 `?system=` 栏目参数原样带给接口） |
| `parseJsonSiteList(id, body, baseUrl)` | 把接口响应映射成与 `extractNoticeLinks()` **同构**的条目 |

映射出来的条目结构（`title / url / date / score / kind / snippet`）与 DOM 解析完全一致，
所以搜索、筛选、「仅通知/公告」、转提醒这些下游逻辑**全部复用**，不必区分数据来源。

已登记：**北航信息门户**（`it.buaa.edu.cn` 资讯页 → `news-list` 接口）。
实测该接口无 cookie 可访问、`pageSize=100` 不被限、`total=6616` 条。

**② 插件改为两条取数路径**（`public/plugins/school-notice/main.js`）

新增 `collectNotices()`：命中适配器就直接读接口，否则回退 DOM 解析；
**接口失败时安静回退，不整页报错**。站点卡片的「适配模式」会显示
「北航信息门户（Nuxt 资讯接口）」。

**③ 读不到时说明原因**（不再静默 0 条）

- 命中适配器但接口没数据 → 提示接口的 HTTP 状态。
- DOM 解析 0 条且判定为 SPA 空壳 → 明确告知「这是 XX 单页应用，HTML 里只有 N 个链接，
  通知列表由浏览器执行 JS 后才渲染，插件读不到」，并给出「换成通知公告列表页」
  「反馈给插件做站点适配」两条出路。
- 提示按站点持久化（`sites[].spaHint`），重开插件仍能看到；改网址时会随之清空。

**④ 空壳页的站名与图标改由适配器登记**（原来会退成域名）

空壳页**既没有 `<title>` 也没有 `<link rel=icon>`**，`parseSiteMeta()` 只能退成
「域名 + 猜一个 `/favicon.ico`」⇒ 添加该站点后名字会显示成 `it.buaa.edu.cn`。
适配器新增 `meta: { title, iconPath }`，命中时用登记值补齐：

- 站点名 `it.buaa.edu.cn` → **「北航信息门户」**。**只在名字还是域名时才改**，
  不覆盖用户自己起的名字。
- 图标走登记的 `/favicon.ico`（实测确实是真 ICO，1150 字节 / 16×16）。
  未登记的站点仍走 `parseSiteMeta()` 兜底，行为不变。

同时**站点卡片标题与站点标签页前面也加上了站点图标**（22px / 14px）——
此前只有列表项前面有图标，站点名前面是空的。图标加载不出来时退成首字色块（沿用既有 `no-img` 逻辑）。

### 验证

- `scripts/test-web-content.mjs` 新增一批断言：空壳判定（含「普通页面不能被误判」）、
  适配器匹配（含同域非目标页 / 未登记站点 / 非法 URL）、接口地址生成（含栏目参数透传）、
  字段映射（日期倒序、`kind` 分类、摘要拼接）、以及「接口挂了或改版了必须安静返回空数组」
  的容错。
- **真网络端到端**（`test-results/buaa-adapter-probe.mjs`）：页面 200 / 0 个链接 →
  判定 Nuxt → 命中适配器 → 接口 200 / 74091 字节 → **解析出 100 条**，
  标题、日期、栏目摘要、详情页地址全部正确。
- **插件级验证**（`output/plugin-preview-buaa.cjs`：内联真 `webContent.js` + 真插件 + 最小宿主 mock，
  无头 Chrome 跑真实交互）：点「刷新通知」后网络调用**恰好两条**（空壳页 → `news-list` 接口），
  站点名从 `it.buaa.edu.cn` 补成「北航信息门户」、图标补齐、标题前图标 22px 渲染成功、缓存 100 条；
  默认「仅通知/公告」显示 2 条，切「全部条目」= 100 / 100。

## 改动四 · 番茄专注卡片接入自定义背景的透明度设置

### 问题

开启自定义背景后，应用自己的卡片（`.card` / `.set-card` 等）会跟随设置里的
「卡片不透明度」「卡片毛玻璃」滑块变半透明、透出壁纸，但**番茄专注的卡片始终是一块
不透明的纯色矩形** —— 两个透明度滑块对它毫无效果。

根因：应用卡片靠 `styles.css` 的 `:root[data-custom-background="on"]` 规则生效，
而插件卡片是插件自己写的**内联样式** `background:var(--panel,#fff)`，CSS 规则管不到，
透明度变量传进去也没被使用。

### 改动

- `src/background.js`：新增两个按 `cfg.enabled` 门控的复合变量 ——
  `--custom-panel-mix`（开启时 = `color-mix(in srgb, var(--panel) <卡片不透明度>%, transparent)`，
  关闭时 = 不透明的 `var(--panel)`）与 `--custom-panel-glass`（开启时 = `blur(<卡片毛玻璃>px)`，
  关闭时 = `none`）。任何插件把卡片底色换成 `var(--custom-panel-mix,…)` 即可自动跟随设置。
- `public/plugins/pomodoro/main.js`（插件 0.4.0 → **0.4.1**）：卡片底色改用
  `var(--custom-panel-mix,var(--panel,#fff))`，并接上 `backdrop-filter:var(--custom-panel-glass,none)`。
- `scripts/test-pomodoro.mjs`：加守卫断言（卡片必须使用两个变量、
  `background.js` 必须注入且按 `cfg.enabled` 门控），插件版本断言同步 0.4.1。
- 未开启自定义背景时外观零变化（变量退回不透明 `var(--panel)`、无 blur）。

## 影响端

- 桌面（Windows / macOS / Linux）与 Android WebView：插件端共享同一份 `public/plugins/school-notice/main.js`，两端同步生效。
- 宿主 `src/webContent.js` 新增能力，并经 `src/pluginHost.js` 的 `tide.util.web.*` 暴露给插件
  （`detectSpaShell` / `matchJsonSiteAdapter` / `buildJsonSiteListUrl` / `parseJsonSiteList`，均需 `http` 权限）。
- 小程序：不涉及（school-notice 插件在小程序端为 `unavailable`，目录未同步）。

## 数据迁移

无强制迁移。`sites` 存储键结构向后兼容，仅新增可选的 `spaHint` 字段 ——
老站点读出来是 `undefined`，行为等同空串，首次刷新后自动补齐。

