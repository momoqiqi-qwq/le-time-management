import * as S from '../store.js';
import { el, toast } from '../ui.js';
import { getLogs, undoLog, getRules, setRuleEnabled, runAutomation } from '../automation.js';
import { createAiAutomationCard } from './aiAutomationPanel.js';

export function renderInbox(container){
  const st=S.getState(); st.inbox??=[];
  const wrap=el('div',{class:'inbox-wrap'});
  const head=el('div',{class:'inbox-head'},el('div',{},el('h2',{},'收件箱与自动化'),el('p',{class:'desc'},'来自通知、考试、课程、内置规则和 AI 自动任务的待确认事项集中在这里。')),el('button',{class:'btn pri sm',onclick:async()=>{await runAutomation('manual');renderInbox(container);toast('自动化已运行');}},'立即运行'));
  const grid=el('div',{class:'inbox-grid'});
  const inboxCard=el('section',{class:'card set-card'},el('h3',{},`收件箱 · ${st.inbox.filter(x=>x.status!=='done').length}`));
  const open=st.inbox.filter(x=>x.status!=='done');
  if(!open.length) inboxCard.append(el('p',{class:'desc'},'没有待处理事项。'));
  for(const item of open.slice(0,30)){
    inboxCard.append(el('div',{class:'inbox-item'},el('div',{class:'inbox-item-main'},el('b',{},item.title),el('small',{},`${item.source||'自动化'}${item.when?` · ${item.when}`:''}`),item.note?el('p',{},item.note):null),el('div',{class:'inbox-actions'},
      item.suggestion==='create-task'?el('button',{class:'btn pri sm',onclick:()=>{S.addTask({title:item.title,note:item.note||'',due:item.when||null,quad:1,tags:[item.source||'收件箱']});item.status='done';S.saveNow();renderInbox(container);toast('已创建任务');}},'建任务'):null,
      item.suggestion==='open-course'?el('button',{class:'btn ghost sm',onclick:()=>window.dispatchEvent(new CustomEvent('tide:navigate',{detail:'plug:shiguang-schedule'}))},'打开课程表'):null,
      el('button',{class:'btn ghost sm',onclick:()=>{item.status='done';S.saveNow();renderInbox(container);}},'完成')
    )));
  }
  const ruleCard=el('section',{class:'card set-card'},el('h3',{},'自动化规则'));
  for(const r of getRules()){
    const ck=el('input',{type:'checkbox',checked:r.enabled?true:null}); ck.onchange=()=>{setRuleEnabled(r.id,ck.checked);};
    ruleCard.append(el('label',{class:'automation-rule'},el('span',{},el('b',{},r.name),el('small',{},`${r.trigger} → ${r.action}`)),ck));
  }
  const aiCard=createAiAutomationCard({rerender:()=>renderInbox(container)});
  const logCard=el('section',{class:'card set-card'},el('h3',{},'自动化日志'));
  const logs=getLogs(); if(!logs.length)logCard.append(el('p',{class:'desc'},'暂无自动化操作记录。'));
  for(const row of logs.slice(0,25)) logCard.append(el('div',{class:'auto-log'},el('div',{},el('b',{},row.message),el('small',{},new Date(row.at).toLocaleString('zh-CN'))),row.before?el('button',{class:'btn ghost sm',onclick:async()=>{if(!confirm('撤销这次自动操作？'))return;await undoLog(row.id);renderInbox(container);toast('已撤销');}},'撤销'):null));
  grid.append(inboxCard,ruleCard,aiCard,logCard);wrap.append(head,grid);container.replaceChildren(wrap);
}
