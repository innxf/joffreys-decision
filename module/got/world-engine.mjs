import {settleEconomy,economyNext,earmarks,paymentTax} from './reform-economy.mjs';
import {custodyRows,absentActor,custodyUnavailable} from './custody-state.mjs';
import {leakPathAvailable} from './arrest-stance.mjs';
import {applyArrestAction,runArrestTask,syncArrestOutcomes} from './arrest-engine.mjs';
import {settleSupport,interceptLeak,recallSupport,supportNext} from './reform-support.mjs';
import {reviewNext,settleReviewDates} from './reform-meetings.mjs';
import {settleAudienceRequests,applyAudienceAction} from './audience-requests.mjs';
import {applyReformAction,runReformTask,accrueReforms,cancelReform,reformView} from './reform-engine.mjs';
import {dailyNext,settleDaily,applyDailyAction,dailyBlocking,currentDaily} from './daily-engine.mjs';
import {applyGuardAction,synchronizeGuardPresence,settleGuards} from './household-guards.mjs';
import {runEventWork} from './event-work.mjs';
import {startContactCard} from './event-cards.mjs';
import {initializeNavigation,navigationNext,navigationSettle,navigationTarget,interruptSleep,applyNavigation,runNavigationWork,clockMinute} from './navigation-engine.mjs';
import {campaignNext,campaignSettle,applyCampaignAction,runCampaignWork,campaignHandover} from './campaign-engine.mjs';
import {ERA_REFERENCES,eraDuration} from './era-rules.mjs';
import {startWork as startOpeningWork,applyOpeningAction,openingNext,openingSettle,runOpeningWork} from './opening-engine.mjs';
import {initializeAutonomy,control,describeTask,waitTask,recoverable,queueJudgment,refreshWaits,applyJudgment,taskConflicts,acceptedTask,judgmentChanged} from './autonomy-core.mjs';
import {target,observe,profiles,actorEvidence} from './dialogue-core.mjs';
import {initializePolitics,applyPoliticalAction,runPoliticalTask,politicalNextEvent,settlePolitics,cancelPolitical,blockPolitical,politicalPayment,politicalView,politicalWorkers} from './political-engine.mjs';

export class RuleError extends Error {constructor(code,status='blocked'){super(code);this.status=status;}}
const need=(condition,code,status)=>{if(!condition)throw new RuleError(code,status);};
const basis=(detail,refs=[])=>({kind:'本卡设计',refs,detail});
const now=g=>g.clock.elapsed_minutes;
const key=(g,prefix)=>prefix+'-'+(++g.execution.serial);
const activeReservation=r=>['有效','部分使用'].includes(r.status);
export const available=(g,ref)=>{const r=g.resources.find(r=>r.id===ref);return r?.quantity.value===null?0:(r?.quantity.value||0)-g.reservations.filter(x=>x.resource_id===ref&&activeReservation(x)).reduce((a,r)=>a+r.amount,0);};
const resource=(g,id)=>{const r=g.resources.find(r=>r.id===id);need(r&&r.quantity.value!==null,'RESOURCE_UNAVAILABLE');return r;};
const amount=n=>Number.isFinite(n)&&n>0&&Math.abs(n*10000-Math.round(n*10000))<0.000001;
const minute=n=>Number.isSafeInteger(n)&&n>=0;
const known=(g,id)=>g.entities.some(e=>e.id===id);
const local=(g,p)=>g.actors.some(a=>a.id===p&&a.life==='存活'&&a.location.includes('红堡'));
const order=(g,t)=>g.orders.find(o=>o.id===t.order_ref);
const rounded=n=>Math.round(n*1e9)/1e9;

export function initializeExecution(g){
  g.administration={organizations:['ORG-CROWN','ORG-TREASURY','ORG-WATCH','ORG-HOUSEHOLD','ORG-GUILD','ORG-ROYALGUARDS','ORG-PORT'].map(id=>({
    entity_ref:id,status:'operating',responsibilities:['沿既有职务和实际资源；没有新增权限'],office_refs:[],parent_ref:'',source_refs:['T0']}))};
  g.authorities=[];g.assignments=[];g.activities=[];
  g.execution={tasks:[],inspections:[],decisions:[],obstacles:[],alerts:[],shortages:[],opportunity_extensions:[],evidence:[],serial:0};
  initializePolitics(g);
}
function exact(a,keys){need(a&&Object.keys(a).sort().join(',')===['type',...keys].sort().join(','),'INVALID_ACTION','invalid');}
function journal(g,ctx,target,delta,unit,reason,refs=[],kind='execution'){
  g.settlements.push({id:key(g,'SET'),commit_id:ctx.id,branch_id:g.revision.branch_id,turn_id:g.revision.turn_id,
    parent_state_id:ctx.parent_revision,result_state_id:ctx.result_revision,at_minute:now(g),kind,target_id:target,delta,unit,reason,evidence_refs:refs});
}
function change(g,ctx,ref,delta,reason,refs=[]){const r=resource(g,ref);need(r.quantity.value+delta>=-1e-9,'RESOURCE_UNAVAILABLE');r.quantity.value=rounded(r.quantity.value+delta);r.quantity.as_of_minute=now(g);journal(g,ctx,ref,delta,r.quantity.unit,reason,refs);}
function report(g,sender,text,refs=[],recipient='U001',delay=15){
  const id=key(g,'MSG');g.messages.push({id,sender,recipient,fact_refs:[],content:text,sent_minute:now(g),arrival_window_minutes:[now(g)+delay,now(g)+delay],
    delivered_minute:null,status:'在途',channel:'执行回报',obstruction:null,arrival_condition:'正常本地回报；有明确阻断时不送达',event_refs:[],basis:basis('M2本地回报15分钟设计值',refs)});
  // Treasury reports pass through the serving master of coin's actual office.
  // Record a real copy and delivery; no actor gets raw global resource balances.
  if(sender==='ORG-TREASURY'&&recipient==='U001')for(const actor of [...new Set(g.offices.filter(o=>o.status==='在任'&&o.title==='财政大臣').map(o=>o.holder))]){
    if(!g.actors.some(a=>a.id===actor&&a.life==='存活'))continue;
    g.messages.push({...structuredClone(g.messages.find(m=>m.id===id)),id:key(g,'MSG'),recipient:actor,channel:'财政职务抄送',basis:basis('国库已形成报表经财政大臣职责渠道同步送达',[id,...refs])});
  }
  return id;
}
function reserve(g,ctx,target,value){need(amount(value)&&available(g,'RES-CASH')>=value,'RESOURCE_UNAVAILABLE');const id=key(g,'RSV');
  g.reservations.push({id,resource_id:'RES-CASH',amount:value,owner:'U001',target_id:target,purpose:'明确批准的有限预算',status:'有效',start_minute:now(g),end_minute:null,release_rule:'仅释放尚未使用的额度',basis:basis('预算不等于付款',[ctx.id])});return id;}
