import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import { spawnSync } from 'node:child_process';import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as XLSX from 'xlsx';
import { spreadsheetFileToCsv } from '../src/spreadsheet.js';
// 对比度算式复用主题工具库的那一份，别在测试里另造一套（两套算法迟早对不上）。
const { contrastRatio } = createRequire(import.meta.url)('../../tools/lib/theme-tokens.js');
const ctx=vm.createContext({TextEncoder,TextDecoder});vm.runInContext(fs.readFileSync(new URL('../public/plugins/shiguang-schedule/model.js',import.meta.url),'utf8'),ctx);const M=ctx.ShiguangModel;
const raw=M.empty('2026-09-09');raw.config.semesterStartDate='2026-09-07';raw.courses=[{id:'a',name:'课程，测试',teacher:'教师',position:'一教',day:1,startSection:1,endSection:2,weeks:[1,3,5],remark:'第一行\n第二行'},{id:'b',name:'自定义课',day:7,isCustomTime:true,customStartTime:'18:00',customEndTime:'19:00',weeks:[2]}];const table=M.normalize(raw);
assert.equal(M.weekOf('2026-09-09','2026-09-13'),1);assert.equal(M.weekOf('2026-09-09','2026-09-14'),2);assert.equal(M.weekOf('2026-09-09','2026-09-06'),0);
assert.equal(M.occurrences(table,1)[0].date,'2026-09-07');assert.equal(M.occurrences(table,2)[0].date,'2026-09-20');assert.equal(M.occurrences(table,1)[0].end,'09:40');
assert.equal(JSON.stringify(M.weeks('1-5,3,7')),JSON.stringify([1,2,3,4,5,7]));
assert.equal(M.conflicts([{id:'a',date:'2026-09-07',start:'08:00',end:'09:00'},{id:'b',date:'2026-09-07',start:'09:00',end:'10:00'}]).size,0);
assert.equal(M.conflicts([{id:'a',date:'2026-09-07',start:'08:00',end:'09:10'},{id:'b',date:'2026-09-07',start:'09:00',end:'10:00'}]).size,2);
for(const bad of [{...raw,courses:[{...raw.courses[0],day:8}]},{...raw,courses:[{...raw.courses[0],weeks:[61]}]},{...raw,courses:[{...raw.courses[0],endSection:20}]},{...raw,courses:[{...raw.courses[1],customEndTime:'17:00'}]},{...raw,config:{...raw.config,semesterStartDate:'2026-02-30'}}])assert.throws(()=>M.normalize(bad));
const json=JSON.stringify(table);assert.equal(JSON.stringify(M.normalize(JSON.parse(json))),json);
const ics=M.ics(table);assert.equal(ics.split('BEGIN:VEVENT').length-1,4);assert.ok(ics.includes('课程\\，测试')===false);assert.ok(ics.includes('DTSTART:20260920T180000'));assert.ok(ics.includes('第一行\\n第二行'));
assert.equal(M.packs({allTables:[{tableName:'A',tableData:raw}]}).length,1);
console.log('PASS: upstream JSON round-trip, sections/custom time, odd weeks, semester boundaries, conflicts, invalid import rejection and ICS occurrences');
const savedBlocks=[];
const uiContext=vm.createContext({TextEncoder,modelScope:{ShiguangModel:M},tide:{ui:{registerView(){}},util:{today:()=> '2026-09-09'},notify(){},blocks:{list:date=>savedBlocks.filter(b=>b.date===date),create:b=>{const block={...b,id:'block-'+savedBlocks.length};savedBlocks.push(block);return block;},remove:id=>{const i=savedBlocks.findIndex(b=>b.id===id);if(i>=0)savedBlocks.splice(i,1);}}}});
const ui=fs.readFileSync(new URL('../public/plugins/shiguang-schedule/ui.js',import.meta.url),'utf8');
for(const marker of ['今日课表','课程管理','课表管理','个性化配置','rename-table','import-all','pointerdown','prefers-reduced-motion'])assert.ok(ui.includes(marker),`missing embedded Shiguang feature: ${marker}`);
const pluginHost=fs.readFileSync(new URL('../src/pluginHost.js',import.meta.url),'utf8');
assert.match(pluginHost,/async spreadsheetText\(file\)/);
assert.match(ui,/\.xlsx,\.xls/);
assert.match(ui,/tide\.assets\.spreadsheetText\(file\)/);
for(const marker of ['选择学校','本科/专科','研究生','通用工具','school-category','school-open-adapter','tide.schoolImporter.open'])assert.ok(ui.includes(marker),`missing original online school import flow: ${marker}`);
assert.match(pluginHost,/schoolImporter:/);
const apiSource=fs.readFileSync(new URL('../src/api.js',import.meta.url),'utf8');
assert.match(apiSource,/school_import_open/);
const rustSource=fs.readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
for(const command of ['school_import_open','school_import_bridge'])assert.ok(rustSource.includes(command),`missing native school import command: ${command}`);
assert.ok(rustSource.includes('bridgeQueue'),'school import bridge must serialize concurrent adapter callbacks');
const nativeGridSource=fs.readFileSync(new URL('../../vendor/shiguangschedule/shared/src/commonMain/kotlin/com/xingheyuzhuan/shiguangschedule/ui/schedule/components/ScheduleGrid.kt',import.meta.url),'utf8');
assert.match(nativeGridSource,/PointerEventPass\.Initial/,'native schedule must intercept touchpad scrolling before the horizontal pager');
assert.match(nativeGridSource,/abs\(delta\.y\) <= abs\(delta\.x\)/,'vertical touchpad scroll must not steal horizontal week swipes');
assert.match(nativeGridSource,/gridScrollState\.dispatchRawDelta/,'touchpad deltas must drive the native schedule scroll state');
const nativeHostSource=fs.readFileSync(new URL('../../vendor/shiguangschedule/desktopApp/src/main/kotlin/com/xingheyuzhuan/shiguangschedule/LeHost.kt',import.meta.url),'utf8');
assert.match(nativeHostSource,/requestFocusInWindow\(\)/,'embedded Compose panel must acquire focus for precision touchpad input');
assert.match(pluginHost,/renderNativeSchedule/,'Tauri plugin host must retain the original native Shiguang interface');
// 默认安装包（tauri.conf.json）不带 native/shiguang，只有 tauri.shiguang.conf.json 才带；
// 所以原生渲染必须把插件自带界面当兜底，否则用户只会看到一块「尚未包含运行时」的死面板。
assert.match(pluginHost,/renderNativeSchedule\(el, ctx, def\.render\)/,
  'native render must be given the plugin view as fallback');
