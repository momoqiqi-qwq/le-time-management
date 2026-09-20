# U-Time 项目用途概览

查看日期：2026-09-20。

检查范围：当前工作区的项目说明、应用入口、关键功能模块、平台入口和内置插件清单。前端 `le-time-management/package.json:4` 与 Rust `le-time-management/src-tauri/Cargo.toml:3` 均声明版本 `0.79.0`。这是源码用途概览，不是全量功能验收。

## 一句话说明

**U-Time 是一款本地优先、偏向学习与校园生活场景的个人时间管理应用：把分散的消息、通知和待办整理成任务，按重要性与紧急程度排序，再安排到具体时间，并提供提醒和复盘扩展。**

学生/校园方向是根据课程表、考试日历、学习通、学校通知等插件组合得出的定位判断；任务管理和时间规划本身也适用于一般个人工作与生活。

## 主要功能及代码依据

| 功能 | 实际用途 | 代码依据 |
|---|---|---|
| 任务表与四象限 | 按优先级管理任务，记录备注、截止时间、预计耗时、标签与项目；任务能关联已安排的时间块 | `le-time-management/src/views/quadrant.js:12-71`、`le-time-management/src/store.js:120-135` |
| 时间规划 | 桌面端把任务拖进时间轴或点击自动安排；移动端另有按日期汇总安排与截止事项的时间线 | `le-time-management/src/views/timeblock.js:22-75`、`le-time-management/src/views/timeline.js:28-51` |
| 中文消息捕获 | 拖入或粘贴聊天文字、网页文字等，识别中文日期与时间，减少手工录入 | `le-time-management/src/capture.js:15-60`、`le-time-management/src/timeParser.js:1-80` |
| 截止提醒 | 支持多档提前提醒、应用内提示与声音，并接入 Android 原生通知和闹钟机制 | `le-time-management/src/main.js:47-48`、`le-time-management/src/taskReminder.js:1-46` |
| 插件扩展 | 加载内置或用户目录中的插件，提供视图、任务、时间块、存储、事件和网络等 API | `le-time-management/src/pluginHost.js:23-46`、`le-time-management/src/pluginHost.js:79-104` |
| 可选 AI 内容解析 | 在配置 AI 凭据后，把文本或图片交给模型提取结构化事件，再由应用归一化并路由至任务、时间块、收件箱或课程表 | `le-time-management/src/aiIngest.js:226-269`、`le-time-management/src/aiIngest.js:303-370` |
| 数据备份与交换 | JSON 备份、任务/时间块 CSV 导出、任务 CSV 导入、ICS 日历导入导出；另有 Excel 导出入口 | `le-time-management/src/dataCenter.js:20-100` |
| 可选多端联动 | WebDAV 显式上传/下载快照；启动入口包含局域网服务配置与手机指令处理 | `le-time-management/src/syncLayer.js:1-64`、`le-time-management/src/main.js:54-82` |

## 内置插件体现的使用场景

本次在 `le-time-management/public/plugins/` 中发现 15 份插件 `manifest.json`，并确认对应的 `main.js` 文件存在。以下是清单中声明的用途，未逐一运行验证：

- 学习与校园：课程表、学习通、警大门户通知、学校通知网站、考试日历、竞赛消息雷达。
- 专注与复盘：番茄专注、周度报告。
- 信息收集与提醒：拖入消息收纳、RSS 信息流、网页收集、微信提醒推送。
- 生活与帮助：中国节假日、轮换值日、插件使用说明。

例如，一条带截止时间的课程通知，可以进入任务管理，再被安排进日程并设置提醒；番茄专注和周度报告插件用于执行与回顾。这是产品模块组合呈现的工作流，不代表本次已做端到端实测。

## 技术与平台形态

- **主应用**：`le-time-management/`，原生 JavaScript + Vite 前端，Tauri 2 + Rust 原生层。依据 `le-time-management/package.json`、`le-time-management/src-tauri/Cargo.toml`。
- **桌面与 Android 的界面并不完全相同**：桌面核心入口为任务表、时间块、收件箱、插件；移动运行时用时间线替代时间块/收件箱入口。依据 `le-time-management/src/uiPreferences.js:6-14`。
- **微信小程序**：`miniprogram/` 是单独的原生小程序实现，其页面配置包含任务表、时间块、捕获、设置、任务详情及插件相关页面。依据 `miniprogram/app.json:1-56`。未据此推断与桌面端功能完全一致。
- **本地存储**：原生端通过 Rust 读取/写入 `data.json`，保存时先写临时文件再重命名；纯浏览器调试模式使用 `localStorage`。依据 `le-time-management/src-tauri/src/lib.rs:721-743`、`le-time-management/src/api.js:1-34`。

## 需要注意的边界

1. 根 `README.md:7` 所述“无联网”不能完整描述当前代码。插件宿主提供网络 API，代码包含 AI 调用、WebDAV 快照同步与应用更新入口。因此准确定位是“本地优先、带可选联网扩展”，不是完全离线或绝不发送数据。
2. AI 解析需要凭据配置；校园通知、微信推送等在线插件还依赖第三方服务、权限与用户配置。发现代码和入口不等于确认这些接口当前可用。
3. 平台功能存在差异，不应把桌面端所有能力直接视作 Android 或微信小程序同等支持。
4. 本次未启动应用、未运行构建或测试、未验证系统通知或外部接口，也未修改产品代码；仅新增本用途说明文档。

## 结论

这个项目不只是普通待办清单，而是把“收集信息 → 决定优先级 → 安排时间 → 提醒执行 → 统计复盘”串联起来的个人效率工具，现有插件生态尤其侧重学生和校园生活。