function release(g,id){const r=g.reservations.find(r=>r.id===id);if(r&&activeReservation(r)){r.status='已释放';r.end_minute=now(g);}}
function paymentFunds(g,reservation,refs=[]){
 const primary=g.reservations.find(r=>r.id===reservation&&activeReservation(r));
 return available(g,'RES-CASH')+(primary?.amount||0)+earmarks(g,refs).filter(r=>r.id!==primary?.id).reduce((n,r)=>n+r.amount,0);
}
function spend(g,ctx,value,reservation,reason,refs){
 const primary=g.reservations.find(r=>r.id===reservation&&activeReservation(r)),grants=earmarks(g,refs).filter(r=>r.id!==primary?.id);
  need(amount(value)&&paymentFunds(g,reservation,refs)>=value,'RESOURCE_UNAVAILABLE');
 let remaining=value;for(const r of [primary,...grants].filter(Boolean)){const take=Math.min(remaining,r.amount);r.amount=rounded(r.amount-take);remaining-=take;r.status=r.amount?'部分使用':'已用尽';if(!r.amount)r.end_minute=now(g);if(remaining<=0)break;}
 change(g,ctx,'RES-CASH',-value,reason,refs);
 const pay=g.obligations.find(p=>refs.includes(p.id)&&p.amount>=value&&p.status!=='已支付');paymentTax(g,pay,value,ctx,ops,g.settlements.at(-1).id);
}
function actorFreeAt(g,actor){if(custodyUnavailable(g,actor))return now(g)+60;let end=now(g);
  if(g.opening?.travel?.actors.includes(actor))end=Math.max(end,g.opening.travel.arrive);
  for(const a of g.opening?.appointments||[])if(a.actor===actor&&a.status==='travelling')end=Math.max(end,a.arrive);
  for(const a of g.activities.filter(a=>a.status==='active'&&a.participants.includes(actor)))end=Math.max(end,now(g)+a.remaining+a.nodes.slice(a.node+1).reduce((x,y)=>x+y,0));
  for(const t of g.execution.tasks.filter(t=>t.actor_ref===actor&&t.status==='executing'&&['event_work','opening_work','inspect_payment','project','request_document','tunnel_inspect','arrest',...politicalWorkers].includes(t.kind)))end=Math.max(end,t.next_at);
  for(const a of g.assignments.filter(a=>a.task_commander===actor&&(a.authority_ref||g.execution.tasks.some(t=>t.kind==='campaign_work'&&t.assignment_ref===a.id))&&!['returned','cancelled'].includes(a.status)))end=Math.max(end,a.return_at||a.end_at+60);
  return end;
}
function task(g,ctx,kind,actor,params,delay=15,issuer='U001'){
  need(!g.execution.tasks.some(t=>t.kind===kind&&t.actor_ref===actor&&JSON.stringify(t.params)===JSON.stringify(params)&&t.status==='blocked'&&['condition','decision','judgment'].includes(control(g,t).wait)),'DUPLICATE_WORK');
  const id=key(g,'ORD'),t={id:key(g,'TASK'),order_ref:id,kind,actor_ref:actor,params,status:'sent',phase:'delivery',next_at:now(g)+delay,started_at:null,assignment_ref:''};
  g.orders.push({id,issuer,recipient:actor,action:kind,status:'已发出',issued_minute:now(g),delivered_minute:null,accepted_minute:null,completed_minute:null,
    report_message_id:null,event_refs:[],reservation_refs:[],authority:issuer==='U001'?'OFF-KING；仅限已实现的有限动作':'原委托范围内的职责；核验只索取相关凭据，已批准常规付款不扩大预算或人员',execution_condition:'送达、可用人员资源、无已知阻碍；不免除具体权限',cancellation_order_id:null,basis:basis(issuer==='U001'?'M2固定规则；不是原著命令':'2E执行者在原委托内主动补件',[ctx.id,...(issuer==='U001'?[]:[params.source])])});
  g.execution.tasks.push(t);control(g,t);return t;
}
function finish(g,t,text,reportDelay=15){const o=order(g,t);t.status='completed';o.status='已完成';o.completed_minute=now(g);control(g,t).wait=null;observe(g,[t.actor_ref],text,o.id);o.report_message_id=report(g,t.actor_ref,text,[o.id],t.kind==='reform'?t.actor_ref:o.issuer,reportDelay);}
function block(g,t,code){t.status='blocked';if(t.assignment_ref){const as=g.assignments.find(a=>a.id===t.assignment_ref);as.status='returning';as.return_at=now(g)+60;t.phase='return';t.next_at=as.return_at;t.status='executing';}order(g,t).status='执行失败';order(g,t).report_message_id=report(g,t.actor_ref,'事务受阻：'+code,[t.order_ref]);
  blockPolitical(g,t);
  if(t.params.project_ref){const p=g.projects.find(p=>p.id===t.params.project_ref);p.status='blocked';p.progress=code;p.policy.next_check_minute=null;}}
