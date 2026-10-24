import {guardSlots} from './household-guards.mjs';
import {mountReading} from './folio-reader.mjs';
import {portraitSpec,characterName,storyParts} from './portrait-data.mjs';
import {powerLevels} from './campaign-engine.mjs';
import {audience} from './dialogue-core.mjs';
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
export function portrait(id,options={}){
 const p=portraitSpec(id,options),box=el('span','got-portrait');box.dataset.actor=id||'unknown';
 const img=el('img');img.src=p.file;img.alt=p.name+'头像';img.decoding='async';img.loading=options.eager?'eager':'lazy';
 if(p.crop){const [x,y,w]=p.crop;img.style.cssText=`position:absolute;width:${p.size[0]/w*100}%;max-width:none;height:auto;left:${-x/w*100}%;top:${-y/w*100}%;`;}
 img.addEventListener('error',()=>{if(box.dataset.fallback)return;box.dataset.fallback='true';img.removeAttribute('style');img.src='assets/got/portraits/role-silhouette.svg';img.alt=p.name+'（头像暂未载入）';});
 box.append(img);return box;
}
export function speech(parent,id,text,options={}){
 return mountReading(parent,text,{...options,portrait:id?portrait(id):null,name:id?characterName(id):''});
}
export function story(parent,text,options={}){
 return speech(parent,options.speaker||null,text,options);
}
export function renderCouncilSeats(g,m,host){
 const section=el('section','council-seats');section.setAttribute('aria-label','御前会议席位');
 const table=el('div','council-table','御前会议');table.setAttribute('aria-hidden','true');section.append(table);
 const present=audience(g,m.activity).filter(id=>g.actors.some(a=>a.id===id&&a.life==='存活'));
 for(const id of present){const seat=el('figure','council-seat'+(id==='U001'?' king-seat':''));seat.dataset.actor=id;
  seat.append(portrait(id,{eager:true}),el('figcaption','',characterName(id).split('·')[0]));
  if(id==='P012')seat.append(el('small','','旁听'));else if(g.opening?.household?guardSlots(g).some(s=>s.actor===id):id==='P016')seat.append(el('small','','当值护卫'));
  section.append(seat);
 }
 const frame=host.querySelector('.scene-frame');
 if(frame){section.classList.add('on-scene');const spots=[[50,22],[29,40],[73,38],[22,58],[81,58],[90,22],[12,25],[38,73],[67,73],[9,68],[93,72]];
  [...section.querySelectorAll('.council-seat')].forEach((seat,i)=>{const [x,y]=spots[i%spots.length];seat.style.left=x+'%';seat.style.top=y+'%';});frame.append(section);
 }else host.append(section);return section;
}
export function renderPresence(g,host){
 const king=g.actors.find(a=>a.id==='U001'),activity=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
 const ids=activity?audience(g,activity.id):g.actors.filter(a=>a.location===king?.location).map(a=>a.id);
 const present=g.actors.filter(a=>a.id!=='U001'&&a.life==='存活'&&ids.includes(a.id)&&a.location===king?.location&&!guardSlots(g).some(s=>s.actor===a.id));
 if(!present.length)return;
 const roster=el('aside','scene-presence portrait-roster');roster.setAttribute('aria-label','当前在场人物');
 for(const a of present){const item=el('button','presence-person'),name=characterName(a.id)==='来人'?(g.entities.find(e=>e.id===a.id)?.name||'来人'):characterName(a.id),pic=portrait(a.id);if(name!=='来人'&&characterName(a.id)==='来人')pic.querySelector('img').alt=name+'（通用头像）';item.type='button';item.dataset.actor=a.id;item.onclick=()=>window.dispatchEvent(new CustomEvent('got-npc-open',{detail:a.id}));item.append(pic,el('span','',name.split('·')[0]));roster.append(item);}
 host.append(roster);
}
export function renderPlayerHUD(runtime){
 const g=runtime.read();if(!g)return;
 let button=document.getElementById('player-portrait-button');
 if(!button){button=el('button','player-portrait-button');button.id='player-portrait-button';button.type='button';button.setAttribute('aria-label','查看乔弗里的状态');button.setAttribute('aria-haspopup','dialog');document.body.append(button);}
 const armour=g.campaign?.scene==='battle';
 button.disabled=false;
 button.replaceChildren(portrait('U001',{eager:true,armour}),el('span','','乔弗里'),el('small','','人物状态'));
 button.onclick=()=>{
  let dialog=document.getElementById('player-status-dialog');if(!dialog){dialog=el('dialog','player-status-dialog');dialog.id='player-status-dialog';document.body.append(dialog);}
  dialog.replaceChildren();dialog.setAttribute('aria-labelledby','player-status-title');const h=el('h2','','乔弗里·拜拉席恩');h.id='player-status-title';dialog.append(h);
  const close=el('button','profile-close','关闭');close.onclick=()=>dialog.close();dialog.append(close,portrait('U001',{eager:true,armour}));
  const state=runtime.read(),me=state.actors.find(a=>a.id==='U001'),minute=state.clock.elapsed_minutes+360;
  dialog.append(el('p','','七国国王'),el('p','',`第${Math.floor(minute/1440)+1}日 · ${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`),el('p','','所在：'+(me?.location||'尚未记录')));
  const cash=state.resources.find(r=>r.id==='RES-CASH')?.quantity?.value;
  const held=state.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)).reduce((n,r)=>n+r.amount,0);
  if(Number.isFinite(cash))dialog.append(el('p','',`国库 ${cash.toFixed(2)} 金龙 · 预留 ${held.toFixed(2)} · 可用 ${(cash-held).toFixed(2)}`));
  const labels={finance:'财政',military:'军权',administration:'行政权',intelligence:'情报'},levels={unformed:'未形成',initial:'初步',stable:'稳固'};
  const powers=!state.campaign&&state.finale?.entry?.power_levels?state.finale.entry.power_levels:powerLevels(state);
  const list=el('dl','player-powers');for(const [key,value]of Object.entries(powers)){list.append(el('dt','',labels[key]),el('dd','',levels[value]||'尚未记录'));}dialog.append(list);
  const activity=state.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(activity)dialog.append(el('p','','当前活动：'+(activity.title||activity.name||'会面中')));
  dialog.showModal();
 };
}
export function showDraftPortrait(actor,textElement){
 let header=document.getElementById('dialogue-speaker-portrait');
 if(!header){header=el('div','dialogue-speaker-portrait');header.id='dialogue-speaker-portrait';textElement.before(header);}
 header.hidden=textElement.hidden||!actor;header.replaceChildren();if(actor)header.append(portrait(actor),el('strong','',characterName(actor)));
}
