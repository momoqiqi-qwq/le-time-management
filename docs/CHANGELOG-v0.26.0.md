# Le时间管理 v0.26.0

## 改了什么

### 警大门户 1.5.0：左侧新增「校园服务」栏（标题与图标自动识别）

- 通知列表页与登录页左侧各加一列校园服务侧栏，内置四个常用入口：
  WebVPN、教育邮箱、教务、学工（`xg.cppu.edu.cn` 手机版）。
- 入口标题与图标由 `tide.util.web.parseSiteMeta()` 抓网页元信息自动识别：
  标题取 `og:site_name` 或 `<title>`，图标取站点 favicon；抓不到（内网、未登录、断网）
  就退回内置短名与 Font Awesome 字形图标，因此离线也不会空着。
- 识别结果写入插件本地存储 `quickLinkMeta`，7 天内复用，不会每次进插件都抓四个站点；
  侧栏标题右侧的 `↻` 可手动重新识别。
- 侧栏点击走 `tide.util.openUrl()`，在系统浏览器打开（不占用应用内窗口）。
- 配色全部使用应用主题变量（`--panel` / `--line` / `--ink`），夜间模式与各套主题自动跟随。
- 窄屏（≤820px，含 Android）自动改为内容上方的横向按钮排，不再占一列。
- 插件 `permissions` 新增 `openUrl`，版本 1.4.2 → 1.5.0；三端插件清单已重新生成。

## 影响范围

- 警大门户通知插件（Windows 与 Android 共用同一份插件代码）。
- 插件清单与 `pluginCatalog`：`src/pluginCatalog.js`、`miniprogram/core/pluginCatalog.js`。
- 小程序端该插件本就标记 `unavailable`，不受影响。

## 数据迁移

无。识别结果存在插件自己的存储里，缺失时会自动重新抓取。
