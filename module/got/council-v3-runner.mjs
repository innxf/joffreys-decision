import {freezeCanonFrame,selectLocalCanon,compileWithCanon} from './canon-reference.mjs';
import {requireCharacterInput} from './character-state.mjs';
import {compileTask,displayText,proseText} from './generation-core.mjs';
import {taskContracts,phaseInput,checkPre,ensure} from './dialogue-core.mjs';
import {liveCouncil} from './council-session.mjs';
import {contextForCouncilWork,topicOf} from './council-v3.mjs';
const clone=x=>structuredClone(x),parse=x=>JSON.parse(x.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
const contracts={
 pre:'这是御前会议的主动发言判断。返回JSON：{speak:true或false,pre:人物前置结果}。主持提示不是国王说过的话。与职责或明确被问及的事情有关才发言，无新意见可沉默；不得替其他人同意。pre严格遵守以下合同：'+taskContracts.pre,
 extract:'你只整理刚才该人物的原话，返回JSON {proposals:[{summary:"可供国王明确选择的处置，保留范围和条件",quote:"该人物正文中的连续原句",owner:"人物编号或null",conditions:[],choice:"当前议题已有选择编号或null"}]}。只提取真正提出的办法，不把质疑或事实叙述凑成方案。明确拒绝实施、维持现状、交办核查也可以是办法。choice仅在原话与列出的现有办法完整一致时填入；不是相似关键词即可映射。没有可采纳办法返回空数组。如果当前input确实是国王发言，允许提取国王自己的明确办法，speaker填player，quote引用国王原话；NPC方案speaker填npc。不要把主持提示当成国王发言。',
 topic:'根据国王实际输入和已呈报资料，协助完善议题。返回JSON {title:"议题",problem:"要解决的问题",approach:"初步处理方向",owner:"现有人物编号或null",reply:"当前大臣对国王的简短自然回应"}。负责人尚未确定用null，不替本人接受；不要编造新事实，不新增程序机制。不支持的整体构想仍可讨论，但须说明可先议的有限部分。',
 summary:'你是记录本题裁决的书记，不作新的政治决定。返回JSON {consistent:true或false,summary:"准确记录玩家已采纳的方案、拟负责人、条件及已有费用期限；尚未发令执行",question:"需要国王澄清的关键问题；无则空字符串"}。不增加未获批准的费用或承诺。存在歧义则consistent:false。不能把没有处理器的方案写成已成立的项目。'
};
export async function runCouncilWork(r){
 ensure(!r.busy,'DIALOGUE_BUSY');const initial=liveCouncil(r.runtime.read());ensure(initial?.session.version===3&&initial.session.work,'没有等待处理的会议发言。');
 r.busy=true;r.councilError='';r.notify(r);
 try{return await r.lock(async()=>{
  r.abort=new AbortController();const g=r.runtime.read(),m=liveCouncil(g),w=m.session.work,q=topicOf(m),record=r.record+'-council-work';
  let old=await r.storage.readGotGenerationRecord(record),revision=old?.revision??null;
  const binding=g.revision.branch_id+'|'+w.id+'|'+q.revision;
  let d=old?.binding===binding?old:{binding,proseFormat:2,world:g.revision.state_id,work:clone(w),settings:clone(r.client.settings),context:contextForCouncilWork(g,m),responses:{},requests:[],status:'pending'};
  if(old?.binding!==binding)d.canonFrame=freezeCanonFrame(g,d.context);
  const current=()=>ensure(r.runtime.read().revision.branch_id===g.revision.branch_id&&r.runtime.read().revision.state_id===d.world&&liveCouncil(r.runtime.read())?.session.work?.id===w.id,'STALE_DIALOGUE_CONTEXT');
  const save=async()=>{const value={...clone(d),revision:revision+1};await r.storage.writeGotGenerationRecord(record,value,revision);revision=value.revision;d=value;r.councilWork=d;r.notify(r);};
  const request=async(key,phase,contract,extra={})=>{
   current();if(d.responses[key])return d.responses[key].value;
   const input=phaseInput(d.context,d.pre||null,d.prose||'',phase);
   input.guidance+='\n会议主持阶段：'+w.kind+'。只扮演'+input.char+'；不得替国王说话。'+(d.context.utterance_origin==='chair'?'当前input是主持提示，不是国王的发言。':'');
   input.known=JSON.stringify({...JSON.parse(input.known),topic:{title:q.title,problem:q.problem,approach:q.approach,owner:q.owner},resolution:q.resolution,...extra});
   const snapshot=compileWithCanon(input,phase==='prose'?d.canonSelection:null,p=>compileTask(d.settings,phase,p,r.builder,'normal','',contract));requireCharacterInput(snapshot,input);
   ensure(snapshot.compiled.messages.some(x=>x.content.includes(contract)),'预设缺少本任务合同条目，请在原预设面板生成资料适配副本后重试。');
   d.stage=key;d.status='running';await save();const row={snapshot,response:null},requestIndex=d.requests.length;d.requests.push(row);
   let raw='',pending=Promise.resolve(),last=0;
   try{
    const response=await r.call(snapshot,token=>{if(phase!=='prose')return;raw+=token;d.raw=raw;d.prose=d.proseFormat===2?proseText(snapshot.compiled.prefix||'',raw,true):displayText(snapshot.compiled.prefix||'',raw);r.councilWork=d;r.notify(r);if(Date.now()-last>400){last=Date.now();pending=pending.then(()=>{current();return save();});}},r.abort.signal);
    await pending;current();ensure(!r.abort.signal.aborted,'DIALOGUE_CANCELLED');d.requests[requestIndex].response=clone(response);if(phase==='prose')d.raw=response.content;
    ensure(!response.finishReason||response.finishReason==='stop','INCOMPLETE_MODEL_RESPONSE');
    const content=phase==='prose'&&d.proseFormat===2?proseText(snapshot.compiled.prefix||'',response.content):displayText(snapshot.compiled.prefix||'',response.content),value=phase==='prose'?content:parse(content);d.responses[key]={value};await save();return value;
   }catch(e){await pending;d.requests[requestIndex].diagnostic=e.diagnostic||{message:e.message};throw e;}
  };
  try{
   current();await save();let result;
   if(w.kind==='speech'){
    const p=await request('pre','pre',contracts.pre);ensure(typeof p.speak==='boolean','人物未明确是否发言');checkPre(d.context,p.pre);d.pre=p.pre;
    if(p.speak){if(d.canonFrame&&!d.canonSelection){d.canonSelection=await selectLocalCanon(d.canonFrame,d.context,d.pre,r.canonSearch,r.abort.signal);current();await save();}const prose=await request('prose','prose',taskContracts.prose);d.prose=prose;const e=await request('extract','post',contracts.extract);result={speak:true,pre:p.pre,prose:d.prose,proposals:e.proposals};}
    else result={speak:false,pre:p.pre};
   }else result=await request(w.kind,'post',contracts[w.kind]);
   current();d.candidate??=r.runtime.prepareAction({type:'council_v3_result',work_id:w.id,context:d.context,result,requests:d.requests,settings:d.settings});await save();
   const saved=await r.runtime.commit(d.candidate);ensure(saved.status==='committed',saved.validation.code);d.status='done';d.error=null;await save();
  }catch(e){d.status='failed';d.error=e.message;if(e.message!=='SAVE_FAILED'){delete d.candidate;if(d.stage)delete d.responses[d.stage];}try{await save();}catch{}r.councilError=e.message;throw e;}
 });}finally{r.abort=null;r.busy=false;r.notify(r);}
}
