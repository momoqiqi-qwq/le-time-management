# Le时间管理 v0.3.0 改动说明

## 1. 学习通插件按 chaoxing v2 包升级

- 收件箱主接口改为 `POST https://notice.chaoxing.com/pc/notice/getNoticeList`，不再依赖旧 `specie.chaoxing.com` 消息接口的来源 IP 白名单。
- 分页读取通知，使用 `rtf_content` / `content` 显示完整正文，并保留平台未读状态。
- 自动从通知正文识别 `结束时间/截止时间：YYYY-MM-DD HH:MM`，生成未截止作业待办。
- 保留课程列表与分享码通知详情；登录增加 Cookie 会话模式，账号密码仍通过本机 Tauri 后端完成 DES 登录。
- 支持把通知/截止时间一键加入 Le时间管理的任务与时间块。

## 2. 产品显示名

桌面窗口、侧栏、Android 资源、局域网手机页、微信小程序导航和关于信息统一为 **Le时间管理**。为避免已有安装升级后丢数据，`com.yile.tidebalance`、Rust crate 名和 `tidebalance-data` 存储键仍保留为兼容标识。

## 3. Font Awesome 图标

- 桌面 / Android WebView 通过本地 `public/icons/fontawesome/solid.svg` 使用 Font Awesome Free SVG sprite，不走 CDN、不包含 webfont 字体文件。
- 小程序 tabBar 和插件中心使用同一 sprite 离线生成 PNG 图标。
- 图标许可与署名见 `01-windows/app/public/icons/fontawesome/LICENSE.txt` 和 `ATTRIBUTION.md`。

## 4. 教务导入

课程表工具栏新增独立的 **教务导入** 入口。支持：

- 从教务系统网页复制带表头的表格后直接粘贴；
- 上传 `.csv` / `.tsv` / `.txt` / `.html` / `.htm`；
- 自动识别课程名称、教师、地点/教室、星期、周次、节次、开始/结束时间、组合“上课时间”列；
- 周次支持 `1-16`、`1,3,5`、`1-16单周`、`2-18双周`；
- 先预览成功/失败行，再选择“合并去重”或“替换当前课表”。

不同学校教务系统导出的列名和结构可能不同；当前实现是通用表头解析器，并会把未能解析的行显示为警告，而不是静默覆盖。

## 5. 课程表自适应

- 宽屏：7 天并列；
- 中等宽度：自动收敛到 4 / 2 列；
- 手机窄屏：按天纵向卡片，不再依赖超宽课表横向拖动；
- Windows 与 Android WebView 共用同一 HTML/CSS/JS 实现，取消 Tauri 对 `shiguang-schedule` 的原生视图强制覆盖。

## 回归检查

- `test-schedule.mjs`：课程 JSON、ICS、冲突、时间块幂等、教务 TSV/CSV、合并字段、单双周、自定义时间、去重合并通过。
- `test-care.mjs`、`test-cppu.mjs`、`test-interactions.mjs` 通过。
- 微信小程序核心测试：46 通过 / 0 失败；静态校验通过。
- 当前执行环境缺少 Vite / Cargo 工具链，因此未在本环境完成生产前端 bundle 或 Rust 编译；源码未新增 npm 运行时依赖。
