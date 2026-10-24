import {places} from './opening-content.mjs';
import {household,guardSlots,guardCandidates,guardsInside,guardLocked} from './household-guards.mjs';
import {currentDaily,mealCandidates,invitationReason,reminder,morningWashPending,nextRoomMeal,afterDinner} from './daily-engine.mjs';
import {dailyDefinitions} from './daily-content.mjs';
import {portrait,story} from './portrait-panel.mjs';
import {characterName} from './portrait-data.mjs';
const node=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text||'';parent?.append(e);return e;};
const statuses={following:'随行',door:'门外值守',waiting:'门外等候',held:'原处等候',unavailable:'暂不能值勤',empty:'空缺'};
const pending=()=>window.gotDialogue?.busy||window.gotDialogue?.draft&&!['done','discarded','stale'].includes(window.gotDialogue.draft.status);
function modal(id,title){let d=document.getElementById(id);if(!d){d=document.createElement('dialog');d.id=id;d.className='court-dialog';document.body.append(d);}d.replaceChildren();node('h2',title,d);const close=node('button','关闭',d);close.onclick=()=>d.close();return d;}
function selection(g,meal,selected,host){const boxes=[];for(const id of mealCandidates(g,meal)){const label=node('label','',host),input=document.createElement('input');input.type='checkbox';input.value=id;input.checked=selected.includes(id);label.append(input,document.createTextNode(characterName(id)+(invitationReason(g,id)?' · '+invitationReason(g,id):'')));boxes.push(input);}return ()=>boxes.filter(b=>b.checked).map(b=>b.value);}
export function renderHousehold(runtime,{button,act}){
 const g=runtime.read();if(!household(g))return;
 const roster=document.getElementById('court-roster');if(roster){roster.hidden=false;const box=node('details','',roster);box.className='household-guards';box.open=sessionStorage.getItem('guard-fold')==='open';box.ontoggle=()=>sessionStorage.setItem('guard-fold',box.open?'open':'closed');node('summary','贴身近卫',box);
  for(const [index,s]of guardSlots(g).entries()){
   const b=button('',()=>{const state=runtime.read(),slot=guardSlots(state)[index],d=modal('guard-actions',slot.actor?characterName(slot.actor):'近卫空缺');
    if(slot.actor){d.append(portrait(slot.actor,{eager:true}));node('p',statuses[slot.mode]+(slot.pending?'；等候接替者到岗':''),d);
     const add=(label,action)=>{const b=button(label,async()=>{await act(action);d.close();});b.disabled=!!pending();d.append(b);};
     if(guardsInside(state).includes(slot.actor)){
      add('暂时回避',{type:'guard_presence',actor:slot.actor,mode:'dismiss'});
      d.append(button('聊聊天',async()=>{if(pending())throw Error('请先完成当前发言。');let a=state.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(!a)await act({type:'start_activity',kind:'short_visit',participants:['U001',slot.actor]});d.close();const input=document.getElementById('dialogue-composer');if(input){input.hidden=false;input.open=true;}const who=document.getElementById('dialogue-actor');if(who)who.value=slot.actor;document.getElementById('dialogue-input')?.focus();}));
     }else if(slot.mode==='door'&&slot.anchor===state.actors.find(a=>a.id==='U001').location)add('召唤近卫',{type:'guard_presence',actor:slot.actor,mode:'summon'});
     d.append(button('待办提醒',()=>{const minute=(state.clock.elapsed_minutes+360)%1440,def=dailyDefinitions.find(x=>x.id===currentDaily(state)?.definition)||dailyDefinitions.find(x=>x.at>=minute)||dailyDefinitions[0];const due=state.opening.meetings.find(m=>!m.attended&&!m.missed&&m.status!=='closed'&&m.scheduled<=state.clock.elapsed_minutes+30);node('p',due?'陛下，大臣们在等您赴会。':def.reminder,d);}));
    }d.showModal();});b.className='guard-slot';b.append(portrait(s.actor),node('span',(s.actor?characterName(s.actor):`第${index+1}席 · 空缺`)+' · '+statuses[s.mode]+(s.pending?' · 待到岗：'+characterName(s.pending.actor):'')));box.append(b);
  }
 }
 const settings=document.getElementById('court-personnel');if(settings){document.getElementById('household-settings')?.remove();const box=node('section','',settings);box.id='household-settings';node('h3','贴身值勤',box);node('p','新近卫抵达后接替当值者；只登记在红堡、尚无具体位置者，由传令召集，约一刻钟到岗。',box);
  for(const [i,s]of guardSlots(g).entries()){const label=node('label',`近卫第${i+1}席 `,box),select=node('select','',label);const none=node('option','空缺',select);none.value='';for(const c of guardCandidates(g)){const opt=node('option',c.name+(c.reason?' · '+c.reason:''),select);opt.value=c.id;opt.disabled=!!c.reason;}select.value=s.pending?.actor||s.actor||'';const assign=button('安排第'+(i+1)+'席',()=>act({type:'guard_assign',slot:i,actor:select.value||null}));select.disabled=assign.disabled=guardLocked(g,i);box.append(assign);if(guardLocked(g,i))node('p','桑铎首日当值，今日不可调换。',box);}
  for(const meal of ['breakfast','lunch','dinner']){const details=node('details','',box);node('summary',dailyDefinitions.find(d=>d.id===meal).name+'常规人选',details);node('p','当前常规：'+(household(g).meals[meal].map(characterName).join('、')||'独自用餐'),details);const read=selection(g,meal,household(g).meals[meal],details);details.append(button('保存常规名单',()=>act({type:'daily_preferences',meal,actors:read()})));}
 }
}
export function renderDaily(runtime,host,{button,act}){
 const g=runtime.read(),r=currentDaily(g);if(!r||r.external||g.campaign?.scene||g.opening.meetings.some(m=>m.status==='in_progress'))return false;
 const def=dailyDefinitions.find(d=>d.id===r.definition);if(!def)return false;
 if(def.handler==='dress'||(def.handler==='greeting'&&r.status==='offered'&&g.actors.find(a=>a.id==='U001').location===places.R01))return false;
 if(def.handler==='meal'&&r.status==='offered'&&(!r.selection_open||g.actors.find(a=>a.id==='U001').location!==places.R05))return false;
 node('h2',def.name,host);story(host,r.status==='active'?(r.text||def.text):reminder(g,def).text,{id:r.id+':'+r.status,speaker:r.status==='active'?r.invited[0]:guardsInside(g)[0]});
 const add=(label,action)=>{const b=button(label,()=>act(action));b.disabled=!!pending();host.append(b);};
 const choose=(choice,actors=[])=>({type:'daily_choose',occurrence:r.id,choice,actors});
 if(['offered','inviting'].includes(r.status)){
  if(def.handler==='meal'){
   add('和往常一样',choose('usual'));
   host.append(button('让我想想',()=>{const d=modal('meal-selection','这次请谁一起用餐？'),read=selection(g,def.id,household(g).meals[def.id],d);d.append(button('请他们来；也可以独自用餐',async()=>{await act(choose('select',read()));d.close();}));d.showModal();}));
  }else{add(def.start_label||(def.handler==='greeting'?'去向母亲问安':def.handler==='dress'?'梳洗更衣':'开始'+def.name),choose('start'));if(def.handler==='greeting')add('去母亲那里坐下详谈',choose('long'));}
  add('稍后再'+(def.handler==='meal'?'吃':'去'),choose('postpone'));add(def.handler==='meal'?'这餐不吃':'这次略过',choose('skip'));
 }else if(r.status==='active'){
  for(const p of r.absent||[])node('p',characterName(p.actor)+'：'+p.reason,host);
  const a=g.activities.find(a=>a.id===r.activity),present=r.invited.filter(id=>a.participants.includes(id));if(present.length)node('p','同席：'+present.map(characterName).join('、'),host);
  if(g.opening.appointments.some(p=>p.source===r.id&&p.status==='travelling'))add('等候在途的宾客',{type:'daily_arrivals',occurrence:r.id});
  if(r.queue?.status==='pending'){
   node('p','席间的话还没有说完，已经保存的发言会保留。',host);
   host.append(button('继续席间对话',async()=>{if(!window.gotDialogue?.councilRequestsEnabled)throw Error('自由交谈尚未开启；可以结束话题，照常用餐。');await window.gotDialogue.runMeal();}));
   add('结束这个话题',{type:'daily_topic_end',occurrence:r.id});
  }else{
   add(def.finish_label||(def.handler==='meal'?'专注于进食':def.handler==='dress'?'穿戴完毕':def.handler==='greeting'?'常规问候后告辞':'结束本次活动'),{type:'daily_finish',occurrence:r.id});
   if(present.length&&def.handler!=='dress')host.append(button('找些话题',()=>{const d=modal('meal-topic','想说些什么？');const input=node('textarea','',d);input.setAttribute('aria-label','席间话题');input.rows=4;
    if(!window.gotDialogue?.councilRequestsEnabled)node('p','自由交谈尚未开启。固定用餐和问安仍可正常完成。',d);
    const send=button('开口交谈',async()=>{if(!window.gotDialogue?.councilRequestsEnabled)throw Error('请先配置并开启模型请求。');await act({type:'daily_topic',occurrence:r.id,input:input.value});d.close();await window.gotDialogue.runMeal();});send.disabled=!window.gotDialogue?.councilRequestsEnabled;d.append(send);d.showModal();input.focus();}));
  }
 }
 return true;
}

