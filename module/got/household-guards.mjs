import {places} from './opening-content.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
import {profiles} from './dialogue-profiles.mjs';
const now=g=>g.clock.elapsed_minutes,person=(g,id)=>g.actors.find(a=>a.id===id);
export const household=g=>g.opening?.household;
export const guardSlots=g=>household(g)?.guards||[];
export const guardLocked=(g,slot)=>g.clock.elapsed_minutes<1080&&guardSlots(g)[slot]?.actor==='P016';
export function courtMember(g,id){const a=person(g,id);return !!a&&(placeRegions[placeOf(a.location.replace(/·门外$/,''))]==='Z01'||(placeRegions[placeOf(a.location)]&&g.offices.some(o=>o.holder===id)));}
function dutyHistory(g,oldId,newId){
 if(oldId===newId)return;
 recordHousehold(g,g.actors.filter(a=>courtMember(g,a.id)||a.id==='U001').map(a=>a.id),`${profiles[oldId]?.name||'空缺'} → ${profiles[newId]?.name||'空缺'}；贴身值勤已交接。`,'court-duty-change');
}
export function guardKnowledge(g,id){
 if(!household(g))return [];
 const rows=[{ref:'court-duty:'+household(g).roster_version,kind:'public_roster',content:'国王当前的贴身近卫：'+guardSlots(g).map(s=>profiles[s.actor]?.name||'空缺').join('、')+'。这份名单不说明私人行程或谈话。',at:household(g).roster_at,source:'公开近卫名单'}];
 if(courtMember(g,id))for(const o of g.dialogue.observations.filter(o=>o.source==='court-duty-change'))rows.push({ref:o.id,kind:'court_roster_history',content:o.content,at:o.at,source:'宫廷值勤交接簿'});
 return rows;
}
const here=g=>person(g,'U001')?.location;
export const placeOf=location=>Object.keys(places).find(k=>places[k]===location);
const position=(g,id,location)=>{const a=person(g,id);if(a){a.location=location;a.location_precision='具体地点';a.last_updated_minute=now(g);}};
export function guardUnavailable(g,id){
 const a=person(g,id),kg=g.kingsguard.find(k=>k.holder===id);
 if(!a||a.life!=='存活')return '已不在世或尚未登记';
 if(id!=='P016'&&!kg)return '不在本局御林铁卫名册';
 if(kg?.available===false||/拘押|囚|被俘|重伤/.test(a.location+' '+(kg?.status||'')))return '无法值勤';
 if(!placeRegions[placeOf(a.location)]&&!/红堡|君临/.test(a.location)&&!guardSlots(g).some(s=>s.actor===id&&['following','door','waiting','held'].includes(s.mode)))return '尚未在君临到岗';
 if(g.activities.some(x=>x.status==='active'&&x.participants.includes(id)&&!x.participants.includes('U001')))return '正在参加其他活动';
 if(g.execution.tasks.some(t=>t.actor_ref===id&&t.status==='executing')||g.assignments.some(t=>t.task_commander===id&&!['returned','cancelled'].includes(t.status)))return '正在执行其他任务';
 if(g.opening?.appointments.some(p=>p.actor===id&&p.status==='travelling'))return '正在赴约途中';
 return '';
}
export function guardCandidates(g){return [...new Set([...g.kingsguard.map(k=>k.holder),'P016'])].filter(Boolean).map(id=>({id,name:profiles[id]?.name||id,reason:guardUnavailable(g,id)}));}
export function guardOnDuty(g,id){return guardSlots(g).some(s=>s.actor===id&&['following','door','waiting','held'].includes(s.mode))&&!guardUnavailable(g,id);}
export function guardsInside(g){return guardSlots(g).filter(s=>s.actor&&s.mode==='following'&&!guardUnavailable(g,s.actor)&&person(g,s.actor)?.location===here(g)).map(s=>s.actor);}
export function physicalAudience(g,ids){return [...new Set([...ids,...guardsInside(g)])].filter(id=>!guardSlots(g).some(s=>s.actor===id&&['door','waiting','held','unavailable'].includes(s.mode)));}
export function recordHousehold(g,actors,text,source){g.dialogue.observations.push({id:'OBS-'+(++g.execution.serial),actors:[...new Set(actors)],at:now(g),content:text,source,targets:[]});}
export function synchronizeGuardPresence(g,source='guard-duty'){
 if(!household(g))return;
 const a=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(!a)return;
 const inside=guardsInside(g);
 for(const s of guardSlots(g))if(s.actor){
  const id=s.actor,present=inside.includes(id);let p=g.dialogue.presence.find(p=>p.activity_ref===a.id&&p.actor===id);
  if(!present&&!p)continue;
  if(!a.participants.includes(id))a.participants.push(id);
  if(!p){p={activity_ref:a.id,actor:id,present,at:now(g),source_ref:source};g.dialogue.presence.push(p);}else if(p.present!==present){p.present=present;p.at=now(g);p.source_ref=source;}
 }
}
export function guardDeparture(g,destination,selected=null){
 const origin=here(g),carried=[];if(!household(g)||origin===destination)return carried;
 for(const s of guardSlots(g)){
  if(!s.actor||guardUnavailable(g,s.actor))continue;
  const local=person(g,s.actor)?.location===origin||(['door','waiting'].includes(s.mode)&&s.anchor===origin);
  if(!local||s.mode==='held')continue;
  if(selected!==null&&!selected.includes(s.actor)){s.mode='held';s.anchor=origin;continue;}
  carried.push(s.actor);s.mode='following';s.anchor=null;position(g,s.actor,destination);
 }
 return carried;
}
export function guardArrival(g,enter=false){
 if(!household(g))return;
 for(const s of guardSlots(g)){
  if(!s.actor)continue;
  if(s.mode==='held'&&(person(g,s.actor)?.location===here(g)||(s.anchor===here(g)&&person(g,s.actor)?.location===here(g)+'·门外'))){s.mode='following';s.anchor=null;position(g,s.actor,here(g));}
  if(enter&&s.mode==='following'&&person(g,s.actor)?.location===here(g)&&here(g)===places.R01){s.mode='door';s.anchor=here(g);position(g,s.actor,here(g)+'·门外');}
 }
 synchronizeGuardPresence(g);
}
export function moveWithGuards(g,location){guardDeparture(g,location);position(g,'U001',location);guardArrival(g,true);}
export function guardNext(g,next){for(const s of guardSlots(g))if(s.pending?.arrive>now(g))next=Math.min(next,s.pending.arrive);return next;}
export function settleGuards(g){
 if(!household(g))return;
 for(const s of guardSlots(g)){
  if(s.actor&&guardUnavailable(g,s.actor)){s.mode='unavailable';s.anchor=null;}
  if(s.actor&&s.mode==='unavailable'&&!guardUnavailable(g,s.actor)&&!s.pending){s.pending={actor:s.actor,arrive:null,destination:null};}
  if(!s.pending)continue;
  const p=s.pending,a=person(g,p.actor);
  const busy=g.activities.some(x=>x.status==='active'&&x.participants.includes(p.actor))||g.execution.tasks.some(t=>t.actor_ref===p.actor&&t.status==='executing');
  if(busy||!a||a.life!=='存活')continue;
  if(p.arrive===null){
   if(guardUnavailable(g,p.actor))continue;
   const precise=placeOf(a.location.replace(/·门外$/,'')),origin=precise||(a.location==='红堡'?'R10':a.location.startsWith('红堡·')?'R12':null),dest=placeOf(here(g));if(!origin||!dest||g.opening.travel)continue;
   p.destination=dest;p.arrive=now(g)+travelMinutes(placeRegions[origin],placeRegions[dest])+(precise?0:15);
   g.opening.appointments.push({actor:p.actor,place:dest,depart:now(g),arrive:p.arrive,status:p.arrive>now(g)?'travelling':'arrived',source:'guard-post:'+p.actor+':'+now(g)});position(g,p.actor,p.arrive>now(g)?'近卫赴岗途中':places[dest]);
  }
  if(p.arrive>now(g))continue;
  position(g,p.actor,places[p.destination]);
  if(here(g)!==places[p.destination]){p.arrive=null;continue;}
  if(s.actor){const old=g.activities.find(x=>x.status==='active'&&x.participants.includes('U001'));const row=g.dialogue.presence.find(x=>x.activity_ref===old?.id&&x.actor===s.actor);if(row)row.present=false;}
  const previous=s.actor;s.actor=p.actor;s.pending=null;s.mode=here(g)===places.R01?'door':'following';s.anchor=s.mode==='door'?here(g):null;if(s.mode==='door')position(g,s.actor,here(g)+'·门外');dutyHistory(g,previous,s.actor);
  recordHousehold(g,['U001',s.actor],(profiles[s.actor]?.name||s.actor)+'已抵达，接替贴身值勤。','guard-arrival:'+now(g));
 }
 guardArrival(g);
}
export function guardMaterials(g){return guardsInside(g).map(id=>{const a=person(g,id);return {id,name:profiles[id]?.name,location:a.location,roles:a.roles,life:a.life,condition:a.condition||a.status||'未登记特殊伤势',equipment:a.equipment||null};});}
export function guardPrivacy(g,rule){if(!rule)return '';const ids=guardsInside(g);return rule==='all'?ids.length?'请先让近卫在门外等候。':'':ids.some(id=>(rule.absent||[]).includes(id))?'这段话需要避开指定的在场者。':'';}
export function applyGuardAction(g,a,ctx,o){
 const h=household(g);o.need(h,'这份存档尚未接入起居安排。');
 if(a.type==='guard_assign'){
  o.exact(a,['slot','actor']);o.need([0,1].includes(a.slot),'席位不存在');const s=h.guards[a.slot];
  o.need(!guardLocked(g,a.slot)||a.actor===s.actor,'首日由桑铎贴身当值，今日不能将他换下。');
  o.need(a.actor===null||guardCandidates(g).some(c=>c.id===a.actor&&!c.reason),'此人目前无法值勤。');
  o.need(a.actor===null||!h.guards.some((x,i)=>i!==a.slot&&(x.actor===a.actor||x.pending?.actor===a.actor)),'同一人不能占两席。');
  if(a.actor===s.actor&&!s.pending)return 'GUARD_UNCHANGED';
  // An already dispatched replacement finishes its real journey even if duty is cancelled.
  if(a.actor===null){const old=s.actor;Object.assign(s,{actor:null,pending:null,mode:'empty',anchor:null});const act=g.activities.find(x=>x.status==='active'&&x.participants.includes('U001'));const p=g.dialogue.presence.find(x=>x.activity_ref===act?.id&&x.actor===old);if(p)p.present=false;dutyHistory(g,old,null);}
  else s.pending={actor:a.actor,arrive:null,destination:null};
  h.roster_version++;h.roster_at=now(g);settleGuards(g);return 'GUARD_ARRANGED';
 }
 if(a.type==='guard_presence'){
  o.exact(a,['actor','mode']);const s=h.guards.find(s=>s.actor===a.actor);o.need(s&&!guardUnavailable(g,a.actor),'近卫尚未到岗。');
  if(a.mode==='dismiss'){o.need(guardsInside(g).includes(a.actor),'他已经在门外或不在这里。');s.mode=here(g)===places.R01?'door':'waiting';s.anchor=here(g);position(g,a.actor,here(g)+'·门外');}
  else {o.need(a.mode==='summon'&&here(g)===places.R01&&s.mode==='door'&&s.anchor===here(g),'只能召入正在寝居门外值守的近卫。');s.mode='following';position(g,a.actor,here(g));}
  synchronizeGuardPresence(g,ctx.id);return 'GUARD_PRESENCE_CHANGED';
 }
 o.need(false,'未知近卫操作。');
}
