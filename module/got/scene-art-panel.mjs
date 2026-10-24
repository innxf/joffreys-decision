import {morningWashPending} from './daily-engine.mjs';
import {guardSlots} from './household-guards.mjs';
import {renderPresence} from './portrait-panel.mjs';
import {regions,roads,travelMinutes,placeDescriptions} from './navigation-data.mjs';
import {playerRegion,playerPlace,night,tunnelKnown} from './navigation-engine.mjs';
import {sceneArt,regionArt,currentArt,mapDestination,storyArt,timedArt,lightingLabels} from './scene-art.mjs';

const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(parent)parent.append(e);return e;};
const image=(file,alt,parent)=>{const img=node('img',null,parent);img.src=file;img.alt=alt;img.width=1672;img.height=941;img.decoding='async';return img;};
const at=t=>{const m=t+360;return `第${Math.floor(m/1440)+1}日 ${String(Math.floor(m%1440/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;};

export function renderBackdrop(host,art,time,{showTime=true}={}){
 art=timedArt(art,time);
 const section=node('section',null,host);section.className='scene-art';section.setAttribute('aria-label','场景画面');
 const frame=node('figure',null,section);frame.className='scene-frame';
 const img=image(art.file,art.name+' · '+lightingLabels[art.period]+'像素场景',frame);img.dataset.period=art.period;if(art.place)img.dataset.place=art.place;
 img.addEventListener('error',()=>{img.hidden=true;frame.classList.add('missing-art');});
 const caption=node('figcaption',null,frame);node('strong',art.name,caption);node('span',(showTime&&time!==undefined?at(time)+' · ':'')+lightingLabels[art.period],caption);
 return section;
}

// Map views share the saved navigation record; clicking a label submits one movement.
export function renderSceneArt(runtime,host,{button,act,pending=false,locked=false}){
 const g=runtime.read(),n=g.opening?.navigation,region=playerRegion(g),place=playerPlace(g);
 const view=locked?'room':n?.view||'room';
 const add=(text,action,parent=host)=>{const b=button(text,()=>act(action));b.disabled=!!pending;parent.append(b);return b;};
 if(!locked&&(g.opening?.travel||n?.sleep)){renderBackdrop(host,storyArt(g),g.clock.elapsed_minutes);node('p',n?.notice||'沿着已经选定的道路前行。',host);add('继续',{type:'nav_resume'});return true;}
 if(view==='room'){
  const art=currentArt(g);if(art){const section=renderBackdrop(host,art,g.clock.elapsed_minutes);if(art.shared)node('small','区域共用背景 · '+art.name,section);}
  if(placeDescriptions[place])node('p',placeDescriptions[place],host);
  if(!locked&&!morningWashPending(g)){const b=add('返回大地图',{type:'nav_view',view:'region'});b.id='return-region-map';}
  const here=g.actors.find(a=>a.id==='U001')?.location;
  const present=g.actors.filter(a=>a.id!=='U001'&&a.life==='存活'&&a.location===here);
  renderPresence(g,host.querySelector('.scene-frame')||host);
 }else if(view==='region'){
  const r=regionArt[region],art=timedArt(r,g.clock.elapsed_minutes);
  node('h2',r.name,host);node('small',at(g.clock.elapsed_minutes),host);const board=node('div',null,host);board.className='region-board';board.dataset.region=region;const img=image(art.file,r.name+' · '+lightingLabels[art.period],board);img.dataset.period=art.period;
  for(const h of r.hotspots){const b=add('',{type:'nav_move',place:h.place,secret:false},board);node('span',sceneArt[h.place].name,b);b.className='map-hotspot';b.dataset.place=h.place;const [x,y,w,z]=h.box;b.style.cssText=`left:${x*100}%;top:${y*100}%;width:${w*100}%;height:${z*100}%`;b.setAttribute('aria-label',sceneArt[h.place].name);}
  for(const l of r.landmarks||[]){const t=node('span',l.name,board);t.className='map-landmark';t.style.cssText=`left:${l.at[0]*100}%;top:${l.at[1]*100}%`;}
  add('切换大区域',{type:'nav_view',view:'city'}).id='switch-region';
  if(tunnelKnown(g)&&['Z01','Z02'].includes(region)){
   const target=region==='Z01'?'C01':'R12';const b=button(region==='Z01'?'秘密出口':'由密道返回红堡',()=>{
    if(!g.opening.household)return act({type:'nav_move',place:target,secret:true});
    const d=document.createElement('dialog');d.className='court-dialog';node('h2','这次带谁同行？',d);const boxes=[];
    for(const s of guardSlots(g).filter(s=>s.actor&&['following','door','waiting'].includes(s.mode))){const label=node('label','',d),box=node('input',null,label);box.type='checkbox';box.value=s.actor;node('span',g.entities.find(e=>e.id===s.actor)?.name||s.actor,label);boxes.push(box);}
    d.append(button('由密道出发',async()=>{await act({type:'nav_move',place:target,secret:true,guards:boxes.filter(b=>b.checked).map(b=>b.value)});d.close();d.remove();}),button('返回地图',()=>{d.close();d.remove();}));document.body.append(d);d.showModal();
   });b.disabled=!!pending;host.append(b);
  }
 }else{
  node('h2','君临',host);const board=node('div',null,host);board.className='city-board';board.setAttribute('aria-label','君临区域选择图');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');board.append(svg);
  for(const [a,b]of roads){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',regions[a].at[0]*100);line.setAttribute('y1',regions[a].at[1]*100);line.setAttribute('x2',regions[b].at[0]*100);line.setAttribute('y2',regions[b].at[1]*100);svg.append(line);}
  for(const [id,r]of Object.entries(regions)){const b=add(r.name+(id===region?' · 所在地':` · ${travelMinutes(region,id)}分钟`),id===region?{type:'nav_view',view:'region'}:{type:'nav_move',place:r.entry,secret:false},board);b.replaceChildren();node('span',r.name,b);node('small',id===region?'所在地':travelMinutes(region,id)+'分钟',b);b.className='city-region';b.dataset.region=id;b.style.left=r.at[0]*100+'%';b.style.top=r.at[1]*100+'%';b.style.backgroundImage=`linear-gradient(#10151a55,#10151aaa),url("${timedArt(regionArt[id],g.clock.elapsed_minutes).file}")`;}
  add('返回'+regions[region].name,{type:'nav_view',view:'region'});
 }
 if(!locked&&n?.notice){
  const notice=node('p',n.notice==='guard'?'守卫横过长戟，低声道：「陛下，天已经黑了。没有特别的安排，今晚不能出宫。」':n.notice,host);notice.className='scene-notice';notice.setAttribute('role','status');
  if(n.notice==='guard'){add('返回',{type:'nav_gate',choice:'return'});add('我执意要出去',{type:'nav_gate',choice:'insist'});}
 }
 if(!locked&&night(g)&&region==='Z01'&&place!=='R01')add('回寝居休息',{type:'nav_sleep'});
 return view!=='room';
}

// Kept for inherited callers. This opens the real regional view, not a travel form.
export const openMap=(runtime,{act})=>act({type:'nav_view',view:'region'});

