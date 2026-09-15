// “关于”页的产品与开源元数据。运行时版本号由 Tauri app_info 提供，避免重复硬编码。
export const RELEASE_NOTES = [
  "新增应用内自动更新：发现新版本时左下角提示，可直接「立即升级」或「忽略此版本」，桌面端静默重装并自动重启。",
  "「设置 › 关于 › 软件更新」可手动检查更新、下载安装，并用两个开关分别控制「启动时自动检查」与「有新版本时弹窗提示」。",
  "手机端时间视图改版：课表、时间轴、年度/阶段甘特与里程碑不再靠横向滚动，改为窄屏专属布局。",
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
  { name: "Icons8 / iGoutu", license: "Icons8 License · 免费使用需署名", role: "主导航图标（iOS Filled）与内置插件图标（Color 标志色版，随包 PNG）", url: "https://igoutu.cn/icons/set/%E6%A0%87%E5%BF%97--style-color" },
  { name: "Font Awesome Free", license: "Icons: CC BY 4.0", role: "小程序 tabBar 图标与插件图标兜底", url: "https://fontawesome.com/" },
  { name: "ShiguangSchedule", license: "Apache-2.0", role: "课程表数据模型移植来源", url: "https://github.com/XingHeYuZhuan/shiguangschedule" },
  { name: "holiday-cn", license: "以其上游仓库为准", role: "中国节假日离线数据来源", url: "https://github.com/NateScarlet/holiday-cn" },
];

export const ABOUT_DOCS = {
  changelog: "/CHANGELOG.md",
  openSource: "/OPEN_SOURCE_NOTICES.md",
};
