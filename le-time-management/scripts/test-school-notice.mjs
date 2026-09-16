// school-notice 站点标签页「右键菜单」的接线契约。
//
// 交互行为（菜单出现在光标处、右键的站点会被切成当前站点、动作打到正确的站点上、
// 点别处 / Esc / 滚动收起、贴边收进视口）用真浏览器验证：
//   node output/school-tabmenu-probe.cjs
//   chrome --headless=new --dump-dom file:///…/output/school-tabmenu-probe.html
// 这里只守那些「改坏了会静默失效」的接线约定 —— 它们没法靠肉眼看出来。
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../public/plugins/school-notice/main.js', import.meta.url), 'utf8');

/* ── 一、菜单项标记与卡片按钮不能重名 ──
   事件委托里卡片分支写在菜单分支之前，一旦同名，菜单点击会被卡片分支抢走：
   不报错、静默失效（同 web-collector「换图标」踩过的坑）。 */
const menuFn = src.match(/function tabMenuHtml\(\)[\s\S]*?\n  \}/);
assert.ok(menuFn, '必须提供 tabMenuHtml()');
const menuBody = menuFn[0];
for (const [act, label] of [['refresh', '刷新通知'], ['login', '登录配置'], ['edit', '编辑'], ['open', '打开网站'], ['remove', '删除站点']]) {
  // 标签可以是条件表达式（busy 时显示「读取中…」），所以只要求该项里出现该文案
  assert.match(menuBody, new RegExp(`item\\("${act}",[^)]*"${label}"`), `菜单必须有「${label}」项（act=${act}）`);
}
assert.match(menuBody, /data-tab-act="\$\{act\}"/, '菜单项统一用 data-tab-act，不要复用卡片按钮的 data-* 标记');
for (const cardMark of ['data-refresh', 'data-edit-site', 'data-login', 'data-open-site', 'data-remove-site']) {
  assert.doesNotMatch(menuBody, new RegExp(cardMark), `菜单项不能叫 ${cardMark} —— 会与卡片按钮的委托分支撞名`);
}
assert.match(menuBody, /data-tab-menu[^>]*role="menu"/, '菜单容器要有 data-tab-menu 与 role=menu（点别处收起要靠它判断）');

/* ── 二、只对标签页 preventDefault ──
   无差别屏蔽原生右键会让「往输入框里粘贴网址」失效。 */
assert.match(src, /addEventListener\("contextmenu"[\s\S]{0,160}?closest\?\.\("\[data-site\]"\)[\s\S]{0,80}?preventDefault\(\)/,
  'contextmenu 必须先判断命中的是站点标签再 preventDefault');
assert.match(src, /contextmenu[\s\S]{0,200}?if \(!tab\) return;/, '非标签的右键要直接返回，保留原生菜单');

/* ── 三、右键的站点必须变成当前站点 ──
   菜单动作与卡片按钮共用一套实现（都作用于 active()），不切站点就会去操作别的站点。 */
assert.match(src, /async function openTabMenu\(id, x, y\)[\s\S]{0,120}?if \(id !== activeId\) await switchSite\(id\)/,
  'openTabMenu 必须先切到被右键的站点');
assert.match(src, /tabMenu = \{\s*id,[\s\S]{0,160}?window\.innerWidth[\s\S]{0,160}?window\.innerHeight/,
  '菜单坐标要按视口夹紧，否则贴右/下边会被窗口裁掉');
assert.match(src, /const site = active\(\); tabMenu = null;/, '执行动作前先收起菜单');

/* ── 四、菜单要真的渲染进 paint()，且左键点标签要收起它 ── */
assert.match(src, /\$\{tabMenu \? tabMenuHtml\(\) : ""\}/, 'paint() 必须渲染 tabMenuHtml()');
assert.match(src, /if \(tab\) \{ tabMenu = null; return switchSite\(tab\.dataset\.site\); \}/,
  '左键点标签要先收起菜单再切站点');
assert.match(src, /const menuAct = e\.target\.closest\("\[data-tab-act\]"\); if \(menuAct\) return runTabAction\(menuAct\.dataset\.tabAct\);/,
  '菜单项点击要派发到 runTabAction');
assert.match(src, /function closeTabMenu\(\) \{ if \(!tabMenu\) return; tabMenu = null; paint\(\); \}/,
  'closeTabMenu 要幂等（未打开时不重绘）');

/* ── 五、「点别处 / Esc / 滚动」的 document 级监听只绑一次 ──
   宿主元素会随 render 重建，绑在 host 上会丢；绑在 document 上不设闸门会越绑越多。 */
assert.match(src, /if \(!tabMenuDismissBound\) \{[\s\S]{0,700}?addEventListener\("pointerdown"[\s\S]{0,700}?"Escape"[\s\S]{0,300}?addEventListener\("scroll"/,
  'document 上的收起监听（pointerdown / Escape / scroll）必须由 tabMenuDismissBound 闸门包住');
assert.match(src, /closest\("\[data-tab-menu\]"\) \|\| t\.closest\("\[data-site\]"\)/, '点菜单自身或标签页时不该被 pointerdown 提前收起');
assert.match(src, /if \(event\.button === 2\) return;/, '右键另一个标签时不该先收起（交给 contextmenu 重新定位）');

/* ── 六、删除站点：卡片按钮与菜单必须共用同一个实现 ── */
const removeCalls = [...src.matchAll(/removeSite\(site\)/g)].length;
assert.ok(removeCalls >= 3, `removeSite 应被定义 + 卡片 + 菜单三处引用，实际 ${removeCalls}`);
assert.doesNotMatch(src, /if \(e\.target\.closest\("\[data-remove-site\]"\)\) \{ editing = false;/,
  '卡片「删除」不该再内联一份删除逻辑 —— 两处实现迟早走岔');
assert.match(src, /loginDraft\.delete\(site\.id\); lastErrors\.delete\(site\.id\); hiddenUrls = \[\];/,
  '删除站点要连同已填凭据一起清掉');

console.log('PASS: school-notice 标签页右键菜单接线（标记不撞名 / 只对标签屏蔽原生菜单 / 先切站点 / 收起闸门 / 删除共用实现）');
