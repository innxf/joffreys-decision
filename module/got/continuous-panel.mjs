import {renderDaily,renderRoomRoutine} from './household-panel.mjs';
import {currentDaily} from './daily-engine.mjs';
import {cardDialogue} from './event-cards.mjs';
import {story} from './portrait-panel.mjs';
import {renderCouncilV3} from './council-v3-panel.mjs';
import {renderCampaign,renderCalendar} from './campaign-panel.mjs';
import {campaignIssue,campaignView} from './campaign-engine.mjs';
import {liveCouncil} from './council-session.mjs';
import {issues,scenes,places,cerseiScolding,barristanChoices} from './opening-content.mjs';
import {profiles} from './dialogue-core.mjs';
import {renderSceneArt} from './scene-art-panel.mjs';
const def=(g,id)=>campaignIssue(g,id)||issues[id];
const time=t=>`${String(Math.floor(((t+360)%1440)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
export function renderContinuous(runtime,{button,act}){
 const g=runtime.read(),host=document.getElementById('opening-panel'),m=liveCouncil(g),s=g.opening;
 host.hidden=false;host.classList.remove("quiet-scene");host.replaceChildren();
 const el=(tag,text,parent=host)=>{const e=document.createElement(tag);if(tag==='p'&&(/[「“]/.test(text)||/^[^：]{1,20}：/.test(text)))return story(parent,text);e.textContent=text;parent.append(e);return e;};
 const add=(text,action)=>host.append(button(text,()=>act(action)));
 const runner=window.gotDialogue;
 const busy=runner?.busy||runner?.draft&&!['done','discarded','stale'].includes(runner.draft.status);
 if(!document.getElementById('page-tools')){
  const details=document.createElement('details');details.id='page-tools';
  const summary=document.createElement('summary');summary.textContent='设置与独立试玩';details.append(summary);
  for(const href of ['got-generation.html','got-finale.html']){const p=document.querySelector(`main>p>a[href="${href}"]`)?.parentElement;if(p)details.append(p);}
  document.querySelector('main').prepend(details);
 }
 document.getElementById('page-tools').hidden=!!m;
 if(!document.getElementById('dialogue-settings')){
  const nav=document.querySelector('#dialogue-panel>nav'),details=document.createElement('details');details.id='dialogue-settings';
  const summary=document.createElement('summary');summary.textContent='对话设置';details.append(summary);nav.before(details);details.append(nav);
 }
 document.body.classList.add('continuous-play');document.body.classList.toggle('in-council',!!m);
 const debug=new URLSearchParams(location.search).get('debug')==='1';
 for(const id of ['activity-controls','action-controls','org-controls','reports','political-controls']){
  const section=document.getElementById(id)?.closest('section');if(section)section.hidden=!debug;
 }
 document.getElementById('briefing').hidden=!debug;
 if(g.campaign&&(g.campaign.scene||g.finale)){if(renderCampaign(runtime,host,{button,act})){document.getElementById('dialogue-panel').hidden=!cardDialogue(g);return;}}
 document.getElementById('dialogue-panel').hidden=!g.activities.some(a=>a.status==='active'&&a.participants.includes('U001'));
 const a=g.activities.find(x=>x.status==='active'&&x.participants.includes('U001'));
 if(renderSceneArt(runtime,host,{button,act,pending:!!busy,locked:!!m||!!a})){document.getElementById('dialogue-panel').hidden=true;return;}
 if(renderDaily(runtime,host,{button,act})){document.getElementById('dialogue-panel').hidden=!a;return;}
 if(!m&&renderRoomRoutine(runtime,host,{button,act})){document.getElementById('dialogue-panel').hidden=true;return;}
 if(m?.session.version===3){document.getElementById('dialogue-panel').hidden=true;renderCouncilV3(runtime,host,{button,act});return;}
 el('h2',m?'御前会议':s.finished?g.actors.find(x=>x.id==='U001').location:a?scenes[s.visits.find(v=>v.activity===a.id)?.scene]?.title||'会面':'处决后的第一天');
 el('p',`第${Math.floor((g.clock.elapsed_minutes+360)/1440)+1}日 · ${time(g.clock.elapsed_minutes)} · ${g.actors.find(x=>x.id==='U001').location}`);
 if(m){
  const c=m.session;
  const text=g.dialogue.observations.filter(o=>o.source.startsWith(m.id)&&o.actors.includes('U001')).at(-1)?.content;
  el('p',text||'书记摊开面前的卷宗。');
  for(const t of c.turns.filter(t=>t.issue===(m.current||'extra'))){el('p','乔弗里：'+t.context.input);el('p',profiles[t.context.actor].name+'：'+t.prose);}
  if(c.phase==='intro')add('让他们开始呈报',{type:'council_continue'});
  if(c.phase==='discussion')for(const [choice,label]of def(g,m.current).choices)add(label,{type:'council_choose',issue:m.current,choice});
  if(c.phase==='extra')el('p','最后一份卷宗已经合上。书记搁下笔，等着看国王是否还有吩咐。');
  if(['extra','registering'].includes(c.phase)){
   if(c.phase==='registering')el('p',runner?.councilError?'书记搁下笔：「这份记录还没有核妥，陛下。文书尚未用印。」':'书记正逐项整理刚才的话。大臣们暂且歇息，文书尚未用印。');
   if(runner?.councilError){const detail=el('details','');el('summary','查看未完成的原因',detail);el('p',runner.councilError,detail);}
   host.append(button(c.phase==='extra'?'让书记整理，准备散会':'继续整理文书',async()=>{await runner.registerCouncil();}));
  }
  if(c.phase==='review'){
   el('p','书记将拟好的文书递来。');
   for(const choice of c.choices)el('p',def(g,choice.issue).choices.find(x=>x[0]===choice.choice)[1]+'。');
   const corrections=el('details','');el('summary','更正刚才的裁决',corrections);
   for(const c0 of c.choices)for(const [choice,label]of def(g,c0.issue).choices)if(choice!==c0.choice)corrections.append(button(label,()=>act({type:'council_amend',issue:c0.issue,choice})));
   let pending=false,confirmed=null;
   for(const t of c.turns)for(const [index,p]of t.post.candidates.entries()){
    if(p.action.type==='opening_decide')continue;
    const id=t.id+':'+index;if(typeof c.approvals[id]==='boolean'){
     if(c.approvals[id]){if(!confirmed){confirmed=el('details','');el('summary','已核对的补充吩咐',confirmed);}el('p',p.quote,confirmed);confirmed.append(button('划去这项补充吩咐',()=>act({type:'council_approve',turn_id:t.id,index,accept:false})));}
     continue;
    }pending=true;
    el('p','书记问：「'+p.quote+'」——这项是否照办？'+(p.conditions.length?'对方尚要求：'+p.conditions.join('；'):''));
    if(!p.conditions.length)add('是，就按这项办',{type:'council_approve',turn_id:t.id,index,accept:true});
    add('这项先不要发令',{type:'council_approve',turn_id:t.id,index,accept:false});
   }
   if(!pending)add('用印，散会',{type:'council_finish'});
  }
  if(busy)host.querySelectorAll('button').forEach(b=>b.disabled=true);
  return;
 }
 if(!s.meetings[0].activity&&!a){host.classList.add('quiet-scene');return;}
 const justClosed=s.meetings.findLast(x=>x.status==='closed'&&x.session?.started+180===g.clock.elapsed_minutes);
 if(justClosed){const minutes=g.dialogue.observations.findLast(o=>o.source===justClosed.id+':minutes');if(minutes)el('p',minutes.content);}
 const visit=a&&s.visits.find(v=>v.activity===a.id);
 if(visit){
  if(visit.scene==='cersei'){story(host,cerseiScolding,{speaker:'P001',id:visit.activity+':opening'});}else story(host,scenes[visit.scene].text,{speaker:scenes[visit.scene].actors?.[0]});
  if(visit.scene==='barristan'){
   const turn=g.dialogue.turns.find(t=>t.id==='author-barristan:'+visit.activity);
   if(turn)story(host,turn.prose,{speaker:'P011',id:turn.id});
   else if(!g.dialogue.turns.some(t=>t.activity===visit.activity&&t.actor==='P011'))for(const [choice,c]of Object.entries(barristanChoices))add(c.label,{type:'dialogue_authored_scene',choice});
  }
  if(visit.scene==='cersei'){
   const paragraph=g.dialogue.observations.findLast(o=>o.actors.includes('U001')&&o.content.startsWith('瑟曦问道'));if(paragraph)el('p',paragraph.content);
   if(!s.events.includes('sansa-response')){
    add('今天的决定是我作的，问我就好',{type:'opening_protect',choice:'protect'});
    add('母亲，让她坐下吧',{type:'opening_protect',choice:'gentle'});
    add('不替珊莎开口',{type:'opening_protect',choice:'silent'});
   }else el('p',g.dialogue.observations.filter(o=>o.actors.includes('U001')).at(-1)?.content||'');
  }
  if(visit.scene!=='cersei'||s.events.includes('sansa-response'))add(visit.scene==='barristan'?'结束这次会谈':visit.scene==='cersei'?'向母亲告退':'结束这次相处',{type:'opening_scene_end'});
  if(busy)host.querySelectorAll('button').forEach(b=>b.disabled=true);return;
 }
 if(a){el('p','你们可以继续交谈。');add('结束这次相处',{type:'opening_scene_end'});return;}
 if(g.actors.find(x=>x.id==='U001').location===places.C03){
  if(!s.visits.some(v=>v.scene==='barristan')){
   if(s.invitation&&g.clock.elapsed_minutes<s.invitation.at)add('在圣堂等候约定的时刻',{type:'wait',minutes:s.invitation.at-g.clock.elapsed_minutes});
   else add('走进会面室',{type:'opening_visit',scene:'barristan'});
  }
  else{
   const decisions=g.execution.decisions.filter(d=>d.actor==='P011'&&d.target_ref==='BARRISTAN-AUDIENCE'&&d.status!=='superseded');
   for(const d of decisions)el('p',({safe_conduct:'安全保证',reconciliation:'谅解',advice:'提供意见',return_intent:'返回君临'})[d.kind]+'：'+({accepted:'已答应',conditional:'仍有条件',refused:'已拒绝',deferred:'尚未答应'})[d.status]);
   if(!decisions.length)el('p','这次会谈没有留下新的明确承诺。');
   el('p','会谈已经结束，可以从地图返回红堡。');
  }return;
 }
 const cersei=s.visits.find(v=>v.scene==='cersei');
 if(cersei&&!s.finished){el('p','宫门已经落锁。明天还有新的来信，也还有今天没办完的事。');add('就寝休息',{type:'opening_finish'});return;}
 const startScene=async id=>{await act({type:'opening_visit',scene:id});};
 const received=s.invitation&&g.messages.some(x=>x.id===s.invitation.report&&x.status==='已收到');
 if(received&&!s.visits.some(v=>v.scene==='barristan')&&g.clock.elapsed_minutes<=s.invitation.at){
  el('p','教会的回信到了。巴利斯坦爵士同意见面，约在今晚七点。');
  el('p','届时可从地图前往维桑尼亚丘。');
 }
 if(g.clock.elapsed_minutes<720){
  for(const id of (s.household?['sandor','family']:['sandor','lunch','family']))if(g.actors.find(x=>x.id==='U001').location===places[scenes[id].place]&&!s.visits.some(v=>v.scene===id)&&g.clock.elapsed_minutes>=scenes[id].earliest)host.append(button(scenes[id].title,()=>startScene(id)));
  const next=[360,540,720].find(t=>t>g.clock.elapsed_minutes);if(next)add(s.recall_requested?'等候信使与回报':'让侍从稍后再来',{type:'wait',minutes:next-g.clock.elapsed_minutes});
 }
 if(!cersei&&g.clock.elapsed_minutes>=720)el('p','太后今晚在自己的住处等您。');
 if(!s.finished&&!cersei&&g.clock.elapsed_minutes>=720&&g.clock.elapsed_minutes<945)add('稍候，等侍从呈报',{type:'wait',minutes:Math.min(60,945-g.clock.elapsed_minutes)});
 if(s.household?.waitTarget>g.clock.elapsed_minutes&&!a)add('继续此前的等候',{type:'daily_resume_wait'});
 if(s.finished){
  if(!g.campaign) el('p','首日已经结束。已交办的事务继续推进，你可以安排自己的时间。');
  if(!s.navigation?.tunnel&&(!s.navigation?.search||g.execution.tasks.some(t=>t.id===s.navigation.search&&t.status==='cancelled'))){
   if(g.politics.guard_plans.some(p=>p.status==='completed')||g.campaign?.completed.some(p=>p.operation==='guard'))add('让守卫检查旧通道',{type:'nav_inspect_tunnel',source:'guard'});
   if(g.execution.decisions.some(d=>d.actor==='P004'&&d.kind==='tunnel_disclosure'&&d.status==='accepted'))add('派人核实瓦里斯所说的通道',{type:'nav_inspect_tunnel',source:'varys'});
  }
  const location=g.actors.find(x=>x.id==='U001').location;
  const visible=g.actors.filter(x=>x.id!=='U001'&&x.life==='存活'&&x.location===location);
  // Regional illustration and its text list share the existing opening_move handler.
  if((g.clock.elapsed_minutes+360)%1440<=1335&&(g.clock.elapsed_minutes+360)%1440>=360&&s.meetings.some(x=>!x.missed&&x.status!=='closed'&&x.scheduled<=g.clock.elapsed_minutes))add('召开本周御前会议',{type:'council_begin'});
 }
}
