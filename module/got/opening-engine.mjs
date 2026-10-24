import {moveWithGuards,guardArrival,synchronizeGuardPresence,physicalAudience,guardsInside} from './household-guards.mjs';
import {validateCouncilV3} from './council-v3.mjs';
import {initializeNavigation,applyNavigation,clockMinute} from './navigation-engine.mjs';
import {setWeeklyAgenda,campaignMissed,campaignIssue,campaignIntro} from './campaign-engine.mjs';
import {startSession} from './council-session.mjs';
import {issues,places,councilRoster,councilIntro,scenes,councilReport,cerseiScolding} from './opening-content.mjs';
import {observe,audience} from './dialogue-core.mjs';
const now=g=>g.clock.elapsed_minutes;
const actor=(g,id)=>g.actors.find(a=>a.id===id);
const active=g=>g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
const location=(g,id)=>actor(g,id)?.location;
const at=(g,id,p)=>location(g,id)===places[p];
const move=(g,id,p)=>{if(id==='U001'&&g.opening?.household){moveWithGuards(g,places[p]);return;}const a=actor(g,id);if(a){a.location=places[p];a.location_precision='具体地点';a.last_updated_minute=now(g);}};
const meeting=(g,id)=>g.opening.meetings.find(m=>m.id===id);
const heard=(g,text,source,listeners)=>observe(g,physicalAudience(g,listeners||[...new Set(['U001',...(active(g)?audience(g,active(g).id):[])])]),text,source);
const issueState=()=>Object.fromEntries(Object.keys(issues).map(k=>[k,{status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]}]));
const regular=(week,scheduled)=>({id:'COUNCIL-W'+week,week,type:'regular',scheduled,status:'scheduled',activity:null,current:null,issues:issueState(),attended:false,reminded:false,missed:false,late_reminded:false,final_reminded:false,minutes:null});
export function initializeOpening(g,continuous=false){
 if(g.opening){initializeNavigation(g);return;}
 g.opening={version:continuous?2:1,meetings:[regular(1,180)],events:[],jobs:[],appointments:[],travel:null,visits:[],recall_requested:false,guard_discussion:false,reputation_cleared:false,invitation:null,finished:false};
 for(const [id,p]of [['U001','R01'],['P016','R01'],['P001','R03'],['P012','R05'],['P060','R05'],['P061','R05'],['P004','R09'],['P018','R09'],['P048','R10'],['P054','R12']])move(g,id,p);
 initializeNavigation(g);
 // The morning invitation was sent before T0; city officials travel to it, not teleport on entry.
 for(const id of ['P005','P020'])g.opening.appointments.push({actor:id,place:'R07',depart:135,arrive:180,status:'scheduled',source:'T0例会通知'});
 for(const id of ['P004','P018','P012'])g.opening.appointments.push({actor:id,place:'R07',depart:180,arrive:180,status:'scheduled',source:'T0例会通知'});
}

