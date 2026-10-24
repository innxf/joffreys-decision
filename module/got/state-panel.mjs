import {renderCourtCurtain} from './court-menu.mjs';
import {renderHousehold} from './household-panel.mjs';
import {setReadingContext,captureReading,restoreReading} from './folio-reader.mjs';
import {renderShell} from './folio-shell.mjs';
import {renderPlayerHUD} from './portrait-panel.mjs';
import {renderOpening} from './opening-panel.mjs';
import {mountDialogue} from './dialogue-panel.mjs';
import {createGotRuntime} from './state-runtime.mjs';
import {renderExecution,executionErrors} from './world-panel.mjs';
const $=id=>document.getElementById(id);
let runtime, busy=false;
const testMode=new URLSearchParams(location.search).get('dialogue-test')==='1';
const openingTest=new URLSearchParams(location.search).get('opening-test')==='1';
const openingNamespace=new URLSearchParams(location.search).get('council-demo')==='1'?'council-v3-preview':'opening-continuous-preview';
const worldStorage=openingTest?storageService.createGotNamespaceStorage(openingNamespace):testMode?storageService.createGotNamespaceStorage('dialogue-preview'):storageService;
const messages={STALE_STORAGE:'另一页面已更新存档，请刷新后再操作。',SAVE_FAILED:'未能保存，本次操作没有生效。请检查浏览器存储或导出已有进度。',
  PRIMARY_STORAGE_UNAVAILABLE:'主存储暂时打不开。为避免把旧备用副本当成最新进度，本页停止写入；请恢复浏览器存储后刷新。',
  INVALID_STORED_STATE:'现有存档无法解析，已停止初始化并保留原记录，没有自动覆盖为新游戏。',
  STORAGE_LOCK_UNAVAILABLE:'浏览器缺少安全写入锁，请使用本机 Chrome 打开本页。',GOT_LEGACY_PIPELINE_DISABLED:'原作结算已停用。'};
const status=text=>{const node=$('status');node.textContent=text;node.hidden=!/失败|未完成|无法|错误|尚未|失效|停止|打不开|不能|请/.test(text);};
Object.assign(messages,executionErrors);
function button(text,fn){const b=document.createElement('button');b.textContent=text;if(/^(去御前会议|继续听取陈奏|陈奏已毕|照此讨论|议题齐了|采用席间|宣布散会|前往盛典|走进会面室)$/.test(text))b.className='major-action';b.onclick=()=>run(fn);return b;}
async function act(action,confirmation){
  if(window.gotDialogue?.busy||window.gotDialogue?.draft&&!['done','discarded','stale'].includes(window.gotDialogue.draft.status))throw Error('当前对话尚未确定，请先停止或完成生成，再改变活动与世界状态。');
  if(confirmation&&!confirm(confirmation))return;
  const result=await runtime.commit(runtime.prepareAction(action));
  if(result.status!=='committed')throw Error(result.validation.code);
  status(runtime.read().opening?.version===2?'已保存。':'操作已保存。');
}
let renderRevision=0;
async function render(){
  const serial=++renderRevision;
  const v=runtime.playerView();
  setReadingContext(runtime.read(),openingTest?openingNamespace:testMode?'dialogue-preview':'formal');
  renderPlayerHUD(runtime);
  renderExecution(v,{button,act});
  renderOpening(runtime,{button,act});
  renderShell(runtime,{button,act});renderHousehold(runtime,{button,act});renderCourtCurtain(runtime);
  $('briefing').replaceChildren();
  $('clock').hidden=runtime.read()?.opening?.version===2;
  $('clock').textContent=v?`T0 + ${v.elapsed_minutes} 分钟 · ${v.phase} · 当前版本 ${v.revision}`:'尚未建立权游存档';
  for(const item of v?.briefing||[]){
    const box=document.createElement('article');box.className='panel';
    const h=document.createElement('h2');h.textContent=item.title;box.append(h);
    for(const text of [...item.reports,item.prompt]){const p=document.createElement('p');p.textContent=text;box.append(p);}
    const b=button(item.read?'已读':'标记已读',async()=>{
      const result=await runtime.commit(runtime.prepareBriefingRead(item.id));
      if(result.status!=='committed') throw Error(result.validation.code);
      status('已记录阅读，游戏时间与资源保持不变。');
    });b.disabled=item.read;box.append(b);$('briefing').append(box);
  }
  for(const key of ['save','export','import'])$(key).disabled=!v;
  $('new').disabled=false;
  $('slots').replaceChildren();
  for(const entry of await worldStorage.listSaves()){
    if(serial!==renderRevision)return;
    if(!(await worldStorage.loadSave(entry.id))?.gameData?.got)continue;
    const row=document.createElement('div');row.className='slot';
    const label=document.createElement('span');label.textContent=entry.saveName;row.append(label);
    row.append(button('读取',async()=>{if(!confirm('读取该存档？当前未另存的进度会被替换。'))return;
      await runtime.restore(await worldStorage.loadSave(entry.id));status('已读取存档，并建立新分支；旧请求不能写入这一分支。');}));$('slots').append(row);
  }
}
async function run(fn){
  if(busy)return;busy=true;const controls=[...document.querySelectorAll('button,input')].filter(e=>!e.closest('#dialogue-panel')).map(e=>[e,e.disabled]);for(const [e]of controls)e.disabled=true;
  try{await fn();}catch(e){status(messages[e.message]||`操作未完成：${e.message}`);}
  finally{busy=false;for(const [e,disabled]of controls)if(e.isConnected)e.disabled=disabled;$('save-name').disabled=false;render();}
}
let queuedPaint=false;
window.addEventListener('got-world-changed',()=>{if(!runtime||busy||queuedPaint)return;queuedPaint=true;requestAnimationFrame(()=>{queuedPaint=false;if(!busy)void render();});});
$('save').onclick=()=>run(async()=>{await runtime.saveSlot($('save-name').value.trim()||'权游存档');status('存档已写入本地存储。');});
$('export').onclick=()=>run(async()=>{storageService.downloadJson('权游存档.json',JSON.stringify(runtime.exportSave($('save-name').value.trim()||'权游存档')));status('已准备下载完整存档；文件是否保存成功请以浏览器为准。');});
$('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file)return;
  if(file.size>64*1024*1024)throw Error('当前导入文件上限为64MB；已有记录未覆盖。');
  const payload=JSON.parse(await file.text());
  if(!confirm('导入并读取这份存档？当前未另存的进度会被替换。'))return;
  await runtime.restore(payload);$('import').value='';status('存档已校验并读取，原作快照不会覆盖它。');});
