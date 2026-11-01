import {custodyUnavailable} from './custody-state.mjs';
import {recordSleep,wakeDaily,morningWashPending,afterDinner} from './daily-engine.mjs';
import {guardDeparture,guardArrival,guardsInside,moveWithGuards,recordHousehold} from './household-guards.mjs';
import {places} from './opening-content.mjs';
import {placeRegions,regions,travelMinutes} from './navigation-data.mjs';
import {campaignRank} from './campaign-engine.mjs';
import {observe} from './dialogue-core.mjs';
const now=g=>g.clock.elapsed_minutes, actor=(g,id)=>g.actors.find(a=>a.id===id);
export const clockMinute=g=>(now(g)+360)%1440;
export const playerPlace=g=>Object.keys(places).find(p=>places[p]===actor(g,'U001')?.location);
export const playerRegion=g=>placeRegions[playerPlace(g)]||g.opening?.travel?.fromRegion||'Z01';
export const night=g=>clockMinute(g)>=1200||clockMinute(g)<360;
const active=g=>g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
export function initializeNavigation(g){if(g.opening?.version===2&&!g.opening.navigation)g.opening.navigation={version:1,view:'room',notice:null,secret:false,tunnel:null,search:null,sleep:null,checked:now(g)};}
export const independent=g=>!!g.campaign&&campaignRank(g)==='independent';
export function appointmentPass(g,region){
 const i=g.opening?.invitation;
 return region==='Z03'&&i?.status==='agreed'&&g.messages.some(m=>m.id===i.report&&m.status==='已收到')&&now(g)>=i.at-90&&now(g)<=i.at+120&&!g.opening.visits.some(v=>v.scene==='barristan'&&g.activities.find(a=>a.id===v.activity)?.status==='ended');
}
const special=g=>!!g.finale||(!g.opening?.household?(!!g.campaign?.scene||active(g)?.kind==='council'||g.opening?.visits.some(v=>['cersei','barristan'].includes(v.scene)&&v.activity===active(g)?.id)):(['battle','battle-result'].includes(g.campaign?.scene)||!!g.campaign?.scene||active(g)?.kind==='council'||g.opening?.visits.some(v=>v.scene==='barristan'&&v.activity===active(g)?.id&&g.opening.invitation?.status==='agreed'&&now(g)<=g.opening.invitation.at+180))); // Continuous scenes close at their next safe boundary; no new ordinary activity after 02:00.
function move(g,id,p){if(id==='U001'&&g.opening?.household){moveWithGuards(g,places[p]);return;}const a=actor(g,id);if(a&&!custodyUnavailable(g,id)){a.location=places[p];a.location_precision='具体地点';a.last_updated_minute=now(g);}}
export function destination(g,place,{secret=false,pending=false}={}){
 let reason='';const to=placeRegions[place],from=playerRegion(g),n=g.opening?.navigation;
 if(!to)reason='这里尚未开放。';
 else if(morningWashPending(g)&&place!==playerPlace(g))reason='请先在寝室梳洗完毕。';
 else if(pending)reason='请先说完眼前这段话。';
 else if(g.opening?.travel)reason='仍在途中。';
 else if(active(g)||g.finale||g.campaign?.scene)reason='请先结束眼前的会面。';
 else if(!g.opening?.meetings.some(m=>m.status==='closed')&&to!=='Z01')reason='侍从提醒：「陛下，第一次御前会议还在等您，暂时不能出宫。」';
 else if(secret&&(!tunnelKnown(g)||!['Z01','Z02'].includes(from)||!['Z01','Z02'].includes(to)||from===to))reason='没有掌握这条通道。';
 else if(place==='C03'&&!appointmentPass(g,'Z03'))reason='会面室的门关着。需要教会确认的邀约。';
 const blocked=!reason&&!secret&&from==='Z01'&&to!=='Z01'&&night(g)&&!independent(g)&&!appointmentPass(g,to);
 const muster=!secret&&from==='Z01'&&to==='Z03'&&!g.opening.finished&&appointmentPass(g,to)?15:0;
 return {allowed:!reason,reason,blocked,minutes:secret?15:(travelMinutes(from,to)||0)+muster,arrival:now(g)+(secret?15:(travelMinutes(from,to)||0)+muster)};
}
function startTravel(g,place,minutes,{secret=false,forced=false,guards=null}={},o){
 const n=g.opening.navigation,fromRegion=playerRegion(g),participants=['U001'];
 if(g.opening.household){participants.push(...guardDeparture(g,secret?'秘密出行途中':'出行途中',secret?(guards??guardsInside(g)):null));}
 if(!g.opening.household&&!secret&&!n.secret){for(const id of ['P016','P054'])if(actor(g,id)?.location===actor(g,'U001').location&&o.actorFreeAt(g,id)<=now(g))participants.push(id);}
 // The first audience includes its already scheduled fifteen-minute escort muster.
 if(!g.opening.household&&!secret&&!n.secret&&fromRegion==='Z01'&&placeRegions[place]==='Z03'&&!g.opening.finished&&appointmentPass(g,'Z03')){
  for(const id of ['P016','P054'])if(!participants.includes(id)&&actor(g,id)?.location.includes('红堡')&&o.actorFreeAt(g,id)<=now(g))participants.push(id);
 }
 if(placeRegions[place]==='Z01'&&playerRegion(g)==='Z03'&&actor(g,'P011')?.location===actor(g,'U001').location&&g.execution.decisions.some(d=>d.actor==='P011'&&['return_intent','return_kingsguard'].includes(d.kind)&&d.status==='accepted'))participants.push('P011');
 g.opening.travel={destination:place,fromRegion,arrive:now(g)+minutes,actors:participants,forced,secret};
 n.secret=secret||n.secret;n.view='room';
 for(const id of participants){actor(g,id).location=secret?'秘密出行途中':'出行途中';actor(g,id).last_updated_minute=now(g);}
}
export function navigationNext(g,next){
 if(!g.opening?.navigation||g.finale)return next;
 const t=clockMinute(g);for(const boundary of [120,480,1200]){const delta=(boundary-t+1440)%1440||1440;next=Math.min(next,now(g)+delta);}
 const n=g.opening.navigation;if(n.sleep&&n.sleep.until>now(g))next=Math.min(next,n.sleep.until);
 return next;
}
function closeOrdinaryActivity(g){const a=active(g);if(a){a.status='ended';a.ended_at=now(g);for(const p of g.dialogue.presence.filter(p=>p.activity_ref===a.id))p.present=false;}}
function beginSleep(g){const n=g.opening.navigation;closeOrdinaryActivity(g);move(g,'U001','R01');n.view='room';n.secret=false;n.notice='窗外渐渐安静下来。侍从放下帷幔，国王歇息了。';const tod=clockMinute(g);n.sleep={until:now(g)+(480-tod+1440)%1440};recordSleep(g,n.sleep.until);}
export function navigationSettle(g,ctx,o,force=false){
 const n=g.opening?.navigation;if(!n||g.finale)return;
 if(n.notice?.startsWith('晨光穿过窗帘')&&clockMinute(g)!==480)n.notice='';
 // Existing saves are not retrospectively penalized on load or a view-only action.
 if(n.sleep&&now(g)>=n.sleep.until){wakeDaily(g);n.sleep=null;n.notice='晨光穿过窗帘。已经八点，侍从在门外候着。';}
 const changed=now(g)>n.checked;n.checked=now(g);
 if((!changed&&!force)||n.sleep||special(g)||g.opening.travel)return;
 const tod=clockMinute(g),region=playerRegion(g);
 if(tod>=120&&tod<360){
  closeOrdinaryActivity(g);
  if(region!=='Z01'){n.notice='夜已深，必须回宫歇息了。';startTravel(g,'R12',travelMinutes(region,'Z01'),{secret:n.secret,forced:true},o);}
  else beginSleep(g);
 }else if(night(g)&&region!=='Z01'&&!independent(g)&&!n.secret&&!appointmentPass(g,region)){
  closeOrdinaryActivity(g);n.notice='护卫上前低声提醒：「陛下，时候不早了，该回宫了。」';startTravel(g,'R12',travelMinutes(region,'Z01'),{forced:true},o);
 }
}
export function interruptSleep(g){
 const n=g.opening?.navigation;if(!n?.sleep)return;
 for(const r of g.opening.household?.days||[])if(r.definition==='sleep'&&r.status==='active'){r.status='deferred';r.reason='休息被必须处理的事态中断';}
 n.sleep=null;n.notice=null;
}
export function navigationTarget(g,target){const n=g.opening?.navigation;return Math.max(target,n?.sleep?.until||0,g.opening?.travel?.forced?g.opening.travel.arrive:0);}
export function applyNavigation(g,a,ctx,o){
 initializeNavigation(g);const n=g.opening?.navigation;o.need(n,'请从新版开局进入。');
 const idle=()=>o.need(!active(g)&&!g.opening.travel&&!g.finale&&!g.campaign?.scene,'请先结束眼前的会面。');
 if(a.type==='nav_view'){o.exact(a,['view']);idle();o.need(a.view==='room'||!morningWashPending(g),'请先在寝室梳洗完毕。');o.need(['room','region','city'].includes(a.view),'地图页不存在');n.view=a.view;n.notice=null;return 'MAP_VIEWED';}
 if(a.type==='nav_gate'){
  o.exact(a,['choice']);o.need(n.notice==='guard','守卫并未拦住你。');o.need(['return','insist'].includes(a.choice),'没有这项回应');
  n.notice=null;
  if(a.choice==='insist'){
   if(actor(g,'P001')?.life==='存活'&&actor(g,'P001').location.includes('红堡')&&o.actorFreeAt(g,'P001')<=now(g)){move(g,'P001','R12');n.notice='瑟曦赶到门前。「这个时辰，你哪里也不许去。」她示意守卫守住出口。';observe(g,['U001','P001'],'国王夜间要求出宫，瑟曦在堡门前阻止了他。',ctx.id);}
   else n.notice='守卫没有让开。「太后的禁令还在，陛下。今晚不能放行。」';
  }
  return 'GATE_RESPONSE';
 }
 if(a.type==='nav_move'){
  o.exact(a,['place','secret',...(Object.hasOwn(a,'guards')?['guards']:[])]);idle();o.need(!Object.hasOwn(a,'guards')||(a.secret&&Array.isArray(a.guards)&&new Set(a.guards).size===a.guards.length&&a.guards.every(id=>guardsInside(g).includes(id)||g.opening.household?.guards.some(s=>s.actor===id&&['door','waiting'].includes(s.mode)&&s.anchor===actor(g,'U001').location))),'随行近卫不在这里。');o.need(typeof a.secret==='boolean','出行方式无效');const d=destination(g,a.place,{secret:a.secret});o.need(d.allowed,d.reason);
  if(clockMinute(g)>=120&&clockMinute(g)<360){navigationSettle(g,ctx,o,true);o.advance(g,navigationTarget(g,now(g)),ctx);return 'NIGHT_ENDED';}
  if(d.blocked){const previous=actor(g,'U001').location;move(g,'U001','R12');for(const id of (g.opening.household?[]:['P016','P054']))if(actor(g,id)?.location===previous&&o.actorFreeAt(g,id)<=now(g))move(g,id,'R12');n.notice='guard';return 'GATE_STOPPED';}
  n.notice=null;
  if(!d.minutes){const previous=actor(g,'U001').location;move(g,'U001',a.place);if(!n.secret)for(const id of (g.opening.household?[]:['P016','P054']))if(actor(g,id)?.location===previous&&o.actorFreeAt(g,id)<=now(g))move(g,id,a.place);n.view='room';return 'LOCATION_CHANGED';}
  startTravel(g,a.place,d.minutes,{secret:a.secret,guards:a.guards||[]},o);o.advance(g,g.opening.travel.arrive,ctx);if(!g.opening.travel)n.view='region';return 'JOURNEY_COMPLETED';
 }
 if(a.type==='nav_sleep'){o.exact(a,[]);idle();o.need((night(g)||afterDinner(g))&&playerRegion(g)==='Z01','夜里回到红堡才能就寝。');beginSleep(g);o.advance(g,n.sleep.until,{...ctx,routineReserved:true});return 'SLEPT';}
 if(a.type==='nav_resume'){o.exact(a,[]);o.need(g.opening.travel||n.sleep,'没有未完行程');o.advance(g,g.opening.travel?.arrive||n.sleep.until,n.sleep?{...ctx,routineReserved:true}:ctx);return 'JOURNEY_RESUMED';}
 if(a.type==='nav_inspect_tunnel'){
  o.exact(a,['source']);if(!ctx.councilCommit)idle();
  if(n.search&&g.execution.tasks.some(t=>t.id===n.search&&t.status==='cancelled'))n.search=null;
  o.need(!n.tunnel&&!n.search,'这项核查已经交办。');o.need(['guard','varys'].includes(a.source),'线索来源无效');
  const guarded=g.politics.guard_plans.some(x=>x.status==='completed')||g.campaign?.completed.some(x=>x.operation==='guard');
  const lead=g.execution.decisions.findLast(d=>d.actor==='P004'&&d.kind==='tunnel_disclosure'&&d.target_ref==='RK-AEGON'&&d.status==='accepted');
  const turn=lead&&g.dialogue.turns.find(t=>lead.source_refs.includes(t.id)&&t.actor==='P004'&&t.audience.includes('U001'));
  o.need(a.source==='guard'?guarded:!!turn,'尚无已交接的守卫或瓦里斯提供的可核查线索。');
  const t=o.task(g,ctx,'tunnel_inspect','P048',{source:a.source,target_ref:a.source==='guard'?ctx.id:turn.id},15);n.search=t.id;return 'TUNNEL_INSPECTION_ORDERED';
 }
 return null;
}
export function runNavigationWork(g,t,ctx,o){
 if(t.kind!=='tunnel_inspect')return false;
 if(t.phase==='start'){t.phase='finish';t.next_at=now(g)+180;return true;}
 const n=g.opening.navigation;n.tunnel={id:'RK-AEGON',source:t.order_ref,verified_at:now(g),report:null};
 observe(g,[t.actor_ref],'核查旧通道，确认一条连接红堡与伊耿高丘的可通行路线。',t.order_ref);
 o.finish(g,t,'旧通道核查完成。已确认红堡通往伊耿高丘的路线，单程约一刻钟。此报告仅呈国王。',15);n.tunnel.report=o.order(g,t).report_message_id;return true;
}
export const tunnelKnown=g=>!!g.opening?.navigation?.tunnel&&g.messages.some(m=>m.id===g.opening.navigation.tunnel.report&&m.recipient==='U001'&&m.status==='已收到');

export function navigationErrors(g){
 const n=g.opening?.navigation;if(!n)return [];
 if(n.version!==1||!['room','region','city'].includes(n.view)||typeof n.secret!=='boolean'||!Number.isSafeInteger(n.checked)||n.checked<0||n.checked>now(g)||(n.notice!==null&&typeof n.notice!=='string'))return ['invalid navigation'];
 if(n.sleep&&(!Number.isSafeInteger(n.sleep.until)||n.sleep.until<now(g)))return ['invalid sleep'];
 if(n.search&&!g.execution.tasks.some(t=>t.id===n.search&&t.kind==='tunnel_inspect'))return ['missing tunnel inspection'];
 if(n.tunnel&&(!g.execution.tasks.some(t=>t.kind==='tunnel_inspect'&&t.order_ref===n.tunnel.source&&t.status==='completed')||n.tunnel.id!=='RK-AEGON'||n.tunnel.verified_at>now(g)||!g.messages.some(m=>m.id===n.tunnel.report&&m.recipient==='U001')))return ['unverified tunnel'];
 return [];
}
