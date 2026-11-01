import {fundingConcern} from './reform-support.mjs';
import {readMech,evaluateActorStance} from './stance-engine.mjs';
import {stanceTuning} from './stance-config.mjs';
import {custodyUnavailable,localActor} from './custody-state.mjs';
import {observe,actorEvidence} from './dialogue-core.mjs';
const actor=(g,id)=>g.actors.find(a=>a.id===id);
export function leakPathAvailable(g,sender,recipient){
 return [sender,recipient].every(id=>localActor(actor(g,id))&&!custodyUnavailable(g,id)&&actor(g,id).location.includes('红堡'));
}
export function arrestFundingChanged(g,t,j){
 // Frozen judgments predating this adapter retain their original input contract.
 const prior=j.mechanism?.event?.funding_concern;
 if(t.kind!=='arrest'||!prior)return false;
 const r=g.execution.arrests?.find(r=>r.id===t.params.target_ref);
 return !!r&&JSON.stringify(prior)!==JSON.stringify(fundingConcern(g,t.actor_ref,r.force,r.target));
}
export function resolveArrestStance(g,t,o,c,scope,conflicts){
 const r=g.execution.arrests.find(r=>r.id===t.params.target_ref),ord=o.order(g,t),at=g.clock.elapsed_minutes;
 if(!r||ord.delivered_minute===null)throw Error('ARREST_NOT_DELIVERED');
 const p=readMech(g,t.actor_ref),attachment=p.private_track.core_attachments.filter(a=>a.target_id===r.target).reduce((n,a)=>Math.max(n,a.intensity),0);
 const funding=fundingConcern(g,t.actor_ref,r.force,r.target);
 const event={funding_concern:funding,source_ref:ord.id,targetId:r.target,harmedTargets:[r.target],alignment:-attachment*.5+funding.alignment,
  leak_path:!r.direct&&leakPathAvailable(g,r.executor,r.target),can_delay:!r.direct};
 const result=evaluateActorStance(g,t.actor_ref,event);
 const conditions=[];
 if(conflicts.length){result.choice='conditional';result.stance='CONFLICT_REVIEW';result.covert='CLEAN_EXECUTION';conditions.push(...conflicts.map(x=>x.reason));}
 if(result.choice==='conditional'&&!conditions.length)conditions.push('本次涉及本人重视的对象或利益，需要调整命令或明确交换条件后重新讨论。');
 const reason=result.choice==='accept'?'已接下本次查找和控制委托；能否执行仍按现场条件核验。':result.choice==='refuse'?'拒绝本次命令；本次任务终止，调整后须另行发令。':'本次尚未无条件接受；等待讨论和条件调整。';
 const id=o.key(g,'JUDGE');
 const job={id,task_ref:t.id,actor:t.actor_ref,branch:g.revision.branch_id,status:'done',reason,at,scope,
  conflicts:JSON.stringify(conflicts),attempts:0,snapshot:null,result:{choice:result.choice,reason,refs:[ord.id],conditions,suggestion:''},error:null,
  mechanism:{...result,revision:p.revision,event},resume_basis:null};
 g.autonomy.jobs.push(job);actor(g,t.actor_ref).mech_profile??=p;
 observe(g,[t.actor_ref],reason+(conditions.length?' 条件：'+conditions.join('；'):''),id);
 c.resume_phase='start';c.reason=reason;
 if(result.choice==='accept'){
  c.wait=null;t.status='accepted';t.phase='start';t.next_at=at;ord.accepted_minute??=at;ord.status='已接受';
  if(result.covert==='COVERT_LEAK'&&!g.messages.some(m=>m.channel==='秘密传话'&&m.basis.refs.includes(r.id))){
   const message=o.report(g,t.actor_ref,'收到关于抓捕你的委托，行动尚未完成；命令事由仅为国王提出的指控：'+r.reason,[r.id,ord.id],r.target,stanceTuning.leakMinutes);
   g.messages.find(m=>m.id===message).channel='秘密传话';
  }
 }else{
  t.status=result.choice==='refuse'?'completed':'blocked';c.wait=result.choice==='refuse'?'refused':'decision';
  ord.status=result.choice==='refuse'?'执行失败':'等待条件';
  if(result.choice==='refuse'){r.status='refused';ord.completed_minute=at;}
  ord.report_message_id=o.report(g,t.actor_ref,reason,[ord.id,id]);
 }
 job.resume_basis=JSON.stringify(actorEvidence(g,t.actor_ref));
}
