import {renderCourtMenus} from "./court-menu.mjs";
import {updateMusic,mountMusicSettings} from './music.mjs';
import {loadChronicle} from './chronicle.mjs';
// Rearrange existing controls; their handlers and storage remain the original ones.
export function renderShell(runtime,controls){
 const g=runtime.read();if(!g)return;updateMusic(g);document.body.classList.add('court-folio');
 let header=document.getElementById('court-header');
 if(!header){
  header=document.createElement('header');header.id='court-header';
  const title=document.createElement('strong');title.textContent='乔佛里的决定';header.append(title);
  const time=document.createElement('span');time.id='court-time';header.append(time);
  const control=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;header.append(b);};
  control('存档',()=>document.getElementById('court-save').showModal());
  control('设置',()=>document.getElementById('court-settings').showModal());
  document.body.prepend(header);
  const modal=(id,title)=>{const d=document.createElement('dialog');d.id=id;d.className='court-dialog';const h=document.createElement('h2');h.textContent=title;const b=document.createElement('button');b.textContent='关闭';b.className='court-close';b.onclick=()=>d.close();d.append(h,b);document.body.append(d);return d;};
  const saves=modal('court-save','保存与读取');const old=document.getElementById('save-title')?.closest('section');if(old){old.querySelector('h2').hidden=true;saves.append(old);}
  const settings=modal('court-settings','设置');mountMusicSettings(settings);
  const exit=modal('court-exit','退出游戏');
  const exitMessage=document.createElement('p');exitMessage.textContent='请确认已经保存进度。确认退出会关闭本地游戏服务，也会中断其他打开的本游戏页面；不会自动替你另存存档。';exit.append(exitMessage);
  const exitStatus=document.createElement('p');exitStatus.setAttribute('role','status');exit.append(exitStatus);
  let exiting=false;
  const cancelExit=exit.querySelector('.court-close');cancelExit.textContent='取消';
  exit.addEventListener('cancel',e=>{if(exiting)e.preventDefault();});
  const goSave=document.createElement('button');goSave.textContent='去存档';goSave.onclick=()=>{exit.close();saves.showModal();};exit.append(goSave);
  const confirmExit=document.createElement('button');confirmExit.textContent='确认退出';exit.append(confirmExit);
  confirmExit.onclick=async()=>{
   if(exiting)return;
   if(window.gotDialogue?.busy||window.gotMemory?.worker?.isRunning?.()){
    exitStatus.textContent='当前仍在生成或整理内容，请取消退出，先完成或停止该请求。';return;
   }
   exiting=true;for(const b of [cancelExit,goSave,confirmExit])b.disabled=true;exitStatus.textContent='正在退出……';
   try{
    const response=await fetch('/api/exit',{method:'POST',headers:{'X-Got-Exit':'confirmed'},signal:AbortSignal.timeout(5000)});
    const result=await response.json();if(!response.ok||!result.exiting)throw Error(result.error||'服务未确认退出。');
    window.bgmManager?.stop?.();exit.querySelector('h2').textContent='游戏已退出';exitMessage.textContent='本地服务已关闭，可以关闭此标签页。下次双击“启动游戏”即可重新进入。';exitStatus.textContent='';
    for(const b of [cancelExit,goSave,confirmExit])b.hidden=true;
   }catch(e){
    exiting=false;for(const b of [cancelExit,goSave,confirmExit])b.disabled=false;
    exitStatus.textContent='未能确认退出：'+(e.name==='TimeoutError'?'服务响应超时。':e.message)+' 页面和进度仍保留，可取消后重试。';
   }
  };
  const canLeave=()=>window.promptManagerModal?.mayLeave?.()!==false;
  settings.querySelector('.court-close').onclick=()=>{if(canLeave())settings.close();};
  settings.addEventListener('cancel',e=>{if(settings.querySelector('#prompt-editor-modal')){e.preventDefault();window.promptManagerModal?._close();}else if(!canLeave())e.preventDefault();});
  for(const [label,id]of [['正文API','dialogue-prose-api'],['中间层API','dialogue-middle-api']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{if(!canLeave())return;settings.close();document.getElementById(id)?.click();};settings.append(b);}
  const prompt=document.createElement('button');prompt.textContent='提示词与预设';prompt.onclick=()=>{const section=document.getElementById('prompt-section');section.hidden=false;settings.append(section);window.promptManagerModal?.render(document.getElementById('gs-prompt-manager-root'));};settings.append(prompt);
  const help=document.createElement('p');help.textContent='既定剧情与选项无需模型。自由交谈使用你配置的连接。';settings.append(help);
  const developer=document.createElement('details'),summary=document.createElement('summary');summary.textContent='开发检查';developer.append(summary);
  for(const [label,href]of [['生成检查','got-generation.html'],['独立终章测试','got-finale.html'],['隔离开局','got-state.html?opening-test=1'],['状态检查','got-state.html?debug=1']]){const a=document.createElement('a');a.textContent=label;a.href=href;developer.append(a);}
  if(new URLSearchParams(location.search).get('debug')==='1')settings.append(developer);
  const quit=document.createElement('button');quit.id='court-exit-open';quit.textContent='退出游戏';quit.onclick=()=>{if(!canLeave())return;settings.close();exitStatus.textContent='';exit.showModal();};settings.append(quit);
  let roster=document.createElement('aside');roster.id='court-roster';roster.setAttribute('aria-label','在场人物');document.body.append(roster);
 }
 const minute=g.clock.elapsed_minutes+360,tod=minute%1440;
 document.getElementById('court-time').textContent=`第${Math.floor(g.clock.elapsed_minutes/10080)+1}周 · 第${Math.floor(minute/1440)+1}日  ${String(Math.floor(tod/60)).padStart(2,'0')}:${String(tod%60).padStart(2,'0')}`;
 const roster=document.getElementById('court-roster');const open=roster.querySelector('#presence-fold')?.open;roster.replaceChildren();
 const presence=document.querySelector('#opening-panel .portrait-roster');if(presence){const fold=document.createElement('details');fold.id='presence-fold';fold.open=open??false;const h=document.createElement('summary');h.textContent='在场人物 · '+presence.children.length;fold.append(h,presence);roster.append(fold);}
 roster.hidden=!presence;
 let stage=document.getElementById('court-stage');if(!stage){stage=document.createElement('div');stage.id='court-stage';document.body.prepend(stage);}const scene=document.querySelector('#opening-panel .scene-art');stage.replaceChildren(...(scene?[scene]:[]));
 renderCourtMenus(runtime,controls);
 // Present the original action nodes in C's right-hand rail; preserve handlers,
 // disabled states and the main region's forced-scene inert boundary.
 const host=document.getElementById('opening-panel');
 const room=host?.querySelector('.room-routine'),notice=host?.querySelector(':scope>.scene-notice');
 if(room&&notice)room.prepend(notice);
 const actions=[...(host?.children||[])].filter(e=>e.tagName==='BUTTON'&&!['return-region-map','switch-region'].includes(e.id));
 if(actions.length&&!document.body.classList.contains('on-map')){
  const rail=document.createElement('nav');rail.className='court-action-rail';rail.setAttribute('aria-label','当前可选行动');
  rail.append(...actions);const proposals=host.querySelector(':scope>.council-proposals');if(proposals)rail.append(proposals);host.append(rail);
 }
 document.body.classList.add('curtain-narrative');
 const focus=document.querySelector('#opening-panel .got-folio[data-focus]')?.dataset.focus;
 for(const seat of document.querySelectorAll('.council-seat'))seat.classList.toggle('speaking-seat',seat.dataset.actor===focus);
 const debug=new URLSearchParams(location.search).get('debug')==='1';document.body.classList.toggle('court-debug',debug);
}
