import {runCouncilExtraction} from './council-settlement.mjs';
import {settleDialogue,scheduleSettlements} from './dialogue-settlement.mjs';
import {parseMiddlewareJson} from './middleware-json.mjs';
import {councilEvidence} from './middleware-evidence.mjs';
import {currentDaily} from './daily-engine.mjs';
import {freezeCanonFrame,selectLocalCanon,compileWithCanon} from './canon-reference.mjs';
import {requireCharacterInput} from './character-state.mjs';
import {reviewCharacters} from './character-review-runner.mjs';
import {runCouncilWork} from './council-v3-runner.mjs';
// Sequencing adapted from archived DialogueRunner; transport/compiler/storage remain M3/upstream.
import {audience,buildContext,checkPre,checkPost,phaseInput,taskContracts,dialogueContract,ensure} from './dialogue-core.mjs';
import {compileTask,displayText,proseText,failureStatus} from './generation-core.mjs';
import {liveCouncil,pendingCouncilBatch,checkCouncilBatch,councilBatchContract} from './council-session.mjs';
const clone=v=>structuredClone(v);
const parse=parseMiddlewareJson;
export class DialogueRunner {
 constructor({runtime,client,storage,record='dialogue',builder,call,notify=()=>{},lock,recall,canonSearch}){
  Object.assign(this,{runtime,client,storage,record,builder,notify,recall});this.draft=null;this.token=null;this.busy=false;
  this.postQueue=new Set();this.councilPostQueue=new Set();this.postResults=new Map();this.postBusy=false;this.postLock=lock||((fn)=>navigator.locks.request('got-settlement-request',{ifAvailable:true},async l=>{ensure(l,'BACKGROUND_BUSY');return fn();}));
  this.canonSearch=canonSearch||((payload,signal)=>client.local('canon-search',payload,true,signal));
  this.lock=lock||((fn)=>navigator.locks.request('got-generation-request',{ifAvailable:true},async l=>{if(!l)throw Error('另一个页面正在生成，请先在那里结束。');return fn();}));
  this.call=call||((s,onToken,signal)=>s.stream?new Promise((resolve,reject)=>{const h=window.apiService.sendMessagesStream(s.compiled.messages,{onToken,onComplete:(text,usage,r)=>resolve(r),onError:reject},{gotRequest:s});const cancel=()=>h.abort();signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();}):window.apiService.sendMessages(s.compiled.messages,{gotRequest:s,signal}));
 }
 async init(){this.draft=await this.storage.readGotGenerationRecord(this.record);this.token=this.draft?.revision??null;
  const savedCouncil=await this.storage.readGotGenerationRecord(this.record+'-council');
  if(savedCouncil?.binding?.startsWith(this.runtime.read().revision.branch_id+'|'))this.councilError=savedCouncil.error|| (savedCouncil.status==='running'?'上次整理尚未完成，文书仍未用印。':'');
  // Refresh is not permission to resend or to overwrite an active request in another tab.
  if(this.draft?.status==='running'){this.draft.status='interrupted';this.draft.error='上一轮尚未正式提交。可以恢复已有草稿；不会自动重发。';}
  this.notify(this);
 }
 async save(){const value={...clone(this.draft),revision:(this.token||0)+1};await this.storage.writeGotGenerationRecord(this.record,value,this.token);this.draft=value;this.token=value.revision;this.notify(this);}
 current(){const d=this.draft,g=this.runtime.read();if(d.version<2){ensure(g.revision.branch_id===d.context.branch&&g.revision.state_id===d.context.world,'STALE_DIALOGUE_CONTEXT');return;}const a=g.activities.find(a=>a.id===d.context.activity&&a.status==='active');ensure(g.revision.branch_id===d.context.branch&&g.clock.elapsed_minutes===d.context.at&&a?.node===d.context.node&&g.actors.some(x=>x.id===d.context.actor&&x.life==='存活')&&d.context.audience.includes(d.context.actor)&&d.context.audience.includes('U001')&&JSON.stringify(audience(g,d.context.activity))===JSON.stringify(d.context.audience),'STALE_DIALOGUE_CONTEXT');}
 async start(actor,activity,input){const g=this.runtime.read(),tod=(g.clock.elapsed_minutes+360)%1440;ensure(!g.opening?.household||tod<120||tod>=360||g.campaign?.scene==='battle'||g.opening?.visits.some(v=>v.scene==='barristan'&&v.activity===activity&&g.clock.elapsed_minutes<=(g.opening.invitation?.at||0)+180),'夜已深，请先收束当前活动并休息。');ensure(!this.busy,'DIALOGUE_BUSY');ensure(!this.draft||['done','discarded','stale'].includes(this.draft.status),'PENDING_DIALOGUE_EXISTS');
  this.draft={version:2,proseFormat:2,id:crypto.randomUUID(),context:buildContext(this.runtime.read(),actor,activity,input),settings:clone(this.client.settings),pre:null,prose:'',raw:'',complete:false,post:null,requests:[],failures:[],status:'pending',stage:'pre',error:null,commitCandidate:null};
  this.draft.canonFrame=freezeCanonFrame(this.runtime.read(),this.draft.context);
  return this.run();
 }
 preview(actor,activity,input){const c=buildContext(this.runtime.read(),actor,activity,input);return this.compile(c,null,'','pre',this.client.settings);}
 compile(c,pre,prose,phase,settings,canon=null){const input=phaseInput(c,pre,prose,phase),s=compileWithCanon(input,phase==='prose'?canon:null,p=>compileTask(settings,phase,p,this.builder,'normal','',dialogueContract(phase,c)));requireCharacterInput(s,input);
  ensure(s.compiled.messages.some(m=>m.content.includes(dialogueContract(phase,c))),'预设缺少本任务合同条目，请在原预设面板生成资料适配副本后重试。');return s;
 }
 compileCouncil(batch,settings){
  const input={user:'乔弗里',char:'会议书记',personality:'核对原话与最终裁决，不代替人物作出决定。',scenario:'散会前整理同一议题。尚未发令或执行。',
   known:JSON.stringify({council_batch:true,issue:batch.issue,resolution:batch.resolution,final_choice:batch.choice?{...batch.choice,text:batch.turns[0].context.meeting?.choices.find(c=>c[0]===batch.choice.choice)?.[1]}:null,...councilEvidence(batch,phaseInput)}),
   guidance:'mechanism_catalogue是共享的动作字段说明，每条仅使用其mechanisms_ref所指向的目录；这不会扩大该人物权限。evidence是去重后的证据表，每条只能使用allowed_evidence指向的条目，编号是数组下标。各人的资料分别限定。最后裁决为准，撤回的提案只保留讨论经历。有resolution时，只在选定方案的原发言中提取行动；有choice的固定方案由程序办理，不再生成任何candidate；conditions必须保留。主持提示不是国王说过的话。',input:'请逐条保存本项原话，只保留最后仍有效的行动与答复。',latest:'',previous:[],recent:[],recalled:[]};
  const s=compileTask(settings,'post',input,this.builder,'normal','',councilBatchContract);
  ensure(s.compiled.messages.some(m=>m.content.includes(councilBatchContract)),'预设缺少本任务合同条目，请在原预设面板生成资料适配副本后重试。');return s;
 }
 cancel(){this.abort?.abort();}
 async discard(){ensure(!this.busy,'DIALOGUE_BUSY');if(this.draft){this.draft.status='discarded';await this.save();}}
 async run(mode='retry'){
  ensure(!this.busy&&this.draft,'DIALOGUE_BUSY');
  this.busy=true;this.notify(this);
  try{return await this.lock(async()=>{this.abort=new AbortController();this.notify(this);let queue=Promise.resolve(),streamFailure=null;
   try{
    // A world save may have succeeded before the draft checkpoint failed.
    if(this.runtime.read().dialogue?.turns.some(t=>t.id===this.draft.id)||liveCouncil(this.runtime.read())?.session.turns.some(t=>t.id===this.draft.id)){this.draft.status='done';this.draft.stage='done';await this.save();return;}
    this.current();ensure(!['done','discarded'].includes(this.draft.status),'TURN_ALREADY_FINISHED');
    if(mode==='regenerate'){const stage=this.draft.pre?'prose':'pre';ensure(this.draft.pre||this.draft.version>=2,'NO_PRE_RESULT');for(const row of this.draft.requests.filter(x=>x.snapshot.stage===stage))row.superseded=true;this.draft.prose='';this.draft.raw='';this.draft.complete=false;this.draft.post=null;this.draft.commitCandidate=null;}
    this.draft.error=null;this.draft.status='running';await this.save();
    if(!this.draft.pre&&!this.draft.memorySelection){
     const c=this.draft.context,selection=this.recall?await this.recall(c,this.draft.settings,this.abort.signal):{records:[],warning:'未配置语义检索；继续使用已有摘要。'};
     this.current();this.draft.context=this.draft.version>=2?buildContext(this.runtime.read(),c.actor,c.activity,c.input,selection.records):clone(c);this.draft.context.personality=clone(c.personality);if(c.character)this.draft.context.character=clone(c.character);else delete this.draft.context.character;this.draft.memorySelection=selection;await this.save();
    }
    const request=async stage=>{
     this.current();ensure(!this.abort.signal.aborted,'DIALOGUE_CANCELLED');this.draft.stage=stage;
     const cached=this.draft.version>=2&&this.draft.requests.findLast(x=>x.snapshot.stage===stage&&x.response&&!x.superseded);
     if(cached){const response=cached.response;ensure(!response.finishReason||response.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');const value=stage==='prose'&&this.draft.proseFormat===2?proseText(cached.snapshot.compiled.prefix||'',response.content):displayText(cached.snapshot.compiled.prefix||'',response.content);if(stage==='prose'){this.draft.raw=response.content;this.draft.prose=value;this.draft.complete=true;await this.save();}return stage==='prose'?value:parse(value);}
     const s=this.compile(this.draft.context,this.draft.pre,this.draft.prose,stage,this.draft.settings,this.draft.canonSelection);
     const row={snapshot:s,response:null,diagnostic:null};this.draft.requests.push(row);await this.save();
     let raw='',last=0;
     try{
      const r=await this.call(s,delta=>{if(stage!=='prose')return;raw+=delta;this.draft.raw=raw;this.draft.prose=this.draft.proseFormat===2?proseText(s.compiled.prefix||'',raw,true):displayText(s.compiled.prefix||'',raw);this.notify(this);
       if(Date.now()-last>300){last=Date.now();queue=queue.then(()=>{this.current();return this.save();}).catch(e=>{streamFailure=e;this.abort.abort();});}
      },this.abort.signal);
      await queue;if(streamFailure)throw streamFailure;this.current();ensure(!this.abort.signal.aborted,'DIALOGUE_CANCELLED');
      this.draft.requests.find(x=>x.snapshot.id===s.id).response=clone(r);
      ensure(!r.finishReason||r.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
      const value=stage==='prose'&&this.draft.proseFormat===2?proseText(s.compiled.prefix||'',r.content):displayText(s.compiled.prefix||'',r.content);
      if(stage==='prose'){this.draft.raw=r.content;this.draft.prose=value;this.draft.complete=true;}await this.save();return stage==='prose'?value:parse(value);
     }catch(e){await queue;this.draft.requests.find(x=>x.snapshot.id===s.id).diagnostic=e.diagnostic||{message:e.message};if(stage==='prose'&&e.diagnostic?.content){this.draft.raw=e.diagnostic.content;this.draft.prose=this.draft.proseFormat===2?proseText(s.compiled.prefix||'',e.diagnostic.content,true):displayText(s.compiled.prefix||'',e.diagnostic.content);}throw e;}
    };
    if(!this.draft.pre){const p=await request('pre');this.draft.pre=checkPre(this.draft.context,p);if(this.draft.pre.guidance.length!==p.guidance.length)this.draft.requests.at(-1).diagnostic={code:'UNTYPED_GUIDANCE_OMITTED',count:p.guidance.length-this.draft.pre.guidance.length};await this.save();}
    if(!this.draft.complete&&this.draft.canonFrame&&!this.draft.canonSelection){this.draft.canonSelection=await selectLocalCanon(this.draft.canonFrame,this.draft.context,this.draft.pre,this.canonSearch,this.abort.signal);this.current();await this.save();}
    if(!this.draft.complete)await request('prose');
    if(liveCouncil(this.runtime.read())){
     this.current();this.draft.stage='save';
     this.draft.commitCandidate??=this.runtime.prepareAction({type:'council_say',turn_id:this.draft.id,context:this.draft.context,pre:this.draft.pre,prose:this.draft.prose,settings:this.draft.settings,request_records:this.draft.requests});
     await this.save();const r=await this.runtime.commit(this.draft.commitCandidate);ensure(r.status==='committed',r.validation.code);
     this.draft.status='done';this.draft.stage='done';await this.save();return;
    }
    if(this.draft.version>=2){
     this.current();this.draft.stage='save';
     const action={type:'dialogue_store_prose',turn_id:this.draft.id,context:this.draft.context,pre:this.draft.pre,prose:this.draft.prose,settings:this.draft.settings,request_records:this.draft.requests,canon:this.draft.canonSelection||null};
     this.draft.commitCandidate=this.runtime.prepareAction(action);await this.save();
     const result=await this.runtime.commit(this.draft.commitCandidate);ensure(result.status==='committed',result.validation.code);
     this.draft.status='done';this.draft.stage='done';await this.save();scheduleSettlements(this,this.draft.id);return;
    }
    if(!this.draft.post){const p=await request('post');checkPost(this.runtime.read(),this.draft.context,p,this.draft.prose);this.draft.post=p;await this.save();}
    this.current();this.draft.stage='save';
    this.draft.commitCandidate??=this.runtime.prepareAction({type:'dialogue_finish',turn_id:this.draft.id,context:this.draft.context,pre:this.draft.pre,prose:this.draft.prose,post:this.draft.post,request_records:this.draft.requests});
    await this.save();const r=await this.runtime.commit(this.draft.commitCandidate);ensure(r.status==='committed',r.validation.code);
    this.draft.status='done';this.draft.stage='done';await this.save();
   }catch(e){await queue;this.draft.status=e.message.startsWith('STALE')?'stale':e.message==='DIALOGUE_CANCELLED'?'cancelled':failureStatus(e);this.draft.error=e.message;this.draft.failures.push({stage:this.draft.stage,message:e.message,diagnostic:e.diagnostic||null});
    try{await this.save();}catch(saveError){this.draft.error+='；未能保存最新检查点：'+saveError.message;}
    this.notify(this);throw e;
   }finally{this.abort=null;}
  });}finally{this.busy=false;this.notify(this);}
 }
 async extractCouncil(id,options){return runCouncilExtraction(this,id,options);}
 async pumpCouncilPost(){return this.pumpPost();}
 async pumpPost(){
  if(this.postBusy||this.postPumping)return;this.postPumping=true;
  try{let progress=true;while(progress){progress=false;
   if(this.queueBranch!==this.runtime.read().revision.branch_id){this.postQueue.clear();this.councilPostQueue.clear();break;}
   for(const id of [...this.postQueue]){const job=this.runtime.read().dialogue.turns.find(t=>t.id===id)?.settlement;if(!job||['done','partial','failed'].includes(job.status)){this.postQueue.delete(id);continue;}try{if(await this.settle(id)){this.postQueue.delete(id);progress=true;}}catch{this.postQueue.delete(id);}}
   for(const id of [...this.councilPostQueue]){try{if(await this.extractCouncil(id)){this.councilPostQueue.delete(id);progress=true;}}catch{this.councilPostQueue.delete(id);}}
  }}finally{this.postPumping=false;}
 }
 async settle(id,options){return settleDialogue(this,id,options);}
 async runMeal(){
  ensure(!this.busy,'DIALOGUE_BUSY');
  let r=currentDaily(this.runtime.read());ensure(r?.queue?.status==='pending','没有尚待继续的席间话题。');
  while((r=currentDaily(this.runtime.read()))?.queue?.status==='pending'){
   const actor=r.queue.actors[r.queue.index];
   if(this.draft&&!['done','discarded','stale'].includes(this.draft.status)){ensure(this.draft.context.activity===r.activity&&this.draft.context.actor===actor,'请先处理原来的对话。');await this.run();}
   else await this.start(actor,r.activity,r.queue.input);
  }
 }
 async reviewCharacters(){return reviewCharacters(this);}
 async runCouncilWork(options){return runCouncilWork(this,options);}
 async registerCouncil({regenerate=false}={}){
  ensure(!this.busy,'DIALOGUE_BUSY');ensure(!this.draft||['done','discarded','stale'].includes(this.draft.status),'PENDING_DIALOGUE_EXISTS');
  this.councilError='';this.busy=true;this.notify(this);
  try{return await this.lock(async()=>{
   this.abort=new AbortController();
   const commit=async action=>{const r=await this.runtime.commit(this.runtime.prepareAction(action));ensure(r.status==='committed',r.validation.code);};
   if(liveCouncil(this.runtime.read())?.session.phase==='extra')await commit({type:'council_prepare'});
   const record=this.record+'-council';
   let checkpoint=await this.storage.readGotGenerationRecord(record),revision=checkpoint?.revision??null;
   const persist=async value=>{const v={...value,revision:(revision||0)+1};await this.storage.writeGotGenerationRecord(record,v,revision);revision=v.revision;checkpoint=v;};
   while(true){
    const g=this.runtime.read(),m=liveCouncil(g),batch=pendingCouncilBatch(m),t=batch?.turns[0];if(!t)break;
    const grouped=m.session.version>=2;
    const binding=g.revision.branch_id+'|'+m.id+'|'+(grouped?JSON.stringify([batch.issue,batch.turns.map(t=>t.id),batch.choice]):t.id);
    let saved=checkpoint?.binding===binding?checkpoint:null;
    if(regenerate&&saved?.status==='failed'){saved=null;regenerate=false;}
    // Already returned and checked output survives a failed world save. No second model call.
    if(!saved?.post){
     const cached=m.session.middleware_version===2?saved?.response:null;
     const world=g.revision.state_id,snapshot=cached?saved.snapshot:grouped?this.compileCouncil(batch,t.settings||this.client.settings):this.compile(t.context,t.pre,t.prose,'post',t.settings||this.client.settings);
     await persist({binding,status:'running',snapshot,post:null,...(cached?{response:cached}:{})});
     try{
      const r=cached||await this.call(snapshot,()=>{},this.abort.signal);
      ensure(!this.abort.signal.aborted,'DIALOGUE_CANCELLED');
      ensure(this.runtime.read().revision.state_id===world,'STALE_DIALOGUE_CONTEXT');
      await persist({...checkpoint,response:r});
      ensure(!r.finishReason||r.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
      const post=parse(displayText(snapshot.compiled.prefix||'',r.content));if(grouped)checkCouncilBatch(g,batch,post);else checkPost(g,t.context,post,t.prose);
      await persist({binding,status:'ready',post,request_record:{snapshot,response:r},world});saved=checkpoint;
     }catch(e){await persist({...checkpoint,status:'failed',error:e.message,diagnostic:e.diagnostic||null});throw e;}
    }
    ensure(this.runtime.read().revision.branch_id===g.revision.branch_id,'STALE_DIALOGUE_CONTEXT');
    if(!saved.candidate){const action=grouped?{type:'council_parse_issue',issue:batch.issue,result:saved.post,request_record:saved.request_record}:{type:'council_parse',turn_id:t.id,post:saved.post,request_record:saved.request_record};await persist({...saved,candidate:this.runtime.prepareAction(action)});saved=checkpoint;}
    const result=await this.runtime.commit(saved.candidate);ensure(result.status==='committed',result.validation.code);
   }
  });}catch(e){this.councilError=e.message;throw e;}finally{this.abort=null;this.busy=false;this.notify(this);}
 }
}
