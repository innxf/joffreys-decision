import {updateMusic,mountMusicSettings} from './music.mjs';
import {setReadingContext,captureReading,restoreReading} from './folio-reader.mjs';
import {story,renderPlayerHUD} from './portrait-panel.mjs';
import {createGotRuntime} from './state-runtime.mjs';
import {profiles,makeFinaleFixture} from './finale-fixtures.mjs';
import {storyArt} from './scene-art.mjs';
import {renderBackdrop} from './scene-art-panel.mjs';
const $=id=>document.getElementById(id);let runtime,storage,baseline,busy=false,lastCursor='';
const errorMessages={SAVE_FAILED:'本次操作没有保存，进度保持在上一个成功位置。请检查本地存储后再试。',STALE_STORAGE:'另一页面已更新试玩进度，请刷新后继续。',FINALE_COMPATIBILITY_GAP:'这份存档缺少已写的终章版本，尚不能进入；原存档已保留。',FINALE_OPTION_UNAVAILABLE:'这个选项不在已冻结的选择范围内。',FINALE_ENTRY_MISSING:'请选择婚礼前测试存档，不能把T0直接当作终章。',PRIMARY_STORAGE_UNAVAILABLE:'主存储暂时打不开，已停止写入。请恢复后刷新。',INVALID_STATE:'存档资料不完整或与已支持的终章版本不一致，未覆盖已有进度。',STORAGE_LOCK_UNAVAILABLE:'浏览器缺少安全写入锁，请用Chrome打开这个本机页面。'};
const status=t=>$('status').textContent=t;
const text=(tag,t)=>{const p=document.createElement(tag);p.textContent=t;return p;};
function render(){
 const v=runtime?.finaleView();$('launcher').hidden=!!v?.active;$('player').hidden=!v?.active;
 for(const key of ['save','load','history','export'])$(key).disabled=busy||!v?.active;
 if(!v?.active)return;
 setReadingContext(runtime.read(),'finale-preview');renderPlayerHUD(runtime);
 const world=runtime.read();updateMusic(world);mountMusicSettings(document.querySelector('footer'));const clock=world.clock.elapsed_minutes+360;
 let backdrop=$('finale-backdrop');if(!backdrop){backdrop=document.createElement('div');backdrop.id='finale-backdrop';$('player').prepend(backdrop);}
 backdrop.replaceChildren();renderBackdrop(backdrop,storyArt(world,v),world.clock.elapsed_minutes,{showTime:false});
 $('clock').textContent=`D${Math.floor(clock/1440)} · ${String(Math.floor(clock%1440/60)).padStart(2,'0')}:${String(clock%60).padStart(2,'0')}`;
 $('title').textContent=v.ended?v.ending_title:v.title;$('part').textContent=v.ended?'THE END':`第${v.part}篇`;
 $('perspective').textContent=v.viewpoint==='observer'?'幕间旁观 · 不增加国王知情':'乔弗里视角';$('location').textContent=v.ended?'':v.location;
 $('prose').replaceChildren();
 const lines=v.ended?(v.history.at(-1)?.paragraphs??[]):v.paragraphs;
 story($('prose'),lines.join('\n\n'),{id:'finale:'+v.scene+':'+v.phase});
 $('options').replaceChildren();
 for(const o of v.options){const b=text('button',o.label);b.dataset.choice=o.id;b.disabled=busy;b.onclick=()=>run(()=>act({type:'finale_choose',choice_id:o.id}));$('options').append(b);}
 $('continue').hidden=v.ended||v.options.length>0;$('continue').disabled=busy;$('finished').hidden=!v.ended;
 const cursor=world.revision.branch_id+v.scene+v.phase;
 if(cursor!==lastCursor){lastCursor=cursor;window.scrollTo({top:0,behavior:'instant'});}
 $('revision-note').hidden=world.finale.content.version==='FIN-PLAYER-1.2';
}
async function act(action){const r=await runtime.commit(runtime.prepareAction(action));if(r.status!=='committed')throw Error(r.validation.code);status(action.type==='finale_enter'?'已开始新版终章。':'进度已自动保存。');}
async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=true);
 try{await fn();}catch(e){status(errorMessages[e.message]||`操作未完成：${e.message}。已有进度未被覆盖。`);}
 finally{busy=false;document.querySelectorAll('button,select,input').forEach(e=>e.disabled=false);render();}}
