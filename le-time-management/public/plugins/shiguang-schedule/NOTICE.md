# 来源与修改说明

Copyright (C) 2025 XingHeYuZhuan

应用来源：https://github.com/XingHeYuZhuan/shiguangschedule

学校索引与教务适配器来源：https://github.com/XingHeYuZhuan/shiguang_warehouse

本插件依据用户提供的 `shiguangschedule-main.zip`，将原项目的今日课表、周课表、我的、多课表管理、全局课程管理、学期作息、课表个性化与备份恢复流程移植为 Le 时间管理可加载的插件界面；保留课程编辑、选择学校并登录教务导入、教务 XLSX/XLS/CSV/TSV/TXT/HTML 表格导入、JSON/ICS 导出与时间块联动。

原项目采用 Kotlin Multiplatform/Compose，不能作为网页组件直接装入 Tauri WebView，因此界面层按原版信息架构和交互重新实现，数据层保持原版备份格式兼容。Android 桌面小组件、系统日历/勿扰模式及 WebDAV 等依赖原生平台能力的模块不随插件加载。

原始模型 SHA256：12fab4d378e27bb8ac56a47cf474a7efd395ed9eb8b390c36d0f6d611fc5b2dc

用户提供源码包 SHA256：56d03635ab1694f01e09a1d8e92bbda680e3e0d1df7c1baa7498375eeb367674

应用源码保留 Apache-2.0 许可证，见同目录 LICENSE。学校索引及在线适配器遵循 MIT 许可证，见同目录 SHIGUANG-WAREHOUSE-LICENSE。
