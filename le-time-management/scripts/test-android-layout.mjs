import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles.css");
const shell = read("../src/shell.js");
const appearance = read("../src/views/settings/appearance.js");

// Android 上四象限必须由内容撑高，让 .view 承担整页滚动。若继续继承桌面的
// height:100% + flex:1，四张卡会被压进一屏，卡内按钮虽在 DOM 中却被 overflow 裁掉。
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.quad-wrap\s*\{[^}]*height:\s*auto[^}]*min-height:\s*100%/,
  "窄屏四象限容器必须按内容自然增高");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.quad-grid\s*\{[^}]*flex:\s*none[^}]*grid-auto-rows:\s*max-content/,
  "窄屏象限网格不能继续参与剩余高度压缩");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.q\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0[^}]*overflow:\s*visible/,
  "窄屏象限不能裁掉任务与添加按钮");
assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.q \.tks\s*\{[^}]*flex:\s*none[^}]*max-height:\s*none[^}]*overflow:\s*visible/,
  "窄屏任务列表应交给页面统一滚动");

// Android 没有桌面窗口概念。这些按钮显示出来只会无响应；顶栏 HTML5 draggable
// 也可能与 WebView 触摸点击竞争，所以两者都必须由桌面运行时门控。
assert.match(shell, /const desktopWindow = isDesktopRuntime\(\)/,
  "应用外壳必须识别桌面运行时");
assert.match(shell, /const windowControls = desktopWindow\s*\?\s*el\(/,
  "窗口控制按钮只应在桌面端创建");
assert.match(shell, /node\.draggable = desktopWindow/,
  "Android 顶栏控件不能启用 HTML5 拖拽");
assert.ok(shell.includes('desktopWindow ? (pinActionBtn = createQuickDockButton("thumbtack", "窗口置顶"'),
  "快捷入口中的窗口置顶必须由桌面运行时门控");
assert.match(appearance, /desktopWindow\s*\?\s*windowRow\s*:\s*null/,
  "Android 设置页不应显示无效的窗口大小控件");

console.log("PASS: Android natural-height layout, tappable quadrant controls and desktop-only window actions");
