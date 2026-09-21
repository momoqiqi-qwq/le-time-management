// 学习通插件 v2.2.0：删除（本机忽略/恢复）与「浏览器打开（带登录态）」链路。
// 顺带守住一个曾经踩过的坑：manifest 少了 openUrl 权限，按钮点了没反应。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('public/plugins/chaoxing-notify/main.js', root), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('public/plugins/chaoxing-notify/manifest.json', root), 'utf8'));

const storage = {};
const opened = [];
const notifies = [];
const fetched = [];
let response = { status: 200, body: '', finalUrl: '' };

const tide = {
  ui: { registerView() {} },
  storage: {
    async get(key, fallback = null) { return key in storage ? storage[key] : fallback; },
    async set(key, value) { storage[key] = value; },
  },
  notify: (msg) => { notifies.push(String(msg)); },
  http: {
    session: async () => 's1',
    fetch: async (sid, method, url) => {
      fetched.push(url);
      return typeof response === 'function' ? response(url) : response;
    },
  },
  util: {
    openUrl: (url) => { opened.push(url); },
    today: () => '', addDays: () => '', mmOf: () => 0, hhmmOf: (m) => String(m), durLabel: () => '',
    parseWhen: () => ({}), guessCategory: () => '', guessQuad: () => '', navigate: () => {},
    desEncryptHex: async () => '',
  },
  tasks: { create: () => ({ id: 'task-1' }), update() {}, remove() {} },
  blocks: { create: () => ({}) },
};

const context = vm.createContext({
  URL, Set, Map, Date, console, JSON, Number, String, Array, Object, Promise, RegExp,
  // 把 8s 探测超时压到 5ms 并 unref，避免测试进程被挂起的定时器拖住
  setTimeout: (fn, ms) => { const t = setTimeout(fn, Math.min(ms, 5)); t.unref?.(); return t; },
  clearTimeout,
  document: { createElement: () => ({ set textContent(v) { this.value = v; } }), getElementById: () => null, head: { append() {} } },
  atob,
  tide,
});

const EXPORTS = '{state,pickTargetLink,isAnonymousUrl,linkScore,cardActionsHtml,ignoreNotice,restoreIgnored,visibleInbox,filteredInbox,todos,openTarget,fetchInbox,LOGIN_JUMP,loadCourses,termOf,currentTerm,gradeOf,detectEnrollYear,courseStatus,courseCardHtml,coursesHtml,parseWorkRef,statusOf,gradingBadge,probeWorkStatus,probePendingWorks,noticeAcademicYear,catYears,catsHtml,inboxCardHtml,cxInitials,cxKwHit}';
vm.runInContext(
  source.replace('  tide.ui.registerView({', `  globalThis.cx = ${EXPORTS};\n  tide.ui.registerView({`),
  context,
);
const { state, pickTargetLink, isAnonymousUrl, cardActionsHtml, ignoreNotice, restoreIgnored,
  visibleInbox, filteredInbox, todos, openTarget, fetchInbox, LOGIN_JUMP,
  loadCourses, termOf, currentTerm, gradeOf, detectEnrollYear, courseStatus, courseGroups, coursesHtml,
  parseWorkRef, statusOf, gradingBadge, probeWorkStatus, probePendingWorks,
  noticeAcademicYear, catYears, catsHtml, inboxCardHtml, cxInitials, cxKwHit } = context.cx;

const HW = 'https://mooc1.chaoxing.com/mooc-ans/work/doHomeWorkNew?courseId=1&workId=99';
const EXAM = 'https://mooc1.chaoxing.com/mooc-ans/exam/test/reVersionTestStartNew?examId=5';
const code = (ch) => ch.repeat(32);
const shareUrl = (ch) => `https://sharewh3.xuexi365.com/share/${code(ch)}?t=4`;

/* ── 1. 链接识别：链接只存在于被 stripHtml 掉的正文 HTML 里 ── */
const hwItem = {
  id: 'n-a', idCode: code('a'), title: '作业：《C语言程序设计A》新建作业',
  body: '截止时间：2030-01-01 09:00\n课程名称：C语言程序设计A\n作业名称：新建作业',
  unread: true, insertTime: 1,
  raw: { rtf_content: `<p>请点击 <a href="${HW}">去完成</a> 提交</p>`, content: '' },
};
assert.equal(pickTargetLink(hwItem), HW, '必须回到 raw.rtf_content 里取作业链接');
assert.ok(!isAnonymousUrl(HW), '作业页不是公开分享页');
assert.ok(isAnonymousUrl(shareUrl('a')), 'sharewh3 分享页免登录');

