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
import {issues,councilPrompt} from './opening-content.mjs';
export {profiles};
const copy=v=>structuredClone(v), same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function ensure(v,code){if(!v)throw Error(code);}
export function exact(v,keys){ensure(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|'),'DIALOGUE_INVALID_FIELDS');}
const text=(v,max=250000)=>typeof v==='string'&&v.length>0&&v.length<=max;
const list=(v,max=50)=>Array.isArray(v)&&v.length<=max;
export function initializeDialogue(g){g.dialogue??={version:1,presence:[],observations:[],turns:[],agendas:{},proposals:[],bindings:[],requests:[]};}
export const mechanismFields={
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
export function checkAction(a){ensure(a&&Object.hasOwn(mechanismFields,a.type),'MECHANIC_UNIMPLEMENTED');exact(a,['type',...mechanismFields[a.type]]);return a;}
export function target(g,ref){
 if(ref==='RK-AEGON'&&g.opening?.navigation)return {ref,kind:'tunnel_lead',scope:'红堡至伊耿高丘旧通道的线索披露；并非已经核实通行'};
 if(ref==='BARRISTAN-AUDIENCE'&&g.opening?.visits.some(v=>v.scene==='barristan'))return {ref,kind:'barristan_audience',scope:'本次面谈：安全、谅解、意见或回归意向；不授予白袍'};
 const plan=g.politics.guard_plans.find(x=>x.id===ref);
 if(plan)return {ref,kind:'guard_plan',count:plan.count,commander:plan.commander,posts:plan.posts,organization_ref:plan.organization_ref};
 const office=g.offices.find(x=>x.id===ref);if(office)return {ref,kind:'appointment',title:office.title,holder:office.holder,status:office.status};
 const auth=g.authorities.find(x=>x.id===ref);if(auth)return {ref,kind:'authority',issuer:auth.issuer,subject:auth.subject,object_ref:auth.object_ref,scope:copy(auth.scope),status:auth.status,starts_at:auth.starts_at,expires_at:auth.expires_at};
 const req=g.dialogue?.requests.find(x=>x.id===ref);if(req)return {ref,kind:'detail_request',count:req.count,end_at:req.end_at};
 return null;
}
export function audience(g,activity){synchronizeGuardPresence(g);const a=g.activities.find(x=>x.id===activity&&x.status==='active');ensure(a,'ACTIVITY_NOT_ACTIVE');const rows=g.dialogue.presence.filter(x=>x.activity_ref===activity&&x.present);return [...new Set(rows.map(x=>x.actor).filter(x=>a.participants.includes(x)))];}
export function observe(g,actors,content,source,targets=[]){if(!actors.length)return;g.dialogue.observations.push({id:'OBS-'+(++g.execution.serial),actors:[...new Set(actors)],at:g.clock.elapsed_minutes,content,source,targets:copy(targets)});}
export function actorEvidence(g,actor){
 const p=profiles[actor];ensure(p,'ACTOR_PROFILE_NOT_READY');const at=g.clock.elapsed_minutes;
 const known=p.initial.map((content,i)=>({ref:`seed:${actor}:${i}`,kind:'initial',content:'开局清晨的认知（后续已收到消息可以更新）：'+content,at:0,source:p.source}));
 known.push(...guardKnowledge(g,actor));
 if(actor==='P004'&&g.opening?.navigation)known.push({ref:'RK-AEGON-AUTHOR',kind:'private_knowledge',content:'你知道一条红堡通往伊耿高丘的旧通道，单程约一刻钟。可以隐瞒、提出交换、拒绝，或透露可供实地核查的路线。路线存在属于本卡设计；国王尚不因你知晓而自动知晓。',at:0,source:'本卡地图剧情'});
 for(const m of g.messages.filter(m=>m.recipient===actor&&m.status==='已收到'&&m.delivered_minute<=at))known.push({ref:m.id,kind:'report',content:m.content,at:m.delivered_minute,source:m.sender});
 if(g.campaign){const a=g.actors.find(a=>a.id===actor);known.push({ref:'self-current:'+actor,kind:'own_status',content:'你当前的实际身份：'+a.roles.join('、')+'；所任职位：'+g.offices.filter(x=>x.holder===actor&&x.status==='在任').map(x=>x.title).join('、')+'；所在地：'+a.location+'。本人婚约：'+g.commitments.filter(x=>x.parties.includes(actor)).map(x=>x.terms+'（'+x.status+'）').join('；'),at,source:'本人现状'});}
 // Message fact_refs are intentionally NOT dereferenced. Reports retain their own words.
 for(const o of g.orders.filter(o=>o.recipient===actor&&o.delivered_minute!==null&&o.delivered_minute<=at))known.push({ref:o.id,kind:'received_order',content:`收到命令：${o.action}；${o.execution_condition}`,at:o.delivered_minute,source:o.issuer});
 for(const o of g.dialogue.observations.filter(o=>o.source!=='court-duty-change'&&o.actors.includes(actor)&&o.at<=at))known.push({ref:o.id,kind:'observation',content:o.content,at:o.at,source:o.source,targets:copy(o.targets)});
 for(const m of g.opening?.meetings||[])if(m.status==='in_progress'&&m.session&&m.session.version!==3)for(const t of m.session.turns.filter(t=>t.context.audience.includes(actor)))known.push({ref:'meeting:'+t.id,kind:'council_dialogue',content:(t.context.utterance_origin==='chair'?'':'乔弗里：'+t.context.input+'\n')+profiles[t.context.actor].name+'：'+t.prose,at:t.context.at,source:t.context.actor});
 const visible=g.dialogue.turns.filter(t=>t.audience.includes(actor)&&t.at<=at);
 // Full original remains in save. Only last visible exchange is sent as full history.
 for(const t of visible)for(const [i,e]of t.post.experiences.entries())if(e.kind==='promise'||t.actor===actor)known.push({ref:t.id+':experience:'+i,kind:e.kind,content:e.text,at:t.at,source:t.actor});
 return known;
}
export function buildContext(g,actor,activity,input,retrieved=[]){
 initializeDialogue(g);ensure(text(input,30000),'EMPTY_DIALOGUE_INPUT');const listeners=audience(g,activity);
 ensure(listeners.includes('U001')&&listeners.includes(actor)&&profiles[actor]&&g.actors.some(x=>x.id===actor&&x.life==='存活'),'ACTOR_NOT_PRESENT');
 const a=g.activities.find(x=>x.id===activity),p=profiles[actor],known=actorEvidence(g,actor);
 const memory=memoryMaterials(g,actor,retrieved);
 known.push(...memory.long,...memory.recent,...memory.recalled);if(memory.latest)known.push(memory.latest);
 known.push({ref:'current-input',kind:'heard_claim',content:input,at:g.clock.elapsed_minutes,source:'U001'});
 const latestTargets=new Map();for(const k of known)for(const t of k.targets||[])latestTargets.set(t.ref,t);
 if(actor==='P004'&&g.opening?.navigation)latestTargets.set('RK-AEGON',target(g,'RK-AEGON'));
 const targets=[...latestTargets.values()];
 return {version:1,branch:g.revision.branch_id,world:g.revision.state_id,at:g.clock.elapsed_minutes,actor,activity,node:a.node,audience:listeners,
  personality:{text:profileVoice(p),core:p.personality,version:p.version,source:p.source},character:characterMaterials(g,actor,known),known,targets,retrieved:copy(retrieved),
  agenda:{priorities:copy(g.dialogue.agendas[actor]?.priorities||p.priorities),basis:copy(g.dialogue.agendas[actor]?.basis||[])},input,
  ...(g.opening?{place:a.location,meeting:g.opening.meetings.filter(m=>m.activity===activity&&m.status==='in_progress').map(m=>({id:m.id,current:m.current,title:(campaignIssue(g,m.current)||issues[m.current])?.title||'',question:(campaignIssue(g,m.current)||issues[m.current])?.question||'',choices:(campaignIssue(g,m.current)||issues[m.current])?.choices||[]}))[0]||null}:{}),
  ...(g.campaign?{campaign_operations:campaignAllowed(g).map(id=>({id,label:operations[id].label,cost_basis:operations[id].cost,minimum_days:operations[id].days}))}:{}),
  ...(household(g)?{escorts:guardMaterials(g),daily:dailyForActivity(g,activity)?{id:dailyForActivity(g,activity).id,definition:dailyForActivity(g,activity).definition,topic:dailyForActivity(g,activity).queue?.input||'',previous:g.dialogue.turns.filter(t=>t.activity===activity&&t.audience.includes(actor)).slice(-8).map(t=>({actor:t.actor,prose:t.prose}))}:null}:{}),
  event:eventDialogueMaterial(g,actor),mechanisms:copy(g.campaign?mechanismFields:Object.fromEntries(Object.entries(mechanismFields).filter(([k])=>k!=='campaign_issue')))};
}
const cited=(refs,c)=>list(refs)&&refs.length>0&&new Set(refs).size===refs.length&&refs.every(r=>c.known.some(k=>k.ref===r));
export function checkPre(c,p){
 exact(p,['intent','focus_refs','agenda','guidance',...(Object.hasOwn(p,'character')?['character']:[]),...(Object.hasOwn(p,'staging_mood')?['staging_mood']:[])]);checkCharacter(c,p.character);exact(p.intent,['mode','purpose','means','joint_conditions','unresolved']);
 ensure(['chat','proposal','command','claim','unsupported','clarify'].includes(p.intent.mode)&&text(p.intent.purpose,3000),'INVALID_INTENT');
 for(const k of ['means','joint_conditions','unresolved'])ensure(list(p.intent[k])&&p.intent[k].every(x=>text(x,3000)),'INVALID_INTENT');
 ensure(list(p.focus_refs)&&p.focus_refs.every(r=>c.known.some(k=>k.ref===r)),'UNKNOWN_EVIDENCE');
 exact(p.agenda,['mode','priorities','basis']);ensure(['keep','update'].includes(p.agenda.mode)&&list(p.agenda.priorities,8)&&p.agenda.priorities.length&&p.agenda.priorities.every(x=>text(x,1000)),'INVALID_AGENDA');
 if(p.agenda.mode==='keep')ensure(same(p.agenda.priorities,c.agenda.priorities)&&same(p.agenda.basis,c.agenda.basis),'AGENDA_CHANGED_WITH_KEEP');else ensure(cited(p.agenda.basis,c),'UNKNOWN_EVIDENCE');
 ensure(list(p.guidance,12),'INVALID_GUIDANCE');for(const r of p.guidance){exact(r,['text','refs']);ensure(text(r.text,2000)&&cited(r.refs,c),'UNKNOWN_EVIDENCE');}
 // Only retained to read a previous frozen request; current contracts and vector
 // retrieval neither request nor consume this former optional field.
 if(p.staging_mood){
  exact(p.staging_mood,['value','refs']);
  ensure(['neutral','warm','amused','tense','angry','fearful','sad'].includes(p.staging_mood.value),'INVALID_STAGING_MOOD');
  ensure(p.staging_mood.value==='neutral'&&Array.isArray(p.staging_mood.refs)&&!p.staging_mood.refs.length||cited(p.staging_mood.refs,c),'UNKNOWN_EVIDENCE');
 }
 return p;
}
export function decisionTarget(g,c,d){
 const current=target(g,d.target_ref),seen=c.targets.find(t=>t.ref===d.target_ref);
 ensure(current&&seen&&same(current,seen),'DECISION_TARGET_CHANGED');
 const allowed={tunnel_disclosure:c.actor==='P004'&&current.kind==='tunnel_lead',safe_conduct:c.actor==='P011'&&current.kind==='barristan_audience',reconciliation:c.actor==='P011'&&current.kind==='barristan_audience',advice:c.actor==='P011'&&current.kind==='barristan_audience',return_intent:c.actor==='P011'&&current.kind==='barristan_audience',appointment:current.kind==='appointment'&&current.holder===c.actor,
  guard_command:c.actor==='P016'&&current.kind==='guard_plan',permanent_transfer:c.actor==='P020'&&current.kind==='guard_plan',
  leave_kingsguard:c.actor==='P016'&&current.kind==='guard_plan',return_kingsguard:c.actor==='P011'&&current.kind==='guard_plan',temporary_detail:c.actor==='P016'&&current.kind==='authority'&&current.issuer==='P001',
  temporary_authority:c.actor==='P001'&&current.kind==='detail_request'};
 ensure(allowed[d.kind],'DECISION_OUTSIDE_AUTHORITY');return current;
}
export function checkPost(g,c,p,prose){
 exact(p,['consistent','summary','decisions','experiences','candidates']);ensure(p.consistent===true,'DIALOGUE_CONTRADICTION');ensure(text(prose)&&text(p.summary,3000),'INVALID_DIALOGUE_TEXT');
 const quote=(q,who)=>!(who==='player'&&c.utterance_origin==='chair')&&text(q,10000)&&(who==='player'?c.input:prose).includes(q);
 ensure(list(p.decisions,10)&&list(p.experiences,15)&&list(p.candidates,10),'INVALID_DIALOGUE_LIST');
 const seen=new Set();for(const d of p.decisions){exact(d,['kind','target_ref','choice','conditions','quote','refs']);ensure(['accept','conditional','refuse','defer'].includes(d.choice)&&list(d.conditions)&&d.conditions.every(x=>text(x,2000))&&quote(d.quote,'npc')&&cited(d.refs,c),'INVALID_DECISION_EVIDENCE');
  ensure(!seen.has(d.kind+'|'+d.target_ref),'DUPLICATE_DECISION');seen.add(d.kind+'|'+d.target_ref);decisionTarget(g,c,d);
  if(d.choice==='accept')ensure(!d.conditions.length&&!/(不同意|不接受|不答应|不能答应|不会接受|除非|条件是|先.{0,12}再)/.test(d.quote),'CONDITIONAL_NOT_ACCEPTED');
  if(d.choice==='conditional')ensure(d.conditions.length,'CONDITIONS_MISSING');
 }
 for(const e of p.experiences){exact(e,['kind','text','quote','speaker']);ensure(['promise','claim','relationship','request'].includes(e.kind)&&['player','npc'].includes(e.speaker)&&text(e.text,2000)&&quote(e.quote,e.speaker),'INVALID_EXPERIENCE');}
 for(const a of p.candidates){exact(a,['action','quote','speaker','conditions','depends_on','joint_group']);checkAction(a.action);ensure(['player','npc'].includes(a.speaker)&&quote(a.quote,a.speaker)&&list(a.conditions)&&a.conditions.every(x=>text(x,2000))&&list(a.depends_on)&&a.depends_on.every(i=>Number.isSafeInteger(i)&&i>=0&&i<p.candidates.length&&i!==p.candidates.indexOf(a))&&typeof a.joint_group==='string','INVALID_ACTION_EVIDENCE');}
 // Reject cycles; a joint exchange cannot be reduced to an independent partial grant.
 const visit=(i,path=[])=>{ensure(!path.includes(i),'CANDIDATE_DEPENDENCY_CYCLE');for(const j of p.candidates[i].depends_on)visit(j,[...path,i]);};p.candidates.forEach((_,i)=>visit(i));
 return p;
}
export const taskContracts={
 pre:'你是人物认知与意图整理层。只返回JSON：{intent:{mode:"chat|proposal|command|claim|unsupported|clarify",purpose:"目的",means:[],joint_conditions:[],unresolved:[]},focus_refs:[],agenda:{mode:"keep|update",priorities:[],basis:[]},guidance:[{text:"简短表达指导",refs:["已知ref"]}]}。竖线表示可选枚举，不照抄。只引用资料包known中的ref。keep须原样保留原agenda的priorities和basis。可保持原诉求，不必每轮变化。不作授权，不产生执行结果。不把其他人说过的话证明为事实。复合提案保留各方条件，不替其他人同意。',
 prose:'输出以当前人物为重点的完整中文叙事片段，将场景、可观察动作、神态和自然对白连贯写在一起，保留自然段，不输出JSON或幕后指导，不替乔弗里说话，不替其他人物新增承诺。可以描写在场者已经成立的可见反应，不编造其内心或新的决定。承接本人实际获知资料。人物可以质疑、拒绝或说谎；声称已经办妥不能在叙述中变成客观完成。不要讲程序字段和玩法规则。',
 post:'你是对话解释层，只返回JSON：{consistent:true,summary:"简短本轮记录，区分声称和实际",decisions:[{kind:"safe_conduct|reconciliation|advice|return_intent|appointment|guard_command|permanent_transfer|leave_kingsguard|return_kingsguard|temporary_detail|temporary_authority|tunnel_disclosure",target_ref:"已知targets中的ref",choice:"accept|conditional|refuse|defer",conditions:[],quote:"NPC原文",refs:["known中的依据ref"]}],experiences:[{kind:"promise|claim|relationship|request",text:"经历，不设分数",quote:"原文",speaker:"player|npc"}],candidates:[{action:{type:"允许动作及必填参数"},quote:"原文",speaker:"player|npc",conditions:[],depends_on:[],joint_group:""}]}。无对应内容用空数组。depends_on是本次候选数组索引。nav_inspect_tunnel只可委托核查，source为guard或varys；瓦里斯明确提供与本人资料一致的可核查路线时，记录tunnel_disclosure，target_ref为RK-AEGON；只谈通道存在、拒绝、附条件尚未交付或故意提供虚假路线时不能记录accept。真实披露也须实地核查，不能直接成为可用出口。只有已有机制才能形成candidate，未支持方案只记讨论。巴利斯坦面谈用safe_conduct（安全保证）、reconciliation（谅解）、advice（提供意见）、return_intent（愿意返回君临）分别判断，可只回答部分，目标为BARRISTAN-AUDIENCE；回归意向不等于白袍复职。接受带兵不等于退出白袍。附条件不能标accept。只解释当前人物，不替他人接受。必须逐字引用原句；过去时声称只记claim，不生成付款等补执行。正文自相矛盾或把未执行写成客观完成则consistent:false。不要为使程序通过而更改正文含义。'
};
const roleBoundary='按本局已知经历扮演，不把原著未来当成已经发生。人物可以偏执、冲动、误判或带有偏见；不要为了得到可执行方案，把所有人整理成同一种冷静官员。语言样本只供表达参考，不是已知来源、当前发言或待兑现承诺。';
taskContracts.pre+=' '+roleBoundary+' '+characterContract;
taskContracts.prose+=' '+roleBoundary;
taskContracts.post+=' 仅依据本轮实际原话解释；性格与语言样本不是事实证据，不从样本提取承诺或行动，也不替人物纠正政治态度。';
export function phaseInput(c,pre,prose,phase){
 const historyKinds=new Set(['long_summary','heard_summary','recalled_summary','heard_dialogue']);
 const needed=new Set([...(pre?.focus_refs||[]),...(pre?.guidance||[]).flatMap(x=>x.refs),...(pre?.agenda?.basis||[])]);
 const known=c.known.filter(k=>!historyKinds.has(k.kind)||(phase==='post'&&needed.has(k.ref)));
 const rows=kind=>phase==='post'?[]:c.known.filter(k=>k.kind===kind).map(k=>JSON.stringify(k));
 return {user:'乔弗里',char:profiles[c.actor].name,personality:(phase==='post'?(c.personality.core??c.personality.text):c.personality.text)+(phase==='post'?'':characterText(c,pre?.character)),scenario:`${c.place||"红堡"}；活动${c.activity}第${c.node+1}节点。实际听众：${c.audience.map(p=>profiles[p]?.name||(p==='U001'?'乔弗里':'在场旁听者')).join('、')}`,
 known:JSON.stringify({actor:c.actor,at:c.at,...(phase==='pre'?{character:c.character}:{}),known,targets:c.targets,agenda:c.agenda,mechanisms:phase==='prose'?undefined:c.mechanisms,campaign_operations:phase==='prose'?undefined:c.campaign_operations}),
 guidance:[phase==='pre'?'':JSON.stringify(pre),phase==='prose'&&c.escorts?.length?'当场近卫（可按原著中的身手作定性保护描写，只描写可见举止；不推定其内心或秘密。既定事件结果优先，不凭叙述认定死亡、重伤或拘押）：'+JSON.stringify(c.escorts):'',c.daily?'本次起居餐叙与已经亲耳听见的发言：'+JSON.stringify(c.daily)+'。只替当前人物回应，也可以保持沉默，以可见动作表达；近卫是听众，未点名无需插话。':'',c.event?(phase==='post'?c.event.prompts.post:c.event.prompts.scene+'\n'+JSON.stringify({scene:c.event.scene,staging:c.event.staging,interaction:c.event.interaction})): '',c.meeting?councilPrompt[phase]+'\n当前会议：'+JSON.stringify(c.meeting):''].filter(Boolean).join('\n'),input:phase==='post'?JSON.stringify({player:c.input,npc:prose}):c.input,latest:rows('heard_dialogue').join('\n'),previous:rows('long_summary'),recent:rows('heard_summary'),recalled:rows('recalled_summary')};}

// A critical scene may need an already-authored attitude selected, without inventing a meeting.
export function buildCharacterReview(g,actor){
 initializeDialogue(g);const p=profiles[actor],known=actorEvidence(g,actor);
 return {actor,branch:g.revision.branch_id,world:g.revision.state_id,at:g.clock.elapsed_minutes,known,
 personality:{text:profileVoice(p),core:p.personality,version:p.version,source:p.source},character:characterMaterials(g,actor,known)};
}
