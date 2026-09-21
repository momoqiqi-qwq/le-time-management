const service = require("../../core/schedule.js");
const store = require("../../core/store.js");
const files = require("../../core/files.js");
const routes = require("../../core/pluginRoutes.js");
Page({
  data: { name: "课程表", tables: [], tableIndex: 0, mode: "week", week: 1, weekLabels: [], semesterLabel: "", days: [], selectedDay: 1, selectedCourses: [], gridDays: [], axis: [], gridHeight: 850, courseCount: 0, conflictCount: 0, error: "", query: "", courses: [], courseTotal: 0, draft: null, config: null, importText: "", fileName: "", preview: null, weekdays: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], sections: [], colors: [0,1,2,3,4,5] },
  onLoad() { this._week = 0; this._page = 0; this._unloaded = false; },
  onShow() {
    if (!routes.enabled(service.ID)) return;
    this._unsub && this._unsub(); this._unsub = store.subscribe(() => this.refresh()); this.refresh();
  },
  onHide() { if (this._unsub) { this._unsub(); this._unsub = null; } },
  onUnload() { this._unloaded = true; this.onHide(); },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh(); },
  refresh() {
    if (this._unloaded) return;
    try {
      const vm = service.view(this._week, this.data.mode === "today" ? "today" : "week");
      const st = vm.state, all = st.table.courses; this._state = st; this._week = vm.week;
      const weekDays = service.view(vm.week, "week").days;
      const todayDay = weekDays.find(d => d.date === store.todayStr());
      if (!this._selected) this._selected = todayDay ? todayDay.day : 1;
      const begin = Math.min(...st.table.timeSlots.map(s => service.M.minutes(s.startTime)), ...weekDays.flatMap(d => d.courses.map(c => service.M.minutes(c.start))));
      const end = Math.max(...st.table.timeSlots.map(s => service.M.minutes(s.endTime)), ...weekDays.flatMap(d => d.courses.map(c => service.M.minutes(c.end))));
      const span = Math.max(60, end - begin), q = this.data.query.trim().toLowerCase();
      const order = st.table.config.firstDayOfWeek === 7 ? [7,1,2,3,4,5,6] : [1,2,3,4,5,6,7];
      const compact = c => ({ id: c.id, name: c.name, teacher: c.teacher, position: c.position, timeLabel: c.timeLabel, conflict: !!c.conflict, colorClass: c.colorClass });
      const filtered = all.filter(c => !q || [c.name,c.teacher,c.position,c.remark].join(" ").toLowerCase().includes(q));
      this._page = Math.min(this._page || 0, Math.floor(Math.max(0, filtered.length - 1) / 40));
      this.setData({ name: st.name.slice(0, 120), tables: st.tables.map(t => ({ id:t.id, name:t.name.slice(0, 80) })), tableIndex: st.tables.findIndex(t => t.id === st.currentId),
        week: vm.week, weekLabels: Array.from({ length: st.table.config.semesterTotalWeeks }, (_, i) => "第 " + (i + 1) + " 周"),
        semesterLabel: vm.inSemester ? "当前第 " + vm.realWeek + " 周" : vm.realWeek < 1 ? "尚未开学" : "本学期已结束", courseCount: all.length, conflictCount: vm.conflicts,
        days: vm.days.map(d => ({ day:d.day, date:d.date, label:d.label, total:d.courses.length, courses:this.data.mode === "today" ? d.courses.slice(0, 100).map(compact) : [] })),
        selectedDay: this._selected, selectedCourses: (weekDays.find(d => d.day === this._selected) || { courses:[] }).courses.slice(0,100).map(compact),
        gridHeight: Math.max(720, Math.min(1800, st.table.timeSlots.length * 82)),
        gridDays: order.map(day => { const d=weekDays.find(x=>x.day===day); return { day, label:d.label, date:d.date.slice(5), courses:d.courses.slice(0,40).map(c=>({ id:c.id, name:c.name, position:c.position, colorClass:c.colorClass, conflict:c.conflict, top:((service.M.minutes(c.start)-begin)/span*100).toFixed(3), height:Math.max(3,(service.M.minutes(c.end)-service.M.minutes(c.start))/span*100).toFixed(3) })) }; }),
        axis: st.table.timeSlots.map(s => ({ number:s.number, start:s.startTime, top:((service.M.minutes(s.startTime)-begin)/span*100).toFixed(3) })),
        sections: st.table.timeSlots.map(s => "第 " + s.number + " 节 · " + s.startTime), courseTotal: filtered.length,
        pageNumber:this._page+1, hasPrev:this._page>0, hasNext:(this._page+1)*40<filtered.length,
        courses: filtered.slice(this._page*40,(this._page+1)*40).map(c=>({ id:c.id, name:c.name, teacher:c.teacher, position:c.position, dayLabel:"周"+"一二三四五六日"[c.day-1], weeksLabel:c.weeks.join(","), timeLabel:service.M.times(c,st.table).join("–") })), error:"" });
    } catch (e) { this.setData({ error: files.errorText(e) }); }
  },
  onMode(e) {
    const mode=e.currentTarget.dataset.mode;
    if (mode === "today") this._week=0;
    if (mode === "settings") this.openConfig();
    this.setData({ mode }); this.refresh();
  },
  onWeek(e) { this._week=Number(e.detail.value)+1; this.refresh(); },
  onPrev() { this._week=Math.max(1,this.data.week-1); this.refresh(); },
  onNext() { this._week=Math.min(this.data.weekLabels.length,this.data.week+1); this.refresh(); },
  onCurrent() { this._week=0; this.refresh(); },
  onDay(e) { this._selected=Number(e.currentTarget.dataset.day); this.refresh(); },
  onTable(e) { try { service.selectTable(this.data.tables[Number(e.detail.value)].id); this._week=0; this._selected=null; this._pending=null; this.setData({ preview:null, draft:null }); this.refresh(); } catch(e2) { files.notifyError(e2); } },
  onNewTable() { wx.showModal({ title:"新建课表", editable:true, placeholderText:"例如：大二上学期", success:r=>{ if(!r.confirm)return; try{ service.addTable(r.content||"新课表");this._week=0;this.refresh(); }catch(e){files.notifyError(e);} } }); },
  onRenameTable() { wx.showModal({ title:"重命名课表", editable:true, content:this.data.name, success:r=>{ if(!r.confirm)return;try{service.renameTable(r.content);this.refresh();}catch(e){files.notifyError(e);} } }); },
  onDeleteTable() { wx.showModal({ title:"删除当前课表",content:"只删除当前课表，不会删除已导入时间块的历史安排。建议先导出备份。",confirmColor:"#C43C3C",success:r=>{if(!r.confirm)return;try{service.deleteTable(this._state.currentId);this._week=0;this.refresh();}catch(e){files.notifyError(e);}} }); },
  onSearch(e) { this._page=0;this.setData({query:e.detail.value});this.refresh(); },
  onMore() { this._page++;this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onPrevPage() { this._page=Math.max(0,this._page-1);this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onAddCourse() {
    if (!this._state) return;
    this.setData({ mode:"edit", draft:{ id:"", name:"", teacher:"", position:"", day:1, weeks:"1-"+this._state.table.config.semesterTotalWeeks, isCustomTime:false,
      startSection:this._state.table.timeSlots[0].number, endSection:this._state.table.timeSlots[0].number, startIndex:0,endIndex:0,customStartTime:"09:00",customEndTime:"09:45",color:0,remark:"" } });
  },
  onEditCourse(e) {
    const c=this._state.table.courses.find(x=>x.id===e.currentTarget.dataset.id);if(!c)return;
    this.setData({mode:"edit",draft:Object.assign({},c,{weeks:c.weeks.join(","),startIndex:Math.max(0,this._state.table.timeSlots.findIndex(s=>s.number===c.startSection)),endIndex:Math.max(0,this._state.table.timeSlots.findIndex(s=>s.number===c.endSection)),customStartTime:c.customStartTime||"09:00",customEndTime:c.customEndTime||"09:45"})});
  },
  onCourseInput(e) { const key=e.currentTarget.dataset.field;if(["name","teacher","position","weeks","remark","customStartTime","customEndTime"].includes(key))this.setData({["draft."+key]:e.detail.value}); },
  onCourseDay(e) { this.setData({"draft.day":Number(e.detail.value)+1}); },
  onCustomTime(e) { this.setData({"draft.isCustomTime":e.detail.value}); },
  onSection(e) { const key=e.currentTarget.dataset.field,index=Number(e.detail.value),slot=this._state.table.timeSlots[index];if(slot&&["start","end"].includes(key))this.setData({["draft."+key+"Section"]:slot.number,["draft."+key+"Index"]:index}); },
  onColor(e) { this.setData({"draft.color":Number(e.currentTarget.dataset.color)}); },
  onSaveCourse() { try{service.upsertCourse(this.data.draft);this.setData({draft:null,mode:"manage"});this.refresh();wx.showToast({title:"课程已保存",icon:"none"});}catch(e){files.notifyError(e);} },
  onCancelEdit() { this.setData({draft:null,mode:"manage"}); },
  onDeleteCourse(e) { const id=e.currentTarget.dataset.id;wx.showModal({title:"删除课程",content:"删除当前课表中的这门课程？已导入的时间块保持不变。",confirmColor:"#C43C3C",success:r=>{if(r.confirm){try{service.deleteCourse(id);this.refresh();}catch(error){files.notifyError(error);}}}}); },
  openConfig() { if(!this._state)return; const t=this._state.table;this.setData({config:{start:t.config.semesterStartDate,weeks:String(t.config.semesterTotalWeeks),first:t.config.firstDayOfWeek===7?1:0,slots:t.timeSlots.map(s=>[s.number,s.startTime,s.endTime,s.alias||""].join(",")).join("\n")}}); },
  onConfig(e) { const key=e.currentTarget.dataset.field;if(["start","weeks","slots","first"].includes(key))this.setData({["config."+key]:e.detail.value}); },
  onSaveConfig() {
    try {
      const cfg=this.data.config,slots=cfg.slots.split(/\r?\n/).filter(x=>x.trim()).map(line=>{const p=line.trim().split(/[,，\s]+/);return{number:Number(p[0]),startTime:p[1],endTime:p[2],alias:p.slice(3).join(" ")};});
      if (!slots.length) throw new Error("至少保留一个有效节次");
      service.saveTable(Object.assign({},this._state.table,{timeSlots:slots,config:Object.assign({},this._state.table.config,{semesterStartDate:cfg.start,semesterTotalWeeks:Number(cfg.weeks),firstDayOfWeek:Number(cfg.first)===1?7:1})}));
      this._week=0;this.setData({mode:"week"});this.refresh();wx.showToast({title:"课表设置已保存",icon:"none"});
    }catch(e){files.notifyError(e);}
  },
  onImportText(e) { this._fileText=null;this._pending=null;this.setData({importText:e.detail.value,fileName:"",preview:null}); },
  async onChooseFile() { try{const file=await files.readText(["json","csv","tsv","txt","html"],4*1024*1024);if(file&&!this._unloaded){this._fileText=file.text;this._pending=null;this.setData({fileName:file.name,importText:"",preview:null});this.onPreview();}}catch(e){files.notifyError(e);} },
  onPreview() { try{this._pending=service.importPreview(this._fileText||this.data.importText,this.data.fileName||"导入课表");this.setData({preview:{tables:this._pending.tables.length,count:this._pending.count,warnings:this._pending.warnings.slice(0,10)}});}catch(e){files.notifyError(e);} },
  onApplyImport(e) {
    const mode=e.currentTarget.dataset.mode;if(!this._pending)return;
    wx.showModal({title:"确认导入",content:mode==="merge"?"把课程合并到当前课表，并使用导入的学期配置。其他学期建议选择新增课表。":"新增 "+this._pending.tables.length+" 张课表，原有课表保留。",success:r=>{
      if(!r.confirm)return;try{service.applyImport(this._pending,mode);this._pending=null;this._fileText=null;this._week=0;this.setData({preview:null,fileName:"",importText:"",mode:"week"});this.refresh();wx.showToast({title:"课表导入完成",icon:"none"});}catch(error){files.notifyError(error);}
    }});
  },
  async onExport(e) { try{const ics=e.currentTarget.dataset.format==="ics";await files.exportText("U-Time-课表."+(ics?"ics":"json"),ics?service.exportIcs():service.exportJson());}catch(error){files.notifyError(error);} },
  onSyncWeek() { wx.showModal({title:"加入本周时间块",content:"只新增未重复且无冲突的课程安排；不会覆盖已有时间块。",success:r=>{if(!r.confirm)return;try{const result=service.syncWeek(this.data.week);wx.showModal({title:"排程结果",content:"新增 "+result.added+" 个，跳过重复 "+result.duplicates+" 个、冲突 "+result.conflicts+" 个。",showCancel:false});}catch(error){files.notifyError(error);}}}); },
  onTimeblock() { const d=(this.data.days.find(x=>x.day===this._selected)||this.data.days[0]);getApp().globalData.pendingTimeblockDate=d?d.date:store.todayStr();wx.switchTab({url:"/pages/timeblock/index"}); },
  onShareAppMessage() { return {title:"U-Time · 原生课程表",path:"/pages/schedule/index"}; },
});
