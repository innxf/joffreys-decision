import {passageEscape} from './reform-support.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
import {custodyRows,custodyOf,custodyDuty,absentActor,custodyUnavailable,localActor,arrestTarget} from './custody-state.mjs';
import {queueJudgment,control,acceptedTask} from './autonomy-core.mjs';
import {observe,profiles} from './dialogue-core.mjs';
import {places} from './opening-content.mjs';
import {stanceTuning} from './stance-config.mjs';
const now=g=>g.clock.elapsed_minutes,person=(g,id)=>g.actors.find(a=>a.id===id);
const name=(g,id)=>g.entities.find(e=>e.id===id)?.name||id;
// Provisional game calibration: 75/100 escape risk for an uncontained tunnel-capable target.
const roll=(g,id)=>{let h=2166136261;for(const c of g._runtime.run_id+'|'+id+'|arrest-1')h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0)%100;};
const live=r=>['ordered','judgment','searching','escorting','held'].includes(r.status);
const front=(g,a,b)=>g.activities.some(x=>x.status==='active'&&x.participants.includes(a)&&x.participants.includes(b)&&person(g,a)?.location===x.location&&person(g,b)?.location===x.location&&g.dialogue.presence.some(p=>p.activity_ref===x.id&&p.actor===b&&p.present));
export function arrestExecutors(g){return g.actors.filter(a=>localActor(a)&&!custodyUnavailable(g,a.id)&&!custodyRows(g).some(r=>r.executor===a.id&&live(r))&&profiles[a.id]&&(g.kingsguard.some(k=>k.holder===a.id&&k.available!==false)||g.forces.some(f=>f.controller===a.id)||a.id==='P048'&&a.roles.some(r=>r.includes('红袍卫队队长'))||g.assignments.some(x=>x.task_commander===a.id&&x.status==='active'))).map(a=>a.id);}
export const arrestForceChoices=g=>g.forces.flatMap(f=>f.allocations.flatMap((a,group)=>Number.isSafeInteger(a.count)&&a.count>0&&localActor({life:'存活',location:f.location})&&(f.id==='FORCE01'?group===4:f.id==='FORCE02'?group===2:f.id.startsWith('FORCE-'))?[{force:f.id,group,label:f.name+' · '+a.task}]:[]));
function squad(g,r,o){
 if(!r.force)return g.kingsguard.some(k=>k.holder===r.executor&&k.available!==false)?{personal:true}:null;
 const f=g.forces.find(f=>f.id===r.force),a=f?.allocations[r.group];
 if(!arrestForceChoices(g).some(c=>c.force===r.force&&c.group===r.group)||!f||!a||!Number.isSafeInteger(a.count)||!localActor({life:'存活',location:f.location}))return null;
 const command=r.executor==='P048'&&f.id==='FORCE02'&&person(g,r.executor).roles.some(x=>x.includes('红袍卫队队长'))||f.controller===r.executor||f.controller==='U001'||g.assignments.some(x=>x.force_ref===f.id&&x.group_index===r.group&&x.task_commander===r.executor&&x.status==='active'&&x.count>=r.count);
 // Existing assigned personnel cannot be counted twice as free reserves.
 return command&&o.freeGroup(g,f,r.group)+(r.assignment_ref?g.assignments.find(x=>x.id===r.assignment_ref&&x.status==='active')?.count||0:0)>=r.count?{f,a}:null;
}
function tell(g,r,text,o,{witnesses=[],publicNotice=false}={}){
 observe(g,[r.executor],text,r.id,[arrestTarget(g,r.id)]);
 observe(g,witnesses.filter(id=>id!==r.executor),text,r.id);
 r.report_ref=o.report(g,r.executor,text,[r.id], 'U001',15);
 if(publicNotice)for(const a of g.actors.filter(a=>a.id!=='U001'&&a.id!==r.executor&&localActor(a)&&!absentActor(g,a.id))){const id=o.report(g,'ORG-HOUSEHOLD',text,[r.id],a.id,60);g.messages.find(m=>m.id===id).channel='宫廷公示';}
}
function end(g,r,t,status,text,o){r.status=status;r.updated_at=now(g);t.status='completed';control(g,t).wait=null;const order=o.order(g,t);order.status=status==='held'||status==='released'?'已完成':'执行失败';order.completed_minute=now(g);tell(g,r,text,o);order.report_message_id=r.report_ref;}
function detach(g,id){
 // Keep historical participants intact; only current presence is revoked.
 for(const p of g.dialogue.presence.filter(p=>p.actor===id&&g.activities.some(a=>a.id===p.activity_ref&&a.status==='active')))p.present=false;
 if(g.opening){g.opening.appointments=g.opening.appointments.filter(a=>a.actor!==id);if(g.opening.travel)g.opening.travel.actors=g.opening.travel.actors.filter(a=>a!==id);}
 for(const r of g.execution.audience_requests||[])if(r.actor===id&&!['resolved','expired'].includes(r.status))r.status='expired';
}
function allocate(g,r,t,o){
 if(!r.force)return;
 const id=o.key(g,'ASN');g.assignments.push({id,order_ref:t.order_ref,force_ref:r.force,group_index:r.group,count:r.count,task_commander:r.executor,location:person(g,r.executor).location,status:'active',start_at:now(g),end_at:now(g),return_at:0,authority_ref:'',acceptance_ref:''});r.assignment_ref=id;
}
function returnSquad(g,r){if(r.assignment_ref){const a=g.assignments.find(a=>a.id===r.assignment_ref);if(a){a.status='returned';a.return_at=now(g);}}}
function powerBarrier(g,r){
 const opposing=g.forces.filter(f=>f.controller===r.target&&f.strength.value!==0),regent=g.offices.some(f=>f.holder===r.target&&f.status==='在任'&&/摄政/.test(f.title));
 const own=g.forces.find(f=>f.id===r.force&&(f.controller==='U001'||g.politics.guard_plans.some(p=>p.commander===f.controller&&p.status==='completed'&&f.basis.refs.includes(p.id))||g.projects.some(p=>p.policy?.template==='general_reform'&&p.policy.effects.some(e=>e.effect.kind==='handover'&&e.source===f.id&&e.effect.commander===f.controller))));
 if(opposing.some(f=>f.id===r.force))return '所派部队仍由目标实际控制，未建立独立接令链。';
 const household=opposing.filter(f=>f.scale_grade==='宫廷武力'&&localActor({life:'存活',location:f.location})).reduce((n,f)=>n+(f.strength.value||0),0);
 if(household&&r.count<=household)return '目标仍掌握更强的本地家兵，所派人手不足以保障这项超常命令；不能把少量转属当作压倒性的直属控制。';
 if((opposing.length||regent)&&(!own||!r.reason.trim()))return '目标仍有实际兵权或摄政地位；执行者没有国王直属部队的独立保障及明确事由，拒绝冒然动手。';
 return '';
}
export function applyArrestAction(g,a,ctx,o){
 if(a.type==='order_arrest'){
  o.exact(a,['target','executor','force','group','count','area','secrecy','reason']);
  o.need(person(g,a.target)?.life==='存活'&&a.target!=='U001'&&a.target!==a.executor,'抓捕对象无效。');
  o.need(arrestExecutors(g).includes(a.executor),'执行者不在本地、不可用或没有现有军事职任。');
  o.need(['red_keep','city'].includes(a.area)&&['secret','public'].includes(a.secrecy)&&typeof a.reason==='string'&&a.reason.trim().length>0&&a.reason.length<=2000,'请明确搜捕范围、公开程度和事由。');
  o.need(typeof a.force==='string'&&Number.isSafeInteger(a.group)&&a.group>=0&&Number.isSafeInteger(a.count)&&a.count>0,'兵力参数无效。');
  o.need(a.force||a.count===1&&a.group===0,'单名白袍亲自执行只占用本人，不会凭空获得兵员。');
  o.need(!custodyDuty(g,a.target),'目标正在承担看管责任；先解除其看管任务，避免留下无人接手的囚犯。');
  o.need(!custodyRows(g).some(r=>r.target===a.target&&live(r)),'该对象已有未完成的抓捕或拘押记录。');
  const r={id:o.key(g,'ARREST'),target:a.target,executor:a.executor,force:a.force,group:a.group,count:a.count,area:a.area,secrecy:a.secrecy,reason:a.reason,status:'ordered',task_ref:'',custodian:'',place:'',assignment_ref:'',report_ref:'',ordered_at:now(g),updated_at:now(g),direct:front(g,a.executor,a.target),escape_roll:roll(g,a.target),last_location:'',release_task:''};
  o.need(squad(g,r,o),'没有可调动的本地兵力或实际指挥链；现有岗位和已占用人员不会重复计算。');
  const t=o.task(g,ctx,'arrest',a.executor,{target_ref:r.id},r.direct?0:15);r.task_ref=t.id;(g.execution.arrests??=[]).push(r);return 'ARREST_ORDERED';
 }
 if(a.type==='release_prisoner'){
  o.exact(a,['arrest_ref']);const r=custodyRows(g).find(r=>r.id===a.arrest_ref);o.need(r&&['held','escorting'].includes(r.status),'该记录尚未形成可解除的拘押。');
  o.need(!r.release_task,'释放命令已经发出。');const t=o.task(g,ctx,'release_prisoner',r.custodian,{target_ref:r.id});r.release_task=t.id;return 'RELEASE_ORDERED';
 }
 return null;
}
export function runArrestTask(g,t,ctx,o){
 if(!['arrest','release_prisoner'].includes(t.kind))return false;
 const r=custodyRows(g).find(r=>r.id===t.params.target_ref),ord=o.order(g,t);o.need(r,'抓捕记录缺失。');
 if(t.kind==='release_prisoner'){
  if(t.phase==='delivery'){ord.delivered_minute=now(g);ord.accepted_minute=now(g);ord.status='执行中';t.phase='finish';t.status='executing';t.next_at=now(g)+15;return true;}
  if(!['held','escorting'].includes(r.status)){o.finish(g,t,'释放命令到达时，该记录已经没有受押者；没有再次移动人物。');return true;}
  if(absentActor(g,r.custodian)){o.waitTask(g,t,'看管责任人已无法办理释放交接。',o);return true;}
  const target=person(g,r.target);target.location=places.R09;target.last_updated_minute=now(g);r.place=target.location;person(g,r.custodian).location=target.location;person(g,r.custodian).last_updated_minute=now(g);returnSquad(g,r);end(g,r,t,'released',name(g,r.target)+'已由'+name(g,r.custodian)+'办理解除看管，抵达文书接洽处；解除限制不等于重新任免，原有义务仍按实际状态办理。',o);observe(g,[r.target],'拘押已经解除。',r.id);return true;
 }
 if(t.phase==='delivery'){
  ord.delivered_minute=now(g);ord.status='已送达';r.status='judgment';
  observe(g,[r.executor],'收到抓捕委托（目标位置仍须现场确认）：'+JSON.stringify(arrestTarget(g,r.id)),ord.id,[arrestTarget(g,r.id)]);
  if(!localActor(person(g,r.target))){end(g,r,t,'unreachable','本次本地抓捕没有找到可控制的目标；目标不在可达的君临／红堡范围，或无可用的当前行踪。',o);return true;}
  t.phase='start';queueJudgment(g,t,o,'抓捕是超常命令，请根据本人已知关系、畏惧、命令链、事由与真实兵力决定接令；不得虚构收买已经发生。');return true;
 }
 if(t.phase==='start'){
  if(!acceptedTask(g,t)){queueJudgment(g,t,o,'抓捕条件已经变化，需要本人重新答复。');return true;}
  const barrier=powerBarrier(g,r);if(barrier){end(g,r,t,'refused',barrier,o);return true;}
  if(!localActor(person(g,r.executor))||custodyUnavailable(g,r.executor)){end(g,r,t,'failed','执行者已无法到场，本次未实施抓捕。',o);return true;}
  if(!squad(g,r,o)){end(g,r,t,'failed','执行时兵力已被占用或指挥链改变；未扣人，未抓获。',o);return true;}
  const busy=o.actorFreeAt(g,r.executor);if(busy>now(g)&&!front(g,r.executor,r.target)){t.next_at=busy;return true;}
  const a=person(g,r.target);if(!localActor(a)||r.area==='red_keep'&&!a.location.includes('红堡')){end(g,r,t,'unreachable','目标不在命令指定的可达范围，本次未抓获。',o);return true;}
  if(r.area==='city'&&r.force!=='FORCE01'){end(g,r,t,'failed','这支宫廷小队没有全城搜捕的既有岗位网络；请缩小范围或明确调度守备队。',o);return true;}
  if(/隐匿|落脚处未指定|化名|藏身/.test(a.location+' '+a.roles.join(' '))){end(g,r,t,'failed','没有可供行动队使用的可靠行踪，本次没有找到目标。',o);return true;}
  const drag=g.autonomy.jobs.findLast(j=>j.task_ref===t.id&&j.status==='done')?.mechanism?.covert==='PASSIVE_DRAG'?stanceTuning.dragMinutes:0;
  allocate(g,r,t,o);r.status='searching';r.last_location=a.location;r.updated_at=now(g);t.status='executing';t.started_at=now(g);t.phase='finish';t.next_at=now(g)+(r.direct&&front(g,r.executor,r.target)?1:r.area==='city'?180:30)+drag;ord.status='执行中';
  tell(g,r,'抓捕队已接令，开始'+(r.area==='city'?'城内搜捕；街头动员不能保持绝对秘密。':'红堡内查找；尚未抓获。'),o,{publicNotice:r.area==='city'});return true;
 }
 if(t.phase==='finish'){
  const a=person(g,r.target),direct=r.direct&&front(g,r.executor,r.target);
  if(!squad(g,r,o)||powerBarrier(g,r)||!localActor(person(g,r.executor))){returnSquad(g,r);end(g,r,t,'failed','行动期间兵力、指挥链或执行者条件发生变化，尚未抓获。',o);return true;}
  if(custodyOf(g,r.target)||!localActor(a)||a.location!==r.last_location&&!direct){returnSquad(g,r);end(g,r,t,'failed','目标已经离开查找地点或被他人控制，未能完成本次控制。',o);return true;}
  // RK-AEGON is an existing authored capability, not knowledge granted to the squad.
  // Inspection alone does not seal it; delivered construction and current exit guards now matter.
  const warned=g.messages.some(m=>m.channel==='秘密传话'&&m.recipient===r.target&&m.basis.refs.includes(r.id)&&m.status==='已收到'&&m.delivered_minute<=now(g));
  if(passageEscape(g,r,direct,warned)){detach(g,r.target);a.location='君临·隐匿中（行踪未明）';a.last_updated_minute=now(g);returnSquad(g,r);end(g,r,t,'escaped','搜捕未能控制目标，目标行踪已失；没有抓获，也没有确证其去向。',o);observe(g,[r.target],'搜捕开始后，你利用尚未封锁的旧通道脱离查找范围。',r.id);return true;}
  const witnesses=g.actors.filter(p=>p.life==='存活'&&!absentActor(g,p.id)&&(p.id===r.target||front(g,p.id,r.target)||p.location===a.location&&p.location_precision==='具体地点'&&a.location_precision==='具体地点')).map(p=>p.id);
  const origin=Object.keys(places).find(k=>places[k]===a.location),escort=origin?Math.max(30,travelMinutes(placeRegions[origin],'Z01')+15):a.location.includes('红堡')?30:75;
  detach(g,r.target);r.custodian=r.executor;r.status='escorting';r.place=(r.area==='city'?'君临':'红堡')+'·押送黑牢途中';a.location=r.place;a.last_updated_minute=now(g);person(g,r.executor).location=r.place;person(g,r.executor).last_updated_minute=now(g);r.updated_at=now(g);if(r.assignment_ref)g.assignments.find(x=>x.id===r.assignment_ref).location=r.place;t.phase='handover';t.next_at=now(g)+escort;
  tell(g,r,name(g,r.target)+'已被现场控制，正在由'+name(g,r.executor)+'押送，尚未完成看管交接。'+(r.secrecy==='public'||r.area==='city'?'命令事由：'+r.reason+'（国王提出的理由，不等于已经核实定罪）。':''),o,{witnesses,publicNotice:r.secrecy==='public'||r.area==='city'});return true;
 }
 if(t.phase==='handover'){
  if(r.status==='released'){o.finish(g,t,'押送已因释放交接终止。');return true;}
  if(absentActor(g,r.custodian)){o.waitTask(g,t,'看管责任人不可用，押送尚未完成交接。',o);return true;}
  r.place='红堡·黑牢';person(g,r.custodian).location=r.place;person(g,r.custodian).last_updated_minute=now(g);person(g,r.target).location=r.place;person(g,r.target).last_updated_minute=now(g);
  if(r.assignment_ref)g.assignments.find(x=>x.id===r.assignment_ref).location=r.place;
  end(g,r,t,'held',name(g,r.target)+'已交接至黑牢，'+name(g,r.custodian)+'负责看管；所用人员继续占岗，未释放前不得重复派遣。',o);observe(g,[r.target], '你被押入黑牢，由'+name(g,r.custodian)+'负责看管。',r.id);return true;
 }
 return true;
}
export function syncArrestOutcomes(g){for(const r of custodyRows(g).filter(r=>r.status==='judgment'||r.status==='ordered'||r.status==='searching')){const t=g.execution.tasks.find(t=>t.id===r.task_ref);if(t?.status==='cancelled'){r.status='cancelled';returnSquad(g,r);}const c=g.autonomy?.controls.find(c=>c.task_ref===t?.id);if(c?.wait==='refused')r.status='refused';}}
export function arrestView(g){return custodyRows(g).map(r=>({id:r.id,target:r.target,order_ref:g.execution.tasks.find(t=>t.id===r.task_ref)?.order_ref,can_release:['held','escorting'].includes(r.status)&&g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&(m.basis.refs.includes(r.id)||m.basis.refs.includes(g.execution.tasks.find(t=>t.id===r.task_ref)?.order_ref))&&/已被现场控制|已交接至黑牢/.test(m.content)),text:g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到'&&(m.basis.refs.includes(r.id)||m.basis.refs.includes(g.execution.tasks.find(t=>t.id===r.task_ref)?.order_ref))).map(m=>m.content).join('\n')||'已发令，等待实际回报。'}));}
