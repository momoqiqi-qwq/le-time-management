# Le时间管理 · 微信小程序版

桌面端（Tauri）的微信小程序移植：**原生 WXML/WXSS/JS 开发**，无 npm 依赖、无构建步骤。
与桌面端共用同一套数据结构（单 JSON：`tasks / blocks / settings / plugins`）和同一份中文时间解析引擎，备份可互相导入恢复。

## 快速开始

1. 微信开发者工具 → **导入项目** → 选择本目录（`miniprogram/`）
2. AppID 当前为 `wxa3f6a0e1c89d36dd`（已可正常上传），换成自己的小程序时在 `project.config.json` 里改
3. 编译运行，无需任何 install/build

## 上传发布（miniprogram-ci，命令行）

上传不需要打开微信开发者工具，但需要**三样东西**（缺一不可）：

1. **正式 appid**：微信公众平台 → 注册小程序。`touristappid` 是游客测试号，只能本地预览，**不能上传**
2. **代码上传密钥**：公众平台 → 开发管理 → 开发设置 → 小程序代码上传密钥 → 下载 `private.key`
3. **IP 白名单**：同一页面把本机公网 IP 加进「IP 白名单」，否则报 `47001 / ip not in whitelist`

准备就绪后（密钥放仓库外或已 gitignore 的路径）：

```bash
node tools/upload-miniprogram.js --check                                   # 先自检
node tools/upload-miniprogram.js --appid wx... --key ./private.key \
      -v 1.0.0 -d "首次提交" --write-appid                                  # 真上传
```

参数也可走环境变量（CI 用）：`MP_APPID` / `MP_KEY` / `MP_VERSION` / `MP_DESC` / `MP_ROBOT`。
`--write-appid` 会顺手把 appid 写回 `project.config.json`；`--robot 1~30` 指定 CI 机器人提交。
上传成功后代码进入「版本管理 → 开发版本」，在后台提交审核即可。

> 本机未装微信开发者工具时，`miniprogram-ci` 装在隔离工作区，项目目录不留 `node_modules`。

## 目录结构

```
miniprogram/
├─ app.js / app.json / app.wxss     # 入口、页面与 tabBar 注册、设计系统（含暗色变量）
├─ theme.json                       # 深浅两套 导航栏/tabBar 主题（darkmode: true）
├─ project.config.json              # appid、es6/enhance 编译设置
├─ core/
│  ├─ store.js                      # 状态 + 派生 + wx 存储持久化（350ms 防抖写盘）
│  ├─ timeParser.js                 # 中文时间解析（自桌面端移植，去 lookbehind）
│  └─ captureFlow.js                # 捕获建块纯函数（buildCapture / durOptions / createFromCapture）
├─ pages/
│  ├─ quadrant/   # 四象限：2×2 象限块 + 任务列表；左滑快捷操作、跨象限搜索、隐藏已完成
│  ├─ timeblock/  # 时间块：近 7 天日期条 + 任务池（点按自动排程 / 长按点轴放置）
│  │              #   + movable 拖拽时间轴 + 概览
│  ├─ capture/    # 捕获：粘贴/读取剪贴板 → 解析预览（日期/时间/时长/分类可点改）→ 一键创建
│  ├─ settings/   # 设置：数据统计、备份导出/导入、插件入口、关于
│  ├─ plugins/    # 三端统一插件中心：12 个内置插件清单/启停/平台能力
│  ├─ plugin/     # 小程序原生插件页：番茄/周报/节假日/考试日历
│  └─ task/       # 任务详情：象限/预估/截止/项目/备注、排入今天、附件预览、删除
└─ images/tab/                      # tabBar 图标（tools 脚本生成，选中态为两主题通用青色）
```

## 与桌面端的交互差异

| 桌面端 | 小程序版 | 原因 |
|---|---|---|
| 从微信窗口拖文本进来自动捕获 | 「捕获」tab：复制 → 读取剪贴板 → 解析预览（**日期/开始/时长/分类可直接点改**）→ 确认创建 | 小程序没有跨应用拖拽与全局粘贴监听 |
| 鼠标/触摸拖任务进时间轴 | 点任务卡**自动排到第一个空闲位**；**长按任务卡进入放置模式，点时间轴任意位置放置**；时间块用 movable 手势上下拖动微调（15 分钟吸附） | 跨容器拖拽在移动端手势冲突严重 |
| 时间块右键菜单 | 点时间块 → ActionSheet（时长±/换分类/移回任务池/删除） | 无右键 |
| 点时间轴空白快速加块 | 保留：点空白 → 弹窗输入标题 | — |
| 顶部日期切换 | ‹ ◎ › 导航 + picker + **近 7 天日期条**（横滑快切） | 移动端可达性 |
| 插件系统 | 同步 12 个插件清单与启停状态；其中 5 个提供小程序原生适配 | 小程序不能执行桌面 DOM 插件，也没有 Tauri Rust 网络桥，因此按插件能力做原生适配/降级 |

