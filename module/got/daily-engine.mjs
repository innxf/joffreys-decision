import {dailyDefinitions} from './daily-content.mjs';
import {places,scenes} from './opening-content.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
import {household,guardSlots,guardsInside,guardCandidates,guardArrival,settleGuards,guardNext,placeOf,moveWithGuards,recordHousehold,synchronizeGuardPresence} from './household-guards.mjs';
const now=g=>g.clock.elapsed_minutes,person=(g,id)=>g.actors.find(a=>a.id===id),day=g=>Math.floor((now(g)+360)/1440);
const active=g=>g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
export const currentDaily=g=>household(g)?.days.find(r=>['offered','inviting','active'].includes(r.status));
// Scene shortcuts read the existing daily occurrences; no second schedule ledger.
export function morningWashPending(g){
 if(!household(g)||person(g,'U001')?.location!==places.R01||g.opening.navigation?.sleep)return false;
 const r=household(g).days.find(r=>r.definition==='dress'&&r.day===day(g));
 return r?['pending','deferred','offered','inviting','active','expired'].includes(r.status):(day(g)===0&&household(g).since===0&&now(g)<140);
}
export function nextRoomMeal(g){
 if(!household(g))return null;
 const offered=currentDaily(g);if(offered&&['breakfast','lunch','dinner'].includes(offered.definition))return {definition:offered.definition,due:offered.due,record:offered};
 const choices=[];for(let d=day(g);d<=day(g)+1;d++)for(const def of dailyDefinitions.filter(d=>d.handler==='meal')){
  const r=household(g).days.find(r=>r.definition===def.id&&r.day===d);
  if(r&&['done','skipped','expired'].includes(r.status))continue;
  const due=r?.due??at(d,def.at);if(due>=now(g))choices.push({definition:def.id,due,record:r||null});
 }return choices.sort((a,b)=>a.due-b.due)[0]||null;
}
export function afterDinner(g){return (now(g)+360)%1440>=1140&&household(g)?.days.some(r=>r.day===day(g)&&r.definition==='dinner'&&r.status==='done');}
export const dailyForActivity=(g,id)=>household(g)?.days.find(r=>r.activity===id);
const at=(d,clock)=>d*1440+clock-360;
export function initializeHousehold(g,{fresh=false}={}){
 if(g.opening?.version!==2||g.finale||household(g)||(!fresh&&(active(g)||g.campaign?.scene||g.opening?.travel)))return;
 const origin=person(g,'U001').location;
 g.opening.household={version:1,since:now(g),guards:['P016','P054'].map(id=>({actor:person(g,id)?.location===origin?id:null,pending:person(g,id)?.location===origin?null:{actor:id,arrive:null,destination:null},mode:person(g,id)?.location===origin?'following':'empty',anchor:null})),roster_version:1,roster_at:now(g),meals:{breakfast:['P060','P061'],lunch:['P060','P061'],dinner:['P060','P061']},days:[],waitTarget:null};
 // Migration never moves actors into a saved conversation. Their first departure
 // or explicit duty action resolves attendance using the existing location.
 if(fresh){guardArrival(g,true);settleGuards(g);}
}
export function mealCandidates(g,meal){
 const ids=['P001','P012','P060','P061'];
 if(meal!=='breakfast')for(const o of g.offices.filter(o=>o.status==='在任'&&/国王之手|首相|财政|情报|海政|法务|大学士|摄政|御林铁卫队长/.test(o.title)))if(o.holder)ids.push(o.holder);
 return [...new Set(ids)].filter(id=>person(g,id));
}
export function invitationReason(g,id){
 const a=person(g,id);if(!a||a.life!=='存活')return '无法赴席';
 if(!placeRegions[placeOf(a.location)]&&!/红堡|君临/.test(a.location))return '不在君临或正在途中';
 if(g.activities.some(x=>x.status==='active'&&x.participants.includes(id))||g.execution.tasks.some(t=>t.actor_ref===id&&t.status==='executing')||g.assignments.some(t=>t.task_commander===id&&!['returned','cancelled'].includes(t.status))||g.opening.appointments.some(p=>p.actor===id&&['scheduled','travelling'].includes(p.status)))return '已有事务或预约';
 if(guardSlots(g).some(s=>s.actor===id))return '正在贴身值勤';return '';
}
export function reminder(g,def){const speaker=guardsInside(g)[0]||'ORG-HOUSEHOLD';return {speaker,text:def.reminder};}
function occurrence(g,def,d){
 const h=household(g),id=`daily:${d}:${def.id}`;let r=h.days.find(r=>r.id===id);
 if(!r){r={id,definition:def.id,day:d,due:at(d,def.at),expires:at(d,def.until),status:'pending',reminded:false,activity:null,invited:[],absent:[],queue:null,auto:false,external:false};h.days.push(r);}return r;
}
export function dailyNext(g,next,definitions=dailyDefinitions){
 if(!household(g)||g.finale?.freeze)return next;next=guardNext(g,next);const invitation=g.opening.invitation;if(invitation?.status==='agreed'&&!g.opening.visits.some(v=>v.scene==='barristan')&&invitation.at-60>now(g))next=Math.min(next,invitation.at-60);
 for(let d=Math.max(0,day(g)-1);d<=day(g)+1;d++)for(const def of definitions){
  if(def.handler==='sleep')continue;const due=at(d,def.at),id=`daily:${d}:${def.id}`,r=household(g).days.find(r=>r.id===id);
  if(due<household(g).since&&!r)continue;
  if(!r&&due>now(g))next=Math.min(next,due);
  if(r&&['pending','deferred'].includes(r.status)&&r.due>now(g))next=Math.min(next,r.due);
  if(r&&!['done','skipped','expired'].includes(r.status)&&r.expires>now(g))next=Math.min(next,r.expires);
  if(r?.status==='active'&&r.auto&&r.finish>now(g))next=Math.min(next,r.finish);
 }
 return next;
}
function log(g,r,text){recordHousehold(g,['U001',...(active(g)?g.dialogue.presence.filter(p=>p.activity_ref===active(g).id&&p.present).map(p=>p.actor):guardsInside(g))],text,r.id);}
function finish(g,r){const listeners=active(g)?g.dialogue.presence.filter(p=>p.activity_ref===r.activity&&p.present).map(p=>p.actor):guardsInside(g);const a=g.activities.find(a=>a.id===r.activity);if(a&&!r.external){a.status='ended';a.ended_at=now(g);a.remaining=0;a.node=a.nodes.length;for(const p of g.dialogue.presence.filter(p=>p.activity_ref===a.id))p.present=false;}r.status='done';r.finished=now(g);recordHousehold(g,['U001',...listeners],r.definition==='greeting'?'向太后问安后，国王告辞。':r.definition==='dress'?dailyDefinitions.find(d=>d.id==='dress').complete_text||'洗漱穿戴完毕。':'这次用餐已经结束。',r.id);}
function start(g,r,def,ctx,o){
 if(active(g)||g.campaign?.scene||g.opening.travel)return;
 const participants=['U001',...r.invited.filter(id=>person(g,id)?.location===places[def.place]&&!invitationReason(g,id))];
 // An arrived invitation is not a reason to exclude its recipient.
 for(const p of g.opening.appointments.filter(p=>p.source===r.id&&p.status==='arrived'))if(!participants.includes(p.actor)&&person(g,p.actor)?.location===places[def.place])participants.push(p.actor);
 const a={id:o.key(g,'ACT'),kind:def.kind,participants,location:places[def.place],nodes:[r.duration||def.duration],node:0,remaining:r.duration||def.duration,status:'active',started_at:now(g),ended_at:null};g.activities.push(a);
 for(const id of participants)g.dialogue.presence.push({activity_ref:a.id,actor:id,present:true,at:now(g),source_ref:r.id});
 r.activity=a.id;r.status='active';r.finish=now(g)+a.remaining;synchronizeGuardPresence(g,ctx.id);
 if(r.day===0&&def.id==='lunch'&&!g.opening.visits.some(v=>v.scene==='lunch')&&participants.includes('P012')){g.opening.visits.push({scene:'lunch',activity:a.id,started:now(g),joined:true});r.text=scenes.lunch.text;}
 log(g,r,r.text||def.text);
}
function invite(g,r,def,ids,ctx,o){
 r.invited=[...ids];r.absent=[];r.status='inviting';
 for(const id of ids){const reason=invitationReason(g,id);if(reason){r.absent.push({actor:id,reason});continue;}
  const a=person(g,id),origin=placeOf(a.location)||(a.location.startsWith('红堡·')?'R12':null);if(!origin){r.absent.push({actor:id,reason:'无法确认赴席路线'});continue;}
  const minutes=travelMinutes(placeRegions[origin],placeRegions[def.place]);
  g.opening.appointments.push({actor:id,place:def.place,depart:now(g),arrive:now(g)+minutes,status:minutes?'travelling':'arrived',source:r.id});a.location=minutes?'赴约途中':places[def.place];a.last_updated_minute=now(g);
 }
 start(g,r,def,ctx,o);
}
function conflict(g){return !!g.opening.travel||!!g.opening.navigation.sleep||!!active(g)||!!g.campaign?.scene||!!g.finale;}
function authoredEquivalent(g,def){
 const a=active(g);if(!a)return null;
 if(def.handler==='meal'&&a.kind==='meal')return a;
 if(def.handler==='greeting'&&g.opening.visits.some(v=>v.scene==='cersei'&&v.activity===a.id))return a;
 return null;
}
export function settleDaily(g,ctx,o,definitions=dailyDefinitions){
 const h=household(g);if(!h||g.finale?.freeze)return;settleGuards(g);
 const invitation=g.opening.invitation;
 if(invitation?.status==='agreed'&&now(g)>=invitation.at-60&&now(g)<=invitation.at+60&&!g.opening.visits.some(v=>v.scene==='barristan')&&g.messages.some(m=>m.id===invitation.report&&m.status==='已收到')&&!g.dialogue.observations.some(x=>x.source==='daily:appointment:'+invitation.report)){
  recordHousehold(g,['U001',...guardsInside(g)],'陛下，已经约定的会面快到了，该准备出发了。','daily:appointment:'+invitation.report);h.stopMinute=now(g);
 }

 for(const r of h.days){
  const def=definitions.find(d=>d.id===r.definition);if(!def)continue;
  if(r.event&&g.campaign?.private_done.includes(r.event)){r.status='done';r.finished=now(g);continue;}
  if(r.status==='active'){
   const a=g.activities.find(a=>a.id===r.activity);
   if(r.external){if(a?.status==='ended'){r.status='done';r.finished=now(g);}continue;}
   if(a?.status==='ended'){r.status='done';r.finished=now(g);continue;}
   a.remaining=Math.max(0,r.finish-now(g));
   for(const p of g.opening.appointments.filter(p=>p.source===r.id&&p.status==='arrived'))if(person(g,p.actor)?.location===a.location&&!a.participants.includes(p.actor)){a.participants.push(p.actor);g.dialogue.presence.push({activity_ref:a.id,actor:p.actor,present:true,at:now(g),source_ref:r.id});recordHousehold(g,a.participants,'来迟的宾客刚刚落座。',r.id+':arrival:'+p.actor);}
   if(now(g)>=r.finish)finish(g,r);
  }
  if(['pending','deferred','offered','inviting'].includes(r.status)&&now(g)>=r.expires){r.status='expired';r.finished=now(g);}
 }
 for(let d=Math.max(0,day(g)-1);d<=day(g);d++)for(const def of definitions){
  if(def.handler==='sleep')continue;
  const due=at(d,def.at),end=at(d,def.until);if(due<h.since||due>now(g)||end<=now(g))continue;
  const r=occurrence(g,def,d);if(!['pending','deferred','offered','inviting'].includes(r.status)||r.due>now(g))continue;
  const card=g.campaign?.history.findLast(x=>x.scene===g.campaign.scene&&x.choice==='enter')?.card_snapshot;
  if(def.handler==='meal'&&card&&card.places?.includes('R05')&&/宴|膳|餐/.test(card.title)&&card.duration>=20){r.external=true;r.status='inviting';r.event=g.campaign.scene;continue;}
  if(r.event){if(g.campaign.private_done.includes(r.event)){r.status='done';r.finished=now(g);}continue;}
  const equivalent=authoredEquivalent(g,def);if(equivalent){r.activity=equivalent.id;r.external=true;r.status='active';continue;}
  if(def.handler==='greeting'&&!h.days.some(x=>x.day===d&&x.definition==='dinner'&&['done','skipped','expired'].includes(x.status)))continue;
  if(def.handler==='greeting'&&!g.opening.finished){if(g.opening.visits.some(v=>v.scene==='cersei'))r.status='skipped';continue;}
  if(conflict(g)||ctx.routineReserved)continue;
  if(def.handler==='meal'&&invitation?.status==='agreed'&&!g.opening.visits.some(v=>v.scene==='barristan')&&now(g)>=invitation.at-60&&now(g)<=invitation.at+60){r.status='deferred';r.due=invitation.at+61;continue;}
  if(!r.reminded){const n=reminder(g,def);recordHousehold(g,['U001',...guardsInside(g)],n.text,r.id+':reminder');r.reminded=true;}
  if(r.status==='inviting'){if(person(g,'U001').location===places[def.place])start(g,r,def,ctx,o);continue;}
  r.status='offered';
  if(!ctx.routineAuto||now(g)>=ctx.routineTarget)return;
  r.auto=true;
  if(!person(g,'U001').location.startsWith('红堡')){r.status='skipped';r.reason='出行期间未另行返堡用餐';continue;}
  if(def.handler==='greeting'&&(invitationReason(g,'P001')||!person(g,'P001').location.startsWith('红堡'))){r.status='skipped';r.reason='太后不能接见';continue;}
  // Auto wait stops rather than consumes an unresolved authored audience.
  if(def.handler==='greeting'&&g.opening.visits.some(v=>v.scene==='cersei'&&g.activities.find(a=>a.id===v.activity)?.status==='active'))return;
  moveWithGuards(g,places[def.place]);g.opening.navigation.view='room';
  if(def.handler==='meal')invite(g,r,def,(r.day===0&&def.id==='lunch'?[...new Set(['P012',...(h.meals[def.id]||[])])]:h.meals[def.id]||[]),ctx,o);
  else if(def.handler==='greeting')invite(g,r,def,['P001'],ctx,o);
  else start(g,r,def,ctx,o);
  return;
 }
}
export function dailyBlocking(g){const r=currentDaily(g);return !!r&&!r.external&&!r.auto&&['offered','inviting','active'].includes(r.status);}
export function routineOccupied(g,id){return household(g)?.days.some(r=>r.status==='active'&&(g.activities.find(a=>a.id===r.activity)?.participants.includes(id)||g.opening.appointments.some(p=>p.source===r.id&&p.actor===id&&p.status==='travelling')));}
export function applyDailyAction(g,a,ctx,o,definitions=dailyDefinitions){
 const h=household(g);o.need(h,'尚未启用日常安排。');
 if(a.type==='daily_preferences'){o.exact(a,['meal','actors']);o.need(['breakfast','lunch','dinner'].includes(a.meal)&&Array.isArray(a.actors)&&new Set(a.actors).size===a.actors.length&&a.actors.every(id=>mealCandidates(g,a.meal).includes(id)),'进餐名单无效。');h.meals[a.meal]=[...a.actors];return 'MEAL_PREFERENCES_SAVED';}
 if(a.type==='daily_resume_wait'){o.exact(a,[]);o.need(h.waitTarget>now(g),'没有待继续的等候。');const target=h.waitTarget;h.waitTarget=null;o.advance(g,target,{...ctx,routineAuto:true});return 'WAIT_CONTINUED';}
 if(a.type==='daily_room'){
  o.exact(a,['choice']);o.need(['wash','pass_time','wait_meal','start_meal'].includes(a.choice),'没有这项起居选择。');
  const room=person(g,'U001').location,r=currentDaily(g);
  o.need(!g.opening.travel&&!g.opening.navigation.sleep&&!g.campaign?.scene&&!g.finale,'请先结束眼前的事情。');
  if(a.choice==='wash'){
   o.need(room===places.R01&&morningWashPending(g),'今天已经梳洗过，或不在寝室。');
   const def=definitions.find(d=>d.id==='dress'),wash=occurrence(g,def,day(g));
   o.need(!active(g)||active(g).id===wash.activity,'请先结束眼前的会面。');
   if(wash.status!=='active'){wash.duration=Math.max(0,at(day(g),500)-now(g))||20;start(g,wash,def,ctx,o);}
   o.advance(g,wash.finish,{...ctx,activity_ref:wash.activity,dailyFinishing:true});
   if(wash.status==='done')g.opening.navigation.notice=def.complete_text;
   return wash.status==='done'?'MORNING_WASHED':'WASH_INTERRUPTED';
  }
  o.need(!active(g),'请先结束眼前的会面。');
  if(a.choice==='pass_time'){
   const tod=(now(g)+360)%1440;o.need(room===places.R01&&!morningWashPending(g)&&tod>=500&&tod<1200,'白天梳洗后才能在寝室消磨时间。');
   o.advance(g,now(g)+60,{...ctx,routineReserved:true});return 'ROOM_TIME_PASSED';
  }
  o.need(room===places.R05,'请先进入家庭餐室。');const meal=nextRoomMeal(g);o.need(meal,'现在没有可安排的用餐。');
  if(a.choice==='wait_meal'){
   o.need(meal.due>now(g),'已经到了用餐时间。');o.advance(g,meal.due,{...ctx,routineAuto:false});return 'MEAL_TIME_REACHED';
  }
  o.need(meal.due<=now(g),'还没有到用餐时间。');o.settle(g,ctx);
  const ready=currentDaily(g);o.need(ready?.definition===meal.definition&&ready.status==='offered','请先处理眼前的日程。');ready.selection_open=true;return 'MEAL_SELECTION_OPENED';
 }
 o.need(a.occurrence&&h.days.some(r=>r.id===a.occurrence),'这项日程不存在。');const r=h.days.find(r=>r.id===a.occurrence),def=definitions.find(d=>d.id===r.definition);o.need(def,'日程定义已停用。');
 if(a.type==='daily_choose'){
  o.exact(a,['occurrence','choice','actors']);o.need(['offered','inviting'].includes(r.status),'本次日程已经处理。');
  o.need(['skip','postpone','usual','select','start','long'].includes(a.choice),'没有这项选择。');
  if(a.choice==='skip'){r.status='skipped';log(g,r,'国王略过了这次'+def.name+'。');return 'DAILY_SKIPPED';}
  if(a.choice==='postpone'){r.status='deferred';r.due=now(g)+30;return 'DAILY_POSTPONED';}
  o.need(!active(g)&&!g.opening.travel&&!g.campaign?.scene,'请先结束眼前的事情。');
  if(def.handler==='greeting'){o.need(!invitationReason(g,'P001'),'太后此时无法接见。');if(a.choice==='long')r.duration=30;}
  const ids=def.handler==='meal'?(a.choice==='select'?a.actors:(r.day===0&&def.id==='lunch'?[...new Set(['P012',...h.meals[def.id]])]:h.meals[def.id])):def.handler==='greeting'?['P001']:[];
  o.need(Array.isArray(ids)&&new Set(ids).size===ids.length&&ids.every(id=>def.handler==='greeting'?id==='P001':mealCandidates(g,def.id).includes(id)),'进餐名单无效。');
  if(person(g,'U001').location!==places[def.place]){o.apply(g,{type:'nav_move',place:def.place,secret:false},{...ctx,routineTravel:true});if(person(g,'U001').location!==places[def.place]||active(g)||g.campaign?.scene)return 'DAILY_TRAVEL_INTERRUPTED';}
  invite(g,r,def,ids,ctx,o);return 'DAILY_STARTED';
 }
 if(a.type==='daily_arrivals'){
  o.exact(a,['occurrence']);o.need(r.status==='active'&&(!r.queue||r.queue.status==='done'),'先收束席间的话题。');const arrivals=g.opening.appointments.filter(p=>p.source===r.id&&p.status==='travelling'&&p.arrive>now(g));o.need(arrivals.length,'没有在途的宾客。');o.advance(g,Math.min(r.finish,...arrivals.map(p=>p.arrive)),{...ctx,activity_ref:r.activity,dailyFinishing:true});return 'DINER_ARRIVED';
 }
 if(a.type==='daily_finish'){
  o.exact(a,['occurrence']);o.need(r.status==='active'&&!r.external,'当前不是普通起居活动。');o.need(!r.queue||r.queue.status==='done','请先完成或明确结束这一轮餐叙。');
  o.advance(g,Math.max(now(g),r.finish),{...ctx,activity_ref:r.activity,dailyFinishing:true});if(now(g)>=r.finish&&r.status==='active')finish(g,r);if(r.status==='done')o.settle(g,ctx);return 'DAILY_FINISHED';
 }
 if(a.type==='daily_topic'){
  o.exact(a,['occurrence','input']);o.need(r.status==='active'&&!r.external&&(!r.queue||r.queue.status==='done'),'本轮餐叙尚未结束。');o.need(typeof a.input==='string'&&a.input.trim()&&a.input.length<=30000,'请先说出话题。');
  const act=g.activities.find(a=>a.id===r.activity),speakers=r.invited.filter(id=>act.participants.includes(id)&&person(g,id)?.location===act.location);
  o.need(speakers.length,'这次没有其他用餐者。');r.queue={id:ctx.id,input:a.input,actors:speakers,index:0,turns:[],status:'pending'};return 'MEAL_TOPIC_SAVED';
 }
 if(a.type==='daily_topic_end'){o.exact(a,['occurrence']);o.need(r.queue,'没有餐叙话题。');r.queue.status='done';return 'MEAL_TOPIC_ENDED';}
 o.need(false,'未知起居操作。');
}
export function recordSleep(g,until){
 const h=household(g);if(!h)return;const d=Math.max(0,day(g)-(((now(g)+360)%1440)<360?1:0)),def=dailyDefinitions.find(d=>d.id==='sleep'),r=occurrence(g,def,d);
 if(r.status==='done')return;r.status='active';r.external=true;r.started=now(g);r.finish=until;r.reminded=true;
 recordHousehold(g,['U001',...guardsInside(g)],def.reminder,r.id+':reminder');
}
export function wakeDaily(g){for(const r of household(g)?.days||[])if(r.definition==='sleep'&&r.status==='active'&&r.finish<=now(g)){r.status='done';r.finished=now(g);}}
export function householdErrors(g){
 const h=household(g);if(!h)return [];const errors=[];
 if(h.version!==1||!Array.isArray(h.guards)||h.guards.length!==2||!Array.isArray(h.days))return ['invalid household'];
 const ids=h.guards.flatMap(s=>[...new Set([s.actor,s.pending?.actor].filter(Boolean))]);if(new Set(ids).size!==ids.length)errors.push('duplicate personal guard');
 if(h.guards.some(s=>!['empty','following','door','waiting','held','unavailable'].includes(s.mode)))errors.push('invalid guard mode');
 if(new Set(h.days.map(r=>r.id)).size!==h.days.length)errors.push('duplicate daily occurrence');
 for(const r of h.days)if(!['pending','deferred','offered','inviting','active','done','skipped','expired'].includes(r.status)||r.activity&&!g.activities.some(a=>a.id===r.activity))errors.push('invalid daily activity');
 return errors;
}