$('start').onclick=()=>run(async()=>{
 const old=runtime.read();if(old?.finale?.freeze)await runtime.saveSlot('重新试玩前自动备份');
 await runtime.startNew(makeFinaleFixture(baseline,$('profile').value));await act({type:'finale_enter'});
});
$('continue').onclick=()=>run(()=>act({type:'finale_continue'}));
$('restart').onclick=()=>{if(busy)return;$('launcher').hidden=false;$('player').hidden=true;status('选择测试快照后开始新试玩，原终章进度会先自动备份。');};
$('save').onclick=()=>run(async()=>{await runtime.saveSlot('终章 · '+(runtime.finaleView().title||'当前进度'));status('已另存终章进度。');});
$('export').onclick=()=>{if(busy||!runtime)return;const blob=new Blob([JSON.stringify(runtime.exportSave('终章试玩'),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='权游终章试玩.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已交给浏览器下载完整存档。');};
$('import').onchange=()=>run(async()=>{const f=$('import').files[0];if(!f)return;if(f.size>16*1024*1024)throw Error('存档超过16MB');const payload=JSON.parse(await f.text());
 if(!payload?.gameData?.got?.finale?.freeze)throw Error('这不是含冻结包的终章存档');
 await runtime.saveSlot('导入前自动备份');await runtime.restore(payload);$('import').value='';status('已恢复终章存档；沿用原来的冻结资格。');});
$('close-dialog').onclick=()=>$('dialog').close();
$('load').onclick=()=>run(async()=>{const body=$('dialog-body');body.replaceChildren(text('h2','读取终章存档'));
 for(const item of await storage.listSaves()){const row=document.createElement('div');row.className='slot';row.append(text('span',item.saveName));const b=text('button','读取');b.onclick=()=>run(async()=>{await runtime.restore(await storage.loadSave(item.id));$('dialog').close();status('已读档，保存的冻结结果保持不变。');});row.append(b);body.append(row);}
 if(body.children.length===1)body.append(text('p','尚无手动存档，当前进度仍会自动保存。'));$('dialog').showModal();});
$('history').onclick=()=>{const body=$('dialog-body');body.replaceChildren(text('h2','已读剧情 · 只读'));
 for(const item of runtime.finaleView().history){const box=document.createElement('section');box.className='history-entry';box.append(text('h3',item.title));if(item.viewpoint==='observer')box.append(text('small','幕间旁观，不进入国王记忆'));for(const t of item.paragraphs)story(box,t);if(item.choice)box.append(text('small','已选：'+item.choice));body.append(box);}$('dialog').showModal();};
try{
 const read=async p=>{const r=await fetch(p);if(!r.ok)throw Error('剧情文件读取失败');return r.json();};
 const [b,schema,manifest,content]=await Promise.all(['opening.json','opening.schema.json','source-manifest.json','finale.json'].map(n=>read('data/got/'+n)));baseline=b;
 storage=storageService.createGotNamespaceStorage('finale-preview');
 runtime=createGotRuntime({presentation:{capture:g=>captureReading(g,'finale-preview'),restore:(p,g)=>restoreReading(p,g,'finale-preview')},baseline,schema,sourceHash:manifest.files['opening.json'].sha256,finaleContent:content,storage,variables:variableSystem,onPublish:data=>window.gameData=data});
 await runtime.init();
 for(const p of profiles){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('profile').append(o);}
 render();status(runtime.finaleView()?.active?'已恢复终章自动进度，冻结资格保持不变。':'请选择婚礼前测试存档。不会改动首页的T0进度。');
}catch(e){status(errorMessages[e.message]||`无法开始：${e.message}。原记录已保留。`);$('start').disabled=true;}
