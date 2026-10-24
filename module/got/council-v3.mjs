import {bindingQuoteMatches,quoteMatches,checkActionEvidence} from './middleware-evidence.mjs';
import {authoredIssue} from './authored-council.mjs';
import {attachCardAgenda,eventCardProposals} from './event-cards.mjs';
import {eventCardData} from './event-cards-data.mjs';
import {saveCharacter} from './character-state.mjs';
// Meeting orchestration only. World actions still commit through council-session.
import {issues,councilReport} from './opening-content.mjs';
import {campaignIssue,campaignReport} from './campaign-engine.mjs';
import {audience,observe,profiles,buildContext,checkPre,checkPost,checkAction,exact,ensure} from './dialogue-core.mjs';
import {RuleError} from './world-engine.mjs';
const clone=x=>structuredClone(x),def=(g,id)=>campaignIssue(g,id)||issues[id];
export const topicOf=m=>m.session.agenda.find(q=>q.id===m.current);
const need=(v,message)=>{if(!v)throw new RuleError(message);};
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=6000;
export function startCouncilV3(g,m,authored=false){
 attachCardAgenda(g,m);
 const order=Object.keys(m.issues).filter(id=>m.week!==1||id!=='compensation');
 m.session={version:3,middleware_version:2,authored,phase:'reports',index:0,order,choices:[],turns:[],approvals:{},minutes:[],started:g.clock.elapsed_minutes,
  agenda:order.map(id=>{const d=def(g,id);return {id,origin:id,definition:d.implementation?clone(d):null,title:d.title,problem:d.question||d.title,approach:'听取席间建议，再决定具体办法',owner:null,revision:1,confirmed:false,presenters:d.presenters||[d.presenter],proposals:[],resolution:null,summary:null};}),
  entries:[],work:null,queue:[],round:0,input:null,serial:0,selectionMenu:false,returnPhase:null};
 report(g,m);
}
function entry(g,m,speaker,content,kind='speech'){
 const s=m.session,id=m.id+':entry:'+(++s.serial),listeners=audience(g,m.activity);
 s.entries.push({id,issue:m.current,speaker,content,kind,audience:listeners,at:g.clock.elapsed_minutes});
 observe(g,listeners,(profiles[speaker]?.name|| (speaker==='U001'?'乔弗里':'书记'))+'：'+content,id);
 return id;
}
function report(g,m){const s=m.session;m.current=s.order[s.index];m.issues[m.current].reported=true;
 const q=topicOf(m),who=audience(g,m.activity),d=def(g,m.current);
 entry(g,m,(q.presenters||[]).find(p=>who.includes(p))||'clerk',campaignIssue(g,m.current)?campaignReport(g,m,who):councilReport(m.current,who),'report');
}
function speakers(g,m,target=null){
 const q=topicOf(m),who=audience(g,m.activity),d=def(g,q.origin),category=d?.category||'';
 const related=q.origin==='pursuit'?['P004','P020','P018','P016']:q.origin==='theft'?['P018','P020','P005']:q.origin==='remains'?['P018','P004']: /财政|finance/.test(category)?['P005','P003']: /军事|military/.test(category)?['P020','P016','P003']:['P004','P005','P018'];
 return [...new Set([target,...q.presenters,...related])].filter(id=>id&&profiles[id]&&who.includes(id)&&(id!=='P012'||id===target));
}
function work(m,kind,actor=null){m.session.work={id:m.id+':work:'+(++m.session.serial),kind,actor,issue:m.current,revision:topicOf(m)?.revision||0};if(kind==='speech'&&m.session.inputForNext){m.session.work.playerInput=m.session.inputForNext;m.session.inputForNext=null;}}
function nextSpeaker(m){const s=m.session;if(s.queue.length){work(m,'speech',s.queue.shift());s.phase='speaking';}else{s.work=null;s.phase='decision';}}
function beginRound(g,m,target=null){const s=m.session,q=topicOf(m);s.input=null;s.selectionMenu=false;s.round++;s.queue=speakers(g,m,target);nextSpeaker(m);}
function beginTopic(g,m){const s=m.session;while(s.agenda[s.index]?.summary)s.index++;s.lastInput='';m.current=s.agenda[s.index]?.id;
 if(!m.current){s.phase='ready';s.work=null;return;}
 const q=topicOf(m);entry(g,m,q.presenters.find(id=>audience(g,m.activity).includes(id))||'clerk','现在议'+q.title+'。'+q.problem+' 初步方向：'+q.approach+'。'+(q.owner?'拟由'+(profiles[q.owner]?.name||q.owner)+'负责。':'负责人由本次讨论决定。'),'recap');
 q.execution_basis=clone(def(g,q.origin)?.execution_basis||null);
 const preset=s.authored?authoredIssue(g,m,q,def(g,q.origin),audience(g,m.activity)):null;
 const proposals=eventCardProposals(g,m,q)||preset?.proposals;
 if(preset)entry(g,m,preset.actor,preset.prose,'authored-scene');
 if(proposals){
  for(const [i,p]of proposals.entries()){p.id=m.id+':authored:'+q.id+':'+q.revision+':'+i;q.proposals.push(p);if(!preset)entry(g,m,p.actor,p.summary,'proposal');}
  s.phase='decision';s.work=null;s.queue=[];
 }else beginRound(g,m);
}
export function councilV3Context(g,m,actor,input='',origin='chair'){
 const q=topicOf(m),view=clone(g);for(const e of m.session.entries.filter(e=>e.characterReview&&e.speaker===actor))saveCharacter(view,e.characterReview.context,e.characterReview.result,e.id);const c=buildContext(view,actor,m.activity,input||'请就当前已确认的议题表达意见。');
 c.version=m.session.middleware_version===2?2:1;c.utterance_origin=origin;
 if(origin!=='player')c.known=c.known.filter(x=>x.ref!=='current-input');
 c.meeting={id:m.id,current:m.current,title:q.title,question:q.problem,approach:q.approach,owner:q.owner,choices:def(g,q.origin)?.choices||[],resolution:q.resolution,phase:m.session.phase,...(q.definition?{authored_prompt:eventCardData.prompts.council}:{})};
 return c;
}
export function contextForCouncilWork(g,m){if(m.session.work?.context)return clone(m.session.work.context);const q=topicOf(m),w=m.session.work,who=audience(g,m.activity);return councilV3Context(g,m,w.actor||q.presenters.find(id=>who.includes(id)&&profiles[id])||who.find(id=>profiles[id]),w.playerInput||'',w.playerInput?'player':'chair');}
export function applyCouncilV3(g,m,a){
 const s=m.session,q=topicOf(m);
 const is=p=>need(s.phase===p,'会议已进入另一环节，请使用当前页面。');
 if(a.type==='council_v3_freeze'){
  need(s.work&&s.work.id===a.work_id,'STALE_COUNCIL_WORK');
  need(JSON.stringify(a.context)===JSON.stringify(contextForCouncilWork(g,m)),'STALE_DIALOGUE_CONTEXT');
  s.work.context=clone(a.context);return 'COUNCIL_CONTEXT_FROZEN';
 }
 if(a.type==='council_v3_extract'){
  const t=s.turns.find(t=>t.id===a.turn_id),topic=s.agenda.find(q=>q.id===t?.issue);
  need(t?.extraction&&a.branch===g.revision.branch_id&&topic?.revision===t.extraction.revision,'STALE_COUNCIL_EXTRACTION');
  if(t.extraction.status==='done')return 'EXTRACTION_ALREADY_SAVED';
  need(['running','ready','failed','done'].includes(a.status),'INVALID_EXTRACTION_STATUS');
  need(!/"(?:key|apiKey|authorization)"\s*:/i.test(JSON.stringify([a.snapshot,a.response])),'请求记录不可包含密钥。');
  if(a.status==='done'){
   need(Array.isArray(a.proposals)&&a.proposals.length<=8,'方案格式不完整。');t.extraction.issues=[];
   for(const [index,proposal]of a.proposals.entries())try{addProposals(g,m,topic,t,[proposal]);}catch(e){t.extraction.issues.push({index,reason:e.message});}
   t.request_records.push({snapshot:a.snapshot,response:a.response});
  }
  Object.assign(t.extraction,{status:a.status,snapshot:clone(a.snapshot),response:clone(a.response),error:a.error});return 'COUNCIL_EXTRACTION_SAVED';
 }
 if(a.type==='council_v3_read'){is('reports');s.index++;if(s.index<s.order.length)report(g,m);else{s.index=0;m.current=s.order[0];s.phase='agenda';}return 'REPORT_READ';}
 if(a.type==='council_v3_confirm_topic'){need(['agenda','topic_review'].includes(s.phase),'现在不是议题核对环节。');q.confirmed=true;s.input=null;s.index++;m.current=s.agenda[s.index]?.id||null;s.phase=m.current?'agenda':'agenda_ready';return 'TOPIC_CONFIRMED';}
 if(a.type==='council_v3_edit'){need(['agenda','topic_review','decision','clarify'].includes(s.phase),'现在不能修改。');s.input={kind:['agenda','topic_review'].includes(s.phase)?'topic':'discussion'};s.selectionMenu=false;return 'INPUT_OPENED';}
 if(a.type==='council_v3_add'){is('agenda_ready');const id=m.id+':extra:'+(++s.serial);s.agenda.push({id,origin:null,title:'补充议题',problem:'待国王说明',approach:'待讨论',owner:null,revision:1,confirmed:false,presenters:[],proposals:[],resolution:null,summary:null});s.order.push(id);m.issues[id]={reported:true,status:'pending',order_refs:[]};m.current=id;s.index=s.agenda.length-1;s.phase='agenda';s.input={kind:'topic'};return 'TOPIC_ADDED';}
 if(a.type==='council_v3_start'){is('agenda_ready');need(s.agenda.every(x=>x.confirmed),'尚有未确认议题。');s.index=0;beginTopic(g,m);return 'DISCUSSION_STARTED';}
 if(a.type==='council_v3_input'){
  need(s.input&&text(a.text),'请先选择修改或补充，并写下具体想法。');need(!a.actor||audience(g,m.activity).includes(a.actor),'此人不在场。');
  entry(g,m,'U001',a.text,'player');s.lastInput=a.text;s.input=null;
  if(['agenda','topic_review'].includes(s.phase)){work(m,'topic',speakers(g,m,a.actor)[0]||audience(g,m.activity).find(id=>profiles[id]));s.work.playerInput=a.text;s.phase='polishing';}
  else{q.proposals.forEach(p=>p.status='superseded');q.resolution=null;q.summary=null;q.revision++;s.choices=s.choices.filter(c=>c.issue!==q.id);for(const t of s.turns.filter(t=>t.issue===q.id))t.post=null;s.inputForNext=a.text;beginRound(g,m,a.actor);}
  return 'PLAYER_HEARD';
 }
 if(a.type==='council_v3_menu'){is('decision');s.selectionMenu=!s.selectionMenu;return 'PROPOSALS_SHOWN';}
 if(a.type==='council_v3_select'){
  is('decision');const p=q.proposals.find(p=>p.id===a.proposal&&p.status==='active');need(p,'该方案已撤回或不属于当前议题。');
  q.resolution=clone(p);s.selectionMenu=false;entry(g,m,'U001','就按这项办法：'+p.summary+(p.conditions.length?'；尚待条件：'+p.conditions.join('；'):''),'decision');
  if(p.choice&&!p.conditions.length)s.choices.push({issue:q.id,choice:p.choice});
  if(p.authored){
   q.summary=p.summary+(p.conditions.length?'；条件：'+p.conditions.join('；'):'')+'。裁决已记下，散会时发令。';
   q.summary_record={source:p.id,draft:q.summary,requests:[]};entry(g,m,'clerk',q.summary,'summary');s.index++;beginTopic(g,m);
  }else {work(m,'summary');s.phase='archiving';}return 'RESOLUTION_CHOSEN';
 }
 if(a.type==='council_v3_result'){
  need(s.work&&a.work_id===s.work.id,'这份回复已经失效。');const w=s.work;
  need(a.context&&JSON.stringify(a.context)===JSON.stringify(contextForCouncilWork(g,m)),'STALE_DIALOGUE_CONTEXT');
  need(Array.isArray(a.requests)&&!/["'](?:apiKey|authorization|key)["']\s*:/.test(JSON.stringify(a.requests)),'请求记录不可包含密钥。');
  const r=a.result;
  if(w.kind==='topic'){
   need(text(r.title)&&text(r.problem)&&text(r.approach)&&(r.owner===null||g.actors.some(x=>x.id===r.owner))&&text(r.reply),'议题缺少问题、方向或负责人。');
   q.title=r.title;q.problem=r.problem;q.approach=r.approach;q.owner=r.owner;q.revision++;
   if(!q.presenters.length)q.presenters=[w.actor];entry(g,m,w.actor,r.reply,'topic');s.phase='topic_review';s.work=null;
  }else if(w.kind==='speech'){
   need(typeof r.speak==='boolean','缺少发言或沉默判断。');checkPre(a.context,r.pre);
   if(r.speak){
    need(typeof r.prose==='string'&&r.prose.trim().length>0&&r.prose.length<=250000&&Array.isArray(r.proposals)&&r.proposals.length<=8,'人物回复或方案格式不完整。');
    const t={id:w.id,issue:q.id,context:clone(a.context),pre:clone(r.pre),prose:r.prose,request_records:clone(a.requests),settings:a.settings||null,post:null};s.turns.push(t);
    entry(g,m,w.actor,r.prose);
    addProposals(g,m,q,t,r.proposals);
    if(r.defer_extract)t.extraction={status:'pending',revision:q.revision,snapshot:null,response:null,error:null};
   }else{s.entries.push({id:w.id,issue:q.id,speaker:w.actor,kind:'silence',content:'没有补充意见。',audience:audience(g,m.activity),at:g.clock.elapsed_minutes});}
   s.entries.push({id:w.id+':character',issue:q.id,speaker:w.actor,kind:'character-review',content:'',audience:[],at:g.clock.elapsed_minutes,characterReview:{context:clone(a.context),result:clone(r.pre.character)}});
   nextSpeaker(m);
  }else if(w.kind==='summary'){
   need(typeof r.consistent==='boolean'&&text(r.summary)&&typeof r.question==='string','书记未能整理完整记录。');
   if(!r.consistent){s.phase='clarify';s.clarification=r.question||'请明确最终希望执行哪一项。';s.work=null;s.input={kind:'discussion'};}
   else{q.summary=q.resolution.summary+'。拟负责人：'+(q.resolution.owner?(profiles[q.resolution.owner]?.name||q.resolution.owner):'依原职权或待进一步明确')+'。'+(q.resolution.conditions.length?'尚待条件：'+q.resolution.conditions.join('；')+'。':'')+'记录已保存，尚未发令。';q.summary_record={source:w.id,draft:r.summary,requests:clone(a.requests)};entry(g,m,'clerk',q.summary,'summary');s.work=null;s.index++;beginTopic(g,m);}
  }else need(false,'未知的会议工作。');
  return 'COUNCIL_WORK_SAVED';
 }
 if(a.type==='council_v3_close'){is('ready');need(s.turns.every(t=>!t.extraction||t.extraction.status==='done'||s.agenda.find(q=>q.id===t.issue)?.revision!==t.extraction.revision),'书记尚有本题方案未整理，请先完成或明确撤回相关讨论。');need(s.agenda.every(q=>q.summary&&q.resolution),'尚有未归档议题。');s.phase='registering';return 'COUNCIL_CLOSING';}
 if(a.type==='council_v3_reopen'){
  need(['registering','review'].includes(s.phase),'现在不能回到已归档议题。');const index=s.agenda.findIndex(q=>q.id===a.issue);need(index>=0,'没有该议题。');
  s.index=index;m.current=a.issue;const selected=s.agenda[index];selected.summary=null;selected.resolution=null;selected.revision++;selected.proposals.forEach(p=>p.status='superseded');s.choices=s.choices.filter(c=>c.issue!==a.issue);for(const t of s.turns.filter(t=>t.issue===a.issue))t.post=null;s.phase='decision';s.input={kind:'discussion'};s.work=null;
  if(eventCardProposals(g,m,selected)||(s.authored&&def(g,selected.origin)?.choices?.length)){s.input=null;beginTopic(g,m);}return 'TOPIC_REOPENED';
 }
 return null;
}
export function validateCouncilV3(s){
 need(Array.isArray(s.agenda)&&s.agenda.length>0&&new Set(s.agenda.map(q=>q.id)).size===s.agenda.length,'会议议题记录不完整。');
 need(Array.isArray(s.entries)&&Array.isArray(s.queue)&&Number.isSafeInteger(s.serial),'会议进度记录不完整。');
 for(const q of s.agenda)need(text(q.title)&&text(q.problem)&&text(q.approach)&&Array.isArray(q.presenters)&&Array.isArray(q.proposals)&&Number.isSafeInteger(q.revision)&&typeof q.confirmed==='boolean','议题存档不完整。');
 need(s.phase!=='ready'||s.agenda.every(q=>q.summary&&q.resolution),'会议尚未归档。');
}

function addProposals(g,m,q,t,rows){
 need(Array.isArray(rows)&&rows.length<=8,'方案格式不完整。');
 for(const p of rows){
  const speaker=p.speaker||'npc',source=speaker==='npc'?t.prose:t.context.utterance_origin==='player'?t.context.input:'';
  need(text(p.summary)&&quoteMatches(source,p.quote)&&Array.isArray(p.conditions)&&p.conditions.every(text)&&(p.owner===null||g.actors.some(x=>x.id===p.owner)),'方案没有有效原句或责任人。');
  need(p.choice===null||def(g,q.origin)?.choices.some(c=>c[0]===p.choice),'方案引用了不存在的预设决定。');
  const actions=p.actions||[];need(Array.isArray(actions)&&actions.length<=10,'INVALID_PROPOSAL_ACTIONS');
  for(const action of actions){need(bindingQuoteMatches(source,p.quote),'方案原句缺少条件，请补全原话。');checkAction(action);checkActionEvidence(t.context,action,p.quote);}
  need(!p.choice||!actions.length,'固定方案不能夹带额外行动。');
  q.proposals.push({...clone(p),actions:clone(actions),binding_version:m.session.middleware_version||1,id:t.id+':proposal:'+q.proposals.length,actor:speaker==='player'?'U001':t.context.actor,turn:t.id,status:'active'});
 }
}
