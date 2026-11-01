import {supportView} from './reform-support.mjs';
import {audienceRequestView} from './audience-requests.mjs';
import {dueReviews} from './reform-meetings.mjs';
import {reformView} from './reform-engine.mjs';
import {portrait} from './portrait-panel.mjs';
import {characterName} from './portrait-data.mjs';
import {audience,profiles} from './dialogue-core.mjs';
import {loadChronicle} from './chronicle.mjs';
import {dailyDefinitions} from './daily-content.mjs';
import {placeDescriptions} from './navigation-data.mjs';
import {places} from './opening-content.mjs';
import {renderCalendar} from './campaign-panel.mjs';
const el=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text||'';parent?.append(e);return e;};
function panel(id,title){let d=document.getElementById(id);if(d)return d;d=el('dialog');d.id=id;d.className='court-dialog';el('h2',title,d);const b=el('button','收起',d);b.className='court-close';b.onclick=()=>d.close();document.body.append(d);return d;}
function fill(d){d.querySelector('.court-content')?.remove();const content=el('section','',d);content.className='court-content';return content;}
const namespace=()=>{const q=new URLSearchParams(location.search);return q.get('opening-test')==='1'?(q.get('council-demo')==='1'?'council-v3-preview':'opening-continuous-preview'):q.get('dialogue-test')==='1'?'dialogue-preview':'';};
const clock=m=>String(Math.floor(m%1440/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
let current;
export function renderCourtMenus(runtime,controls){
 current={runtime,...controls};const g=runtime.read();panel('court-personnel','宫廷人事');
 let nav=document.getElementById('court-bottom');if(!nav){nav=el('nav');nav.id='court-bottom';nav.setAttribute('aria-label','宫廷菜单');document.body.append(nav);
 for(const [id,label]of [['worldbook','世界书'],['history','对话历史'],['encyclopedia','人物百科'],['world','世界局势'],['chronicle','纪事'],['personnel','宫廷人事'],['tasks','待办事项']]){
 const b=el('button',label,nav);b.dataset.menu=id;b.onclick=()=>openMenu(id,label);}
 window.addEventListener('got-npc-open',e=>openNPC(e.detail));
 }
 document.body.classList.toggle('on-map',!!document.querySelector('#opening-panel .region-board,#opening-panel .city-board'));
 document.body.classList.toggle('has-conversation',!document.getElementById('dialogue-panel')?.hidden);
 for(const d of document.querySelectorAll('#court-tasks[open]'))refreshTasks(d);
 let notice=document.getElementById('court-audience-notice');if(!notice){notice=el('section');notice.id='court-audience-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');nav.before(notice);}const incoming=g.opening?.meetings.some(m=>m.status==='in_progress')?[]:audienceRequestView(g).filter(r=>r.status==='notified');const stamp=JSON.stringify(incoming);if(notice.dataset.stamp!==stamp){notice.dataset.stamp=stamp;notice.replaceChildren();for(const r of incoming)renderAudience(r,notice);}
}
function closeOtherPanels(keep){for(const d of document.querySelectorAll('dialog[id^=court-][open]'))if(d!==keep)d.close();}
async function openMenu(id,label){
 const {runtime}=current,d=panel('court-'+id,label);if(d.open){d.close();return;}if(id==='personnel'){closeOtherPanels(d);d.show();return;}
 const host=fill(d),g=runtime.read();closeOtherPanels(d);d.show();
 if(id==='tasks'){refreshTasks(d);return;}
 if(['history','chronicle'].includes(id)){el('p','正在翻阅……',host);try{const rows=await loadChronicle(runtime,window.storageService,namespace());host.replaceChildren();for(const row of rows.filter(r=>id!=='history'||r.type==='对白').slice().reverse()){el('h3',row.type+' · 第'+(Math.floor(((row.at||0)+360)/1440)+1)+'日',host);el('p',row.text,host);}if(!host.children.length)el('p','还没有留下记录。',host);}catch(e){host.textContent=e.message;}return;}
 if(id==='worldbook'){el('p','公开地志。人物私密资料和未发生的故事不在这本册子里。',host);for(const [key,text]of Object.entries(placeDescriptions)){const fold=el('details','',host);el('summary',places[key]||key,fold);el('p',text,fold);}return;}
 if(id==='encyclopedia'){
 const king=g.actors.find(a=>a.id==='U001'),met=new Set([...(g.dialogue.turns||[]).filter(t=>t.audience?.includes('U001')).map(t=>t.actor),...g.actors.filter(a=>a.location===king.location&&a.life==='存活').map(a=>a.id)]);
 el('p','这里只收录已经见过的人，以本局会面记录为准。',host);
 for(const actor of met){if(actor==='U001'||!profiles[actor])continue;const f=el('details','',host);el('summary',characterName(actor),f);f.append(portrait(actor));const office=g.offices.filter(o=>o.holder===actor).map(o=>o.title||o.name).filter(Boolean);el('p',office.length?office.join('、'):'已在本局会面记录中出现。',f);}return;
 }
 if(id==='world'){
 const labels={institution_create_or_expand:'到岗书记员',force_duty_reassignment:'实际驻守',physical_security_upgrade:'已核验通道封堵',intel_network_deploy:'港口观察试办',force_command_or_payroll_shift:'部队供饷路线',procedure_and_authority_grant:'已完成核查'};
 for(const item of supportView(g)){el('h3',labels[item.kind]||'改革交付',host);el('p',item.target+(item.count!==undefined?' · '+item.count+'人':'')+(item.post?' · 岗位'+item.post:''),host);const d=el('details','',host);el('summary','查看已送达依据与适用范围',d);for(const report of item.reports)el('p',report,d);}

 el('p','铁王座所能看见的天下，仍有赖渡鸦与信使。远方尚未送达的消息，不会出现在这里。',host);
 const known=(runtime.playerView().briefing||[]).flatMap(r=>r.reports||[]).concat(g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到').map(m=>m.content)).join('\n');let count=0;for(const [pattern,title,text]of [[/史塔克|北境|罗柏/,'北方与河间地','北方的兵事与诸侯立场，仍是朝廷来信关注的事。'],[/史坦尼斯|蓝礼|拜拉席恩/,'王位与诸侯','王位纷争牵动各方；宣称、结盟与真正的效忠，需要分别看待。'],[/粮|商|港|债/,'君临与商路','战争也影响粮食、商路与王室开支，朝廷需要持续留意送达的消息。'],[/高庭|提利尔|多恩/,'南方诸侯','南方诸侯的立场、往来与婚盟，是朝廷需要留意的动向。']])if(pattern.test(known)){el('h3',title,host);el('p',text,host);count++;}if(!count)el('p','尚无足以整理大陆局势的来报。',host);
 el('p','此页仅整理已经送达的简报；更具体的来信可在纪事中回看。',host);
 }
}
function renderAudience(r,host){
 const {act,button}=current;el('p',(r.speaker?characterName(r.speaker)+'传话：':'')+r.text,host);if(!r.available)el('small','目前尚不能确认对方仍在等候，事项保留。',host);
 const go=button('前往会面',async()=>{await act({type:'audience_visit',request_ref:r.id});if(current.runtime.read().activities.some(a=>a.status==='active'&&a.kind==='short_visit'&&a.participants.includes(r.actor)))openNPC(r.actor);});go.disabled=!r.available;host.append(go);host.append(button('留待周会',()=>act({type:'audience_defer',request_ref:r.id})));
}
function refreshTasks(d){
 const {runtime,button,act}=current,g=runtime.read(),host=fill(d),tod=(g.clock.elapsed_minutes+360)%1440;
 for(const request of audienceRequestView(g).filter(r=>r.status!=='met'))renderAudience(request,host);
 el('h3','今日起居',host);for(const def of dailyDefinitions){const row=el('div','',host);row.className='schedule-row';el('strong',(def.at>=1440?'次日 ':'')+clock(def.at)+' · '+def.name,row);const today=Math.floor((g.clock.elapsed_minutes+360)/1440);const record=g.opening?.household?.days?.findLast(r=>r.definition===def.id&&r.day===today);el('small',({done:'已完成',skipped:'已略过',active:'进行中',offered:'侍从候命',postponed:'已推迟',expired:'已过时段'})[record?.status]||(def.at<tod?'依实际安排':'尚待安排'),row);}
 const meeting=g.opening?.meetings.find(m=>!m.missed&&m.status!=='closed');if(meeting){el('h3','御前会议',host);el('p','预约 '+clock(meeting.scheduled+360)+'。早膳之后赴会；重要召见会由侍从通报。',host);if(!meeting.activity)host.append(button('前往御前会议',async()=>{await act({type:'council_begin'});d.close();}));}
 const a=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(!a&&!g.opening?.travel){const next=dailyDefinitions.map(x=>x.at%1440).filter(t=>t>tod).sort((a,b)=>a-b)[0];if(next)host.append(button('等候下一项日程 · '+clock(next),async()=>{await act({type:'wait',minutes:next-tod});d.close();}));}
 const pending=g.dialogue.turns.filter(t=>t.settlement&&!['done','partial'].includes(t.settlement.status));
 if(pending.length){el('h3','文书整理',host);el('p','对白已经保存，可以继续游玩。尚未整理的命令和答复仍待核对。',host);
  for(const t of pending){el('p',characterName(t.actor)+' · '+({running:'正在整理',ready:'返回已收到，等待保存',failed:'整理未完成',interrupted:'请求已中断',pending:'等待整理'}[t.settlement.status]||'等待整理'),host);if(t.settlement.error)el('p',t.settlement.error,host);
   const cached=t.settlement.response||window.gotDialogue?.postResults.has(g.revision.branch_id+'|'+t.id),run=async retry=>{try{await window.gotDialogue.settle(t.id,{retry});}catch(e){el('p','未完成：'+e.message,host);}refreshTasks(d);};
   const b=button(cached?'继续整理／保存':'恢复整理',()=>run(!cached&&t.settlement.status==='failed'));b.disabled=!!window.gotDialogue?.postBusy;host.append(b);
   if(cached&&t.settlement.status==='failed'){const b=button('重新请求整理',()=>run(true));b.disabled=!!window.gotDialogue?.postBusy;host.append(b);}
  }
 }
 for(const p of reformView(g)){for(const op of p.operations||[]){el('p',op.text,host);for(const b of op.actions)host.append(button(b.label,()=>act(b.action,b.confirmation)));}if(p.posts?.length)host.append(button('传令撤回这项改革的驻守人员',()=>act({type:'cancel_order',order_ref:p.order_ref})));for(const force of p.supply_forces||[])host.append(button('核对供养并送将领',()=>act({type:'reform_supply_report',force_ref:force})));for(const network of p.networks||[])host.append(button('请求港口观察回报',()=>act({type:'reform_intel_report',network_ref:network})));el('h3',p.name,host);const fold=el('details','',host);el('summary','查看改革记录与已送达报告',fold);el('p',p.text,fold);host.append(button('向负责人索取最新报告',()=>act({type:'reform_report',project_ref:p.id})));for(const q of p.pending){el('p',q.reason,host);host.append(button('批准继续这一步',()=>act({type:'reform_control',project_ref:p.id,revision:p.revision,operation:'approve_step',step_ref:q.id},'按已批准范围和预算继续此步骤？')));}if(p.delay_pending)host.append(button('接受报告中的延期',()=>act({type:'reform_control',project_ref:p.id,revision:p.revision,operation:'accept_delay',step_ref:''},'接受已经报告的工期，不追加预算？')));for(const actor of p.commanders)host.append(button('征询当事人 '+characterName(actor),()=>act({type:'autonomy_request_review',actor,kind:'reform_execution',target_ref:p.id})));if(p.status==='completed'||p.status==='cancelled')continue;host.append(button(p.paused?'恢复原方案':'暂停后续工作',()=>act({type:'reform_control',project_ref:p.id,revision:p.revision,operation:p.paused?'resume':'pause',step_ref:''})));if(p.order_ref)host.append(button('撤回未交付工作',()=>act({type:'cancel_order',order_ref:p.order_ref},'撤令送达后停止未交付工作；已有成果、支出与债务保留。')));}
 for(const p of g.projects.filter(p=>p.policy?.template==='general_reform')){const known=g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&m.basis?.refs.includes(p.id)&&m.content.includes('检查'))||g.dialogue.observations.some(o=>o.actors.includes('U001')&&o.targets?.some(t=>t.ref===p.id));if(!known)continue;for(const n of dueReviews(g,p).filter(n=>n.mode==='decision')){el('p',p.name+' · '+n.title+'：'+n.checks,host);host.append(button('批准通过此检查点，继续原范围',()=>act({type:'reform_control',project_ref:p.id,revision:p.policy.plan_revision,operation:'approve_checkpoint',step_ref:n.id},'仅继续原预算与范围，不追加授权？')));}}
 renderCalendar(runtime,host,{button,act});
}
function openNPC(id){
 const {runtime,button,act}=current,g=runtime.read(),king=g.actors.find(a=>a.id==='U001'),npc=g.actors.find(a=>a.id===id);if(!npc||npc.life!=='存活'||npc.location!==king.location)return;
 const d=panel('court-npc',characterName(id));d.querySelector('h2').textContent=characterName(id);const host=fill(d);host.append(portrait(id,{eager:true}));
 const msg=el('p','',host);host.append(button('对话',async()=>{
 try{
 const state=runtime.read(),a=state.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
 if(state.opening.meetings.some(m=>m.status==='in_progress'))throw Error('请在御前会议的讨论环节点名发言。');
 if(!profiles[id])throw Error('这位人物的自由对话资料尚未接入。');
 if(window.gotDialogue?.busy||window.gotDialogue?.draft&&!['done','discarded','stale'].includes(window.gotDialogue.draft.status))throw Error('请先完成或取消当前发言。');
 if(a&&!audience(state,a.id).includes(id))throw Error('请先结束当前会面，再与他交谈。');
 if(!a)await act({type:'start_activity',kind:'short_visit',participants:['U001',id]});
 d.close();requestAnimationFrame(()=>{const composer=document.getElementById('dialogue-composer');if(composer){composer.hidden=false;composer.open=true;}const who=document.getElementById('dialogue-actor');if(who)who.value=id;document.getElementById('dialogue-panel').hidden=false;document.getElementById('dialogue-input')?.focus();});
 }catch(e){msg.textContent=e.message;}
 }));d.querySelector('.court-close').textContent='离开';d.showModal();
}

// A reading acknowledgement, not a second event scheduler or world action.
export function renderCourtCurtain(runtime){
 const g=runtime.read(),meeting=g.opening?.meetings.find(m=>m.status==='in_progress'),visit=g.opening?.visits.find(v=>v.scene==='cersei'&&g.activities.some(a=>a.id===v.activity&&a.status==='active'));
 const scene=g.campaign?.scene;const source=meeting?.activity||visit?.activity||(scene&&!scene.startsWith('EXP-')?scene:null);
 const key=source&&[g.revision.branch_id,source].join(':');
 let curtain=document.getElementById('court-curtain');if(!curtain){curtain=el('div');curtain.id='court-curtain';curtain.setAttribute('role','dialog');curtain.setAttribute('aria-label','侍从通报');document.body.append(curtain);}
 const active=!!key&&!sessionStorage.getItem('court-arrival:'+key);
 curtain.hidden=!active;for(const e of document.querySelectorAll('main,#court-roster,#court-bottom,#player-portrait-button'))e.inert=active;
 if(!active)return;
 for(const d of document.querySelectorAll('#court-personnel[open],#court-tasks[open],#court-npc[open],#guard-actions[open]'))d.close();
 curtain.replaceChildren();const sheet=el('section','',curtain);el('h2',meeting?'大臣们正在等候':visit?'太后召见':'新的事态',sheet);el('p',meeting?'侍从推开议事厅的大门，众人起身迎候。':visit?'侍从候在门外，请国王入内。':'侍从请您留步，眼前的事情需要即刻面对。',sheet);
 const enter=el('button',meeting?'进入御前会议':visit?'走进太后的住处':'继续',sheet);enter.onclick=()=>{sessionStorage.setItem('court-arrival:'+key,'read');renderCourtCurtain(runtime);};enter.focus();
}
