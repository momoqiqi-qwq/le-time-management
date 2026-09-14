# Le时间管理 v0.30.0

## 改了什么

### 12 个内置插件图标换成 Icons8 / iGoutu 的「标志 · 色版」彩色图标集

图标集入口：<https://igoutu.cn/icons/set/标志--style-color>（igoutu.cn 是 Icons8 的中文镜像，slug 与风格与 icons8.com 完全一致）。

**为什么值得换**

原来的 12 个插件图标是深青色（`#0F4C5C`）单色剪影，落在 81×81 画布上、图形只有 50px。它们在浅色底板（`#EDF5F6`）上还算清楚，但侧栏「插件视图」那一列在夜间主题下用的是半透明白底板叠深色背景，深青图标贴上去基本糊成一团 —— 这就是为什么列表里那个彩色图标（用户自定义的）会显得格外跳。

换成彩色图标后，两种主题下都能一眼分辨，而且语义比单色剪影更好认。

**换成什么**

| 插件 | 图形 | CDN slug |
|---|---|---|
| 插件使用说明 | 蓝色问号 | `color/help` |
| 番茄专注 | 番茄 | `color/tomato` |
| 警大门户通知 | 柱廊建筑 | `color/university` |
| 竞赛消息雷达 | 金色奖杯 | `color/trophy` |
| 考试日历 | 考核清单 | `color/test-passed` |
| 课程表 | 日历 + 时钟 | `color/timetable` |
| 网页收集 | 红色书签 | `color/bookmark-ribbon` |
| 微信提醒推送 | **微信标志** | `3d-fluency/wechat` |
| 学习通 | 一摞书 | `color/books` |
| 学校通知网站 | 校舍 | `color/school` |
| 中国节假日 | 中式灯笼 | `color/lantern` |
| 周度报告 | 数据看板 | `color/statistics` |

`wechat-push` 是唯一风格不同的一个：**Icons8 的 Color 风格没有微信标志**（`color/wechat` 返回 404），只有 3D 风格有，所以用了 `3d-fluency/wechat`。对一个名字就叫「微信提醒推送」的插件，能一眼认出的微信标志比风格绝对统一更值钱；台账里已注明这一点，介意的话换 `color/speech-bubble` 即可。

### 桌面端与小程序用同一份素材

- 桌面 / Android：`public/icons/plugins/<插件ID>.png`，`src/icons.js` 的 `appIcon()` 按插件 ID 直读（离线可用）。
- 微信小程序：`miniprogram/images/plugins/<插件ID>.png`，**字节完全一致**，由生成脚本一次写入两份。

原来小程序的插件图标是拿 Font Awesome sprite 单色渲染出来的另一套东西，现在两端终于是同一张图。

### `src/icons.js` 改成双线路

| key 类型 | 风格 | 加载 |
|---|---|---|
| 主导航（四象限 / 时间块 / 收件箱 / 插件 / 设置） | iOS Filled 单色剪影 + 每项强调色 | `img.icons8.com/ios-filled/50/<色>/<slug>.png` |
| 12 个内置插件 | Color 彩色 | 随包 PNG，失败才回落 `color/96/<slug>.png` |
| 未知 key（用户插件） | Color 彩色 | `color/96/<slug>.png`，再失败回落彩色拼图 |

主导航**刻意不动**：整条侧栏的视觉语言是「单色剪影 + 淡色底板」，把导航也换成彩色会让层级和插件入口打架。彩色只加在插件上。

### 新增可复现的图标生成脚本

`tools/gen-plugin-icons.py`（Pillow）：

- 从 CDN 拉图标 → 抠出图形外框 → 统一缩放到 **81×81 画布、图形最长边 58px**（沿用历史素材的画布规格，比原来的 50px 略大，暗色底板下更清楚）。
- 一次写三处：桌面 PNG、小程序 PNG、`public/icons/plugins/ATTRIBUTION.md` 台账（风格 / slug / 说明 / sha256 / 消费方 / 许可）。
- 支持 `--offline`（只用本地缓存 `.workbuddy/icon-cache/`）与 `--check`（核对落地文件是否与 CDN 一致）。

**顺手修掉的两个坑**（都在 `miniprogram/tools/sync-tab-icons.py`）：

1. 脚本里的路径还是外部交付包的布局（`01-windows/app/public/...`），**在本仓库根本跑不起来**。已改为 `le-time-management/public/...`。
2. 它原先会用 FA 单色渲染覆盖 `images/plugins/*.png` —— 也就是说谁跑一次就会把这次换的彩色图标全冲掉。现在改成「复制彩色素材」，素材缺失时才退回 FA 渲染并打印缺失的插件 ID。
3. 同时删掉字典里 `elder: heart`（长辈照护在 v0.11.6 已移除，只会生成一张没人用的 tab 图标）。

### 署名与文档同步

- `src/aboutData.js`：Icons8 条目改为「主导航（iOS Filled）与内置插件（Color 标志色版）」并指向新图标集入口；Font Awesome 的说明改为「小程序 tabBar 图标与插件图标兜底」。
- `public/OPEN_SOURCE_NOTICES.md`：图标章节按两条线路重写，并指向 `public/icons/plugins/ATTRIBUTION.md`。
- `docs/plugin-icons.md`：**整篇重写**（原文还在描述「桌面端不读 public/icons」的旧体系，与代码不符），补上双线路表、12 个插件的 slug 对照、换图 3 步、渲染尺寸与自检清单。
- `README.md`：图标规范那一句的描述从「字形图标 + 128×128 随包 PNG」改为当前口径。

## 影响范围

| 端 | 影响 | 数据迁移 |
|---|---|---|
| Windows / Linux 桌面 | 插件图标（侧栏、插件中心卡片、设置 → 插件）全部换成彩色 | 无 |
| Android | 同上（与桌面同一份 `dist`） | 无 |
| 微信小程序 | 插件列表与插件详情页图标换成彩色 | 无 |

**优先级说明**：如果某个插件在设置里被手动改过图标（`settings.pluginOverrides[<id>].icon`，右键插件入口 → 更换图标），那个**自定义图标仍然优先**，不会被这次改动覆盖 —— 侧栏里那个自定义过的插件要恢复成新图标，走右键菜单的重置。

## 已知限制

- 主导航图标仍走 CDN，离线环境下会回落成彩色拼图；插件图标是随包的，不受影响。
- Color 风格没有微信标志（见上）。
- 图标生成脚本还没进 `npm scripts`，换图标要手敲 python 路径。
