import {absentActor,arrestTarget} from './custody-state.mjs';
import {reformQuotation} from './reform-quotation.mjs';
import {checkReformPlan,reformInstructions,reformExtraInstructions,supportInstructions} from './reform-contract.mjs';
import {reformTarget,reformKnowledge,reformCatalogue} from './reform-engine.mjs';
import {conditionalCommand,bindingQuoteMatches,quoteMatches,explicitCondition,checkActionEvidence,actionParameters} from './middleware-evidence.mjs';
import {synchronizeGuardPresence,physicalAudience,guardMaterials,household,guardSlots,guardKnowledge} from './household-guards.mjs';
import {dailyForActivity} from './daily-engine.mjs';
import {eventCardData} from './event-cards-data.mjs';
function eventDialogueMaterial(g,actor){
 const history=g.campaign?.history||[],entry=history.findLast(h=>h.scene===g.campaign?.scene&&h.choice==='enter');
 const c=entry?.card_snapshot||eventCardData.cards.flatMap(c=>[c,...(c.segments||[]).map(s=>({...c,...s}))]).find(c=>c.id===g.campaign?.scene);
 if(!c||c.actor!==actor||g.campaign.scene_step!==2)return null;
 const played=history.slice(history.lastIndexOf(entry)+1).filter(h=>h.scene===c.id&&h.choice==='reading').map(h=>h.text);
 return {id:c.id,title:c.title,scene:[...played,entry?.text||''].join('\n'),staging:c.implementation==='prototype'?entry?.text||'':c.visible_staging||entry?.text||'',interaction:c.rp_cue,prompts:eventCardData.prompts};
}
import {characterMaterials,characterText,characterContract,checkCharacter} from './character-state.mjs';
import {campaignIssue,campaignAllowed} from './campaign-engine.mjs';
import {operations} from './campaign-content.mjs';
// GOT adapters reuse the archived actor-evidence / cited-brief approach, not its State engine.
import {profiles} from './dialogue-profiles.mjs';
import {profileVoice} from './profile-voice.mjs';
import {memoryMaterials} from './memory-core.mjs';
import {mechEvidence,readMech} from './stance-engine.mjs';
import {checkMechDeltas,mechContract,mechRevision} from './mech-state.mjs';
import {issues,councilPrompt} from './opening-content.mjs';
export {profiles};
const copy=v=>structuredClone(v), same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function ensure(v,code){if(!v)throw Error(code);}
export function exact(v,keys){ensure(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),'DIALOGUE_INVALID_FIELDS');}
const text=(v,max=250000)=>typeof v==='string'&&v.length>0&&v.length<=max;
const list=(v,max=50)=>Array.isArray(v)&&v.length<=max;
export function initializeDialogue(g){g.dialogue??={version:1,presence:[],observations:[],turns:[],agendas:{},proposals:[],bindings:[],requests:[]};}
export const mechanismFields={
 order_arrest:['target','executor','force','group','count','area','secrecy','reason'],release_prisoner:['arrest_ref'],reform_propose:['plan'],reform_revise:['project_ref','revision','plan'],reform_maintain:['effect_ref','operation','auto_pay'],reform_operation_control:['effect_ref','operation'],reform_intel_report:['network_ref'],reform_supply_report:['force_ref'],reform_report:['project_ref'],reform_control:['project_ref','revision','operation','step_ref'],
 campaign_issue:['operation'],nav_inspect_tunnel:['source'],
 create_organization:['name','responsibilities'],appoint_official:['organization_ref','title','person'],
 grant_authority:['organization_ref','person','expires_at'],activate_organization:['organization_ref'],
 plan_guard_transfer:['organization_ref','count','posts'],execute_guard_transfer:['plan_ref'],
 grant_operation_authority:['person','operation','target_ref','max_count','expires_at'],
 temporary_detail:['count','commander','authority_ref','acceptance_ref','end_at'],
 cancel_order:['order_ref'],inspect_payment:['obligation_ref'],pay_obligation:['obligation_ref'],
 opening_decide:['meeting','issue','choice'],opening_invite:[],replace_kingsguard:['plan_ref'],
 night_patrol:['count','duration'],create_project:['template','title'],transfer_stock:['source','destination','amount']
};
export function checkAction(a){ensure(a&&Object.hasOwn(mechanismFields,a.type),'MECHANIC_UNIMPLEMENTED');exact(a,['type',...mechanismFields[a.type]]);if(['reform_propose','reform_revise'].includes(a.type))checkReformPlan(a.plan);return a;}
export function target(g,ref){
 const arrest=arrestTarget(g,ref);if(arrest)return arrest;
 const reform=reformTarget(g,ref);if(reform)return reform;
 // Read bindings from the same typed catalogue as the character's known material.
 // This lookup validates a supplied reference; it does not grant anyone knowledge.
 for(const actor of new Set([...g.forces.map(f=>f.controller),...g.offices.filter(o=>o.status==='在任').map(o=>o.holder)])){const object=reformCatalogue(g,actor).find(t=>t.ref===ref);if(object)return object;}
 if(typeof ref==='string'&&ref.startsWith('quote:')){const [,topic,actor,quotedAt]=ref.split(':');if(quotedAt!==undefined&&(!/^\d+$/.test(quotedAt)||Number(quotedAt)>g.clock.elapsed_minutes))return null;return reformQuotation(g,actor,topic,quotedAt===undefined?g.clock.elapsed_minutes:Number(quotedAt));}
 if(ref==='RK-AEGON'&&g.opening?.navigation)return {ref,kind:'tunnel_lead',scope:'红堡至伊耿高丘旧通道的线索披露；并非已经核实通行'};
 if(ref==='BARRISTAN-AUDIENCE'&&g.opening?.visits.some(v=>v.scene==='barristan'))return {ref,kind:'barristan_audience',scope:'本次面谈：安全、谅解、意见或回归意向；不授予白袍'};
 const plan=g.politics.guard_plans.find(x=>x.id===ref);
 if(plan)return {ref,kind:'guard_plan',count:plan.count,commander:plan.commander,posts:plan.posts,organization_ref:plan.organization_ref};
 const office=g.offices.find(x=>x.id===ref);if(office)return {ref,kind:'appointment',title:office.title,holder:office.holder,status:office.status};
 const auth=g.authorities.find(x=>x.id===ref);if(auth)return {ref,kind:'authority',issuer:auth.issuer,subject:auth.subject,object_ref:auth.object_ref,scope:copy(auth.scope),status:auth.status,starts_at:auth.starts_at,expires_at:auth.expires_at};
 const req=g.dialogue?.requests.find(x=>x.id===ref);if(req)return {ref,kind:'detail_request',count:req.count,end_at:req.end_at};
 return null;
}
export function audience(g,activity){synchronizeGuardPresence(g);const a=g.activities.find(x=>x.id===activity&&x.status==='active');ensure(a,'ACTIVITY_NOT_ACTIVE');const rows=g.dialogue.presence.filter(x=>x.activity_ref===activity&&x.present);return [...new Set(rows.map(x=>x.actor).filter(x=>a.participants.includes(x)&&!absentActor(g,x)))];}
export function observe(g,actors,content,source,targets=[]){actors=actors.filter(id=>!absentActor(g,id)||g.execution?.arrests?.some(r=>r.id===source));if(!actors.length)return;g.dialogue.observations.push({id:'OBS-'+(++g.execution.serial),actors:[...new Set(actors)],at:g.clock.elapsed_minutes,content,source,targets:copy(targets)});}
export function actorEvidence(g,actor){
 const p=profiles[actor];ensure(p,'ACTOR_PROFILE_NOT_READY');const at=g.clock.elapsed_minutes;
 const known=p.initial.map((content,i)=>({ref:`seed:${actor}:${i}`,kind:'initial',content:'开局清晨的认知（后续已收到消息可以更新）：'+content,at:0,source:p.source}));
 known.push(...guardKnowledge(g,actor),...reformKnowledge(g,actor));
 // A personal injury is known to its subject. Only established author/world
 // facts qualify; messages, claims and raw dialogue cannot manufacture injury.
 if(actor==='P015')for(const f of g.facts||[]){
  const uncertain=/(?:未(?:经)?|待)核实|待证实|未经证实|没有.{0,8}证据|没有发生|无证据|尚无|不是|并非|并未|未曾|不曾|传闻|据说|听说|可能|疑似|如果|倘若|假如|一旦|若|否认|辟谣|证伪|不实|虚构|谣言|传言|假消息|[？?]/;
  const injury=/(?:詹姆(?:·兰尼斯特)?|P015)(?:的)?(?:已经|确已|已|实际)?(?:断手|失去右手|失去了右手|失去持剑能力|右手(?:已经|已)?被(?:砍断|斩断|砍掉|斩去)|因重伤失去持剑能力)/;
  if(Number.isSafeInteger(f.established_minute)&&f.established_minute<=at&&['本卡设计','既有设计'].includes(f.basis?.kind)&&f.basis.refs?.length&&!uncertain.test(f.statement)&&injury.test(f.statement))
   known.push({ref:'self-injury:'+f.id,kind:'own_status',content:'本人实际伤势：'+f.statement.match(injury)[0]+'。',at:f.established_minute,source:f.id,reliability:'confirmed',stage_facts:['jaime_wounded']});
 }

 if(actor==='P004'&&g.opening?.navigation)known.push({ref:'RK-AEGON-AUTHOR',kind:'private_knowledge',content:'你知道一条红堡通往伊耿高丘的旧通道，单程约一刻钟。可以隐瞒、提出交换、拒绝，或透露可供实地核查的路线。路线存在属于本卡设计；国王尚不因你知晓而自动知晓。',at:0,source:'本卡地图剧情'});
 for(const m of g.messages){
  const sent=m.sender===actor&&m.sent_minute<=at,received=m.recipient===actor&&m.status==='已收到'&&m.delivered_minute<=at;
  if(!sent&&!received)continue;
  const confirmed=m.channel==='执行回报'&&m.basis?.kind==='本卡设计'&&!/未核实|未经核实|待核实|待证实|未经证实|证伪|传闻|据说|听说|可能|没有|并未|并没|并非|未曾|不曾|未被|否认|辟谣|不实|谣言|假消息|尚无可靠|如果|假如|倘若|一旦|是否|[？?]/.test(m.content);
  const stage_facts=[];if(confirmed){if(m.basis.refs?.includes('OPEN-JAIME-ADAPTATION')&&g.opening?.events.includes('jaime-report'))stage_facts.push('jaime_captured');if(m.basis.refs?.includes('C03')&&g.commitments.find(c=>c.id==='C03')?.status==='押送南返')stage_facts.push('jaime_released');if(m.basis.refs?.includes('MQ14')&&g.campaign?.battle?.result==='held_with_relief')stage_facts.push('blackwater_victory');}
  known.push({ref:m.id,kind:sent?'own_report':'report',content:(sent?'本人曾发出这份报告：':'')+m.content,at:sent?m.sent_minute:m.delivered_minute,source:m.sender,reliability:confirmed?'confirmed':'reported',visibility:['宫廷公示','公开传达'].includes(m.channel)?'court':'recipient',stage_facts});
 }
 if(g.campaign){const a=g.actors.find(a=>a.id===actor);known.push({ref:'self-current:'+actor,kind:'own_status',content:'你当前的实际身份：'+a.roles.join('、')+'；所任职位：'+g.offices.filter(x=>x.holder===actor&&x.status==='在任').map(x=>x.title).join('、')+'；所在地：'+a.location+'。本人婚约：'+g.commitments.filter(x=>x.parties.includes(actor)).map(x=>x.terms+'（'+x.status+'）').join('；'),at,source:'本人现状'});}
 // Own execution records are available only after the work reached this actor.
 for(const t of g.execution.tasks.filter(t=>t.actor_ref===actor&&g.orders.some(o=>o.id===t.order_ref&&o.delivered_minute!==null&&o.delivered_minute<=at)))known.push({ref:t.id,kind:'own_task',content:'本人经办的任务：'+t.kind+'；范围：'+JSON.stringify(t.params)+'；进度：'+t.status,at,source:t.order_ref,reliability:'confirmed'});
 // Message fact_refs are intentionally NOT dereferenced. Reports retain their own words.
 for(const o of g.orders.filter(o=>(o.issuer===actor&&o.issued_minute<=at)||(o.recipient===actor&&o.delivered_minute!==null&&o.delivered_minute<=at))){const received=o.recipient===actor&&o.delivered_minute!==null&&o.delivered_minute<=at;known.push({ref:o.id,kind:o.issuer===actor?'own_order':'received_order',content:`${o.issuer===actor?'本人发出':'收到'}命令：${o.action}；${o.execution_condition}；${received?'本人经办状态：'+o.status:'已发出；执行进展以实际收到的回报为准'}`,at:o.issuer===actor?o.issued_minute:o.delivered_minute,source:o.issuer});}
 for(const o of g.dialogue.observations.filter(o=>o.source!=='court-duty-change'&&o.actors.includes(actor)&&o.at<=at))known.push({ref:o.id,kind:'observation',content:o.content,at:o.at,source:o.source,targets:copy(o.targets)});
 for(const m of g.opening?.meetings||[])if(m.status==='in_progress'&&m.session&&m.session.version!==3)for(const t of m.session.turns.filter(t=>t.context.audience.includes(actor)))known.push({ref:'meeting:'+t.id,kind:'council_dialogue',content:(t.context.utterance_origin==='chair'?'':'乔弗里：'+t.context.input+'\n')+profiles[t.context.actor].name+'：'+t.prose,at:t.context.at,source:t.context.actor});
 const visible=g.dialogue.turns.filter(t=>t.audience.includes(actor)&&t.at<=at);
 // Full original remains in save. Only last visible exchange is sent as full history.
 for(const t of visible)for(const [i,e]of (t.post?.experiences||[]).entries())if(e.kind==='promise'||t.actor===actor)known.push({ref:t.id+':experience:'+i,kind:e.kind,content:e.text,at:t.at,source:t.actor});
 return known;
}
// Read the actor's existing state and memories together, without a write, request
// or new ledger. Callers retain their own attendance, task and meeting scopes.
export function readActorContext(g,actor,retrieved=[]){
 const p=profiles[actor];ensure(p,'ACTOR_PROFILE_NOT_READY');
 const known=actorEvidence(g,actor),memory=memoryMaterials(g,actor,retrieved);
 known.push(...memory.long,...memory.recent,...memory.recalled);if(memory.latest)known.push(memory.latest);
 const saved=g.dialogue.agendas?.[actor];
 known.push(mechEvidence(g,actor));
 return copy({known,personality:{text:profileVoice(p),core:p.personality,version:p.version,source:p.source},
  character:characterMaterials(g,actor,known),agenda:{priorities:saved?.priorities||p.priorities,basis:saved?.basis||[]}});
}
export function buildContext(g,actor,activity,input,retrieved=[]){
 initializeDialogue(g);ensure(text(input,30000),'EMPTY_DIALOGUE_INPUT');const listeners=audience(g,activity);
 ensure(listeners.includes('U001')&&listeners.includes(actor)&&profiles[actor]&&g.actors.some(x=>x.id===actor&&x.life==='存活'),'ACTOR_NOT_PRESENT');
 const a=g.activities.find(x=>x.id===activity),shared=readActorContext(g,actor,retrieved),known=shared.known;
 known.push({ref:'current-input',kind:'heard_claim',content:input,at:g.clock.elapsed_minutes,source:'U001'});
 const latestTargets=new Map();for(const k of known)for(const t of k.targets||[])latestTargets.set(t.ref,t);
 if(actor==='P004'&&g.opening?.navigation)latestTargets.set('RK-AEGON',target(g,'RK-AEGON'));
 const offer=reformQuotation(g,actor,input);if(offer){known.push({ref:offer.ref,kind:'own_status',content:offer.text+' 报价依据：'+offer.basis,at:g.clock.elapsed_minutes,source:'规则报价；不是玩家授权',targets:[offer]});latestTargets.set(offer.ref,offer);const f=g.forces.find(f=>f.id===offer.plan.scope[0]);if(f&&!latestTargets.has(f.id))latestTargets.set(f.id,target(g,f.id));}
 const targets=[...latestTargets.values()];
 return {version:2,branch:g.revision.branch_id,world:g.revision.state_id,at:g.clock.elapsed_minutes,actor,activity,node:a.node,audience:listeners,
  personality:shared.personality,character:shared.character,known,targets,retrieved:copy(retrieved),
  agenda:shared.agenda,input,
  ...(g.opening?{place:a.location,meeting:g.opening.meetings.filter(m=>m.activity===activity&&m.status==='in_progress').map(m=>({id:m.id,current:m.current,title:(campaignIssue(g,m.current)||issues[m.current])?.title||'',question:(campaignIssue(g,m.current)||issues[m.current])?.question||'',choices:(campaignIssue(g,m.current)||issues[m.current])?.choices||[]}))[0]||null}:{}),
  ...(g.campaign?{campaign_operations:campaignAllowed(g).map(id=>({id,label:operations[id].label,cost_basis:operations[id].cost,minimum_days:operations[id].days}))}:{}),
  ...(household(g)?{escorts:guardMaterials(g),daily:dailyForActivity(g,activity)?{id:dailyForActivity(g,activity).id,definition:dailyForActivity(g,activity).definition,topic:dailyForActivity(g,activity).queue?.input||'',previous:g.dialogue.turns.filter(t=>t.activity===activity&&t.audience.includes(actor)).slice(-8).map(t=>({actor:t.actor,prose:t.prose}))}:null}:{}),
  entity_names:Object.fromEntries([...g.actors.filter(a=>listeners.includes(a.id)).map(a=>[a.id,[profiles[a.id]?.name||a.id]]),...targets.map(t=>[t.ref,[t.title||t.ref]])]),event:eventDialogueMaterial(g,actor),mechanisms:copy(g.campaign?mechanismFields:Object.fromEntries(Object.entries(mechanismFields).filter(([k])=>k!=='campaign_issue')))};
}
const cited=(refs,c)=>list(refs)&&refs.length>0&&new Set(refs).size===refs.length&&refs.every(r=>c.known.some(k=>k.ref===r));
export function checkPre(c,p){
 exact(p,['intent','focus_refs','agenda','guidance',...(Object.hasOwn(p,'character')?['character']:[]),...(Object.hasOwn(p,'staging_mood')?['staging_mood']:[])]);checkCharacter(c,p.character);exact(p.intent,['mode','purpose','means','joint_conditions','unresolved']);
 ensure(['chat','proposal','command','claim','unsupported','clarify'].includes(p.intent.mode)&&text(p.intent.purpose,3000),'INVALID_INTENT');
 for(const k of ['means','joint_conditions','unresolved'])ensure(list(p.intent[k])&&p.intent[k].every(x=>text(x,3000)),'INVALID_INTENT');
 ensure(list(p.focus_refs)&&p.focus_refs.every(r=>c.known.some(k=>k.ref===r)),'UNKNOWN_EVIDENCE');
 exact(p.agenda,['mode','priorities','basis']);ensure(['keep','update'].includes(p.agenda.mode)&&list(p.agenda.priorities,8)&&p.agenda.priorities.length&&p.agenda.priorities.every(x=>text(x,1000)),'INVALID_AGENDA');
 if(p.agenda.mode==='keep')ensure(same(p.agenda.priorities,c.agenda.priorities)&&same(p.agenda.basis,c.agenda.basis),'AGENDA_CHANGED_WITH_KEEP');else ensure(cited(p.agenda.basis,c),'UNKNOWN_EVIDENCE');
 ensure(list(p.guidance,12),'INVALID_GUIDANCE');const guidance=[];for(const r of p.guidance){exact(r,['text','refs',...(Object.hasOwn(r,'kind')?['kind']:[])]);ensure(!r.kind||['performance','fact'].includes(r.kind),'INVALID_GUIDANCE_KIND');ensure(text(r.text,2000)&&Array.isArray(r.refs),'INVALID_GUIDANCE');if(c.version>=2&&!Object.hasOwn(r,'kind')&&!r.refs.length)continue;ensure(cited(r.refs,c)||(!r.refs.length&&(c.version<2||r.kind==='performance')),'UNKNOWN_EVIDENCE');guidance.push(r);}
 // Only retained to read a previous frozen request; current contracts and vector
 // retrieval neither request nor consume this former optional field.
 if(p.staging_mood){
  exact(p.staging_mood,['value','refs']);
  ensure(['neutral','warm','amused','tense','angry','fearful','sad'].includes(p.staging_mood.value),'INVALID_STAGING_MOOD');
  ensure(p.staging_mood.value==='neutral'&&Array.isArray(p.staging_mood.refs)&&!p.staging_mood.refs.length||cited(p.staging_mood.refs,c),'UNKNOWN_EVIDENCE');
 }
 return {...p,guidance};
}
export function decisionTarget(g,c,d){
 const current=target(g,d.target_ref),seen=c.targets.find(t=>t.ref===d.target_ref);
 ensure(current&&seen&&same(current,seen),'DECISION_TARGET_CHANGED');
 const allowed={reform_execution:current.kind==='reform'&&(current.owner===c.actor||current.plan.steps.some(s=>(s.effect.commander===c.actor||s.effect.counterparty===c.actor))),tunnel_disclosure:c.actor==='P004'&&current.kind==='tunnel_lead',safe_conduct:c.actor==='P011'&&current.kind==='barristan_audience',reconciliation:c.actor==='P011'&&current.kind==='barristan_audience',advice:c.actor==='P011'&&current.kind==='barristan_audience',return_intent:c.actor==='P011'&&current.kind==='barristan_audience',appointment:current.kind==='appointment'&&current.holder===c.actor,
  guard_command:c.actor==='P016'&&current.kind==='guard_plan',permanent_transfer:c.actor==='P020'&&current.kind==='guard_plan',
  leave_kingsguard:c.actor==='P016'&&current.kind==='guard_plan',return_kingsguard:c.actor==='P011'&&current.kind==='guard_plan',temporary_detail:c.actor==='P016'&&current.kind==='authority'&&current.issuer==='P001',
  temporary_authority:c.actor==='P001'&&current.kind==='detail_request'};
 ensure(allowed[d.kind],'DECISION_OUTSIDE_AUTHORITY');return current;
}
export function checkPost(g,c,p,prose){
 exact(p,['consistent','summary','decisions','experiences','candidates',...(Object.hasOwn(p,'mech_deltas')?['mech_deltas']:[])]);ensure(p.consistent===true,'DIALOGUE_CONTRADICTION');ensure(text(prose)&&text(p.summary,3000),'INVALID_DIALOGUE_TEXT');
 checkMechDeltas(g,c,p.mech_deltas||[],prose);
 const quote=(q,who)=>!(who==='player'&&c.utterance_origin==='chair')&&quoteMatches(who==='player'?c.input:prose,q);
 ensure(list(p.decisions,10)&&list(p.experiences,15)&&list(p.candidates,10),'INVALID_DIALOGUE_LIST');
 const seen=new Set();for(const d of p.decisions){exact(d,['kind','target_ref','choice','conditions','quote','refs']);ensure(['accept','conditional','refuse','defer'].includes(d.choice)&&list(d.conditions)&&d.conditions.every(x=>text(x,2000))&&quote(d.quote,'npc')&&(c.version<2||bindingQuoteMatches(prose,d.quote))&&cited(d.refs,c),'INVALID_DECISION_EVIDENCE');
  ensure(!seen.has(d.kind+'|'+d.target_ref),'DUPLICATE_DECISION');seen.add(d.kind+'|'+d.target_ref);decisionTarget(g,c,d);
  if(d.choice==='accept')ensure(!d.conditions.length&&!explicitCondition(d.quote),'CONDITIONAL_NOT_ACCEPTED');
  if(d.choice==='conditional')ensure(d.conditions.length,'CONDITIONS_MISSING');
 }
 for(const e of p.experiences){exact(e,['kind','text','quote','speaker']);ensure(['promise','claim','relationship','request'].includes(e.kind)&&['player','npc'].includes(e.speaker)&&text(e.text,2000)&&quote(e.quote,e.speaker),'INVALID_EXPERIENCE');}
 for(const a of p.candidates){exact(a,['action','quote','speaker','conditions','depends_on','joint_group']);checkAction(a.action);if(['order_arrest','release_prisoner'].includes(a.action.type))ensure(a.speaker==='player','只有玩家明确命令可以形成抓捕或释放。');ensure(['player','npc'].includes(a.speaker)&&quote(a.quote,a.speaker)&&list(a.conditions)&&a.conditions.every(x=>text(x,2000))&&list(a.depends_on)&&a.depends_on.every(i=>Number.isSafeInteger(i)&&i>=0&&i<p.candidates.length&&i!==p.candidates.indexOf(a))&&typeof a.joint_group==='string','INVALID_ACTION_EVIDENCE');if(c.version>=2){ensure(bindingQuoteMatches(a.speaker==='player'?c.input:prose,a.quote),'INCOMPLETE_ACTION_QUOTE');checkActionEvidence(c,a.action,a.quote);ensure(!conditionalCommand(a.quote)||a.conditions.length||a.depends_on.length||a.joint_group,'ACTION_CONDITIONS_MISSING');if(a.action.type==='night_patrol')ensure(!/(?:不要|不准|不必|取消|撤回).{0,6}(?:派|调|安排|巡)/.test(Array.isArray(a.quote)?a.quote.join(''):a.quote),'ACTION_NEGATED');}}
 // Reject cycles; a joint exchange cannot be reduced to an independent partial grant.
 const visit=(i,path=[])=>{ensure(!path.includes(i),'CANDIDATE_DEPENDENCY_CYCLE');for(const j of p.candidates[i].depends_on)visit(j,[...path,i]);};p.candidates.forEach((_,i)=>visit(i));
 return p;
}
export const taskContracts={
 pre:'你是人物认知与意图整理层。只返回JSON：{intent:{mode:"chat|proposal|command|claim|unsupported|clarify",purpose:"目的",means:[],joint_conditions:[],unresolved:[]},focus_refs:[],agenda:{mode:"keep|update",priorities:[],basis:[]},guidance:[{kind:"performance|fact",text:"简短表达指导",refs:[]}]}。竖线表示可选枚举，不照抄。fact指导与事实判断引用known中的ref；performance仅表达语气动作，refs可为空。keep须原样保留原agenda的priorities和basis。可保持原诉求，不必每轮变化。不作授权，不产生执行结果。不把其他人说过的话证明为事实。复合提案保留各方条件，不替其他人同意。',
 prose:'输出以当前人物为重点的完整中文叙事片段，将场景、可观察动作、神态和自然对白连贯写在一起，保留自然段，不输出JSON或幕后指导，不替乔弗里说话，不替其他人物新增承诺。可以描写在场者已经成立的可见反应，不编造其内心或新的决定。承接本人实际获知资料。人物可以质疑、拒绝或说谎；声称已经办妥不能在叙述中变成客观完成。不要讲程序字段和玩法规则。',
 post:'你是对话解释层，只返回JSON：{consistent:true,summary:"简短本轮记录，区分声称和实际",decisions:[{kind:"reform_execution|safe_conduct|reconciliation|advice|return_intent|appointment|guard_command|permanent_transfer|leave_kingsguard|return_kingsguard|temporary_detail|temporary_authority|tunnel_disclosure",target_ref:"已知targets中的ref",choice:"accept|conditional|refuse|defer",conditions:[],quote:"NPC原文",refs:["known中的依据ref"]}],experiences:[{kind:"promise|claim|relationship|request",text:"经历，不设分数",quote:"原文",speaker:"player|npc"}],candidates:[{action:{type:"允许动作及必填参数"},quote:"原文",speaker:"player|npc",conditions:[],depends_on:[],joint_group:""}]}。无对应内容用空数组。depends_on是本次候选数组索引。候选参数必须与原话一致；支持连续原句或完整分句数组，不省略条件。过去时声称记claim，未支持的构想记讨论。只解释当前人物的决定。正文自相矛盾或把未执行写成客观完成则consistent:false。不要为使程序通过而更改正文含义。'
};
const roleBoundary='按本局已知经历扮演，不把原著未来当成已经发生。人物可以偏执、冲动、误判或带有偏见；不要为了得到可执行方案，把所有人整理成同一种冷静官员。语言样本只供表达参考，不是已知来源、当前发言或待兑现承诺。';
taskContracts.pre+=' 自由改革按目标、范围和真实条件理解，不按名称拒绝；重要缺项提出澄清，已有记录用于回答进度询问。';
taskContracts.post+=' '+reformInstructions+' '+reformExtraInstructions+' '+supportInstructions;
taskContracts.post+=' '+mechContract;
taskContracts.prose+=' 玩家只提方向而未报人数或预算时，也应给出可审阅报价。known中的reform_quotation是规则核对的具体报价，适合本人的建议时应完整报出text中的范围、费用、分期，再交给玩家选择；不能说已获批准。Post可从这段NPC报价生成speaker:npc的reform_propose，plan逐字复用quotation.plan。不能把玩家未报数字作为拒绝生成提案的理由；独立分项仍须明确同意。';
taskContracts.prose+=' 对改革提出可供国王批准的具体范围、负责人、预算、人数及预期变化；多分项分别命名并说明各项费用、效果。估计不当作已实现成果。以十五世纪本地基础按实际功能评估，不按现代名字直接判定。正常经济改革准备、执行、初效合计约21日，略超前30—60日，中等但理由充分75—90日；实际人事交接3—7日，实力改善14—90日，基础轮训需28有效日；缺基础可长期准备但要说明瓶颈。已知资料中的可结算财源、机构和部队岗位才承诺程序效果，其他部分保留待议，不能假装时代惩罚。按本人身份、利益和已知进度回应询问；不替他人接受。';
taskContracts.pre+=' '+roleBoundary+' '+characterContract;
taskContracts.prose+=' '+roleBoundary;
taskContracts.post+=' 仅依据本轮实际原话解释；性格与语言样本不是事实证据，不从样本提取承诺或行动，也不替人物纠正政治态度。';
export function phaseInput(c,pre,prose,phase){
 const historyKinds=new Set(['long_summary','heard_summary','recalled_summary','heard_dialogue']);
 const needed=new Set([...(pre?.focus_refs||[]),...(pre?.guidance||[]).flatMap(x=>x.refs),...(pre?.agenda?.basis||[])]);
 const known=c.known.filter(k=>!historyKinds.has(k.kind)||(phase==='post'&&needed.has(k.ref)));
 const rows=kind=>phase==='post'?[]:c.known.filter(k=>k.kind===kind).map(k=>JSON.stringify(k));
 return {user:'乔弗里',char:profiles[c.actor].name,personality:(phase==='post'?(c.personality.core??c.personality.text):c.personality.text)+(phase==='post'?'':characterText(c,pre?.character)),scenario:`${c.place||"红堡"}；活动${c.activity}第${c.node+1}节点。实际听众：${c.audience.map(p=>profiles[p]?.name||(p==='U001'?'乔弗里':'在场旁听者')).join('、')}`,
 known:JSON.stringify({actor:c.actor,at:c.at,...(phase==='pre'?{character:c.character}:{}),known,targets:c.targets,agenda:c.agenda,mechanisms:phase==='prose'?undefined:Object.fromEntries(Object.keys(c.mechanisms||{}).map(k=>[k,actionParameters[k]])),campaign_operations:phase==='prose'?undefined:c.campaign_operations}),
 guidance:[phase==='pre'?'':formatGuidance(pre),phase==='prose'&&c.escorts?.length?'当场近卫（可按原著中的身手作定性保护描写，只描写可见举止；不推定其内心或秘密。既定事件结果优先，不凭叙述认定死亡、重伤或拘押）：'+JSON.stringify(c.escorts):'',c.daily?'本次起居餐叙与已经亲耳听见的发言：'+JSON.stringify(c.daily)+'。只替当前人物回应，也可以保持沉默，以可见动作表达；近卫是听众，未点名无需插话。':'',c.event?(phase==='post'?c.event.prompts.post:c.event.prompts.scene+'\n'+JSON.stringify({scene:c.event.scene,staging:c.event.staging,interaction:c.event.interaction})): '',c.meeting?councilPrompt[phase]+'\n当前会议：'+JSON.stringify(c.meeting):''].filter(Boolean).join('\n'),input:phase==='post'?JSON.stringify({player:c.input,npc:prose}):c.input,latest:rows('heard_dialogue').join('\n'),previous:rows('long_summary'),recent:rows('heard_summary'),recalled:rows('recalled_summary')};}

