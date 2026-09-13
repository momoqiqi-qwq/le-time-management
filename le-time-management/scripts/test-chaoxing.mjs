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

const EXPORTS = '{state,pickTargetLink,isAnonymousUrl,linkScore,cardActionsHtml,ignoreNotice,restoreIgnored,visibleInbox,filteredInbox,todos,openTarget,fetchInbox,LOGIN_JUMP,loadCourses,termOf,currentTerm,gradeOf,detectEnrollYear,courseStatus,courseGroups,courseCardHtml,coursesHtml,parseWorkRef,statusOf,gradingBadge,probeWorkStatus,probePendingWorks}';
vm.runInContext(
  source.replace('  tide.ui.registerView({', `  globalThis.cx = ${EXPORTS};\n  tide.ui.registerView({`),
  context,
);
const { state, pickTargetLink, isAnonymousUrl, cardActionsHtml, ignoreNotice, restoreIgnored,
  visibleInbox, filteredInbox, todos, openTarget, fetchInbox, LOGIN_JUMP,
  loadCourses, termOf, currentTerm, gradeOf, detectEnrollYear, courseStatus, courseGroups, coursesHtml,
  parseWorkRef, statusOf, gradingBadge, probeWorkStatus, probePendingWorks } = context.cx;

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
assert.equal(manifest.version, '2.4.0');
const catalog = fs.readFileSync(new URL('src/pluginCatalog.js', root), 'utf8');
const entry = catalog.slice(catalog.indexOf('"id": "chaoxing-notify"'));
const block = entry.slice(0, entry.indexOf('},\n  {'));
assert.match(block, /"openUrl"/, 'pluginCatalog 必须同步到 openUrl');
assert.match(block, /"2\.4\.0"/, 'pluginCatalog 必须同步到插件新版本号');

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

assert.equal(courseStatus({ start: '2025-09-01' }, NOW), 'done', '上学期已过去 → 已完成');
assert.equal(courseStatus({ start: '2026-03-10' }, NOW), 'done', '今年春季学期也已过去');
assert.equal(courseStatus({ start: '2026-09-01' }, NOW), 'open', '当前学期 → 未完成');
assert.equal(courseStatus({ start: '' }, NOW), 'unknown', '没有开课时间就不下结论');

const groups = courseGroups(courses, 2025, NOW);
// 注意：groups 来自 vm 沙箱，跨 realm 的数组原型不同，deepStrictEqual 会误判，所以比 join。
assert.equal(groups.map((g) => g.label).join('|'), '大一|大二|其他（无开课时间）', '按年级分组，无开课时间排最后');
assert.equal(groups[0].sub, '2025-2026 学年 · 共 2 门 · 已完成 2 · 未完成 0');
assert.equal(groups[1].sub, '2026-2027 学年 · 共 1 门 · 已完成 0 · 未完成 1');
assert.match(groups[2].sub, /状态未知/);

state.filter.kw = '';
const courseHtml = coursesHtml();
assert.match(courseHtml, /cx2-grade-head">大一</, '大一要有独立分组标题');
assert.match(courseHtml, /cx2-grade-head">大二</);
assert.match(courseHtml, /其他（无开课时间）/);
assert.match(courseHtml, /class="cx2-mark done"[^>]*>已完成</, '已完成用灰标');
assert.match(courseHtml, /class="cx2-mark open"[^>]*>未完成</, '未完成用黑标');
assert.doesNotMatch(courseHtml, /cx2-mark unknown/, '状态未知的课程不打标，避免误导');
assert.match(courseHtml, /按 2025 级入学计算/, '页面上要写明年级是本地推断');

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
