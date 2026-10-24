import {installPromptSettings} from './generation-settings.mjs';
import {GenerationClient} from './generation-client.mjs';
import {labels,nativeDefaults,phases,sampleInput} from './generation-core.mjs';
import {importPreset,exportPreset,validatePreset,defaultLibrary} from './compat/presets.js';
import {inspectPreset,addProjectMarkers} from './compat/preset-compatibility.js';

const $=id=>document.getElementById(id), client=new GenerationClient(window.storageService);
window.gotGeneration=client;
const status=text=>{$('generation-status').textContent=text;};
const readable=e=>({STALE_GENERATION_RECORD:'另一页面已经保存了较新记录。本页没有覆盖它；刷新后再继续。',PRIMARY_STORAGE_UNAVAILABLE:'本地存储不可用，未发送生成请求。'}[e.message]||e.message);
const run=fn=>async()=>{try{await fn();}catch(e){status(readable(e));}};
const download=(name,value)=>{const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,id)=>{const b=node('button',text,'cfg-btn cfg-btn-subtle');b.type='button';if(id)b.id=id;b.onclick=run(fn);return b;};
const select=(values,value,change)=>{const s=node('select');for(const [v,t]of values){const o=node('option',t);o.value=v;s.append(o);}s.value=String(value);s.onchange=change;return s;};
const field=(title,control)=>{const l=node('label',title+' ');l.append(control);return l;};
const {dirty,mayLeave}=installPromptSettings(client,status);

function render(){
 const names={running:'生成中',complete:'完整草稿（未写入游戏）',truncated:'输出截断',interrupted:'连接中断',cancelled:'已取消',failed:'失败'};
 const d=client.draft;$('draft-status').textContent=d?(names[d.status]||d.status)+(d.error?'：'+d.error:''):'尚无草稿。';
 if(d)window.updateStoryText(d.display||'');
 $('metrics').textContent=JSON.stringify(d?{id:d.id,status:d.status,revision:d.revision,finishReason:d.finishReason,usage:d.usage,metrics:d.metrics,preset:d.snapshot.compiled.preset}: {},null,2);
 $('connection-status').textContent=['prose','middleware'].map(role=>{const c=client.settings.connections[role],m=client.callStats?.[role];return (role==='prose'?'正文':'中间层')+'：'+(c?c.model+'（已保存，服务兼容性待实测）':'未配置')+(m?'；本服务会话生成 '+m.calls+' 次，最近 '+m.ms+' 毫秒，服务用量 '+(m.usage?JSON.stringify(m.usage):'未返回'):'');}).join(' ｜ ');
 for(const id of ['generate','regenerate','continue-draft'])$(id).disabled=client.busy;$('cancel').disabled=!client.busy;
}
client.listeners.push(render);
$('prose-api').onclick=()=>window.showConfigModal('prose');$('middle-api').onclick=()=>window.showConfigModal('middleware');
$('prompts').onclick=()=>{if(!$('prompt-section').hidden&&!mayLeave())return;$('prompt-section').hidden=!$('prompt-section').hidden;if(!$('prompt-section').hidden)window.promptManagerModal.render($('gs-prompt-manager-root'));};
$('task').onchange=()=>{$('generation-input').value=sampleInput($('task').value).input;};$('task').onchange();
const compile=(mode='normal')=>{const phase=$('task').value,p=sampleInput(phase);p.input=$('generation-input').value;
 if(mode==='continue'&&(!client.draft?.display||client.draft.snapshot.stage!==phase))throw Error('没有属于当前任务的可续写草稿。');return client.compile(phase,p,mode,mode==='continue'?client.draft.display:'');};
const preview=s=>{$('request-preview').textContent=JSON.stringify({id:s.id,stage:s.stage,connection:{endpoint:s.preview.endpoint,model:s.connection.model},messages:s.compiled.messages,parameters:s.preview.body,prefill:s.compiled.prefix,warnings:s.preview.warnings,budget:s.compiled.budget},null,2);$('preview-container').open=true;};
$('preview').onclick=run(()=>{preview(compile());status('预览完成，没有发起请求或改变预设变量。');});
const generate=mode=>run(async()=>{const snapshot=compile(mode);preview(snapshot);await client.generate(snapshot);status('本次尝试已结束。草稿仅用于检查，不产生游戏结果。');});
$('generate').onclick=generate('normal');$('regenerate').onclick=generate('normal');$('continue-draft').onclick=generate('continue');$('cancel').onclick=()=>client.cancel();
$('export-draft').onclick=run(()=>{if(!client.draft)throw Error('尚无草稿。');download('got-generation-draft.json',JSON.stringify(client.draft,null,2));});
window.addEventListener('beforeunload',e=>{if(dirty()||client.busy){e.preventDefault();e.returnValue='';}});
try{await client.init();status('设置与草稿已恢复。保存、打开面板和预览不会请求外部模型。');}catch(e){status('载入失败，未覆盖已有记录：'+e.message);}
try{const health=await(await fetch('/api/health')).json();$('service-mode').textContent=health.modelRequestsEnabled?'本机服务允许手动发起模型请求。':'当前启动方式未开启真实模型请求；设置、预览和草稿恢复仍可用。M3已使用独立固定服务检查，真实服务留待单独验收。';}catch{$('service-mode').textContent='无法读取本机服务状态。';}