const noLinkItem = { id: 'n-b', idCode: code('b'), title: '通知', body: '没有链接', unread: true, insertTime: 2, raw: { rtf_content: '<p>没有链接</p>' } };
assert.equal(pickTargetLink(noLinkItem), shareUrl('b'), '没有真实链接时回退到分享页');

const multiItem = {
  id: 'n-c', idCode: code('c'), title: '混排', body: '', unread: false, insertTime: 3,
  raw: { rtf_content: `<a href="https://notice.chaoxing.com/pc/notice/detail?idCode=${code('c')}">通知</a><a href="${EXAM}">考试</a><a href="${HW}">作业</a>` },
};
assert.equal(pickTargetLink(multiItem), HW, '作业页优先级最高');
assert.equal(pickTargetLink({ id: 'x', body: '', raw: {} }), '', '既无链接又无 idCode 时返回空串');
assert.equal(
  pickTargetLink({ id: 'y', idCode: code('d'), body: '', raw: { rtf_content: `<img src="https://p.ananas.chaoxing.com/star3/origin/x.png"><a href="https://notice.chaoxing.com/pc/notice/detail?idCode=${code('d')}">详情</a>` } }),
  `https://notice.chaoxing.com/pc/notice/detail?idCode=${code('d')}`,
  '图片 / 静态资源不算可打开的页面',
);

/* ── 2. 卡片按钮：新增删除 + 浏览器打开（带登录态），两种列表都不漏 ── */
const todoBtns = cardActionsHtml(hwItem, 'todo');
assert.match(todoBtns, /data-act="del"/, '待办作业卡片要有移除入口');
assert.match(todoBtns, />移除<\/button>/, '按钮文案用「移除」，不用裸「删除」，避免被误读成删数据');
assert.match(todoBtns, /不影响学习通平台/, '按钮 title 要写明不影响平台');
assert.match(todoBtns, /data-act="open"/, '待办作业卡片要有浏览器打开');
assert.match(todoBtns, /浏览器打开（带登录态）/, '真实页面要标明带登录态');
assert.match(todoBtns, /data-act="share"/, '保留公开分享页入口');
assert.match(todoBtns, /加入时间管理/);
assert.doesNotMatch(todoBtns, /展开\/收起/);

const inboxBtns = cardActionsHtml(hwItem, 'inbox');
assert.match(inboxBtns, /data-act="toggle"/);
assert.match(inboxBtns, /data-act="del"/);
assert.doesNotMatch(inboxBtns, />删除<\/button>/, '收件箱卡片不应再出现裸「删除」文案');
assert.match(inboxBtns, /data-act="open"/);
assert.match(inboxBtns, /转为提醒/);
assert.doesNotMatch(cardActionsHtml(noLinkItem, 'todo'), /带登录态/, '只能开分享页时按分享页渲染，不谎称带登录态');
assert.match(cardActionsHtml(noLinkItem, 'todo'), /data-act="open"/, '有分享页也给出浏览器打开入口');

/* ── 3. 落库：先灌两条真实结构的通知 ── */
const hwRtf = `${hwItem.raw.rtf_content}<p>截止时间：2030-01-01 09:00</p>`;
response = {
  status: 200,
  body: JSON.stringify({ notices: { list: [
    { idCode: code('a'), title: hwItem.title, rtf_content: hwRtf, insertTime: 1, isread: 0, createrName: '学习通知' },
    { idCode: code('b'), title: noLinkItem.title, rtf_content: noLinkItem.raw.rtf_content, insertTime: 2, isread: 1, createrName: '学习通知' },
  ], lastPage: true } }),
  finalUrl: 'https://notice.chaoxing.com/pc/notice/getNoticeList',
};
state.cookie = '_uid=1; route=abc';
await fetchInbox(0, true, false);
assert.equal(state.inbox.length, 2);
assert.equal(visibleInbox().length, 2);
assert.equal(todos().length, 1, '只有带截止时间的作业进待办');
assert.equal(todos()[0].idCode, code('a'));

/* ── 4. 删除 = 本机忽略，可恢复；原始数据不丢 ── */
const target = state.inbox.find((n) => n.idCode === code('a'));
await ignoreNotice(target);
assert.ok(state.ignoredIds.has(target.id), '删除要记进忽略名单');
assert.equal((storage.ignoredIds || []).join(','), target.id, '忽略名单要落到插件存储');
assert.equal(state.inbox.length, 2, 'state.inbox 保留原始数据，恢复才能瞬时生效');
assert.equal(visibleInbox().length, 1);
assert.equal(filteredInbox().length, 1);
assert.equal(todos().length, 0, '删除后立刻从待办作业消失');
assert.match(notifies.at(-1), /移除/);

