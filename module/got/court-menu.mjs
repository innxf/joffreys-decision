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
 el('p','铁王座所能看见的天下，仍有赖渡鸦与信使。远方尚未送达的消息，不会出现在这里。',host);
 const known=(runtime.playerView().briefing||[]).flatMap(r=>r.reports||[]).concat(g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到').map(m=>m.content)).join('\n');let count=0;for(const [pattern,title,text]of [[/史塔克|北境|罗柏/,'北方与河间地','北方的兵事与诸侯立场，仍是朝廷来信关注的事。'],[/史坦尼斯|蓝礼|拜拉席恩/,'王位与诸侯','王位纷争牵动各方；宣称、结盟与真正的效忠，需要分别看待。'],[/粮|商|港|债/,'君临与商路','战争也影响粮食、商路与王室开支，朝廷需要持续留意送达的消息。'],[/高庭|提利尔|多恩/,'南方诸侯','南方诸侯的立场、往来与婚盟，是朝廷需要留意的动向。']])if(pattern.test(known)){el('h3',title,host);el('p',text,host);count++;}if(!count)el('p','尚无足以整理大陆局势的来报。',host);
 el('p','此页仅整理已经送达的简报；更具体的来信可在纪事中回看。',host);
 }
}
function refreshTasks(d){
 const {runtime,button,act}=current,g=runtime.read(),host=fill(d),tod=(g.clock.elapsed_minutes+360)%1440;
 el('h3','今日起居',host);for(const def of dailyDefinitions){const row=el('div','',host);row.className='schedule-row';el('strong',(def.at>=1440?'次日 ':'')+clock(def.at)+' · '+def.name,row);const today=Math.floor((g.clock.elapsed_minutes+360)/1440);const record=g.opening.household?.days.findLast(r=>r.definition===def.id&&r.day===today);el('small',({done:'已完成',skipped:'已略过',active:'进行中',offered:'侍从候命',postponed:'已推迟',expired:'已过时段'})[record?.status]||(def.at<tod?'依实际安排':'尚待安排'),row);}
 const meeting=g.opening.meetings.find(m=>!m.missed&&m.status!=='closed');if(meeting){el('h3','御前会议',host);el('p','预约 '+clock(meeting.scheduled+360)+'。早膳之后赴会；重要召见会由侍从通报。',host);if(!meeting.activity)host.append(button('前往御前会议',async()=>{await act({type:'council_begin'});d.close();}));}
 const a=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(!a&&!g.opening.travel){const next=dailyDefinitions.map(x=>x.at%1440).filter(t=>t>tod).sort((a,b)=>a-b)[0];if(next)host.append(button('等候下一项日程 · '+clock(next),async()=>{await act({type:'wait',minutes:next-tod});d.close();}));}
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
