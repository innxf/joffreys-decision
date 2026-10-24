import {ensure} from './dialogue-core.mjs';
import {displayText} from './generation-core.mjs';
import {parseMiddlewareJson} from './middleware-json.mjs';

// Jobs live on their original turns; only the request currently in flight lives
// here. A reload never starts a paid request.
export async function settleDialogue(r,id,{retry=false}={}){
 if(r.postBusy)return false;
 const initial=r.runtime.read(),turn=initial.dialogue.turns.find(t=>t.id===id),job=turn?.settlement;
 ensure(job&&!['done','partial'].includes(job.status),'SETTLEMENT_NOT_PENDING');
 if(initial.dialogue.turns.some(t=>t.actor===turn.actor&&initial.dialogue.turns.indexOf(t)<initial.dialogue.turns.indexOf(turn)&&t.settlement&&!['done','partial'].includes(t.settlement.status)))return false;
 r.postBusy=true;r.notify(r);
 try{return await r.postLock(async()=>{
  const branch=initial.revision.branch_id,abort=new AbortController();r.postAbort=abort;
  const current=()=>{const g=r.runtime.read();ensure(g.revision.branch_id===branch&&g.dialogue.turns.some(t=>t.id===id&&t.prose===turn.prose),'STALE_SETTLEMENT');return g;};
  const commit=async action=>{current();const result=await r.runtime.commit(r.runtime.prepareSettlementAction(action));ensure(result.status==='committed',result.validation.code);r.notify(r);};
  let snapshot=job.snapshot,response=job.response;
  const cached=r.postResults.get(branch+'|'+id);if(cached){snapshot=cached.snapshot;response=cached.response;}
  const checkpoint=async(status,error=null)=>commit({type:'dialogue_post_checkpoint',turn_id:id,branch,status,snapshot,response,error});
  try{
   if(retry&&job.status==='failed'&&!cached){response=null;snapshot=null;}
   snapshot??=r.compile(turn.context,turn.pre,turn.prose,'post',job.settings);
   if(!response){
    await checkpoint('running');
    response=await r.call(snapshot,()=>{},abort.signal);current();ensure(!abort.signal.aborted,'DIALOGUE_CANCELLED');
    r.postResults.set(branch+'|'+id,{snapshot,response});
   }
   await checkpoint('ready');
   ensure(!response.finishReason||response.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
   const result=parseMiddlewareJson(displayText(snapshot.compiled.prefix||'',response.content));
   await commit({type:'dialogue_settle',turn_id:id,branch,result});r.postResults.delete(branch+'|'+id);return true;
  }catch(e){
   r.postError=e.message;
   if(e.message!=='SAVE_FAILED'&&e.message!=='STALE_SETTLEMENT')try{await checkpoint('failed',e.message);r.postResults.delete(branch+'|'+id);}catch{}
   throw e;
  }finally{r.postAbort=null;}
 });}finally{r.postBusy=false;r.notify(r);setTimeout(()=>r.pumpPost(),0);}
}
export function scheduleSettlements(r,id){r.postQueue.add(id);setTimeout(()=>r.pumpPost(),0);}