await ignoreNotice(target);
assert.equal((storage.ignoredIds || []).join(','), target.id, '重复删除不产生重复记录');

await restoreIgnored();
assert.equal(state.ignoredIds.size, 0);
assert.equal((storage.ignoredIds || []).join(','), '', '恢复后忽略名单要清空并落库');
assert.equal(visibleInbox().length, 2);
assert.equal(todos().length, 1, '恢复后待办作业回来');

/* ── 5. 浏览器打开：公开分享页直开；需登录页改走 passport 跳板并在登录后回到该页 ── */
await openTarget(noLinkItem);
assert.equal(opened.at(-1), shareUrl('b'), '分享页免登录，直接打开');

state.cookie = '_uid=1; route=abc';
response = { status: 200, body: '', finalUrl: 'https://passport2.chaoxing.com/login?fid=&newrefer=' };
await openTarget(hwItem);
assert.ok(opened.at(-1).startsWith('https://passport2.chaoxing.com/login?'), '需要登录时走 passport 跳板');
assert.ok(opened.at(-1).includes(encodeURIComponent(HW)), 'refer 必须带回原目标页');
assert.equal(opened.at(-1), LOGIN_JUMP(HW));
assert.match(notifies.at(-1), /登录后会自动跳回/);

response = { status: 200, body: '<html><body>作业页内容</body></html>', finalUrl: HW };
await openTarget(hwItem);
assert.equal(opened.at(-1), HW, '会话仍有效时直接开原页面，不绕登录页');

state.cookie = '';
await openTarget(hwItem);
assert.equal(opened.at(-1), LOGIN_JUMP(HW), '没有本机会话时按需要登录处理');

/* ── 6. 权限与清单：openUrl 必须在 manifest 里声明，否则按钮点了没反应 ── */
assert.ok(source.includes('tide.util.openUrl('), '插件确实调用了 openUrl');
assert.ok((manifest.permissions || []).includes('openUrl'), 'manifest 必须声明 openUrl 权限');
assert.equal(manifest.version, '2.12.0');
const catalog = fs.readFileSync(new URL('src/pluginCatalog.js', root), 'utf8');
const entry = catalog.slice(catalog.indexOf('"id": "chaoxing-notify"'));
const block = entry.slice(0, entry.indexOf('},\n  {'));
assert.match(block, /"openUrl"/, 'pluginCatalog 必须同步到 openUrl');
/* 版本从 manifest 推导，别再硬编码两处（升版本必忘一处的老坑） */
assert.match(block, new RegExp(`"${manifest.version.replace(/\./g, "\\.")}"`), 'pluginCatalog 必须同步到插件新版本号');

/* ── 6c. 打开插件的刷新策略（v2.9.0）：界面上二选一（自动刷新/节流刷新），默认自动刷新。
   节流档下 render 里的 refreshAll 必须被 lastSyncAt 节流；两档按钮都要带 title 悬停理由。 ── */
