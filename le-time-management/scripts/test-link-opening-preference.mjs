/* 网页打开方式回归测试 —— v0.80.0 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), "utf8");
const uiPrefs = read("../src/uiPreferences.js");
const appearance = read("../src/views/settings/appearance.js");
const searchIndex = read("../src/settingsSearchIndex.js");
const api = read("../src/api.js");
const pluginHost = read("../src/pluginHost.js");
const rust = read("../src-tauri/src/lib.rs");
const activity = read("../android/gradle/app/src/main/java/com/yile/letime/BrowserActivity.kt");
const manifest = read("../android/gradle/app/src/main/AndroidManifest.xml");
const syncTool = read("../../tools/sync-android-native.js");

assert.match(uiPrefs, /openLinksInApp: false/,
  "默认必须保持历史行为：交给系统浏览器，不能升级后悄悄改变用户习惯");
assert.match(uiPrefs, /next\.openLinksInApp = next\.openLinksInApp === true/,
  "网页打开偏好必须把脏数据归一化为布尔值");
assert.match(appearance, /toggleRow\("应用内打开网页", prefs\.openLinksInApp/,
  "界面与交互设置必须提供网页打开方式开关");
assert.match(searchIndex, /\["应用内打开网页", "链接 浏览器 内置浏览器 外部打开"\]/,
  "全局搜索必须能搜到网页打开方式");

assert.match(api, /async openUrl\(url\)/, "api 必须提供偏好感知的统一网页入口");
assert.match(uiPrefs, /root\.dataset\.openLinksInApp = cfg\.openLinksInApp \? "on" : "off"/,
  "应用设置时必须把网页打开偏好同步到根节点");
assert.match(api, /document\.documentElement\.dataset\.openLinksInApp === "on"/,
  "openUrl 必须读取当前设置的实时 DOM 状态，不能只在启动时缓存");
assert.match(api, /if \(isTauri && inApp\) \{[\s\S]*await invoke\("open_internal", \{ url \}\)/,
  "开启时必须调用原生应用内网页窗口");
assert.match(api, /return api\.openExternal\(url\)/,
  "关闭或纯浏览器环境必须退回系统浏览器路径");
assert.match(pluginHost, /openUrl: \(url\) => \{ requirePermission\(man, pid, "openUrl"\); return api\.openUrl\(url\); \}/,
  "插件网页入口必须服从全局设置");

assert.match(rust, /fn open_internal\(app: AppHandle, url: String\)/,
  "Rust 必须注册应用内网页命令");
assert.match(rust, /if !matches!\(parsed\.scheme\(\), "http" \| "https"\)/,
  "应用内网页只允许 http/https，禁止任意 scheme");
assert.match(rust, /WebviewWindowBuilder::new\(&app, &label, WebviewUrl::External\(parsed\)\)/,
  "应用内模式必须使用隔离的 Tauri WebView 窗口");
assert.match(rust, /builder\.activity_name\("BrowserActivity"\)/,
  "Android 应用内网页必须使用独立 BrowserActivity");
assert.match(rust, /open_external,\s*\n\s*open_internal,/,
  "open_internal 必须加入 Tauri invoke handler");

assert.match(activity, /class BrowserActivity : TauriActivity\(\)/,
  "BrowserActivity 必须是可启动的 TauriActivity 具体类");
assert.match(manifest, /android:name="\.BrowserActivity"/,
  "AndroidManifest 必须注册 BrowserActivity");
assert.doesNotMatch(manifest, /android:name="\.BrowserActivity"[^>]*android:exported="true"/,
  "BrowserActivity 只能由应用内部启动");
assert.match(syncTool, /"BrowserActivity\.kt",/,
  "Android 原生同步清单必须包含 BrowserActivity");
assert.match(syncTool, /ensureBrowserActivity/,
  "重新 tauri android init 后同步工具必须能补回 BrowserActivity 声明");

console.log("PASS: 网页打开方式（设置开关 / 全局搜索 / 插件统一入口 / Tauri 内置窗口 / Android 原生镜像）");
