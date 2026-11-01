import {custodyUnavailable} from './custody-state.mjs';
// A small message-to-visit bridge. No emergency council or autonomous royal decision.
import {guardSlots,guardOnDuty,recordHousehold} from './household-guards.mjs';
import {places} from './opening-content.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
import {isReform} from './reform-contract.mjs';
import {reformPending,ownerKnows} from './reform-meetings.mjs';
const now=g=>g.clock.elapsed_minutes,person=(g,id)=>g.actors.find(a=>a.id===id);
export const receptionPlaces=['R09','R22','R10'];
const requests=g=>g.execution?.audience_requests||[];
const live=r=>['pending','notified','deferred','met'].includes(r.status);
function duty(g){const king=person(g,'U001');return guardSlots(g).find(s=>guardOnDuty(g,s.actor)&&(person(g,s.actor)?.location===king.location||s.anchor===king.location))?.actor;}
export function queueAudienceRequest(g,{actor,place,source_ref,project_ref='',node_ref='',revision=0},o){
 const source=g.messages.find(m=>m.id===source_ref&&m.status==='已收到'&&(m.sender===actor||m.recipient===actor));
 if(custodyUnavailable(g,actor)||!source||!receptionPlaces.includes(place)||person(g,actor)?.life!=='存活')return null;
 const prior=requests(g).find(r=>r.source_ref===source_ref&&r.actor===actor&&r.node_ref===node_ref);if(prior)return prior;
 const row={id:o.key(g,'AUDIENCE'),actor,place,source_ref,project_ref,node_ref,revision,created_at:now(g),status:'pending',message_ref:null,notified_ref:null};
 (g.execution.audience_requests??=[]).push(row);return row;
}
export function settleAudienceRequests(g,o){
 if(!g.opening?.household)return;
 for(const p of g.projects.filter(isReform)){
  if(custodyUnavailable(g,p.responsible)||!ownerKnows(g,p)||person(g,p.responsible)?.life!=='存活')continue;
  for(const node of reformPending(g,p).filter(n=>n.urgent)){
   if(requests(g).some(r=>r.project_ref===p.id&&r.node_ref===node.id&&r.revision===p.policy.plan_revision))continue;
   const source=g.messages.findLast(m=>m.recipient===p.responsible&&m.status==='已收到'&&m.basis?.refs.includes(p.id));
   if(!source)continue;
   const location=person(g,p.responsible).location,origin=Object.keys(places).find(k=>places[k]===location),place=receptionPlaces.find(k=>places[k]===location)||'R09';
   if(!placeRegions[origin]&&!location.startsWith('红堡'))continue;
   if(o.actorFreeAt(g,p.responsible)>now(g)||g.opening.appointments.some(a=>a.actor===p.responsible&&a.status!=='arrived'))continue;
   const row=queueAudienceRequest(g,{actor:p.responsible,place,source_ref:source.id,project_ref:p.id,node_ref:node.id,revision:p.policy.plan_revision},o);if(!row)continue;
   if(location!==places[place]){
    const minutes=travelMinutes(placeRegions[origin]||'Z01',placeRegions[place])+(origin?0:15);
    g.opening.appointments.push({actor:p.responsible,place,depart:now(g),arrive:now(g)+minutes,status:'scheduled',source:row.id});
   }
  }
 }
 const guard=duty(g);
 for(const r of requests(g).filter(live)){
  if(custodyUnavailable(g,r.actor)){r.status='expired';continue;}
  const p=r.project_ref&&g.projects.find(p=>p.id===r.project_ref),actor=person(g,r.actor);
  if(p&&(p.policy.plan_revision!==r.revision||!reformPending(g,p).some(n=>n.id===r.node_ref))){r.status='resolved';continue;}
  if(actor?.life!=='存活'){r.status='expired';continue;}
  if(r.status!=='pending')continue;
  if(!guard)continue;
  const prior=g.messages.find(m=>m.id===r.message_ref);
  if(prior&&prior.recipient!==guard&&prior.status!=='已收到')continue;
  if(!prior||prior.recipient!==guard){
   // A new guard receives the outstanding request through an explicit handover message.
   const name=g.entities.find(e=>e.id===r.actor)?.name||r.actor;
   const message=prior?.content||`${name}请求面见陛下，${actor.location===places[r.place]?'发信时已在'+places[r.place]+'等候':'拟在'+places[r.place]+'会面，抵达尚待确认'}。`;
   r.message_ref=o.report(g,prior?prior.recipient:r.actor,message,[r.source_ref,r.id,...(prior?[prior.id]:[])],guard);continue;
  }
  if(prior.status!=='已收到')continue;
  if(g.activities.some(a=>a.status==='active'&&a.participants.includes('U001'))||g.opening.travel||g.campaign?.scene)continue;
  const content=prior.content+'是否前往由陛下决定；未赴约的待决事项留至周会。';
  recordHousehold(g,['U001',guard],content,r.id);r.notified_ref=g.dialogue.observations.at(-1).id;r.status='notified';
 }
}
export function audienceRequestView(g){return requests(g).filter(r=>r.notified_ref&&live(r)).map(r=>({...r,speaker:g.dialogue.observations.find(x=>x.id===r.notified_ref)?.actors.find(id=>id!=='U001')||null,available:person(g,r.actor)?.life==='存活'&&person(g,r.actor)?.location===places[r.place],text:g.dialogue.observations.find(x=>x.id===r.notified_ref)?.content||''}));}
export function applyAudienceAction(g,a,ctx,o){
 o.need(Object.keys(a).sort().join('|')==='request_ref|type','求见操作字段不完整。');
 const r=requests(g).find(r=>r.id===a.request_ref);o.need(r?.notified_ref&&live(r),'这次求见尚未传达或已经处理。');
 if(a.type==='audience_defer'){r.status='deferred';return 'AUDIENCE_DEFERRED';}
 o.need(a.type==='audience_visit','未知求见操作。');
 const actor=person(g,r.actor);o.need(actor?.life==='存活'&&actor.location===places[r.place],'对方目前不在约定地点；事项仍保留，不能凭求见记录瞬移人物。');
 o.need(o.actorFreeAt(g,r.actor)<=now(g),'对方正在处理其他事务。');
 o.apply(g,{type:'nav_move',place:r.place,secret:false},ctx);
 // Travel may advance world events. Arrival is not consent and must not teleport the visitor.
 if(actor.location!==places[r.place]||o.actorFreeAt(g,r.actor)>now(g))return 'AUDIENCE_PERSON_LEFT';
 o.apply(g,{type:'start_activity',kind:'short_visit',participants:['U001',r.actor]},ctx);r.status='met';return 'AUDIENCE_STARTED';
}
export function audienceRequestErrors(g){const rs=requests(g);return new Set(rs.map(r=>r.id)).size===rs.length&&rs.every(r=>receptionPlaces.includes(r.place)&&g.actors.some(a=>a.id===r.actor)&&g.messages.some(m=>m.id===r.source_ref&&m.status==='已收到')&&(!r.message_ref||g.messages.some(m=>m.id===r.message_ref))&&(!r.notified_ref||g.dialogue.observations.some(x=>x.id===r.notified_ref&&x.actors.includes('U001'))))?[]:['求见记录缺少实际消息或传达来源。'];}
