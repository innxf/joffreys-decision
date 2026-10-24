import {characterMaterials,characterText,characterContract,checkCharacter,saveCharacter} from './character-state.mjs';
// 2E adapters: existing orders/tasks remain the only execution ledger.
import {actorEvidence,profiles,target,observe} from './dialogue-core.mjs';
const copy=structuredClone,now=g=>g.clock.elapsed_minutes;
const need=(v,m)=>{if(!v)throw Error(m);};
export const pending=t=>['sent','accepted','executing'].includes(t.status);
export const taskConflicts=(g,t)=>g.execution.obstacles.filter(x=>x.active&&[t.actor_ref,t.order_ref,t.params.target_ref,t.params.obligation_ref].includes(x.target_ref));
export const acceptedTask=(g,t)=>g.autonomy.jobs.some(j=>j.task_ref===t.id&&j.status==='done'&&j.result?.choice==='accept'&&j.conflicts===JSON.stringify(taskConflicts(g,t))&&JSON.stringify(j.scope)===JSON.stringify(describeTask(g,t)));
export function initializeAutonomy(g){g.autonomy??={version:1,controls:[],jobs:[],documents:[],checkpoint:null};}
export function control(g,t){initializeAutonomy(g);let c=g.autonomy.controls.find(c=>c.task_ref===t.id);if(!c){c={task_ref:t.id,wait:null,reason:'',resume_phase:t.phase,signals:[],request_ref:null,request_scope:null};g.autonomy.controls.push(c);}return c;}
export function describeTask(g,t){const p=t.params,plan=target(g,p.target_ref),pay=g.obligations.find(x=>x.id===p.obligation_ref);return {kind:t.kind,executor:t.actor_ref,parameters:copy(p),plan,payment:pay?{id:pay.id,amount:pay.amount,due_minute:pay.due_minute,payment_condition:pay.payment_condition}:null};}
export const reasons={RESOURCE_UNAVAILABLE:'已批准的可用资金不足，等待入库或国王调整预算。',PERSONNEL_UNAVAILABLE:'所需人员仍在值勤或执行其他任务。',PERSON_BUSY:'执行者正在处理其他工作。',REPLACEMENT_MISSING:'尚未安排足够人手接替原岗位。',PENDING_DECISION:'当事人的接受或授权尚未落实。',PAYMENT_NOT_VERIFIED:'付款凭据尚未核验。',AUTHORITY_EXPIRED:'授权已经失效，需要重新决定。',NO_AUTHORITY:'现有授权不覆盖这项工作。',FOOD_UNAVAILABLE:'现有口粮不足，不能按原安排出勤。',MISSING_DOCUMENT:'缺少实际交付的凭据，已安排向经手人补件。'};
// Retry fixed rules only when a relevant dependency or scheduled time changes.
const waitBasis=g=>JSON.stringify([now(g),g.resources.map(r=>[r.id,r.quantity.value]),g.reservations,g.assignments,g.authorities,g.execution.decisions,g.execution.inspections,g.activities,g.politics.accounts,g.politics.guard_plans,g.execution.obstacles]);
reasons.AUTHORITY_NOT_DELIVERED='尚未收到覆盖本项工作的有效授权；需要国王确认并实际送达。';
export function waitTask(g,t,code,o,kind='condition'){
 const c=control(g,t);c.resume_phase=t.phase;c.wait=kind;c.reason=reasons[code]||code;t.status='blocked';const ord=o.order(g,t);ord.status='等待条件';
 if(t.phase==='start')t.started_at=null;
 c.check_basis=waitBasis(g);
 if(code==='PENDING_DECISION'&&t.kind==='guard_transfer'){const p=g.politics.guard_plans.find(p=>p.id===t.params.target_ref);for(const [actor,kind]of [[p?.commander,'guard_command'],['P020','permanent_transfer']])if(!g.execution.decisions.some(d=>d.actor===actor&&d.kind===kind&&d.target_ref===p?.id&&d.status==='accepted')){c.reason=(profiles[actor]?.name||'有关执行者')+'尚未接受本次'+(kind==='guard_command'?'指挥职责。':'永久转属。');break;}}
 if(!c.signals.includes(code)){c.signals.push(code);ord.report_message_id=o.report(g,t.actor_ref,c.reason,[ord.id]);}
}
export function recoverable(code){return ['RESOURCE_UNAVAILABLE','PERSONNEL_UNAVAILABLE','PERSON_BUSY','REPLACEMENT_MISSING','PENDING_DECISION','PAYMENT_NOT_VERIFIED','AUTHORITY_EXPIRED','AUTHORITY_NOT_DELIVERED','NO_AUTHORITY','FOOD_UNAVAILABLE'].includes(code);}
export function queueJudgment(g,t,o,reason){
 const c=control(g,t);if(g.autonomy.jobs.some(j=>j.task_ref===t.id&&!['done','stale'].includes(j.status)))return;
 const id=o.key(g,'JUDGE');observe(g,[t.actor_ref],'接令时遇到的具体问题：'+reason,id);g.autonomy.jobs.push({id,task_ref:t.id,actor:t.actor_ref,branch:g.revision.branch_id,status:'pending',reason,at:now(g),scope:describeTask(g,t),conflicts:JSON.stringify(taskConflicts(g,t)),attempts:0,snapshot:null,result:null,error:null});
 waitTask(g,t,reason,o,'judgment');if(t.phase==='delivery')c.resume_phase='start';
}
function scopeValid(g,j){const t=g.execution.tasks.find(t=>t.id===j.task_ref);return t&&t.status!=='cancelled'&&JSON.stringify(describeTask(g,t))===JSON.stringify(j.scope)&&j.conflicts===JSON.stringify(taskConflicts(g,t));}
export function jobContext(g,id){
 const j=g.autonomy.jobs.find(j=>j.id===id);need(j&&j.branch===g.revision.branch_id&&scopeValid(g,j),'事务方案已改变，不能采用旧判断。');need(profiles[j.actor],'此执行者的判断资料尚未接入。');
 const t=g.execution.tasks.find(t=>t.id===j.task_ref),ord=g.orders.find(x=>x.id===t.order_ref);need(ord.delivered_minute!==null,'命令尚未送达。');
 const known=actorEvidence(g,j.actor),character=characterMaterials(g,j.actor,known);return {job:id,branch:g.revision.branch_id,world:g.revision.state_id,at:now(g),actor:j.actor,scope:copy(j.scope),known,character,personality:{...copy(profiles[j.actor]),personality:profiles[j.actor].personality+characterText({character})},reason:j.reason};
}
export const executionContract=characterContract+' '+'你处理执行者已收到的具体委托。只返回JSON：{"choice":"accept|conditional|refuse|clarify","reason":"本人答复","refs":["已知来源编号"],"conditions":["尚需落实的条件"],"suggestion":"可为空的缩小、改期或替代建议"}。只代表本人，不替他人接受，不新增权限、资金、人员或完成事实。附条件接受不是无条件同意；不能把隐瞒或声称完成写成真实成果。按本局已知经历判断，不把原著未来当成已经发生；人物可以误判、冲动或有偏见，不为凑成可执行方案而一律赞同或理性让步。';
export function checkJudgment(c,r){checkCharacter(c,r?.character);need(r&&Object.keys(r).filter(k=>k!=='character').sort().join('|')==='choice|conditions|reason|refs|suggestion','执行判断字段不符。');need(['accept','conditional','refuse','clarify'].includes(r.choice),'执行判断类型无效。');need(typeof r.reason==='string'&&r.reason.length>0&&r.reason.length<=3000&&typeof r.suggestion==='string'&&r.suggestion.length<=3000,'答复格式无效。');need(Array.isArray(r.conditions)&&r.conditions.length<=8&&r.conditions.every(x=>typeof x==='string'&&x.length>0&&x.length<=1000),'条件格式无效。');need(r.choice!=='accept'||!r.conditions.length,'附条件答复不能记为无条件接受。');need(Array.isArray(r.refs)&&r.refs.length>0&&r.refs.every(ref=>c.known.some(k=>k.ref===ref)),'判断引用了本人未知的资料。');return r;}
export function applyJudgment(g,a,o,ctx){
 const j=g.autonomy.jobs.find(j=>j.id===a.job_ref);need(j&&j.branch===a.branch&&g.revision.branch_id===a.branch&&scopeValid(g,j),'事务或分支已改变。');
 const t=g.execution.tasks.find(t=>t.id===j.task_ref),c=control(g,t);
 if(a.type==='autonomy_begin'){
  need(['pending','failed'].includes(j.status),'判断已经在处理或完成。');const current=jobContext(g,j.id);need(JSON.stringify(current)===JSON.stringify(a.context),'判断资料已经变化。');need(a.snapshot?.stage==='execution','执行请求格式不符。');j.context=copy(current);j.snapshot=copy(a.snapshot);j.request_world=ctx.result_revision;j.status='running';j.result=null;j.attempts++;j.error=null;return 'EXECUTION_JUDGMENT_STARTED';
 }
 if(a.type==='autonomy_result'){
  need(j.status==='running'&&a.source_world===j.context.world&&j.request_world===g.revision.state_id,'旧判断不能保存。');checkJudgment(j.context,a.result);j.result=copy(a.result);j.response=copy(a.response);j.result_world=ctx.result_revision;return 'EXECUTION_RESULT_SAVED';
 }
 if(a.type==='autonomy_fail'){need(j.status!=='done','判断已完成。');j.status='failed';j.error=String(a.error).slice(0,1000);j.diagnostic=copy(a.diagnostic??null);return 'EXECUTION_JUDGMENT_FAILED';}
 if(a.type==='autonomy_finish'){
  need(j.status==='running'&&j.result,'没有完整结果。');need(j.result_world===g.revision.state_id,'保存结果后世界已改变，不能采用旧判断。');checkJudgment(j.context,j.result);const r=j.result;const ord=o.order(g,t);
  if(t.kind==='review_plan'){
   for(const old of g.execution.decisions.filter(x=>x.actor===j.actor&&x.kind===t.params.source&&x.target_ref===t.params.target_ref))old.status='superseded';
   const decision={id:o.key(g,'DEC'),actor:j.actor,kind:t.params.source,target_ref:t.params.target_ref,status:{accept:'accepted',conditional:'conditional',refuse:'refused',clarify:'deferred'}[r.choice],source_refs:[j.id],at:now(g)};
   g.execution.decisions.push(decision);g.dialogue.bindings.push({decision_ref:decision.id,turn_ref:j.id,target_ref:t.params.target_ref,target_snapshot:copy(target(g,t.params.target_ref))});
   o.finish(g,t,r.reason+(r.conditions.length?' 条件：'+r.conditions.join('；'):'')+(r.suggestion?' 建议：'+r.suggestion:''));c.wait=null;
  }else if(r.choice==='accept'){c.wait=null;c.reason='';t.status='accepted';t.phase=c.resume_phase;t.next_at=now(g);if(t.phase==='start')o.scheduleStart(g,t);ord.accepted_minute??=now(g);ord.status='已接受';}
  else{c.wait=r.choice==='refuse'?'refused':'decision';c.reason=r.reason;t.status='blocked';ord.status=r.choice==='refuse'?'执行失败':'等待条件';ord.report_message_id=o.report(g,t.actor_ref,r.reason+(r.conditions.length?' 条件：'+r.conditions.join('；'):'')+(r.suggestion?' 建议：'+r.suggestion:''),[ord.id,j.id]);}
  saveCharacter(g,j.context,r.character,j.id);observe(g,[j.actor],r.reason,j.id);j.resume_basis=JSON.stringify(actorEvidence(g,j.actor));j.status='done';return 'EXECUTION_JUDGMENT_COMMITTED';
 }
 throw Error('未知后台判断操作。');
}
export function refreshWaits(g,o){
 initializeAutonomy(g);
 for(const j of g.autonomy.jobs.filter(j=>!['done','stale'].includes(j.status)))if(!scopeValid(g,j)){j.status='stale';j.error='方案已改变，旧判断不再适用。';const t=g.execution.tasks.find(t=>t.id===j.task_ref);if(t?.kind==='review_plan'&&t.status!=='cancelled'){t.status='cancelled';control(g,t).wait=null;o.order(g,t).status='已撤销';}else if(t?.status==='blocked'&&control(g,t).wait==='judgment'){control(g,t).wait='condition';}}
 for(const c of g.autonomy.controls){const t=g.execution.tasks.find(t=>t.id===c.task_ref);if(!t||t.status!=='blocked'||c.wait!=='condition')continue;
  if(c.check_basis===waitBasis(g))continue;
  if(taskConflicts(g,t).length&&!acceptedTask(g,t))continue;
  if(c.request_ref?.startsWith('account:')){if(!g.politics.accounts.find(a=>a.id===c.request_ref.slice(8))?.receipt_present)continue;}
  // Recheck on a world event, never poll the model. A failing recheck stays blocked.
  t.status='accepted';t.phase=c.resume_phase;t.next_at=now(g);if(t.phase==='start')o.scheduleStart(g,t);c.wait=null;
 }
}
export function rebranchAutonomy(g){initializeAutonomy(g);for(const j of g.autonomy.jobs){j.branch=g.revision.branch_id;if(j.status==='running'){j.status='pending';j.snapshot=null;j.context=null;j.result=null;j.error='读档后未自动重发。';}}}
export function autonomyErrors(a,g){if(a===undefined)return [];try{
 need(a.version===1&&Array.isArray(a.jobs)&&Array.isArray(a.controls)&&Array.isArray(a.documents),'执行扩展格式无效');
 need(a.checkpoint===null||Number.isSafeInteger(a.checkpoint?.target)&&a.checkpoint.target>=0&&(a.checkpoint.activity_ref===null||g.activities.some(x=>x.id===a.checkpoint.activity_ref)),'时间恢复位置无效');
 for(const rows of [a.jobs,a.documents])need(new Set(rows.map(x=>x.id)).size===rows.length,'执行记录重复');
 for(const j of a.jobs)need(g.execution.tasks.some(t=>t.id===j.task_ref)&&['pending','running','failed','done','stale'].includes(j.status),'判断来源无效');
 need(new Set(a.controls.map(c=>c.task_ref)).size===a.controls.length,'等待任务重复');
 for(const c of a.controls)need(g.execution.tasks.some(t=>t.id===c.task_ref)&&[null,'queue','condition','decision','judgment','refused'].includes(c.wait)&&Array.isArray(c.signals)&&typeof c.reason==='string','等待任务不存在或格式无效');
 for(const d of a.documents)need(typeof d.id==='string'&&typeof d.target_ref==='string'&&typeof d.holder==='string'&&typeof d.content==='string'&&typeof d.valid==='boolean'&&Number.isSafeInteger(d.available_at)&&(d.delivered_at===null||Number.isSafeInteger(d.delivered_at)),'凭据格式无效');
 return [];
 }catch(e){return [e.message];}}
