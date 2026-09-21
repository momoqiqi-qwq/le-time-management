const store = require("../../core/store.js");
const undo = require("../../core/undo.js");
const files = require("../../core/files.js");
const routes = require("../../core/pluginRoutes.js");
const transfer = require("../../core/transfer.js");
Page({
  data: { items: [], query: "", showDone: false, pending: 0, total: 0, pageNumber: 1, hasPrev: false, hasNext: false, undoMessage: "" },
  onLoad() { this._page = 0; },
  onShow() { this.onHide(); this._unsub = store.subscribe(() => this.refresh()); this._undoUnsub = undo.bind(this); this.refresh(); },
  onHide() { if (this._unsub) this._unsub(); if (this._undoUnsub) this._undoUnsub(); this._unsub = this._undoUnsub = null; },
  onUnload() { this.onHide(); },
  refresh() {
    const all = store.getState().inbox, query = this.data.query.trim().toLowerCase();
    const filtered = all.filter(item => item && (this.data.showDone ? item.status === "done" : item.status !== "done"))
      .filter(item => !query || [item.title,item.note,item.source].join(" ").toLowerCase().includes(query));
    this._page = Math.min(this._page || 0, Math.floor(Math.max(0,filtered.length-1)/40));
    this.setData({ pending:all.filter(item => item && item.status !== "done").length, total:filtered.length, pageNumber:this._page+1, hasPrev:this._page>0, hasNext:(this._page+1)*40<filtered.length,
      items:filtered.slice(this._page*40,(this._page+1)*40).map(item=>({ id:item.id,title:String(item.title||"待处理事项").slice(0,160),note:String(item.note||"").slice(0,1400),source:item.source||item.sourcePlugin||"收件箱",when:item.when||[item.date,item.time].filter(Boolean).join(" "),done:item.status==="done",canCreate:item.status!=="done"&&item.suggestion==="create-task",course:item.suggestion==="open-course",taskId:item.taskId&&store.taskById(item.taskId)?item.taskId:"",attachments:Array.isArray(item.attachments)?item.attachments.length:0 })) });
  },
  onSearch(e) { this._page=0;this.setData({query:e.detail.value});this.refresh(); },
  onFilter(e) { this._page=0;this.setData({showDone:e.currentTarget.dataset.done===true||e.currentTarget.dataset.done==="true"});this.refresh(); },
  onMore() { this._page++;this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onPrev() { this._page=Math.max(0,this._page-1);this.refresh();wx.pageScrollTo({scrollTop:0,duration:150}); },
  onCreateTask(e) { const task=store.inboxToTask(e.currentTarget.dataset.id);if(task){wx.showToast({title:"已建任务，附件与截止时间已保留",icon:"none"});wx.navigateTo({url:"/pages/task/index?id="+encodeURIComponent(task.id)});} },
  onTask(e) { wx.navigateTo({url:"/pages/task/index?id="+encodeURIComponent(e.currentTarget.dataset.id)}); },
  onCourse() { wx.navigateTo({url:routes.route("shiguang-schedule")}); },
  onDone(e) {
    const owner=store.getState(), item=owner.inbox.find(x=>x.id===e.currentTarget.dataset.id);if(!item)return;
    const before=item.status;item.status=item.status==="done"?"pending":"done";store.touch();
    undo.offer(()=>{if(store.getState()!==owner||!owner.inbox.includes(item))return false;item.status=before;store.touch();return true;},"收件箱状态已更新");
  },
  onCopy(e) { const item=store.getState().inbox.find(x=>x.id===e.currentTarget.dataset.id);if(item)files.copyText([item.title,item.when,item.note].filter(Boolean).join("\n")).catch(files.notifyError); },
  onUndo() { undo.run(); },
  onCapture() { wx.switchTab({url:"/pages/capture/index"}); },
  onCollectDue() {
    const st=store.getState(), today=store.todayStr(), existing=new Set(st.inbox.map(item=>item && item.id));let added=0;
    store.batchChanges(()=>st.tasks.filter(t=>!t.done&&transfer.isDate(t.due)&&t.due<=today).forEach(t=>{
      const id="mini-due-"+t.id+"-"+t.due;if(existing.has(id))return;
      store.addInbox({id,title:t.title,note:t.note||"",date:t.due,time:t.dueTime||"23:59",when:t.due+" "+(t.dueTime||"23:59"),source:"今日与逾期待办",suggestion:"open-task",taskId:t.id});existing.add(id);added++;
    }));
    wx.showToast({title:"整理新增 "+added+" 条，重复事项不再加入",icon:"none"});
  },
});
