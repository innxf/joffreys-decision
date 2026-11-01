import {absentActor,custodyUnavailable,custodyClerkReport} from './custody-state.mjs';
import {reformMeetingIssue} from './reform-meetings.mjs';
import {reformIncome,reformCapability,reformProcedure} from './reform-engine.mjs';
import {guardOnDuty,moveWithGuards,physicalAudience} from './household-guards.mjs';
import {routineOccupied} from './daily-engine.mjs';
import {cardRoutine,extraRoutineRoster,additionalDaily,annualGuests,annualCards} from './event-schedule.mjs';
import {conditionsMet,eventWorkErrors} from './event-work.mjs';
import {eventCards,eventCardNext,eventCardErrors,eventCardIssue,eventCardReport,commitCardDecision,settleEventCards,cardSceneView,chooseCardScene,queueCampaignOperation} from './event-cards.mjs';
import {characterState,pendingCharacters,characterSceneCue} from './character-state.mjs';
import {actorEvidence,audience} from './dialogue-core.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
﻿// Annual author events use the existing clock, task queue, ledger and commit transaction.
import {campaignCatalog} from './campaign-catalog.mjs';
import {weeklyDefinition,operations,privateScenes,politicalScenes,specialCouncils} from './campaign-content.mjs';
import {places} from './opening-content.mjs';
import {observe} from './dialogue-core.mjs';
const DAY=1440,now=g=>g.clock.elapsed_minutes,day=g=>Math.floor(now(g)/DAY),person=(g,id)=>g.actors.find(a=>a.id===id);
const busy=(g,id)=>custodyUnavailable(g,id)||g.activities.some(a=>a.status==='active'&&a.participants.includes(id))||g.execution.tasks.some(t=>t.actor_ref===id&&t.status==='executing'&&t.kind!=='reform')||g.opening?.travel?.actors.includes(id)||g.opening?.appointments.some(a=>a.actor===id&&a.status==='travelling');
const ongoing=g=>g.activities.some(a=>a.status==='active'&&a.participants.includes('U001'))||g.opening?.travel;
const basis=(detail,refs=[])=>({kind:'本卡设计',refs,detail});
const has=(g,key)=>g.campaign.completed.some(r=>r.operation===key);
const result=(g,key)=>g.campaign.completed.filter(r=>r.operation===key).at(-1);
const usable=g=>g.resources.find(x=>x.id==='RES-CASH').quantity.value-g.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)).reduce((s,r)=>s+r.amount,0);
const watchHeadcount=g=>g.forces.filter(f=>f.food_pool==='RES-FOOD-WATCH').reduce((n,f)=>n+f.strength.value,0);
const encounters=[...privateScenes,...politicalScenes];
const annualEdition=g=>g.opening.meetings.some(m=>m.session?.version===3);
const politicalCast=p=>p.id==='POLITICAL-VICTORY'||p.id==='POLITICAL-MARRIAGE'?['U001','P002','P003']:p.id==='POLITICAL-ROSE'?['U001','P030','P031','P032']:['U001',p.actor];
function militaryReport(g,o,text,refs){
 for(const recipient of ['U001','P020',...(g.offices.some(x=>x.id==='OFF-ACTING'&&x.holder==='P003'&&x.status==='在任')?['P003']:[])])o.report(g,'ORG-WATCH',text,refs,recipient);
}
export function initializeCampaign(g){
 if(g.campaign||!g.opening||g.opening.version!==2)return;
 for(const r of campaignCatalog.roster)if(!person(g,r.id))addActor(g,r.id,r.name,r.stages[0].location);
 g.campaign={version:1,catalog_version:campaignCatalog.version,events:[],completed:[],decisions:[],scene:null,scene_step:0,history:[],private_done:[],schedule_stamp:'',standing:false,periods:[],battle:null,tywin:'overbearing',tyrion:'cautious',tyrell:'bargaining',ceremony:'MARGAERY_WEDDING',north:'pending',sansa:'other',tommen:'cautious',marriage_protected:false,qyburn:false};
}
export const campaignIssue=(g,id)=>reformMeetingIssue(g,id)||(g.campaign?(eventCardIssue(g,id)||(/^annual-\d+$/.test(id)?weeklyDefinition(Number(id.slice(7))):null)):null);
export const annualMeeting=g=>g.opening?.meetings.find(m=>m.type==='regular'&&!m.missed&&m.status!=='closed'&&m.week>1);
export function setWeeklyAgenda(g,m){
 if(!g.campaign||m.week<2)return;
 const d=weeklyDefinition(m.week);m.issues=d?{[d.id]:{status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]}}:{};
}
const assigned=(g,id)=>g.assignments.some(a=>a.task_commander===id&&['active','handover','returning'].includes(a.status)&&a.end_at>now(g));
function move(g,id,location){if(id==='U001'&&g.opening?.household){moveWithGuards(g,location);return true;}const a=person(g,id);if(!a||a.life!=='存活'||busy(g,id)||assigned(g,id))return false;a.location=location;a.location_precision='具体地点或已登记行程';a.last_updated_minute=now(g);return true;}
function addActor(g,id,name,location){
 if(!g.entities.some(e=>e.id===id))g.entities.push({...structuredClone(g.entities.find(e=>e.id==='P018')),id,name});
 if(!person(g,id))g.actors.push({...structuredClone(person(g,'P018')),id,roles:[name],location,actual_authority:'仅按本局已成立职责',authority_basis:'年度作者行程',limits:['不自动获得他人秘密或权限'],basis:basis('年度作者行程及人物名册',[id]),last_updated_minute:now(g)});
}
function deliverScene(g,id,text,actors=['U001']){observe(g,actors.includes('U001')?physicalAudience(g,actors):actors,text,id);}
export function campaignReport(g,m,who){
 const missing=custodyClerkReport(g,(campaignIssue(g,m.current)||weeklyDefinition(m.week)).presenters,who);if(missing)return missing;
 const cardReport=eventCardReport(g,m.current,who);if(cardReport)return cardReport;
 const d=campaignIssue(g,m.current)||weeklyDefinition(m.week);const presenter=d.presenters.find(id=>who.includes(id));
 const name=campaignCatalog.roster.find(r=>r.id===presenter)?.name||'持有卷宗的书记';
 const actual=g.messages.filter(x=>x.recipient==='U001'&&x.status==='已收到'&&x.delivered_minute>=(m.week-2)*10080&&(who.includes(x.sender)||(['ORG-TREASURY','ORG-WATCH','ORG-HOUSEHOLD'].includes(x.sender)))&&!x.content.startsWith('北方密报：')).slice(-4).map(x=>x.content);
 const visible=g.messages.filter(x=>x.recipient==='U001'&&x.status==='已收到');
 const reported=op=>g.execution.tasks.some(t=>t.params.operation===op&&t.status==='completed'&&visible.some(m=>m.fact_refs.includes(t.order_ref)));
 const variants={
  30:'提利昂把商人的催款信压在账册下。「先把缺粮、缺钱和没有送到的货分开。哪一处真断了，就先救哪一处；若只是迟了回执，别先抓人。」',
  32:reported('defense')?'城防官带来已经交付的修缮回执。「修过的这一段，门闩和伤兵通路都试过。其余部分，不能借这张回执一起报竣工。」':'城防官展开旧图。「这次没有可据以报竣工的新回执。若陛下要修，就先定一段，给出人手与费用；已经在办的，等原负责人交付。」',
  35:reported('alliance')?'使者的回执摆在桌上。河湾接受继续磋商兵粮与婚盟，尚未把援军交给国王指挥。提利昂说：「答应坐下来谈，是第一步。别把最后一步也替他们答应了。」':'提利昂问起使节的授权。「没有本局已送达的谈判答复，就不要先说盟友答应了什么。今天可以决定我们愿意谈到哪一步。」',
  37:'书记将已经收到的饷粮与工程回执放在桌上。「这是眼下能够核实的部分。未到期的不是欠款，未交付的也不能写作已经备好。」',
  46:'瓦里斯谈到北方的宴请。「有请柬，不等于有谋杀证据，陛下。要让远方的人改变安排，得有他们肯相信的理由。」书记只记录席间真正呈报的内容，没有展开国王的私人信件。'
 };
 const partial={
  30:'书记核对现有供养卷宗：缺钱、缺粮与在途款货分别记录，未到回执不能据此断言已交付或有人贪污。',
  32:reported('defense')?'书记转呈已收到的本局城防修缮回执；只证明已验收范围，其余部分不能一起报竣工。':'书记说明：没有可据以报竣工的新回执。未完工程须等原负责人实际交付。',
  35:reported('alliance')?'卷宗有已送达的谈判答复，但答应磋商不等于援军已经交给国王指挥。':'书记说明：没有本局已送达的谈判答复，不能先声称盟友作出承诺。',
  37:'书记只核对已送达的饷粮与工程回执；未到期的不是欠款，未交付的不能写作已经备好。',
  46:'北方事项仅限本次实际呈报的消息。国王私人信件没有因会议召开而公开给在场人物。'
 };
 return `${name}开始呈报。\n${(d.presenters.every(id=>who.includes(id))?variants[m.week]:partial[m.week])||d.report}`+(actual.length?'\n本次带来的回执：\n'+actual.join('\n'):'');
}
export function campaignIntro(g,m){const d=weeklyDefinition(m.week),title=m.type==='emergency'?Object.keys(m.issues).map(id=>campaignIssue(g,id)?.title||'刚到的呈报').join('、'):d.title;return '众人等国王坐定，书记才展开卷宗。\n「陛下，先议'+title+'。旧事务的回执也一并带来了。若您另有吩咐，随后可以再议。」';}
function schedule(g){
 const c=g.campaign;if(!c||!g.opening.finished)return;
 const hour=Math.floor((now(g)+360)%DAY/60),slot=hour<9?0:hour<12?1:hour<18?2:3,stamp=day(g)+':'+hour;
 const nav=g.opening.navigation; if(nav)nav.routines??={};
 if(!nav&&c.schedule_stamp===stamp)return;c.schedule_stamp=stamp;
 const due=annualMeeting(g);
 for(const r of [...campaignCatalog.roster.filter(r=>!annualGuests.some(p=>p.id===r.id)),...extraRoutineRoster()]){
  const a=person(g,r.id);if(!a||a.life!=='存活')continue;
  if(guardOnDuty(g,r.id)||routineOccupied(g,r.id)||g.opening?.household?.guards.some(s=>s.pending?.actor===r.id)||busy(g,r.id)||assigned(g,r.id)){if(nav)delete nav.routines[r.id];continue;}
  // Active appointment wins over a daily routine, even when waiting in the meeting room.
  if(g.opening.appointments.some(p=>p.actor===r.id&&p.status==='arrived'&&p.arrive<=now(g)&&now(g)<=p.arrive+180&&g.opening.meetings.some(m=>m.id===p.source&&m.status!=='closed')))continue;
  if(due&&now(g)>=due.scheduled-45&&now(g)<=due.scheduled+180&&g.opening.appointments.some(p=>p.source===due.id&&p.actor===r.id))continue;
  if(g.administration.organizations.some(o=>o.source_refs[0]!=='T0'&&o.office_refs.some(id=>g.offices.some(f=>f.id===id&&f.holder===r.id))))continue;
  if(g.opening.appointments.some(p=>p.actor===r.id&&p.source?.startsWith('EXP-')&&['travelling','arrived'].includes(p.status)&&now(g)<=p.arrive+90))continue;
  if(r.id==='P011'){
   if(!g.execution.decisions.some(d=>d.actor==='P011'&&['return_intent','return_kingsguard'].includes(d.kind)&&d.status==='accepted'))continue;
  }
  if(['P012','P061','P060'].includes(r.id)&&!a.location.includes('红堡'))continue;
  let stage=r.stages.filter(s=>s.from<=day(g)).at(-1);
  if(r.id==='P061'&&day(g)>=322&&(!c.events.includes('dorne')||has(g,'dorne')))stage=r.stages.filter(s=>s.from<322).at(-1);
  if(!stage)continue;
  const daily=r.daily.length?r.daily:(additionalDaily[r.id]||[]).map((place,i)=>({hour:[6,9,12,18][i],place}));
  const local=daily.length&&/红堡|君临|会馆/.test(stage.location)&&!/途中|城外战场|已离开/.test(stage.location);
  if(local){
   if(nav?.routines[r.id]===stamp)continue;
   let dest=daily[slot].place;
   if(r.id==='P004')dest=hour>=9&&hour<18?'R25':'R09';
   if(r.id==='P020')dest=hour>=9&&hour<18?'C04':'R12';
   dest=cardRoutine(g,r.id,hour)||dest;
   if(['P064','P065'].includes(r.id)&&g.execution.evidence.some(e=>e.category==='event:redwyne-released'&&e.status==='realized'))continue;
   const sleeping=hour<6||hour>=((['P060','P061','P012'].includes(r.id))?21:23);
   if(sleeping){
    const origin=Object.keys(places).find(k=>places[k]===a.location),duration=origin?travelMinutes(placeRegions[origin],'Z01'):0;
    if(duration){g.opening.appointments.push({actor:r.id,place:'R12',depart:now(g),arrive:now(g)+duration,status:'travelling',source:'routine:'+stamp});a.location='赴约途中';a.last_updated_minute=now(g);}
    else {move(g,r.id,r.id==='P001'?places.R03:'红堡·'+r.name+'的住处');if(nav)nav.routines[r.id]=stamp;}
    continue;
   }
   const origin=Object.keys(places).find(k=>places[k]===a.location),duration=origin?travelMinutes(placeRegions[origin],placeRegions[dest]):0;
   if(duration){g.opening.appointments.push({actor:r.id,place:dest,depart:now(g),arrive:now(g)+duration,status:'travelling',source:'routine:'+stamp});a.location='赴约途中';a.last_updated_minute=now(g);}
   else move(g,r.id,places[dest]);
   if(nav)nav.routines[r.id]=stamp;
  }
  else if(r.stages.length>1&&!a.roles.includes('王室近卫指挥者')&&!g.assignments.some(x=>x.task_commander===r.id&&!['returned','cancelled'].includes(x.status)))move(g,r.id,stage.location);
 }
 if(!g.opening.household&&!busy(g,'P016')&&!assigned(g,'P016')&&!g.opening.navigation?.secret&&person(g,'P016')?.location.includes('红堡')&&person(g,'U001')?.location.includes('红堡')&&!g.offices.some(o=>o.holder==='P016'&&o.id!=='OFF-KG7'&&o.title?.includes('近卫')))move(g,'P016',person(g,'U001').location);
}
export function campaignNext(g,next){
 const c=g.campaign;if(!c||!g.opening?.finished||g.finale?.freeze)return next;
 const times=[];
 if(!annualEdition(g))for(const p of politicalScenes)if(!c.private_done.includes(p.id))times.push(p.day*DAY+180);
 for(const p of annualGuests)if(!c.events.includes('guest:'+p.id))times.push(p.arrival*DAY);
 for(const [id,t] of [['tyrion',14*DAY],['renly',180*DAY],['jaime-release',210*DAY],['battle',270*DAY+600],['postwar',271*DAY],['inheritance',274*DAY],['rose-arrival',280*DAY],['sansa-proposal',294*DAY],['sansa-arrangement',315*DAY],['dorne',322*DAY+720],['north-lead',301*DAY],['red-wedding',330*DAY+840],['rosby-return-start',267*DAY],['rosby-return-arrival',269*DAY],['oberyn',345*DAY],['wedding-contract',350*DAY],['finale',360*DAY+720]])if(!c.events.includes(id))times.push(t);
 for(const e of g.opening.meetings.filter(m=>m.type==='emergency'&&m.status!=='closed'&&c.events.includes('forced:'+m.id)))times.push(e.scheduled);
 const m=annualMeeting(g);if(m){if(!c.events.includes('summon:'+m.id))times.push(m.scheduled-45);if(specialCouncils[m.week]&&!m.activity&&!(m.week===27&&annualEdition(g)))times.push(m.scheduled);}
 times.push((Math.floor(now(g)/10080)+1)*10080);
 const tod=(now(g)+360)%DAY;for(const h of [2,6,8,9,12,17,18,20,21,23])times.push(now(g)+(h*60>tod?h*60-tod:DAY+h*60-tod));
 for(const row of schedules(g))if(!c.events.includes(row.id))times.push(row.at);
 return eventCardNext(g,Math.min(next,...times.filter(t=>t>now(g))));
}
function schedules(g){const rows=[];
 for(let d=44;d<=366;d+=14)rows.push({id:'WATCH:'+d,at:d*DAY,ref:'PAY10',amount:700});
 for(let d=35;d<=365;d+=15)rows.push({id:'HOUSE:'+d,at:d*DAY,ref:'PAY07',amount:400});
 for(let d=52;d<=365;d+=28)rows.push({id:'NAVY:'+d,at:d*DAY,ref:'PAY08',amount:3200});
 return rows;
}
function autoPay(g,ctx,o){
 if(!g.campaign.standing&&!reformProcedure(g,'payment_review'))return;
 for(const p of g.obligations.filter(p=>p.due_minute<=now(g)&&p.status!=='已支付')){
  const qualified=['PAY01','PAY02','PAY06','PAY07','PAY08','PAY10'].includes(p.id)||p.id.startsWith('CPAY-')||g.politics.debts.some(d=>d.dues.some(x=>x.obligation_ref===p.id&&x.kind==='interest'));
   if(!qualified||o.paymentFunds(g,p.reservation_id,[p.id])<p.amount)continue;
  if(g.execution.tasks.some(t=>t.params.obligation_ref===p.id&&['sent','accepted','executing','blocked'].includes(t.status)))continue;
  if(g.politics.debts.some(d=>d.dues.some(x=>x.obligation_ref===p.id))){o.apply(g,{type:'pay_bond_interest',obligation_ref:p.id},ctx);continue;}
  const source=result(g,'service')?.source_ref||reformProcedure(g,'payment_review');
  if(!source)continue;
  if(!g.execution.inspections.some(x=>x.target_ref===p.id&&x.result==='verified')){
   // Reuse the real inspection task: delivery, staff time and conflicts still apply.
   // A cancelled/refused inspection is not silently recreated by standing authority.
   if(!g.execution.tasks.some(t=>t.kind==='inspect_payment'&&t.params.obligation_ref===p.id))o.task(g,ctx,'inspect_payment','ORG-TREASURY',{obligation_ref:p.id,source},15,'P005');
   continue;
  }
  o.task(g,ctx,'payment','ORG-TREASURY',{obligation_ref:p.id,source},15,'P005');
 }
}
export function campaignSettle(g,ctx,o){
 const c=g.campaign;if(!c||!g.opening?.finished||g.finale?.freeze)return;
 const needs={tyrion:['P003','P017'],renly:['P007'],'jaime-release':['P015'],postwar:['P002','P030','P033'],'rose-arrival':['P031','P032'],inheritance:['P003','P002'],'sansa-proposal':['P005'],'sansa-arrangement':['P002','P003','P012'],dorne:['P002','P061'],'rosby-return-start':['P060'],'rosby-return-arrival':['P060'],'red-wedding':['P008','P009']};
 const event=(id,t,fn)=>{if(now(g)>=t&&!c.events.includes(id)){c.events.push(id);if((needs[id]||[]).some(a=>absentActor(g,a)))return;fn();}};
 for(const p of annualGuests)event('guest:'+p.id,p.arrival*DAY,()=>{addActor(g,p.id,p.name,places[p.place]);move(g,p.id,places[p.place]);o.report(g,'ORG-HOUSEHOLD',p.name+'已抵达预约接洽处。',['event-guest:'+p.id],'U001',15);});
 event('tyrion',14*DAY,()=>{move(g,'P003',places.R09);move(g,'P017',places.R09);const off=g.offices.find(x=>x.id==='OFF-ACTING');if(!off.holder){off.holder='P003';off.status='在任';off.basis=basis('D14到任及已送达的泰温授权',['KL04']);}observe(g,['P003'],'你已抵达君临，带着泰温委派你代理国王之手的书信。你尚未因此核清王室账目，也不知道国王此前的全部私下安排。','KL04');o.report(g,'P003','提利昂已经抵达君临，带来泰温委派处理政务的书信。',['KL04'],'U001',0);});
 event('renly',180*DAY,()=>{const a=person(g,'P007');if(a.life==='存活'&&!absentActor(g,a.id)){a.life='已故';a.location='风息堡';}const marriage=g.commitments.find(c=>c.id==='C06');marriage.status='因死亡终止';marriage.terms='蓝礼死亡，原婚姻已终止；河湾政治联盟另行选择';for(const id of ['U001','P001','P003','P004','P018'])o.report(g,'ORG-ENVOY','南方战报：蓝礼死亡，军队分流。河湾尚须另谈；史坦尼斯的威胁正在增加。',['RE02'],id,0);});
 event('jaime-release',210*DAY,()=>{const a=person(g,'P015'),captivity=g.commitments.find(c=>c.id==='C03');if(a.life==='存活'&&captivity.status==='实际拘押'){captivity.status='押送南返';captivity.terms='凯特琳安排詹姆由布蕾妮押送南返；尚未抵达君临';o.report(g,'ORG-ENVOY','北方来信：詹姆离开了奔流城的囚所，正在押送南返。行程仍未结束。',['C03'],'P001',5*DAY);}});
 event('postwar',271*DAY,()=>{if(c.battle?.result==='city_lost')return;for(const id of ['P002','P030','P033'])move(g,id,places.R09);o.report(g,'ORG-ENVOY','泰温与河湾将领已入红堡，封赏、军费与职位安排即将商议。',['TW03'],'U001',0);});
 event('rose-arrival',280*DAY,()=>{for(const id of ['P031','P032'])move(g,id,places.R05);o.report(g,'ORG-HOUSEHOLD','高庭的女眷已经抵达，王室婚盟与家人安排仍待议定。',['MQ17'],'U001',0);});
 event('inheritance',274*DAY,()=>{o.report(g,'P003','提利昂要求凯岩城继承权，被泰温断然拒绝。泰温正重新安排朝廷职责；国王此前已经授予的有效权限尚未被撤销。',['C5-06-A'],'U001',0);});
 event('sansa-proposal',294*DAY,()=>{o.report(g,'P005','高庭提出珊莎与维拉斯的婚配意向。泰温倾向抢先安排提利昂，目前尚未订婚；请在三周内明确王室安排。',['C5-11-A','C5-11-B'],'U001',0);});
 event('sansa-arrangement',315*DAY,()=>{if(!c.marriage_protected){applyMarriage(g,'P003','C5-11-C');for(const id of ['U001','P012','P003'])o.report(g,'P002','在没有获接受的替代安排下，泰温落实了珊莎与提利昂的订婚文书。尚未举行婚礼。',['CAMP-MARRIAGE-SANSA'],id,0);}});
 event('dorne',322*DAY+720,()=>{if(has(g,'dorne'))return;const a=person(g,'P061');if(a.life!=='存活')return;
  const promise={...structuredClone(g.commitments.find(c=>c.id==='C01')),id:'CAMP-MYRCELLA',parties:['P061','ORG-CROWN','P036'],status:'已成立',terms:'战后与多恩议定弥赛菈婚盟及护送；非黑水河之前出发',basis:basis('本版改编的战后默认外交',['MQ17'])};g.commitments.push(promise);if(absentActor(g,a.id))return;a.location='赴多恩途中';a.last_updated_minute=now(g);o.report(g,'P002','弥赛菈依战后协议启程前往多恩。国王此前没有取得并落实替代安排。',[promise.id],'U001',0);});
 event('rosby-return-start',267*DAY,()=>{const a=person(g,'P060');if(a?.life==='存活'&&a.location==='罗斯比城·避险住处'){a.location='自罗斯比城返堡途中';o.report(g,'ORG-ENVOY','护送队已接到托曼，两日后返抵红堡。',['EXP-W20-C'],'U001',15);}});
 event('rosby-return-arrival',269*DAY,()=>{const a=person(g,'P060');if(a?.life==='存活'&&a.location==='自罗斯比城返堡途中'){a.location=places.R05;o.report(g,'ORG-HOUSEHOLD','托曼已随护送人员回到红堡。',['EXP-W20-C'],'U001',15);}});
 event('oberyn',345*DAY,()=>{addActor(g,'R001','奥柏伦·马泰尔',places.G06);o.report(g,'ORG-HOUSEHOLD','多恩亲王的弟弟奥柏伦已到君临。',['FIN-CAST-R001'],'U001',0);});
 event('wedding-contract',350*DAY,()=>{if(c.ceremony==='MARGAERY_WEDDING'){const old=g.commitments.find(x=>x.id==='C01');if(old.status==='有效'){old.status='已解除';old.terms='战后王室与高庭婚盟成立，乔弗里与珊莎原婚约解除';}g.commitments.push({...structuredClone(old),id:'CAMP-ROYAL-WEDDING',parties:['U001','P032'],status:'有效',terms:'王室与高庭已订立婚约，待盛典履行',basis:basis('本局沿用婚盟；此前允许改为庆典',['MQ19'])});o.report(g,'ORG-HOUSEHOLD','王室与高庭婚约已经登记，盛典按婚礼准备。',['CAMP-ROYAL-WEDDING'],'U001',0);}});
 event('north-lead',301*DAY,()=>{if(has(g,'intelligence'))o.report(g,'ORG-ENVOY','北方密报：佛雷正在筹备婚宴，另一路回执证实有人异常调整宾客护卫。尚不足以公开定罪，却足以提出正式预警、请求改变宴会。',['INTERVENTION_RED'],'U001',DAY);});
 event('red-wedding',330*DAY+840,()=>{c.north=has(g,'warning')?'north_alive':'red_wedding';if(c.north==='red_wedding')for(const id of ['P008','P009']){const a=person(g,id);if(a?.life==='存活'&&!absentActor(g,id)){a.life='已故';a.location='孪河城';}}o.report(g,'ORG-ENVOY',c.north==='north_alive'?'北方回报：警讯已被采信，原定宴会安排改变。罗柏和凯特琳仍在世，后续外交尚待协商。':'北方传来噩耗：孪河城婚宴发生屠杀，罗柏与凯特琳遇害。',['INTERVENTION_RED'],'U001',5*DAY);});
 // Each projected receipt has a single actual delivery. The wartime reduction is authored, not hidden tax theft.
 const w=Math.floor(now(g)/10080);
 for(let i=1;i<=Math.min(w,52);i++)if(!c.events.includes('tax:'+i)){
  c.events.push('tax:'+i);let r=g.receivables.find(x=>x.id==='INC'+String(i).padStart(2,'0'));
  if(!r){r={...structuredClone(g.receivables[0]),id:'CINC-'+i,earliest_minute:i*10080,expected_amount:i>=27&&i<=39?600:1000,status:'预计未入库',basis:basis('年度商路续期；危机期缩减预测，非原著数字',['INC04'])};g.receivables.push(r);}
  if(!g.settlements.some(x=>x.evidence_refs.includes(r.id)&&x.delta>0)&&r.status!=='已到账'){const actual=reformIncome(g,r,r.expected_amount,ctx,o);o.change(g,ctx,'RES-CASH',actual,'本期税款实际缴库（含已交付改革的有效期间）',[r.id]);r.status='已到账';o.report(g,'P005',`本期港口与市税实际缴库${actual}金龙。`,[r.id]);}
 }
 for(const row of schedules(g))event(row.id,row.at,()=>{const base=g.obligations.find(p=>p.id===row.ref),extra=row.ref==='PAY10'?Math.max(0,g.consumption.find(x=>x.id==='USE02').rate_per_day-2000)*0.02*14:0;g.obligations.push({...structuredClone(base),id:'CPAY-'+row.id,amount:Math.round((row.amount+extra)*10000)/10000,reservation_id:null,due_minute:row.at,status:'待核验或支付',reason:'原职责续期核验：'+base.reason,basis:basis('沿原供养口径续期；人数变化单列',['PAY10','PAY07','PAY08'])});});
 autoPay(g,ctx,o);
 for(let period=1;period<=Math.floor(now(g)/(28*DAY));period++)if(!c.periods.some(p=>p.period===period))c.periods.push({period,at:period*28*DAY,clear:g.obligations.filter(p=>p.due_minute>=(period-1)*28*DAY&&p.due_minute<period*28*DAY&&p.id!=='PAY09').every(p=>p.status==='已支付'),source_ref:ctx.id});
 for(const card of annualCards)if(now(g)>=card.days[0]*DAY&&now(g)<=(card.days[1]+1)*DAY&&card.route!=='scene'&&conditionsMet(g,card.requires)&&!c.events.includes('card-report:'+card.id)){
  c.events.push('card-report:'+card.id);for(const recipient of [...new Set(['U001',...card.presenters.filter(id=>person(g,id)?.life==='存活')])]){const ref=o.report(g,'ORG-HOUSEHOLD',card.title+'：'+(card.report||card.question||card.title),[card.id],recipient,15);g.messages.find(x=>x.id===ref).event_refs.push(card.id);}
 }
 schedule(g);
 const m=annualMeeting(g);
 if(m&&!c.events.includes('summon:'+m.id)&&now(g)>=m.scheduled-45){
  c.events.push('summon:'+m.id);const ids=['P001','P004','P005','P018','P020',...(day(g)>=14?['P003']:[]),...(day(g)>=271?['P002']:[])];
  for(const id of ids){const a=person(g,id);if(a?.life==='存活'&&!assigned(g,id)&&(a.location.includes('红堡')||a.location.includes('君临')))g.opening.appointments.push({actor:id,place:'R07',depart:now(g),arrive:now(g)+Math.max(0,m.scheduled-now(g)),status:'scheduled',source:m.id});}
 }
 const crisis=g.opening.meetings.find(m=>m.type==='emergency'&&m.status!=='closed'&&c.events.includes('forced:'+m.id)&&now(g)>=m.scheduled);
 if(crisis&&!ongoing(g)&&!c.scene){move(g,'U001',places.R07);o.apply(g,{type:'opening_council',meeting:crisis.id},ctx);return;}
 if(annualEdition(g)&&c.events.includes('renly')&&!c.events.includes('renly-council')&&!ongoing(g)&&!c.scene&&!g.opening.meetings.some(m=>m.type==='emergency'&&m.status!=='closed')){o.apply(g,{type:'opening_emergency',topics:['annual-27']},ctx);c.events.push('renly-council','forced:'+g.opening.meetings.at(-1).id);return;}
 if(m&&specialCouncils[m.week]&&!(m.week===27&&annualEdition(g))&&now(g)>=m.scheduled&&!m.activity&&!ongoing(g)){
  move(g,'U001',places.R07);if(!g.opening.household)move(g,'P016',places.R07);o.apply(g,{type:'opening_council',meeting:m.id},ctx);return;
 }
 if(!ongoing(g)&&!c.scene){
  if(now(g)>=270*DAY+600&&!c.events.includes('battle')){c.events.push('battle');c.scene='battle';c.scene_step=0;return;}
  if(now(g)>=360*DAY+720&&!c.events.includes('finale')){c.events.push('finale');c.scene='finale';return;}
  const political=!annualEdition(g)&&politicalScenes.find(p=>now(g)>=p.day*DAY+180&&day(g)<=p.day+7&&!c.private_done.includes(p.id)&&politicalCast(p).every(id=>person(g,id)?.life==='存活'&&!busy(g,id)&&!assigned(g,id)));
  if(political){for(const id of politicalCast(political))move(g,id,places[political.place]);c.scene=political.id;c.scene_step=0;return;}
  settleEventCards(g,ctx,o);if(c.scene)return;
  const p=annualEdition(g)||g.opening.navigation?.view!=='room'?null:privateScenes.find(p=>day(g)>=p.day&&day(g)<=p.end&&!c.private_done.includes(p.id)&&person(g,p.actor)?.life==='存活'&&person(g,p.actor).location===person(g,'U001').location&&person(g,p.actor).location===places[p.place]&&!busy(g,p.actor));
  if(p){c.scene=p.id;c.scene_step=0;}
 }
}
export function campaignMissed(g,m,ctx,o){
 if(!g.campaign||m.week<2)return;
 const d=weeklyDefinition(m.week);if(!d)return;
 // A missed week's unapproved proposal does not cancel already operating projects.
 g.campaign.decisions.push({id:m.id,operation:'review',at:now(g),source_ref:'DEFAULT:'+m.id,status:'missed'});
 o.report(g,absentActor(g,day(g)>=271?'P002':day(g)>=14?'P003':'P001')?'ORG-HOUSEHOLD':day(g)>=271?'P002':day(g)>=14?'P003':'P001','本周未候到国王亲临，'+d.title+'按现有职责维持；未获批准的新安排没有执行。',[m.id]);
 for(const card of annualCards.filter(x=>!x.parent&&x.week===m.week&&x.route!=='scene'&&conditionsMet(g,x.requires))){
  if(g.campaign.history.some(h=>h.scene===card.id&&['council-decision','missed-council'].includes(h.choice)))continue;
  if(!g.messages.some(x=>x.recipient==='U001'&&x.status==='已收到'&&x.event_refs.includes(card.id)))continue;
  g.campaign.history.push({scene:card.id,choice:'missed-council',text:'本周未作新裁决；已有授权继续，新增办法未发令。另有明确期限的事项按原期限办理。',at:now(g),meeting:m.id,source_ref:ctx.id});
 }
 // The actual D315 deadline, not merely missing W43, controls the default betrothal.
}
function applyMarriage(g,spouse,source){
 const current=g.commitments.find(x=>x.parties.includes('P012')&&x.status==='有效');
 if(current&&current.parties.includes(spouse))return;
 if(current&&current.parties.includes('U001')){current.status='已解除';current.terms='战后婚盟调整，原乔弗里与珊莎婚约解除';}
 else if(current)return; // never overwrite a different fulfilled arrangement
 if(spouse){const template=g.commitments.find(x=>x.parties.includes('P012'));g.commitments.push({...structuredClone(template),id:'CAMP-MARRIAGE-SANSA',parties:['P012',spouse],status:'有效',terms:'战后正式订婚安排；双方引用同一记录',basis:basis('年度婚配分支',[source])});}
}
function evidence(g,op,ref,o){g.execution.evidence.push({id:o.key(g,'EV'),category:'campaign_'+op,status:'realized',at:now(g),source_ref:ref,stage_ref:'MQ'+(day(g)<90?'07':day(g)<180?'10':day(g)<270?'14':'19')});g.campaign.completed.push({operation:op,at:now(g),source_ref:ref});}
function authority(g,op,ctx,o){
 const scope={actions:[op],max_count:0,group_id:'',location:'君临'};
 g.authorities.push({id:o.key(g,'AUTH'),issuer:day(g)>=271?'P002':'P003',subject:'U001',relation:'negotiated_scope',object_ref:'ORG-CROWN',scope,starts_at:now(g),expires_at:500*DAY,status:'active',source_refs:[ctx.id],delivery_refs:[ctx.id]});
}
export function powerLevels(g){
 const c=g.campaign;if(!c)return Object.fromEntries(['finance','military','administration','intelligence'].map(k=>[k,'unformed']));
 const guard=g.politics.guard_plans.some(p=>p.status==='completed'&&g.forces.some(f=>f.id===p.force_ref&&f.strength.value>0));
 const trained=has(g,'training')||reformCapability(g,'training','FORCE01')>=100,funded=g.resources.find(r=>r.id==='RES-FOOD-WATCH').quantity.value>0;
 const paymentAuthority=g.authorities.some(a=>a.subject==='U001'&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length&&a.scope.actions.includes('approved_payment_review'));
 const finance=(has(g,'treasury')||reformProcedure(g,'payment_review'))&&paymentAuthority?(c.periods.slice(-2).length===2&&c.periods.slice(-2).every(p=>p.clear)?'stable':'initial'):'unformed';
 const military=guard?(trained&&funded&&g.assignments.some(a=>a.status==='returned')?'stable':'initial'):'unformed';
 const administration=has(g,'autonomy')?'stable':finance!=='unformed'||guard?'initial':'unformed';
 const intelligence=has(g,'intelligence')?(has(g,'crosscheck')?'stable':'initial'):'unformed';
 return {finance,military,administration,intelligence};
}
export function campaignRank(g){const p=powerLevels(g);return p.finance==='stable'&&p.military==='stable'&&p.administration==='stable'&&p.intelligence!=='unformed'?'independent':p.finance!=='unformed'&&p.military!=='unformed'&&(p.administration!=='unformed'||p.intelligence!=='unformed')?'negotiating':'constrained';}
export function planWork(g,op,ctx,o,source){
 const r=operations[op];o.need(r,'这项办法尚未写成可执行命令。');
 if(op==='review')return;
 if(op==='marriage'&&g.commitments.some(x=>x.kind==='婚约'&&x.parties.includes('P012')&&!x.parties.includes('U001')&&x.status==='有效')){o.report(g,'ORG-HOUSEHOLD','新婚约已经成立，不能再用阻止未定婚配的命令撤销。解除须另行交涉。',[source]);return;}
 if(op==='dorne'&&!person(g,'P061').location.includes('红堡')){o.report(g,'ORG-ENVOY','公主已经启程，不能把暂缓出发的命令当成实际召回。',[source]);return;}
 if(['treasury','guard','autonomy','support','marriage','dorne','rose','qyburn','intelligence','crosscheck'].includes(op)&&has(g,op)){o.report(g,'ORG-HOUSEHOLD','原安排已经生效，本次保留，没有重复收费或另发一遍命令。',[source]);return;}
 if(g.execution.tasks.some(t=>t.kind==='campaign_work'&&t.params.operation===op&&['sent','accepted','executing','blocked'].includes(t.status))){o.report(g,r.worker,'该项工作已有委托，继续等候原任务回报。',[source]);return;}
 if(op==='treasury'&&day(g)<14){o.report(g,'ORG-HOUSEHOLD','财政权限交换留待代理首相到任；现有付款权限仍有效。',[source]);return;}
 const constraints=op==='crosscheck'?has(g,'intelligence'):op==='warning'?(has(g,'intelligence')&&g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&m.content.startsWith('北方密报：'))&&now(g)+8*DAY<330*DAY+840):op==='training'?o.freeGroup(g,g.forces.find(f=>f.id==='FORCE01'),4)>=100:op==='recruits'?watchHeadcount(g)+200<=6000:op==='autonomy'?!!g.campaign.battle&&campaignRank(g)!=='constrained':['marriage','dorne'].includes(op)?campaignRank(g)!=='constrained':op==='qyburn'?day(g)>=300:true;
 if(!constraints){o.report(g,r.worker,({crosscheck:'王室还没有落实直接回报渠道，先保留港口原有簿册。',warning:'现有线索或送信时间不足以促成那条预警路线；不把寄出信当成阻止宴会。',training:'没有一百名可以替换的现员，不能把值勤者重复算作学员。',recruits:'这批二百人会超过本轮六千人的范围，不能照原案招入；较小批次或扩大范围须另议。',autonomy:'泰温没有接受扩大任免范围，愿意保留已有的窄权限。',marriage:'泰温不肯放弃现有婚配安排；国王尚未争得这项决定权。',dorne:'家族没有接受替代外交条件，送往多恩的提案仍在。',qyburn:'科本的推荐与来京行程尚未成立。'})[op],[source]);return;}
 let cost=r.cost,amount=0;
 if(op==='supply'){amount=g.consumption.reduce((n,c)=>n+c.rate_per_day,0)*14;cost=Math.round(amount*0.006*10000)/10000;}
 if(usable(g)<cost){o.report(g,r.worker,`可用现金不足以预留本项${cost}金龙；未启动工作，也未扣款。`,[source]);return;}
 const t=o.task(g,ctx,'campaign_work',r.worker,{operation:op,source,amount,cost,reservation:'',...(op==='supply'?{supply_items:g.consumption.map(c=>({resource_id:c.resource_id,amount:c.rate_per_day*14}))}:{})});
 if(op==='records'){
  const previous=g.execution.tasks.filter(x=>x.kind==='campaign_work'&&x.params.operation==='records'&&x.status==='completed'&&x.params.audit_window).at(-1);
  const from=previous?.params.audit_window.to??Math.max(0,now(g)-28*DAY),to=now(g);
  t.params.audit_window={from,to,settlement_refs:g.settlements.filter(x=>x.target_id==='RES-CASH'&&x.at_minute>from&&x.at_minute<=to).map(x=>x.id)};
 }
 if(cost)t.params.reservation=o.reserve(g,ctx,t.order_ref,cost);
}
export function campaignDecision(g,m,choice,ctx,o,issue=null,executeProposal=null){
 if(issue&&commitCardDecision(g,m,issue,choice,ctx,o,planWork,executeProposal))return;
 const def=issue?campaignIssue(g,issue):weeklyDefinition(m.week);o.need(def&&def.choices.some(c=>c[0]===choice),'这不是本次呈报的办法。');
 const q=m.issues[def.id];o.need(q&&!q.decision_ref,'这项决定已经登记。');
 const before=g.orders.length;planWork(g,choice,ctx,o,m.id);
 q.choice=choice;q.status='decided';q.decision_ref=ctx.id;q.order_refs=g.orders.slice(before).map(x=>x.id);m.attended=true;
 g.campaign.decisions.push({id:m.id,operation:choice,at:now(g),source_ref:ctx.id,status:'decided'});
 // Replies are delivered when the accepted work starts, never asserted for a refused proposal.
 if(choice==='review')observe(g,audience(g,m.activity),operations.review.reply,m.id+':reply');
}
export function runCampaignWork(g,t,ctx,o){
 if(t.kind!=='campaign_work'||t.phase==='return')return false;
 const p=t.params,r=operations[p.operation],c=g.campaign;o.need(c&&r,'年度委托缺少对应版本。');
 if(t.phase==='start'){
  const responders=p.operation==='guard'?['P016','P020']:[r.worker];
  observe(g,responders,r.reply,t.order_ref);o.report(g,r.worker,r.reply,[t.order_ref],'U001',0);
  if(p.operation==='service'){c.standing=true;evidence(g,p.operation,t.order_ref,o);o.finish(g,t,'已建立常规饷款核验与支付委托；旧债和未交付采购不在其中。');return true;}
  t.phase='finish';t.next_at=now(g)+r.days*DAY;
  if(p.operation==='recruits'){o.need(watchHeadcount(g)+200<=6000,'这批二百人超过当前六千人的招募范围，须另行决定。');p.recruits_delivered=0;t.next_at=now(g)+4*DAY;}
  // Hold a real reserve batch during training, never allocate it to two jobs.
  if(p.operation==='training'){
   const f=g.forces.find(f=>f.id==='FORCE01');o.need(o.freeGroup(g,f,4)>=100,'PERSONNEL_UNAVAILABLE');
   const id=o.key(g,'ASN');g.assignments.push({id,order_ref:t.order_ref,force_ref:f.id,group_index:4,count:100,task_commander:'P020',location:'君临轮换训练',status:'active',start_at:now(g),end_at:t.next_at,return_at:0,authority_ref:'',acceptance_ref:t.order_ref});t.assignment_ref=id;
   p.preparation_left=14;p.training_days=0;t.next_at=now(g)+DAY;
  }
  return true;
 }
 if(t.phase!=='finish')return true;
 if(p.operation==='recruits'){
  // Existing in-flight saves retain their original single delivery date.
  const batch=p.recruits_delivered===undefined?200:50,delivered=p.recruits_delivered||0;
  o.need(watchHeadcount(g)+batch<=6000,'实际接收这批人会超过六千人的招募范围，余下招募停止待议。');
  o.spend(g,ctx,r.cost*batch/200,p.reservation,`招募与基本装备交付：本批${batch}人`,[t.order_ref]);
  const f=g.forces.find(f=>f.id==='FORCE01');f.strength.value+=batch;f.strength.as_of_minute=now(g);f.allocations[4].count+=batch;g.consumption.find(x=>x.id==='USE02').rate_per_day+=batch;
  p.recruits_delivered=delivered+batch;f.readiness='新兵分批实到，基本军械已交付；训练须另行完成。';
  militaryReport(g,o,`本次招募已有${p.recruits_delivered}人实到，目标二百。本批${batch}人已核对住处与荐保，配发基本军械，实付${r.cost*batch/200}金龙；自入营起另计饷粮。尚未完成训练，不能算作老兵。`,[t.order_ref]);
  if(p.recruits_delivered<200){t.next_at=t.started_at+[4,7,10,14][p.recruits_delivered/50]*DAY;return true;}
  if(p.reservation)o.release(g,p.reservation);evidence(g,'recruits',t.order_ref,o);o.finish(g,t,'本次二百人已经分批入营并领到基本军械。训练与长期供养继续按实际安排办理。');return true;
 }
 if(p.operation==='training'){
  if(p.preparation_left>0)p.preparation_left--;
  else {
   const reason=g.resources.find(r=>r.id==='RES-FOOD-WATCH').quantity.value<=0?'没有足够口粮':busy(g,'P020')||g.assignments.some(a=>a.id!==t.assignment_ref&&a.task_commander==='P020'&&!['returned','cancelled'].includes(a.status))?'教官另有职责':'';
   const control=o.control(g,t);
   if(!reason){
    p.training_days++;
    if(control.signals.includes('training-paused')){control.signals=control.signals.filter(x=>x!=='training-paused');control.reason='';militaryReport(g,o,'轮换训练恢复，先前停课的日子没有补记为出勤。',[t.order_ref]);}
    if(p.training_days===14)militaryReport(g,o,'这批一百人完成十四个有效训练日，已经过半；仍未完成全程训练。原城门与红堡岗位没有抽空。',[t.order_ref]);
   }else{
    control.reason=reason+'，今日不计有效训练日。';
    if(!control.signals.includes('training-paused')){control.signals.push('training-paused');militaryReport(g,o,control.reason+'此前出勤保留，人员仍在原轮换安排内。',[t.order_ref]);}
   }
  }
  if(p.preparation_left>0||p.training_days<28){t.next_at=now(g)+DAY;g.assignments.find(a=>a.id===t.assignment_ref).end_at=t.next_at;return true;}
 }
 if(p.cost)o.spend(g,ctx,p.cost,p.reservation,'已交付年度事务：'+r.label,[t.order_ref]);
 if(p.reservation)o.release(g,p.reservation);
 if(p.operation==='supply')for(const item of p.supply_items)o.change(g,ctx,item.resource_id,item.amount,'验收口粮实际入库',[t.order_ref]);
 if(p.operation==='records'){
  // Legacy in-flight orders get a bounded window, never a new global audit.
  p.audit_window??={from:Math.max(0,t.started_at-28*DAY),to:t.started_at,settlement_refs:g.settlements.filter(x=>x.target_id==='RES-CASH'&&x.at_minute>Math.max(0,t.started_at-28*DAY)&&x.at_minute<=t.started_at).map(x=>x.id)};
  const rows=g.settlements.filter(x=>p.audit_window.settlement_refs.includes(x.id)),ref=o.key(g,'ACCOUNT'),received=rows.filter(x=>x.delta>0&&(x.reason.includes('税款')||x.reason==='已付款合同扣缴税实收')).reduce((s,x)=>s+x.delta,0),paid=-rows.filter(x=>x.delta<0).reduce((s,x)=>s+x.delta,0);
  g.politics.accounts.push({id:ref,expected:received,received,held:0,holder:'P005',receipt_present:true,transfer_ref:'',transfer_received:0,source_refs:[t.order_ref]});
  const text=`本次核账止于第${Math.floor(p.audit_window.to/DAY)+1}日的受理时刻：这批凭据记有税款入库${received.toFixed(2)}金龙、现金支出${paid.toFixed(2)}金龙。借款另列，旧债缺项与未缴款没有据此核清；之后送来的凭据留待下次。这是对既有收付的核对，没有追回款。`;
  const msg=o.report(g,'ORG-TREASURY',text,[ref]);
  for(const id of ['P005',...(g.offices.some(x=>x.id==='OFF-ACTING'&&x.holder==='P003'&&x.status==='在任')?['P003']:[])])o.report(g,'ORG-TREASURY',text,[ref],id);
  g.politics.audits.push({id:o.key(g,'AUDIT'),account_ref:ref,project_ref:t.order_ref,result:'balanced',at:now(g),report_ref:msg,source_refs:[t.order_ref]});
 }
 if(p.operation==='treasury')authority(g,'approved_payment_review',ctx,o);
 if(p.operation==='intelligence')authority(g,'direct_report_review',ctx,o);
 if(p.operation==='crosscheck'){authority(g,'independent_port_crosscheck',ctx,o);o.report(g,'ORG-PORT','港口缴库副本已与王室信使的实际回执逐笔核对。缺项仍列为缺项，未据此推定贪污。',[t.order_ref],'U001',0);}
 if(p.operation==='alliance')o.report(g,'ORG-ENVOY','使者回执：河湾接受继续磋商兵粮与婚盟，要求战后承认其贡献、兑现议定费用。尚未交付军队，也未订立王室婚约。',[t.order_ref],'U001',0);
 if(p.operation==='bond'){
  // Authored small subscription and physical delivery share the original debt/receipt tables.
  const id=o.key(g,'ISSUE'),sub=o.key(g,'SUB'),decision=o.key(g,'DEC'),receipt=o.key(g,'PAYIN'),debt=o.key(g,'DEBT');
  const terms={amount:3000,rate_bps:50,period_minutes:28*DAY,maturity_minutes:140*DAY};
  g.execution.decisions.push({id:decision,actor:'ORG-MERCHANT',kind:'subscribe_bonds',target_ref:id,status:'accepted',source_refs:[t.order_ref],at:now(g),terms});
  g.politics.issues.push({id,organization_ref:'ORG-TREASURY',registrar:'P005',goal:5000,rate_bps:50,period_minutes:28*DAY,maturity_minutes:140*DAY,window_minutes:7*DAY,closes_at:now(g),status:'closed',paid:3000,fee:100,source_refs:[t.order_ref]});
  g.politics.subscriptions.push({id:sub,issue_ref:id,subscriber:'ORG-MERCHANT',amount:3000,paid:3000,decision_ref:decision});
  g.politics.receipts.push({id:receipt,payer:'ORG-MERCHANT',target_ref:id,amount:3000,at:now(g),source_refs:[t.order_ref],used_by:debt});
  g.politics.debts.push({id:debt,issue_ref:id,subscription_ref:sub,creditor:'ORG-MERCHANT',initial:3000,outstanding:3000,rate_bps:50,period_minutes:28*DAY,last_accrual:now(g),interest_numerator:'0',next_interest_at:now(g)+28*DAY,maturity_at:now(g)+140*DAY,principal_due_created:false,dues:[],source_refs:[receipt,decision]});
  o.change(g,ctx,'RES-CASH',3000,'债券实际缴款入库',[receipt]);
  const text='本期债券收款三千金龙已入库，发行费用一百金龙已付，净得二千九百金龙。发行目标五千，未认购的两千不构成欠款。每二十八日应付利息十五金龙，一百四十日后偿还本金三千；这笔借款没有增加税收。';
  for(const recipient of ['U001','P005',...(g.offices.some(x=>x.id==='OFF-ACTING'&&x.holder==='P003'&&x.status==='在任')?['P003']:[])])o.report(g,'ORG-TREASURY',text,[id,receipt,debt],recipient);
 }
 if(p.operation==='guard'){
  const existing=g.politics.guard_plans.find(x=>x.status==='completed');
  if(!existing){
   o.apply(g,{type:'create_organization',name:'王室近卫',responsibilities:['原红堡岗位的五十人，沿原供饷；其他军权不在交接内']},ctx);const org=g.administration.organizations.at(-1).entity_ref;
   o.apply(g,{type:'appoint_official',organization_ref:org,title:'近卫指挥',person:'P016'},ctx);
   o.apply(g,{type:'plan_guard_transfer',organization_ref:org,count:50,posts:'keep_same_posts'},ctx);const plan=g.politics.guard_plans.at(-1);
   for(const [actor,kind]of [['P016','guard_command'],['P020','permanent_transfer']])g.execution.decisions.push({id:o.key(g,'DEC'),actor,kind,target_ref:plan.id,status:'accepted',source_refs:[p.source,t.order_ref],at:now(g)});
   o.apply(g,{type:'grant_operation_authority',person:'P020',operation:'permanent_transfer',target_ref:plan.id,max_count:50,expires_at:now(g)+28*DAY},ctx);
   t.params.plan_ref=plan.id;t.params.cost=0;t.phase='handover';t.next_at=now(g)+60;return true;
  }
 }
 if(p.operation==='training'){const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='returned';a.return_at=now(g);g.forces.find(f=>f.id==='FORCE01').readiness='至少一百人完成基础轮换训练；其余人员沿实际记录，不自动成精锐。';militaryReport(g,o,'这一批一百人完成二十八个有效训练日，已归回轮值。只能确认这批人的基础队列与守备操练，不代表全军都已练成。',[t.order_ref]);}
 if(p.operation==='autonomy'){authority(g,'royal_appointments',ctx,o);/* Actual authority remains a world fact; Tywin's interpretation is reviewed separately. */}
 if(p.operation==='support'){/* Support is a lived event, not an automatic grant of trust. */authority(g,'retain_tyrion_duties',ctx,o);}
 if(p.operation==='marriage'&&g.commitments.some(x=>x.kind==='婚约'&&x.parties.includes('P012')&&!x.parties.includes('U001')&&x.status==='有效')){o.finish(g,t,'文书送达前新婚约已成立，原延期方案未能阻止订婚。');return true;}
 if(p.operation==='marriage'){applyMarriage(g,null,t.order_ref);c.marriage_protected=true;deliverScene(g,t.order_ref,'国王阻止了尚未成立的新婚约，珊莎收到正式通知。',['U001','P012','P003']);}
 if(p.operation==='dorne'){authority(g,'myrcella_diplomacy',ctx,o);}
 if(p.operation==='celebration'){c.ceremony='ROYAL_CELEBRATION';c.tyrell='bargaining';const promise=g.commitments.find(x=>x.id==='CAMP-ROYAL-WEDDING');if(promise){promise.status='已解除';promise.terms='国王拒绝婚盟，改办王室庆典；河湾要求重新协商。';}}
 if(p.operation==='rose')c.tyrell=campaignRank(g)!=='constrained'?'committed':'bargaining';
 if(p.operation==='qyburn'){addActor(g,'R007','科本',places.R09);c.qyburn=true;}
 evidence(g,p.operation,t.order_ref,o);o.finish(g,t,'委托已交付：'+r.label+'。未包含的权限、费用和后续工作仍须另行决定。');return true;
}
export function campaignHandover(g,t,ctx,o){
 if(t.kind!=='campaign_work'||t.phase!=='handover')return false;
 const p=g.politics.guard_plans.find(x=>x.id===t.params.plan_ref);
 if(p.status==='preparing'){o.apply(g,{type:'execute_guard_transfer',plan_ref:p.id},ctx);t.next_at=now(g)+240;return true;}
 if(p.status!=='completed'){t.next_at=now(g)+DAY;return true;}
 evidence(g,'guard',t.order_ref,o);o.finish(g,t,'五十人实际交接已完成；桑铎仍未因此退出白袍。');return true;
}
export function campaignView(g){
 const cardView=cardSceneView(g);if(cardView)return cardView;
 const c=g.campaign;if(!c)return null;
 const p=encounters.find(p=>p.id===c.scene);
 if(p){
  const decision=c.history.filter(h=>h.scene===p.id&&h.choice!=='continue').at(-1);
  if(p.replies&&c.scene_step===1)return {title:p.title,text:decision?.reply||p.replies[decision?.choice]||p.text,choices:[{id:'continue',label:'结束这次会面'}]};
  const cue=p.actor?characterSceneCue(g,p.actor):'';let text=(cue?cue+'\n':'')+p.text;
  if(p.id==='POLITICAL-VICTORY')text+='\n'+({important_political_capital:'你的军官已交来相互印证的回报。泰温翻过那几页，没有否认上面的执行记录。「这些职责可以谈，」他说，「以后的责任也要有人承担。」',recognized_contribution:'战报记下了你的贡献，也记下了它的范围。泰温准备承认这一部分，却没有因此交出其他任免权。',no_political_capital:'能核实的主要战功落在守城将领与援军名下。泰温说：「陛下可以提出意见。现在先让各处知道该听谁的命令。」'}[c.battle?.prestige||'no_political_capital']);
  if(p.id==='PRIVATE-SANSA-3'){
   const marriage=g.commitments.find(x=>x.kind==='婚约'&&x.parties.includes('P012')&&x.status==='有效');
   text+='\n'+(marriage?.parties.includes('P003')?'你已收到正式文书：珊莎与提利昂订婚，尚未举行婚礼。':c.marriage_protected?'阻止新婚配的文书已送达，她也收到通知。这项保护已经落实，而不是今天才提出的许诺。':marriage?.parties.includes('U001')?'目前仍有效的是她与你的婚约；高庭与家族的新提案还不是既成婚姻。':'现有记录中没有一份生效的新婚约。没人替她订婚，不等于她已获准离开君临。');
  }
  return {title:p.title,text,choices:p.choices.map(([id,label])=>({id,label}))};
 }
 if(c.scene==='finale')return {title:'盛典的早晨',text:'王室的请柬已经送出。过去一年的任命、盟约和争执，都将随你走进大厅。侍从在门外等候。',choices:[{id:'enter',label:'前往盛典'}]};
 if(c.scene==='battle-result')return {title:'钟声停下以后',text:c.battle.account||'战报已经登记。援军与守城者的功劳分别保留，未决事务仍待战后处理。',choices:[{id:'continue',label:'回到红堡，面对胜利者'}]};
 if(c.scene==='battle'){
  const b=c.battle,role={wall:'你留在城墙后方。传令兵沿阶梯跑上来，把湿透的纸递到你面前。',reserve:'你留在预备队的集合处。两个信使先后闯进来，一个要援兵，另一个说通路挤满了伤者。',palace:'你留在王室住区。城外的火光照进窗户，守门的军官把前线送来的请求念给你听。'};
  const texts=[
   '史坦尼斯的舰队已经进入黑水河。桅杆挤在暗色的河面上，城头的人只能分辨火把，分辨不出每条船上的旗。\n提利昂把手按在城防图上。\n「等开战以后，三道命令未必能送到同一个人手里。陛下先定好留在哪里；前线、预备队、王室住区，各有要守的东西。」\n军官报过轮值。还在训练、护送和其他差事上的人没有被再点一次名。'+((has(g,'defense')||reformCapability(g,'defense','FORCE01'))?'\n城门修缮的验收回执已经送到，修过的那段通路可以使用。':'\n城防官没有交来那段修缮的竣工回执。这一仗仍须依赖旧有城门与既定守备。'),
   (role[b?.role]||'传令兵带来了城门的消息。')+'\n河面忽然亮了。一团绿火沿水面展开，紧接着是迟来的巨响。有人高声欢呼，军官却还望着陆地方向。\n「敌人还在上岸！」\n报信的人扶住桌沿。「城门要人，伤兵也要路。两件事不能都把同一批人写进去。」'+(b?.readiness?`\n点名后，这次能用于国王所选任务的机动守兵有${b.readiness.count}人。${b.readiness.fed?'现有口粮足以支撑这一段战斗。':'口粮不足；他们仍能接令，但不能按补给齐备计算表现。'}${b.readiness.trained?'其中有已完成基础轮换训练的人员。':'没有足够的已完成轮训人员可用于这次任务。'}`:''),
   '天色暗下来以后，城外出现了新的旗帜。逃回来的士兵先说是另一支敌军，后一名信使却认出了兰尼斯特的狮子。\n河湾的骑兵投入战场，进攻城门的人开始回头。城里仍有火，仍有人在找失散的同伴。\n提利昂的书记抱来一叠被水浸过的纸。\n「陛下，名册要重新点。谁留下，谁出去，谁带人回来，都得有人作证。」\n胜利已经有了许多人争着宣告。现在需要写下的，是你实际下过的命令，以及命令交出去以后发生了什么。'
  ];
  const options=[[['wall','到城墙督战，保留代理与退路'],['reserve','留在预备队，协调回报与增援'],['palace','留守王室住区，将前线交给将领']],[['hold','维持城门，按已有预案增援'],['rescue','组织伤兵撤离，保住通路'],['abandon','放弃城门，撤回红堡']],[['record','先登记伤亡、功劳与实际执行者']]];
  return {title:'黑水河',text:texts[c.scene_step],choices:options[c.scene_step].map(([id,label])=>({id,label}))};
 }
 return null;
}
function entry(g){
 const c=g.campaign,sa=characterState(g,'P012').attitude,ta=characterState(g,'P060').attitude,ty=characterState(g,'P002').attitude,ti=characterState(g,'P003').attitude,rank=campaignRank(g),p=powerLevels(g),sansa=g.commitments.find(x=>x.parties.includes('P012')&&x.status==='有效'),rose=c.tyrell==='committed';
 return {power_levels:p,prestige:c.battle?.prestige||'no_political_capital',authority_scopes:Object.fromEntries(['protect','exchange','review','acquit','pardon','stop_duel','departure','alert_control'].map(k=>[k,false])),court_role_available:rank!=='constrained',jaime_offer_available:true,combat_request_planned:true,evidence_basis:'not_determined',prior_npc_constraints:{standard:[],limited:[],departure:[]},prior_night_lead:false,controlled_departure_proposal_planned:false,rescue_route_available:true,tywin_access_possible:true,culprit_route:rose?'VARYS':'ROSE',ceremony:c.ceremony,sansa_route:['trust','complex_affection'].includes(sa)?'stay_voluntarily':['extreme_fear','controlled'].includes(sa)?'escape_not_completed':'escaped',tommen_hook_qualified:ta==='close'&&c.qyburn,cast_plan:{P002:'已在君临',P003:'已在君临',P015:'婚礼后按本局行程到场',R001:'已在君临',R007:c.qyburn?'已任用并到场':'未任用'},flags:{tyrion_at_banquet:true,myrcella_present:person(g,'P061').location.includes('红堡'),sansa_present:person(g,'P012').location.includes('红堡'),tyrell_present:true,guard_handover:p.military!=='unformed',tommen_close:ta==='close',secondary_present:true,sansa_attitude:sa==='guarded'?'other':sa,shae_testimony:'absent',prior_rescue_blocked:false},tywin_attitude:ty,tyrion_attitude:ti,tyrell_attitude:c.tyrell,sansa_engagement:sansa?.parties.includes('P003')?'tyrion':sansa&&!sansa.parties.includes('U001')?'other':'none',source_refs:['CAMPAIGN-1',...['P002','P003','P012','P060'].map(id=>characterState(g,id).source),...c.completed.map(x=>x.source_ref),...(c.battle?[c.battle.source]:[])]};
}
export function campaignAllowed(g){const d=day(g);return d<14?[]:d<90?['records','treasury','bond','service','supply','intelligence','crosscheck']:d<270?['guard','recruits','training','supply','defense','service','intelligence','crosscheck','bond',...(d>=180?['alliance']:[])]:['support','autonomy','marriage','dorne','rose','qyburn','warning','supply','service','bond','celebration','crosscheck','intelligence'];}
export function applyCampaignAction(g,a,ctx,o){
 const c=g.campaign;o.need(c,'请从年度版本的新开局继续。');
 if(a.type==='campaign_wait'){
  o.exact(a,['mode']);o.need(!c.scene&&!ongoing(g),'先完成当前场景。');
  const m=annualMeeting(g),forced=g.opening.meetings.find(m=>specialCouncils[m.week]&&!m.missed&&!m.attended),nextWeek=(Math.floor(now(g)/10080)+1)*10080+180;
  const target=a.mode==='council'?(m&&m.scheduled>now(g)?m.scheduled:nextWeek):a.mode==='day'?now(g)+DAY:a.mode==='week'?now(g)+7*DAY:a.mode==='event'?Math.min(...[14,180,270,280,301,330,345,360].map(d=>d*DAY+(d===270?600:d===360?720:0)).filter(t=>t>now(g))):NaN;
  o.need(Number.isFinite(target),'没有更晚的预约。');o.advance(g,Math.min(target,now(g)+28*DAY),{...ctx,routineAuto:!!g.opening.household});return 'CAMPAIGN_WAITED';
 }
 if(a.type==='campaign_issue'){
  o.exact(a,['operation']);o.need((ctx.councilCommit||!ongoing(g))&&!c.scene&&day(g)>=14,'请先结束当前活动。');
  const allowed=campaignAllowed(g);
  o.need(allowed.includes(a.operation),'这个阶段尚未开放这项办法。');
  if(annualEdition(g)&&!ctx.councilCommit){queueCampaignOperation(g,a.operation,ctx.id);return 'CAMPAIGN_PROPOSAL_RECORDED';}
  planWork(g,a.operation,ctx,o,ctx.id);return 'CAMPAIGN_PROPOSAL_RECORDED';
 }
 if(a.type==='campaign_choose'){
  o.exact(a,['choice']);if(chooseCardScene(g,a.choice,ctx,o))return 'EVENT_CARD_ADVANCED';const v=campaignView(g);o.need(v?.choices.some(x=>x.id===a.choice),'这不是当前场景的选项。');
  if(c.scene==='finale')o.need(!pendingCharacters(g,actorEvidence).length,'CHARACTER_REVIEW_PENDING');
  c.history.push({scene:c.scene,step:c.scene_step,choice:a.choice,text:v.text,at:now(g)});
  if(c.scene==='finale'){g.finale={entry:entry(g),binding_branch:g.revision.branch_id,freeze:null,fixture_id:null,content:null,progress:null,records:[],ending:null};c.scene=null;return 'CAMPAIGN_READY_FINALE';}
  if(c.scene==='battle-result'){const escorted=!g.opening.household&&person(g,'P016')?.location===person(g,'U001').location;move(g,'U001',places.R01);if(escorted)move(g,'P016',places.R01);c.scene=null;c.scene_step=0;return 'CAMPAIGN_BATTLE_CLOSED';}
  if(c.scene==='battle'){
   c.battle??={role:null,tactic:null,result:null,prestige:'no_political_capital',source:ctx.id,losses:0};
   if(c.scene_step===0){c.battle.role=a.choice;
    const escorted=!g.opening.household&&person(g,'P016')?.location===person(g,'U001').location,location={wall:'君临·临河城墙',reserve:'君临·城门内预备集合处',palace:places.R01}[a.choice];move(g,'U001',location);if(escorted)move(g,'P016',location);
    const count=Math.min(200,Math.max(0,o.freeGroup(g,g.forces.find(f=>f.id==='FORCE01'),4)));
    const paid=!g.obligations.some(p=>(p.id==='PAY01'||p.id==='PAY10'||p.id.startsWith('CPAY-WATCH:'))&&p.status!=='已支付'&&p.due_minute+7*DAY<now(g));
    c.battle.readiness={count,trained:(has(g,'training')||reformCapability(g,'training','FORCE01')>=100)&&count>=100,fed:g.resources.find(r=>r.id==='RES-FOOD-WATCH').quantity.value>=watchHeadcount(g)/4,paid,equipped:count>0&&reformCapability(g,'equipment','FORCE01')>=count,defense:has(g,'defense')||reformCapability(g,'defense','FORCE01')};
   }
   if(c.scene_step===1)c.battle.tactic=a.choice;
   c.scene_step++;
   if(c.scene_step===3){
    const f=g.forces.find(f=>f.id==='FORCE01'),ready=c.battle.readiness||{count:Math.min(200,o.freeGroup(g,f,4)),trained:has(g,'training')||reformCapability(g,'training','FORCE01')>=100,fed:g.resources.find(r=>r.id==='RES-FOOD-WATCH').quantity.value>0,paid:false,defense:has(g,'defense')||reformCapability(g,'defense','FORCE01')},protectedWorks=ready.defense;
    const equipped=ready.equipped===true;
   const effective=ready.count>=100&&ready.trained&&ready.fed&&ready.paid&&(protectedWorks||(equipped&&c.battle.role==='reserve'));
    const losses=Math.min(o.freeGroup(g,f,4),ready.count,effective?40:100+(ready.fed?0:20));f.allocations[4].count-=losses;f.strength.value-=losses;f.strength.as_of_minute=now(g);g.consumption.find(c=>c.id==='USE02').rate_per_day-=losses;c.battle.losses=losses;
    c.battle.result=c.battle.tactic==='abandon'&&!protectedWorks?'city_lost':'held_with_relief';
    c.battle.prestige=c.battle.result==='city_lost'||c.battle.tactic==='abandon'?'no_political_capital':effective?'important_political_capital':ready.count>=50&&ready.fed&&(c.battle.tactic==='rescue'||protectedWorks)?'recognized_contribution':'no_political_capital';
    if(c.battle.result==='city_lost'){c.scene='defeat';deliverScene(g,'BLACKWATER','城门失守，红堡无法恢复城防。本局在这里结束，保留已发生的改革与人物记录。');return 'CAMPAIGN_DEFEAT';}
    const task={hold:'支援城门',rescue:'接应伤兵、维持撤离通路',abandon:'撤回红堡'}[c.battle.tactic];
    c.battle.account=`钟声渐渐停了。君临守住了，城外飘着狮子与玫瑰的旗，街上的人还在往门口送水。\n军官带着重新点过的名册来见你。「陛下，您在${{wall:'城墙后方督战',reserve:'预备队集合处协调',palace:'王室住区留守'}[c.battle.role]}时，交给我们的差事是${task}。出动${ready.count}人，确认损失${losses}人。别处的名册还没齐，我不敢一并报。」\n`+({important_political_capital:'他指着名册上的几行。「这些人是轮训过的，认得换班的号令。饷粮和战前准备都有回执，我们才把这段差事撑下来。」\n书记留下了签名与回报。明日再有人说国王只是等着援军来救，至少会有人能拿出另一份说法。',recognized_contribution:'「您交办的事，有人做到了，也有人能作证。」书记说。他把这一页夹进战报，却没有划去首相与援军的名字。',no_political_capital:'书记抄下命令，问起办成了多少。军官没有夸口。没有足够的人手、供给或交付回报，那几行字便不能写成一场大功。\n明日封赏时，带来援军的人不会忘记这一点。'}[c.battle.prestige])+(ready.paid?'':'\n军官临走前又停下。「旧饷还欠着，陛下。弟兄们也会问。」')+(has(g,'alliance')?'\n使者将河湾那封回信重新送到案头。战前答应继续谈的条件，现在轮到胜利者坐下来谈了。':'');
    const preparations=[['engine-repaired','补修的机件已经交付城防官'],['firebreak','公会外登记的防火隔带已经清理'],['river-scout','渡口观察队已归队，地形回报交给了当值军官'],['royal-shelter','留城王室成员的照料与护卫职责已有签收']].filter(([tag])=>g.execution.evidence.some(e=>e.category==='event:'+tag&&e.status==='realized'));
    if(preparations.length)c.battle.account+='\n军官另交来先前差事的回执：'+preparations.map(([,text])=>text).join('；')+'。这些实物与安排各按原用途使用，没有被重复记作新兵或第二份战功。';
    c.scene=null;for(const id of ['U001','P003'])o.report(g,'ORG-ENVOY',c.battle.account,['MQ14'],id,0);
    o.advance(g,now(g)+360,{...ctx,councilCommit:true});c.scene='battle-result';c.scene_step=0;
   }return 'CAMPAIGN_BATTLE_ADVANCED';
  }
  const p=encounters.find(p=>p.id===c.scene);o.need(p,'场景版本不匹配。');
  if(politicalScenes.includes(p)&&c.scene_step===0){
   const before=g.orders.length,startMessage=g.messages.length;
   planWork(g,a.choice,ctx,o,p.id);
   const reply=p.replies[a.choice]+(g.orders.length>before?'\n书记将国王的决定送出。文书已经发往经手人，回报仍要等实际办理。':a.choice==='review'?'':'\n'+(g.messages.slice(startMessage).find(m=>m.recipient==='U001')?.content||'本次没有另发新令。'));
   c.history.at(-1).reply=reply;deliverScene(g,p.id,`${v.text}\n乔弗里：${p.choices.find(x=>x[0]===a.choice)[1]}\n${reply}`,politicalCast(p));
   c.scene_step=1;return 'POLITICAL_REPLY_SHOWN';
  }
  if(p.replies&&c.scene_step===0){
   deliverScene(g,p.id,`${v.text}\n乔弗里：${p.choices.find(x=>x[0]===a.choice)[1]}\n${p.replies[a.choice]}`,['U001',p.actor]);
   c.scene_step=1;return 'PRIVATE_REPLY_SHOWN';
  }
  const chosen=p.replies?c.history.filter(h=>h.scene===p.id&&h.choice!=='continue').at(-1)?.choice:a.choice;
  if(!p.replies)deliverScene(g,p.id,`${p.text}\n乔弗里：${p.choices.find(x=>x[0]===a.choice)[1]}。`,['U001',p.actor]);c.private_done.push(p.id);
  // One invitation to cooperate is an experience, not proof of reliable allegiance.
  c.scene=null;c.scene_step=0;o.advance(g,now(g)+30,ctx);return 'PRIVATE_SCENE_ENDED';
 }
 o.need(false,'未知年度操作。');
}
export function campaignErrors(g){
 const c=g.campaign;if(c===undefined)return [];
 if(!c||typeof c!=='object'||Array.isArray(c))return ['campaign invalid'];
 const errors=[...eventWorkErrors(g),...eventCardErrors(g)],keys=['version','catalog_version','events','completed','decisions','scene','scene_step','history','private_done','schedule_stamp','standing','periods','battle','tywin','tyrion','tyrell','ceremony','north','sansa','tommen','marriage_protected','qyburn'];
 if(Object.keys(c).sort().join()!==keys.sort().join())errors.push('campaign fields');
 if(c.version!==1||c.catalog_version!==campaignCatalog.version)errors.push('campaign version');
 for(const k of ['events','completed','decisions','history','private_done','periods'])if(!Array.isArray(c[k]))errors.push('campaign '+k);
 if(errors.length)return errors;
 if(c.events.some(x=>typeof x!=='string')||new Set(c.events).size!==c.events.length||new Set(c.private_done).size!==c.private_done.length)errors.push('campaign duplicate trigger');
 const time=v=>Number.isSafeInteger(v)&&v>=0&&v<=now(g),reference=v=>typeof v==='string'&&g.orders.some(o=>o.id===v);
 if(c.completed.some(x=>!x||!operations[x.operation]||!time(x.at)||!reference(x.source_ref)))errors.push('campaign unproven completion');
 if(c.decisions.some(x=>!x||!operations[x.operation]||!time(x.at)||!['decided','missed'].includes(x.status)||!g.opening.meetings.some(m=>m.id===x.id)))errors.push('campaign decision');
 if(c.history.some(x=>!x||!time(x.at)||typeof x.text!=='string'||typeof x.choice!=='string'))errors.push('campaign history');
 if(c.periods.some(p=>!p||!Number.isInteger(p.period)||p.period<1||p.at!==p.period*28*DAY||!time(p.at)||typeof p.clear!=='boolean'||typeof p.source_ref!=='string')||new Set(c.periods.map(p=>p.period)).size!==c.periods.length)errors.push('campaign periods');
 if(![null,'battle','battle-result','finale','defeat',...encounters.map(p=>p.id),...eventCards.filter(c=>c.route!=='council').map(c=>c.id)].includes(c.scene)||!Number.isInteger(c.scene_step)||c.scene_step<0||c.scene_step>3)errors.push('campaign scene');
 for(const [key,values]of Object.entries({tywin:['overbearing','bargaining'],tyrion:['cautious','trusted'],tyrell:['bargaining','committed'],ceremony:['MARGAERY_WEDDING','ROYAL_CELEBRATION'],north:['pending','north_alive','red_wedding'],sansa:['other','trust','complex_affection','extreme_fear','controlled'],tommen:['cautious','close']}))if(!values.includes(c[key]))errors.push('campaign '+key);
 for(const k of ['standing','marriage_protected','qyburn'])if(typeof c[k]!=='boolean')errors.push('campaign '+k);
 if(c.battle&&(!Number.isSafeInteger(c.battle.losses)||c.battle.losses<0||![null,'held_with_relief','city_lost'].includes(c.battle.result)||![null,'wall','reserve','palace'].includes(c.battle.role)||![null,'hold','rescue','abandon'].includes(c.battle.tactic)))errors.push('campaign battle');
 if(c.battle?.readiness){const b=c.battle.readiness;if(!Number.isInteger(b.count)||b.count<0||b.count>200||['trained','fed','paid','defense'].some(k=>typeof b[k]!=='boolean'))errors.push('campaign battle readiness');}
 for(const t of g.execution.tasks.filter(t=>t.kind==='campaign_work')){
  if(!operations[t.params.operation])errors.push('campaign unsupported work');
  const delivered=t.params.recruits_delivered;
  if(delivered!==undefined&&(t.params.operation!=='recruits'||!Number.isInteger(delivered)||delivered<0||delivered>200||delivered%50!==0||Math.abs(g.settlements.filter(s=>s.target_id==='RES-CASH'&&s.delta<0&&s.evidence_refs.includes(t.order_ref)).reduce((n,s)=>n-s.delta,0)-delivered*0.8)>0.0001))errors.push('campaign recruit delivery');
  const window=t.params.audit_window;
  if(window&&(t.params.operation!=='records'||window.from>window.to||window.to>now(g)||new Set(window.settlement_refs).size!==window.settlement_refs.length||window.settlement_refs.some(id=>!g.settlements.some(s=>s.id===id&&s.target_id==='RES-CASH'&&s.at_minute>window.from&&s.at_minute<=window.to))))errors.push('campaign audit window');
  if(t.params.operation==='supply'&&(!Array.isArray(t.params.supply_items)||t.params.supply_items.some(x=>!g.consumption.some(c=>c.resource_id===x.resource_id))||Math.abs(t.params.supply_items.reduce((n,x)=>n+x.amount,0)*0.006-t.params.cost)>0.0001))errors.push('campaign supply quote');
 }
 return errors;
}
