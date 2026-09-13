import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const ctx=vm.createContext({TextEncoder});vm.runInContext(fs.readFileSync(new URL('../public/plugins/shiguang-schedule/model.js',import.meta.url),'utf8'),ctx);const M=ctx.ShiguangModel;
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
vm.runInContext(ui.replace(' tide.ui.registerView({',' globalThis.fixture={set:(t,w)=>{table=t;week=w;},blocks};\n tide.ui.registerView({'),uiContext);
uiContext.fixture.set(table,1);await uiContext.fixture.blocks();assert.equal(savedBlocks.length,1);await uiContext.fixture.blocks();assert.equal(savedBlocks.length,1);
savedBlocks.length=0;savedBlocks.push({id:'existing',date:'2026-09-07',title:'existing',start:'08:30',durMin:30});await assert.rejects(uiContext.fixture.blocks(),/冲突/);assert.equal(savedBlocks.length,1);
console.log('PASS: time-block idempotence and conflict leaves existing schedule unchanged');
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
const merged=M.mergeTables(edu1.table,edu1.table);assert.equal(merged.courses.length,2);
console.log('PASS: academic-system TSV/CSV imports, combined weekday/week/section cells, odd/even weeks, custom time and dedup merge');