const nativeScheduleSource=fs.readFileSync(new URL('../src/nativeSchedule.js',import.meta.url),'utf8');
assert.match(nativeScheduleSource,/fallback\(container, ctx\)/,
  'missing native runtime must hand the view back to the embedded schedule UI');
assert.match(nativeScheduleSource,/!\s*status\.available\)\s*return degrade\(\)/,
  'missing native runtime must degrade rather than stop at a placeholder message');
vm.runInContext(ui.replace(' tide.ui.registerView({',' globalThis.fixture={set:(t,w)=>{table=t;week=w;},blocks,tone,subHead,setStyle:(s)=>{style={...style,...s};}};\n tide.ui.registerView({'),uiContext);
uiContext.fixture.set(table,1);await uiContext.fixture.blocks();assert.equal(savedBlocks.length,1);await uiContext.fixture.blocks();assert.equal(savedBlocks.length,1);
savedBlocks.length=0;savedBlocks.push({id:'existing',date:'2026-09-07',title:'existing',start:'08:30',durMin:30});await assert.rejects(uiContext.fixture.blocks(),/冲突/);assert.equal(savedBlocks.length,1);
console.log('PASS: time-block idempotence and conflict leaves existing schedule unchanged');
console.log('PASS: embedded Today/Week/My navigation, multi-table actions, personalization, all-table restore and swipe support');
const eduBase=M.empty('2026-09-07');eduBase.config.semesterStartDate='2026-09-07';eduBase.config.semesterTotalWeeks=20;
const eduTsv=[
  '课程名称\t任课教师\t上课地点\t星期\t周次\t节次',
  '高等数学\t张老师\tA101\t星期一\t1-16周\t1-2节',
  '大学英语\t李老师\tB203\t周三\t1-16单周\t3-4节',
].join('\n');
const edu1=M.parseAcademicText(eduTsv,eduBase);
assert.equal(edu1.table.courses.length,2);assert.deepEqual(Array.from(edu1.table.courses[0].weeks),Array.from({length:16},(_,i)=>i+1));assert.deepEqual(Array.from(edu1.table.courses[1].weeks),[1,3,5,7,9,11,13,15]);
const eduCombined='课程,教师,地点,上课时间\n计算机网络,王老师,C305,星期二 1-16周 第5-6节\n体育,赵老师,操场,周五 第7-8节 2-18双周';
const edu2=M.parseAcademicText(eduCombined,eduBase);
assert.equal(edu2.table.courses[0].day,2);assert.equal(edu2.table.courses[0].startSection,5);assert.equal(edu2.table.courses[0].endSection,6);assert.equal(edu2.table.courses[0].weeks.length,16);
assert.equal(edu2.table.courses[1].day,5);assert.deepEqual(Array.from(edu2.table.courses[1].weeks),[2,4,6,8,10,12,14,16,18]);assert.equal(edu2.table.courses[1].startSection,7);
const eduTime='课程名称\t星期\t周次\t开始时间\t结束时间\n晚间讲座\t星期四\t2-4周\t18:30\t20:00';
const edu3=M.parseAcademicText(eduTime,eduBase);assert.equal(edu3.table.courses[0].isCustomTime,true);assert.equal(edu3.table.courses[0].customStartTime,'18:30');
const eduBom=M.parseAcademicText('\uFEFF课程名称,教师,地点,星期,周次,节次\r\n数据结构,陈老师,实验楼201,星期二,1-16周,1-2节',eduBase);
assert.equal(eduBom.table.courses[0].name,'数据结构');
const eduParenParity=M.parseAcademicText('课程名称\t星期\t周次\t节次\n操作系统\t星期四\t1-16周(单)\t3-4节\n形势与政策\t星期五\t2-18周（双）\t7-8节',eduBase);
assert.deepEqual(Array.from(eduParenParity.table.courses[0].weeks),[1,3,5,7,9,11,13,15]);
assert.deepEqual(Array.from(eduParenParity.table.courses[1].weeks),[2,4,6,8,10,12,14,16,18]);
const eduAlternateHeaders=M.parseAcademicText('课程名,任课老师,教学场地,周星期,上课周数,起止节次\n公安学基础,周老师,阶梯教室,星期三,1-12周,5-6节',eduBase);
assert.equal(eduAlternateHeaders.table.courses[0].teacher,'周老师');
assert.equal(eduAlternateHeaders.table.courses[0].position,'阶梯教室');
const merged=M.mergeTables(edu1.table,edu1.table);assert.equal(merged.courses.length,2);
const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['课程名','任课老师','教学场地','周星期','上课周数','起止节次'],
  ['刑事科学技术','刘老师','实验中心302','星期一','1-16周(单)','1-2节'],
]),'学生课表');
const workbookBytes=XLSX.write(workbook,{bookType:'xlsx',type:'array'});
const eduXlsx=M.parseAcademicText(await spreadsheetFileToCsv({arrayBuffer:async()=>workbookBytes}),eduBase);
assert.equal(eduXlsx.table.courses[0].name,'刑事科学技术');
assert.equal(eduXlsx.table.courses[0].teacher,'刘老师');
assert.deepEqual(Array.from(eduXlsx.table.courses[0].weeks),[1,3,5,7,9,11,13,15]);
const eduEnglish=M.parseAcademicText('Course,Teacher,Classroom,Weekday,Weeks,Sections\nCriminology,Smith,C401,Monday,1-8,3-4',eduBase);
assert.equal(eduEnglish.table.courses[0].day,1);
console.log('PASS: academic-system TSV/CSV imports, combined weekday/week/section cells, odd/even weeks, custom time and dedup merge');

