import * as S from '../store.js';
import { el, toast } from '../ui.js';
import { toggleSwitch } from '../switchControl.js';
import { getLogs, undoLog, getRules, setRuleEnabled, runAutomation } from '../automation.js';
import { createAiAutomationCard } from './aiAutomationPanel.js';
import { pluginDisplayName, pluginDisplayIcon } from '../pluginAppearance.js';

export function renderInbox(container){
  const st=S.getState(); st.inbox??=[];
  const wrap=el('div',{class:'inbox-wrap'});
  const head=el('div',{class:'inbox-head'},el('div',{},el('h2',{},'收件箱与自动化'),el('p',{class:'desc'},'来自通知、考试、课程、内置规则和 AI 自动任务的待确认事项集中在这里。')),el('button',{class:'btn pri sm',onclick:async()=>{await runAutomation('manual');renderInbox(container);toast('自动化已运行');}},'立即运行'));
  const grid=el('div',{class:'inbox-grid'});
  const inboxCard=el('section',{class:'card set-card'},el('h3',{},`收件箱 · ${st.inbox.filter(x=>x.status!=='done').length}`));
  const open=st.inbox.filter(x=>x.status!=='done');
  if(!open.length) inboxCard.append(el('p',{class:'desc'},'没有待处理事项。'));
  for(const item of open.slice(0,30)){
    // 来源插件：带上插件图标，一眼看出这条是谁放进来的（通知 / 考试 / 收纳…）。
    // 图标走 pluginDisplayIcon，和抽屉里的「来源插件」完全是同一套 —— 免得同一个插件两处长得不一样。
    const srcLabel = item.source || (item.sourcePlugin ? pluginDisplayName(item.sourcePlugin) : '自动化');
    const srcNode = item.sourcePlugin
      ? el('span',{class:'inbox-src'},pluginDisplayIcon(item.sourcePlugin, srcLabel),el('span',{},srcLabel))
      : el('span',{class:'inbox-src'},srcLabel);
    // 附件（收纳进来的截图）：显示张数即可，点「建任务」会把它们一起带过去
    const nAtt = Array.isArray(item.attachments) ? item.attachments.length : 0;
    inboxCard.append(el('div',{class:'inbox-item'},
      el('div',{class:'inbox-item-main'},
        el('b',{},item.title),
        el('small',{},srcNode,item.when?el('span',{},` · ${item.when}`):null,
          nAtt?el('span',{class:'inbox-att'},` · 图 ${nAtt} 张`):null),
        item.note?el('p',{},item.note):null),
      el('div',{class:'inbox-actions'},
        item.suggestion==='create-task'?el('button',{class:'btn pri sm',onclick:()=>{
          // ⚠️ `item.when` 是「2026-01-08 23:59」这种**拼好的展示串**，直接塞进 due 会写出
          // 非法日期（宿主按 YYYY-MM-DD 解析，带时间的会被判废 → 提醒静默失效）。
          // 分开取真正的结构化字段，取不到就留空。
          S.addTask({
            title:item.title, note:item.note||'',
            due:item.date||null, dueTime:item.time||'23:59',
            quad:1, tags:[srcLabel],
            attachments:nAtt?item.attachments.slice():undefined,
          });
          item.status='done';S.saveNow();renderInbox(container);toast('已创建任务');
        }},'建任务'):null,
        item.suggestion==='open-course'?el('button',{class:'btn ghost sm',onclick:()=>window.dispatchEvent(new CustomEvent('tide:navigate',{detail:'plug:shiguang-schedule'}))},'打开课程表'):null,
        el('button',{class:'btn ghost sm',onclick:()=>{item.status='done';S.saveNow();renderInbox(container);}},'完成')
      )));
  }
  const ruleCard=el('section',{class:'card set-card'},el('h3',{},'自动化规则'));
  for(const r of getRules()){
    const ck=toggleSwitch({checked:r.enabled,ariaLabel:'启用自动化规则 '+r.name}); ck.onchange=()=>{setRuleEnabled(r.id,ck.checked);};
    ruleCard.append(el('label',{class:'automation-rule'},el('span',{},el('b',{},r.name),el('small',{},`${r.trigger} → ${r.action}`)),ck));
  }
  const aiCard=createAiAutomationCard({rerender:()=>renderInbox(container)});
  const logCard=el('section',{class:'card set-card'},el('h3',{},'自动化日志'));
  const logs=getLogs(); if(!logs.length)logCard.append(el('p',{class:'desc'},'暂无自动化操作记录。'));
  for(const row of logs.slice(0,25)) logCard.append(el('div',{class:'auto-log'},el('div',{},el('b',{},row.message),el('small',{},new Date(row.at).toLocaleString('zh-CN'))),row.before?el('button',{class:'btn ghost sm',onclick:async()=>{if(!confirm('撤销这次自动操作？'))return;await undoLog(row.id);renderInbox(container);toast('已撤销');}},'撤销'):null));
  grid.append(inboxCard,ruleCard,aiCard,logCard);wrap.append(head,grid);container.replaceChildren(wrap);
}
