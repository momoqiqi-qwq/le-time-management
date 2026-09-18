# public/icons/plugins 素材台账（内置插件图标）

共 15 个图标：15 个来自 **Icons8 / iGoutu** 的 **Color 彩色风格**（`wechat-push` 用 `3d-fluency` 风格，因为 Color 风格没有微信标志）；0 个为印章式文字图标（`风格` 列为 `text`，由本脚本代码绘制，非 Icons8 素材、无需署名）。

图标集入口：<https://igoutu.cn/icons/set/标志--style-color> ｜ CDN 直链格式：`https://img.icons8.com/<style>/96/<slug>.png`

生成方式：`tools/gen-plugin-icons.py`（Pillow，输出 81×81 透明 PNG，图形最长边 58px）。**不要手工替换这些 PNG** —— 重新生成会覆盖。

| 插件 ID | 风格 | slug | 说明 | sha256 |
|---|---|---|---|---|
| `plugin-guide` | color | `help` | 插件使用说明 / 帮助 | `4373b076e9d7c4c3…` |
| `pomodoro` | color | `tomato` | 番茄专注 / 番茄 | `78c87fc7be087e32…` |
| `cppu-notify` | color | `university` | 警大门户通知 / 大学建筑 | `4ece1f4d547e61ef…` |
| `gx-news` | color | `trophy` | 竞赛消息雷达 / 奖杯 | `fb567054f63980b7…` |
| `rss-reader` | color | `rss` | RSS 信息流 / RSS 信号波 | `c53cc754702a43f9…` |
| `exam-calendar` | color | `test-passed` | 考试日历 / 考核清单 | `0b6469d179a28f1f…` |
| `shiguang-schedule` | color | `timetable` | 课程表 / 日历+时钟 | `8385f70b66b57eb5…` |
| `web-collector` | color | `bookmark-ribbon` | 网页收集 / 书签 | `1622bbd5e2c8c069…` |
| `wechat-push` | 3d-fluency | `wechat` | 微信提醒推送 / 微信标志 | `602bb415b23545c4…` |
| `chaoxing-notify` | color | `books` | 学习通 / 一摞书 | `c6ea4c46000bc04c…` |
| `school-notice` | color | `school` | 学校通知网站 / 校舍 | `3a18d8b68b02120f…` |
| `cn-holiday` | color | `lantern` | 中国节假日 / 中式灯笼 | `15f911412b757f4b…` |
| `weekly-report` | color | `statistics` | 周度报告 / 数据看板 | `e1bac31ac1bf7621…` |
| `dorm-duty` | color | `broom` | 轮换值日 / 扫帚 | `17eaff49519fce69…` |
| `inbox-drop` | color | `downloading-updates` | 拖入消息收纳 / 箭头入托盘 | `8e6c606ae009cbb6…` |

## 许可

Icons8 License（免费使用需在产品内署名）。署名入口见设置 → 关于（`src/aboutData.js`）与 `public/OPEN_SOURCE_NOTICES.md`。
素材仅作为本产品界面的组成部分使用，**不得作为独立图标库转售或再分发**。

## 消费方

| 端 | 路径 | 读取方式 |
|---|---|---|
| 桌面 / Android | `le-time-management/public/icons/plugins/*.png` | `src/icons.js` 的 `appIcon()` 按插件 ID 直读 |
| 微信小程序 | `miniprogram/images/plugins/*.png` | `pages/plugins/index.js`、`pages/plugin/index.js` 拼 `/images/plugins/${id}.png` |

两份文件字节一致，由本脚本一次写入。
