import {synchronizeGuardPresence} from './household-guards.mjs';
import {dailyForActivity} from './daily-engine.mjs';
import {barristanChoices} from './opening-content.mjs';
import {eventProposal,proposalQueued,queueCardProposal} from './event-cards.mjs';
import {pendingCharacters,saveCharacter,validCharacterRecord} from './character-state.mjs';
import {RuleError,applyWorldAction} from './world-engine.mjs';
import {actorEvidence,initializeDialogue,buildContext,buildCharacterReview,checkPre,checkPost,decisionTarget,target,observe,audience,exact,ensure,checkAction,profiles} from './dialogue-core.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=g=>'D-'+(++g.execution.serial);
function safe(fn){try{return fn();}catch(e){if(e instanceof RuleError)throw e;throw new RuleError(e.message,'invalid');}}
export function dialogueErrors(d,g){
 if(d===undefined)return [];
 try{exact(d,['version','presence','observations','turns','agendas','proposals','bindings','requests']);ensure(d.version===1,'DIALOGUE_VERSION');
  for(const k of ['presence','observations','turns','proposals','bindings','requests'])ensure(Array.isArray(d[k]),'INVALID_DIALOGUE_SAVE');
  ensure(d.agendas&&typeof d.agendas==='object'&&!Array.isArray(d.agendas),'INVALID_DIALOGUE_SAVE');
  for(const rows of [d.turns,d.proposals,d.observations,d.requests])ensure(new Set(rows.map(r=>r.id)).size===rows.length,'DUPLICATE_DIALOGUE_RECORD');
  for(const p of d.presence)ensure(g.activities.some(a=>a.id===p.activity_ref&&a.participants.includes(p.actor)),'PRESENCE_WITHOUT_ACTIVITY');
  for(const t of d.turns){ensure(profiles[t.actor]&&typeof t.prose==='string'&&typeof t.input==='string'&&Array.isArray(t.audience)&&t.audience.includes(t.actor)&&t.audience.includes('U001')&&Number.isSafeInteger(t.at)&&t.at>=0&&t.at<=g.clock.elapsed_minutes&&t.post&&t.pre&&t.context,'INVALID_FORMAL_DIALOGUE');ensure(typeof t.post.summary==='string'&&Array.isArray(t.post.experiences)&&Array.isArray(t.post.decisions)&&Array.isArray(t.request_records),'INVALID_FORMAL_DIALOGUE');}
  for(const o of d.observations)ensure(Array.isArray(o.actors)&&Array.isArray(o.targets)&&typeof o.content==='string'&&Number.isSafeInteger(o.at)&&o.at<=g.clock.elapsed_minutes,'INVALID_OBSERVATION');
  for(const [actor,agenda]of Object.entries(d.agendas))ensure(profiles[actor]&&Array.isArray(agenda.priorities)&&agenda.priorities.every(x=>typeof x==='string')&&Array.isArray(agenda.basis)&&validCharacterRecord(actor,agenda.character),'INVALID_AGENDA');
  for(const p of d.proposals){checkAction(p.action);ensure(d.turns.some(t=>t.id===p.turn_ref)&&['pending','executed','cancelled'].includes(p.status)&&Array.isArray(p.conditions)&&Array.isArray(p.bindings)&&Array.isArray(p.dependencies)&&p.dependencies.every(id=>d.proposals.some(x=>x.id===id&&x.turn_ref===p.turn_ref))&&typeof p.joint_group==='string','INVALID_PROPOSAL');}
  for(const b of d.bindings){const decision=g.execution.decisions.find(x=>x.id===b.decision_ref);const job=g.autonomy?.jobs.find(j=>j.id===b.turn_ref&&j.status==='done'&&j.result&&j.actor===decision?.actor&&j.scope.parameters.target_ref===b.target_ref&&j.scope.parameters.source===decision?.kind&&decision.source_refs.includes(j.id));ensure(decision&&(d.turns.some(t=>t.id===b.turn_ref)||job),'DECISION_WITHOUT_DIALOGUE');}
  return [];
 }catch(e){return [e.message];}
}
export function invalidateDecisions(g){
 if(!g.dialogue)return;
 for(const b of g.dialogue.bindings){const d=g.execution.decisions.find(d=>d.id===b.decision_ref);if(d&&d.status==='accepted'&&!same(target(g,b.target_ref),b.target_snapshot))d.status='superseded';}
}
export function afterWorldAction(before,g,a,ctx){
 initializeDialogue(g);
 // Existing messages carry the actual notification. Authority is delivered only with that message.
 for(const auth of g.authorities.filter(a=>a.id.startsWith('DAUTH-')&&!a.delivery_refs.length)){
  const m=g.messages.find(m=>m.id===auth.source_refs[1]&&m.status==='已收到');if(m)auth.delivery_refs.push(m.id);
 }
 if(a.type==='start_activity'){
  const activity=g.activities.at(-1);for(const actor of activity.participants)g.dialogue.presence.push({activity_ref:activity.id,actor,present:true,source_ref:ctx.id,at:g.clock.elapsed_minutes});
 }
 synchronizeGuardPresence(g,ctx.id);
 // The activity entry confirms actual attendance; a mere region location never becomes an audience.
 const listeners=[...new Set((before.dialogue?.presence||[]).filter(p=>p.present&&before.activities.some(x=>x.id===p.activity_ref&&x.status==='active')).map(p=>p.actor))];
 const created=[];
 for(const rows of [g.offices,g.politics.guard_plans,g.authorities])for(const x of rows)if(![...before.offices,...before.politics.guard_plans,...before.authorities].some(b=>b.id===x.id)){const t=target(g,x.id);if(t)created.push(t);}
 if(created.length)observe(g,listeners,'现场登记的安排（任命不等于接受或交接）：'+JSON.stringify(created),ctx.id,created);
 if(a.type==='cancel_order')observe(g,listeners,`国王发出撤销${a.order_ref}的命令；尚待通知执行者，不代表已经撤销。`,ctx.id);
 invalidateDecisions(g);
}
export function proposalView(g,p,ctx={}){
 const labels={nav_inspect_tunnel:'核查旧通道',campaign_issue:'交办已支持的年度事务',opening_decide:'会议裁决',opening_invite:'委托教会联络',replace_kingsguard:'确认七席交接',create_organization:'登记筹建机构',appoint_official:'任命',grant_authority:'发送筹备授权',activate_organization:'开始有限履职',plan_guard_transfer:'拟定近卫转属',execute_guard_transfer:'发出转属执行命令',grant_operation_authority:'授予有限操作权限',temporary_detail:'临时借调',cancel_order:'发出撤令',inspect_payment:'核验付款条件',pay_obligation:'安排付款',night_patrol:'加强夜巡',create_project:'整理指定目录',transfer_stock:'调拨口粮'};
 if(eventProposal(g,p)&&!ctx.councilCommit)return {id:p.id,status:p.status,title:'送交御前会议讨论',action:structuredClone(p.action),cost:'在会议确定范围后核对费用',duration:'本次交谈不发政令',conditions:p.conditions,reason:proposalQueued(g,p.id)?'已经加入待议事项，会议召开时呈报。':'这是一项正式提案，需在会议确认后交办。',ready:p.status==='pending'&&!proposalQueued(g,p.id)};
 const preview=structuredClone(g);let reason='';try{executeProposals(preview,p.id,{...ctx,id:'preview',parent_revision:g.revision.state_id,result_revision:'preview'});}catch(e){reason=e.message;}
 const a=p.action;
 let cost='无新增现金规则；实际执行仍检查原供养与资源',duration='通知、履职和交接按既有规则推进';
 if(a.type==='create_project'){cost='预留10金龙，按实际工作支出';duration='送达后筹备30分钟、执行90分钟，受人员占用影响';}
 if(a.type==='pay_obligation'){cost='按已核验付款项与原预留结算，不重复扣款';duration='按原到期日和交付条件支付';}
 if(a.type==='temporary_detail')duration='本地交接60分钟，截止后归队另需60分钟';
 return {id:p.id,status:p.status,title:labels[a.type]+(p.joint_group?'（与同组条件一并确认）':''),action:structuredClone(a),cost,duration,conditions:p.conditions,reason,ready:p.status==='pending'&&!reason};
}
function executeProposals(g,id,ctx){
 const chosen=g.dialogue.proposals.find(x=>x.id===id);ensure(chosen?.status==='pending','PROPOSAL_ALREADY_HANDLED');
 if(eventProposal(g,chosen)&&!ctx.councilCommit){queueCardProposal(g,chosen,ctx.id);return;}
 const group=chosen.joint_group?g.dialogue.proposals.filter(x=>x.turn_ref===chosen.turn_ref&&x.joint_group===chosen.joint_group):[chosen];
 ensure(group.every(x=>x.status==='pending'),'JOINT_GROUP_ALREADY_CHANGED');const remaining=[...group];
 while(remaining.length){const index=remaining.findIndex(p=>p.dependencies.every(id=>g.dialogue.proposals.some(x=>x.id===id&&x.status==='executed')));ensure(index>=0,'请先完成前置行动');const [p]=remaining.splice(index,1);
  ensure(!p.conditions.length,'仍有交换条件，需先明确落实后重新讨论');for(const b of p.bindings)ensure(same(target(g,b.ref),b.value),'方案对象已改变，请重新讨论');
  const before=structuredClone(g);applyWorldAction(g,p.action,ctx);p.status='executed';p.receipt_ref=ctx.id;afterWorldAction(before,g,p.action,ctx);
 }
}
export function applyDialogueAction(g,a,ctx){return safe(()=>{
 initializeDialogue(g);
 if(a.type==='dialogue_authored_review'){
  exact(a,['type']);ensure(ctx.authoredPlay&&g.campaign?.scene==='finale','AUTHOR_REVIEW_NOT_AVAILABLE');
  for(const actor of pendingCharacters(g,actorEvidence)){
   const c=buildCharacterReview(g,actor);ensure(!c.character.state.pending,'人物有尚待明确的态度，请先完成原来的判断。');
   saveCharacter(g,c,{mode:'keep',attitude:c.character.state.attitude,explanation:'固定路线沿用本局已经确认的态度；未演出的心理转折不另行推定。',basis:[]},ctx.id);
  }return 'AUTHORED_ATTITUDES_CONFIRMED';
 }
 if(a.type==='dialogue_authored_scene'){
  exact(a,['type','choice']);ensure(ctx.authoredPlay,'AUTHOR_SCENE_NOT_AVAILABLE');
  const v=g.opening?.visits.find(v=>v.scene==='barristan'),activity=g.activities.find(x=>x.id===v?.activity&&x.status==='active');
  ensure(activity&&audience(g,activity.id).includes('P011'),'ACTOR_NOT_PRESENT');
  const turnId='author-barristan:'+activity.id;ensure(!g.dialogue.turns.some(t=>t.id===turnId),'TURN_ALREADY_COMMITTED');
  ensure(!g.dialogue.turns.some(t=>t.activity===activity.id&&t.actor==='P011'),'此会面已有自由对话，请继续原来的答复，不覆盖他的决定。');
  const content=barristanChoices[a.choice];ensure(content,'INVALID_ACTION');const c=buildContext(g,'P011',activity.id,content.input);
  const refs=c.known.filter(k=>k.targets?.some(t=>t.ref==='BARRISTAN-AUDIENCE')||k.content?.includes('本次可以分别谈')).map(k=>k.ref);
  ensure(refs.length,'UNKNOWN_EVIDENCE');
  const pre={intent:{mode:'proposal',purpose:'大圣堂面谈',means:[],joint_conditions:[],unresolved:[]},focus_refs:refs,agenda:{mode:'keep',priorities:c.agenda.priorities,basis:c.agenda.basis},guidance:[]};
  const post={consistent:true,summary:content.prose,decisions:content.decisions.map(([kind,choice,quote,conditions])=>({kind,target_ref:'BARRISTAN-AUDIENCE',choice,quote,conditions,refs})),experiences:[],candidates:[]};
  return applyDialogueAction(g,{type:'dialogue_finish',turn_id:turnId,context:c,pre,prose:content.prose,post,request_records:[{source:'author-barristan-v1'}]},ctx);
 }
 if(a.type==='dialogue_review_character'){
  exact(a,['type','context','result']);const c=buildCharacterReview(g,a.context.actor);
  ensure(same(c,a.context),'STALE_DIALOGUE_CONTEXT');saveCharacter(g,c,a.result,ctx.id);return 'CHARACTER_REVIEWED';
 }
 if(a.type==='dialogue_share'){
  exact(a,['type','activity_ref','target_ref']);const listeners=audience(g,a.activity_ref);ensure(listeners.includes('U001'),'ACTOR_NOT_PRESENT');const t=target(g,a.target_ref);ensure(t,'UNKNOWN_TARGET');
  // Only player-owned new plans/appointments, or an authorization actually offered to the king.
  ensure(t.kind==='guard_plan'||t.kind==='detail_request'||(t.kind==='appointment'&&g.administration.organizations.some(o=>o.source_refs[0]!=='T0'&&o.office_refs.includes(t.ref)))||(t.kind==='authority'&&(t.issuer==='U001'||g.dialogue.turns.some(r=>r.audience.includes('U001')&&r.post.decisions.some(d=>d.kind==='temporary_authority'&&d.choice==='accept')))),'TARGET_NOT_PLAYER_KNOWN');
  observe(g,listeners,'国王说明已有安排：'+JSON.stringify(t),ctx.id,[t]);return 'DIALOGUE_SHARED';
 }
 if(a.type==='dialogue_presence'){
  exact(a,['type','activity_ref','actor','present']);const activity=g.activities.find(x=>x.id===a.activity_ref&&x.status==='active');ensure(activity&&activity.participants.includes(a.actor)&&a.actor!=='U001'&&typeof a.present==='boolean','ACTOR_NOT_PRESENT');
  const row=g.dialogue.presence.find(x=>x.activity_ref===a.activity_ref&&x.actor===a.actor);ensure(row,'NO_ATTENDANCE_RECORD');row.present=a.present;return 'LISTENERS_UPDATED';
 }
 if(a.type==='dialogue_request_detail'){
  exact(a,['type','count','end_at']);ensure(Number.isSafeInteger(a.count)&&a.count>=1&&a.count<=12&&Number.isSafeInteger(a.end_at)&&a.end_at>g.clock.elapsed_minutes+75&&a.end_at<=g.clock.elapsed_minutes+1440,'INVALID_DETAIL');
  g.dialogue.requests.push({id:key(g),count:a.count,end_at:a.end_at});return 'DETAIL_REQUEST_RECORDED';
 }
 if(a.type==='dialogue_finish'){
  exact(a,['type','turn_id','context','pre','prose','post','request_records']);ensure(typeof a.turn_id==='string'&&a.turn_id.length<150,'INVALID_TURN_ID');ensure(!g.dialogue.turns.some(t=>t.id===a.turn_id),'TURN_ALREADY_COMMITTED');
  const c=ctx.councilFrozen?a.context:buildContext(g,a.context.actor,a.context.activity,a.context.input,a.context.retrieved||[]);const legacy=!a.context.character&&a.context.personality.version!==c.personality.version;const comparable=v=>{const n=structuredClone(v);delete n.character;delete n.personality;delete n.agenda.character;return n;};ensure(legacy?same(comparable(c),comparable(a.context)):same(c,a.context),'STALE_DIALOGUE_CONTEXT');if(legacy){c.personality=structuredClone(a.context.personality);delete c.character;}checkPre(c,a.pre);checkPost(g,c,a.post,a.prose);
  if(a.pre.intent.mode==='claim')ensure(!a.post.candidates.length,'CLAIM_CANNOT_EXECUTE');
  ensure(Array.isArray(a.request_records)&&a.request_records.length<=100,'INVALID_REQUEST_RECORD');
  // Request snapshots contain connections without credentials. Refuse credential-shaped data anywhere.
  ensure(!/"(?:key|apiKey|authorization)"\s*:/i.test(JSON.stringify(a.request_records)),'REQUEST_CONTAINS_SECRET');
  const turn={id:a.turn_id,actor:c.actor,at:c.at,audience:c.audience,activity:c.activity,input:c.utterance_origin==='chair'?'':c.input,prose:a.prose,context:structuredClone(c),pre:structuredClone(a.pre),post:structuredClone(a.post),request_records:structuredClone(a.request_records)};
  g.dialogue.turns.push(turn);const daily=dailyForActivity(g,c.activity),queue=daily?.queue;if(queue&&queue.status==='pending'&&queue.actors[queue.index]===c.actor&&queue.input===c.input){queue.turns.push(turn.id);queue.index++;if(queue.index===queue.actors.length)queue.status='done';}g.dialogue.agendas[c.actor]={...g.dialogue.agendas[c.actor],priorities:a.pre.agenda.priorities,basis:a.pre.agenda.basis.map(r=>r==='current-input'?turn.id:r)};
  saveCharacter(g,c,a.pre.character,turn.id);
  for(const d of a.post.decisions){const snapshot=decisionTarget(g,c,d),id=key(g);
   // A later explicit refusal/condition replaces the old decision for this exact scope.
   for(const old of g.execution.decisions.filter(x=>x.actor===c.actor&&x.kind===d.kind&&x.target_ref===d.target_ref))old.status='superseded';
   const row={id,actor:c.actor,kind:d.kind,target_ref:d.target_ref,status:{accept:'accepted',conditional:'conditional',refuse:'refused',defer:'deferred'}[d.choice],source_refs:[turn.id],at:c.at};g.execution.decisions.push(row);
   g.dialogue.bindings.push({decision_ref:id,turn_ref:turn.id,target_ref:d.target_ref,target_snapshot:snapshot});
   if(d.kind==='temporary_authority'&&d.choice==='accept'){
    const req=g.dialogue.requests.find(r=>r.id===d.target_ref),authId='DAUTH-'+key(g),messageId='DMSG-'+key(g);
    const issuedAt=ctx.councilFrozen?g.clock.elapsed_minutes:c.at;
    g.authorities.push({id:authId,issuer:'P001',subject:'P048',relation:'temporary_detail',object_ref:'FORCE02',scope:{actions:['temporary_detail'],max_count:req.count,group_id:'FORCE02-C',location:'红堡'},starts_at:issuedAt,expires_at:req.end_at,status:'active',source_refs:[turn.id,messageId],delivery_refs:[]});
    g.messages.push({id:messageId,sender:'P001',recipient:'P048',fact_refs:[],content:`摄政批准一次临时借调：最多${req.count}名家兵，截止T0+${req.end_at}分钟。授权${authId}，指挥者接受与交接仍待落实。`,sent_minute:issuedAt,arrival_window_minutes:[issuedAt+15,issuedAt+15],delivered_minute:null,status:'在途',channel:'授权文书',obstruction:null,arrival_condition:'正常本地送达',event_refs:[],basis:{kind:'本卡设计',refs:[turn.id],detail:'正式对话形成有限授权；文书15分钟后送达'}});
    observe(g,c.audience,'摄政已给出有限授权，仍需送达与执行：'+JSON.stringify(target(g,authId)),turn.id,[target(g,authId)]);
   }
  }
  const ids=a.post.candidates.map(()=>key(g));
  a.post.candidates.forEach((p,i)=>g.dialogue.proposals.push({id:ids[i],turn_ref:turn.id,action:structuredClone(p.action),conditions:p.conditions,joint_group:p.joint_group,dependencies:p.depends_on.map(j=>ids[j]),bindings:c.targets.filter(t=>JSON.stringify(p.action).includes(t.ref)).map(t=>({ref:t.ref,value:t})),status:'pending',receipt_ref:null}));
  return 'DIALOGUE_COMMITTED';
 }
 if(a.type==='dialogue_execute'){
  exact(a,['type','proposal_ref']);const p=g.dialogue.proposals.find(p=>p.id===a.proposal_ref);ensure(p&&p.status==='pending','PROPOSAL_ALREADY_HANDLED');const v=proposalView(g,p,ctx);ensure(v.ready,v.reason||'PROPOSAL_BLOCKED');
  executeProposals(g,p.id,ctx);return 'DIALOGUE_ACTION_EXECUTED';
 }
 if(a.type==='dialogue_discard'){
  exact(a,['type','proposal_ref']);const p=g.dialogue.proposals.find(p=>p.id===a.proposal_ref);ensure(p&&p.status==='pending','PROPOSAL_ALREADY_HANDLED');p.status='cancelled';return 'PROPOSAL_CANCELLED';
 }
 throw Error('DIALOGUE_ACTION_UNKNOWN');
});}
