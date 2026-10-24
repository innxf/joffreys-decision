import {visibleTurns,turnRecord,checkJob,checkSummary,summaryContract} from './memory-core.mjs';
import {compileTask,displayText} from './generation-core.mjs';
const parse=s=>JSON.parse(s.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
const assert=(v,m)=>{if(!v)throw Error(m);};
export class MemoryClient {
 constructor({runtime,client,storage,namespace='',builder,upstream,notify=()=>{},isDialoguePending=()=>false,lock}){
  Object.assign(this,{runtime,client,storage,namespace,builder,upstream,notify,isDialoguePending});this.status='';this.indexBusy=false;
  this.lock=lock||((fn)=>navigator.locks.request('got-generation-request',{ifAvailable:true},async l=>{if(!l)throw Error('另一个任务正在请求服务。');return fn();}));
  const commit=async a=>{const r=await runtime.commit(runtime.prepareAction(a));assert(r.status==='committed',r.validation.code);};this.commit=commit;
  this.worker=upstream.summary.createScopedRunner({lock:this.lock,changed:()=>notify(),
   begin:async id=>{assert(!isDialoguePending(),'请先完成或放弃当前对话草稿。');const g=runtime.read(),j=g.memory.jobs.find(j=>j.id===id);assert(j,'总结任务不存在。');
    const input={char:j.actor,user:'乔弗里',personality:'只整理此人的实际经历，不新增人格判断。',scenario:'后台记忆整理，不推进游戏时间。',known:JSON.stringify({actor:j.actor,sources:j.sources}),input:'整理这些已发生的对话记录。',previous:[],recent:[],recalled:[],latest:'',guidance:''};
    const snapshot=j.snapshot||compileTask(client.settings,'summary',input,builder,'normal','',summaryContract);
    assert(snapshot.compiled.messages.some(m=>m.content.includes(summaryContract)),'总结预设缺少输出合同，请先补齐预设条目。');
    const job={...structuredClone(j),snapshot,branch:g.revision.branch_id};await commit({type:'memory_begin',job_ref:id,branch:job.branch,snapshot});return job;
   },
   request:async(job,signal)=>{const snapshot={...job.snapshot,id:crypto.randomUUID()};job.requestId=snapshot.id;const r=await client.request(snapshot,null,signal);job.response=r;assert(r.finishReason==='stop','总结没有完整结束。');const result=parse(displayText(snapshot.compiled.prefix||'',r.content));checkSummary(job,result);return result;},
   storeResult:async(job,result)=>{checkJob(runtime.read(),job.id,job.branch);await commit({type:'memory_result',job_ref:job.id,branch:job.branch,result,response:job.response??null});},
   complete:async job=>{await commit({type:'memory_finish',job_ref:job.id,branch:job.branch});this.status='总结已保存；原文仍保留。';},
   fail:async(job,e)=>{this.status='总结未采用：'+e.message+'；原摘要仍可使用。';try{await commit({type:'memory_fail',job_ref:job.id,branch:job.branch,error:e.message,diagnostic:{requestId:job.requestId??null,response:job.response??e.diagnostic??null}});}catch{}this.notify();}
  });
 }
 async saveConfig(ui){const old=this.client.settings.memory?.connection;
  const config=await this.client.local('memory-config',{endpoint:ui.endpoint,model:ui.model,rerankModel:ui.rerankModel,key:ui.key||'',previousId:old?.id});
  const next=structuredClone(this.client.settings);next.memory={...next.memory,connection:config,retrieval:!!ui.enabled};await this.client.saveSettings(next);this.status='记忆连接已保存；未请求向量服务。';this.notify();
 }
 async vector(operation,payload,config,signal){if(signal?.aborted)throw new DOMException('已取消','AbortError');const r=await this.client.local('memory-vector',{id:crypto.randomUUID(),configId:config.id,operation,...payload},true,signal);if(signal?.aborted)throw new DOMException('已取消','AbortError');return r;}
 async embed(texts,config,signal){return this.upstream.embedding.embed(texts,{gotRequest:body=>this.vector('embed',body,config,signal)});}
 engine(config){return JSON.stringify([config.endpoint,config.model,'turn-summary-v1']);}
 async rebuild(actor,{confirm}={}){
  assert(!this.indexBusy,'索引正在处理。');assert(!this.isDialoguePending(),'请先完成或放弃当前对话草稿。');const config=this.client.settings.memory.connection;assert(config,'请先保存独立的记忆检索连接。');
  const g=this.runtime.read(),branch=g.revision.branch_id,sources=visibleTurns(g,actor).filter(t=>t.post.summary).map(turnRecord),engine=this.engine(config);
  if(!sources.length){this.status='此人还没有可建索引的摘要。';this.notify();return;}
  if(confirm&&!await confirm(sources.length))return;
  this.indexBusy=true;this.indexAbort=new AbortController();this.notify();
  try{return await this.lock(async()=>{
   const prior=await this.storage.gotMemoryIndex(this.namespace,branch,actor);let cache=prior?.engine===engine?prior:{engine,dimension:null,records:[]};
   const needed=sources.filter(s=>!cache.records.some(r=>r.id===s.id&&r.text===s.text));
   for(let i=0;i<needed.length;i+=16){const batch=needed.slice(i,i+16),vectors=await this.embed(batch.map(s=>s.text),config,this.indexAbort.signal);
    assert(this.runtime.read().revision.branch_id===branch,'读档后停止旧分支索引。');
    const dim=vectors[0].length;assert(cache.dimension===null||cache.dimension===dim,'模型向量维度已改变；请清除当前人物索引后重建。');cache.dimension=dim;
    for(let j=0;j<batch.length;j++){cache.records=cache.records.filter(r=>r.id!==batch[j].id);cache.records.push({...batch[j],vector:Array.from(vectors[j]),fingerprint:engine+'|'+dim});}
    await this.storage.gotMemoryIndex(this.namespace,branch,actor,cache);this.status=`已建 ${Math.min(i+16,needed.length)}/${needed.length} 条；原记忆不变。`;this.notify();
   }
   this.status='索引已就绪；后续新增记录需要再次点击补建。';
  });}catch(e){this.status='索引停止：'+e.message+'；已完成批次保留，不自动重试。';throw e;}finally{this.indexBusy=false;this.indexAbort=null;this.notify();}
 }
 async clearIndex(actor){const g=this.runtime.read();await this.storage.gotMemoryIndex(this.namespace,g.revision.branch_id,actor,null);this.status='已清除可重建索引，原文和摘要保留。';this.notify();}
 async recall(context,settings,signal){
  const disabled=warning=>({records:[],warning});const cfg=settings.memory;
  if(!cfg?.retrieval||!cfg.connection)return disabled('未启用或未配置语义检索；使用已有摘要和长期总结。');
  try{
   const g=this.runtime.read();assert(g.revision.branch_id===context.branch,'分支已改变。');
   const cache=await this.storage.gotMemoryIndex(this.namespace,context.branch,context.actor),engine=this.engine(cfg.connection);
   if(!cache||cache.engine!==engine)return disabled('没有当前模型的索引；使用已有摘要，可手动重建。');
   const turns=visibleTurns(g,context.actor),allowed=new Map(turns.map(t=>[t.id,turnRecord(t)])),exclude=turns.slice(-21).map(t=>t.id);
   const candidates=cache.records.filter(r=>allowed.get(r.id)?.text===r.text&&r.at<=context.at&&!exclude.includes(r.id));
   if(!candidates.length)return disabled('没有已建索引的旧记忆候选；继续使用近期摘要。');
   // Only the actor's current utterance is sent as query. Never search globally before filtering.
   const [query]=await this.embed([context.input],cfg.connection,signal);
   if(query.length!==cache.dimension)return disabled('向量维度变化，旧索引未混用；请手动重建。');
   let ranked=this.upstream.recall.rankScoped(candidates,query,engine+'|'+query.length,exclude,15,3000),warning=null;
   if(cfg.rerank&&ranked.length>1){try{ranked=await this.upstream.reranker.rerankEvents(context.input,ranked,{topN:15,gotRequest:body=>this.vector('rerank',body,cfg.connection,signal)});}catch(e){warning='精排失败，沿用相似度结果：'+e.message;}}
   if(cache.records.length<turns.length)warning=(warning?warning+'；':'')+'部分新摘要尚未建索引。';
   return {records:ranked.map(r=>({id:r.id,text:r.text})),warning,engine,dimension:cache.dimension};
  }catch(e){if(signal?.aborted)throw e;return disabled('本轮检索未完成：'+e.message+'；已有摘要仍可用。');}
 }
 schedule({resume=false}={}){
  const options=this.client.settings.memory;if(!options?.autoSummary||resume&&!options.autoResume||this.worker.isRunning()||this.indexBusy||this.isDialoguePending())return;
  const g=this.runtime.read();if(g.finale?.freeze)return;
  const failed=g.memory.jobs.find(j=>j.status==='failed');const next=failed?(options.autoRetry&&failed.attempts<=options.retryLimit?failed:null):g.memory.jobs.find(j=>j.status==='pending');
  if(next)this.worker.run(next.id).then(()=>this.schedule()).catch(e=>{
   if(e.name!=='AbortError'&&this.runtime.read().memory.jobs.find(j=>j.id===next.id)?.status==='failed')setTimeout(()=>this.schedule(),0);
  });
 }
}
