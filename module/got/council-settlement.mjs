import {councilContracts} from './council-v3-runner.mjs';
import {phaseInput,ensure} from './dialogue-core.mjs';
import {compileTask,displayText} from './generation-core.mjs';
import {parseMiddlewareJson} from './middleware-json.mjs';
import {liveCouncil} from './council-session.mjs';
import {requireCharacterInput} from './character-state.mjs';

export async function runCouncilExtraction(r,id,{retry=false}={}){
 if(r.postBusy)return false;r.postBusy=true;r.notify(r);
 try{return await r.postLock(async()=>{
  const g=r.runtime.read(),m=liveCouncil(g),turn=m?.session.turns.find(t=>t.id===id),job=turn?.extraction;
  ensure(job&&job.status!=='done','EXTRACTION_NOT_PENDING');
  const branch=g.revision.branch_id,revision=job.revision,abort=new AbortController();r.postAbort=abort;
  const current=()=>{const state=r.runtime.read(),meeting=liveCouncil(state);ensure(state.revision.branch_id===branch&&meeting?.id===m.id&&meeting.session.agenda.find(q=>q.id===turn.issue)?.revision===revision,'STALE_COUNCIL_EXTRACTION');};
  const commit=async action=>{current();const saved=await r.runtime.commit(r.runtime.prepareSettlementAction(action));ensure(saved.status==='committed',saved.validation.code);r.notify(r);};
  let snapshot=job.snapshot,response=job.response;
  const key=branch+'|'+id,cached=r.postResults.get(key);if(cached){snapshot=cached.snapshot;response=cached.response;}
  if(retry&&job.status==='failed'&&!cached){snapshot=null;response=null;}
  const checkpoint=async(status,error=null,proposals=[])=>commit({type:'council_v3_extract',turn_id:id,branch,status,snapshot,response,error,proposals});
  try{
   if(!snapshot){const input=phaseInput(turn.context,turn.pre,turn.prose,'post');snapshot=compileTask(turn.settings,'post',input,r.builder,'normal','',councilContracts.extract);requireCharacterInput(snapshot,input);ensure(snapshot.compiled.messages.some(m=>m.content.includes(councilContracts.extract)),'预设缺少方案整理合同，请在原预设面板检查；未发送请求。');}
   if(!response){await checkpoint('running');response=await r.call(snapshot,()=>{},abort.signal);current();ensure(!abort.signal.aborted,'DIALOGUE_CANCELLED');r.postResults.set(key,{snapshot,response});}
   await checkpoint('ready');ensure(!response.finishReason||response.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
   const result=parseMiddlewareJson(displayText(snapshot.compiled.prefix||'',response.content));
   await checkpoint('done',null,result.proposals);r.postResults.delete(key);return true;
  }catch(e){r.postError=e.message;if(!['SAVE_FAILED','STALE_COUNCIL_EXTRACTION'].includes(e.message))try{await checkpoint('failed',e.message);r.postResults.delete(key);}catch{}throw e;}
  finally{r.postAbort=null;}
 });}finally{r.postBusy=false;r.notify(r);setTimeout(()=>r.pumpPost(),0);}
}