// A critical scene may need an already-authored attitude selected, without inventing a meeting.
export function buildCharacterReview(g,actor){
 initializeDialogue(g);const p=profiles[actor],known=actorEvidence(g,actor);
 return {version:2,actor,branch:g.revision.branch_id,world:g.revision.state_id,at:g.clock.elapsed_minutes,known,
 personality:{text:profileVoice(p),core:p.personality,version:p.version,source:p.source},character:characterMaterials(g,actor,known)};
}

export function formatGuidance(pre){if(!pre)return '';return ['本轮意图：'+pre.intent.purpose,'当前关注：'+(pre.agenda?.priorities||[]).join('；'),'表达指导：'+pre.guidance.map(x=>x.text).join('；'),'尚待明确：'+[...(pre.intent.joint_conditions||[]),...(pre.intent.unresolved||[])].join('；')].join('\n');}
export function dialogueContract(phase,c){let result=taskContracts[phase];if(phase!=='post')return result;if(c.actor==='P004'&&c.targets.some(t=>t.kind==='tunnel_lead'))result+=' 瓦里斯只有明确交付真实可核查路线才可记录tunnel_disclosure/accept，目标RK-AEGON；仍须实地核查，虚假、未交付或附条件不算接受。';if(c.actor==='P011'&&c.targets.some(t=>t.kind==='barristan_audience'))result+=' 巴利斯坦面谈分别记录safe_conduct安全、reconciliation谅解、advice意见、return_intent回归意向，目标BARRISTAN-AUDIENCE；回归不等于白袍复职。';return result;}

