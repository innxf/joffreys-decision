// Only selection/preferences live here. Playback belongs to inherited bgm-manager.js.
import {playerPlace,playerRegion} from './navigation-engine.mjs';
import {lightingPeriod} from './scene-art.mjs';
export function musicPath(catalog,g){
 const period=lightingPeriod(g.clock.elapsed_minutes),place=playerPlace(g),region=playerRegion(g);
 const context=g.finale?.entry?'finale':['battle','battle-result'].includes(g.campaign?.scene)?'blackwater':g.opening?.meetings?.some(m=>m.status==='in_progress')?'council':null;
 const pick=x=>typeof x==='string'?x:(x?.[period]||x?.default||'');
 const file=pick(catalog.contexts?.[context])||pick(catalog.places?.[place])||pick(catalog.regions?.[region])||catalog.default||'';
 if(!file)return '';
 if(typeof file!=='string'||file.startsWith('/')||file.includes('..')||/[\\:#?]/.test(file)||!(/\.(mp3|ogg|wav|m4a)$/i).test(file))throw Error('音乐清单使用music文件夹内的相对音频路径。');
 return 'assets/got/music/'+file;
}
let catalog,loading,world,audio,issue='',mounted=false;
const preferenceKey='got-music-preferences-v1';
function showStatus(){const p=document.getElementById('got-music-status');if(p)p.textContent=issue||(!catalog?'正在读取音乐清单……':!window.bgmManager.getPlayingPath()?'暂未配置此处的音乐。添加资源后即可使用。':'音乐已载入；浏览器可能需要点击后播放。');}
export function updateMusic(g){
 world=g;const manager=globalThis.bgmManager;if(!manager)return;
 if(!audio){audio=document.createElement('audio');audio.preload='none';audio.id='got-bgm';audio.hidden=true;document.body.append(audio);manager.init(audio);
  let pref;try{pref=JSON.parse(localStorage.getItem(preferenceKey));}catch{}
  if(pref){manager.setEnabled(pref.enabled!==false);manager.setVolume(pref.volume??0.5);}
  audio.addEventListener('error',()=>{issue='音乐文件无法播放，请检查资源路径和格式。';showStatus();});
 }
 if(!loading){loading=fetch('assets/got/music/catalog.json').then(r=>{if(!r.ok)throw Error('音乐清单未找到。');return r.json();}).then(v=>{if(v.version!==1)throw Error('音乐清单版本不兼容。');catalog=v;updateMusic(world);}).catch(e=>{issue=e.message;showStatus();});}
 if(catalog)try{const path=musicPath(catalog,g);if(path){if(path!==manager.getPlayingPath())issue='';manager.play(path);}else if(manager.getPlayingPath())manager.stop();}catch(e){issue=e.message;manager.stop();}
 showStatus();
}
export function mountMusicSettings(host){
 if(mounted||!globalThis.bgmManager)return;mounted=true;
 const box=document.createElement('fieldset'),title=document.createElement('legend');title.textContent='背景音乐';box.append(title);
 const label=document.createElement('label'),enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=bgmManager.getEnabled();label.append(enabled,document.createTextNode('启用音乐'));
 const volumeLabel=document.createElement('label'),volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value=String(bgmManager.getVolume()*100);volumeLabel.append(document.createTextNode('音量'),volume);
 const save=()=>{try{localStorage.setItem(preferenceKey,JSON.stringify({enabled:enabled.checked,volume:Number(volume.value)/100}));}catch{issue='音量设置暂时无法保存。';}showStatus();};
 enabled.onchange=()=>{bgmManager.setEnabled(enabled.checked);if(world)updateMusic(world);save();};volume.oninput=()=>{bgmManager.setVolume(Number(volume.value)/100);save();};
 label.style.display='block';volumeLabel.style.display='block';volumeLabel.style.marginTop='0.6em';volume.style.display='block';volume.setAttribute('aria-label','音乐音量');
 const status=document.createElement('p');status.id='got-music-status';status.setAttribute('role','status');box.append(label,volumeLabel,status);host.append(box);showStatus();
}
