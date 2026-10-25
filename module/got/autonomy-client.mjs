import {requireCharacterInput} from './character-state.mjs';
import {parseMiddlewareJson} from './middleware-json.mjs';
// Reuses M3 requests/presets and the existing unique GOT commit, without prose generation.
import {jobContext,checkJudgment,executionContract} from './autonomy-core.mjs';
import {compileTask,displayText} from './generation-core.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const parse=parseMiddlewareJson;
export class AutonomyClient{
 constructor({runtime,client,builder,notify=()=>{},isBusy=()=>false,lock,enabled=false}){Object.assign(this,{runtime,client,builder,notify,isBusy,enabled});this.busy=false;this.status='';this.lock=lock||((fn)=>navigator.locks.request('got-generation-request',{ifAvailable:true},async l=>{need(l,'另一个请求正在进行。');return fn();}));}
 async commit(action){const r=await this.runtime.commit(this.runtime.prepareBackgroundAction(action));need(r.status==='committed',r.validation.code);return r;}
 cancel(){this.abort?.abort();}
 preview(id){const context=jobContext(this.runtime.read(),id);const input={user:'乔弗里',char:context.personality.name,personality:context.personality.personality,scenario:'执行者处理已经送达的委托；没有现场玩家发言。',known:JSON.stringify(context.known),guidance:JSON.stringify({character:context.character,scope:context.scope,reason:context.reason,priorities:context.personality.priorities}),input:'请对本人收到的工作作出答复；不代替他人接受。'};
  const snapshot=compileTask(this.client.settings,'execution',input,this.builder,'normal','',executionContract);requireCharacterInput(snapshot,input);need(snapshot.compiled.messages.some(m=>m.content.includes(executionContract)),'执行预设缺少任务合同。');return {context,snapshot};}
 async run(id){need(!this.busy&&!this.isBusy(),'请先完成当前对话或后台请求。');need(!this.unsaved,'已有完整结果等待保存，请勿重发。');this.busy=true;this.notify();let branch,response=null,context,snapshot,expectedWorld;
  try{return await this.lock(async()=>{this.abort=new AbortController();const initial=this.runtime.read(),job=initial.autonomy.jobs.find(j=>j.id===id);need(job,'执行判断不存在。');branch=initial.revision.branch_id;
   try{
    if(job.status==='running'&&job.result){await this.commit({type:'autonomy_finish',job_ref:id,branch});this.status='已保存判断结果，没有重新请求。';return;}
    if(job.status==='running')await this.commit({type:'autonomy_fail',job_ref:id,branch,error:'上次请求中断；本次由用户重新开始。',diagnostic:null});
    ({context,snapshot}=this.preview(id));await this.commit({type:'autonomy_begin',job_ref:id,branch,context,snapshot});expectedWorld=this.runtime.read().revision.state_id;
    response=await this.client.request(snapshot,null,this.abort.signal);need(!this.abort.signal.aborted,'请求已取消。');need(this.runtime.read().revision.branch_id===branch&&this.runtime.read().revision.state_id===expectedWorld,'判断期间世界已变化，旧结果没有采用。');
    need(response.finishReason==='stop','执行判断未完整结束。');const result=parse(displayText(snapshot.compiled.prefix||'',response.content));checkJudgment(context,result);
    // Keep a complete result in memory if its first durable write fails. Retry only that write.
    this.unsaved={id,branch,expectedWorld,action:{type:'autonomy_result',job_ref:id,branch,source_world:context.world,result,response}};
    await this.commit(this.unsaved.action);this.unsaved=null;
    await this.commit({type:'autonomy_finish',job_ref:id,branch});this.status='执行者的答复已保存；国王仍须等待回报送达。';
   }catch(e){this.status=e.message;
    const current=this.runtime.read(),j=current.autonomy.jobs.find(x=>x.id===id);
    if(current.revision.branch_id===branch&&j?.status==='running'&&!j.result&&!this.unsaved){try{await this.commit({type:'autonomy_fail',job_ref:id,branch,error:e.message,diagnostic:response||e.diagnostic||null});}catch{}}
    throw e;
   }
  });}finally{this.abort=null;this.busy=false;this.notify();}
 }
 async saveRetry(){const s=this.unsaved;need(s,'没有待保存结果。');need(this.runtime.read().revision.branch_id===s.branch&&this.runtime.read().revision.state_id===s.expectedWorld,'存档已经变化，不能保存旧判断。');await this.commit(s.action);this.unsaved=null;await this.commit({type:'autonomy_finish',job_ref:s.id,branch:s.branch});this.status='已有结果保存成功，没有重新请求。';this.notify();}
 async pump(){if(this.pumping||this.busy||this.isBusy())return;const g=this.runtime.read();if(g.finale?.freeze)return;this.pumping=true;
  try{
   if(this.enabled&&this.client.settings.execution?.automatic){let job;while((job=this.runtime.read().autonomy.jobs.find(j=>j.status==='pending'))){try{await this.run(job.id);}catch{break;}}}
   if(!this.busy&&!this.isBusy()&&this.runtime.read().autonomy.checkpoint){try{await this.commit({type:'autonomy_continue_time'});}catch(e){this.status=e.message;}this.notify();}
  }finally{this.pumping=false;}
 }
}