export function openingNext(g,next){
 const s=g.opening;if(!s)return next;
 const times=[];
 if(s.version===2&&!s.events.includes("jaime-report"))times.push(540);
 for(const a of s.appointments)if(a.status!=='arrived')times.push(a.status==='scheduled'?a.depart:a.arrive);
 if(s.travel)times.push(s.travel.arrive);
 for(const m of s.meetings.filter(m=>m.type==='regular')){
  if(!m.reminded)times.push(m.scheduled-30);
  if(!m.late_reminded)times.push(m.scheduled+1);
  if(!m.final_reminded)times.push(m.week*10080-720);
  if(!m.missed)times.push(m.week*10080-360);
 }
 const lunch=s.visits.find(v=>v.scene==='lunch'&&g.activities.some(a=>a.id===v.activity&&a.status==='active'));
 if(lunch&&!lunch.joined)times.push(lunch.started+15);
 if(!s.events.includes('cersei-recount'))times.push(900);
 if(s.version===2&&!s.visits.some(v=>v.scene==='cersei')&&now(g)<945)times.push(945);
 if(s.invitation?.status==='agreed'&&!s.invitation.arrived)times.push(s.invitation.at);
 return Math.min(next,...times.map(t=>Math.max(now(g),t)));
}
function recordPresence(g,a,id,present,source){
 if(!a.participants.includes(id))a.participants.push(id);
 let p=g.dialogue.presence.find(p=>p.activity_ref===a.id&&p.actor===id);
 if(p){p.present=present;p.at=now(g);p.source_ref=source;}
 else g.dialogue.presence.push({activity_ref:a.id,actor:id,present,at:now(g),source_ref:source});
}
function beginActivity(g,ctx,o,kind,participants,place,nodes){
 o.need(!active(g),'请先结束或暂停当前活动。');
 o.need(participants.every(p=>at(g,p,place)&&o.actorFreeAt(g,p)<=now(g)),'有人尚未抵达或仍在执行工作，请查看预约与回报。');
 const a={id:o.key(g,'ACT'),kind,participants:[...participants],location:places[place],nodes:[...nodes],node:0,remaining:nodes[0],status:'active',started_at:now(g),ended_at:null};
 g.activities.push(a);for(const p of participants)recordPresence(g,a,p,true,ctx.id);synchronizeGuardPresence(g,ctx.id);return a;
}
export function openingSettle(g,ctx,o){
 const s=g.opening;if(!s)return;
 for(const ap of s.appointments.filter(a=>a.status!=='arrived')){
  if(ap.status==='scheduled'&&ap.depart<=now(g)){
   const free=o.actorFreeAt(g,ap.actor);if(free>now(g)){ap.arrive+=free-now(g);ap.depart=free;continue;}
   ap.status='travelling';const a=actor(g,ap.actor);a.location='赴约途中';a.last_updated_minute=now(g);
  }
  if(ap.status==='travelling'&&ap.arrive<=now(g)){move(g,ap.actor,ap.place);ap.status='arrived';}
 }
 if(s.travel&&s.travel.arrive<=now(g)){
  const t=s.travel,hidden=!!s.navigation?.secret;for(const id of t.actors)move(g,id,t.destination);s.travel=null;if(s.navigation){s.navigation.view='region';if(t.destination.startsWith('R'))s.navigation.secret=false;}
  guardArrival(g,true);
  if(hidden)observe(g,t.actors,'秘密出行抵达'+places[t.destination]+'。',ctx.id);
  else o.report(g,'ORG-ENVOY','已抵达'+places[t.destination]+'。',[ctx.id],'U001',0);
 }
 for(const m of [...s.meetings].filter(m=>m.type==='regular')){
  if(!m.reminded&&now(g)>=m.scheduled-30){m.reminded=true;if(!m.attended)o.report(g,guardsInside(g)[0]||'ORG-HOUSEHOLD','提醒：御前会议将在半小时后于议事厅开始。卷宗与待决事项已备好。',[m.id],'U001',0);}
  if(!m.late_reminded&&now(g)>m.scheduled){m.late_reminded=true;if(!m.attended)o.report(g,'ORG-HOUSEHOLD','本周御前会议尚未参加。可以在本周改约；各事项的期限仍然有效。',[m.id],'U001',0);}
  if(!m.final_reminded&&now(g)>=m.week*10080-720){m.final_reminded=true;if(!m.attended)o.report(g,'ORG-HOUSEHOLD','本周即将结束，尚有未亲自处理的会议事项。',[m.id],'U001',0);}
  if(!m.missed&&now(g)>=m.week*10080-360){
   m.missed=true;if(!m.attended){campaignMissed(g,m,ctx,o);s.events.push('absence:'+m.id);o.report(g,'ORG-HOUSEHOLD','本周未亲自处理例会。宫廷中开始有人说国王无心理政。未批准的新改革没有代为执行。',[m.id]);}
   const next=regular(m.week+1,m.week*10080+180);
   // Do not re-create settled opening issues each Monday. Carry only unresolved questions.
   next.issues=Object.fromEntries(Object.entries(m.issues).filter(([,v])=>['pending','deferred'].includes(v.status)).map(([k,v])=>[k,{...v,reported:false}]));
   setWeeklyAgenda(g,next);if(!g.campaign||next.week<=52)s.meetings.push(next);
  }
 }
 const lunch=s.visits.find(v=>v.scene==='lunch'&&!v.joined&&now(g)>=v.started+15&&g.activities.some(a=>a.id===v.activity&&a.status==='active'));
 if(lunch){
  const a=g.activities.find(a=>a.id===lunch.activity);lunch.joined=true;
  for(const id of ['P060','P061'])if(o.actorFreeAt(g,id)<=now(g)&&at(g,id,'R05'))recordPresence(g,a,id,true,ctx.id);
  const joined=['P060','P061'].filter(id=>audience(g,a.id).includes(id));
  if(joined.length)heard(g,joined.map(id=>id==='P060'?'托曼':'弥赛菈').join('与')+'在午餐后半段入席。侍从另添了餐具。',ctx.id,audience(g,a.id));
 }
 if(s.version===2&&!s.events.includes('jaime-report')&&now(g)>=540){
  s.events.push('jaime-report');
  for(const recipient of ['U001','P001','P004','P018'])o.report(g,'ORG-ENVOY','河间地送来战报：詹姆·兰尼斯特被北军俘获。信使与封印已经核对。',['OPEN-JAIME-ADAPTATION'],recipient,0);
 }
 if(!s.events.includes('cersei-recount')&&now(g)>=900){
  s.events.push('cersei-recount');
  // One bounded report of Sansa's actual experience, never the whole meeting ledger.
  if(o.actorFreeAt(g,'P012')<=now(g)&&location(g,'P012')?.includes('红堡')){
   const heardBySansa=g.dialogue.observations.filter(x=>x.actors.includes('P012')&&x.source.startsWith('COUNCIL-'));
   move(g,'P012','R03');observe(g,['P001','P012'],'珊莎按瑟曦要求复述自己亲耳听见的呈报与决定：'+(heardBySansa.map(x=>x.content).join('\n')||'没有可复述的会议呈报。'),ctx.id);
  }else o.report(g,'ORG-HOUSEHOLD','珊莎尚未到场复述，太后暂未收到她的说明。',[ctx.id],'P001',0);
 }
 if(s.version===2&&s.recall_requested&&s.reputation_cleared&&g.orders.find(x=>x.id==='ORD01')?.status==='已撤销'&&!s.jobs.some(j=>j.kind.startsWith('church'))&&g.opportunities.find(x=>x.id==='OP01')?.status==='可行动')startWork(g,ctx,o,now(g)<720?'church_tutorial':'church');
 if(s.invitation?.status==='agreed'&&!s.invitation.arrived&&now(g)>=s.invitation.at){s.invitation.arrived=true;move(g,'P011','C03');}
 if(s.version===2&&now(g)>=180&&!s.meetings[0].activity&&!active(g)&&!s.travel){
  move(g,'U001','R07');if(!s.household&&o.actorFreeAt(g,'P016')<=now(g))move(g,'P016','R07');
  applyOpeningAction(g,{type:'opening_council',meeting:s.meetings[0].id},ctx,o);
 }
 if(s.version===2&&now(g)>=945&&!active(g)&&!s.travel&&!s.visits.some(v=>v.scene==='cersei')&&location(g,'U001')?.includes('红堡')&&['P001','P012'].every(id=>o.actorFreeAt(g,id)<=now(g))){move(g,'U001','R03');applyOpeningAction(g,{type:'opening_visit',scene:'cersei'},ctx,o);}
 for(const m of s.meetings.filter(m=>m.status==='in_progress'))if(g.activities.find(a=>a.id===m.activity)?.status==='ended')m.status='paused';
}

