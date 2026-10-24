import {renderContinuous} from './continuous-panel.mjs';
import {openingView} from './opening-engine.mjs';
import {places,scenes} from './opening-content.mjs';
const clock=t=>`第${Math.floor((t+360)/1440)+1}日 ${String(Math.floor(((t+360)%1440)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
const states={pending:'未讨论',deferred:'已暂缓',decided:'已决定',declined:'明确不采纳'};
export function renderOpening(runtime,{button,act}){
 if(runtime.read()?.opening?.version===2)return renderContinuous(runtime,{button,act});
 const host=document.getElementById('opening-panel');if(!host)return;
 host.replaceChildren();const g=runtime.read(),v=openingView(g);if(!v){host.hidden=true;return;}host.hidden=false;
 const el=(tag,text,parent=host)=>{const x=document.createElement(tag);x.textContent=text;parent.append(x);return x;};
 const add=(label,action,confirmation,parent=host)=>parent.append(button(label,()=>act(action,confirmation)));
 const trip=place=>{
  const fromOutside=v.place===places.C03,toOutside=place==='C03';if(fromOutside===toOutside)return null;
  const minutes=toOutside?60:45;
  const conflicts=v.meetings.filter(m=>m.status!=='closed'&&m.scheduled>v.at&&m.scheduled<v.at+minutes).map(m=>'御前会议 '+clock(m.scheduled));
  return `前往${places[place]}，预计${minutes}分钟，${clock(v.at+minutes)}抵达。${toOutside?'已包含15分钟集结，不再重复扣时。':''}${conflicts.length?'途中会经过预约时间：'+conflicts.join('、')+'。':''}确认出发？`;
 };
 el('h2',v.finished?'开局两天回顾':'处决后的两天');el('p',`${clock(v.at)} · ${v.place}`);
 el('p','沿建议路线可以学习政务、委托和私人相处。你可以拒绝、延期或离开；没有必须成立的改革。',host);
 const story=el('article','');story.className='opening-story';el('h3','现场',story);
 for(const paragraph of v.story.slice(-5))el('p',paragraph,story);
 if(!v.story.length)el('p','侍从将今天的安排放在书桌上。上午九点，御前会议在议事厅等你。',story);
 const details=el('details',''),sum=el('summary','地点与日历',details),nav=el('div','',details);nav.className='buttons';
 for(const [id,name]of Object.entries(places))add('前往'+name,{type:'opening_move',place:id},trip(id),nav);
 if(v.travel){el('p','正在前往'+v.travel.destination+'，预计'+clock(v.travel.arrive));add('继续行程',{type:'opening_arrive'});return;}
 const active=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
 for(const m of v.meetings.filter(m=>!m.missed||m.status==='in_progress')){
  const box=el('article','');box.className='panel';el('h3',`${m.type==='regular'?'本周御前会议':'紧急御前会议'} · ${clock(m.scheduled)}`,box);
  el('p','默认90分钟，分三个30分钟节点。讨论不按发言轮数收费；可以暂停或提前结束。',box);
  if(m.status==='closed'){
   el('p','会议已经结束。纪要记录的是决定，完成情况请看实际收到的回报。',box);
  }else if(active?.id!==m.activity){
   if(v.at<m.scheduled&&!active)add('等候至会议时间',{type:'wait',minutes:m.scheduled-v.at},'等候期间消息、任务和口粮照常推进。',box);
   add(m.activity?'恢复会议':'进入会议',{type:'opening_council',meeting:m.id},null,box);
   if(!active)add('改约至一小时后',{type:'opening_reschedule',meeting:m.id,at:v.at+60},'通知与人员赴约需要时间；原议题期限不会延期。',box);
  }
  for(const q of m.issues){
   const line=el('div','',box);el('strong',q.title+' · '+(q.reported&&q.status==='pending'?'已呈报，待裁定':states[q.status]),line);el('p',q.category+'；来源：'+q.source,line);
   if(active?.id===m.activity){
    add((q.reported?'转到':'听取')+q.title,{type:'opening_issue',meeting:m.id,issue:q.id},null,line);
    if(q.reported&&m.current===q.id){
     el('p',q.question,line);
     if(!['decided','declined'].includes(q.status)){
      for(const [choice,label,cost]of q.choices)add(label,{type:'opening_decide',meeting:m.id,issue:q.id,choice},label+'？\n'+cost,line);
      add('此项暂缓，保留待办',{type:'opening_decide',meeting:m.id,issue:q.id,choice:'defer'},null,line);
     }
     line.append(button('就此议题自由讨论',()=>{
      document.getElementById('dialogue-panel').scrollIntoView({behavior:'smooth'});
      const select=document.getElementById('dialogue-actor');if([...select.options].some(o=>o.value===q.presenter))select.value=q.presenter;
      document.getElementById('dialogue-input').focus();
     }));
    }
   }
  }
  if(active?.id===m.activity){
   add('让珊莎先离席休息',{type:'opening_sansa_leave'},null,box);
   add('推进本场活动节点',{type:'advance_activity',activity_ref:active.id},null,box);
   add('延长会议30分钟',{type:'extend_activity',activity_ref:active.id,minutes:30},'延长30分钟可能与后续午餐或会面冲突，是否继续？',box);
   add('暂停会议，稍后继续',{type:'opening_pause',meeting:m.id},null,box);
  }
  if(m.activity&&m.status!=='closed')add('散会，核对决定与待办',{type:'opening_close',meeting:m.id},null,box);
  if(m.minutes){const minutes=el('div','',box);el('h4','散会／中断记录',minutes);for(const row of m.minutes)el('p',`${row.title}：${states[row.status]}。${row.choice}。${row.orders.length?'已交办，查看下方执行回报。':''}`,minutes);}
 }
 if(v.recall)el('p','你已提出争取巴利斯坦回来的意向。撤令、正名、邀请、本人愿意合作和白袍交接是不同的事情。');
 add('委托教会转达可信邀请',{type:'opening_invite'},'撤令和正名须已生效。联络需要270分钟，之后才有回信；是否交办？');
 if(v.invitation&&v.at>v.invitation.at+60&&v.invitation.at===780)add('错过第一晚：请求改约第二晚',{type:'opening_rebook'},'重新联络仍需270分钟，不能保证来不及时仍能赴约。');
 if(v.invitation)el('p','已经收到回信：'+clock(v.invitation.at)+'，大圣堂会面室。请留出集结和路程。');
 const activities=el('details','');activities.open=true;el('summary','接下来的相处与会面',activities);
 for(const [id,s]of Object.entries(scenes))if(!v.visits.includes(id)){
  const row=el('div','',activities);el('p',s.title+' · '+places[s.place],row);
  add('前往'+places[s.place],{type:'opening_move',place:s.place},trip(s.place),row);
  add('开始'+s.title,{type:'opening_visit',scene:id},null,row);
 }
 if(v.guard)el('p','守备职责已列为会后议题。可在下方“机构筹建”登记方案，再向当事人说明、协商；不会自动转属人员或撤下白袍。');
 if(!active){
  const future=[150,180,360,720,945,1560,1920,2220,2400].find(t=>t>v.at);
  if(future)add('等候至'+clock(future),{type:'wait',minutes:future-v.at},'等候期间委托、消息与机会窗口照常推进。');
  const topics=v.meetings.findLast(m=>m.type==='regular')?.issues.filter(q=>['pending','deferred'].includes(q.status)).map(q=>q.id)||[];
  if(topics.length)add('召集紧急会议：讨论未决事项',{type:'opening_emergency',topics},'仅讨论列出的未决事项，预约45分钟后；是否发出通知？');
 }
 if(v.at>=2400&&!v.finished)add('结束重点引导，保留全部未决事项',{type:'opening_finish'});
 if(v.finished){
  el('p','两天引导已结束。已经交办的任务继续执行，未决事项和下周会议仍保留。');
  const summary=el('article','');el('h3','本局已收到的结果',summary);
  const messages=runtime.playerView().messages.filter(m=>g.opening.jobs.some(j=>g.orders.find(o=>o.id===g.execution.tasks.find(t=>t.id===j.task)?.order_ref)?.report_message_id===m.id));
  for(const m of messages)el('p',m.text,summary);
  if(!messages.length)el('p','这些委托尚无已送达的结果。未交办的事项不会被视为完成。',summary);
  el('p','相处记录：'+(g.opening.visits.map(v=>scenes[v.scene].title).join('、')||'尚未参加推荐的私人会面')+'。',summary);
  el('p','未达成巴利斯坦回归或近卫整编，不会阻断游戏。');
 }
}
