// GOT adaptation of summaryRunner's persistent buffer and memoryRecall's layered context.
// Facts, promises and original dialogue stay in the existing world save.
const copy=structuredClone;
const narrative=t=>'【对白已发生；结果尚待整理】乔弗里：'+t.input+'\n'+t.actor+'：'+t.prose;
const assert=(v,m)=>{if(!v)throw Error(m);};
export const memoryDefaults={autoSummary:false,autoResume:false,autoRetry:false,retryLimit:0,retrieval:false,rerank:false};
export const estimate=text=>Math.ceil((text.match(/[\u4e00-\u9fff]/g)||[]).length+(text.replace(/[\u4e00-\u9fff]/g,'').length/4));
export function initializeMemory(g){g.memory??={version:1,jobs:[],summaries:[]};}
export function visibleTurns(g,actor){return (g.dialogue?.turns||[]).filter(t=>t.audience.includes(actor)&&t.at<=g.clock.elapsed_minutes);}
export function turnRecord(t){return {id:t.id,at:t.at,activity:t.activity,text:t.post?.summary||'',audience:[...t.audience]};}
export function summarySources(g,actor,ids){const all=new Map(visibleTurns(g,actor).map(t=>[t.id,turnRecord(t)]));return ids.map(id=>{const r=all.get(id);assert(r&&r.text,'总结来源缺失或人物没有听见。');return r;});}
export function queueMemory(g,{force=false}={}){
 initializeMemory(g);if(!g.dialogue?.turns.length)return;
 const actors=[...new Set(g.dialogue.turns.flatMap(t=>t.audience).filter(x=>x!=='U001'))];
 for(const actor of actors){
  const covered=new Set(g.memory.jobs.filter(j=>j.actor===actor).flatMap(j=>j.sources.map(s=>s.id)));
  const available=visibleTurns(g,actor).filter(t=>t.post?.summary&&!covered.has(t.id));
  const activities=[...new Set(available.map(t=>t.activity))];
  for(const activity of activities){const rows=available.filter(t=>t.activity===activity);const ended=g.activities.find(a=>a.id===activity)?.status!=='active';
   while(rows.length){const soft=estimate(rows.map(t=>t.post?.summary).join('\n'))>=70000;
    if(!force&&!ended&&rows.length<20&&!soft)break;
    const sources=rows.splice(0,20).map(turnRecord);
    g.memory.jobs.push({id:'MEM-'+(++g.execution.serial),actor,branch:g.revision.branch_id,sources,status:'pending',attempts:0,snapshot:null,result:null,error:null});
   }
  }
 }
}
export function rebranchMemory(g){initializeMemory(g);for(const j of g.memory.jobs){j.branch=g.revision.branch_id;if(j.status==='running'){j.status='pending';j.error='读档后需手动恢复。';}j.snapshot=null;if(j.status!=='done')j.result=null;}}
export function checkJob(g,id,branch){const j=g.memory?.jobs.find(j=>j.id===id);assert(j&&j.branch===branch&&g.revision.branch_id===branch,'旧分支总结不能写入当前存档。');assert(JSON.stringify(summarySources(g,j.actor,j.sources.map(s=>s.id)))===JSON.stringify(j.sources),'总结来源已经改变。');return j;}
export function checkSummary(job,result){
 assert(result&&Array.isArray(result.entries)&&result.entries.length>0&&result.entries.length<=20,'总结须包含1至20条记录。');
 const allowed=new Set(job.sources.map(s=>s.id)),used=new Set();
 for(const e of result.entries){assert(Object.keys(e).sort().join('|')==='refs|text'&&typeof e.text==='string'&&e.text.length>0&&e.text.length<=1500&&Array.isArray(e.refs)&&e.refs.length&&e.refs.every(r=>allowed.has(r)),'总结包含未知来源或格式无效。');e.refs.forEach(r=>used.add(r));}
 assert(used.size===allowed.size,'总结遗漏来源；保留原摘要，未替换。');return result;
}
export function applyMemoryAction(g,a){
 initializeMemory(g);
 if(a.type==='memory_queue'){queueMemory(g,{force:true});return 'MEMORY_QUEUED';}
 const j=checkJob(g,a.job_ref,a.branch);
 if(a.type==='memory_begin'){
  assert(['pending','failed','running'].includes(j.status),'总结已经处理。');assert(a.snapshot&&a.snapshot.stage==='summary','总结请求无效。');
  j.status='running';j.attempts++;j.snapshot??=copy(a.snapshot);j.error=null;return 'MEMORY_STARTED';
 }
 if(a.type==='memory_result'){assert(j.status==='running','总结不在运行中。');checkSummary(j,a.result);j.result=copy(a.result);j.response=copy(a.response);return 'MEMORY_RESULT_SAVED';}
 if(a.type==='memory_finish'){
  assert(j.status==='running'&&j.result,'没有完整总结可提交。');checkSummary(j,j.result);
  if(!g.memory.summaries.some(s=>s.id===j.id))g.memory.summaries.push({id:j.id,actor:j.actor,sources:copy(j.sources),entries:copy(j.result.entries),at:Math.max(...j.sources.map(s=>s.at))});
  j.status='done';return 'MEMORY_COMMITTED';
 }
 if(a.type==='memory_fail'){assert(j.status!=='done','总结已经完成。');j.status='failed';j.error=String(a.error).slice(0,1000);j.failures??=[];j.failures.push({error:j.error,diagnostic:copy(a.diagnostic??null)});return 'MEMORY_FAILED';}
 throw Error('未知记忆操作。');
}
export function memoryErrors(m,g){if(m===undefined)return [];try{
 assert(m.version===1&&Array.isArray(m.jobs)&&Array.isArray(m.summaries),'记忆资料格式不兼容。');
 assert(new Set(m.jobs.map(j=>j.id)).size===m.jobs.length,'总结任务编号重复。');
 for(const j of m.jobs){assert(['pending','running','failed','done'].includes(j.status)&&Number.isInteger(j.attempts),'总结状态无效。');assert(JSON.stringify(summarySources(g,j.actor,j.sources.map(s=>s.id)))===JSON.stringify(j.sources),'总结来源不一致。');}
 for(const s of m.summaries){const j=m.jobs.find(j=>j.id===s.id&&j.actor===s.actor&&j.status==='done');assert(j&&JSON.stringify(j.sources)===JSON.stringify(s.sources),'长期总结没有对应来源。');checkSummary(j,{entries:s.entries});}
 return [];
 }catch(e){return [e.message];}}