// Costs are the current calibrated, bounded opening design. Every work step is a task in the existing queue.
const workRules={
 preserve:{actor:'ORG-HOUSEHOLD',steps:[60,30,60,30,720,30],texts:['完成遗体与首级清点。','已撤下首级，交由本地看守集中保管。','静默姐妹与必要物料已经抵达。','完成实物交接，开始专业保存与装殓。','本地保存装殓已完成。','管事已核验服务与收据；本地善后实付48金龙，未安排远程运输。'],budget:60,cost:48},
 compensate:{actor:'P005',steps:[60,60,30],texts:['两名死者及领取家属身份已核实。','两家各40金龙与12金龙丧葬凭据核验完毕。','两家款项及丧葬费用共92金龙已支付并签收，剩余8金龙预算释放。'],budget:100,cost:92},
 verify:{actor:'P005',steps:[60],texts:['两名死者与家属名单已核实；尚未批准或支付抚恤。'],budget:0,cost:0},
 clear:{actor:'ORG-ENVOY',steps:[45],texts:['巴利斯坦的公开正名文书已送交宣读；未因此承诺复职。'],budget:0,cost:0},
 theft:{actor:'P048',steps:[60,60],texts:['已核对失物清单，一只银盘确实缺失；不是国库款项短少。','库房借还记录缺签，门岗凭条未能与交接簿逐一对应。已列明管事、库房与门岗责任范围；尚不足以指认窃贼。'],budget:0,cost:0},
 church:{actor:'ORG-ENVOY',steps:[45,180,45],texts:['信使抵达教会接洽。','可信邀请已经转达；对方接受安全面谈，不承诺重新效力。','信使带回明确会面安排。'],budget:0,cost:0}
};
workRules.church_again=workRules.church;
workRules.church_tutorial={...workRules.church,steps:[30,120,30]};
export function startWork(g,ctx,o,kind){
 const r=workRules[kind];o.need(r,'未知开局委托。');
 o.need(!g.opening.jobs.some(j=>j.kind===kind&&!['cancelled'].includes(g.execution.tasks.find(t=>t.id===j.task)?.status)),'该项委托已经登记，请查看原任务而非重复交办。');
 const t=o.task(g,ctx,'opening_work',r.actor,{target_ref:kind},kind.startsWith('church')?0:15);
 const reservation=r.budget?o.reserve(g,ctx,t.order_ref,r.budget):null;
 o.order(g,t).reservation_refs=reservation?[reservation]:[];
 g.opening.jobs.push({task:t.id,kind,step:0,reservation,records:[],paid:0});return t;
}
export function runOpeningWork(g,t,ctx,o){
 if(t.kind!=='opening_work')return false;
 const s=g.opening,j=s.jobs.find(j=>j.task===t.id),r=workRules[j.kind];
 if(t.phase==='start'){
    if(j.kind.startsWith('church')){
   o.need(g.orders.find(x=>x.id==='ORD01')?.status==='已撤销'&&s.reputation_cleared,'邀请尚缺已生效撤令或实际正名。');
   o.need(g.opportunities.find(x=>x.id==='OP01')?.status==='可行动','巴利斯坦的联络窗口已经关闭。');
  }
  t.phase='finish';t.next_at=now(g)+r.steps[j.step];return true;
 }
 if(t.phase!=='finish')return false;
 if(j.step===r.steps.length-1&&r.cost){o.spend(g,ctx,r.cost,j.reservation,r.texts[j.step],[t.order_ref]);o.release(g,j.reservation);j.paid=r.cost;}
 j.records.push({at:now(g),text:r.texts[j.step]});observe(g,[t.actor_ref],r.texts[j.step],t.order_ref);
 if(j.kind==='clear')s.reputation_cleared=true;
 if(j.kind.startsWith('church')&&j.step===1){
  o.need(g.opportunities.find(x=>x.id==='OP01')?.status==='可行动','巴利斯坦已经离城，未获得面谈约定。');
  const day=Math.floor((now(g)+360)/1440);let date=day*1440+780;if(date<now(g)+(j.kind==='church_tutorial'?90:105))date+=1440;
  o.need(date<=2220,'两晚内已没有能够完成回信与出行的会面时段。');
  s.invitation={status:'agreed',at:date,arrived:false,report:null,order:t.order_ref};
  const d={id:o.key(g,'DEC'),actor:'P011',kind:'meeting_accepted',target_ref:t.order_ref,status:'accepted',source_refs:[t.order_ref],at:now(g)};
  g.execution.decisions.push(d);g.execution.opportunity_extensions.push({opportunity_ref:'OP01',until:Math.max(2880,date+120),evidence_ref:d.id});
  observe(g,['P011'],'收到可信邀请并同意在大圣堂面谈；追捕已撤销、正名已传达，不等于同意复职。',t.order_ref);
 }
 j.step++;
 if(j.step<r.steps.length){t.next_at=now(g)+r.steps[j.step];return true;}
 o.finish(g,t,r.texts.at(-1)+(j.kind.startsWith('church')?' 约定为第'+(Math.floor((s.invitation.at+360)/1440)+1)+'日19:00，大圣堂会面室。':''),j.kind.startsWith('church')?0:15);
 if(j.kind.startsWith('church'))s.invitation.report=o.order(g,t).report_message_id;
 return true;
}

