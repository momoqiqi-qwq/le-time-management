# Le时间管理 v0.35.0

## 改了什么

一条用户反馈：

> https://service.cppu.edu.cn/fe/site/service 主要是申请相关的一网通办，也添加上去。

### 一、警大门户通知：校园服务栏加上「一网通办」

`cppu-notify` 左侧「校园服务」栏原来有 **WebVPN / 教育邮箱 / 教务 / 学工** 四个入口，
现在补上第五个 **一网通办**，指向用户给的 `https://service.cppu.edu.cn/fe/site/service`。

- 这五个入口都是**系统级入口**（各自的站点根），所以一网通办也放在这一层，
  和教务、学工并列，不深链到某个具体事项页。
- 图标用内置的语义字形 `clipboard-list`（申办 / 办事清单），
  和既有的 shield-halved / envelope / school / id-card 一眼能区分。
- 标题与图标仍由进入插件时抓取的网页元信息**自动识别**，抓不到（未登录 / 断网）就回落到
  label 与语义图标 —— 离线也不会空着。

插件清单版本 `1.5.0 → 1.6.0`，已跑 `tools/sync-plugins.js` 重生成两端 catalog。

### 二、这个站点长什么样（顺手探明，供以后参考）

- `https://service.cppu.edu.cn/fe/site/service` 是 **Nuxt SPA**，页面标题「服务大厅」，
  公开可访问（不登录也能打开外壳）。
- 路由 base 是 `/fe`。SPA 的界面文案抓不到，但 `_nuxt/entry.*.js` 里有路由元信息，
  可以据此确认页面真伪 —— 用 `curl` 看是否被重定向到 SSO 即可区分：

  | 路径 | 结果 | 含义 |
  |---|---|---|
  | `/fe/site/service` | 200，停在原地址 | 服务大厅首页（公开） |
  | `/fe/taskCenter/matter/application` | 302 → `sso.cppu.edu.cn/tpass/login?...redirect_url=…/fe/taskCenter/matter/application?platform_id=23` | 「我的申请」（需登录，真实页面） |
  | `/fe/site/open/launch` | 302 → SSO，同上 | 「我的申请」的另一入口 |
  | 任意伪路径 | 302 → `/fe/` | 不是真实路由 |

  也就是说：**要深链「我的申请」，正确地址是
  `https://service.cppu.edu.cn/fe/taskCenter/matter/application`**（`platform_id=23` 由 SSO 回调补上）。
  本轮按「与其余四个入口同级」的约定，没有采用深链。

### 三、回归与验证

- `scripts/test-cppu.mjs`：
  - 校园服务栏的 URL 断言由四个扩到**五个**（新增 `service.cppu.edu.cn/fe/site/service`）；
  - 版本断言 `1.5.0 → 1.6.0`（manifest 与 `pluginCatalog` 两处）；
  - 新增一条：一网通办入口**必须自带语义图标**（正则校验条目里带 `icon: "…"`），
    免得以后有人只加 url 不带图标、favicon 抓不到时变成通用地球。
- `npm test` 全部通过；`sync-version.js --check`、`gen-theme-dark.js --check`、
  `build-schedule-plugin.js --check` 三项守卫均 ✓。

### 四、版本号说明

本轮改动落在 `public/`（插件清单 + 插件代码），按铁律一必须升版本号。
由于 **v0.34.0 已被另一批改动占用**（番茄自定义时长精确到秒 + Android 四象限修复，
见 `docs/CHANGELOG-v0.34.0.md`），所以从 `0.34.0` 推进到 **`0.35.0`**。

## 影响范围

- Windows / Android：警大门户通知插件的校园服务栏多一个一网通办入口，其余逻辑不变。
- 微信小程序：该插件为 `unavailable`（依赖桌面端 SSO 链路），本版无影响。
- 其余插件无影响。