export function memoryMaterials(g,actor,retrieved=[]){
 const turns=visibleTurns(g,actor),last=turns.at(-1),all=new Map(turns.map(t=>[t.id,turnRecord(t)]));
 const long=(g.memory?.summaries||[]).filter(s=>s.actor===actor&&s.sources.every(src=>all.has(src.id)&&all.get(src.id).text===src.text));
 const covered=new Set(long.flatMap(s=>s.sources.map(t=>t.id)));
 const unsummarized=turns.filter(t=>t.id!==last?.id&&!covered.has(t.id)),recent=unsummarized.slice(-20),fallback=unsummarized.slice(0,-20);
 const recall=[];for(const r of retrieved){const original=all.get(r.id);assert(original&&original.text===r.text&&r.id!==last?.id,'检索结果不属于此人物或来源已改变。');if(!recent.some(t=>t.id===r.id)&&!recall.some(t=>t.id===r.id))recall.push(original);}
 return {latest:last?{ref:last.id,kind:'heard_dialogue',content:(last.post?'':'【对白已发生；结果尚待整理】')+`乔弗里：${last.input}\n${last.actor}：${last.prose}`,at:last.at,source:last.actor}:null,
  long:[...long.map(s=>({ref:s.id,kind:'long_summary',content:s.entries.map(e=>e.text).join('\n'),at:s.at,source:actor})),...fallback.filter(t=>!recall.some(r=>r.id===t.id)).map(t=>({ref:t.id,kind:'long_summary',content:t.post?.summary||narrative(t),at:t.at,source:t.actor}))].sort((a,b)=>a.at-b.at),
  recent:recent.map(t=>({ref:t.id,kind:'heard_summary',content:t.post?.summary||narrative(t),at:t.at,source:t.actor})),
  recalled:recall.map(t=>({ref:t.id,kind:'recalled_summary',content:t.text,at:t.at,source:actor})),
  missing:turns.filter(t=>!t.post?.summary).map(t=>t.id)};
}
export const summaryContract='你是人物记忆整理助手。只读给定人物实际听见的摘要，输出JSON：{"entries":[{"text":"具体经历，区分说过、相信、承诺和已执行","refs":["来源id"]}]}。每条不超过1500字；每个来源必须被引用。保留约定、未决问题、不同解释和传闻的不确定性。不补原著秘密，不把承诺写成完成，不改变世界。';