**移动端专属增强**（桌面端没有的）：暗色模式（跟随系统，`darkmode` + `prefers-color-scheme` 双主题变量）、任务卡**左滑快捷操作**（完成/删除，跟手拖动 + 吸附动画）、**跨象限任务搜索**（标题/备注/项目，结果卡带象限角标）、「隐藏已完成」开关（记住偏好）、捕获结果可调整预览、长按放置模式（带震动反馈）、任务图片附件点击放大（dataURL 自动落临时文件后 `previewImage`）、存储占用警告与保存失败提示、页面分享（朋友+朋友圈）。

## 三端插件同步

设置 → **插件中心** 会显示与 Windows / Android 完全相同的 12 个内置插件及版本。启停状态保存在同一个 `plugins` 字段里，备份 JSON 跨端导入后会继续生效。 tabBar 与插件中心图标由桌面端同一份 Font Awesome Free SVG sprite 生成，避免三端图标体系分叉。

小程序当前原生适配 4 个：

- **番茄专注**：25/5/15 分钟模式、任务关联、累计番茄与专注分钟；退后台后按结束时间恢复，不依赖后台 `setInterval`。
- **周度报告**：过去 7 天排程、分类时长、任务完成度。
- **中国节假日**：直接使用桌面插件的 2024–2026 离线快照。
- **考试日历**：直接使用桌面插件内嵌的同一份考试数据，可一键生成任务 + 学习时间块。

学习通、警大门户通知、竞赛消息雷达、微信提醒推送、课程表、网页收集、学校通知网站仍保留在统一清单中，但小程序端暂标记为不可用：联网类插件主要受会话化网络桥/Cookie、受限域名和后台能力限制；课程表则因为响应式 DOM 插件视图尚未原生移植到 WXML。

维护插件时不要分别改三端清单。在源码包根目录运行：

```bash
node tools/sync-plugins.js
```

脚本会生成 `core/pluginCatalog.js`，并同步节假日与考试日历离线数据。

## 关键实现备忘

- **持久化**：`wx.setStorageSync("tidebalance-data", state)`，与桌面端同字段名；设置页「导出备份」复制到剪贴板的 JSON 可直接粘进桌面端导入，反之亦然。
- **跨页跳转**：捕获页「查看时间块」通过 `getApp().globalData.pendingTimeblockDate` 把目标日期传给时间块页（switchTab 不能带参）。
- **时间轴几何**：07:00–24:00，54px/小时，15 分钟吸附；`movable-area` 顶部偏移 10px，与时刻行对齐，画布容器**垂直方向不允许内边距**（否则拖拽坐标错位）。
- **兼容性**：`timeParser` 的「X号」匹配改用捕获组代替 lookbehind（`(?<!…)`），否则 iOS < 16.4 的 JavaScriptCore 在解析模块时直接抛语法错误。
- **movable-view 细节**：`bindchange` 只认 `source === "touch"/"touch-out-of-bounds"`（setData 引发的 change 也会触发），未移动（tap）时弹操作菜单；拖动中的块加 `dragging` 半透明态。
- **暗色模式**：`app.json darkmode: true` + `theme.json` 管导航栏/tabBar；页面颜色全部走 CSS 变量，`@media (prefers-color-scheme: dark)` 覆盖一套变量即可。深青主色上的文字统一用 `--on-deep`（浅色主题白字 / 暗色主题深字），保证 `.btn.pri`、时间块、选中日期条在两套主题下对比度都达标。
- **长按放置**：`bindlongpress` 进入放置模式（`data.placing`），下一次点时间轴即在该位置创建块；切天、切 tab（onHide）自动取消。
- **左滑操作**：卡片外包 `swipe-wrap`（操作按钮绝对定位在底层，卡片 `translateX` 盖在上面）。touchmove 先做方向判定（|dx|>|dy| 才进入横滑，不干扰页面纵向滚动），拖动中关闭 CSS transition 保证跟手，松手按过半吸附。不使用 `catchtouchmove`，页面滚动不受影响。

## 工具链（仓库根 `tools/`，零依赖）

```bash
node tools/test-miniprogram-core.js        # store + timeParser + captureFlow 共 39 个用例（mock wx）
node tools/check-miniprogram.js            # JSON/页面四件套/图标/require 路径静态校验
node tools/gen-miniprogram-tab-icons.js    # 重新生成 tabBar 图标（SDF 光栅化 + 手写 PNG 编码）
```

## 待办 / 已知限制

- wx 单 key 存储上限 1MB、总量 10MB：含图片附件（dataURL）的桌面备份导入小程序时可能超限
- 未做国际化；tabBar 图标不支持按主题切换，选中态用的是两主题通用的中间亮度青色
