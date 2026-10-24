import {parseMiddlewareJson} from './middleware-json.mjs';
import {buildCharacterReview,actorEvidence} from './dialogue-core.mjs';
import {characterContract,characterText,checkCharacter,pendingCharacters,requireCharacterInput} from './character-state.mjs';
import {compileTask,displayText} from './generation-core.mjs';
const copy=structuredClone,need=(v,m)=>{if(!v)throw Error(m);};
// Reuses the existing middleware connection, preset compiler, request lock and debug storage.
export async function reviewCharacters(runner){
 need(!runner.runtime.read().dialogue.turns.some(t=>t.settlement&&!['done','partial'].includes(t.settlement.status)),'请先在待办事项中完成相关对白整理，再核对人物态度。');need(!runner.busy,'DIALOGUE_BUSY');need(!runner.draft||['done','discarded','stale'].includes(runner.draft.status),'PENDING_DIALOGUE_EXISTS');
 runner.busy=true;runner.notify(runner);
 try{return await runner.lock(async()=>{
  runner.abort=new AbortController();const name=runner.record+'-character-review';
  let checkpoint=await runner.storage.readGotGenerationRecord(name),revision=checkpoint?.revision??null;
  const persist=async value=>{const next={...copy(value),revision:(revision||0)+1};await runner.storage.writeGotGenerationRecord(name,next,revision);revision=next.revision;checkpoint=next;};
  for(const actor of pendingCharacters(runner.runtime.read(),actorEvidence)){
   const c=buildCharacterReview(runner.runtime.read(),actor);need(!(c.character.state.pending&&JSON.stringify(c.character.state.reviewed)===JSON.stringify(c.character.signals)),'CHARACTER_AUTHOR_GAP');const binding=c.branch+'|'+c.world+'|'+actor;
   if(checkpoint?.binding!==binding){
    const contract='只返回一次人物态度判断JSON，字段为mode、attitude、explanation、basis，不输出对白或行动。'+characterContract;
    const input={user:'乔弗里',char:actor,personality:c.personality.text+characterText(c),scenario:'关键剧情前检查尚未解释的新经历。不是会面，不产生人物发言，也不把判断告诉国王。',known:JSON.stringify({known:c.known,character:c.character}),guidance:'维持与改变都要有依据；没有合适作者档案用unsupported，不强迫判负。',input:'整理当前态度。',latest:'',previous:[],recent:[],recalled:[]};
    const snapshot=compileTask(copy(runner.client.settings),'pre',input,runner.builder,'normal','',contract);requireCharacterInput(snapshot,input);
    need(snapshot.compiled.messages.some(m=>m.content.includes(contract)),'预设缺少人物判断合同。');
    await persist({binding,context:c,snapshot,result:null,response:null,candidate:null,status:'pending'});
   }
   if(checkpoint.status==='failed'&&checkpoint.retry_response===true||(checkpoint.status==='failed'&&checkpoint.response?.finishReason&&checkpoint.response.finishReason!=='stop'))await persist({...checkpoint,response:null,result:null,retry_response:false,status:'pending'});
   const current=()=>need(runner.runtime.read().revision.branch_id===c.branch&&runner.runtime.read().revision.state_id===c.world,'STALE_DIALOGUE_CONTEXT');
   try{
    if(!checkpoint.result){
     current();await persist({...checkpoint,status:'running'});
     // No automatic retry. A complete response is saved before parsing or committing.
     if(!checkpoint.response){const response=await runner.call(checkpoint.snapshot,()=>{},runner.abort.signal);current();need(!runner.abort.signal.aborted,'DIALOGUE_CANCELLED');await persist({...checkpoint,response});}
     const response=checkpoint.response;need(!response.finishReason||response.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
     const result=parseMiddlewareJson(displayText(checkpoint.snapshot.compiled.prefix||'',response.content));checkCharacter(c,result);await persist({...checkpoint,result,status:'ready'});
    }
    current();if(!checkpoint.candidate)await persist({...checkpoint,candidate:runner.runtime.prepareAction({type:'dialogue_review_character',context:c,result:checkpoint.result})});
    const result=await runner.runtime.commit(checkpoint.candidate);need(result.status==='committed',result.validation.code);
    await persist({...checkpoint,status:'done'});need(!runner.runtime.read().dialogue.agendas[actor].character.pending,'CHARACTER_AUTHOR_GAP');
   }catch(e){await persist({...checkpoint,status:'failed',error:e.message,retry_response:!!checkpoint.response&&!checkpoint.result&&(e instanceof SyntaxError||/MIDDLEWARE_JSON/.test(e.message)||/^(CHARACTER_(FIELDS|FORMAT|NOT_AUTHORED|UNKNOWN_EVIDENCE|KEEP_CHANGED|CHANGE_WITHOUT_EXPERIENCE|CONTEXT_MISSING)|INCOMPLETE_MODEL_RESPONSE)$/.test(e.message))});throw e;}
  }
 });}finally{runner.busy=false;runner.abort=null;runner.notify(runner);}
}