const pbVarint=(value)=>{const out=[];let n=Number(value);do{let b=n&0x7f;n=Math.floor(n/128);if(n)b|=0x80;out.push(b);}while(n);return out;};
const pbString=(field,value)=>{const bytes=Array.from(new TextEncoder().encode(value));return [...pbVarint(field<<3|2),...pbVarint(bytes.length),...bytes];};
const pbMessage=(field,bytes)=>[...pbVarint(field<<3|2),...pbVarint(bytes.length),...bytes];
const adapterBytes=[...pbString(1,'BUPT_01'),...pbString(2,'北京邮电大学本科教务'),...pbVarint(3<<3),...pbVarint(2),...pbString(4,'bupt_01.js'),...pbString(5,'https://jwgl.bupt.edu.cn/jsxsd/'),...pbString(6,'登录后导入个人课表'),...pbString(7,'cstkn')];
const schoolBytes=[...pbString(1,'BUPT'),...pbString(2,'北京邮电大学'),...pbString(3,'B'),...pbString(4,'BUPT'),...pbMessage(5,adapterBytes)];
const indexBytes=Uint8Array.from([...pbVarint(1<<3),...pbVarint(2),...pbString(2,'20260914'),...pbMessage(3,schoolBytes)]);
const schoolIndex=M.decodeSchoolIndex(indexBytes);
const bundledIndexFile=new URL('../public/plugins/shiguang-schedule/school_index.pb',import.meta.url);
assert.ok(fs.existsSync(bundledIndexFile),'missing bundled offline school index');
assert.equal(schoolIndex.protocolVersion,2);
assert.equal(schoolIndex.schools[0].name,'北京邮电大学');
assert.equal(schoolIndex.schools[0].adapters[0].category,'BACHELOR_AND_ASSOCIATE');
assert.equal(schoolIndex.schools[0].adapters[0].importUrl,'https://jwgl.bupt.edu.cn/jsxsd/');
assert.equal(M.filterSchools(schoolIndex.schools,'BACHELOR_AND_ASSOCIATE','北京')[0].id,'BUPT');
assert.equal(M.filterSchools(schoolIndex.schools,'BACHELOR_AND_ASSOCIATE','B')[0].id,'BUPT');
assert.equal(M.filterSchools(schoolIndex.schools,'POSTGRADUATE','').length,0);
const bundledIndex=M.decodeSchoolIndex(fs.readFileSync(bundledIndexFile));
assert.equal(bundledIndex.protocolVersion,2);
assert.ok(bundledIndex.schools.length>=200,`bundled school index unexpectedly small: ${bundledIndex.schools.length}`);
assert.ok(bundledIndex.schools.some(s=>s.name==='北京邮电大学'),'bundled school index missing 北京邮电大学');
console.log('PASS: original Shiguang protocol-v2 school index can be decoded');
const bridged=M.applySchoolImportMessage(eduBase,'saveImportedCourses',{coursesJsonString:JSON.stringify([{name:'在线导入课程',teacher:'桥接教师',position:'桥接教室',day:2,startSection:3,endSection:4,weeks:[1,2,3]}])});
assert.equal(bridged.courses.length,1);
assert.equal(bridged.courses[0].name,'在线导入课程');
assert.equal(bridged.courses[0].teacher,'桥接教师');
console.log('PASS: original Shiguang adapter course bridge imports into current table');
const configured=M.applySchoolImportMessage(bridged,'saveCourseConfig',{configJsonString:JSON.stringify({semesterStartDate:'2026-09-07',semesterTotalWeeks:18,firstDayOfWeek:1})});
assert.equal(configured.config.semesterTotalWeeks,18);
assert.equal(configured.config.semesterStartDate,'2026-09-07');
const slotted=M.applySchoolImportMessage(configured,'savePresetTimeSlots',{timeSlotsJsonString:JSON.stringify([
  {number:1,startTime:'08:10',endTime:'08:55'},{number:2,startTime:'09:05',endTime:'09:50'},
  {number:3,startTime:'10:10',endTime:'10:55'},{number:4,startTime:'11:05',endTime:'11:50'},
])});
assert.equal(slotted.timeSlots[0].startTime,'08:10');
assert.equal(slotted.timeSlots[3].endTime,'11:50');

