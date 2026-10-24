import {pendingCardTopics,eventCards} from './event-cards.mjs';
import {story} from './portrait-panel.mjs';
import {campaignView,powerLevels,annualMeeting,campaignAllowed} from './campaign-engine.mjs';
import {campaignCatalog} from './campaign-catalog.mjs';
import {operations} from './campaign-content.mjs';
import {storyArt} from './scene-art.mjs';
import {renderBackdrop} from './scene-art-panel.mjs';
export function renderCampaign(runtime,host,{button,act}){
 const g=runtime.read(),c=g.campaign;if(!c)return false;
 const text=(tag,t,parent=host)=>{const e=document.createElement(tag);if(tag==='p')return story(parent,t);e.textContent=t;parent.append(e);return e;};
 const add=(label,action,parent=host)=>parent.append(button(label,()=>act(action)));
 const f=runtime.finaleView();
 if(f?.active||c.scene||g.finale?.entry)renderBackdrop(host,storyArt(g,f?.active?f:null),g.clock.elapsed_minutes);
 if(f?.active){
  text('h2',f.ended?f.ending_title:f.title);text('small',f.viewpoint==='observer'?'幕间旁观':'乔弗里');
  story(host,(f.ended?(f.history.at(-1)?.paragraphs||[]):f.paragraphs).join('\n\n'),{id:'finale:'+f.scene+':'+f.phase});
  for(const option of f.options)add(option.label,{type:'finale_choose',choice_id:option.id});
  if(!f.ended&&!f.options.length)add('继续',{type:'finale_continue'});
  if(f.ended)text('p','这一年的故事在这里结束。结局与未决事项已随本局存档保留。');
  const log=text('details','');text('summary','回看已发生的剧情',log);
  for(const h of f.history){text('h3',h.title,log);for(const p of h.paragraphs)text('p',p,log);if(h.choice)text('p',h.choice,log);}
  return true;
 }
 if(c.scene==='defeat'){text('h2','失守的君临');text('p','城门已经落入敌手，红堡未能恢复城防。本局到此结束；可保存结果，或读取战前的存档。');return true;}
 const v=campaignView(g);
 if(v){text('h2',v.title);const minute=g.clock.elapsed_minutes+360;text('small',`第${Math.floor(minute/1440)+1}日 · ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`);story(host,v.text,{id:'campaign:'+c.scene+':'+c.scene_step,speaker:eventCards.find(card=>card.id===c.scene)?.actor||null});
  for(const choice of v.choices){const b=button(choice.label,async()=>{if(choice.id==='llm'&&!window.gotDialogue?.councilRequestsEnabled){const notice=document.getElementById('runtime-notice');notice.hidden=false;notice.textContent='自由交谈尚未开启。可在右上角设置中配置连接；眼前的既定选项仍可直接采用。';return;}if(runtime.read().campaign.scene==='finale'){if(!window.gotDialogue)throw Error('人物判断服务尚未就绪，已保留当前位置。');if(window.gotDialogue.councilRequestsEnabled)await window.gotDialogue.reviewCharacters();else await act({type:'dialogue_authored_review'});}await act({type:'campaign_choose',choice:choice.id});if(runtime.read().finale?.entry&&!runtime.read().finale.freeze)await act({type:'finale_enter'});});b.disabled=!!v.dialogue&&(!!window.gotDialogue?.busy||!!(window.gotDialogue?.draft&&!['done','discarded','stale'].includes(window.gotDialogue.draft.status)));host.append(b);}return true;}
 if(g.finale?.entry&&!g.finale.freeze){add('走进盛典大厅',{type:'finale_enter'});return true;}
 return false;
}
export function renderCalendar(runtime,host,{button,act}){
 const g=runtime.read(),c=g.campaign;if(!c||!g.opening.finished)return;
 const el=(tag,t,parent=host)=>{const e=document.createElement(tag);if(tag==='p')return story(parent,t);e.textContent=t;parent.append(e);return e;};
 const week=Math.min(52,Math.floor(g.clock.elapsed_minutes/10080)+1),m=annualMeeting(g),w=campaignCatalog.weeks[week-1];
 el('p',`第${week}周 · ${w.title}`);
 const topics=pendingCardTopics(g);if(topics.length&&!g.opening.meetings.some(m=>m.type==='emergency'&&m.status!=='closed'))host.append(button('召集御前会议，处理新呈报',()=>act({type:'opening_emergency',topics})));
 const nav=el('details','');el('summary','安排日程',nav);
 for(const [mode,label]of [['day','让一天过去'],['council','等到下一次周会'],['week','本周留给私人生活'],['event','等候下一件大事']])nav.append(button(label,()=>act({type:'campaign_wait',mode})));
 const dispatch=el('details','');el('summary',g.opening.meetings.some(m=>m.session?.version===3)?'向御前会议补充政务提案':'交办已经议定的事务',dispatch);
 const ops=campaignAllowed(g);
 for(const op of ops)dispatch.append(button(operations[op].label,()=>act({type:'campaign_issue',operation:op})));
 const reports=el('details','');el('summary','信使送来的回报',reports);
 for(const msg of g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到').slice(-12))el('p',msg.content,reports);
 const state=el('details','');el('summary','王室账册与既有权责',state);
 const cash=g.resources.find(r=>r.id==='RES-CASH').quantity.value,held=g.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)).reduce((n,r)=>n+r.amount,0);
 el('p',`实存 ${cash.toFixed(2)} 金龙，预留 ${held.toFixed(2)}，可用 ${(cash-held).toFixed(2)}。`,state);
 el('p','到期尚未付清：'+g.obligations.filter(p=>p.status!=='已支付'&&p.due_minute<=g.clock.elapsed_minutes).reduce((n,p)=>n+p.amount,0).toFixed(2)+'金龙。',state);
 for(const use of g.consumption){const stock=g.resources.find(r=>r.id===use.resource_id),days=use.rate_per_day?stock.quantity.value/use.rate_per_day:0;el('p',`${stock.name}：${Math.floor(days)}天现存配给${days<4?'，请尽快安排续购。':'。'}`,state);}
 const outstanding=g.execution.tasks.filter(t=>t.kind==='campaign_work'&&['sent','accepted','executing','blocked'].includes(t.status));
 for(const t of outstanding){
  const control=g.autonomy?.controls?.find(x=>x.task_ref===t.id),order=g.orders.find(o=>o.id===t.order_ref),received=g.messages.some(m=>m.id===order?.report_message_id&&m.recipient==='U001'&&m.status==='已收到');
  el('p',operations[t.params.operation].label+'：'+(received&&control?.reason?control.reason:'已交办，等候经手人的回报。'),state);
  if(received&&['condition','decision'].includes(control?.wait))state.append(button('让经手人按现有条件继续核对',()=>act({type:'autonomy_resume',task_ref:t.id})));
  state.append(button('撤回这项未完成委托',()=>act({type:'cancel_order',order_ref:t.order_ref},'撤回“'+operations[t.params.operation].label+'”？已经支出的款项与交付的人手会保留，只取消尚未执行的部分。')));
 }
 for(const debt of g.politics.debts.filter(d=>d.outstanding>0)){el('p',`债券本金尚欠 ${debt.outstanding} 金龙。到期日：第${Math.floor(debt.maturity_at/1440)+1}天。`,state);state.append(button('偿还这笔本金 '+debt.outstanding+' 金龙',()=>act({type:'repay_bond_principal',debt_ref:debt.id,amount:debt.outstanding})));}
 const labels={finance:'财政',military:'军权',administration:'行政权',intelligence:'情报'},levels={unformed:'尚未形成',initial:'已落实部分安排',stable:'已有持续有效的执行记录'};
 for(const [k,v]of Object.entries(powerLevels(g)))el('p',labels[k]+'：'+levels[v],state);
}