$('new').onclick=()=>run(async()=>{
  if(!confirm('从既定 T0 开始？当前进度请先另存或导出。'))return;
  const old=await worldStorage.readGotState();
  if(old&&!old.gameData?.got)storageService.downloadJson('M1旧基线存档.json',JSON.stringify(old));
  if(old?.gameData?.got)await runtime.saveSlot('新开局前自动备份');
  await runtime.startNew();status('已建立 T0。未迁移旧试玩进度。');
});
try{
  const fetchJson=async path=>{const r=await fetch(path);if(!r.ok)throw Error('开局资料读取失败');return r.json();};
  const [baseline,schema,manifest,finaleContent]=await Promise.all(['opening.json','opening.schema.json','source-manifest.json','finale.json'].map(p=>fetchJson('data/got/'+p)));
  runtime=createGotRuntime({pendingDialogue:()=>storageService.readGotGenerationRecord(openingTest?openingNamespace:testMode?'dialogue-preview':'dialogue'),presentation:{capture:g=>captureReading(g,openingTest?openingNamespace:testMode?'dialogue-preview':'formal'),restore:(p,g)=>restoreReading(p,g,openingTest?openingNamespace:testMode?'dialogue-preview':'formal')},enableCampaign:!testMode,enableCourtLife:!testMode,authoredPlay:!testMode&&new URLSearchParams(location.search).get('council-demo')!=='1',finaleContent,enableOpening:!testMode,baseline,schema,sourceHash:manifest.files['opening.json'].sha256,storage:worldStorage,variables:variableSystem,onPublish:data=>{window.gameData=data;window.dispatchEvent(new Event('got-world-changed'));}});
  const result=await runtime.init();render();window.gotRuntime=runtime;
  await mountDialogue(runtime,{testMode,namespace:openingTest?openingNamespace:null,refresh:render});
  status(result.status==='legacy_present'?'检测到原作试玩记录，尚未覆盖。选择“从 T0 重新开始”时会先提供旧记录下载。':result.status==='migrated'?'原进度已备份并读取。':'进度已读取。');
}catch(e){status(messages[e.message]||`初始化失败：${e.message}。已有记录未主动清除。`);}