function freeGroup(g,force,index,exclude=''){
  const pending=force.id==='FORCE01'?g.politics.guard_plans.filter(p=>p.id!==exclude&&p.status==='executing'&&(index===1||(index===4&&p.posts==='replace_from_reserve'))).reduce((n,p)=>n+p.count,0):0;
  return force.allocations[index].count-pending-g.assignments.filter(a=>a.force_ref===force.id&&a.group_index===index&&!['returned','cancelled'].includes(a.status)).reduce((n,a)=>n+a.count,0);
}
function createAssignment(g,t,force,index,commander,auth='',accept=''){
  need(freeGroup(g,force,index)>=t.params.count,'PERSONNEL_UNAVAILABLE');const id=key(g,'ASN');
  g.assignments.push({id,order_ref:t.order_ref,force_ref:force.id,group_index:index,count:t.params.count,task_commander:commander,location:'君临',
    status:'handover',start_at:now(g),end_at:t.params.end_at||now(g)+t.params.duration,return_at:0,authority_ref:auth,acceptance_ref:accept});t.assignment_ref=id;
}
function detailReady(g,p){const a=g.authorities.find(a=>a.id===p.authority_ref&&a.status==='active');
  need(a&&a.issuer==='P001'&&a.subject==='P048'&&a.object_ref==='FORCE02'&&a.scope.group_id==='FORCE02-C'&&a.scope.actions.includes('temporary_detail')&&a.starts_at<=now(g)&&a.expires_at>=p.end_at&&a.scope.max_count>=p.count&&a.delivery_refs.length,'PENDING_DECISION','awaiting_decision');
  need(g.execution.decisions.some(d=>d.id===p.acceptance_ref&&d.actor===p.commander&&d.kind==='temporary_detail'&&d.target_ref===a.id&&d.status==='accepted'&&d.at<=now(g)&&d.source_refs.length),'PENDING_DECISION','awaiting_decision');
}
function scheduleStart(g,t){t.next_at=now(g);if(t.kind==='night_patrol'){const tod=(now(g)+360)%1440;t.next_at=now(g)+(tod<1200?1200-tod:tod>=1320?1440-tod+1200:0);}if(t.kind==='payment')t.next_at=Math.max(now(g),g.obligations.find(x=>x.id===t.params.obligation_ref).due_minute);}
function executeTask(g,t,ctx){
  const o=order(g,t),p=t.params;
  if(custodyUnavailable(g,t.actor_ref)&&!['cancel','arrest','release_prisoner'].includes(t.kind)||absentActor(g,t.actor_ref)&&t.kind!=='cancel'){waitTask(g,t,'执行者无法自由行动，原任务保留，等待实际恢复。',ops);return;}
  if(runArrestTask(g,t,ctx,ops))return;
  if(campaignHandover(g,t,ctx,ops))return;
  if(runReformTask(g,t,ctx,ops))return;
  if(t.phase==='delivery'){
    o.delivered_minute=now(g);o.status='已送达';
    if(t.kind==='review_plan'&&JSON.stringify(control(g,t).request_scope)!==JSON.stringify(describeTask(g,t))){t.status='cancelled';control(g,t).wait=null;o.status='已撤销';o.report_message_id=report(g,t.actor_ref,'送达前方案已经修改，旧征询未作为新方案的答复。',[o.id]);return;}
    observe(g,[t.actor_ref],'实际收到的委托：'+JSON.stringify(describeTask(g,t)),o.id,(t.kind==='reform'||(t.kind==='review_plan'&&p.source==='reform_execution'))?[target(g,p.target_ref)].filter(Boolean):[]);
    if(t.kind==='cancel'){
      const target=g.orders.find(o=>o.id===p.target_ref);const original=g.execution.tasks.find(x=>x.order_ref===target.id);
      if(custodyRows(g).some(r=>r.task_ref===original?.id&&['escorting','held'].includes(r.status))){finish(g,t,'撤令送达时目标已被控制；拘押保留，解除限制须明确办理释放。');return;}
      if(target.status==='已完成'&&recallSupport(g,original)){finish(g,t,'撤岗命令已送达；已部署人员开始归队，60分钟后释放占用，原改革交付历史保留。');return;}
      if(target.status==='已完成'){finish(g,t,'撤令已送达；原命令此前已完成，既成结果保留。');return;}
      target.status='已撤销';target.cancellation_order_id=o.id;
      if(target.id==='ORD01'){
        const f=g.forces.find(f=>f.id==='FORCE01');f.allocations[4].count+=f.allocations[2].count;f.allocations[2].count=0;
      }
      if(original){
        cancelPolitical(g,original,ops);cancelReform(g,original,ops);
        if(['event_work','campaign_work'].includes(original.kind)&&original.params.reservation)release(g,original.params.reservation);
        if(original.kind==='opening_work'){const j=g.opening.jobs.find(j=>j.task===original.id);if(j?.reservation)release(g,j.reservation);}
        if(original.assignment_ref){const a=g.assignments.find(a=>a.id===original.assignment_ref);a.status='returning';a.return_at=now(g)+60;original.phase='return';original.next_at=a.return_at;original.status='executing';}
        else original.status='cancelled';
        if(original.params.project_ref){const pr=g.projects.find(p=>p.id===original.params.project_ref);if(pr.policy?.template!=='general_reform'||pr.policy.task_ref===original.id){pr.status='cancelled';pr.progress='取消未来工作，已支出与已完成部分保留';release(g,pr.active_reservation_id);}}
      }
      finish(g,t,'撤令已送达并处理；已执行部分不倒退。');target.report_message_id=o.report_message_id;return;
    }
    const conflict=g.execution.obstacles.find(x=>x.active&&[o.recipient,o.id,p.target_ref,p.obligation_ref].includes(x.target_ref));
    if(t.kind==='reform'&&!g.execution.decisions.some(d=>d.actor===t.actor_ref&&d.kind==='reform_execution'&&d.target_ref===p.project_ref&&d.status==='accepted')){control(g,t).resume_phase='start';queueJudgment(g,t,ops,'请负责人就实际收到的改革合同确认接受、提出条件或拒绝；不代其他人同意。');return;}
    if(t.kind==='review_plan'||conflict){control(g,t).resume_phase='start';queueJudgment(g,t,ops,conflict?.reason||'请当事人就已送达方案作出明确答复。');return;}
    o.accepted_minute=now(g);o.status='已接受';t.status='accepted';t.phase='start';
    scheduleStart(g,t);
    return;
  }
  if(t.phase==='start'){
    if(['event_work','opening_work','inspect_payment','project','request_document','tunnel_inspect','arrest',...politicalWorkers].includes(t.kind)){const free=actorFreeAt(g,t.actor_ref);if(free>now(g)){t.next_at=free;control(g,t).wait='queue';control(g,t).reason='执行者已有工作，按实际空闲时段开始。';return;}}
    if(taskConflicts(g,t).length&&!acceptedTask(g,t)){queueJudgment(g,t,ops,'执行前出现新的职责或利益冲突。');return;}
    control(g,t).wait=null;
    t.status='executing';t.started_at=now(g);o.status='执行中';
    if(runOpeningWork(g,t,ctx,ops))return;
    if(runNavigationWork(g,t,ctx,ops))return;
    if(runEventWork(g,t,ctx,ops)||runCampaignWork(g,t,ctx,ops))return;
    if(t.kind==='request_document'){t.phase='finish';t.next_at=now(g)+60;return;}
    if(t.kind==='payment'){
      const pay=g.obligations.find(x=>x.id===p.obligation_ref);need(pay.status!=='已支付','ALREADY_PAID');
      need(g.execution.inspections.some(x=>x.target_ref===pay.id&&x.result==='verified'),'PAYMENT_NOT_VERIFIED');
      spend(g,ctx,pay.amount,pay.reservation_id,'实付：'+pay.reason,[pay.id,o.id]);pay.status='已支付';politicalPayment(g,pay);finish(g,t,`${pay.id}已支付${pay.amount}金龙；实存现金${resource(g,'RES-CASH').quantity.value}金龙。`);return;
    }
    if(t.kind==='notify_authority'){const auth=g.authorities.find(a=>a.id===p.target_ref);need(auth&&auth.status==='active'&&auth.expires_at>now(g),'AUTHORITY_EXPIRED');auth.delivery_refs.push(o.id);report(g,'U001','已收到机构筹备范围的有限授权；并未收到全部账册。',[auth.id],auth.subject,0);finish(g,t,'有限授权已实际通知接收者；查阅资料仍需实际交付。');return;}
    if(t.kind==='inspect_payment'){t.phase='finish';t.next_at=now(g)+60;return;}
    if(t.kind==='transfer'){
      const src=resource(g,p.source),dst=resource(g,p.destination);need(src.quantity.unit===dst.quantity.unit&&available(g,src.id)>=p.amount,'RESOURCE_UNAVAILABLE');
      change(g,ctx,src.id,-p.amount,'出库调拨',[o.id]);g.transfers.push({id:key(g,'TR'),resource_id:src.id,source_pool:src.id,destination_pool:dst.id,quantity:p.amount,in_transit:p.amount,lost:0,received:0,sent_minute:now(g),arrival_minute:now(g)+60,status:'在途',commit_id:ctx.id});
      t.phase='finish';t.next_at=now(g)+60;return;
    }
    if(t.kind==='night_patrol'){need(resource(g,'RES-FOOD-WATCH').quantity.value>0,'FOOD_UNAVAILABLE');createAssignment(g,t,g.forces.find(f=>f.id==='FORCE01'),4,'P020');const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='active';t.phase='return_start';t.next_at=a.end_at;return;}
    if(t.kind==='temporary_detail'){
      detailReady(g,p);need(p.end_at>now(g)+60,'WINDOW_EXPIRED');need(actorFreeAt(g,p.commander)<=now(g),'PERSON_BUSY');
      createAssignment(g,t,g.forces.find(f=>f.id==='FORCE02'),2,p.commander,p.authority_ref,p.acceptance_ref);t.phase='handover';t.next_at=now(g)+60;return;
    }
    if(runPoliticalTask(g,t,ctx,ops))return;
    if(t.kind==='project'){
      const pr=g.projects.find(x=>x.id===p.project_ref);spend(g,ctx,10,pr.active_reservation_id,'指定账册整理的额外誊抄材料',[pr.id]);
      pr.progress='筹备指定账册与工作范围；尚未形成报告';pr.policy.next_check_minute=now(g)+30;t.phase='prepare_done';t.next_at=now(g)+30;return;
    }
  }
  if(t.kind==='event_work'&&runEventWork(g,t,ctx,ops))return;
  if(t.kind==='campaign_work'&&runCampaignWork(g,t,ctx,ops))return;
  if(t.kind==='opening_work'&&runOpeningWork(g,t,ctx,ops))return;
  if(t.kind==='tunnel_inspect'&&runNavigationWork(g,t,ctx,ops))return;
  if(t.phase==='handover'){detailReady(g,p);const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='active';t.phase='return_start';t.next_at=a.end_at;return;}
  if(t.phase==='return_start'){const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='returning';a.return_at=now(g)+60;t.phase='return';t.next_at=a.return_at;return;}
  if(t.phase==='return'){const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='returned';if(['已撤销','执行失败'].includes(o.status)){t.status='cancelled';o.report_message_id=report(g,t.actor_ref,'撤令后的人员已实际归队。',[o.id]);}else finish(g,t,'任务和归队交接已完成，人员重新可用。');return;}
  if(t.phase==='prepare_done'){if(runPoliticalTask(g,t,ctx,ops))return;const pr=g.projects.find(x=>x.id===p.project_ref);pr.status='executing';pr.progress='范围确认，开始整理现有总账；不是查出侵吞';pr.policy.milestones[0].status='achieved';pr.policy.milestones[0].evidence_refs=[o.id];pr.policy.next_check_minute=now(g)+90;t.phase='finish';t.next_at=now(g)+90;return;}
  if(t.phase==='finish'){
    if(t.kind==='request_document'){
      const parent=g.execution.tasks.find(x=>x.id===p.source),doc=g.autonomy.documents.find(d=>d.target_ref===p.target_ref&&d.holder===t.actor_ref),issuer=o.issuer;
      need(parent&&p.target_ref===parent.params.target_ref,'DOCUMENT_SOURCE_CHANGED');
      if(parent.status==='cancelled'){t.status='cancelled';o.status='已撤销';return;}
      need(g.authorities.some(a=>a.subject===issuer&&a.object_ref===p.target_ref&&a.status==='active'&&a.expires_at>now(g)&&a.delivery_refs.length&&a.scope.actions.includes('audit_account')),'AUTHORITY_EXPIRED');
      if(!doc){control(g,parent).wait='decision';control(g,parent).reason='经手人未能提供可核验凭据，仍需进一步决定。';finish(g,t,'未取得所需凭据，不能据此认定侵吞或完成核验。');report(g,issuer,control(g,parent).reason,[parent.order_ref]);return;}
      if(doc.available_at>now(g)){const c=control(g,t);if(!c.signals.includes('document_due')){c.signals.push('document_due');report(g,issuer,'请按原委托补交尚未送达的凭据；不扩大查阅范围。',[parent.order_ref,o.id],t.actor_ref);observe(g,[issuer],'经手人尚未交付凭据，已按原委托催办。',o.id);report(g,issuer,'核验仍缺凭据，执行者已催办；没有据此认定账目可靠。',[parent.order_ref,o.id]);}t.next_at=doc.available_at;return;}
      const message=report(g,t.actor_ref,doc.content,[doc.id],issuer,15);doc.message_ref=message;finish(g,t,'已寄送所请求的凭据；收到并核验前不能视为账目可靠。');return;
    }
    if(runPoliticalTask(g,t,ctx,ops))return;
    if(t.kind==='inspect_payment')g.execution.inspections.push({id:key(g,'CHECK'),target_ref:p.obligation_ref,order_ref:o.id,at:now(g),result:'verified'});
    if(t.kind==='project'){const pr=g.projects.find(x=>x.id===p.project_ref);pr.status='completed';pr.progress='现有应付/应收目录整理完成；缺少明细的款项仍缺少明细，没有追回现金';pr.policy.next_check_minute=null;pr.policy.milestones[1].status='achieved';pr.policy.milestones[1].evidence_refs=[o.id];}
    finish(g,t,t.kind==='inspect_payment'?`${p.obligation_ref}常规饷款核验完成，可以另行批准付款。`:t.kind==='project'?'指定账册目录已整理；这不证明账目全部可靠，也没有追回资金。':'本地调拨处理完成；到库记录与出库来自同一笔转移。');
  }
}
function consume(g,to,ctx){
  for(const c of g.consumption){const elapsed=to-c.last_settled_minute;if(elapsed<=0)continue;
    const numerator=elapsed*c.rate_per_day+Math.round(c.fractional_remainder*1440),whole=Math.floor(numerator/1440);
    c.fractional_remainder=(numerator%1440)/1440;c.last_settled_minute=to;
    const r=resource(g,c.resource_id),take=Math.min(whole,r.quantity.value);if(take)change(g,ctx,r.id,-take,'持续口粮消耗',[c.id]);
    const missing=whole-take;if(missing){let sh=g.execution.shortages.find(s=>s.resource_ref===r.id);if(!sh){sh={resource_ref:r.id,unmet:0,updated_at:to};g.execution.shortages.push(sh);report(g,'ORG-HOUSEHOLD',`${r.name}发生未满足配给需求。`,[c.id]);}sh.unmet+=missing;sh.updated_at=to;}
  }
}
function deliver(g,m){
  if(m.channel==='秘密传话'&&!leakPathAvailable(g,m.sender,m.recipient)){m.status='失联';return;}
  if(m.obstruction){m.status='失联';return;}
  if(interceptLeak(g,m,ops))return;
  m.status='已收到';m.delivered_minute=now(g);
  g.beliefs.push({id:key(g,'BEL'),actor:m.recipient,fact_refs:[...m.fact_refs],confidence:'有限掌握',assessment:'收到报告：'+m.content+'；相信程度与解释尚待人物判断',
    evidence_refs:[m.id],public_stance:'未自动转述或公开',updated_minute:now(g),basis:basis('送达不等于证明报告真实',[m.id])});
  const doc=g.autonomy?.documents.find(d=>d.message_ref===m.id);if(doc){doc.delivered_at=now(g);if(doc.valid){const account=g.politics.accounts.find(x=>x.id===doc.target_ref);if(account){account.receipt_present=true;account.source_refs.push(m.id);}}else{const t=g.execution.tasks.find(t=>t.kind==='audit'&&t.params.target_ref===doc.target_ref&&t.status==='blocked');if(t){const c=control(g,t);c.wait='decision';c.reason='已收到材料，但缺少可核验凭据，不能完成对账。';order(g,t).report_message_id=report(g,t.actor_ref,c.reason,[m.id,t.order_ref]);}}}
}
function nextEvent(g,target){let next=economyNext(g,supportNext(g,target));
  for(const a of g.assignments.filter(a=>a.location.startsWith('改革驻守:')&&['active','returning'].includes(a.status))){const end=a.status==='returning'?a.return_at:a.end_at;if(end>now(g))next=Math.min(next,end);}
  next=reviewNext(g,politicalNextEvent(g,next));
  next=Math.min(next,(Math.floor(now(g)/(28*1440))+1)*28*1440);
  for(const t of g.execution.tasks.filter(t=>['sent','accepted','executing'].includes(t.status)))next=Math.min(next,Math.max(now(g),t.next_at));
  for(const m of g.messages.filter(m=>m.status==='在途'))next=Math.min(next,Math.max(now(g),m.arrival_window_minutes[1]));
  for(const p of g.obligations.filter(p=>p.status!=='已支付'&&!g.execution.alerts.includes('due:'+p.id)))next=Math.min(next,Math.max(now(g),p.due_minute));
  for(const tr of g.transfers.filter(t=>t.in_transit>0&&t.arrival_minute!==null))next=Math.min(next,Math.max(now(g),tr.arrival_minute));
  for(const op of g.opportunities.filter(o=>o.deadline_minute!==null&&o.status==='可行动')){const extension=g.execution.opportunity_extensions.find(e=>e.opportunity_ref===op.id);next=Math.min(next,Math.max(now(g),extension?.until??op.deadline_minute));}
  return dailyNext(g,navigationNext(g,campaignNext(g,openingNext(g,next))));
}
function settleAt(g,ctx){
  settleSupport(g);settleEconomy(g,ctx,ops);
  syncArrestOutcomes(g);settleReviewDates(g);
  initializeAutonomy(g);
  openingSettle(g,ctx,ops);
  campaignSettle(g,ctx,ops);
  for(const m of g.messages.filter(m=>m.status==='在途'&&m.arrival_window_minutes[1]<=now(g)))deliver(g,m);
  refreshWaits(g,ops);
  // Cancellation delivered at the same instant wins before a not-yet-started task.
  let sameInstant=0;
  do {need(++sameInstant<1000,'EVENT_LOOP_LIMIT');
  const tasks=g.execution.tasks.filter(t=>['sent','accepted','executing'].includes(t.status)&&t.next_at<=now(g)).sort((a,b)=>(a.kind==='cancel'?-1:0)-(b.kind==='cancel'?-1:0)||a.id.localeCompare(b.id));
  for(const t of tasks){if(!['sent','accepted','executing'].includes(t.status))continue;try{executeTask(g,t,ctx);}catch(e){if(!(e instanceof RuleError))throw e;if(recoverable(e.message)&&!t.assignment_ref){waitTask(g,t,e.message,ops);if(t.params.project_ref){const p=g.projects.find(x=>x.id===t.params.project_ref);p.progress=control(g,t).reason;}}else block(g,t,e.message);}}
  for(const tr of g.transfers.filter(t=>t.in_transit>0&&t.arrival_minute!==null&&t.arrival_minute<=now(g))){
    const r=resource(g,tr.destination_pool);change(g,ctx,r.id,tr.in_transit,'实际入库',[tr.id]);tr.received+=tr.in_transit;tr.in_transit=0;tr.status='已到货';
  }
  settlePolitics(g,ctx,ops);settleEconomy(g,ctx,ops);
  for(const m of g.messages.filter(m=>m.status==='在途'&&m.arrival_window_minutes[1]<=now(g)))deliver(g,m);
  refreshWaits(g,ops);
  }while(g.execution.tasks.some(t=>['sent','accepted','executing'].includes(t.status)&&t.next_at<=now(g)));
  for(const p of g.obligations.filter(p=>p.status!=='已支付'&&p.due_minute<=now(g)&&!g.execution.alerts.includes('due:'+p.id))){g.execution.alerts.push('due:'+p.id);report(g,'ORG-TREASURY',`${p.id}到期，尚未支付；应付${p.amount}金龙，条件仍需核验。`,[p.id]);}
  for(const op of g.opportunities.filter(o=>o.deadline_minute!==null&&o.status==='可行动')){
    const ext=g.execution.opportunity_extensions.find(e=>e.opportunity_ref===op.id);
    if((ext?.until??op.deadline_minute)<=now(g)){op.status='已关闭';if(op.id==='OP01'){const a=g.actors.find(a=>a.id==='P011');a.location='离开君临途中；后续目的地待推进';a.last_updated_minute=now(g);}}
  }
  if(now(g)>0&&now(g)%(28*1440)===0&&!g.execution.alerts.includes('period:'+now(g))){
    g.execution.alerts.push('period:'+now(g));
    const r=financialReport(g,now(g)-28*1440,now(g));
    report(g,'ORG-TREASURY',`28日报表（${r.from}—${r.to}分钟）：现金${r.cash}金龙，有效预留${r.reserved}，可用${r.available}；本期实际入库${r.receipts}、支出${r.spending}；已到期未支付${r.overdue}。下期预计入款${r.forecast}仅为预测，未入库不能使用。报表本身不扣款。`,[]);
  }
  for(const m of g.messages.filter(m=>m.status==='在途'&&m.arrival_window_minutes[1]<=now(g)))deliver(g,m);
  openingSettle(g,ctx,ops);
  campaignSettle(g,ctx,ops);
  navigationSettle(g,ctx,ops);
  settleDaily(g,ctx,ops);
  syncArrestOutcomes(g);settleAudienceRequests(g,ops);
}
export function financialReport(g,from,to){
  const rows=g.settlements.filter(s=>s.target_id==='RES-CASH'&&(s.at_minute>from||(from===0&&s.at_minute===0))&&s.at_minute<=to);
  const cash=resource(g,'RES-CASH').quantity.value;
  return {from,to,cash,reserved:rounded(cash-available(g,'RES-CASH')),available:available(g,'RES-CASH'),
    receipts:rounded(rows.filter(r=>r.delta>0).reduce((n,r)=>n+r.delta,0)),spending:rounded(-rows.filter(r=>r.delta<0).reduce((n,r)=>n+r.delta,0)),
    overdue:rounded(g.obligations.filter(p=>p.due_minute<=to&&p.status!=='已支付').reduce((n,p)=>n+p.amount,0)),
    forecast:rounded(g.receivables.filter(r=>r.earliest_minute>to&&r.earliest_minute<=to+28*1440).reduce((n,r)=>n+r.expected_amount,0))};
}
export function advance(g,target,ctx,interrupt=false){
  initializeNavigation(g);ctx={...ctx,routineTarget:target};
  need(minute(target)&&target>=now(g)&&target-now(g)<=31*1440,'INVALID_DURATION','invalid');let turns=0;
  while(now(g)<target||nextEvent(g,Infinity)<=now(g)){
    need(++turns<10000,'EVENT_LOOP_LIMIT');const priorActivity=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'))?.id;const old=now(g),next=nextEvent(g,target);accrueReforms(g,next);g.clock.elapsed_minutes=next;
    if(ctx.activity_ref){const act=g.activities.find(a=>a.id===ctx.activity_ref);if(act.status==='active')act.remaining=Math.max(0,act.remaining-(next-old));}
    consume(g,next,ctx);
    const before=new Set(g.messages.filter(m=>m.status==='已收到').map(m=>m.id)),jobs=new Set((g.autonomy?.jobs||[]).map(j=>j.id));settleAt(g,ctx);target=navigationTarget(g,target);
    const entered=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001')&&a.id!==priorActivity&&a.id!==ctx.activity_ref);
    if(!ctx.councilCommit&&(g.campaign?.scene||(entered&&!g.opening?.household?.days.some(r=>r.activity===entered.id&&r.auto)))){interruptSleep(g);break;}
    if(!ctx.councilCommit&&g.autonomy.jobs.some(j=>!jobs.has(j.id)&&j.status==='pending')){g.autonomy.checkpoint=now(g)<target?{target,activity_ref:ctx.activity_ref||null}:null;break;}
    if(interrupt&&g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&!before.has(m.id)))break;
    if(!ctx.councilCommit&&g.campaign?.scene)break;
    if(!ctx.councilCommit&&!ctx.routineReserved&&!ctx.routineTravel&&!ctx.dailyFinishing&&dailyBlocking(g))break;
    if(ctx.routineAuto&&g.opening?.household?.stopMinute===now(g))break;
    if(!ctx.councilCommit&&g.opening?.meetings.some(m=>m.session&&m.status==='in_progress'))break;
    if(now(g)===target&&nextEvent(g,Infinity)>target)break;
    need(now(g)>=old,'TIME_REVERSED');
  }
  if(g.opening?.household&&ctx.routineAuto&&now(g)<target)g.opening.household.waitTarget=target;
  g.revision.last_settled_minute=now(g);
  const h=Math.floor(((now(g)+360)%1440)/60);g.clock.display_phase=h<6?'深夜':h<9?'清晨':h<12?'上午':h<14?'午间':h<18?'下午':h<23?'晚间':'深夜';
}