export function applyOpeningAction(g,a,ctx,o){
 if(!a.type.startsWith('opening_'))return null;
 const s=g.opening;o.need(s,'这份旧存档没有开局引导；可保留它，另开新版T0。');
 o.need(!s.travel||a.type==='opening_arrive','仍在出行途中，请继续行程。');
 const exact=keys=>o.exact(a,keys);
 const idle=()=>o.need(!active(g),'请先结束或暂停当前活动。');
 if(a.type==='opening_move'){
  if(s.version===2)return applyNavigation(g,{type:'nav_move',place:a.place,secret:false},ctx,o);
  exact(['place']);idle();o.need(places[a.place],'目的地未开放。');const outside=a.place==='C03',wasOutside=at(g,'U001','C03');
  if(outside!==wasOutside){
   o.need(!outside||s.invitation&&g.messages.some(m=>m.id===s.invitation.report&&m.status==='已收到'),'尚未收到大圣堂会面的回信。');
   o.need(o.actorFreeAt(g,'P054')<=now(g)&&(!outside||location(g,'P054')?.includes('红堡')),'护卫尚不能出行。');
   s.travel={destination:a.place,arrive:now(g)+(outside?60:45),actors:['U001','P054',...(!outside&&at(g,'P011','C03')&&g.execution.decisions.some(d=>d.actor==='P011'&&['return_kingsguard','return_intent'].includes(d.kind)&&d.status==='accepted')?['P011']:[])]};
   for(const id of s.travel.actors){actor(g,id).location='出行途中';actor(g,id).last_updated_minute=now(g);}return 'JOURNEY_STARTED';
  }
  move(g,'U001',a.place);if(location(g,'P016')?.includes('红堡')&&o.actorFreeAt(g,'P016')<=now(g))move(g,'P016',a.place);return 'LOCATION_CHANGED';
 }
 if(a.type==='opening_arrive'){exact([]);if(!s.travel)return 'JOURNEY_ALREADY_ARRIVED';o.advance(g,s.travel.arrive,ctx);return 'JOURNEY_ADVANCED';}
 if(a.type==='opening_reschedule'){
  exact(['meeting','at']);idle();const m=meeting(g,a.meeting);o.need(m&&m.status!=='in_progress'&&Number.isSafeInteger(a.at)&&a.at>=now(g)+45&&a.at<m.week*10080-360,'请在本周安排至少45分钟后的时段。');
  m.scheduled=a.at;m.reminded=false;m.late_reminded=false;
  for(const p of councilRoster.filter(p=>!['P016','P012'].includes(p))){o.need(!s.appointments.some(x=>x.actor===p&&x.status==='travelling'),'有关人员正在赴约，请待抵达后再改约。');s.appointments=s.appointments.filter(x=>x.actor!==p||x.status==='arrived');s.appointments.push({actor:p,place:'R07',depart:a.at-45,arrive:a.at,status:'scheduled',source:m.id});}
  return 'COUNCIL_RESCHEDULED';
 }
 if(a.type==='opening_emergency'){
  exact(['topics']);idle();o.need(Array.isArray(a.topics)&&a.topics.length&&new Set(a.topics).size===a.topics.length&&a.topics.every(k=>issues[k]||campaignIssue(g,k)),'请选择已有的待议事项。');
  const regular=s.meetings.findLast(x=>x.type==='regular'),id=o.key(g,'COUNCIL');
  o.need(!s.meetings.some(x=>x.type==='emergency'&&!['closed'].includes(x.status)),'已有待开的紧急会议。');
  const m={...regular,session:null,attended:false,missed:false,id,type:'emergency',scheduled:now(g)+45,status:'scheduled',activity:null,current:null,issues:Object.fromEntries(a.topics.map(k=>[k,structuredClone(regular.issues[k]||issueState()[k]||{status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]})])),minutes:null};s.meetings.push(m);
  for(const p of [...new Set([...councilRoster,...(g.campaign?['P001','P003','P002']:[])])].filter(p=>!['P016','P012'].includes(p)&&actor(g,p)?.life==='存活'&&/红堡|君临/.test(location(g,p))&&!location(g,p).includes('途中')))s.appointments.push({actor:p,place:'R07',depart:now(g),arrive:now(g)+45,status:'scheduled',source:id});return 'EMERGENCY_SCHEDULED';
 }
 if(a.type==='opening_council'){
  exact(['meeting']);idle();const m=meeting(g,a.meeting);o.need(m&&m.status!=='closed'&&now(g)>=m.scheduled,'会议尚未到预约时间，或已经散会。');o.need(at(g,'U001','R07'),'请先前往议事厅。');
  const present=(g.campaign&&m.week>1?[...new Set([...councilRoster,'P001','P003','P002'])]:councilRoster).filter(p=>at(g,p,'R07')&&o.actorFreeAt(g,p)<=now(g));
  const previous=g.activities.find(x=>x.id===m.activity);
  const remaining=m.session?[180]:s.version===2?[180]:previous?(previous.node<previous.nodes.length?[previous.remaining,...previous.nodes.slice(previous.node+1)]:[30]):[30,30,30];
  const act=beginActivity(g,ctx,o,'council',['U001',...present],'R07',remaining);m.activity=act.id;m.status='in_progress';
  if(s.version===2)startSession(g,m,ctx.councilVersion||2,ctx.authoredPlay===true);
  if(!previous)heard(g,g.campaign&&m.week>1?campaignIntro(g,m):present.includes('P012')?councilIntro:councilIntro.replace('，命史塔克小姐旁听',''),m.id);return 'COUNCIL_STARTED';
 }
 if(a.type==='opening_issue'){
  exact(['meeting','issue']);const m=meeting(g,a.meeting),q=m?.issues[a.issue];o.need(m?.status==='in_progress'&&active(g)?.id===m.activity&&q,'请先进入这场会议。');m.current=a.issue;
  if(!q.reported){q.reported=true;
   heard(g,councilReport(a.issue,audience(g,m.activity)),m.id+':'+a.issue);
  }return 'ISSUE_PRESENTED';
 }
 if(a.type==='opening_decide'){
  exact(['meeting','issue','choice']);const m=meeting(g,a.meeting),q=m?.issues[a.issue];o.need(m?.status==='in_progress'&&active(g)?.id===m.activity&&q?.reported,'请先听取该项呈报。');o.need(!['decided','declined'].includes(q.status),'该议题已经裁定，请查看原命令；改变已发命令须另行撤回。');
  const def=issues[a.issue],choice=def.choices.find(c=>c[0]===a.choice);o.need(choice||a.choice==='defer','没有这项议题选项。');
  const before=g.orders.length;
  if(a.issue==='remains'&&a.choice==='preserve')startWork(g,ctx,o,'preserve');
  if(a.issue==='pursuit'&&['cancel','recall'].includes(a.choice)){
   if(g.orders.find(x=>x.id==='ORD01').status!=='已撤销'&&!g.execution.tasks.some(t=>t.kind==='cancel'&&t.params.target_ref==='ORD01'&&!['completed','cancelled','blocked'].includes(t.status)))o.apply(g,{type:'cancel_order',order_ref:'ORD01'},ctx);
   if(!s.jobs.some(j=>j.kind==='clear'))startWork(g,ctx,o,'clear');
   if(a.choice==='recall'){s.recall_requested=true;heard(g,(audience(g,m.activity).includes('P018')?'派席尔':'书记依据现任名册')+'提醒：七席已满。邀请面谈并未授予第八件白袍，桑铎的新职责与退职必须分别谈妥。',m.id+':seats');}
  }
  if(a.issue==='compensation'&&['approve','verify'].includes(a.choice))startWork(g,ctx,o,a.choice==='approve'?'compensate':'verify');
  if(a.issue==='theft'&&['inspect','reform'].includes(a.choice)){startWork(g,ctx,o,'theft');if(a.choice==='reform')s.guard_discussion=true;}
  q.status=a.choice==='defer'||a.choice==='verify'?'deferred':['refuse','maintain','keep','hold'].includes(a.choice)?'declined':'decided';q.choice=a.choice;q.decision_ref=ctx.id;q.order_refs=[...q.order_refs,...g.orders.slice(before).map(x=>x.id)];m.attended=true;
  heard(g,'国王裁定：'+(choice?.[1]||'此项暂缓')+'。'+(q.order_refs.length?'已交办，仍待实际执行与回报。':''),m.id+':decision:'+a.issue);
  // The emergency and regular entry reference the same question, not two executions.
  for(const other of s.meetings.filter(x=>x.id!==m.id&&x.week===m.week))if(other.issues[a.issue]){other.issues[a.issue]=structuredClone(q);if(Object.values(other.issues).every(x=>['decided','declined'].includes(x.status)))other.attended=true;}
  return 'COUNCIL_DECISION_SAVED';
 }
 if(a.type==='opening_pause'||a.type==='opening_close'){
  exact(['meeting']);const m=meeting(g,a.meeting);o.need(m&&['in_progress','paused'].includes(m.status),'会议尚未开始。');
  const act=g.activities.find(x=>x.id===m.activity);
  if(act?.status==='active'){
   // Closing a fully processed council includes its still-unplayed confirmation nodes.
   // Pausing preserves the current remaining duration; reading never charged time.
   if(a.type==='opening_close'){
    const complete=Object.values(m.issues).every(q=>q.status!=='pending');
    const end=now(g)+act.remaining+(complete?act.nodes.slice(act.node+1).reduce((n,x)=>n+x,0):0);
    while(now(g)<end&&act.status==='active'){
     const before=now(g);o.apply(g,{type:'advance_activity',activity_ref:act.id},ctx);
     if(g.autonomy.checkpoint||now(g)===before)break;
    }
    if(g.autonomy.checkpoint)return 'COUNCIL_CLOSURE_WAITING';
   }
   if(act.status==='active')o.apply(g,{type:'end_activity',activity_ref:act.id},ctx);
  }
  m.status=a.type==='opening_pause'?'paused':'closed';
  m.minutes=Object.entries(m.issues).map(([id,q])=>({title:issues[id].title,status:q.status,choice:issues[id].choices.find(c=>c[0]===q.choice)?.[1]||'尚未裁定',orders:[...q.order_refs]}));
  return 'COUNCIL_SAVED';
 }
 if(a.type==='opening_sansa_leave'){
  exact([]);const act=active(g);o.need(act?.kind==='council','当前不是会议。');recordPresence(g,act,'P012',false,ctx.id);act.participants=act.participants.filter(p=>p!=='P012');g.dialogue.presence=g.dialogue.presence.filter(p=>p.activity_ref!==act.id||p.actor!=='P012');move(g,'P012','R05');heard(g,'国王让珊莎先回餐室休息。她未听见此后的讨论。',ctx.id);return 'LISTENER_LEFT';
 }
 if(a.type==='opening_invite'){
  exact([]);o.need(g.orders.find(x=>x.id==='ORD01')?.status==='已撤销'&&s.reputation_cleared,'请等待撤令实际生效并完成正名。');startWork(g,ctx,o,s.version===2&&now(g)<720?'church_tutorial':'church');return 'INVITATION_SENT';
 }
 if(a.type==='opening_rebook'){
  exact([]);o.need(s.invitation&&now(g)>s.invitation.at+60&&s.invitation.at===780,'第一晚尚未错过，或已经改约过。');
  o.need(now(g)+330<=2220,'已没有足够的联络和出行时间。');startWork(g,ctx,o,'church_again');return 'SECOND_EVENING_REQUESTED';
 }
 if(a.type==='opening_visit'){
  exact(['scene']);idle();const def=s.version===2&&a.scene==='cersei'?{...scenes.cersei,actors:['P001','P012'],text:cerseiScolding}:scenes[a.scene];o.need(def,'场景未开放。');o.need(now(g)>=def.earliest,'尚未到这个活动的可约时段。');o.need(at(g,'U001',def.place),'请先前往'+places[def.place]+'。');
  o.need(!s.visits.some(v=>v.scene===a.scene),'这次引导场景已经开始过；请继续原活动或使用普通会面。');
  if(a.scene==='barristan'){
   o.need(s.invitation?.arrived&&now(g)<=s.invitation.at+60,'尚未到已约定的会面，或已错过时段。');
   o.need(!s.household||!guardsInside(g).length,'请先让近卫在门外等候，再开始这次私下面谈。');
  }
  // Local invitations are explicit, within the same free palace transfer rules. No remote summons.
  for(const id of def.actors){o.need(o.actorFreeAt(g,id)<=now(g),'人物目前正在值勤或处理事务。');if(def.place!=='C03'){o.need(location(g,id)?.includes('红堡'),'人物尚未抵达红堡。');move(g,id,def.place);}}
  const act=beginActivity(g,ctx,o,a.scene==='lunch'||a.scene==='dinner'?'meal':'private_talk',['U001',...def.actors],def.place,def.nodes);
  if(a.scene==='barristan')g.opportunities.find(x=>x.id==='OP01').status='已完成'; // Safe contact achieved; not reinstatement.
  s.visits.push({scene:a.scene,activity:act.id,started:now(g),joined:false});
  if(a.scene==='barristan')observe(g,audience(g,act.id),'本次可以分别谈安全保证、谅解、提供意见和返回君临；白袍复职仍需另行落实。',ctx.id,[{ref:'BARRISTAN-AUDIENCE',kind:'barristan_audience',scope:'本次面谈：安全、谅解、意见或回归意向；不授予白袍'}]);
  heard(g,def.text,ctx.id);
  if(s.version===2&&a.scene==='cersei'){
   const visit=s.visits.find(v=>v.scene==='barristan'),turns=visit?g.dialogue.turns.filter(t=>t.activity===visit.activity):[];
   const recounted=g.dialogue.observations.some(x=>x.actors.includes('P001')&&x.content.startsWith('珊莎按瑟曦要求复述'));
   const choice=s.meetings[0].issues.pursuit.choice;
   const question=!recounted?'瑟曦问道：「我还没听到一份像样的交代。巴利斯坦的事，你今天怎么处置的？」':choice==='recall'?'瑟曦问道：「珊莎说，你要把巴利斯坦请回来。你究竟指望他替你做什么？事情办到哪一步了？」':choice==='cancel'?'瑟曦问道：「你撤了追捕，还替他正名。下一步呢？你准备就这样让他离开？」':'瑟曦问道：「搜捕还在继续。那个老头仍没归案，你打算怎么办？」';
   heard(g,question,ctx.id);
   if(turns.length)observe(g,['U001'],'你记得在大圣堂听到的答复：'+turns.map(t=>t.post.summary).join('；'),ctx.id);
  }return 'OPENING_SCENE_STARTED';
 }
 if(a.type==='opening_protect'){
  exact(['choice']);const act=active(g);o.need(s.visits.some(v=>v.scene==='cersei'&&v.activity===act?.id),'当前不是今晚的会面。');
  o.need(!s.events.includes('sansa-response'),'已经作出回应。');
  const lines={protect:'你挡在珊莎与桌子之间。「今天的决定是我作的。有什么话，问我。」瑟曦的目光从她脸上移向你。「那你就回答我，乔弗里。」',gentle:'「母亲，让她坐下吧。今天已经够难熬了。」瑟曦沉默了一会儿，向墙边的椅子偏了偏头。「坐吧，史塔克小姐。好好听着。」',silent:'你没有为珊莎开口。瑟曦让她站到一边。「现在，轮到你告诉我了，乔弗里。」'};
  o.need(lines[a.choice],'没有这项回应。');s.events.push('sansa-response');heard(g,lines[a.choice],ctx.id);return 'RELATIONSHIP_EXPERIENCE';
 }
 if(a.type==='opening_scene_end'){
  exact([]);const act=active(g);o.need(act&&act.kind!=='council','没有待结束的私人会面。');
  const end=now(g)+act.remaining+act.nodes.slice(act.node+1).reduce((a,b)=>a+b,0);
  while(act.status==='active'&&now(g)<end){const before=now(g);o.apply(g,{type:'advance_activity',activity_ref:act.id},ctx);if(g.autonomy.checkpoint||now(g)===before)break;}
  return 'PRIVATE_SCENE_FINISHED';
 }
 if(a.type==='opening_finish'){exact([]);idle();o.need((s.version===2?s.visits.some(v=>v.scene==='cersei'&&g.activities.find(a=>a.id===v.activity)?.status==='ended'):now(g)>=2400),'请先结束今晚的会面。');s.finished=true;if(s.version===2){move(g,'U001','R01');if(!s.household&&location(g,'P016')?.includes('红堡')&&o.actorFreeAt(g,'P016')<=now(g))move(g,'P016','R01');if(at(g,'P012','R03')&&o.actorFreeAt(g,'P012')<=now(g))move(g,'P012','R05');if(now(g)<1560){const tod=(now(g)+360)%1440;if(s.household&&(tod>=1200||tod<360))o.apply(g,{type:'nav_sleep'},ctx);else o.advance(g,1560,ctx);}}return 'TUTORIAL_FINISHED';}
 o.need(false,'未知引导操作。');
}

