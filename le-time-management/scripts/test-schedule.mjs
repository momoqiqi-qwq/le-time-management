import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { spreadsheetFileToCsv } from '../src/spreadsheet.js';
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
vm.runInContext(ui.replace(' tide.ui.registerView({',' globalThis.fixture={set:(t,w)=>{table=t;week=w;},blocks};\n tide.ui.registerView({'),uiContext);
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