// Location actions feed the same daily and navigation handlers as the calendar.
export function renderRoomRoutine(runtime,host,{button,act}){
 const g=runtime.read(),r=currentDaily(g),where=g.actors.find(a=>a.id==='U001')?.location;
 const a=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
 if(g.opening.travel||g.opening.navigation.sleep||g.campaign?.scene||g.finale||(a&&!(r?.definition==='dress'&&r.activity===a.id)))return false;
 let panel;
 const container=()=>{if(!panel){panel=node('section','',host);panel.className='room-routine';panel.setAttribute('aria-label','场景行动');}return panel;};
 const icons={wash:'M5 16h30c-1 10-5 13-15 13S6 26 5 16ZM10 32h20M14 11c-4-4 4-5 0-9M25 11c-4-4 4-5 0-9',pass_time:'M10 3h20M10 37h20M12 3v8c0 5 16 13 16 18v8M28 3v8c0 5-16 13-16 18v8M13 30h14',wait_meal:'M20 4v5M20 12a7 7 0 0 1 7 7M5 28a15 15 0 0 1 30 0M3 29h34M7 34h26',start_meal:'M20 4v5M20 12a7 7 0 0 1 7 7M5 28a15 15 0 0 1 30 0M3 29h34M7 34h26',sleep:'M5 12v23M35 20v15M5 28h30M5 19h8v9M13 21h18a4 4 0 0 1 4 4v3M27 3a6 6 0 1 0 7 8 7 7 0 0 1-7-8'};
 const add=(label,action)=>{
  const b=button(label,()=>act(action));b.disabled=!!pending();b.className='room-action';
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 40 40');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');
  const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',icons[action.choice||'sleep']);icon.append(path);
  const seal=node('span','');seal.className='room-action-seal';seal.append(icon);const labelNode=node('span',label);b.replaceChildren(seal,labelNode);container().append(b);
 };
 if(where===places.R01){
  // Keep the first evening's existing tutorial completion and rest transition.
  if(!g.opening.finished&&g.opening.visits.some(v=>v.scene==='cersei'&&g.activities.find(a=>a.id===v.activity)?.status==='ended'))return false;
  if(morningWashPending(g)){node('p','侍女备好了温水与衣物，等候服侍国王梳洗。',container());add('梳洗',{type:'daily_room',choice:'wash'});return true;}
  const tod=(g.clock.elapsed_minutes+360)%1440;
  if(tod>=500&&tod<1200)add('消磨时间 · 一小时',{type:'daily_room',choice:'pass_time'});
  if(tod>=1200||tod<360||afterDinner(g))add('就寝休息',{type:'nav_sleep'});
  return true;
 }
 if(where===places.R05){
  const meal=nextRoomMeal(g);if(!meal)return false;
  add(meal.due>g.clock.elapsed_minutes?'等待用餐':'开始用餐',{type:'daily_room',choice:meal.due>g.clock.elapsed_minutes?'wait_meal':'start_meal'});return true;
 }
 return false;
}
