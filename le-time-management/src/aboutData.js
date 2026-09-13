// “关于”页的产品与开源元数据。运行时版本号由 Tauri app_info 提供，避免重复硬编码。
export const RELEASE_NOTES = [
  "插件入口增加彩色图标底板，支持右键重命名、更换图标、导入和删除用户插件。",
  "搜索、快捷入口、任务统计与窗口按钮支持拖动换位，顺序自动保存。",
  "设置新增顶部任务统计居中选项，侧栏设置入口改为更小的纯图标按钮。",
];

export const FRAMEWORKS = [
  { name: "Tauri", version: "2", role: "Windows / Android 应用壳、原生命令与打包" },
  { name: "Vite", version: "6", role: "前端开发服务器与生产构建" },
  { name: "Vanilla JavaScript", version: "ES Modules", role: "主界面、状态管理与插件宿主" },
  { name: "Rust", version: "2021 edition", role: "本地存储、HTTP、插件 ZIP、局域网联动等原生能力" },
  { name: "Kotlin", version: "Android bridge", role: "Android 原生插件与生命周期桥接" },
  { name: "微信小程序", version: "原生运行时", role: "四象限、时间块、捕获、设置与可移植插件适配" },
];

export const OPEN_SOURCE_PROJECTS = [
  { name: "Tauri Global Shortcut", license: "MIT / Apache-2.0", role: "桌面端系统级全局快捷键", url: "https://github.com/tauri-apps/plugins-workspace" },
  { name: "Tauri", license: "MIT / Apache-2.0", role: "跨平台桌面与移动应用框架", url: "https://github.com/tauri-apps/tauri" },
  { name: "Vite", license: "MIT", role: "前端构建工具", url: "https://github.com/vitejs/vite" },
  { name: "reqwest", license: "MIT / Apache-2.0", role: "Rust HTTP 客户端", url: "https://github.com/seanmonstar/reqwest" },
  { name: "serde / serde_json", license: "MIT / Apache-2.0", role: "Rust 数据序列化与 JSON", url: "https://github.com/serde-rs/serde" },
  { name: "Icons8 / iGoutu iOS Filled", license: "Icons8 License · 免费使用需署名", role: "主导航与插件中心图标", url: "https://igoutu.cn/icons/ios-filled" },
  { name: "Font Awesome Free", license: "Icons: CC BY 4.0", role: "网页收集与小程序既有图标资源", url: "https://fontawesome.com/" },
  { name: "ShiguangSchedule", license: "Apache-2.0", role: "课程表数据模型移植来源", url: "https://github.com/XingHeYuZhuan/shiguangschedule" },
  { name: "holiday-cn", license: "以其上游仓库为准", role: "中国节假日离线数据来源", url: "https://github.com/NateScarlet/holiday-cn" },
];

export const ABOUT_DOCS = {
  changelog: "/CHANGELOG.md",
  openSource: "/OPEN_SOURCE_NOTICES.md",
};
