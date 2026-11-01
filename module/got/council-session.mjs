import {absentActor} from './custody-state.mjs';
import {quoteMatches} from './middleware-evidence.mjs';
import {saveCharacter} from './character-state.mjs';
import {startCouncilV3,applyCouncilV3} from './council-v3.mjs';
import {campaignIssue,campaignReport,campaignDecision} from './campaign-engine.mjs';
import {worldOps} from './world-engine.mjs';
// Meeting-local records; all world changes still use the existing transaction.
import {applyWorldAction,RuleError} from './world-engine.mjs';
import {applyDialogueAction} from './dialogue-engine.mjs';
import {checkPre,checkPost,buildContext,observe,audience,exact,taskContracts} from './dialogue-core.mjs';
import {readMech} from './stance-engine.mjs';
import {issues,councilReport} from './opening-content.mjs';
const copy=v=>structuredClone(v);
const definition=(g,id)=>campaignIssue(g,id)||issues[id];
const need=(v,s)=>{if(!v)throw new RuleError(s);};
const actionKey=a=>JSON.stringify(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)));
// One call represents one frozen adjudication source, never several topics.
function uniqueCandidates(post){
 const candidates=[],indexes=[],seen=new Map();
 for(const p of post.candidates){const key=JSON.stringify([actionKey(p.action),p.speaker,[...p.conditions].sort(),p.joint_group]);if(!seen.has(key)){seen.set(key,candidates.length);candidates.push({...copy(p),depends_on:[]});}indexes.push(seen.get(key));}
 post.candidates.forEach((p,i)=>{for(const j of p.depends_on){const to=indexes[j];if(to!==indexes[i]&&!candidates[indexes[i]].depends_on.includes(to))candidates[indexes[i]].depends_on.push(to);}});
 return {...copy(post),candidates};
}
const actionDescription=a=>a.type==='night_patrol'?`巡夜：${a.count}人，${a.duration}分钟`:Object.entries(a).map(([k,v])=>`${k}=${typeof v==='string'?v:JSON.stringify(v)}`).join('，');
export const liveCouncil=g=>g.opening?.meetings.find(m=>m.session&&m.status==='in_progress');
export const councilBatchContract='你是御前会议的书记整理层。按一个议题完整阅读全部往返和国王最后裁决，只返回JSON：{turns:[{turn_id:"原编号",post:{}}]}。每条原话必须有且只有一条对应记录，顺序不变。每个post使用下述对话解释合同的字段。各条只能引用该条人物资料中的ref及该条原句，不把后来听到的事倒填成先前知识。经历和摘要保留当时说法；decisions及candidates只保留至本议题结束仍有效的答复和提案，已撤回或被后话替代的旧方案不再生成决定或行动。不得更改人物对白。国王最后裁决中的固定事项由程序统一办理，不再生成重复的opening_decide；补充命令须待国王核对。同一项补充行动仅在最后有效原句处提出一次。交换条件不可拆成无条件同意。若含义矛盾不能确定，返回consistent:false，不能自行决定。每条post合同：\n'+taskContracts.post.replace('你是对话解释层，只返回JSON：','');
export function pendingCouncilBatch(m){
 const first=m?.session.turns.find(t=>!t.post);if(!first)return null;
 const turns=m.session.version>=2?m.session.turns.filter(t=>t.issue===first.issue&&!t.post):[first];
 return {issue:first.issue,turns,choice:m.session.choices.find(c=>c.issue===first.issue)||null,resolution:m.session.version===3?m.session.agenda.find(q=>q.id===first.issue)?.resolution:null};
}
export function checkCouncilBatch(g,batch,result){
 exact(result,['turns']);need(Array.isArray(result.turns)&&result.turns.length===batch.turns.length,'书记的记录遗漏了本项讨论，尚未用印。');
 result=copy(result);
 for(const [i,t]of batch.turns.entries()){
  const row=result.turns[i];exact(row,['turn_id','post']);need(row.turn_id===t.id,'书记的记录与原话次序不符，尚未用印。');
  checkPost(g,t.context,row.post,t.prose);
  if(batch.resolution?.binding_version===2&&t.id===batch.resolution.turn){row.post=uniqueCandidates(row.post);checkPost(g,t.context,row.post,t.prose);}
  if(batch.resolution){
   for(const p of row.post.candidates){
    need(!batch.resolution.choice&&t.id===batch.resolution.turn&&p.speaker===(batch.resolution.speaker||'npc')&&(quoteMatches(Array.isArray(p.quote)?p.quote.join('\n'):p.quote,batch.resolution.quote)||quoteMatches(Array.isArray(batch.resolution.quote)?batch.resolution.quote.join('\n'):batch.resolution.quote,p.quote)),'翻译包含未选定的方案，请核对本题裁决。');
    need(batch.resolution.conditions.every(c=>p.conditions.includes(c)),'翻译遗漏尚未落实的条件。');
    if(batch.resolution.binding_version===2)need((batch.resolution.actions||[]).some(a=>JSON.stringify(Object.entries(a).sort())===JSON.stringify(Object.entries(p.action).sort())),'ACTION_DIFFERS_FROM_SELECTED_PROPOSAL');
   }
  }
  if(batch.resolution?.binding_version===2&&t.id===batch.resolution.turn)need(JSON.stringify(row.post.candidates.map(p=>actionKey(p.action)).sort())===JSON.stringify([...new Set((batch.resolution.actions||[]).map(actionKey))].sort()),'SELECTED_ACTION_MISSING');
  need(t.pre.intent.mode!=='claim'||!row.post.candidates.length,'声称完成不能形成补执行。');
 }
 return result;
}
export function startSession(g,m,version=2,authored=false){
 if(m.session)return;
 if(version===3)return startCouncilV3(g,m,authored);
 m.session={version:2,phase:'intro',index:0,order:Object.keys(m.issues),choices:[],turns:[],approvals:{},minutes:[],started:g.clock.elapsed_minutes};
}
function present(g,m){
 const s=m.session,id=s.order[s.index];
 if(!id){s.phase='extra';m.current=null;return;}
 m.current=id;s.phase='discussion';m.issues[id].reported=true;
 observe(g,audience(g,m.activity),campaignIssue(g,id)?campaignReport(g,m,audience(g,m.activity)):councilReport(id,audience(g,m.activity)),m.id+':'+id);
}
export function applyCouncilAction(g,a,ctx){
 if(a.type==='council_begin'){
  const tod=(g.clock.elapsed_minutes+360)%1440;need(tod<1380&&tod>=360,'这个时辰开会会拖到深夜。请先歇息，明早再召集大臣。');
  need(g.opening?.version===2,'请另开新版开局。');
  if(g.clock.elapsed_minutes<180)applyWorldAction(g,{type:'wait',minutes:180-g.clock.elapsed_minutes},ctx);
  if(liveCouncil(g))return 'COUNCIL_ENTERED';
  const m=g.opening.meetings.find(x=>x.status!=='closed'&&!x.missed&&x.scheduled<=g.clock.elapsed_minutes);
  need(m,'本周没有待开的会议。');
  applyWorldAction(g,{type:'opening_move',place:'R07'},ctx);
  if(g.campaign&&m.week>1){
   const invited=['P001','P004','P005','P018','P020',...(g.clock.elapsed_minutes>=20160?['P003']:[]),...(g.clock.elapsed_minutes>=271*1440?['P002']:[])];
   const missing=invited.filter(id=>{const p=g.actors.find(p=>p.id===id);return p?.life==='存活'&&worldOps.actorFreeAt(g,id)<=g.clock.elapsed_minutes&&(p.location.includes('君临')||p.location.includes('红堡'))&&p.location!=='红堡·议事厅';});
   need(!missing.length||tod+45+180<=1560,'等大臣到齐，再开完会议就太晚了。请先歇息，明早再召集。');
   for(const actor of missing)g.opening.appointments.push({actor,place:'R07',depart:g.clock.elapsed_minutes,arrive:g.clock.elapsed_minutes+45,status:'scheduled',source:m.id});
   // The king is already assembling this meeting. A meal must not start during
   // the ministers' journey and prevent the meeting from entering afterwards.
   if(missing.length)applyWorldAction(g,{type:'wait',minutes:45},{...ctx,routineReserved:true});
   if(liveCouncil(g))return 'COUNCIL_ENTERED';
  }
  applyWorldAction(g,{type:'opening_council',meeting:m.id},ctx);return 'COUNCIL_ENTERED';
 }
 const m=liveCouncil(g);need(m,'会议已经结束，不能采用旧记录。');const s=m.session;
 const inner={...ctx,councilCommit:true};
 if(s.version===3&&a.type.startsWith("council_v3_"))return applyCouncilV3(g,m,a);
 if(s.version===3)need(['council_prepare','council_parse_issue','council_finish'].includes(a.type),'请按当前会议环节处理。');
 if(a.type==='council_continue'){
  need(s.phase==='intro','请先作出本项决定。');present(g,m);return 'COUNCIL_PRESENTED';
 }
 if(a.type==='council_choose'){
  need(s.phase==='discussion'&&a.issue===m.current,'这不是当前讨论的事项。');
  need(definition(g,a.issue).choices.some(x=>x[0]===a.choice),'没有这项选择。');
  s.choices.push({issue:a.issue,choice:a.choice});
  observe(g,audience(g,m.activity),'国王说道：「'+definition(g,a.issue).choices.find(x=>x[0]===a.choice)[1]+'。」书记记下了这项决定，等待散会用印。',m.id+':pending:'+a.issue);
  s.index++;present(g,m);return 'COUNCIL_CHOICE_SAVED';
 }
 if(a.type==='council_say'){
  need(['intro','discussion','extra'].includes(s.phase),'书记正在整理，请待本轮完成。');
  need(!s.turns.some(t=>t.id===a.turn_id),'这段话已经保存。');
  const c=buildContext(g,a.context.actor,a.context.activity,a.context.input,a.context.retrieved||[]);
  need(JSON.stringify(c)===JSON.stringify(a.context),'STALE_DIALOGUE_CONTEXT');a={...a,pre:checkPre(c,a.pre)};
  need(typeof a.prose==='string'&&a.prose.length>0&&a.prose.length<=250000,'正文尚未完整生成。');
  need(Array.isArray(a.request_records)&&!/"(?:key|apiKey|authorization)"\s*:/i.test(JSON.stringify([a.request_records,a.settings])),'请求记录不可包含密钥。');
  s.turns.push({id:a.turn_id,issue:m.current||'extra',context:copy(c),pre:copy(a.pre),prose:a.prose,request_records:copy(a.request_records),settings:copy(a.settings||null),post:null});
  return 'COUNCIL_SPEECH_SAVED';
 }
 if(a.type==='council_prepare'){
  need(s.phase==='extra'||s.phase==='registering'||s.phase==='review','尚有议题没有裁定。');
  s.phase=s.turns.some(t=>!t.post)?'registering':'review';return 'COUNCIL_REGISTERING';
 }
 if(a.type==='council_parse'){
  need(s.phase==='registering','当前不在整理文书。');const t=s.turns.find(x=>x.id===a.turn_id);
  need(t&&!t.post,'这段记录已经处理，或已失效。');checkPost(g,t.context,a.post,t.prose);
  need(t.pre.intent.mode!=='claim'||!a.post.candidates.length,'声称完成不能形成补执行。');
  need(a.request_record&&!/"(?:key|apiKey|authorization)"\s*:/i.test(JSON.stringify(a.request_record)),'请求记录不可包含密钥。');
  t.post=copy(a.post);t.request_records.push(copy(a.request_record));
  if(s.turns.every(t=>t.post))s.phase='review';return 'COUNCIL_BATCH_SAVED';
 }
 if(a.type==='council_parse_issue'){
  need(s.phase==='registering'&&s.version>=2,'当前不在整理本项文书。');
  const batch=pendingCouncilBatch(m);need(batch&&batch.issue===a.issue,'这项讨论已处理或已改变。');const normalized=checkCouncilBatch(g,batch,a.result);
  need(a.request_record&&!/"(?:key|apiKey|authorization)"\s*:/i.test(JSON.stringify(a.request_record)),'请求记录不可包含密钥。');
  for(const [i,t]of batch.turns.entries()){t.post=copy(normalized.turns[i].post);t.request_records.push(copy(a.request_record));}
  if(s.turns.every(t=>t.post))s.phase='review';return 'COUNCIL_BATCH_SAVED';
 }
 if(a.type==='council_approve'){
  need(s.phase==='review','书记尚未整理完。');const t=s.turns.find(x=>x.id===a.turn_id),p=t?.post?.candidates[a.index];
  need(p&&typeof a.accept==='boolean','请确认具体的命令。');
  need(!a.accept||!p.conditions.length,'这项答复仍有条件，不能先行执行。');
  need(!a.accept||p.action.type!=='opening_decide','既定议题按已记下的裁决执行；重复或冲突提案不再发令。');
  s.approvals[a.turn_id+':'+a.index]=a.accept;return 'COUNCIL_COMMAND_CONFIRMED';
 }
 if(a.type==='council_amend'){
  need(s.phase==='review','请等书记整理完再更正。');
  const row=s.choices.find(c=>c.issue===a.issue),choice=definition(g,a.issue)?.choices.find(c=>c[0]===a.choice);
  need(row&&choice,'这不是会议记下的议题。');row.choice=a.choice;
  if(s.version===2){
   for(const t of s.turns.filter(t=>t.issue===a.issue)){t.post=null;for(const key of Object.keys(s.approvals))if(key.startsWith(t.id+':'))delete s.approvals[key];}
   if(s.turns.some(t=>!t.post))s.phase='registering';
  }
  observe(g,audience(g,m.activity),'国王更正裁决：「'+choice[1]+'。」书记划去旧句，重新誊写。',m.id+':amend:'+a.issue);
  return 'COUNCIL_AMENDED';
 }
 if(a.type==='council_finish'){
  need(s.phase==='review'&&s.turns.every(t=>t.post),'书记还有未完成的记录。');
  const approvedActions=new Map(),turns=s.turns.map(t=>s.version===3&&s.agenda.find(q=>q.id===t.issue)?.resolution?.binding_version===2?{...t,post:uniqueCandidates(t.post)}:t);
  if(s.version===3)for(const t of turns)for(const [i,p]of t.post.candidates.entries())s.approvals[t.id+':'+i]=p.action.type!=='opening_decide'&&!p.conditions.length;
  for(const t of turns)for(const [i,p]of t.post.candidates.entries()){
   if(p.action.type==='opening_decide'){s.approvals[t.id+':'+i]=false;continue;}
   need(typeof s.approvals[t.id+':'+i]==='boolean','书记请您确认补充命令。');
   if(s.approvals[t.id+':'+i]){const fingerprint=actionKey(p.action),prior=approvedActions.get(fingerprint),title=id=>s.agenda?.find(q=>q.id===id)?.title||definition(g,id)?.title||id;need(!prior,`议题「${title(prior?.issue)}」与「${title(t.issue)}」的补充动作出现两次：${actionDescription(p.action)}。请在“澄清相关议题”中打开相关议题，核对并调整重复安排。`);approvedActions.set(fingerprint,t);}
  }
  const activity=g.activities.find(x=>x.id===m.activity),end=s.started+180;
  // Keep attendees occupied until the end, but process queued world events in time order.
  applyWorldAction(g,{type:'advance_activity',activity_ref:activity.id},inner);
  while(g.clock.elapsed_minutes<end){
   const prior=g.clock.elapsed_minutes;
   if(g.autonomy.checkpoint)throw new RuleError('另有执行判断尚待处理，书记暂存了会议记录。');
   applyWorldAction(g,{type:'advance_activity',activity_ref:activity.id},inner);
   need(g.clock.elapsed_minutes>prior,'会议计时未能继续。');
  }
  // Existing action handlers expect an active council; retain the audience during sealing.
  activity.status='active';activity.remaining=0;m.status='in_progress';
  const mechBatchVersions=new Map(turns.map(t=>[t.context.actor,readMech(g,t.context.actor).revision]));
  for(const t of turns){
   applyDialogueAction(g,{type:'dialogue_finish',turn_id:t.id,context:t.context,pre:t.pre,prose:t.prose,post:t.post,request_records:t.request_records},{...inner,councilFrozen:true,mechBatchVersions});
  }
  for(const e of s.entries||[])if(e.characterReview)saveCharacter(g,e.characterReview.context,e.characterReview.result,e.id);
  for(const t of turns)if(t.post.mech_deltas?.some(d=>d.agenda_impact==='review')&&g.dialogue.agendas[t.context.actor]?.character)g.dialogue.agendas[t.context.actor].character.pending=true;
  const appliedIssues=[];
  const conflict=e=>appliedIssues.length?'；请一并核对本次先前的决定：'+[...new Set(appliedIssues)].join('、'):'';
  for(const c of s.choices){try{if(campaignIssue(g,c.issue))campaignDecision(g,m,c.choice,inner,worldOps,c.issue,id=>applyDialogueAction(g,{type:'dialogue_execute',proposal_ref:id},inner));else applyWorldAction(g,{type:'opening_decide',meeting:m.id,...c},inner);appliedIssues.push(definition(g,c.issue)?.title||c.issue);}catch(e){throw new RuleError('议题「'+(definition(g,c.issue)?.title||c.issue)+'」未能交办：'+e.message+conflict(e));}}
  for(const t of turns){
   const ps=g.dialogue.proposals.filter(p=>p.turn_ref===t.id);
   for(const [i,p]of ps.entries())if(p.status==='pending'){
    if(s.approvals[t.id+':'+i]){
     const group=ps.filter(x=>p.joint_group&&x.joint_group===p.joint_group);
     need(group.every(x=>s.approvals[t.id+':'+ps.indexOf(x)]),'交换条件必须一同确认。');
     try{applyDialogueAction(g,{type:'dialogue_execute',proposal_ref:p.id},inner);appliedIssues.push(s.agenda?.find(q=>q.id===t.issue)?.title||t.issue);}catch(e){throw new RuleError('议题「'+(s.agenda?.find(q=>q.id===t.issue)?.title||t.issue)+'」与本次已定安排需要核对：'+e.message+conflict(e));}
    }else p.status='cancelled';
   }
  }
  activity.status='ended';activity.ended_at=end;activity.node=activity.nodes.length;activity.remaining=0;
  m.status='closed';m.attended=true;s.phase='closed';
  m.minutes=s.version===3?s.agenda.map(q=>({title:q.title,status:q.report_only?'reported':q.deferred?'deferred':'decided',choice:q.summary,orders:[...(m.issues[q.id]?.order_refs||[])]})):s.choices.map(c=>({title:definition(g,c.issue).title,status:m.issues[c.issue].status,choice:definition(g,c.issue).choices.find(x=>x[0]===c.choice)[1],orders:[...m.issues[c.issue].order_refs]}));
  if(s.version===3)for(const q of s.agenda)if(!s.choices.some(c=>c.issue===q.id)){m.issues[q.id].status=q.report_only||q.deferred?'deferred':'decided';if(!q.report_only&&!q.deferred)m.issues[q.id].decision_ref=ctx.id;}
  s.minutes=[...m.minutes.map(x=>x.choice),...turns.flatMap(t=>t.post.candidates.filter((p,i)=>s.approvals[t.id+':'+i]&&p.action.type!=='opening_decide').map(p=>'另命：'+p.quote))];
  observe(g,activity.participants.filter(id=>!absentActor(g,id)&&g.dialogue.presence.some(p=>p.activity_ref===activity.id&&p.actor===id&&p.present)),'书记将文书捧到桌前。「陛下，今日的决定已经记下：'+s.minutes.join('；')+'。文书即刻送出。」众人起身，等候国王离席。',m.id+':minutes');
  // Responses accompany the committed minutes; they are not a second execution.
  const responses=(g.campaign?.history||[]).filter(h=>h.choice==='council-decision'&&h.meeting===m.id&&h.reply).map(h=>h.reply);
  if(responses.length){
   const note=g.dialogue.observations.findLast(x=>x.source===m.id+':minutes');
   if(note)note.content+='\n\n'+responses.join('\n\n');
  }
  return 'COUNCIL_CLOSED';
 }
 throw new RuleError('未知会议操作。');
}