export function applyWorldAction(g,a,ctx){
  if(a.type.startsWith('audience_'))return applyAudienceAction(g,a,ctx,ops);
  if(a.type.startsWith('reform_')){try{return applyReformAction(g,a,ctx,ops);}catch(e){if(e instanceof RuleError)throw e;throw new RuleError(e.message,'invalid');}}
  initializeAutonomy(g);initializeNavigation(g);
  need(ctx.councilCommit||a.type.startsWith('guard_')||a.type==='daily_preferences'||!g.opening?.meetings.some(m=>m.session&&m.status==='in_progress'),'请先完成会议。');
  need(ctx.councilCommit||!g.campaign?.scene||a.type==='campaign_choose','请先完成眼前的场景。');
  if(['order_arrest','release_prisoner'].includes(a.type))return applyArrestAction(g,a,ctx,ops);
  if(a.type.startsWith('guard_'))return applyGuardAction(g,a,ctx,ops);
  if(a.type.startsWith('daily_'))return applyDailyAction(g,a,ctx,ops);
  if(a.type.startsWith('nav_')){const result=applyNavigation(g,a,ctx,ops);if(a.type==='nav_move'){if(g.opening?.household)openingSettle(g,ctx,ops);campaignSettle(g,ctx,ops);}return result;}
  if(a.type.startsWith('campaign_'))return applyCampaignAction(g,a,ctx,ops);
  if(a.type.startsWith('opening_')){const result=applyOpeningAction(g,a,ctx,ops);if(a.type==='opening_move')campaignSettle(g,ctx,ops);return result;}
  need(!g.opening?.travel,'仍在出行途中，请继续行程。');
  if(a.type.startsWith('autonomy_'))return autonomousAction(g,a,ctx);
  need(g.offices.some(o=>o.id==='OFF-KING'&&o.holder==='U001'),'NO_AUTHORITY');
  if(a.type==='wait'){exact(a,['minutes']);need(!g.activities.some(a=>a.status==='active'),'ACTIVITY_ACTIVE');need(minute(a.minutes)&&a.minutes>0,'INVALID_DURATION','invalid');advance(g,now(g)+a.minutes,{...ctx,routineAuto:!!g.opening?.household});return 'TIME_ADVANCED';}
  if(a.type==='start_activity'){
    exact(a,['kind','participants']);const nodes={short_visit:[15,15],private_talk:[30,30],council:[30,30,30],meal:[15,15],documents:[15]}[a.kind];
    need(nodes&&Array.isArray(a.participants)&&a.participants.includes('U001')&&new Set(a.participants).size===a.participants.length,'INVALID_ACTIVITY','invalid');
    need(a.participants.every(p=>g.actors.some(x=>x.id===p&&x.life==='存活')&&actorFreeAt(g,p)<=now(g)),'PERSON_BUSY');
    need(!g.opening?.navigation?.sleep,'国王正在休息。');
    if(g.opening)need(a.participants.every(p=>g.actors.find(x=>x.id===p).location===g.actors.find(x=>x.id==='U001').location),'ACTOR_NOT_PRESENT');
    if(a.kind==='short_visit'&&a.participants.length===2&&startContactCard(g,a.participants.find(p=>p!=='U001'),ctx,ops))return 'EVENT_CONTACT_STARTED';
    g.activities.push({id:key(g,'ACT'),kind:a.kind,participants:a.participants,location:g.opening?g.actors.find(x=>x.id==='U001').location:'红堡',nodes,node:0,remaining:nodes[0],status:'active',started_at:now(g),ended_at:null});return 'ACTIVITY_STARTED';
  }
  if(['advance_activity','end_activity','extend_activity'].includes(a.type)){
    exact(a,a.type==='extend_activity'?['activity_ref','minutes']:['activity_ref']);const act=g.activities.find(x=>x.id===a.activity_ref&&x.status==='active');need(act,'ACTIVITY_NOT_ACTIVE');
    need(!currentDaily(g)||currentDaily(g).activity!==act.id||currentDaily(g).external,'请用本次日程的结束选项完成活动。');
    if(a.type==='end_activity'){
      act.status='ended';act.ended_at=now(g);
      for(const t of g.execution.tasks.filter(t=>t.status==='accepted'&&t.phase==='start'&&['event_work','opening_work','inspect_payment','project','request_document','tunnel_inspect','arrest',...politicalWorkers].includes(t.kind)&&act.participants.includes(t.actor_ref)))t.next_at=Math.min(t.next_at,now(g));
      settleAt(g,ctx);return 'ACTIVITY_ENDED';
    }
    if(a.type==='extend_activity'){need([15,30].includes(a.minutes),'INVALID_DURATION','invalid');act.nodes.push(a.minutes);return 'ACTIVITY_EXTENDED';}
    advance(g,now(g)+act.remaining,{...ctx,activity_ref:act.id},true);
    if(act.remaining===0){act.node++;if(act.node===act.nodes.length){act.status='ended';act.ended_at=now(g);}else act.remaining=act.nodes[act.node];}return 'ACTIVITY_NODE';
  }
  if(a.type==='reserve_funds'){exact(a,['target_ref','amount']);need(known(g,a.target_ref)||g.projects.some(p=>p.id===a.target_ref),'UNKNOWN_TARGET');reserve(g,ctx,a.target_ref,a.amount);return 'RESERVED';}
  if(a.type==='release_funds'){exact(a,['reservation_ref']);const r=g.reservations.find(r=>r.id===a.reservation_ref);need(r&&r.owner==='U001'&&activeReservation(r),'NO_AUTHORITY');need(!g.projects.some(p=>p.active_reservation_id===r.id&&!['completed','cancelled','failed'].includes(p.status)),'PROJECT_BUDGET_IN_USE');release(g,r.id);return 'RELEASED';}
  if(a.type==='inspect_payment'){
    exact(a,['obligation_ref']);need(['PAY01','PAY02','PAY06','PAY10'].includes(a.obligation_ref)||g.projects.some(p=>p.policy?.effects?.some(e=>e.runtime?.kind==='service'&&e.runtime.invoice_ref===a.obligation_ref)),'PAYMENT_RULE_NOT_IMPLEMENTED','unsupported');need(!g.execution.tasks.some(t=>t.kind===a.type&&t.params.obligation_ref===a.obligation_ref&&!['cancelled','blocked','completed'].includes(t.status)),'DUPLICATE_WORK');
    task(g,ctx,a.type,'P005',{obligation_ref:a.obligation_ref});return 'ORDER_ISSUED';
  }
  if(a.type==='pay_obligation'){
    exact(a,['obligation_ref']);const p=g.obligations.find(p=>p.id===a.obligation_ref);need(p&&p.status!=='已支付','ALREADY_PAID');
    const check=g.execution.inspections.find(i=>i.target_ref===p.id&&i.result==='verified');const checkedOrder=check&&g.orders.find(o=>o.id===check.order_ref);
    need(checkedOrder&&g.messages.some(m=>m.id===checkedOrder.report_message_id&&m.status==='已收到'&&m.recipient==='U001'),'PAYMENT_NOT_VERIFIED');
    need(!g.execution.tasks.some(t=>t.kind==='payment'&&t.params.obligation_ref===p.id&&!['cancelled','blocked','completed'].includes(t.status)),'DUPLICATE_WORK');
    const t=task(g,ctx,'payment','P005',{obligation_ref:p.id});order(g,t).reservation_refs=p.reservation_id?[p.reservation_id]:[];return 'PAYMENT_ORDERED';
  }
  if(a.type==='night_patrol'){exact(a,['count','duration']);need(Number.isSafeInteger(a.count)&&a.count>0&&a.count<=200&&[60,120].includes(a.duration),'INVALID_PATROL','invalid');task(g,ctx,a.type,'P020',{count:a.count,duration:a.duration});return 'ORDER_ISSUED';}
  if(a.type==='cancel_order'){exact(a,['order_ref']);const target=g.orders.find(o=>o.id===a.order_ref);need(target&&target.issuer==='U001'&&target.status!=='已撤销','NO_AUTHORITY');task(g,ctx,'cancel',target.recipient,{target_ref:target.id},target.id==='ORD01'?180:15);return 'CANCELLATION_SENT';}
  if(a.type==='transfer_stock'){
    exact(a,['source','destination','amount']);need(a.source!==a.destination&&[a.source,a.destination].every(s=>['RES-FOOD-RK','RES-FOOD-WATCH','RES-FOOD-NAVY'].includes(s)),'UNSUPPORTED_TRANSFER','unsupported');
    need(amount(a.amount)&&a.amount<=2000&&available(g,a.source)>=a.amount,'RESOURCE_UNAVAILABLE');task(g,ctx,'transfer','ORG-HOUSEHOLD',{source:a.source,destination:a.destination,amount:a.amount});return 'TRANSFER_ORDERED';
  }
  if(a.type==='temporary_detail'){
    exact(a,['count','commander','authority_ref','acceptance_ref','end_at']);need(Number.isSafeInteger(a.count)&&a.count>=1&&a.count<=12&&minute(a.end_at)&&a.end_at>now(g)+75&&a.end_at<=now(g)+1440&&a.commander==='P016','INVALID_DETAIL','invalid');
    detailReady(g,a);task(g,ctx,a.type,'P048',{count:a.count,commander:a.commander,authority_ref:a.authority_ref,acceptance_ref:a.acceptance_ref,end_at:a.end_at});return 'HANDOVER_ORDERED';
  }
  if(a.type==='create_organization'){
    exact(a,['name','responsibilities']);need(typeof a.name==='string'&&a.name.trim().length>0&&a.name.length<=80&&Array.isArray(a.responsibilities)&&a.responsibilities.length>0&&a.responsibilities.every(s=>typeof s==='string'&&s.length<=200),'INVALID_ORGANIZATION','invalid');
    const id=key(g,'ORG');g.entities.push({id,name:a.name,kind:'本局新建机构',source:ctx.id});g.administration.organizations.push({entity_ref:id,status:'preparing',responsibilities:a.responsibilities,office_refs:[],parent_ref:'ORG-CROWN',source_refs:[ctx.id]});return 'ORGANIZATION_PREPARING';
  }
  if(a.type==='appoint_official'){
    exact(a,['organization_ref','title','person']);const org=g.administration.organizations.find(o=>o.entity_ref===a.organization_ref);
    need(org&&org.status==='preparing'&&org.source_refs[0]!=='T0','NO_AUTHORITY');need(local(g,a.person)&&typeof a.title==='string'&&a.title.length>0&&a.title.length<=80,'INVALID_APPOINTMENT','invalid');
    need(!org.office_refs.some(ref=>g.offices.some(o=>o.id===ref&&o.title===a.title)),'DUPLICATE_APPOINTMENT');
    const id=key(g,'OFF');g.offices.push({id,title:a.title,holder:a.person,status:'已任命待接受与交接',limits:'仅此筹建机构；不改变其他职务、白袍或实际军队指挥',basis:basis('正式任命不等于履职',[ctx.id])});org.office_refs.push(id);report(g,'ORG-ENVOY','任命文书已登记；本人接受、到岗和交接尚待确认。',[id]);return 'APPOINTED_NOT_HANDED_OVER';
  }
  if(a.type==='grant_authority'){
    exact(a,['organization_ref','person','expires_at']);const org=g.administration.organizations.find(o=>o.entity_ref===a.organization_ref);
    need(org&&org.source_refs[0]!=='T0'&&local(g,a.person)&&minute(a.expires_at)&&a.expires_at>now(g),'NO_AUTHORITY');
    const authId=key(g,'AUTH');g.authorities.push({id:authId,issuer:'U001',subject:a.person,relation:'organization_preparation',object_ref:org.entity_ref,
      scope:{actions:['prepare_records'],max_count:0,group_id:'',location:'红堡'},starts_at:now(g),expires_at:a.expires_at,status:'active',source_refs:[ctx.id],delivery_refs:[]});
    task(g,ctx,'notify_authority',a.person,{target_ref:authId});return 'AUTHORITY_RECORDED_NOT_DELIVERED';
  }
  if(a.type==='activate_organization'){
    exact(a,['organization_ref']);const org=g.administration.organizations.find(o=>o.entity_ref===a.organization_ref);
    need(org&&org.status==='preparing'&&org.office_refs.length,'PENDING_DECISION','awaiting_decision');
    for(const ref of org.office_refs){const off=g.offices.find(o=>o.id===ref);
      need(g.execution.decisions.some(d=>d.actor===off.holder&&d.kind==='appointment'&&d.target_ref===off.id&&d.status==='accepted'&&d.at<=now(g)&&d.source_refs.length),'PENDING_DECISION','awaiting_decision');
      need(g.authorities.some(a=>a.subject===off.holder&&a.object_ref===org.entity_ref&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length),'AUTHORITY_NOT_DELIVERED');
      need(actorFreeAt(g,off.holder)<=now(g),'PERSON_BUSY');
    }
    org.status='operating';for(const ref of org.office_refs)g.offices.find(o=>o.id===ref).status='在任';return 'LIMITED_OFFICE_OPERATING';
  }
  if(a.type==='create_project'){
    exact(a,['template','title']);need(a.template==='records_inventory','MECHANIC_UNIMPLEMENTED','unsupported');need(typeof a.title==='string'&&a.title.length>0&&a.title.length<=100,'INVALID_PROJECT','invalid');
    const id=key(g,'PRJ'),reservation=reserve(g,ctx,id,10),era=ERA_REFERENCES.REF03;
    const t=task(g,ctx,'project','P005',{project_ref:id});order(g,t).reservation_refs=[reservation];
    g.projects.push({id,name:a.title,status:'preparing',responsible:'P005',event_refs:['KL08'],earliest_work_days:0,required_resources:{},
      estimated_cash_cost:{value:10,unit:'金龙',design_range:[10,10],as_of_minute:now(g),basis:basis('有限目录整理的额外誊抄材料；不重复计算既有军饷')},active_reservation_id:reservation,
      progress:'命令已发出，等待送达',completion_condition:'指定现有账册目录形成并留下工作记录，不判断未核实资金异常',basis:basis('M2有限项目；本卡新增操作成本与工作量',[ctx.id]),
      policy:{template:a.template,plan_revision:1,target_refs:['ORG-TREASURY'],step_refs:[t.order_ref],dependency_edges:[],decision_refs:[ctx.id],authority_refs:[],
        milestones:[{id:id+'-prepare',status:'pending',evidence_refs:[]},{id:id+'-report',status:'pending',evidence_refs:[]}],era_ref:'REF03',era_class:era,base_prepare:30,base_execute:90,
        additional_prepare:eraDuration(era,'prepare'),additional_execute:eraDuration(era,'execute'),closure_obligations:[],next_check_minute:t.next_at}});return 'PROJECT_PREPARING';
  }
  const political=applyPoliticalAction(g,a,ctx,ops);if(political)return political;
  throw new RuleError('ACTION_NOT_IMPLEMENTED','unsupported');
}
export const worldOps={startOpeningWork,advance,settle:settleAt,apply:applyWorldAction,need,basis,key,amount,exact,report,reserve,release,paymentFunds,spend,change,actorFreeAt,task,finish,freeGroup,order,waitTask,control,scheduleStart};
function autonomousAction(g,a,ctx){
 try{
  if(a.type==='autonomy_request_review'){
   exact(a,['actor','target_ref','kind']);const obj=target(g,a.target_ref);
   need(obj&&profiles[a.actor]&&g.actors.some(x=>x.id===a.actor&&x.life==='存活'&&(x.location.includes('红堡')||x.location.includes('君临'))),'EXECUTOR_UNAVAILABLE');
   need((a.kind==='guard_command'&&a.actor==='P016'&&obj.kind==='guard_plan')||(a.kind==='permanent_transfer'&&a.actor==='P020'&&obj.kind==='guard_plan')||(a.kind==='appointment'&&obj.kind==='appointment'&&obj.holder===a.actor)||(a.kind==='reform_execution'&&obj.kind==='reform'&&(obj.owner===a.actor||obj.plan.steps.some(s=>(s.effect.commander===a.actor||s.effect.counterparty===a.actor)))),'INVALID_REVIEW');
   const prior=g.autonomy.jobs.findLast(j=>j.status==='done'&&j.actor===a.actor&&j.scope.parameters.target_ref===a.target_ref&&j.scope.parameters.source===a.kind);
   need(!prior||JSON.stringify(prior.scope.plan)!==JSON.stringify(obj)||prior.resume_basis!==JSON.stringify(actorEvidence(g,a.actor)),'已有相同方案的答复；没有新材料或条件变化，不再重复征询。');
   need(!g.execution.tasks.some(t=>t.kind==='review_plan'&&t.actor_ref===a.actor&&t.params.target_ref===a.target_ref&&(['sent','accepted','executing'].includes(t.status)||t.status==='blocked'&&control(g,t).wait==='judgment')),'DUPLICATE_WORK');
   const t=task(g,ctx,'review_plan',a.actor,{target_ref:a.target_ref,source:a.kind});control(g,t).request_scope=describeTask(g,t);return 'REVIEW_ORDER_SENT';
  }
  if(a.type==='autonomy_resume'){
   exact(a,['task_ref']);const t=g.execution.tasks.find(t=>t.id===a.task_ref);need(t&&t.status==='blocked','TASK_NOT_WAITING');const c=control(g,t);need(['condition','decision'].includes(c.wait),'REQUIRES_NEW_DECISION');
   if(c.wait==='decision'){const j=g.autonomy.jobs.findLast(j=>j.task_ref===t.id&&j.status==='done');if(j&&['conditional','clarify'].includes(j.result.choice)){need(judgmentChanged(g,t,j),'尚无新材料或条件变化，保留原答复。');j.status='stale';queueJudgment(g,t,ops,'国王要求按当前条件重新核对，先前条件答复不能当成同意。');return 'REVIEW_REQUIRED';}}
   c.wait='condition';refreshWaits(g,ops);settleAt(g,ctx);return 'TASK_RECHECKED';
  }
  if(a.type==='autonomy_continue_time'){
   exact(a,[]);const c=g.autonomy.checkpoint;need(c,'NO_TIME_CHECKPOINT');g.autonomy.checkpoint=null;
   const act=c.activity_ref&&g.activities.find(a=>a.id===c.activity_ref&&a.status==='active');if(c.activity_ref&&!act)return 'ACTIVITY_ALREADY_ENDED';
   if(c.target>now(g))advance(g,c.target,{...ctx,...(act?{activity_ref:act.id}:{})},!!act);
   if(act&&act.remaining===0){act.node++;if(act.node===act.nodes.length){act.status='ended';act.ended_at=now(g);}else act.remaining=act.nodes[act.node];}return 'TIME_CONTINUED';
  }
  const keys={autonomy_begin:['job_ref','branch','context','snapshot'],autonomy_result:['job_ref','branch','source_world','result','response'],autonomy_finish:['job_ref','branch'],autonomy_fail:['job_ref','branch','error','diagnostic']};need(keys[a.type],'INVALID_ACTION');exact(a,keys[a.type]);
  const result=applyJudgment(g,a,ops,ctx);if(a.type==='autonomy_finish')settleAt(g,ctx);return result;
 }catch(e){if(e instanceof RuleError)throw e;throw new RuleError(e.message,'invalid');}
}

export function executionView(g){return {reforms:reformView(g),
  ...politicalView(g),
  activities:g.activities.filter(a=>a.participants.includes('U001')).map(a=>structuredClone(a)),
  messages:g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到').map(m=>({id:m.id,text:m.content,at:m.delivered_minute})),
  orders:g.orders.filter(o=>o.issuer==='U001'&&o.issued_minute>=0).map(o=>({id:o.id,action:o.action,issued:o.issued_minute,
    status:g.messages.some(m=>m.id===o.report_message_id&&m.recipient==='U001'&&m.status==='已收到')?o.status:'已发令，等待回报'})),
  organizations:g.administration.organizations.filter(o=>o.source_refs[0]!=='T0').map(o=>({id:o.entity_ref,name:g.entities.find(e=>e.id===o.entity_ref).name,status:o.status})),
  financial_report:{period_days:28,notice:'28天仅为报表周期；余额与完成情况以实际送达的财政回报为准，不把预测入款当现金。'}
};}

const ops=worldOps;

export function settleNightAfterActivity(g,ctx){navigationSettle(g,ctx,ops,true);const target=navigationTarget(g,g.clock.elapsed_minutes);if(target>g.clock.elapsed_minutes)advance(g,target,ctx);}
