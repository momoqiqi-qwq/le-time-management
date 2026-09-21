// 实际 CommonJS 模块 + mock wx；不联网、不接触真实用户存储。
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), vm = require("vm");
const { createRequire } = require("module");
const ROOT = path.resolve(__dirname,"..");
const RealDate = Date; let clock = new RealDate(2026,8,20,10).getTime();
global.Date = class extends RealDate { constructor(...args){super(...(args.length?args:[clock]));} static now(){return clock;} };
const mem = new Map(), disk = new Map(), toasts = [], modals = [], calls = [];
let failBefore = null, failAfter = null, requestHandler = null, lastModal = null, lastSheet = null;
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
global.wx = {
  env:{USER_DATA_PATH:"/mock-user"},
  getStorageSync:key=>clone(mem.get(key)),
  setStorageSync(key,value){if(failBefore&&failBefore(key,value))throw new Error("mock quota");mem.set(key,clone(value));if(failAfter&&failAfter(key,value))throw new Error("mock post-commit failure");},
  removeStorageSync:key=>mem.delete(key),
  getStorageInfoSync:()=>({currentSize:5,limitSize:10240,keys:[...mem.keys()]}),
  showToast:o=>toasts.push(o),showModal:o=>{lastModal=o;modals.push(o);},showActionSheet:o=>{lastSheet=o;},
  setNavigationBarTitle(){},vibrateShort(){},pageScrollTo(){},stopPullDownRefresh(){},
  navigateTo:o=>calls.push(["navigate",o.url]),redirectTo:o=>calls.push(["redirect",o.url]),switchTab:o=>calls.push(["tab",o.url]),navigateBack(){},
  setClipboardData:o=>{calls.push(["clipboard",o.data]);o.success&&o.success({});},
  request:o=>{calls.push(["request",o.url,o.method]);if(!requestHandler)throw new Error("测试禁止意外联网");return requestHandler(o);},
  getFileSystemManager:()=>({
    writeFile:o=>{disk.set(o.filePath,o.data);o.success&&o.success({});},
    readFile:o=>{if(disk.has(o.filePath))o.success({data:disk.get(o.filePath)});else o.fail({errMsg:"missing fixture"});},
    unlink:o=>{disk.delete(o.filePath);o.success&&o.success({});},
  }),
  previewImage:o=>calls.push(["preview",o.urls]),shareFileMessage:o=>{calls.push(["share",o.fileName]);o.success({});},
};
const S = require("../core/store.js"), storage = require("../core/storage.js"), T = require("../core/transfer.js");
const F = require("../core/captureFlow.js"), U = require("../core/undo.js"), C = require("../core/schedule.js");
const L = require("../core/library.js"), R = require("../core/rssModel.js"), LAN = require("../core/lanSync.js"), media = require("../core/media.js");
const routes = require("../core/pluginRoutes.js");
const app = { globalData:{} };
let checks = 0; const mounted = [];
function test(name,fn){return Promise.resolve().then(fn).then(()=>{checks++;console.log("  ✓ "+name);});}
function reset(){mounted.splice(0).forEach(p=>p.onUnload&&p.onUnload());U.clear();mem.clear();failBefore=failAfter=null;requestHandler=null;lastModal=lastSheet=null;S.initStore(S.seed());}
function task(patch){return S.addTask(Object.assign({title:"测试任务",quad:1},patch));}
function event(id,value,extra){return{currentTarget:{dataset:Object.assign({id},extra)},detail:{value},touches:[{clientX:100,clientY:100}],changedTouches:[{clientX:100,clientY:100}],target:{dataset:{}}};}
function page(name,options={}){
  const file=path.join(ROOT,"pages",name,"index.js"), req=createRequire(file);let def;
  vm.runInNewContext(fs.readFileSync(file,"utf8"),{require:req,Page:x=>{def=x;},wx:global.wx,getApp:()=>app,module:{exports:{}},console,Date:global.Date,setTimeout,clearTimeout,setInterval,clearInterval},{filename:file});
  const p=Object.assign({},def,{data:clone(def.data)});
  p.setData=function(patch,done){for(const[k,v]of Object.entries(patch)){const parts=k.replace(/\[(\d+)\]/g,".$1").split(".");let node=this.data;for(const part of parts.slice(0,-1)){if(node[part]==null)node[part]={};node=node[part];}node[parts[parts.length-1]]=clone(v);}if(done)done();};
  mounted.push(p);p.onLoad&&p.onLoad(options);return p;
}
async function main(){
  await test("空种子、旧键只读迁移、跨端额外字段保留",()=>{
    reset();assert.equal(S.seed().tasks.length,0);
    const old=Object.assign(S.seed(),{tasks:[{id:"legacy",title:"旧任务",quad:2}],customFuture:{keep:true},automation:{rules:[{id:"r"}]}});
    mem.set(storage.LEGACY_KEY,clone(old));S.initStore(S.seed());assert.equal(S.taskById("legacy").title,"旧任务");assert.deepEqual(mem.get(storage.LEGACY_KEY),old);assert.ok(mem.has(storage.KEY));assert.deepEqual(S.getState().customFuture,{keep:true});
  });
  await test("分块快照可读回，头写入失败不替换内存/旧磁盘",()=>{
    reset();task({id:"old"});S.saveNow();const original=S.getState(), saved=clone(mem.get(storage.KEY));
    const next=clone(original);next.tasks[0].note="中文🙂".repeat(160000);
    failBefore=key=>key===storage.KEY;assert.throws(()=>S.commitSnapshot(next),/quota/);assert.equal(S.getState(),original);assert.deepEqual(mem.get(storage.KEY),saved);assert.equal([...mem.keys()].filter(k=>k.includes(":part:")).length,0);
    failBefore=null;S.commitSnapshot(next);assert.ok(mem.get(storage.KEY).count>1);S.initStore(S.seed());assert.equal(S.getState().tasks[0].note,next.tasks[0].note);
  });
  await test("分块中途失败回收临时块；已提交但回执失败可确认提交",()=>{
    reset();task({id:"a"});S.saveNow();const next=clone(S.getState());next.tasks[0].note="字".repeat(storage.CHUNK_CHARS*3);
    let writes=0;failBefore=key=>key.includes(":part:")&&++writes===2;assert.throws(()=>S.commitSnapshot(next));assert.equal([...mem.keys()].filter(k=>k.includes(":part:")).length,0);
    failBefore=null;failAfter=key=>key===storage.KEY;S.commitSnapshot(next);assert.equal(S.getState().tasks[0].note,next.tasks[0].note);failAfter=null;S.initStore(S.seed());assert.equal(S.getState().tasks[0].id,"a");
  });
  await test("损坏分块/未来 schema 进入保护态，不覆写，不导出假空备份",()=>{
    reset();const future=Object.assign(S.seed(),{dataSchemaVersion:9,tasks:[{id:"future",title:"未来",quad:1}]});mem.set(storage.KEY,clone(future));S.initStore(S.seed());assert.ok(S.storageStatus().locked);assert.equal(S.saveNow(),false);assert.deepEqual(mem.get(storage.KEY),future);assert.throws(()=>T.fullBackup("test"),/保护/);
    S.commitSnapshot(S.seed());assert.equal(S.storageStatus().locked,false);
    task({note:"字".repeat(storage.CHUNK_CHARS*2)});S.saveNow();const head=clone(mem.get(storage.KEY));mem.delete(storage.KEY+":part:"+head.generation+":0");S.initStore(S.seed());assert.ok(S.storageStatus().locked);assert.deepEqual(mem.get(storage.KEY),head);
  });
  await test("批量只通知一次、任务改名同步排程、排序与完成分组对齐",()=>{
    reset();let n=0;const off=S.subscribe(()=>n++);S.batchChanges(()=>{task({id:"a",due:"2026-09-22"});task({id:"b",due:"2026-09-21"});task({id:"c",done:true});});assert.equal(n,1);off();
    assert.deepEqual(S.tasksOfQuad(1).map(t=>t.id),["b","a","c"]);S.moveTaskRelative("a","b",true);assert.deepEqual(S.tasksOfQuad(1).map(t=>t.id),["a","b","c"]);assert.equal(S.moveTaskRelative("c","a",true),false);S.moveTaskToQuad("a",2);assert.equal(S.taskById("a").quad,2);
    S.addBlock({id:"linked",taskId:"a"});S.updateTask("a",{title:"新标题"});assert.equal(S.getState().blocks[0].title,"新标题");
  });
  await test("排程先校验，只替换所选日，冲突不删除任何已有安排",()=>{
    reset();const t=task({id:"a",estMin:60});S.placeTask(t,"2026-09-20",600,"study");S.placeTask(t,"2026-09-21",600,"study");
    S.addBlock({date:"2026-09-20",start:"12:00",durMin:60,title:"忙碌"});const before=JSON.stringify(S.getState().blocks);
    assert.throws(()=>S.placeTask(t,"2026-09-20",720),/已有/);assert.equal(JSON.stringify(S.getState().blocks),before);
    assert.throws(()=>S.placeTask(t,"2026-02-31",600),/日期/);assert.throws(()=>S.placeTask(t,"2026-09-20",1430));
    S.placeTask(t,"2026-09-20",800);assert.equal(S.blocksOf("2026-09-21").length,1);assert.equal(S.blocksOf("2026-09-20").filter(b=>b.taskId===t.id).length,1);
  });
  await test("回任务池移除当天完整关联安排，撤销不影响其他日期",()=>{
    reset();const t=task({id:"a"});const b=S.addBlock({date:"2026-09-20",taskId:t.id,start:"09:00"});S.addBlock({date:"2026-09-20",taskId:t.id,start:"11:00"});S.addBlock({date:"2026-09-21",taskId:t.id});
    const restore=S.returnTaskToPool(b.id);assert.equal(S.blocksOf("2026-09-20").length,0);assert.equal(S.blocksOf("2026-09-21").length,1);assert.equal(S.poolOf("2026-09-20").length,1);assert.equal(restore(),true);assert.equal(S.blocksOf("2026-09-20").length,2);assert.equal(restore(),false);
  });
  await test("整批删除可恢复任务+排程，导入后旧撤销失效",()=>{
    reset();task({id:"a",done:true});task({id:"b"});S.addBlock({taskId:"a"});const restore=S.deleteDoneTasksUndoable();assert.equal(S.getState().tasks.length,1);restore();assert.equal(S.getState().blocks.length,1);
    const stale=S.deleteTaskUndoable("a");S.commitSnapshot(S.seed());assert.equal(stale(),false);assert.equal(S.getState().tasks.length,0);
  });
  await test("桌面封装备份、旧原始备份、合并/替换和敏感字段安全校验",()=>{
    reset();task({id:"a",title:"本机",attachments:["data:image/png;base64,YQ=="]});S.getState().settings.keep="local";S.getState().plugins.demo={enabled:false,storage:{token:"fixture-only"}};
    const full=T.fullBackup("test"), parsed=T.parseFullBackup(JSON.stringify(full));assert.equal(parsed.plugins.demo.storage.token,"fixture-only");assert.equal(T.parseFullBackup(parsed).tasks.length,1);
    const incoming=clone(parsed);incoming.tasks[0].title="电脑";incoming.tasks.push({id:"b",title:"新增",quad:2});incoming.settings.keep="incoming";
    T.importBackup(incoming,"merge");assert.equal(S.taskById("a").title,"本机");assert.ok(S.taskById("b"));assert.equal(S.getState().settings.keep,"local");
    T.importBackup(incoming,"replace");assert.equal(S.taskById("a").title,"电脑");
    assert.throws(()=>T.parseFullBackup('{"tasks":[],"blocks":[],"__proto__":{"polluted":true}}'),/不安全/);assert.equal({}.polluted,undefined);
    assert.throws(()=>T.parseFullBackup({tasks:[{id:"a",title:"a",quad:1},{id:"a",title:"b",quad:2}],blocks:[]}),/重复/);
  });
  await test("CSV 引号换行与公式防护，ICS 跨午夜/UTF8 折行",()=>{
    reset();const csv=T.tasksToCsv([{id:"a",title:"=危险公式",quad:2,done:false,note:'逗号,和"引号"\n第二行',estMin:37,tags:["学习"],due:"2026-09-20",dueTime:"09:00"}]);assert.ok(csv.includes("'=危险公式"));
    const parsed=T.parseTasksCsv(csv);assert.equal(parsed.tasks[0].note,'逗号,和"引号"\n第二行');assert.equal(parsed.tasks[0].estMin,37);
    assert.throws(()=>T.parseTasksCsv('title\n"未闭合'),/引号/);
    const ics=T.toIcs([{id:"night",date:"2026-09-20",start:"23:30",durMin:60,title:"课程🙂".repeat(80),cat:"study"}],[]);assert.ok(ics.includes("DTEND:20260921T003000"));assert.ok(ics.split("\r\n").every(line=>Buffer.byteLength(line)<=75));
  });
  await test("捕获保存完整原文、跨天拆分、冲突时不创建孤立任务",()=>{
    reset();const text="明天晚上11点半复习 "+"原文".repeat(150),cap=F.buildCapture(text,new Date(2026,8,20,10));assert.equal(cap.note,text);
    const made=F.createFromCapture(cap,{date:"2026-09-21",start:"23:30",durMin:60,cat:"study"});assert.equal(made.blocksCount,2);assert.equal(S.blocksOf("2026-09-22")[0].start,"00:00");assert.equal(S.blocksOf("2026-09-21")[0].durMin,30);
    const count=S.getState().tasks.length;assert.throws(()=>F.createFromCapture(cap,{date:"2026-09-21",start:"23:45",durMin:30,cat:"study"}),/已有安排/);assert.equal(S.getState().tasks.length,count);
  });
  await test("收件箱创建任务保留结构化日期、来源、图片且不重复",()=>{
    reset();const item=S.addInbox({title:"通知",date:"2026-09-23",time:"13:40",when:"2026-09-23 13:40",sourcePlugin:"inbox-drop",attachments:["data:image/png;base64,YQ=="]});
    const t=S.inboxToTask(item.id);assert.equal(t.due,"2026-09-23");assert.equal(t.dueTime,"13:40");assert.equal(t.attachments.length,1);assert.equal(S.inboxToTask(item.id),null);
  });
  await test("课程表原生模型与桌面模型同源、单双周/多课表/格式互通",()=>{
    reset();const M=C.M;assert.deepEqual(M.weeks("1-8单周",20),[1,3,5,7]);const initial=C.load();assert.equal(C.load().currentId,initial.currentId);
    let table=M.empty("2026-09-14");table.config.semesterTotalWeeks=4;table.courses=[{id:"c1",name:"高数",teacher:"老师",position:"101",day:1,weeks:[1,2,3,4],startSection:1,endSection:2}];C.saveTable(table);
    assert.equal(C.load().table.courses.length,1);const exported=C.exportJson();assert.equal(M.packs(JSON.parse(exported))[0].data.courses[0].name,"高数");
    const preview=C.importPreview("课程名称,星期,周次,节次,教师,地点\n英语,周二,1-4,3-4,李老师,201");assert.equal(preview.count,1);C.applyImport(preview,"append");assert.equal(C.load().tables.length,2);C.renameTable("第二学期");assert.equal(C.load().name,"第二学期");assert.ok(C.exportIcs().includes("BEGIN:VEVENT"));
    C.selectTable(initial.currentId);assert.equal(C.load().table.courses[0].name,"高数");
  });
  await test("课程导入无效内容不改数据；联动跳过重复/冲突",()=>{
    reset();const M=C.M,t=M.empty("2026-09-14");t.courses=[{id:"c1",name:"课一",day:1,weeks:[1],startSection:1,endSection:2},{id:"c2",name:"课二",day:2,weeks:[1],startSection:3,endSection:4}];C.saveTable(t);
    const before=JSON.stringify(S.getState());assert.throws(()=>C.upsertCourse({name:"无效",day:8,weeks:[1]}));assert.equal(JSON.stringify(S.getState()),before);
    S.addBlock({date:"2026-09-15",start:"10:00",durMin:90,title:"其他安排"});const result=C.syncWeek(1);assert.equal(result.added,1);assert.equal(result.conflicts,1);assert.equal(C.syncWeek(1).added,0);assert.equal(S.getState().blocks.length,2);
  });
  await test("收藏与 RSS 共享数据键、安全网址与离线阅读状态",()=>{
    reset();const book=L.saveBookmark({url:"example.com/a",title:"收藏",note:"跨端备注"});assert.equal(S.pluginStorageGet(L.BOOKS,"items",[])[0].id,book.id);assert.throws(()=>L.saveBookmark({url:"javascript:alert(1)"}),/网址/);
    L.saveBookmark({id:book.id,url:book.url,title:"更新",note:"新备注"});assert.equal(L.bookmarks("新备注").length,1);const archive=L.exportData(L.BOOKS);assert.equal(L.importData(L.BOOKS,archive),0);
    const feed=L.saveFeed({url:"https://unit.example/feed",title:"测试源"});
    const xml='<rss><channel><title>测试源</title><item><guid>g1</guid><title><![CDATA[消息<b>一</b>]]></title><link>https://unit.example/1</link><description>明天下午3点开会</description></item></channel></rss>';
    assert.equal(L.importFeedText(feed.id,xml).added,1);const id=feed.id+":"+R.hashId("g1");L.updateItem(id,{read:true,star:true});assert.equal(L.importFeedText(feed.id,xml).added,0);assert.equal(L.items({star:true})[0].read,true);
    const created=L.itemToTask(id);assert.equal(L.itemToTask(id).id,created.id);assert.equal(S.getState().tasks.length,1);
    assert.equal(R.parseFeed('<feed><title>A</title><entry><id>2</id><title>Atom</title><link href="/two" /></entry></feed>',feed.url).items[0].link,"https://unit.example/two");
  });
  await test("RSS 域名错误可解释、失败不清空缓存、旧响应不能覆盖恢复后的数据",async()=>{
    reset();const f=L.saveFeed({url:"https://unit.example/feed",title:"测试源"});requestHandler=o=>o.fail({errMsg:"url not in domain list"});await assert.rejects(()=>L.refreshFeed(f.id),/合法域名/);
    let pending;requestHandler=o=>{pending=o;};const p=L.refreshFeed(f.id);S.commitSnapshot(S.seed());pending.success({statusCode:200,data:"<rss><channel/></rss>"});await assert.rejects(()=>p,/数据已被/);assert.deepEqual(S.getState().plugins,{});
  });
  await test("局域网协议：私有 IPv4 配对、先探测再提交、pending 不是接收成功",async()=>{
    reset();const target=LAN.parseTarget("http://192.168.1.5:27123/m?token=fixture-code");assert.equal(target.base,"http://192.168.1.5:27123");assert.equal(target.token,"fixture-code");
    for(const url of ["http://127.0.0.1:27123","http://8.8.8.8","http://192.168.1.999","javascript:alert(1)"])assert.throws(()=>LAN.parseTarget(url,"code"));
    const log=[];requestHandler=o=>{const u=new URL(o.url);log.push([u.pathname,o.method]);const data=u.pathname==="/api/info"?{ok:true,tasks:0,blocks:0}:u.pathname==="/api/state"?S.seed():u.pathname==="/api/push"?{ok:true,status:"pending",id:"req-1"}:{ok:true,status:"accepted"};o.success({statusCode:200,data});};
    assert.equal((await LAN.pull(target)).tasks.length,0);assert.equal((await LAN.push(target,S.seed())).status,"pending");assert.deepEqual(log.slice(-2),[["/api/info","GET"],["/api/push","POST"]]);assert.equal((await LAN.status(target,"req-1")).status,"accepted");
    requestHandler=o=>o.fail({errMsg:o.url});await assert.rejects(()=>LAN.info(target),e=>!e.message.includes("fixture-code"));
  });
  await test("图片预览不把大 data URL 传到渲染层，卸载清理临时文件",async()=>{
    reset();const scope=media.previewScope();const uri="data:image/png;base64,YQ==";const local=await scope.load(uri);assert.ok(disk.has(local));assert.equal(await scope.load(uri),local);assert.equal(await scope.load("https://tracker.example/x.png"),"");scope.dispose();assert.equal(disk.has(local),false);
    wx.chooseMedia=o=>o.success({tempFiles:[{tempFilePath:"/photo.jpg",size:1}]});disk.set("/photo.jpg","YQ==");assert.deepEqual(await media.chooseImages(1),["data:image/jpeg;base64,YQ=="]);delete wx.chooseMedia;
  });
  await test("捕获页防重复点击，手改截止/时长真正生效，草稿可进收件箱",()=>{
    reset();const p=page("capture");p.setData({text:"明天下午3点开会"});p.parseNow();p.onEditDate(event(null,"2026-09-25"));p.onEditDur(event(null,0));p.onTaskOnly();p.onTaskOnly();assert.equal(S.getState().tasks.length,1);assert.equal(S.getState().tasks[0].due,"2026-09-25");assert.equal(S.getState().tasks[0].estMin,15);
    p.setData({text:"稍后整理这条消息"});p.parseNow();p.onSaveInbox();assert.equal(S.getState().inbox.length,1);assert.equal(S.getState().inbox[0].date,null);
  });
  await test("任务详情即时订阅、自定义时长不被改成预设、选日排程",()=>{
    reset();task({id:"x",estMin:37,tags:["研究"],note:"备注"});const p=page("task",{id:"x"});p.onShow();assert.equal(p.data.customEst,"37");assert.ok(p.data.estLabels.some(x=>x.includes("37")));p.onQuadTap(event("x",null,{q:3}));assert.equal(p.data.t.quad,3);
    p.onTagsBlur(event(null,"研究、团队"));assert.deepEqual(clone(S.taskById("x").tags),["研究","团队"]);p.onScheduleDate(event(null,"2026-09-25"));p.onScheduleToday();assert.equal(S.blocksOf("2026-09-25").length,1);
    p.onTitleBlur(event(null,"改名"));assert.equal(S.blocksOf("2026-09-25")[0].title,"改名");
  });
  await test("任务表搜索标签、批量完成/移动/撤销，分页限制渲染负载",()=>{
    reset();S.batchChanges(()=>{for(let i=0;i<130;i++)task({id:"q"+i,quad:1,tags:[i===0?"特别标签":"普通"]});});const p=page("quadrant");p.onShow();assert.equal(p.data.tasks.length,50);p.setData({q:"特别标签"});p.refresh();assert.equal(p.data.total,1);p.onClearSearch();p.onSelectMode();p.selectId("q0");p.selectId("q1");p.onBulkDone(event(null,null,{done:"true"}));assert.ok(S.taskById("q0").done);p.selectId("q0");p.onBulkDone(event(null,null,{done:false}));assert.equal(S.taskById("q0").done,false);
    p.selectId("q0");p.onBulkDelete();lastModal.success({confirm:true});assert.equal(S.taskById("q0"),undefined);p.onUndo();assert.ok(S.taskById("q0"));
  });
  await test("时间块取消不落库、回池真正移除、凌晨自适应可见",()=>{
    reset();const t=task({id:"x"});const b=S.addBlock({id:"early",date:"2026-09-20",start:"06:00",durMin:30,title:"早班",taskId:t.id});const p=page("timeblock");p.onShow();assert.equal(p.axisStart(),0);assert.ok(p.data.blocks[0].y>=0);
    p.onBlockTouchStart(event(b.id));p.onBlockChange({detail:{source:"touch",y:100}});p.onBlockTouchCancel();assert.equal(S.getState().blocks[0].start,"06:00");assert.ok(p._layoutVersion>0);
    p.blockMenu(b.id);lastSheet.success({tapIndex:lastSheet.itemList.indexOf("移回任务池")});assert.equal(S.getState().blocks.length,0);assert.equal(S.poolOf("2026-09-20").length,1);U.run();assert.equal(S.getState().blocks.length,1);
  });
  await test("备份页面先预览后确认，取消不改数据，保存失败不冒充成功",()=>{
    reset();task({id:"local"});const p=page("settings");p.onShow();p.onImportText(event(null,JSON.stringify(Object.assign(S.seed(),{tasks:[{id:"new",title:"导入",quad:1}]}))));p.onImport();assert.equal(p.data.preview.tasks,1);assert.ok(S.taskById("local"));p.onConfirmImport();lastModal.success({confirm:false});assert.ok(S.taskById("local"));
    p.onRestoreMode(event(null,1));p.onConfirmImport();failBefore=k=>k===storage.KEY;lastModal.success({confirm:true});assert.ok(S.taskById("local"));assert.equal(S.taskById("new"),undefined);failBefore=null;p.onConfirmImport();lastModal.success({confirm:true});assert.ok(S.taskById("new"));assert.equal(S.taskById("local"),undefined);
  });
  await test("所有 WXML 事件绑定对应真实 Page 方法，路由无占位/原型陷阱",()=>{
    reset();const appConfig=JSON.parse(fs.readFileSync(path.join(ROOT,"app.json"),"utf8"));
    for(const route of appConfig.pages){
      const name=route.split('/')[1],file=path.join(ROOT,route+".js"),req=createRequire(file);let def;
      vm.runInNewContext(fs.readFileSync(file,"utf8"),{Page:x=>{def=x;},require:req,wx, getApp:()=>app,console,Date:global.Date,setTimeout,clearTimeout,setInterval,clearInterval,module:{exports:{}}},{filename:file});
      const wxml=fs.readFileSync(path.join(ROOT,route+".wxml"),"utf8");for(const m of wxml.matchAll(/(?:bind|catch)(?::)?[a-zA-Z]+\s*=\s*["']([A-Za-z_$][\w$]*)["']/g))assert.equal(typeof def[m[1]],"function",name+":"+m[1]);
    }
    Object.values(routes.SPECIAL).forEach(url=>assert.ok(appConfig.pages.includes(url.slice(1).split('?')[0])));assert.equal(typeof routes.route("__proto__"),"string");
  });
  await test("课程表/资料库/收件箱控制器真实构造数据，前后台订阅可释放",()=>{
    reset();const sch=page("schedule");sch.onShow();assert.equal(sch.data.gridDays.length,7);assert.equal(sch.data.days.length,7);assert.equal(sch.data.courseCount,0);
    const lib=page("library",{id:"web-collector"});lib.onShow();lib.onAdd();lib.onFormInput(event(null,"https://example.com",{field:"url"}));lib.onFormSave();assert.equal(lib.data.items.length,1);
    const inbox=page("inbox");inbox.onShow();S.addInbox({title:"新事项"});assert.equal(inbox.data.pending,1);assert.ok(JSON.stringify(sch.data).length<300000);
  });
  await test("手动选择捕获开始时间会写入提醒，块点击不冒泡新增",()=>{
    reset();const p=page("capture");p.setData({text:"明天整理资料"});p.parseNow();p.onEditStart(event(null,"11:00"));p.onCreate();assert.equal(S.getState().tasks[0].dueTime,"11:00");assert.equal(p.data.result.msg.includes("默认 09:00"),false);
    const wxml=fs.readFileSync(path.join(ROOT,"pages/timeblock/index.wxml"),"utf8");assert.match(wxml,/catchtap="onBlockTap"/);
    const tb=page("timeblock"), count=S.getState().blocks.length;tb.onBlockTap();assert.equal(S.getState().blocks.length,count);
  });
  await test("RSS XML 只有完整保存成功才更新缓存，失败不冒充已导入",()=>{
    reset();const f=L.saveFeed({url:"https://unit.example/rss",title:"源"});S.saveNow();const before=JSON.stringify(S.getState());failBefore=k=>k===storage.KEY;
    assert.throws(()=>L.importFeedText(f.id,'<rss><channel><item><guid>x</guid><title>数据</title></item></channel></rss>'),/quota/);assert.equal(JSON.stringify(S.getState()),before);failBefore=null;
  });
  console.log("PASS: "+checks+" 组小程序跨端功能/数据安全/页面控制器回归（mock wx，未做真机验收）");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{mounted.forEach(p=>p.onUnload&&p.onUnload());U.clear();S.saveNow();global.Date=RealDate;});