export function openingErrors(g){
 const s=g.opening;if(s===undefined)return g.execution?.tasks.some(t=>t.kind==='opening_work')?['opening work has no opening record']:[];
 try{
  if(![1,2].includes(s.version)||Object.keys(s).filter(k=>!['navigation','household'].includes(k)).sort().join()!==['version','meetings','events','jobs','appointments','travel','visits','recall_requested','guard_discussion','reputation_cleared','invitation','finished'].sort().join())throw Error();
  for(const k of ['meetings','events','jobs','appointments','visits'])if(!Array.isArray(s[k]))throw Error();
  for(const m of s.meetings){if(!['scheduled','in_progress','paused','closed'].includes(m.status)||!Number.isSafeInteger(m.scheduled)||m.scheduled<0||!['regular','emergency'].includes(m.type))throw Error();for(const [k,q]of Object.entries(m.issues))if(!(issues[k]||campaignIssue(g,k)||(m.session?.version===3&&m.session.agenda.some(t=>t.id===k&&t.origin===null)))||!['pending','deferred','decided','declined'].includes(q.status)||!Array.isArray(q.order_refs)||q.order_refs.some(id=>!g.orders.some(o=>o.id===id)))throw Error();}
  for(const m of s.meetings)if(m.session){const c=m.session;if(c.version===3)validateCouncilV3(c);if(![1,2,3].includes(c.version)||!['intro','discussion','extra','registering','review','closed','reports','agenda','agenda_ready','topic_review','polishing','speaking','decision','archiving','clarify','ready'].includes(c.phase)||!Array.isArray(c.turns)||!Array.isArray(c.choices)||!Array.isArray(c.order)||!c.approvals||c.turns.some(t=>!t.context||!t.pre||typeof t.prose!=='string'||!Array.isArray(t.request_records)))throw Error();}
  for(const j of s.jobs)if(!workRules[j.kind]||!g.execution.tasks.some(t=>t.id===j.task&&t.kind==='opening_work')||j.step<0||j.step>workRules[j.kind].steps.length||j.paid>workRules[j.kind].cost)throw Error();
  for(const v of s.visits)if(!scenes[v.scene]||!g.activities.some(a=>a.id===v.activity))throw Error();
  for(const a of s.appointments)if(!actor(g,a.actor)||!places[a.place]||!['scheduled','travelling','arrived'].includes(a.status)||a.arrive<a.depart)throw Error();
  if(s.travel&&(!places[s.travel.destination]||s.travel.arrive<now(g)||!s.travel.actors.every(id=>actor(g,id))))throw Error();
  return [];
 }catch{return ['invalid opening flow'];}
}

export function openingView(g){
 const s=g.opening;if(!s)return null;
 return {place:location(g,'U001'),at:now(g),meetings:s.meetings.map(m=>({...structuredClone(m),issues:Object.entries(m.issues).map(([id,q])=>({id,...q,...(campaignIssue(g,id)||issues[id])}))})),
  story:g.dialogue.observations.filter(o=>o.actors.includes('U001')&&(o.source.startsWith('COUNCIL-')||s.visits.some(v=>v.started===o.at))).map(o=>o.content),
  travel:s.travel?{destination:places[s.travel.destination],arrive:s.travel.arrive}:null,
  invitation:s.invitation&&g.messages.some(m=>m.id===s.invitation.report&&m.status==='已收到')?{at:s.invitation.at}:null,
  visits:s.visits.map(v=>v.scene),recall:s.recall_requested,guard:s.guard_discussion,finished:s.finished};
}