const cppuSchool=schoolIndex.schools.find(s=>s.id==='CPPU');
assert.ok(cppuSchool,'decoded school index must always include the built-in CPPU adapter');
assert.equal(cppuSchool.adapters[0].importUrl,'https://jw.cppu.edu.cn/index.html');
assert.equal(M.filterSchools(schoolIndex.schools,'BACHELOR_AND_ASSOCIATE','警察大学')[0].id,'CPPU');
const cppuAdapterFile=new URL('../../vendor/shiguangschedule/shared/assets/offline_repo/schools/resources/CPPU/cppu.js',import.meta.url);
const cppuAdapterSource=fs.readFileSync(cppuAdapterFile,'utf8');
const cppuWindow={__CPPU_ADAPTER_TEST__:true};
vm.runInContext(cppuAdapterSource,vm.createContext({window:cppuWindow,console,setTimeout,clearTimeout,Date,Promise}));
const cppuConverted=cppuWindow.CPPUCourseAdapter.convertRows([
  {KC_ID:'course-a',KCMC:'公安学基础',JS:'张老师',DDMC:'A101',JC:'01',KXXS:'2',SKRQ:'2026-08-31',XNXQ_CODE:'20262027-1'},
  {KC_ID:'course-a',KCMC:'公安学基础',JS:'张老师',DDMC:'A101',JC:'01',KXXS:'2',SKRQ:'2026-09-14',XNXQ_CODE:'20262027-1'},
  {KC_ID:'course-a',KCMC:'公安学基础',JS:'张老师',DDMC:'A101',JC:'01',KXXS:'2',SKRQ:'2026-09-14',XNXQ_CODE:'20262027-1'},
  {KC_ID:'course-b',KCMC:'刑事科学技术',JS:'李老师',DDMC:'B202',JC:'03@04',KXXS:'4',SKRQ:'2026-09-01',XNXQ_CODE:'20262027-1'},
]);
assert.equal(cppuConverted.config.semesterStartDate,'2026-08-31');
assert.equal(cppuConverted.config.semesterTotalWeeks,20);
assert.equal(cppuConverted.courses.length,2);
assert.deepEqual(Array.from(cppuConverted.courses.find(c=>c.name==='公安学基础').weeks),[1,3]);
assert.equal(cppuConverted.courses.find(c=>c.name==='公安学基础').day,1);
assert.equal(cppuConverted.courses.find(c=>c.name==='刑事科学技术').startSection,5);
assert.equal(cppuConverted.courses.find(c=>c.name==='刑事科学技术').endSection,8);
assert.match(cppuAdapterSource,/V_JWBZK_PK_XSKBZHCX/);
assert.match(cppuAdapterSource,/limit:\s*5000/);
assert.match(ui,/adapters\/cppu\.js/,'embedded schedule must load the bundled CPPU adapter locally');
const nativeSchoolRepository=fs.readFileSync(new URL('../../vendor/shiguangschedule/shared/src/commonMain/kotlin/com/xingheyuzhuan/shiguangschedule/data/repository/SchoolRepository.kt',import.meta.url),'utf8');
const nativeResourceInitializer=fs.readFileSync(new URL('../../vendor/shiguangschedule/shared/src/commonMain/kotlin/com/xingheyuzhuan/shiguangschedule/tool/ResourceInitializerManager.kt',import.meta.url),'utf8');
assert.match(nativeSchoolRepository,/id = "CPPU"/);
assert.match(nativeResourceInitializer,/schools\/resources\/CPPU\/cppu\.js/,'existing native installations must receive the bundled CPPU adapter');
console.log('PASS: CPPU is built in and its real JE course rows convert dates, block sections and duplicate occurrences correctly');

/* ── v0.33.0 一、彩色课程块开关（「我的 → 个性化配置」里的滑块） ── */
const styleDefaults = ui.match(/const defaultStyle=\{([^}]*)\}/)?.[1] || '';
assert.match(styleDefaults, /colorful:false/, '彩色开关默认必须关：不能悄悄改掉所有老用户的观感');
assert.match(ui, /switchRow\('彩色课程块'/, '个性化配置里缺少彩色滑块');
assert.match(ui, /name="\$\{name\}"/, '滑块必须真的渲染出带 name 的 checkbox，否则保存时读不到值');
assert.match(ui, /style\.colorful\?'colorful':''/, '彩色开关必须落到 .sg 的类名上，否则 CSS 不生效');
assert.match(ui, /colorful:!!f\.colorful\?\.checked/, '即时生效时必须一并写入 colorful，否则滑块点了白点');
assert.match(ui, /switch-row/, '个性化配置的开关要用滑块样式，不能退回原生 checkbox');

/* ── v0.42.0 个性化配置即时生效：删除「保存样式」按钮 ──
   原来要拖完滑块再点「保存样式」才落库；现在 input/change 直接 liveStyle：
   更新 style → 改 .sg 的 CSS 变量与类名（不整页重绘，拖滑块不打断）→ 自动持久化。 */
assert.ok(!ui.includes('保存样式'), '「保存样式」按钮必须删除（改动即时生效，无需手动保存）');
assert.match(ui, /function liveStyle\(form,saveNow\)/, '必须有 liveStyle：读表单 → 改 CSS 变量/类名 → 持久化');
assert.match(ui, /sg\.classList\.toggle\('colorful',!!style\.colorful\)/, '即时生效必须连 .sg 的类名一起改，否则彩色/隐藏开关要等重绘才生效');
assert.match(ui, /if\(sf\)liveStyle\(sf,false\);/, '拖动滑块（input 事件）必须实时应用并走 400ms 防抖落库');
assert.match(ui, /if\(sf\)\{liveStyle\(sf,true\);return;\}/, '开关切换（change 事件）必须立即落库');
assert.match(ui, /styleSaveTimer=setTimeout\(\(\)=>tide\.storage\.set\('style',style\)\.catch\(\(\)=>\{\}\),400\)/, '滑块拖动期间持久化要防抖，不能每个 tick 写一次存储');
assert.match(ui, /if\(form\.dataset\.form==='style'\)return;/, '样式表单不得再走 submit 流程（旧「保存样式」提交分支已删）');
assert.match(ui, /case 'style-reset':clearTimeout\(styleSaveTimer\);/, '恢复默认必须先清掉挂起的防抖保存，防止旧值覆盖重置结果');
assert.ok(!/mode='settings';paint\(\);tide\.notify\(style\.colorful/.test(ui), '旧的「保存后跳回设置页+通知」流程应已删除');

// 彩色调色板：每档都必须是「浅色文字压得住」的实色。
// 这套色刻意不跟随主题 —— 深色模式下主题强调色会被提亮，白字压上去只剩 2.4:1。
const paletteLines = ui.split('\n').filter((l) => l.includes(':is(.sg.colorful') && l.includes('--course-accent:#') && l.includes('--course-on:#'));
assert.equal(paletteLines.length, 8, `彩色模式应有 8 档色调，实际 ${paletteLines.length}`);
for (const line of paletteLines) {
  const m = line.match(/--course-accent:(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6});--course-on:(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6})/);
  assert.ok(m, `彩色色调缺少 accent/on 配对：${line.trim().slice(0, 80)}`);
  const ratio = contrastRatio(m[1], m[2]);
  assert.ok(ratio >= 4.5, `彩色色调 ${m[1]} 上的文字只有 ${ratio.toFixed(2)}:1，未达 WCAG AA 4.5:1`);
  assert.ok(['#fff', '#ffffff'].includes(m[2].toLowerCase()), '彩色模式的文字色应统一为白色，混用会让对比度不受控');
}