// Validate independent result groups without sacrificing a saved narrative.
export function normalizePost(g,c,result,prose){
 exact(result,['consistent','summary','decisions','experiences','candidates',...(Object.hasOwn(result,'mech_deltas')?['mech_deltas']:[])]);
 ensure(result.consistent===true,'DIALOGUE_CONTRADICTION');ensure(typeof result.summary==='string'&&result.summary.length>0&&result.summary.length<=3000,'INVALID_DIALOGUE_TEXT');
 ensure(Array.isArray(result.decisions)&&result.decisions.length<=10&&Array.isArray(result.experiences)&&result.experiences.length<=15&&Array.isArray(result.candidates)&&result.candidates.length<=10,'INVALID_DIALOGUE_LIST');
 const post={consistent:true,summary:result.summary,decisions:[],experiences:[],candidates:[]},issues=[];
 if(Object.hasOwn(result,'mech_deltas')){
  post.mech_deltas=[];
  try{checkMechDeltas(g,c,result.mech_deltas,prose);ensure(!result.mech_deltas.length||readMech(g,c.actor).revision===mechRevision(c),'MECH_STALE_CONTEXT');post.mech_deltas=copy(result.mech_deltas);}catch(e){issues.push({group:'mech_deltas',reason:e.message});}
 }
 for(const type of ['decisions','experiences'])for(const [i,row]of result[type].entries())try{checkPost(g,c,{...post,[type]:[...post[type],row],candidates:[]},prose);post[type].push(row);}catch(e){issues.push({group:type+':'+i,reason:e.message});}
 const blocked=new Set();
 result.candidates.forEach((row,i)=>{try{checkPost(g,c,{consistent:true,summary:result.summary,decisions:[],experiences:[],candidates:[{...row,depends_on:[]}]},prose);ensure(Array.isArray(row.depends_on)&&row.depends_on.every(j=>Number.isInteger(j)&&j>=0&&j<result.candidates.length&&j!==i),'INVALID_DEPENDENCY');}catch(e){blocked.add(i);issues.push({group:'candidate:'+i,reason:e.message});}});
 const cyclic=(i,path=[])=>!blocked.has(i)&&(path.includes(i)||result.candidates[i].depends_on.some(j=>cyclic(j,[...path,i])));
 const cycles=result.candidates.map((_,i)=>i).filter(i=>cyclic(i));for(const i of cycles){blocked.add(i);issues.push({group:'candidate:'+i,reason:'CANDIDATE_DEPENDENCY_CYCLE'});}
 let changed=true;while(changed){changed=false;result.candidates.forEach((row,i)=>{if(!blocked.has(i)&&((row.depends_on||[]).some(j=>blocked.has(j))||(row.joint_group&&result.candidates.some((p,j)=>p?.joint_group===row.joint_group&&blocked.has(j))))){blocked.add(i);issues.push({group:'candidate:'+i,reason:'DEPENDENT_GROUP_WAITING'});changed=true;}});}
 const indexes=result.candidates.map((_,i)=>i).filter(i=>!blocked.has(i));post.candidates=indexes.map(i=>({...result.candidates[i],depends_on:result.candidates[i].depends_on.map(j=>indexes.indexOf(j))}));
 try{checkPost(g,c,post,prose);}catch(e){issues.push({group:'candidates',reason:e.message});post.candidates=[];}
 return {post,issues};
}
