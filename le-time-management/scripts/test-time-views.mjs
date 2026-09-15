import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../src/styles.css");
const timeViews = read("../src/views/timeViews.js");
const timeblock = read("../src/views/timeblock.js");

/* ───────────── v0.37.20：时间块视图切换收进展开菜单 ─────────────
   原来 7 个样式平铺成一行横向滚动 chips，手机上只看得见 4 个半，
   「卡片时间轴 / 年度甘特 / 阶段甘特」永远藏在滑动条后面。
   现在收成「当前样式名 + 展开按钮」，菜单挂 body。 */
assert.match(timeViews, /export function createTimeViewSwitcher/);
assert.match(timeViews, /class: "time-viewtoggle"/, "必须有展开触发器");
assert.match(timeViews, /class: "time-viewmenu"/, "必须有菜单容器");
assert.doesNotMatch(timeViews, /class: `time-viewbtn/, "旧的平铺 chips 必须移除");
assert.doesNotMatch(css, /\.time-viewbtn/, "旧的 .time-viewbtn 样式必须移除");
// 菜单挂 body：切换栏带 overflow，作为子节点会被裁掉
assert.match(timeViews, /document\.body\.append\(menu\)/, "菜单必须挂到 body 才不会被 overflow 裁掉");

/* 🔴 回归 1：close() 必须写布尔值。
   `menu.hidden = ""` 赋的是空字符串（falsy），hidden 属性不会生效，
   菜单会赖在屏幕上 —— 实测「选完不关闭、Esc 关不掉、点外部关不掉」。 */
// 剥掉注释再判定 —— 本模块的说明性注释里就写着那个错误写法，否则会误伤自己。
const timeViewsCode = timeViews
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
assert.match(timeViewsCode, /menu\.hidden = true/, "关闭时必须赋布尔 true，不能是空字符串");
assert.match(timeViewsCode, /menu\.hidden = false/, "打开时必须赋布尔 false");
assert.doesNotMatch(timeViewsCode, /menu\.hidden = ""/, '`menu.hidden = ""` 是 falsy，属性不生效');
assert.doesNotMatch(timeViewsCode, /menu\.hidden = null/, "`menu.hidden = null` 语义混乱，应写布尔");

// Esc 与外部点击都要能关闭
assert.match(timeViewsCode, /e\.key === "Escape"/, "Esc 必须能关闭菜单");
assert.match(timeViewsCode, /onDocPointer/, "点菜单外部必须能关闭");

/* 🔴 回归 2：菜单必须在视图卸载时收走。
   菜单挂在 body 而不是视图内，视图切走时不会被一起清掉，
   反复进出会累积成一堆残留节点。 */
assert.match(timeblock, /document\.querySelectorAll\("\.time-viewmenu"\)\.forEach\(\(m\) => m\.remove\(\)\)/,
  "离开时间块视图必须清掉 body 上的菜单节点");
assert.match(timeViews, /document\.querySelectorAll\("\.time-viewmenu"\)\.forEach\(\(m\) => m\.remove\(\)\)/,
  "重建 switcher 前必须先清旧菜单，否则同一时刻存在两个");

/* ───────────── v0.37.20：7 个时间视图的窄屏真适配 ─────────────
   改造前每个视图都靠硬编码 min-width 撑开 + 外层横向滚动：
   WakeUp 900 / 年表 1500 / 年度甘特 1120 / 泳道 1250。
   横向滚动不是适配 —— 年表 1500px 画布里 150px 的卡片还在同一水平线左右交错，
   滚到哪都是叠字（用户实测截图）。现在按视图性质换布局。 */

// 1) 窄屏必须换掉横向滚动容器，而不是留着让它滚。
// 按「规则形态」定位那个 760px 块 —— 文件里有 10 个同条件的 760px 块（底栏、抽屉、设置页…），
// 直接 split 取 [1] 会落到抽屉块上。
// ⚠️ 别用裸选择器当锚点：基础态规则（媒体查询外）里也写着 `.wakeup-mobile`、`.time-viewtoggle`，
//    它们会被算进前一个块的尾巴，实测被 `.wakeup-mobile` 误导过一次。
//    用「选择器 + 花括号 + 声明」的完整规则形态才唯一。
const narrowBlocks = css.split("@media (max-width: 760px)").slice(1);
const narrow = narrowBlocks.find((b) => b.includes(".wakeup-mobile { display:block")) ?? "";
assert.ok(narrow, "必须存在含时间视图适配的 ≤760px 媒体块");
for (const sel of [".wakeup-scroll", ".chronicle-scroll", ".gantt-scroll", ".swim-scroll"]) {
  assert.match(narrow, new RegExp(`\\${sel}\\s*\\{\\s*display:\\s*none`),
    `窄屏必须隐藏横向滚动容器 ${sel}，改为分组/纵向布局`);
}
// 2) 窄屏必须显示对应的新布局容器
// 规则里可能先写 position 等声明（`.chronicle-vertical { position:relative; display:block; ... }`），
// 所以不能要求 `{` 紧跟 `display` —— 按「选择器块内含 display:block」判定。
for (const sel of [".wakeup-mobile", ".chronicle-vertical", ".gantt-monthly", ".swim-mobile"]) {
  // 基础态隐藏（避免首帧两端布局同时出现），窄屏打开
  assert.match(css, new RegExp(`\\${sel}[^{]*\\{\\s*display:\\s*none`), `${sel} 基础态必须隐藏`);
  const ruleBody = narrow.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  assert.ok(ruleBody, `窄屏必须有 ${sel} 规则`);
  assert.match(ruleBody, /display:\s*block/, `${sel} 窄屏必须显示`);
}
// 3) 桌面端必须保持原样：手机专用容器一律不渲染
assert.match(css, /@media \(min-width: 761px\)[\s\S]*?\.wakeup-mobile,[\s\S]*?\{[^}]*display:\s*none\s*!important/,
  "桌面端必须强制隐藏手机专用布局（含 !important，防作者样式覆盖）");

/* 🔴 回归 3：卡片时间轴窄屏横向溢出。
   .card-timeline 带 `margin:34px auto`。窄屏若只覆盖左右 margin 为 14px，
   box 会按「宽度 100% + 左右 margin」算出 100%+28px ⇒ 向右溢出 13px（实测）。
   修法：宽度交 auto + margin 归零，全部交给 padding。 */
const cardRule = narrow.match(/\.card-timeline\s*\{([^}]*)\}/)?.[1] ?? "";
assert.ok(cardRule, "窄屏必须有 .card-timeline 规则");
const cardMargin = cardRule.match(/margin:\s*([^;]+);/)?.[1] ?? "";
assert.ok(cardMargin, "窄屏 .card-timeline 必须显式写 margin");
// 解析 margin 简写：1 值=四边相同，2 值=上下/左右，3 值=上/左右/下，4 值=上/右/下/左。
// 只看左右分量是否为 0 —— 别用 `1[0-9]px` 这种正则模糊匹配，
// `margin:16px 0 22px` 的光头值 16 会被误判成「左右有 10~19px」。
const mv = cardMargin.trim().split(/\s+/);
const left = mv.length === 1 ? mv[0] : mv.length === 2 ? mv[1] : mv.length === 3 ? mv[1] : mv[3];
const right = mv.length === 1 ? mv[0] : mv.length === 2 ? mv[1] : mv.length === 3 ? mv[1] : mv[1];
for (const [side, v] of [["左", left], ["右", right]]) {
  assert.equal(parseFloat(v), 0,
    `窄屏 .card-timeline ${side} margin 必须为 0（当前 ${v}）—— ` +
    `宽度 100% 加上非零水平 margin 会算成 100%+margin，向右溢出（实测 13px）`);
}

/* 🔴 回归 4：折叠分组在桌面端必须透明。
   折叠用原生 <details>。桌面端若不拆掉这层盒子，<details> 会成为 flex/grid item，
   把年月网格布局整个改掉（桌面外观必须与改造前一致）。
   display:contents 让内容直接参与父级布局。 */
assert.match(css, /\.tv-fold\s*\{\s*display:\s*contents/, "桌面端 .tv-fold 必须 display:contents");
assert.match(css, /\.tv-fold-head\s*\{\s*display:\s*none/, "桌面端分组标题必须隐藏");
assert.match(css, /\.tv-fold-body\s*\{\s*display:\s*contents/, "桌面端分组体必须 display:contents");
assert.match(narrow, /\.tv-fold\s*\{\s*display:\s*block/, "窄屏 .tv-fold 必须变成真正的折叠盒子");
assert.match(narrow, /\.tv-fold-head\s*\{[^}]*min-height:\s*48px/, "折叠标题行触控区 ≥44px");
assert.match(narrow, /\.tv-fold\[open\] \.tv-fold-caret\s*\{\s*transform:\s*rotate\(180deg\)/, "展开时箭头要掉头");

/* 🔴 回归 5：分组默认展开数要有节制。
   5 个分类全展开实测 1670px 高，一屏 844px 看不完 ⇒ 折叠失去意义。
   年表 12 个月全列出来时，8 个空月份的标题会把有内容的月份推出屏幕。 */
const swimBody = timeViews.split("function swimlaneView")[1] ?? "";
assert.match(swimBody, /opened\+\+ < 2/, "阶段甘特窄屏默认最多展开 2 个分类");
const ganttBody = timeViews.split("function ganttView")[1] ?? "";
assert.match(ganttBody, /filter\(r => r\.hit\.length \|\| r\.m === todayMonth\)/,
  "年度甘特窄屏只列出有内容的月份 + 当前月，空月份不能占屏");

console.log("PASS: 时间视图切换收进展开菜单（关闭语义 / 卸载清理）+ 7 个视图窄屏真适配（无横向溢出）");