const fx = uiContext.fixture;
assert.equal(typeof fx.tone, 'function', 'fixture 没拿到 tone，说明 ui.js 的结构变了');
fx.setStyle({ colorful: false });
assert.equal(fx.tone({ name: '数字电子技术', color: 0 }), 0, '非彩色模式下未调色的课仍是 tone-0，保持 v0.32 的观感');
assert.equal(fx.tone({ name: '数字电子技术', color: 3 }), 3, '手动选过的颜色任何模式下都不该被覆盖');
fx.setStyle({ colorful: true });
const toneNames = ['数字电子技术', '模拟电子技术', '线性代数A', '马克思主义基本原理', 'C语言程序设计A', '复变函数与积分变换', '智慧消防专业英语', '多旋翼无人机组装与调试', '反邪教研究', '机器人操控基础'];
const tones = toneNames.map((n) => fx.tone({ name: n, color: 0 }));
assert.ok(new Set(tones).size >= 5, `彩色模式下导入的课表应散到多个色调，实际只有 ${new Set(tones).size} 种`);
assert.equal(fx.tone({ name: '数字电子技术', color: 0 }), fx.tone({ name: '数字电子技术', color: 0 }), '同一门课的颜色必须稳定');
for (const t of tones) assert.ok(Number.isInteger(t) && t >= 0 && t < 8, `色调越界：${t}`);
assert.equal(fx.tone({ name: '线性代数A', color: 6 }), 6, '彩色模式下手动颜色仍然优先');
console.log('PASS: colorful course blocks — switch, name-hashed palette, all 8 tones pass WCAG AA');

