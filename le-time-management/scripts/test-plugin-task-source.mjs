import assert from "node:assert/strict";
import fs from "node:fs";

/* 插件联动提醒：插件通过 tide.tasks.create 创建的任务自动记住来源插件（sourcePlugin），
   四象限任务卡与任务详情抽屉据此显示来源插件的图标（跟随用户在插件中心的自定义图标/强调色）。 */

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const host = read("src/pluginHost.js");
const quad = read("src/views/quadrant.js");
const drawer = read("src/views/drawer.js");
const css = read("src/styles.css");

/* 1. 宿主注入：tasks.create 必须写入 sourcePlugin，且以宿主注入为准（插件传同名字段会被覆盖，防伪装来源） */
assert.match(host, /S\.addTask\(\{ \.\.\.patch, sourcePlugin: pid \}\)/, "tasks.create 必须注入来源插件 id（宿主注入优先）");

/* 2. 四象限任务卡：有来源插件的任务在标题行渲染插件小图标 + 悬停提示 */
assert.match(quad, /t\.sourcePlugin \? el\("span", \{ class: "src-ic"/, "四象限任务卡要为插件来源任务渲染插件图标");
assert.match(quad, /来自插件/, "任务卡来源图标要带「来自插件 ××」悬停提示");
assert.match(quad, /pluginDisplayName, pluginDisplayIcon/, "四象限要复用 pluginAppearance（用户自定义图标/强调色自动跟随）");
assert.doesNotMatch(quad, /sourcePlugin: pid/, "视图层只读 sourcePlugin，不许自己伪造来源");

/* 3. 任务详情抽屉：显示「来源插件」行（图标 + 名称），手动创建的任务没有该行 */
assert.match(drawer, /"来源插件"/, "任务详情抽屉要有「来源插件」行");
assert.match(drawer, /pluginDisplayIcon\(t\.sourcePlugin/, "抽屉来源行必须用 pluginDisplayIcon 渲染图标");

/* 4. 样式：两处来源图标都要有尺寸规则，否则 app-icon 默认 30px 会把任务卡撑爆 */
assert.match(css, /\.tkc \.tt \.tt-top \.src-ic \.app-icon \{ width: 15px/, "任务卡来源图标要有小尺寸规则");
assert.match(css, /\.kv \.src-plug \.app-icon \{ width: 18px/, "抽屉来源图标要有尺寸规则");

console.log("PASS: 插件联动提醒（sourcePlugin 注入 + 四象限/抽屉来源插件图标）");
