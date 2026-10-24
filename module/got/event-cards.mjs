const observe=(g,ids,...args)=>originalObserve(g,ids.includes('U001')?physicalAudience(g,ids):ids,...args);
import {physicalAudience,synchronizeGuardPresence,guardPrivacy} from './household-guards.mjs';
import {conditionsMet,issueEventWork,eventFact} from './event-work.mjs';
import {profiles} from './dialogue-core.mjs';
// Annual authored cards share the existing campaign history, council and task queue.
// No separate calendar, task store, relationship score or model caller.
import {eventCardData} from './event-cards-data.mjs';
import {places} from './opening-content.mjs';
import {observe as originalObserve,audience} from './dialogue-core.mjs';
import {characterSceneCue,characterState} from './character-state.mjs';
import {operations} from './campaign-content.mjs';
import {placeRegions,travelMinutes} from './navigation-data.mjs';
const now=g=>g.clock.elapsed_minutes, actor=(g,id)=>g.actors.find(a=>a.id===id);
export const eventCards=eventCardData.cards.flatMap(c=>[c,...(c.segments||[]).map(s=>({...c,segments:undefined,...s,parent:c.id}))]).filter(c=>c.enabled!==false);
const card=id=>eventCards.find(c=>c.id===id), history=g=>g.campaign?.history||[];
const currentCard=g=>history(g).findLast(h=>h.scene===g.campaign?.scene&&h.choice==='enter')?.card_snapshot||card(g.campaign?.scene);
// Resolve only authored performance fields, then freeze them with the scene or agenda.
// A textual variant cannot change the action contract, audience or paid work.
export function resolvedCard(g,c){
 const variant=c.variants?.find(v=>conditionsMet(g,v.when));
 return {...c,...(variant?.text?{open:variant.text}:{}),
  replies:{...c.replies,...variant?.replies},
  visible_staging:variant?.visible_staging||(variant?.text?variant.text:c.visible_staging),
  rp_cue:variant?.rp_cue||c.rp_cue,variants:[]};
}
const log=(g,scene,choice,text,extra={})=>{const row={scene,choice,text,step:g.campaign.scene_step,at:now(g),...extra};g.campaign.history.push(row);return row;};
const active=g=>g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
const guarded=g=>g.politics.guard_plans.some(p=>p.status==='completed')||g.campaign.completed.some(p=>p.operation==='guard');
const received=(g,id)=>g.messages.some(m=>m.id===id&&m.recipient==='U001'&&m.status==='已收到');
const passage=g=>{const n=g.opening.navigation,t=g.execution.tasks.find(t=>t.id===n.search);return {task:t,known:!!n.tunnel&&received(g,n.tunnel.report)};};
const queued=g=>history(g).filter(h=>h.choice==='queued'&&!history(g).some(x=>x.choice==='agenda-resolved'&&x.queue_id===h.queue_id));
const supplyTasks=g=>g.execution.tasks.filter(t=>t.kind==='campaign_work'&&t.params.operation==='supply'&&['sent','accepted','executing','blocked'].includes(t.status));
const free=g=>g.resources.find(r=>r.id==='RES-CASH').quantity.value-g.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)).reduce((n,r)=>n+r.amount,0);
export function cardDialogue(g){return !!card(g.campaign?.scene)&&g.campaign.scene_step===2&&!!active(g);}
export function eventProposal(g,p){return !!p&&history(g).some(h=>h.choice==='llm'&&h.activity===g.dialogue.turns.find(t=>t.id===p.turn_ref)?.activity);}
export function proposalQueued(g,id){return queued(g).some(h=>h.proposal_ref===id||h.proposal_refs?.includes(id));}
export function queueCardProposal(g,p,source){
 if(proposalQueued(g,p.id))return;
 const turn=g.dialogue.turns.find(t=>t.id===p.turn_ref),origin=history(g).find(h=>h.choice==='llm'&&h.activity===turn?.activity);
 if(!origin)return;
 const all=g.dialogue.proposals.filter(x=>x.turn_ref===p.turn_ref),group=p.joint_group?all.filter(x=>x.joint_group===p.joint_group):[p];
 const quotes=group.map(x=>turn.post.candidates[all.indexOf(x)].quote);
 log(g,origin.scene,'queued',quotes.join('；'),{queue_id:'CARD-PENDING-'+group[0].id,proposal_ref:group[0].id,proposal_refs:group.map(x=>x.id),source_ref:source,kind:'proposal'});
}
function queueIssue(g,c,kind,text,source){
 if(queued(g).some(h=>h.scene===c.id&&h.kind===kind))return;
 log(g,c.id,'queued',text,{queue_id:'CARD-PENDING-'+source,kind,source_ref:source});
}
export function attachCardAgenda(g,m){
 if(!g.campaign||(!g.opening.finished&&m.week===1))return;
 const replacement=eventCards.find(c=>!c.parent&&c.route==='council'&&c.week===m.week);
 // Existing in-flight sessions keep their saved agenda. New sessions collect actual reports.
 for(const c of eventCards.filter(c=>c.enabled&&c.route!=='scene'&&(m.type!=='emergency'||m.issues[c.id])&&(c.week===m.week||history(g).some(h=>h.scene===c.id&&h.choice==='queued-card'))&&conditionsMet(g,c.requires)&&!history(g).some(h=>h.scene===c.id&&h.choice==='council-decision'))){
  const delivered=g.messages.some(x=>x.recipient==='U001'&&x.status==='已收到'&&x.event_refs?.includes(c.id));
  if(delivered||history(g).some(h=>h.scene===c.id&&h.choice==='queued-card'))m.issues[c.id]??={status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]};
 }
 if(replacement&&m.issues[replacement.id]&&m.issues['annual-'+m.week])delete m.issues['annual-'+m.week];
 for(const h of queued(g))if(h.kind!=='proposal'||g.dialogue.proposals.some(p=>p.id===h.proposal_ref&&p.status==='pending'))m.issues[h.queue_id]??={status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]};
 for(const h of history(g).filter(h=>h.choice==='queued-operation'&&!history(g).some(x=>x.scene===h.queue_id&&x.choice==='council-decision')))m.issues[h.queue_id]??={status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]};
}
export function queueCampaignOperation(g,operation,source){
 if(history(g).some(h=>h.choice==='queued-operation'&&h.operation===operation&&!history(g).some(x=>x.scene===h.queue_id&&x.choice==='council-decision')))return;
 log(g,'ANNUAL-REQUEST','queued-operation',operations[operation].label,{operation,queue_id:'REQUEST-'+source,source_ref:source});
}
export function eventCardIssue(g,id){
 const snapshot=g.opening?.meetings.find(m=>m.status==='in_progress')?.session?.agenda?.find(q=>q.origin===id)?.definition;
 const request=history(g).find(h=>h.queue_id===id&&h.choice==='queued-operation');
 const op=request&&operations[request.operation];
 const c=snapshot||(card(id)?resolvedCard(g,card(id)):null)||(op?{id,title:op.label,question:op.label,open:op.reply,route:'council',implementation:'integrated',presenters:['P003','P005','P018'],choices:[['execute',op.label],['keep','保留原安排，本次不发新令']],bindings:{execute:{kind:'campaign',operation:request.operation},keep:{kind:'record'}},replies:{execute:op.reply,keep:'书记收起这项提案，原事务照常办理。'}}:null);
 if(c&&c.route!=='scene'){
  let choices=c.choices.filter(([id])=>conditionsMet(g,c.bindings?.[id]?.requires)).map(([id,label])=>[id,snapshot?label:optionLabel(g,c,id,label)]);
  if(id==='EXP-W15-A'&&(!guarded(g)||g.opening.navigation.search||g.opening.navigation.tunnel))choices=choices.filter(x=>x[0]!=='inspect');
  const list=supplyTasks(g),execution_basis=id==='EXP-W25-A'?list.length===1?{task:list[0].id,items:list[0].params.supply_items,cost:list[0].params.cost}:list.length?{multiple:true}:{task:null,items:g.consumption.map(c=>({resource_id:c.resource_id,amount:c.rate_per_day*14}))}:null;
  return {...c,choices,fixed:true,execution_basis};
 }
 const q=history(g).find(h=>h.choice==='queued'&&h.queue_id===id);if(!q)return null;
 const p=g.dialogue.proposals.find(p=>p.id===q.proposal_ref);
 return {id,title:q.kind==='repair'?'旧通道的补修请求':q.kind==='food-review'?'重新核对宫廷与军营份额':'私人会面转来的提案',question:q.text,category:'行政',presenters:['P018','P005'],fixed:true,
  choices:[...(p&&p.status==='pending'&&!(q.proposal_refs||[p.id]).some(id=>g.dialogue.proposals.find(x=>x.id===id)?.conditions.length)?[['execute','按这项提案交办；仍须满足原有权限、资源与人物答复。']]:[]),['keep','保留原安排，不发新令。']]};
}
export function eventCardReport(g,id,who=[]){
 const d=eventCardIssue(g,id);if(!d)return null;
 if(!card(id))return '书记展开国王交来的提案。「'+d.question+'」'+(queued(g).find(h=>h.queue_id===id)?.kind==='repair'?'工料尚未报价。本次只保留请求，未经核实不安排施工。':'');
 let text=d.open;
 if(d.implementation!=='prototype')return sceneText(g,d);
 if(!who.includes('P003'))text=text.replace('提利昂','持有订货簿的书记');
 if(!who.includes('P018'))text=text.replace('派席尔','持有草图的书记');
 if(id==='EXP-W15-A'){
  const p=passage(g);
  text+='\n'+(p.known?'核查的正式回报已经送达；本次不再重复交办，也不向全场展开秘密出口。':p.task&&!['cancelled','failed'].includes(p.task.status)?'原核查任务尚在办理或等候回报，本次沿用原委托。':guarded(g)?'局部守卫的交接已经完成，可以由维拉尔安排核查。':'局部守卫交接尚未完成。书记将待交接的名册压在草图上，先等原方案落实。');
 }else{
  const tasks=supplyTasks(g);
  text+='\n'+(tasks.length===1?`本次只核对订货 ${tasks[0].order_ref}，尚未交货，现有报价 ${tasks[0].params.cost} 金龙。没有凭据证明它被重复分配；今天谈的是要不要改分这批。`:tasks.length>1?'现有多笔未交货订货，先维持各自用途；要改其中一批，须在讨论中明确是哪一笔。':'没有可供改分的未交货订单。今天谈下一批十四天口粮，按现有人数报价，车到验收以后才入库。');
 }
 return text;
}
export function eventCardProposals(g,m,q){
 const d=eventCardIssue(g,q.origin);if(!d)return null;
 // Once the player has changed the topic or proposed another approach, continue
 // through the existing discussion pipeline instead of restoring canned offers.
 if(m.session.entries.some(e=>e.issue===q.id&&['topic','player'].includes(e.kind)))return null;
 const who=audience(g,m.activity),speaker=d.presenters.find(id=>who.includes(id))||'clerk';
 return d.choices.map(([choice,summary])=>({choice,summary,quote:summary,speaker:'npc',actor:speaker,owner:q.origin==='EXP-W15-A'&&choice==='inspect'?'P048':null,conditions:[],status:'active',turn:null,authored:true}));
}
export function commitCardDecision(g,m,id,choice,ctx,o,planWork,executeProposal){
 const d=eventCardIssue(g,id);if(!d)return false;
 o.need(d.choices.some(x=>x[0]===choice),'原条件已经改变，请重新核对本项办法。');
 const q=m.issues[id];o.need(q&&!q.decision_ref,'这项裁决已经登记。');const before=g.orders.length;
 let reply='';
 if(d.implementation==='integrated'){ reply=executeAuthored(g,d,choice,ctx,o,planWork); }
 if(id==='EXP-W15-A'&&choice==='inspect')o.apply(g,{type:'nav_inspect_tunnel',source:'guard'},ctx);
 if(id==='EXP-W25-A'&&choice!=='review'){
  const basis=m.session.agenda.find(q=>q.id===id)?.execution_basis;
  o.need(basis&&JSON.stringify(basis)===JSON.stringify(d.execution_basis),'呈报的订货或人数已在会议期间变化，请重新核对这一题，不另造一批订单。');
  const list=supplyTasks(g);o.need(list.length<=1,'现在有多笔订货，请明确改分哪一笔。');
  let t=list[0];
  if(!t){
   const cost=Math.round(g.consumption.reduce((n,c)=>n+c.rate_per_day,0)*14*0.006*10000)/10000;
   o.need(free(g)>=cost,'可用现金不足以预留本批 '+cost+' 金龙；请缩小方案或维持原安排。');
   planWork(g,'supply',ctx,o,id);t=supplyTasks(g)[0];o.need(t,'本批订货未能成立。');
  }
  const previous=history(g).findLast(h=>h.choice==='allocation'&&h.task_ref===t.id);
  const original=previous?.original||structuredClone(t.params.supply_items);
  const items=structuredClone(original),house=items.find(x=>x.resource_id==='RES-FOOD-RK'),watch=items.find(x=>x.resource_id==='RES-FOOD-WATCH');
  o.need(house&&watch,'这笔订单不是同时供给宫廷和守备的口粮。');
  if(choice==='military'){const transfer=house.amount/2;house.amount-=transfer;watch.amount+=transfer;}
  t.params.supply_items=items;
  log(g,id,'allocation',d.choices.find(c=>c[0]===choice)[1],{task_ref:t.id,order_ref:t.order_ref,decision:choice,original,meeting:m.id,source_ref:ctx.id});
  if(!q.order_refs.includes(t.order_ref))q.order_refs.push(t.order_ref);
 }
 const pending=queued(g).find(h=>h.queue_id===id);
 if(pending){
  const p=g.dialogue.proposals.find(p=>p.id===pending.proposal_ref);
  if(choice==='execute')executeProposal(p.id);
  else for(const id of pending.proposal_refs||[p?.id]){const item=g.dialogue.proposals.find(x=>x.id===id);if(item?.status==='pending')item.status='cancelled';}
  log(g,pending.scene,'agenda-resolved',d.choices.find(c=>c[0]===choice)[1],{queue_id:id,meeting:m.id,source_ref:ctx.id});
 }
 q.choice=choice;q.status='decided';q.decision_ref=ctx.id;q.order_refs=[...new Set([...q.order_refs,...g.orders.slice(before).map(x=>x.id)])];
 log(g,id,'council-decision',d.choices.find(c=>c[0]===choice)[1],{decision:choice,meeting:m.id,source_ref:ctx.id,reply});
 return true;
}
const eligible=(g,c)=>{
 const day=Math.floor(now(g)/1440),hour=((now(g)+360)%1440)/60,p=actor(g,c.actor);
 return c.route!=='council'&&conditionsMet(g,c.requires)&&day>=c.days[0]&&day<=c.days[1]&&hour>=c.hours[0]&&hour<c.hours[1]&&!g.campaign.private_done.includes(c.id)&&p?.life==='存活'&&c.places.some(k=>places[k]===actor(g,'U001').location&&places[k]===p.location)&&[c.actor,...(c.companions||[])].every(id=>actor(g,id)?.life==='存活'&&actor(g,id).location===p.location&&!g.execution.tasks.some(t=>t.actor_ref===id&&t.status==='executing')&&!g.activities.some(a=>a.status==='active'&&a.participants.includes(id)));
};
export function eventCardNext(g,next){
 for(const c of eventCards.filter(c=>c.route!=='council'&&!g.campaign.private_done.includes(c.id)))
  for(let day=c.days[0];day<=c.days[1];day++)for(const hour of c.hours){const at=day*1440+hour*60-360;if(at>now(g))next=Math.min(next,at);}
 return next;
}
export function sceneText(g,c){
 if(c.implementation!=='prototype'){
  const alternate=c.variants?.find(v=>conditionsMet(g,v.when));
  return (alternate?.text||c.open)+(c.context_reports?'\n'+g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到'&&m.content.includes(c.context_reports)).slice(-2).map(m=>m.content).join('\n'):'');
 }
 if(c.id==='EXP-W01-B')return c.open+(g.opening.visits.some(v=>v.scene==='lunch')?'\n前次同桌用餐已经过去。这是侍女今天又一次送回来的饭菜。':'');
 if(c.id==='EXP-W15-C'){
  const p=passage(g);return p.known?c.found:c.open+'\n'+(p.task&&!['cancelled','failed'].includes(p.task.status)?'原核查已有委托，尚无送到国王手中的可通行回报。守卫只说起已见到的墙面渗水，等负责人把里面查明。':'还没有已获批准的通道核查。旧门只是草图上的猜测，工匠没有拆墙。');
 }
 const allocation=history(g).findLast(h=>h.scene==='EXP-W25-A'&&h.choice==='allocation'),t=g.execution.tasks.find(t=>t.id===allocation?.task_ref),order=g.orders.find(x=>x.id===t?.order_ref);
 const done=t?.status==='completed'&&received(g,order?.report_message_id),reduced=done&&allocation.decision==='military';
 const food=g.resources.find(r=>r.id==='RES-FOOD-RK').quantity.value;
 let text=c.open+'\n'+(reduced?'军营优先的那批粮已经验收入库，管事也收到了改分单。今晚仍有烤鱼、燕麦面包和一小碟黄油，宴饮的额外菜色撤了下来。':food>0?'厨房仍按已经领到的份额摆菜：奶油栗子汤、脆皮面包、蜜汁肉。侍女把温热的银盘转到瑟曦面前。':'厨房送来的菜比往常少，管事只敢保证已经领到手的部分。今晚的欠缺不能拿一张未交货的订单填上。');
 if(allocation&&!done)text+='\n那份新分配尚没有已收到的交货回执，今晚的饭菜依旧来自原有供应。';
 const room=characterState(g,'P001').attitude==='negotiated_space';
 return text+'\n'+characterSceneCue(g,'P001')+'\n'+(reduced?room?'瑟曦让侍女换了只更体面的银盘。「省下来的东西真到了士兵嘴里，才算有用。」她切下一块热鱼肉，推到你面前。':'瑟曦用叉尖拨开鱼皮。「这就是你给客人留的体面？」':'瑟曦看着你。「这几天，你倒很忙。饭还记得按时吃吗？」');
}
export function settleEventCards(g,ctx,o){
 if(g.opening?.household&&(now(g)+360)%1440>=120&&(now(g)+360)%1440<360)return;
 if(!g.campaign||!g.opening.finished||g.campaign.scene||active(g)||g.opening.travel||g.opening.navigation.view!=='room'||g.opening.navigation.sleep)return;
 const c=globalThis.specialEventCore.select(eventCards,{completed:g.campaign.private_done,current:g.campaign.scene,eligible:c=>c.trigger!=='npc'&&eligible(g,c)&&o.actorFreeAt(g,c.actor)<=now(g)});if(!c)return;
 enterCard(g,c,ctx,o);
}
export function startContactCard(g,id,ctx,o){
 if(!g.campaign||!g.opening?.finished||g.campaign.scene||active(g)||g.opening.navigation.view!=='room')return false;
 const c=globalThis.specialEventCore.select(eventCards,{completed:g.campaign.private_done,current:g.campaign.scene,eligible:c=>c.trigger==='npc'&&c.actor===id&&eligible(g,c)&&o.actorFreeAt(g,id)<=now(g)});if(!c)return false;
 enterCard(g,c,ctx,o);return true;
}
function enterCard(g,c,ctx,o){
 c=resolvedCard(g,c);const privacy=guardPrivacy(g,c.guard_privacy);if(privacy){g.opening.navigation.notice=privacy;return false;}
 g.campaign.scene=c.id;g.campaign.scene_step=c.beats?.length?10:0;
 const text=sceneText(g,c);log(g,c.id,'enter',text,{source_ref:ctx.id,card_snapshot:structuredClone(c)});
 for(const row of c.entry_facts||[])if(conditionsMet(g,row.when)&&!eventFact(g,row.fact))g.execution.evidence.push({id:o.key(g,'EV'),category:'event:'+row.fact,status:'realized',at:now(g),source_ref:ctx.id,stage_ref:c.id});
 // W01 opens outside the room: Sansa has not heard the maid's private report.
 observe(g,c.id==='EXP-W01-B'?['U001']:['U001',c.actor,...(c.companions||[])],text,c.id+':entry:'+ctx.id);
}
export function cardSceneView(g){
 const c=currentCard(g);if(!c||c.route==='council')return null;
 const entry=history(g).findLast(h=>h.scene===c.id&&h.choice==='enter');
 if(g.campaign.scene_step>=10)return {title:c.title,text:c.beats[g.campaign.scene_step-10],choices:[{id:'read',label:'继续'}]};
 if(g.campaign.scene_step===1)return {title:c.title,text:history(g).findLast(h=>h.scene===c.id&&h.reply)?.reply||'',choices:[{id:'continue',label:'结束这次相处'}]};
 if(g.campaign.scene_step===2)return {title:c.title,text:'眼前的话题还没有结束。你可以继续说，也可以收束这次交谈。',dialogue:true,choices:[{id:'return',label:'结束交谈，将正式提案留给御前会议'}]};
 const decided=history(g).findLast(h=>h.scene===c.id&&h.choice==='council-decision');
 return {title:c.title,text:(entry?.text||sceneText(g,c))+(decided?'\n先前御前会议已经裁定：'+decided.text:''),choices:[...(decided?[{id:'status',label:'听取原委托进展，不再重复发令'}]:c.choices.filter(([id])=>conditionsMet(g,c.bindings?.[id]?.requires)).map(([id,label])=>({id,label:optionLabel(g,c,id,label)}))),...(c.presentation==='dialogue'&&profiles[c.actor]?[{id:'llm',label:'亲自开口，与'+profiles[c.actor].name+'谈谈'}]:[])]};
}
export function chooseCardScene(g,choice,ctx,o){
 const c=currentCard(g);if(!c||c.route==='council')return false;
 const v=cardSceneView(g);o.need(v.choices.some(x=>x.id===choice),'这不是当前场景的选项。');
 if(choice==='read'){log(g,c.id,'reading',v.text,{source_ref:ctx.id});observe(g,['U001',c.actor,...(c.companions||[])],v.text,c.id+':reading:'+ctx.id);g.campaign.scene_step++;if(g.campaign.scene_step-10>=c.beats.length)g.campaign.scene_step=0;return true;}
 if(choice==='status'){
  const reports=g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到'&&m.fact_refs.some(id=>g.orders.some(o=>o.id===id&&g.execution.tasks.some(t=>t.order_ref===id&&t.params.source===c.id))));
  log(g,c.id,'status','听取原事务回报',{reply:reports.length?reports.slice(-2).map(m=>m.content).join('\n'):'尚无新的办理回报。原裁决已登记，今天不再发一遍命令。',source_ref:ctx.id});g.campaign.scene_step=1;return true;
 }
 if(choice==='llm'){
  o.need(!g.opening.household||(now(g)+360)%1440<120||(now(g)+360)%1440>=360||c.allow_late===true,'夜已深，请收束这次相处。');
  o.need(actor(g,c.actor)?.location===actor(g,'U001').location&&o.actorFreeAt(g,c.actor)<=now(g),'对方此刻不在这里或另有职责。');
  const id=o.key(g,'ACT'),participants=['U001',c.actor,...(c.companions||[]).filter(id=>actor(g,id)?.location===actor(g,'U001').location&&o.actorFreeAt(g,id)<=now(g))];
  g.activities.push({id,kind:'short_visit',participants,location:actor(g,'U001').location,nodes:[15,15],node:0,remaining:15,status:'active',started_at:now(g),ended_at:null});
  for(const p of participants)g.dialogue.presence.push({activity_ref:id,actor:p,present:true,source_ref:ctx.id,at:now(g)});
  log(g,c.id,'llm','国王与'+c.title+'中的当事人当面交谈。',{activity:id,source_ref:ctx.id});
  synchronizeGuardPresence(g,ctx.id);observe(g,physicalAudience(g,participants),c.id==='EXP-W01-B'?'国王走进相邻的会客间。珊莎起身，把手指攥在裙褶里。桌旁放着未吃完的南瓜甜汤和排骨。':v.text,c.id+':talk:'+ctx.id);
  g.campaign.scene_step=2;return true;
 }
 if(choice==='continue'||choice==='return'){
  const a=active(g);if(a){
   for(const p of g.dialogue.proposals.filter(p=>p.status==='pending'&&g.dialogue.turns.some(t=>t.id===p.turn_ref&&t.activity===a.id)))queueCardProposal(g,p,ctx.id);
   a.status='ended';a.ended_at=now(g);for(const p of g.dialogue.presence.filter(p=>p.activity_ref===a.id))p.present=false;
  }
  log(g,c.id,'complete',choice==='return'?'交谈已收束；没有额外补写人物答应或态度软化。':'固定处置已经记录。',{source_ref:ctx.id});
  g.campaign.private_done.push(c.id);g.campaign.scene=null;g.campaign.scene_step=0;if(c.duration)o.advance(g,now(g)+c.duration,ctx);return true;
 }
 let reply=c.replies?.[choice]||'';
 if(c.implementation!=='prototype'){
  const b=c.bindings[choice];
  if(c.route==='linked'&&c.agenda_choices?.includes(choice)){
   log(g,c.id,'queued-card',c.choices.find(x=>x[0]===choice)[1],{option:choice,source_ref:ctx.id});
   reply='呈报人把国王提出的办法记入待议文书，交下次御前会议一并裁定。原来已获授权的工作继续办理。';
  }else reply=executeAuthored(g,c,choice,ctx,o,null);
 }
 if(c.id==='EXP-W01-B'){
  if(choice==='father'){
   const known=g.messages.filter(x=>x.recipient==='U001'&&x.status==='已收到'&&/遗体|遗骨|首级|收殓/.test(x.content)).slice(-3).map(x=>x.content);
   reply='珊莎站在门边，眼睑红肿。「陛下……父亲的遗骨会送到哪里？」\n'+(known.length?'国王告诉她手头已有的呈报：\n'+known.join('\n'):'国王手头没有新的处理回报。她等着听一个确定的答复，而不是已经办完的保证。');
   observe(g,['U001','P012'],reply,c.id+':father:'+ctx.id);
  }
  if(choice==='meal'){
   const at=now(g)+(18*60-(now(g)+360)%1440+1440)%1440;
   g.opening.appointments.push({actor:'P012',place:'R05',depart:at-15,arrive:at,status:'scheduled',source:c.id});
   observe(g,['P012'],'国王经侍女传话，请她今晚十八点到王室餐室用餐。',c.id+':invitation:'+ctx.id);
  }
  if(choice==='food')observe(g,['P012'],'侍女端来热牛奶和柠檬甜饼，说明是国王吩咐换的；国王没有进来。',c.id+':tray:'+ctx.id);
 }else if(c.id==='EXP-W15-C'){
  if(choice==='report')queueIssue(g,c,'repair','列清旧墙与铁栓的补修范围和工料；报价前不增加支出或另开通路。',ctx.id);
 }else if(c.id==='EXP-W25-B'&&choice==='reconsider')queueIssue(g,c,'food-review','重新核对宫廷与军营下一批口粮，说明调整范围、份额和实际费用。',ctx.id);
 log(g,c.id,choice,v.text,{reply,source_ref:ctx.id});
 const label=c.choices.find(x=>x[0]===choice)[1];observe(g,c.id==='EXP-W01-B'&&choice==='food'?['U001']:['U001',c.actor,...(c.companions||[])],'乔弗里：'+label+'\n'+reply,c.id+':choice:'+ctx.id);
 g.campaign.scene_step=1;return true;
}
export function eventCardErrors(g){
 if(!g.campaign)return [];
 const errors=[],rows=history(g);
 for(const h of rows.filter(h=>h.choice==='queued'&&card(h.scene))){
  if(typeof h.queue_id!=='string'||!['proposal','repair','food-review'].includes(h.kind)||typeof h.source_ref!=='string')errors.push('event card pending record');
  if(h.kind==='proposal'&&(!Array.isArray(h.proposal_refs)||!h.proposal_refs.includes(h.proposal_ref)||h.proposal_refs.some(id=>!g.dialogue.proposals.some(p=>p.id===id))))errors.push('event card missing proposal');
 }
 for(const h of rows.filter(h=>h.choice==='llm'&&card(h.scene)))if(!g.activities.some(a=>a.id===h.activity&&a.participants.includes(card(h.scene).actor)))errors.push('event card missing audience');
 for(const h of rows.filter(h=>h.scene==='EXP-W25-A'&&h.choice==='allocation')){
  const t=g.execution.tasks.find(t=>t.id===h.task_ref&&t.order_ref===h.order_ref&&t.params.operation==='supply');
  if(!t||!Array.isArray(h.original)||h.original.some(x=>!Number.isFinite(x.amount)||x.amount<0)||Math.abs(h.original.reduce((n,x)=>n+x.amount,0)-(t?.params.amount||0))>0.0001)errors.push('event card invalid allocation');
 }
 return errors;
}

function executeAuthored(g,c,choice,ctx,o,planWork){
 const b=c.bindings[choice];o.need(b&&conditionsMet(g,b.requires),'这项办法的前提已经改变。');
 let reply=c.replies[choice];
 if(b.kind==='work'){issueEventWork(g,c,choice,ctx,o);}
 else if(b.kind==='campaign'){
  o.need(planWork,'这项正式提案需要在御前会议裁定。');
  const start=g.messages.length;planWork(g,b.operation,ctx,o,c.id);
  const report=g.messages.slice(start).find(m=>m.recipient==='U001');if(report)reply=report.content;
 }
 else if(b.kind==='action')o.apply(g,b.action,ctx);
 else if(b.kind==='remains'){
  if(!g.opening.jobs.some(j=>j.kind==='preserve'))o.startOpeningWork(g,ctx,o,'preserve');
  if(b.notify)o.report(g,'ORG-HOUSEHOLD','国王已经要求保存父亲的遗骸，实际交接与启运仍以之后的通知为准。',[ctx.id],'P012');
 }
 else if(b.kind==='due-payment'){
  const dues=g.obligations.filter(p=>p.status!=='已支付'&&p.due_minute<=now(g));
  for(const p of dues){if(['PAY01','PAY02'].includes(p.id)&&!g.execution.inspections.some(i=>i.target_ref===p.id&&i.result==='verified')){
   if(!g.execution.tasks.some(t=>t.params.obligation_ref===p.id&&!['completed','cancelled'].includes(t.status)))o.apply(g,{type:'inspect_payment',obligation_ref:p.id},ctx);
  }else if(g.execution.inspections.some(i=>i.target_ref===p.id&&i.result==='verified'))o.apply(g,{type:'pay_obligation',obligation_ref:p.id},ctx);}
  if(planWork)planWork(g,'service',ctx,o,c.id);
 }
 else if(b.kind==='cancel-work'){
  const t=cancelTarget(g);
  if(t)o.apply(g,{type:'cancel_order',order_ref:t.order_ref},ctx);else reply='书记查过未办的委托，没有可以照此撤销的非急务；原债款仍按原合同处理。';
 }
 else o.need(b.kind==='record','未登记的事件结果类型。');
 for(const tag of b.facts||[])if(b.kind==='record')g.execution.evidence.push({id:o.key(g,'EV'),category:'event:'+tag,status:'realized',at:now(g),source_ref:ctx.id,stage_ref:c.id});
 if(b.appointment){const p=b.appointment,at=(Math.floor(now(g)/1440)+p.days)*1440+p.hour*60-360,origin=Object.keys(places).find(k=>places[k]===actor(g,p.actor)?.location),minutes=travelMinutes(placeRegions[origin],placeRegions[p.place])??45;g.opening.appointments.push({actor:p.actor,place:p.place,depart:at-minutes,arrive:at,status:'scheduled',source:c.id});}
 log(g,c.id,'authored-result',reply,{option:choice,source_ref:ctx.id});
 return reply;
}
function optionLabel(g,c,id,label){
 const b=c.bindings?.[id];if(!b)return label;
 if(b.kind==='cancel-work'){const t=cancelTarget(g);return t?`撤回尚未开工的委托：${g.orders.find(o=>o.id===t.order_ref)?.execution_condition||t.order_ref}`:'核对是否还有可撤回的未开工委托';}
 if(b.kind==='work')return label+`（${b.cost}金龙；${b.minutes<1440?b.minutes+'分钟':+(b.minutes/1440).toFixed(1)+'日'}${b.troops?'；占用现员'+b.troops+'人':''}${b.labor?'；'+b.labor+'工班':''}）`;
 if(b.kind==='campaign'&&operations[b.operation]){const x=operations[b.operation],cost=b.operation==='supply'?Math.round(g.consumption.reduce((n,c)=>n+c.rate_per_day,0)*14*.006*10000)/10000:x.cost;return label+`（${cost}金龙；${x.days}日）`;}
 return label;
}
const cancelTarget=g=>g.execution.tasks.find(t=>['sent','accepted'].includes(t.status)&&['event_work','campaign_work'].includes(t.kind)&&!['supply','service','warning'].includes(t.params.operation));
export const pendingCardTopics=g=>[...new Set(history(g).filter(h=>['queued-card','queued-operation'].includes(h.choice)&&!history(g).some(x=>x.scene===(h.queue_id||h.scene)&&x.choice==='council-decision')).map(h=>h.queue_id||h.scene))];
// Event rehearsal material is not an actor's evidence or an executed decision.
export function eventDialogueMaterial(g,actor){
 const c=currentCard(g),entry=history(g).findLast(h=>h.scene===c?.id&&h.choice==='enter');if(!c||c.actor!==actor||g.campaign.scene_step!==2)return null;
 const played=history(g).slice(history(g).lastIndexOf(entry)+1).filter(h=>h.scene===c.id&&h.choice==='reading').map(h=>h.text);
 return {id:c.id,title:c.title,scene:[...played,entry?.text||''].join('\n'),staging:c.implementation==='prototype'?entry?.text||'':c.visible_staging||entry?.text||'',interaction:c.rp_cue,prompts:eventCardData.prompts};
}