/* ── v0.38.2 三、「我的」设置条目加图标 ── */
// 图标引用打包内的 FA solid 精灵。`<use>` 指到不存在的 symbol 是**静默空白**
// （不抛错、不触发 onerror、console 也没提示），所以每个图标名都要拿回精灵核对。
const itemActions = [...ui.matchAll(/<button class="settings-item" data-action="([a-z]+)">/g)].map((m) => m[1]);
const setIcoNames = [...ui.matchAll(/setIco\('([a-z0-9-]+)'\)/g)].map((m) => m[1]);
assert.equal(itemActions.length, 7, `「我的」应有 7 个设置条目，实际 ${itemActions.length}`);
assert.equal(setIcoNames.length, 7, `7 个条目必须各带一个图标，实际只有 ${setIcoNames.length} 个`);
assert.equal(new Set(setIcoNames).size, 7, `图标不能重复使用：${setIcoNames.join(', ')}`);
const spriteSource = fs.readFileSync(new URL('../public/icons/fontawesome/solid.svg', import.meta.url), 'utf8');
const spriteIds = new Set([...spriteSource.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map((m) => m[1]));
for (const name of setIcoNames) assert.ok(spriteIds.has(name), `精灵里没有 ${name} 这个 symbol，图标会静默空白`);
assert.ok(ui.includes('href="/icons/fontawesome/solid.svg#${name}"'), '图标要用「根绝对路径」引用精灵；相对路径在插件视图里会 404');
assert.ok(!ui.includes('href="icons/fontawesome'), '图标不能写相对路径（插件视图的基地址不是站点根）');
// 布局：条目原先是「文字 + ›」两段，加图标变三段 —— justify-content:space-between 会把
// 中间那段挤到正中，必须改 flex-start 并让文字块 flex:1 吃掉余量，› 才回到右端。
assert.match(ui, /\.sg \.settings-item\{justify-content:flex-start;gap:12px\}/, '加图标后条目要改 flex-start，否则文字块被挤到正中');
assert.match(ui, /\.sg \.settings-item>div\{flex:1;min-width:0\}/, '文字块要吃满余量，右端 › 才贴边');
const icoRule = ui.match(/\.sg \.settings-item>\.set-ico\{([^}]*)\}/)?.[1] || '';
assert.match(icoRule, /width:32px;height:32px/, '图标盒子要有固定尺寸，否则被文字挤扁');
assert.match(icoRule, /fill:currentColor/, '精灵 symbol 不带 fill 属性，不给 currentColor 会渲染成纯黑');
assert.match(icoRule, /var\(--sg-accent\)/, '图标配色要跟随主题变量');
assert.ok(!/#[0-9a-fA-F]{3,6}/.test(icoRule), '图标配色不许硬编码色值（深色模式下会糊）');
assert.ok(ui.includes('const setIco=name=>'), '图标助手缺失，说明 settingsContent 里是硬写的 svg');
console.log('PASS: 「我的」7 个设置条目各带一个主题色图标，图标名全部命中 FA 精灵');

/* ── v0.39.0 一、插件二级页顶栏：返回与标题并成一行 ── */
// 原来是「返回独占一整行（min-height:38px）+ 12px 外边距 → 标题另起一行再吃 4px」，
// 叠上 .plugview 20px 与 .sg 20px 的内边距，正文得从约 136px 处才开始，顶上一大片空白。
// 断言钉**渲染出来的结构**，不是源码里有没有某个字符串 —— 只查字符串会被注释命中。
const headCount = (html) => [...html.matchAll(/class="screen-head/g)].length;
const subHeadHtml = fx.subHead('个性化配置');
assert.equal(headCount(subHeadHtml), 1, `subHead 只能渲染一个顶栏，实际 ${headCount(subHeadHtml)} 个`);
assert.match(subHeadHtml, /class="screen-head sub-head"/, '顶栏必须带 sub-head 修饰类，返回按钮与标题才会排成一行');
// 关键结构断言：从顶栏开头到 <h2> 之间不能出现 </div>。
// 只要退回「返回单个 div + 标题另一个 div」的写法，这段里就会冒出 </div> 而变红。
const beforeTitle = subHeadHtml.slice(0, subHeadHtml.indexOf('<h2'));
assert.ok(subHeadHtml.includes('data-action="back"'), '默认返回必须走历史栈弹出（v0.41.1 前「编辑课程」写死回「我的」设置页，从课程管理进来返回落错页）');
assert.ok(beforeTitle.includes('‹ 返回'), '返回按钮必须在标题之前');
assert.ok(!beforeTitle.includes('</div>'), '返回按钮与标题必须同处一个顶栏容器，不能各占一个块级 div');
assert.equal([...subHeadHtml.matchAll(/<h2>/g)].length, 1, '标题只能有一个');
assert.ok(!subHeadHtml.includes('back-row'), 'subHead 不能再输出独立的返回行');
// 带副标题 / 自定义返回目标 / 自定义返回文案的调用（选择学校、适配器列表）也要走同一套
const subWithSub = fx.subHead('选择学校', 'back', '官方适配索引 · 42 所学校/工具');
assert.match(subWithSub, /data-action="back"/, '自定义返回目标要落到 data-action');
assert.match(subWithSub, /官方适配索引 · 42 所学校\/工具/, '副标题要渲染出来');
assert.equal(headCount(subWithSub), 1, '带副标题时也只能有一个顶栏');
assert.ok(!subWithSub.slice(0, subWithSub.indexOf('<h2')).includes('</div>'), '带副标题时返回按钮与标题仍须同行');
assert.ok(fx.subHead('备份与恢复', 'back', '', '‹ 返回学校列表').includes('‹ 返回学校列表'), '返回按钮的文案可以自定义');
// 源码层：旧的返回行标记与样式块要一并清干净，别留死规则
assert.ok(!ui.includes('back-row'), 'back-row 已废弃（返回行不再独占一行），源码里不该再有它的标记或样式');
// .sub-head 压的是 .screen-head 的 justify-content / margin，同特异性靠后生效，必须写在它之后
const headAt = ui.indexOf('.sg .screen-head{');
const subHeadAt = ui.indexOf('.sg .sub-head{');
assert.ok(headAt > -1 && subHeadAt > headAt, '.sub-head 必须写在 .screen-head 之后，否则同特异性下压不住 space-between');
const subHeadRule = ui.match(/\.sg \.sub-head\{([^}]*)\}/)?.[1] || '';
assert.match(subHeadRule, /justify-content:flex-start/, 'sub-head 要把 space-between 改成 flex-start，否则标题会被顶到右端');
console.log('PASS: plugin sub-page headers put 「‹ 返回」 and the title on one row');

/* ── v0.41.1 二级页返回改历史栈：返回 = 回到来时的那一页 ──
   subHead 的 backTo 原先是写死的目标页（编辑课程默认 'settings'），
   「课程管理 → 编辑课程 → 返回」会落到「我的」设置页。现在进子页压栈、返回弹栈。 */
assert.match(ui, /function enterMode\(next\)\{if\(!MAIN_MODES\.has\(next\)&&next!==mode\)\{modeStack\.push\(mode\)/, '进子页必须压入当前页（主视图 week/today 不压栈）');
assert.match(ui, /case 'back':mode=modeStack\.pop\(\)\|\|'week';break;/, '必须有 back 动作：弹出栈顶，栈空回周视图');
assert.match(ui, /case 'week':case 'today':case 'settings':case 'config':case 'transfer':case 'edu':case 'courses':case 'tables':case 'style':case 'week-picker':enterMode\(a\);break;/, '菜单切子页必须走 enterMode 压栈');
assert.match(ui, /color:0,remark:''\};enterMode\('edit'\);break;/, '「添加课程」必须压栈后再进编辑页');
assert.match(ui, /enterMode\('edit'\);paint\(\);/, '「课程管理 → 点课程编辑」也必须压栈');
assert.match(ui, /enterMode\('schools'\);await loadSchoolIndex\(\);/, '「选择学校」必须压栈');
assert.match(ui, /enterMode\('adapters'\);break;/, '「选择适配器」必须压栈');
assert.match(ui, /if\(modeStack\.length>24\)modeStack\.shift\(\);/, '栈要有上限，防长会话无限增长');
assert.ok(!/subHead\([^)]*'(?:settings|edu|school-list)'/.test(ui), 'subHead 调用不得再写死返回目标页');
console.log('PASS: 二级页返回走历史栈（课程管理→编辑→返回回到课程管理，不再落错页）');

/* ── v0.33.0 二、课表界面滚轮上下滑动 ── */
// .schedule-frame 是横向滚动容器。整份 overscroll-behavior:contain 会把纵向滚轮也吃掉，
// 鼠标停在课表上时外层 .plugview 一点都滚不动 —— 只能约束 x，纵向必须允许串联。
assert.ok(ui.includes('overscroll-behavior-x:contain'), '课表容器必须保留横向不串联');
assert.ok(!ui.includes('overscroll-behavior:contain'), '不能再用整份 overscroll-behavior:contain：纵向滚轮会被吃掉，课表界面上滚不动');
console.log('PASS: schedule view no longer swallows the vertical wheel');

/* ── v0.39.0 二、手机上课表不再被「剩余空间」压扁 ── */
// 原先 ≤900px 把 .main-stage 的 min-height 写成 0，课表只能吃到顶栏与底部导航之间的
// 剩余空间：390×844 实测行高只有 55.6px，而用户设定的 --sg-slot-height 是 76px。
// 改成按「表头 + 全部节次 × 格子高度」算出下限后，行高回到 69.6px、课表长 736px
// （放不下时由外层 .plugview 正常滚动）。
assert.match(ui, /@media\(max-width:900px\)[\s\S]*?\.sg \.main-stage\{min-height:calc\(/,
  '窄屏 .main-stage 必须按节次数 × 格子高度给下限，不能压成 0（会把课表挤扁）');
assert.ok(!/@media\(max-width:900px\)\{[\s\S]*?\.sg \.main-stage\{min-height:0\}/.test(ui),
  '不能再把窄屏 .main-stage 的 min-height 写成 0');
// 提示行已删：连同它的两条样式规则一起清掉，别留死代码
assert.ok(!ui.includes('schedule-note'), '「左右滑动切换周次…」提示行已按用户要求删除，不应残留标记或样式');
console.log('PASS: 手机课表按用户设定的格子高度拉长，操作提示行已移除');

/* ── v0.39.0 三、课程块不再有左侧强调色竖边 ── */
// 用户截图（16×85 的暗色窄条）指着课程块左边那条 3px 实色强调边：
// 深色模式下它悬在近黑底上，看起来像一圈「小发光边」。按用户要求整个删掉。
// 色调识别不受影响：还有 --course-bg 底色（强调色 18~22% 混入）和四周 1px 描边
// （强调色 35% 混入）。彩色（实色卡）模式本来就不靠这条边，不受影响。
// 断言钉源码字符串（这三条规则只在 styles() 模板里出现一次，无重影锚点）：
assert.ok(!ui.includes('border-left:3px solid var(--course-accent)'),
  '课程块 / 样式预览 demo 的 3px 左强调边必须删掉（深色模式下像发光边）');
assert.ok(!ui.includes('border-left:4px solid var(--course-accent)'),
  '今日卡片的 4px 左强调边必须删掉');
assert.ok(!ui.includes('border-left-width:2px'),
  '窄屏给左强调边配套的 border-left-width:2px 覆盖是死规则，要一并清掉');
// 底色和描边必须还在，否则课程块失去色调区分
assert.match(ui, /\.sg \.course-block\{[^}]*border:1px solid color-mix\(in srgb,var\(--course-accent\) 35%,var\(--sg-line\)\)[^}]*background:var\(--course-bg\)/,
  '课程块必须保留 1px 强调色描边 + --course-bg 底色（删竖边后色调还得看得出来）');
assert.match(ui, /\.sg \.today-card\{[^}]*background:var\(--course-bg\)/,
  '今日卡片必须保留 --course-bg 底色');
console.log('PASS: 课程块/今日卡片的左侧强调色竖边已删除，色调仍由底色+描边承担');

/* ── v0.33.0 三、生成物同步守卫（改了源忘了重建 main.js 是最容易漏的一步） ── */
const buildCheck = spawnSync(process.execPath, [fileURLToPath(new URL('../../tools/build-schedule-plugin.js', import.meta.url)), '--check'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' });
assert.equal(buildCheck.status, 0, `main.js 与 model.js + ui.js 不同步：\n${buildCheck.stdout || ''}${buildCheck.stderr || ''}`);
const manifest = JSON.parse(fs.readFileSync(new URL('../public/plugins/shiguang-schedule/manifest.json', import.meta.url), 'utf8'));
const catalogBlock = fs.readFileSync(new URL('../src/pluginCatalog.js', import.meta.url), 'utf8').split('"id": "shiguang-schedule"')[1].slice(0, 400);
assert.ok(catalogBlock.includes(`"version": "${manifest.version}"`), 'pluginCatalog 必须同步插件版本号（改完 manifest 要跑 tools/sync-plugins.js）');
assert.match(manifest.description, /彩色课程块/, 'manifest 描述要提到彩色课程块');
console.log('PASS: shiguang-schedule/main.js is regenerated from model.js + ui.js and catalog version matches');

/* ── v0.42.0 一、当前周标签：必须能区分「本周」与「非本周」 ──
   用户需求原文：「添加当前周标签，可以让我判断哪个是现在这周」。
   关键是**两种状态都要有标记** —— 只标「是本周」的话，「不是本周」就变成
   要用户自己推断的默认态，等于没回答「现在这周是哪一周」。 */
assert.match(ui, /function realWeek\(\)/, '要有 realWeek()：保留未夹取的真实周次，用来判断是否本周');
assert.match(ui, /function hasNow\(\)/, '要有 hasNow()：判断当前日期是否落在学期范围内');
assert.match(ui, /function weekLabel\(\)/, '要有 weekLabel()：顶栏「本周 · 第 N 周 / 共 M 周」进度文案');
// realWeek 与 currentWeek 的分工：一个保留原值、一个夹取到合法范围。
// 若两者合一，开学前打开会把第 1 周误标成「本周」。
assert.match(ui, /function currentWeek\(\)\{return Math\.max\(1,Math\.min\(/,
  'currentWeek() 必须把周次夹取到 1..总周数（决定默认显示哪一周）');
assert.match(ui, /function realWeek\(\)\{return M\.weekOf\(/, 'realWeek() 不能用 currentWeek() 的夹取逻辑');
assert.match(ui, /<span class="now-tag">本周<\/span>/, '顶栏本周态要渲染 .now-tag 标签');
assert.match(ui, /<span class="now-tag off">非本周<\/span>/, '顶栏非本周态也要有标签（不能只标本周）');
assert.match(ui, /now&&!atNow\?button\('回到本周'/,
  '「回到本周」只在偏离当前周时出现（常态下不占位）');
// 窄屏把整词收成一个圆点：它必须始终可见，所以不能直接 display:none
assert.match(ui, /@media\(max-width:620px\)\{[\s\S]*?\.sg \.now-tag\{padding:0;width:16px;height:16px/,
  '窄屏「本周」标签收成圆点，而不是隐藏');
console.log('PASS: 当前周标签 —— 本周/非本周两态都有标记，窄屏收成圆点且不消失');

/* ── v0.42.0 二、切周动画 ──
   用户需求原文：「切换周时做好动画」。
   两个坑：① 动画层不能加在 .schedule-frame 上（overflow:auto 滚动容器一旦有 transform，
   内部 position:sticky 的表头会失锚）；② 方向要区分前后翻。 */
assert.match(ui, /let slideDir=0/, '要有 slideDir 状态记录切周方向');
assert.match(ui, /function gotoWeek\(target\)/, '切周统一走 gotoWeek()，由它算方向');
assert.match(ui, /if\(next!==week\)slideDir=next>week\?1:-1/,
  '只在真的换了周时才设方向（重复点同一周不该闪）');
assert.match(ui, /async function action\(a,source\)\{clearError\(\);slideDir=0;switch\(a\)\{/,
  '每次 action 开头重置 slideDir，否则普通重绘也会莫名滑动');
assert.match(ui, /function animateWeek\(\)/, '要有 animateWeek() 补动画类');
assert.match(ui, /<div class="week-anim" data-week-anim>/, '周视图必须把课表包进 .week-anim');
assert.match(ui, /\.sg \.week-anim\{flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden\}/,
  '.week-anim 要 flex 撑开 + overflow:hidden（否则横向滑动会出滚动条）');
assert.match(ui, /@keyframes sg-week-in\{from\{opacity:\.25;transform:translateX\(calc\(var\(--sg-slide,1\) \* 42px\)\)\}/,
  '滑入关键帧要用 --sg-slide 控制方向');
assert.match(ui, /slideDir<0\?'anim-back':'anim-fwd'/, '往回翻与往后翻要用不同的动画类');
assert.match(ui, /animationend[\s\S]{0,160}classList\.remove\('anim-in','anim-back','anim-fwd'\)/,
  'animationend 要摘掉动画类，否则下次重绘不会重播');
// 回归守卫：动画绝不能加到滚动容器 .schedule-frame 上
assert.doesNotMatch(ui, /\.sg \.schedule-frame\{[^}]*animation:/,
  '.schedule-frame 是 overflow:auto 容器，加 animation/transform 会让 sticky 表头失锚');
assert.doesNotMatch(ui, /\.sg \.schedule-frame\{[^}]*transform:/,
  '.schedule-frame 不能有 transform（会让内部 sticky 失效）');
console.log('PASS: 切周动画 —— 动画层独立于滚动容器，方向可辨且不重播失效');

/* ── v0.42.0 三、总学期视图 ──
   用户需求原文：「做一个总学期视图，可以看到所有周」。
   它同时顶替了旧的「选择周次」纯按钮页（20 个按钮既占地方又看不出分布）。 */
assert.match(ui, /function semesterOverview|function weekPickerContent\(\)\{[\s\S]*?semester-wrap/,
  '总学期视图要渲染 .semester-wrap');
assert.match(ui, /function semCard\(w,sem\)/, '每周一张 semCard');
assert.match(ui, /function semBar\(c,sem\)/, '周卡内用 semBar 画课程条');
assert.match(ui, /function semBounds\(\)/, '要有 semBounds() 把全天时间轴压进卡片高度');
assert.match(ui, /class="sem-card \$\{isCur\?'on':''\} \$\{isNow\?'is-now':''\}/,
  '周卡要同时带「当前查看 on」与「本周 is-now」两个独立标记');
assert.match(ui, /const isNow=r===w,isCur=w===week;/, '两个标记分别比对真实本周与当前查看周');
// 纵向映射用百分比，才能让不同周的同一节课位置一致、可横向比对
assert.match(ui, /const top=\(\(sem\.minM-M\.minutes\(c\.start\)\)\/\(sem\.spanM\|\|1\)\)\*100/,
  '课程条的 top 要用百分比（跨周可比对）');
assert.match(ui, /const height=Math\.max\(5,h-1\.4\);/, '课程条要保底高度，否则半节课看不见');
assert.match(ui, /\.sg \.sem-mini\{position:relative;display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/,
  '迷你周条是 7 列网格（周一到周日）');
assert.match(ui, /\.sg \.sem-mini\{[^}]*overflow:hidden\}/,
  '.sem-mini 必须 overflow:hidden，否则超出 100% 的条会画到卡片外');
assert.match(ui, /data-action="pick-week" data-week="\$\{w\}"/, '点周卡即跳转到该周');
assert.match(ui, /<div class="sem-legend">/, '总学期视图要有图例解释两种描边');
// 学期外不该假装有本周
assert.match(ui, /当前日期不在本学期范围内/, '日期在学期外时要如实说明没有本周标记');
console.log('PASS: 总学期视图 —— 20 周总览、迷你课条、本周/当前双标记与图例');