assert.ok(source.includes('AUTO_REFRESH_THROTTLE_MS'), '必须有节流常量 AUTO_REFRESH_THROTTLE_MS');
assert.match(
  source,
  /if \(state\.refreshMode === "auto" \|\| stale\) await refreshAll\(\)/,
  'render 必须按所选策略决定是否自动刷新（auto 恒刷 / throttle 看 lastSyncAt）',
);
assert.match(source, /state\.lastSyncAt = Date\.now\(\)/, '成功同步后必须记录 lastSyncAt');
assert.ok(/refreshMode: "auto"/.test(source), '默认策略必须是「自动刷新」（refreshMode: "auto"）');
assert.match(source, /REFRESH_MODES = \{[\s\S]*?auto: \{[\s\S]*?why: [\s\S]*?throttle: \{[\s\S]*?why: /, '两档策略都必须带 why 悬停理由文案');
assert.match(source, /title="\$\{esc\(REFRESH_MODES\[m\]\.why\)\}"/, '策略按钮必须把 why 渲染进 title（鼠标悬停可见）');
assert.match(source, /await tide\.storage\.set\('refreshMode',\s*state\.refreshMode\)/, '切换策略必须持久化到 storage');

/* ── 6f. 插件联动广播（v2.11.0）：抓到新通知时 emit notice:new，供微信推送的「插件消息」通道订阅 ── */
assert.match(source, /tide\.events\.emit\("notice:new"/, '有新通知时必须广播 notice:new 事件');
assert.match(source, /sourceName: "学习通"/, '广播必须带来源插件显示名');
assert.match(source, /\.slice\(0, 5\)[\s\S]{0,120}\.map\(\(x\) => \(\{ title: x\.title/, '广播最多带 5 条，避免打爆推送频次额度');

/* ── 6d. 通知分类页（v2.10.0）：学年下拉 + 按分类分区 ──
   学年按中国学年制（9 月至次年 8 月）从通知时间推导；下拉选学年后只显示该学年的通知。 */
assert.match(source, /\["cats", `通知分类 <span class="cx2-pill">\$\{visibleInbox\(\)\.length\}<\/span>`\]/,
  '「通知分类」标签页必须带计数胶囊（和收件箱 / 待办 / 课程一致）');
assert.match(source, /data-cat-year/, '分类页必须有学年下拉栏');
assert.match(source, /state\.filter\.catYear/, '选中的学年必须持久化到 filter');
assert.equal(noticeAcademicYear({ time: '2025-09-01 08:00' }), '2025-2026', '9 月属新学年');
assert.equal(noticeAcademicYear({ time: '2026-08-31 23:59' }), '2025-2026', '次年 8 月仍属上一学年');
assert.equal(noticeAcademicYear({ time: '2026-09-01 00:01' }), '2026-2027', '次年 9 月进入下学年');
assert.equal(noticeAcademicYear({ time: '' }), '', '解析不出时间归「未知学年」');

state.ignoredIds.clear(); state.newIds.clear(); state.readOverrides.clear(); state.workStatus = {};
state.inbox = [
  { id: 'ex-a', title: '关于期末考试安排的通知', body: '', sender: '教务处', time: '2025-09-10 10:00', unread: false },
  { id: 'hw-a', title: '第三章作业提交', body: '截止时间：2026-06-30 23:59', sender: '高数老师', time: '2026-03-01 09:00', unread: true },
  { id: 'old-b', title: '往年校园卡通知', body: '', sender: '信息中心', time: '2024-05-01 08:00', unread: false },
];
state.filter.catYear = '全部';
const catsAll = catsHtml();
assert.match(catsAll, /全部学年/, '学年下拉默认「全部学年」');
assert.match(catsAll, /2025-2026 学年/, '下拉要有推导出的学年选项');
assert.match(catsAll, /2023-2024 学年/, '下拉要有更早的学年选项（2024-05 属 2023-2024 学年）');
assert.match(catsAll, /class="cx2-tag 考试"/, '要按「考试」分区');
assert.match(catsAll, /class="cx2-tag 作业"/, '要按「作业」分区');
assert.ok(catsAll.includes('往年校园卡通知'), '全部学年应包含所有通知');
state.filter.catYear = '2025-2026';
const catsYear = catsHtml();
assert.match(catsYear, /共 2 条/, '2025-2026 学年应筛出 2 条（2025-09 与 2026-03 各一）');
assert.ok(!catsYear.includes('往年校园卡通知'), '其它学年的通知不应出现在筛选结果里');
assert.ok(catsYear.includes('关于期末考试安排的通知'), '2025-09 的通知属于 2025-2026 学年');
state.filter.catYear = '全部';
state.inbox = [];

/* ── 6b. 配色必须走主题变量，否则夜间模式下会变成深色字压深色底 ──
   踩过的坑：插件样式表是浅色硬编码，且由 ensureStyle() 在运行时追加到 <head> 末尾，
   与主程序 `.plugview{color:var(--ink)}` 同权重却更靠后，于是 `.cx2{color:#203840}` 反过来压住主题色；
   主程序那份 !important 夜间兼容层又只改 background 不改 color，于是胶囊 / 标签 / 统计条的
   文字色停在了浅色模式那一套（实测对比度低到 1.4~1.5:1）。 */
const styleBlock = source.slice(source.indexOf('s.textContent = `') + 's.textContent = `'.length, source.indexOf('`; document.head.append(s);'));
assert.ok(styleBlock.length > 3000, '必须能取到插件样式表');
for (const v of ['var(--ink)', 'var(--ink-2)', 'var(--panel)', 'var(--line)', 'var(--deep)']) {
  assert.ok(styleBlock.includes(v), `插件样式必须使用主题变量 ${v}`);
}
assert.doesNotMatch(styleBlock, /color:#203840|color:#275b68|color:#6c7f86/, '深色硬编码文字色会压掉夜间主题色');
assert.match(styleBlock, /\.cx2-kpi\{[^}]*color:var\(--ink\)/, '统计条必须自己给出文字色，不能靠继承深色');
assert.match(styleBlock, /::placeholder\{color:var\(--ink-2\)/, '搜索框占位文字在两种主题下都要可读');
assert.match(styleBlock, /\.cx2-pill\{[^}]*color:var\(--deep\)/, '计数胶囊底色与文字色必须成对给出');
const appCss = fs.readFileSync(new URL('src/styles.css', root), 'utf8');
// 切片必须从注释起始符开始，否则开头的说明文字会被当成选择器
const nightLayer = appCss.slice(appCss.indexOf('/* 内置插件深色兼容层'), appCss.indexOf('/* v0.14 · 可定制插件入口'));
assert.ok(nightLayer.startsWith('/*') && nightLayer.length > 500, '必须能取到夜间兼容层');
assert.ok(nightLayer.includes('.pp-tag') && nightLayer.includes('.gx-tag'), '夜间兼容层仍要覆盖其它浅色硬编码插件');
assert.doesNotMatch(nightLayer.replace(/\/\*[\s\S]*?\*\//g, ''), /\.cx2-/,
  '学习通已改用主题变量，不该再进夜间兼容层白名单（那层只改 background 不改 color）');

/* ── 7. 课程页：按卡片「开课时间」推断学年与年级，灰标已完成 / 黑标未完成 ── */
const courseLi = (name, cid, clzId, teacher, clazz, range) => `<li class="course clearfix catalog_0 learnCourse">
  <div class="course-cover"><input type="hidden" class="clazzId" name="clazzId" value="${clzId}"/><input type="hidden" class="courseId" name="courseId" value="${cid}"/></div>
  <div class="course-info"><h3 class="inlineBlock"><a href="#"><span class="course-name overHidden2" title="${name}">${name}</span></a></h3>
  <p class="line2 color3" title="${teacher}">${teacher}</p>
  ${range ? `<p>开课时间：${range}</p>` : ''}
  <p class="overHidden1">班级：${clazz}</p></div>
</li>
`;
const CLZ = '(理论)25防火2队1班（信工）';
response = {
  status: 200,
  finalUrl: 'https://mooc2-ans.chaoxing.com/visit/courses/list',
  body: [
    courseLi('高等数学（理）1', 101, 201, '安晓伟', CLZ, '2025-09-01～2027-09-01'),
    courseLi('大学英语2', 102, 202, '辛淑兰', '(理论)25英普B22班（信工）', '2026-03-10～2028-03-10'),
    courseLi('线性代数A', 103, 203, '邵红梅', CLZ, '2026-09-01～2028-09-01'),
    courseLi('算法编程协会培训', 104, 204, 'APA', '默认班级', ''),
  ].join(''),
};
const courses = await loadCourses();
assert.equal(courses.length, 4, '四张课程卡片都要解析出来');
assert.equal(courses[0].start, '2025-09-01', '必须抓到卡片里那行「开课时间」的起始日');
assert.equal(courses[0].end, '2027-09-01', '结课日一并抓下来');
assert.equal(courses[3].start, '', '没有开课时间行的课程留空，不能瞎猜');

const NOW = new Date('2026-09-13T12:00:00');
// 学期划分：7 月及以后开课算秋季学期；2~6 月算春季学期，学年要往前挪一年。
assert.equal(termOf('2025-09-01').year, 2025);
assert.equal(termOf('2025-09-01').half, '上');
assert.equal(termOf('2025-09-01').label, '2025-2026 学年上学期');
assert.equal(termOf('2026-03-10').year, 2025, '2026 年 3 月属于 2025-2026 学年下学期');
assert.equal(termOf('2026-03-10').half, '下');
assert.equal(termOf(''), null);
assert.equal(termOf('2026-13-01'), null, '非法月份不能算出一个学期');
assert.equal(currentTerm(NOW).year, 2026);
assert.equal(currentTerm(NOW).half, '上');

assert.equal(gradeOf(2025, 2025), '大一');
assert.equal(gradeOf(2026, 2025), '大二');
assert.equal(gradeOf(2027, 2025), '大三');
assert.equal(gradeOf(2028, 2025), '大四');
assert.equal(gradeOf(2024, 2025), '入学前');
assert.equal(gradeOf(2025, 0), '', '认不出入学年份时不硬造年级');

assert.equal(detectEnrollYear(courses), 2025, '从「25防火」「25英普」推出入学年份');
assert.equal(detectEnrollYear([{ start: '2026-09-01' }]), 2026, '没有任何年级线索时退回最早开课学年');

/* 课程页 v2.5.0：四态状态（红=未来学期未完成 / 蓝=当前学期正在进行 / 绿=已结束 / 灰=未知） */
assert.equal(courseStatus({ start: '2025-09-01' }, NOW), 'green', '上学期已过去 → 已完成（绿）');
assert.equal(courseStatus({ start: '2026-03-10' }, NOW), 'green', '今年春季学期也已过去');
assert.equal(courseStatus({ start: '2026-09-01' }, NOW), 'blue', '当前学期 → 正在进行（蓝）');
assert.equal(courseStatus({ start: '2027-09-01' }, NOW), 'red', '未来学期 → 未完成（红）');
assert.equal(courseStatus({ start: '' }, NOW), 'gray', '没有开课时间就不下结论');

/* 第一层按学年分 tab，默认最近学年；第二层学年内按状态三色分组 */
state.filter.kw = '';
state.course = { year: null, searchOpen: false };
const courseHtml = coursesHtml();
assert.match(courseHtml, /2026-2027 学年（1）/, '学年 tab 要有最近学年');
assert.match(courseHtml, /2025-2026 学年（2）/);
assert.match(courseHtml, /未知学年（1）/, '无开课时间的归未知学年 tab');
assert.match(courseHtml, /class="on" data-year="2026"/, '每次打开默认选中最近学年');
assert.match(courseHtml, /cx2-course st-blue/, '当前学期课程用蓝色卡片');
assert.match(courseHtml, /cx2-mark st-blue"[^>]*>正在进行</);
assert.doesNotMatch(courseHtml, /st-green/, '默认学年视图不显示其他学年的已完成课程');
assert.match(courseHtml, /data-search-toggle/, '搜索默认折叠成图标');
assert.doesNotMatch(courseHtml, /<input class="cx2-search"/, '折叠时不渲染搜索输入框');
assert.match(courseHtml, /红=未完成/, '页面写明三色推断规则');

state.course.year = 2025;
const html2025 = coursesHtml();
assert.match(html2025, /cx2-course st-green/, '过去学年课程用绿色卡片');
assert.match(html2025, /cx2-mark st-green"[^>]*>已完成</);
assert.match(html2025, /已完成</, '第二层状态分组标题');
assert.doesNotMatch(html2025, /st-blue/, '切学年后不串组');

state.course.year = 0;
const htmlUnknown = coursesHtml();
assert.match(htmlUnknown, /cx2-course st-gray/, '无开课时间用灰色卡片');
assert.match(htmlUnknown, /状态未知/);

state.course.searchOpen = true;
assert.match(coursesHtml(), /<input class="cx2-search"/, '点图标后展开搜索框');
state.course.searchOpen = false;
state.filter.kw = '线代';
assert.match(coursesHtml(), /<input class="cx2-search"/, '有关键词时搜索框自动展开');
state.filter.kw = '';
assert.match(coursesHtml(), /按 2025 级入学计算/, '页面上要写明年级是本地推断');

/* ── 7b. 课程页「开课时间」总览：跨学年按开课日期升序排成时间轴，同日合并，无日期的落最后 ── */
state.filter.kw = '';
state.course = { year: 2026, searchOpen: false, view: 'timeline' };
const tlHtml = coursesHtml();
assert.match(tlHtml, /data-course-view="timeline"[^>]*aria-pressed="true"/, '视图开关要点亮「开课时间」');
assert.match(tlHtml, /共 4 门课，分布在 3 个开课时间/, '汇总行按不同开课日期计数');
assert.match(tlHtml, /另有 1 门没有开课时间/, '没有开课时间行的课要在汇总里交代清楚');
assert.doesNotMatch(tlHtml, /data-year="2025"/, '总览视图不再渲染学年 tab，也不受当前选中学年限制');
assert.match(tlHtml, /cx2-tl-date"[^>]*>2025-09-01</, '2025 级那门课的开课日期要出现在时间轴上');
assert.match(tlHtml, /cx2-tl-date"[^>]*>2026-09-01</, '当前学期的开课日期');
assert.match(tlHtml, /cx2-tl-rel">本学期</, '当前学期那一段要标「本学期」');
assert.match(tlHtml, /cx2-tl-date"[^>]*>无开课时间</, '没有开课时间的课归到末段，不能被时间轴吞掉');
const tlOrder = ['2025-09-01', '2026-03-10', '2026-09-01', '无开课时间']
  .map((d) => tlHtml.indexOf(`>${d}<`));
assert.deepEqual(tlOrder, [...tlOrder].sort((a, b) => a - b), '时间轴必须按开课日期先后排列，无日期的排最后');
assert.ok(tlOrder.every((i) => i >= 0), `四段都要渲染出来：${JSON.stringify(tlOrder)}`);
state.filter.kw = '大学英语';
assert.match(coursesHtml(), /共 1 门课，分布在 1 个开课时间/, '总览同样吃搜索词');
assert.doesNotMatch(coursesHtml(), /高等数学/, '总览里搜索时不相关的课不该出现');
state.filter.kw = '';
state.course = { year: 2026, searchOpen: false };
assert.doesNotMatch(coursesHtml(), /cx2-tl-sec/, '切回学年分组后时间轴不该残留');
state.course = { year: null, searchOpen: false };

/* ── 7c. 点击课程卡片 → 只看这一门课的开课～结课时间（默认收起，点击才占版面） ── */
state.course = { year: 2026, searchOpen: false };
const cardHtml = coursesHtml();
assert.match(cardHtml, /class="cx2-course st-blue" data-course-toggle/, '卡片要带点击展开标记');
assert.match(cardHtml, /cx2-course-more"><p><i>开课<\/i>2026-09-01 ～ 2028-09-01</, '展开区给出平台卡片原文的开课～结课区间');
assert.match(cardHtml, /<p><i>学期<\/i>2026-2027 学年上学期 · 大二上</, '展开区写明推算出的学期与年级');
assert.match(cardHtml, /恒为开课 \+2 年/, '要交代结课日不可用来判完成');
assert.match(cardHtml, /点击卡片可展开/, '底部说明要提示这个入口');
assert.match(source, /courseCard\.classList\.toggle\('open'\)/, '点击处理只切 DOM class，不整页重绘');
assert.match(styleBlock, /\.cx2-course\.open \.cx2-course-more\{display:block\}/, '样式必须让 .open 真正把详情放出来');
state.course.year = 0;
assert.match(coursesHtml(), /cx2-course st-gray" data-course-toggle[\s\S]*?没有「开课时间」一行/, '无开课时间的卡片展开后要说明为什么没有');
state.courses.push({ name: '往年开课的课', teacher: '某师', clazz: CLZ, courseid: '9', clazzid: '9', start: '2024-09-02', end: '2026-09-02' });
state.course.year = 2024;
const preEnroll = coursesHtml();
assert.match(preEnroll, /入学前 · 开课 2024-09-02/, '早于入学学年的课只写「入学前」');
assert.doesNotMatch(preEnroll, /入学前上/, '非年级文案不能拼学期后缀');
state.courses.pop();
state.course = { year: null, searchOpen: false };

/* ── 8. 已提交未批改的作业 → 标题后加「正在批改」标签 ── */
const iframeHtml = (workId) => {
  const payload = { attachmentType: 25, att_web: { examOrWorkId: workId, examOrWork: 'work', clazzId: 2, courseId: 1, url: `https://mooc1-api.chaoxing.com/examApi/intoexamorwork?taskrefId=${workId}&courseId=1&classId=2&workOrExam=work&enc=abc` } };
  const b64 = Buffer.from(encodeURIComponent(JSON.stringify(payload)), 'utf8').toString('base64');
  return `<iframe frameborder="0" cid="x" src="insertWeb.html" name="${b64}" class="attach-module"></iframe>`;
};
const mkTodo = (id, workId) => ({
  id, title: '作业:测试' + id, sender: '学习通知', insertTime: 5,
  body: '<p>课程名称：X</p><p>作业名称：Y</p><p>结束时间：2030-01-01 09:00</p>',
  raw: { rtf_content: `<p>作业名称：Y</p><p>结束时间：2030-01-01 09:00</p>${iframeHtml(workId)}` },
});

const refN = mkTodo('w1', 9001);
const ref = parseWorkRef(refN);
assert.ok(ref && ref.id === '9001' && /intoexamorwork/.test(ref.url), '要从附件 iframe 里解出作业引用');
assert.equal(parseWorkRef({ raw: { rtf_content: '<p>没有附件</p>' } }), null, '没有附件时不硬造引用');
assert.equal(parseWorkRef({ raw: { rtf_content: `<iframe name="${Buffer.from('%%%notjson%%%').toString('base64')}">` } }), null, '解码失败也要安全返回');

state.workStatus = {};
state.loggedIn = true;
state.inbox = [mkTodo('w1', 9001), mkTodo('w2', 9002)];
response = (url) => ({
  status: 200,
  finalUrl: url,
  body: /taskrefId=9001/.test(url)
    ? '<html><title>作业作答</title><body>还能作答</body></html>'
    : '<html><title>查看详情</title><body>已交的查看页</body></html>',
});
const workFetches = () => fetched.filter((u) => /intoexamorwork/.test(u)).length;
await probePendingWorks();
assert.equal(state.workStatus['9001'], 'unsent', '落地页是「作业作答」→ 未提交');
assert.equal(state.workStatus['9002'], 'grading', '落地页是详情查看页 → 已提交，正在批改');
assert.equal(workFetches(), 2, '每个未知作业只探一次');
assert.equal(storage.workStatus['9002'], 'grading', '状态要落到插件存储，刷新后不用重探');
await probePendingWorks();
assert.equal(workFetches(), 2, '已有状态的不重复探测');
assert.equal(statusOf(state.inbox.find((x) => x.id === 'w2')), 'grading');
assert.match(gradingBadge(state.inbox.find((x) => x.id === 'w2')), /正在批改/, '已提交未批改的标题后要有标签');
assert.equal(gradingBadge(state.inbox.find((x) => x.id === 'w1')), '', '未提交的不打标');
assert.equal(gradingBadge({ raw: { rtf_content: '' } }), '', '解析不出引用的不打标');
assert.equal(todos().length, 2, '两条都在待办列表里（未提交的本来就该在）');

console.log('PASS: 学习通链接识别、移除/恢复、课程年级分组与完成状态、正在批改标记、manifest 权限，以及带登录态的浏览器打开链路');

/* v2.6.0：标记已读/未读（本机覆盖）+ 卡片彩色框 */
const src2 = fs.readFileSync(new URL('../public/plugins/chaoxing-notify/main.js', import.meta.url), 'utf8');
assert.match(src2, /const effUnread = /, '必须用 effUnread 统一取有效未读（平台状态 + 本机覆盖）');
assert.match(src2, /readOverrides/, '标记必须走本机 readOverrides 覆盖，不动平台状态');
assert.match(src2, /data-act="mark"/, '卡片必须有「标记」按钮');
assert.match(src2, /CAT_FRAME/, '彩色框必须按类型映射（通知/作业/考试/签到）');
assert.match(src2, /cx2-card\.cat-sun/, '作业卡要有 sun 色框');
assert.match(src2, /button\.acc/, '标记按钮要有海青色框样式');

/* ── 9. 拼音首字母缩写搜索（v2.12.0）：bj → 北京、dx → 大学 ──
   数据表由 tools/gen-chaoxing-pinyin.js 生成（pinyin-pro 多音字全读音），标记区勿手改。 */
assert.ok(source.includes('CX_PY_DATA BEGIN'), '桌面端必须包含生成的拼音数据标记区');
assert.match(source, /tools\/gen-chaoxing-pinyin\.js/, '数据区注释要指回生成脚本，方便重生成');
assert.equal(cxInitials('北京'), 'bj', '北京 → bj');
assert.equal(cxInitials('大学英语四级'), 'dxyysj', '逐字取首字母');
assert.ok(cxKwHit('重庆', 'cq'), '多音字按次常用读音命中（重 chong）');
assert.ok(cxKwHit('郑重声明', 'zc'), '多音字在任何位置都能按次读音命中');
assert.equal(cxInitials('安晓伟').includes('a'), true, '零声母字（安 an）也要进首字母流');
assert.equal(cxInitials('25防火2队1班'), '25fh2d1b', '数字与字母原样保留，可混拼');
assert.ok(cxKwHit('北京理工大学期末通知', 'bj'), '纯字母关键词走首字母流');
assert.ok(cxKwHit('大学英语四级', 'yy'), 'yy → 英语');
assert.ok(cxKwHit('大学英语四级', '英语'), '含中文的关键词退回原文 includes（旧行为不变）');
assert.ok(!cxKwHit('大学英语四级', 'bj'), '不相关缩写不误报');
assert.ok(cxKwHit('高等数学（理）1', 'gds'), '标点当分隔符不影响命中');

/* 端到端：收件箱与课程两条过滤链都要吃到缩写搜索 */
state.ignoredIds.clear(); state.newIds.clear(); state.readOverrides.clear();
state.inbox = [
  { id: 'py-a', title: '北京实习动员会', body: '', sender: '学工处', time: '2025-09-10 10:00', unread: false },
  { id: 'py-b', title: '南京会议纪要', body: '', sender: '教务处', time: '2025-09-11 10:00', unread: false },
];
state.filter.kw = 'bj';
assert.equal(filteredInbox().length, 1, '收件箱搜索 bj 只命中北京');
assert.ok(filteredInbox()[0].title.includes('北京'), '命中的是北京那条');
state.filter.kw = '上海';
assert.equal(filteredInbox().length, 0, '中文关键词旧行为不变');
state.filter.kw = 'dx';
const courses4 = state.courses.length ? state.courses : courses;
state.courses = courses4;
state.course = { year: 2025, searchOpen: true };
const abbrHtml = coursesHtml();
assert.ok(abbrHtml.includes('大学英语2'), '课程搜索 dx 命中大学英语');
assert.ok(!abbrHtml.includes('线性代数A'), '课程搜索 dx 不该带出线性代数');
state.filter.kw = '';
