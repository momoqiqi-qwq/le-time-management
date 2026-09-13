// Copyright (C) 2025 XingHeYuZhuan. Apache-2.0; see LICENSE.
// Extended for Le时间管理: validation, responsive schedule data and generic academic-system import.
(function(root) {
  const fail = message => { throw new Error(message); };
  const int = (v,min,max,label) => Number.isInteger(Number(v)) && Number(v)>=min && Number(v)<=max ? Number(v) : fail(label+'超出范围');
  const time = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '') ? t : fail('时间须为 HH:MM');
  const minutes = t => { time(t); const [h,m]=t.split(':').map(Number);return h*60+m; };
  const dateCache=new Map();
  const date = s => { if(!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) fail('请选择开学日期');const hit=dateCache.get(s);if(hit)return new Date(hit);const d=new Date(s+'T12:00:00');if(Number.isNaN(+d)||format(d)!==s) fail('日期无效');if(dateCache.size>100)dateCache.clear();dateCache.set(s,+d);return d; };
  function format(d) {return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function addDays(s,n){const d=date(s);d.setDate(d.getDate()+n);return format(d);}
  function monday(s){const d=date(s);return addDays(s,-((d.getDay()+6)%7));}
  function weekOf(start,today){return Math.floor((Date.UTC(...monday(today).split('-').map((n,i)=>Number(n)-(i===1?1:0)))-Date.UTC(...monday(start).split('-').map((n,i)=>Number(n)-(i===1?1:0))))/604800000)+1;}
  function weeks(text,total=20){
    const raw=String(text??'').trim();
    if(!raw) fail('至少选择一个上课周');
    const parity = /(?:单周|单\s*$|奇数周)/.test(raw) ? 1 : /(?:双周|双\s*$|偶数周)/.test(raw) ? 0 : null;
    const cleaned=raw.replace(/[第周星期教学周]/g,'').replace(/[、，；;\s]+/g,',').replace(/[~～—–至]/g,'-').replace(/[单双奇偶]数?周?/g,'');
    const result=new Set();
    for(const part of cleaned.split(',').map(s=>s.trim()).filter(Boolean)) {
      const m=part.match(/^(\d+)(?:-(\d+))?$/);if(!m) continue;
      const a=int(m[1],1,total,'周次'),b=int(m[2]||m[1],a,total,'周次');
      for(let n=a;n<=b;n++)if(parity===null||n%2===parity)result.add(n);
    }
    if(!result.size) fail('无法识别上课周次，请填写如 1-16、1,3,5、1-16单周');
    return [...result].sort((a,b)=>a-b);
  }
  function empty(today=format(new Date())) {return {courses:[],timeSlots:[{number:1,startTime:'08:00',endTime:'08:45'},{number:2,startTime:'08:55',endTime:'09:40'},{number:3,startTime:'10:00',endTime:'10:45'},{number:4,startTime:'10:55',endTime:'11:40'},{number:5,startTime:'14:00',endTime:'14:45'},{number:6,startTime:'14:55',endTime:'15:40'},{number:7,startTime:'16:00',endTime:'16:45'},{number:8,startTime:'16:55',endTime:'17:40'},{number:9,startTime:'19:00',endTime:'19:45'},{number:10,startTime:'19:55',endTime:'20:40'}],config:{semesterStartDate:monday(today),semesterTotalWeeks:20,defaultClassDuration:45,defaultBreakDuration:10,firstDayOfWeek:1}};}
  function normalizedWeeks(value,total){if(!Array.isArray(value))return weeks(value,total);const set=new Set();for(const raw of value){const n=Number(raw);if(!Number.isInteger(n)||n<1||n>total)fail('周次超出范围');set.add(n);}if(!set.size)fail('至少选择一个上课周');return [...set].sort((a,b)=>a-b);}
  function normalize(raw,today=format(new Date())){
    if(!raw||!Array.isArray(raw.courses))fail('未找到 courses 数组，请导入课程表 JSON');
    if(raw.courses.length>1000)fail('单课表最多 1000 门课程');
    const base=empty(today),config={...base.config,...raw.config};date(config.semesterStartDate || (config.semesterStartDate=base.config.semesterStartDate));
    config.semesterTotalWeeks=int(config.semesterTotalWeeks,1,60,'学期周数');config.firstDayOfWeek=int(config.firstDayOfWeek,1,7,'每周起始日');
    if(![1,7].includes(config.firstDayOfWeek))fail('每周起始日只支持周一或周日');
    const slots=raw.timeSlots?.length ? raw.timeSlots : base.timeSlots;
    if(!Array.isArray(slots)||slots.length>40)fail('节次表无效');
    const timeSlots=slots.map(s=>({number:int(s.number,1,40,'节次'),startTime:time(s.startTime),endTime:time(s.endTime),alias:String(s.alias||'').slice(0,50)})).sort((a,b)=>a.number-b.number);
    for(let i=0;i<timeSlots.length;i++){const s=timeSlots[i];if(minutes(s.endTime)<=minutes(s.startTime))fail('每节课结束时间须晚于开始时间');if(i && (s.number===timeSlots[i-1].number||s.startTime<timeSlots[i-1].endTime))fail('节次编号重复或时间重叠');}
    const slotNumbers=new Set(timeSlots.map(s=>s.number));
    const ids=new Set();
    const courses=raw.courses.map((c,i)=>{
      const id=String(c.id||'course-'+i);if(ids.has(id))fail('课程 ID 重复');ids.add(id);
      const name=String(c.name||'').trim();if(!name)fail('课程名称不能为空');
      const result={id,name:name.slice(0,120),teacher:String(c.teacher||'').slice(0,100),position:String(c.position||'').slice(0,150),day:int(c.day,1,7,'星期'),weeks:normalizedWeeks(c.weeks,config.semesterTotalWeeks),isCustomTime:!!c.isCustomTime,startSection:null,endSection:null,customStartTime:null,customEndTime:null,color:Number.isInteger(c.color)?c.color:0,remark:String(c.remark||'').slice(0,300)};
      if(result.isCustomTime){result.customStartTime=time(c.customStartTime);result.customEndTime=time(c.customEndTime);}
      else {result.startSection=int(c.startSection,1,40,'开始节次');result.endSection=int(c.endSection,result.startSection,40,'结束节次');for(let n=result.startSection;n<=result.endSection;n++)if(!slotNumbers.has(n))fail('课程引用了不存在的节次 '+n);}
      const [start,end]=times(result,{timeSlots});if(minutes(end)<=minutes(start))fail('课程结束须晚于开始');return result;
    });return {courses,timeSlots,config};
  }
  const slotMapCache=new WeakMap();
  function slotsOf(table){let map=slotMapCache.get(table);if(!map){map=new Map(table.timeSlots.map(s=>[s.number,s]));slotMapCache.set(table,map);}return map;}
  function times(c,table){if(c.isCustomTime)return[c.customStartTime,c.customEndTime];const map=slotsOf(table);return[map.get(c.startSection)?.startTime,map.get(c.endSection)?.endTime];}
  function occurrences(table,week){const start=addDays(monday(table.config.semesterStartDate),(week-1)*7),dates=Array.from({length:7},(_,i)=>addDays(start,i)),rows=[];for(const c of table.courses){if(!c.weeks.includes(week))continue;const t=times(c,table);rows.push({...c,date:dates[c.day-1],start:t[0],end:t[1]});}return rows.sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));}
  function conflicts(rows){const ids=new Set();for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(rows[i].date===rows[j].date&&rows[i].start<rows[j].end&&rows[j].start<rows[i].end){ids.add(rows[i].id);ids.add(rows[j].id);}return ids;}
  function packs(raw){if(Array.isArray(raw?.allTables)){if(!raw.allTables.length)fail('备份中没有课表');return raw.allTables.map(x=>({name:String(x.tableName||'未命名课表'),data:x.tableData}));}return [{name:'导入课表',data:raw}];}

  const headerAliases={
    name:['课程名称','课程','科目','名称','course','subject','coursename'],
    teacher:['教师','任课教师','授课教师','老师','teacher','instructor'],
    position:['上课地点','地点','教室','上课教室','教学地点','location','classroom','room'],
    day:['星期','周几','上课星期','weekday','day'],
    weeks:['周次','上课周次','教学周','授课周次','weeks','week'],
    sections:['节次','上课节次','节数','课节','sections','section'],
    start:['开始时间','上课开始时间','start','starttime'],
    end:['结束时间','下课时间','end','endtime'],
    time:['上课时间','时间','课程时间','classtime','schedule'],
    remark:['备注','说明','remark','note']
  };
  const canon=s=>String(s??'').toLowerCase().replace(/[\s_\-:：()（）【】\[\]]/g,'');
  function mapHeaders(row){const out={};row.forEach((h,i)=>{const c=canon(h);for(const [key,aliases] of Object.entries(headerAliases))if(aliases.some(a=>canon(a)===c)){out[key]=i;break;}});return out;}
  function csvRows(text,delimiter){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"')quoted=false;else cell+=ch;}else if(ch==='"')quoted=true;else if(ch===delimiter){row.push(cell.trim());cell='';}else if(ch==='\n'){row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else if(ch!=='\r')cell+=ch;}
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
  }
  function stripHtml(s){return String(s||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();}
  function htmlTableRows(text){const rows=[];for(const tr of String(text).match(/<tr\b[\s\S]*?<\/tr>/gi)||[]){const cells=[...tr.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>stripHtml(m[1]));if(cells.some(Boolean))rows.push(cells);}return rows;}
  function textRows(text){
    const raw=String(text||'').trim();if(!raw)return [];
    if(/<table\b/i.test(raw)){const h=htmlTableRows(raw);if(h.length)return h;}
    const first=(raw.split(/\r?\n/).find(Boolean)||'');
    const candidates=['\t',',',';','|'];let delimiter='\t',best=-1;
    for(const d of candidates){const n=first.split(d).length;if(n>best){best=n;delimiter=d;}}
    if(best>1)return csvRows(raw,delimiter);
    return raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>line.split(/\s{2,}/));
  }
  function parseDay(v){const s=String(v??'').trim();if(/^\d$/.test(s)){const n=Number(s);if(n>=1&&n<=7)return n;}const chars={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7};const m=s.match(/(?:星期|周)?([一二三四五六日天])/);return m?chars[m[1]]:null;}
  function parseSections(v){const s=String(v??'').replace(/[第节课\s]/g,'').replace(/[~～—–至]/g,'-').replace(/、/g,',');const nums=(s.match(/\d+/g)||[]).map(Number).filter(n=>n>=1&&n<=40);if(!nums.length)return null;return [Math.min(...nums),Math.max(...nums)];}
  function parseTimeRange(v){const m=String(v??'').match(/([01]?\d|2[0-3]):([0-5]\d)\s*[-~～—–至]\s*([01]?\d|2[0-3]):([0-5]\d)/);return m?[`${String(m[1]).padStart(2,'0')}:${m[2]}`,`${String(m[3]).padStart(2,'0')}:${m[4]}`]:null;}
  function extractCombined(v,total){
    const s=String(v??''),day=parseDay(s);let wk=null,sections=null;
    // In combined cells, bind numbers to their labels so week numbers are never mistaken for section numbers.
    const wm=s.match(/(?:第\s*)?((?:\d+\s*(?:[-~～—–至]\s*\d+)?)(?:\s*[,，、]\s*\d+(?:\s*[-~～—–至]\s*\d+)?)*)\s*(?:(单周|双周|奇数周|偶数周)|周\s*(单周|双周|奇数周|偶数周)?)/);
    if(wm){try{wk=weeks(wm[1]+(wm[2]||wm[3]||''),total);}catch{}}
    const sm=s.match(/(?:第\s*)?(\d+)\s*(?:[-~～—–至]\s*(\d+))?\s*节/);
    if(sm){const a=Number(sm[1]),b=Number(sm[2]||sm[1]);if(a>=1&&a<=40&&b>=a&&b<=40)sections=[a,b];}
    return {day,weeks:wk,sections,range:parseTimeRange(s)};
  }
  function cell(row,map,key){const i=map[key];return i===undefined?'':String(row[i]??'').trim();}
  function parseAcademicText(text,base,opts={}){
    const rows=textRows(text);if(rows.length<2)fail('没有识别到可导入的表格。请复制带表头的教务课表，或上传 CSV/TSV/TXT/HTML。');
    const map=mapHeaders(rows[0]);if(map.name===undefined)fail('未识别到“课程名称/课程”列。请保留教务表格表头。');
    const total=int(opts.semesterTotalWeeks||base.config.semesterTotalWeeks,1,60,'学期周数');
    const config={...base.config,semesterStartDate:opts.semesterStartDate||base.config.semesterStartDate,semesterTotalWeeks:total};date(config.semesterStartDate);
    const courses=[],warnings=[];
    for(let i=1;i<rows.length;i++){
      const row=rows[i],name=cell(row,map,'name');if(!name)continue;
      try{
        const combined=extractCombined(cell(row,map,'time'),total);
        const day=parseDay(cell(row,map,'day'))||combined.day;
        if(!day)throw new Error('缺少星期');
        let ws;const wtext=cell(row,map,'weeks');if(wtext)ws=weeks(wtext,total);else ws=combined.weeks||Array.from({length:total},(_,n)=>n+1);
        let sections=parseSections(cell(row,map,'sections'))||combined.sections;
        let range=(cell(row,map,'start')&&cell(row,map,'end'))?[cell(row,map,'start'),cell(row,map,'end')]:combined.range;
        const c={id:`edu-${Date.now().toString(36)}-${i}`,name,teacher:cell(row,map,'teacher'),position:cell(row,map,'position'),day,weeks:ws,remark:cell(row,map,'remark')||'教务导入',color:0};
        if(range){c.isCustomTime=true;c.customStartTime=time(range[0].length===4?'0'+range[0]:range[0]);c.customEndTime=time(range[1].length===4?'0'+range[1]:range[1]);}
        else if(sections){c.isCustomTime=false;c.startSection=sections[0];c.endSection=sections[1];}
        else throw new Error('缺少节次或起止时间');
        courses.push(c);
      }catch(e){warnings.push(`第 ${i+1} 行「${name}」：${e.message||e}`);}
    }
    if(!courses.length)fail('表格已读取，但没有成功解析出课程。请检查星期、周次、节次/时间列。'+(warnings[0]?`\n${warnings[0]}`:''));
    const normalized=normalize({courses,timeSlots:base.timeSlots,config});
    return {table:normalized,warnings,totalRows:rows.length-1};
  }
  function mergeTables(base,added){
    const key=c=>[c.name,c.day,c.weeks.join(','),c.isCustomTime?'t'+c.customStartTime+'-'+c.customEndTime:'s'+c.startSection+'-'+c.endSection,c.position].join('|');
    const seen=new Set(base.courses.map(key));const incoming=added.courses.filter(c=>!seen.has(key(c)));
    return normalize({...base,config:{...base.config,...added.config},courses:[...base.courses,...incoming]});
  }

  const escapeIcs=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  function ics(table){const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Le Time Management//Schedule//ZH','CALSCALE:GREGORIAN'];
    for(let w=1;w<=table.config.semesterTotalWeeks;w++)for(const c of occurrences(table,w))lines.push('BEGIN:VEVENT','UID:'+encodeURIComponent(c.id)+'-'+c.date+'@le-time-management','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART:'+c.date.replace(/-/g,'')+'T'+c.start.replace(':','')+'00','DTEND:'+c.date.replace(/-/g,'')+'T'+c.end.replace(':','')+'00','SUMMARY:'+escapeIcs(c.name),'LOCATION:'+escapeIcs(c.position),'DESCRIPTION:'+escapeIcs([c.teacher,c.remark].filter(Boolean).join('\n')),'END:VEVENT');lines.push('END:VCALENDAR');
    return lines.map(line=>{let result='',bytes=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(bytes+n>75){result+='\r\n ';bytes=1;}result+=ch;bytes+=n;}return result;}).join('\r\n')+'\r\n';
  }
  root.ShiguangModel={empty,normalize,weeks,times,occurrences,conflicts,packs,ics,weekOf,monday,addDays,format,minutes,parseAcademicText,mergeTables,textRows};
})(typeof module!=='undefined'?module.exports:globalThis);
