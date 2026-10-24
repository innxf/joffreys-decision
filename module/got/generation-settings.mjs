import {labels,nativeDefaults,phases} from './generation-core.mjs';
import {importPreset,exportPreset,validatePreset,defaultLibrary} from './compat/presets.js';
import {inspectPreset,addProjectMarkers} from './compat/preset-compatibility.js';
export function installPromptSettings(client,status){
const $=id=>document.getElementById(id);
const run=fn=>async()=>{try{await fn();}catch(e){status(e.message);}};
const download=(name,value)=>{const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,fn,id)=>{const b=node('button',text,'cfg-btn cfg-btn-subtle');b.type='button';if(id)b.id=id;b.onclick=run(fn);return b;};
const select=(values,value,change)=>{const s=node('select');for(const [v,t]of values){const o=node('option',t);o.value=v;s.append(o);}s.value=String(value);s.onchange=change;return s;};
const field=(title,control)=>{const l=node('label',title+' ');l.append(control);return l;};
let editingPhase='prose', editing=null, baseline='', selectedMode='native',parametersInvalid=false;
const dirty=()=>parametersInvalid||editing&&JSON.stringify(editing)!==baseline;
const mayLeave=()=>!dirty()||confirm('预设尚未保存。放弃这些修改并切换？');
function loadEditor(){parametersInvalid=false;selectedMode=client.settings.modes[editingPhase];editing=structuredClone(client.settings.library.items.find(p=>p.id===client.settings.library.bindings[editingPhase]));baseline=JSON.stringify(editing);}
function redraw(){window.promptManagerModal.render($('gs-prompt-manager-root'));}
client.saveNativePart=async(key,value)=>{
 const [,phase,part]=key.split('_');if(!phases.includes(phase)||!Object.hasOwn(nativeDefaults,part))throw Error('未知提示词条目。');
 const next=structuredClone(client.settings);if(value===null)delete next.native[phase][part];else next.native[phase][part]=value;await client.saveSettings(next);
};
// Extend the original manager and reuse its text editor, save and restore-default controls.
const renderControls=root=>{
 if(!editing)loadEditor();
 const top=node('div',undefined,'buttons');
 top.append(field('任务',select(phases.map(p=>[p,labels[p]]),editingPhase,e=>{if(!mayLeave()){e.target.value=editingPhase;return;}editingPhase=e.target.value;loadEditor();redraw();})),field('编排方式',select([['native','姬侠传原作编排'],['tavern','酒馆聊天预设']],selectedMode,async e=>{
  if(!mayLeave()){e.target.value=selectedMode;return;}const next=structuredClone(client.settings);next.modes[editingPhase]=e.target.value;
  try{await client.saveSettings(next);loadEditor();redraw();}catch(error){status(error.message);e.target.value=selectedMode;}
 })));
 root.append(top,node('p','人物、地点与已知资料由本次任务传入。正式对话按本人知情筛选，生成检查页使用固定样本；不读取完整世界或启用后台记忆。'));
};
const groups=()=>{
 const names={opening:'主提示词',background:'世界与规则说明',style:'表达要求',order:'本次行动指令',prefill:'第五条助手内容',final:'最后指令'};
 const defaults={...nativeDefaults,...(editingPhase!=='prose'?{style:'客观整理本次资料。',prefill:'我会按要求输出JSON。'}:{})};
 const native=selectedMode==='native'?Object.entries(names).map(([part,label])=>[{key:'GOT_'+editingPhase+'_'+part,label,editable:true,value:client.settings.native[editingPhase][part]??defaults[part],overridden:Object.hasOwn(client.settings.native[editingPhase],part)}]):[];
 const d=window.gotDialogue?.draft, input=d?.requests?.at(-1)?.snapshot?.input||client.lastPreview?.input;
 native.push(['personality','scenario','known','memory'].map((part,i)=>({key:'READ_'+part,label:['人物资料','当前场景','本人已知资料','相关记忆'][i],editable:false,value:input?JSON.stringify(part==='memory'?{previous:input.previous,recent:input.recent,recalled:input.recalled}:input[part]??'本次资料中没有这一项',null,2):'尚无本轮资料。开始对话或使用发送预览后查看实际提供的材料。'})));
 return native;
};
const renderExtension=root=>{
 if(selectedMode==='native')return;
 const toolbar=node('div',undefined,'buttons');
 toolbar.append(select(client.settings.library.items.map(p=>[p.id,p.name]),editing.id,e=>{if(!mayLeave()){e.target.value=editing.id;return;}editing=structuredClone(client.settings.library.items.find(p=>p.id===e.target.value));baseline=JSON.stringify(editing);redraw();}));
 toolbar.append(button('新建',()=>{if(!mayLeave())return;editing=structuredClone(defaultLibrary().items.find(p=>p.id==='default-'+editingPhase));editing.id=crypto.randomUUID();editing.name='新预设';baseline='';redraw();},'preset-new'));
 toolbar.append(button('复制',()=>{editing=structuredClone(editing);editing.id=crypto.randomUUID();editing.name+=' · 副本';editing.version=1;baseline='';redraw();}));
 toolbar.append(button('重命名',()=>{const name=prompt('预设名称',editing.name);if(name?.trim()){editing.name=name.trim();redraw();}}));
 toolbar.append(button('保存并绑定当前任务',async()=>{
  if(parametersInvalid)throw Error('生成参数不是有效JSON，请先修正，未保存任何修改。');
  validatePreset(editing);const next=structuredClone(client.settings),p=structuredClone(editing);p.version=(next.library.items.find(x=>x.id===p.id)?.version||0)+1;
  const i=next.library.items.findIndex(x=>x.id===p.id);if(i<0)next.library.items.push(p);else next.library.items[i]=p;next.library.bindings[editingPhase]=p.id;
  await client.saveSettings(next);loadEditor();redraw();status('预设已保存并绑定'+labels[editingPhase]+'；没有发起请求。');
 },'preset-save'));
 toolbar.append(button('删除',async()=>{if(Object.values(client.settings.library.bindings).includes(editing.id))throw Error('此预设仍被任务使用，请先绑定其他预设。');if(!confirm('删除此预设？'))return;const next=structuredClone(client.settings);next.library.items=next.library.items.filter(p=>p.id!==editing.id);await client.saveSettings(next);loadEditor();redraw();}));
 toolbar.append(button('导出',()=>download(editing.name+'.json',exportPreset(editing)),'preset-export'));
 const upload=node('input');upload.type='file';upload.accept='.json,application/json';upload.id='preset-import';upload.onchange=run(async()=>{if(!upload.files[0]||!mayLeave())return;editing=importPreset(await upload.files[0].text(),upload.files[0].name);baseline='';redraw();status('已读入预设，尚未覆盖原配置；检查后保存并绑定。');});
 toolbar.append(field('导入JSON',upload));root.append(toolbar);
 root.append(field('使用哪一套发送顺序',select(editing.data.prompt_order.map((o,i)=>[i,'顺序 '+(i+1)+'（'+o.character_id+'）']),editing.order,e=>{editing.order=Number(e.target.value);redraw();})));
 root.append(button('生成包含游戏资料条目的副本',()=>{editing=structuredClone(editing);editing.id=crypto.randomUUID();editing.name+=' · 资料适配副本';editing.version=1;addProjectMarkers(editing);baseline='';redraw();status('副本增加合同、指导、资料与历史条目。原件和生成参数保持原样；保存后才使用。');}));
 const order=editing.data.prompt_order[editing.order].order, list=node('div');list.id='preset-rows';
 const move=(from,to)=>{if(to<0||to>=order.length)return;order.splice(to,0,order.splice(from,1)[0]);redraw();};
 order.forEach((entry,i)=>{
  const p=editing.data.prompts.find(p=>p.identifier===entry.identifier),row=node('div',undefined,'got-prompt-row');row.draggable=true;row.ondragstart=e=>e.dataTransfer.setData('text/plain',String(i));row.ondragover=e=>e.preventDefault();row.ondrop=e=>{e.preventDefault();const from=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(from)&&from>=0&&from<order.length)move(from,i);};
  const enabled=node('input');enabled.type='checkbox';enabled.checked=entry.enabled;enabled.onchange=()=>{entry.enabled=enabled.checked;};row.append(field('启用',enabled),node('strong',p?.name||entry.identifier),button('↑',()=>move(i,i-1)),button('↓',()=>move(i,i+1)));
  if(!p){row.append(node('p','此顺序引用的条目不存在；请修复后发送。'));list.append(row);return;}
  const title=node('input');title.value=p.name||p.identifier;title.oninput=()=>p.name=title.value;row.append(field('条目名称',title));
  row.append(field('角色',select(['system','user','assistant'].map(x=>[x,x]),p.role||'system',e=>p.role=e.target.value)),field('插入',select([[0,'相对顺序'],[1,'聊天内深度']],p.injection_position||0,e=>p.injection_position=Number(e.target.value))));
  for(const [key,title,fallback]of [['injection_depth','深度',0],['injection_order','同深度顺序',100]]){const n=node('input');n.type='number';n.min='0';n.value=p[key]??fallback;n.oninput=()=>p[key]=Number(n.value);row.append(field(title,n));}
  const triggers=node('input');triggers.value=(p.injection_trigger||[]).join(',');triggers.placeholder='留空表示所有类型';triggers.oninput=()=>p.injection_trigger=triggers.value.split(',').map(x=>x.trim()).filter(Boolean);row.append(field('触发类型 normal / continue / quiet',triggers));
  if(p.marker)row.append(node('p','动态资料条目：'+p.identifier+'；内容由允许资料填入。'));
  else{const content=node('textarea');content.rows=3;content.value=p.content||'';content.setAttribute('aria-label',(p.name||p.identifier)+'内容');content.oninput=()=>p.content=content.value;row.append(content);}
  row.append(button('从本顺序移除',()=>{order.splice(i,1);redraw();}));list.append(row);
 });root.append(list);
 root.append(button('添加提示词',()=>{const identifier=crypto.randomUUID();editing.data.prompts.push({identifier,name:'新条目',role:'system',content:''});order.push({identifier,enabled:true});redraw();}));
 const unused=editing.data.prompts.filter(p=>!order.some(x=>x.identifier===p.identifier));if(unused.length){const s=select(unused.map(p=>[p.identifier,p.name||p.identifier]),unused[0].identifier);root.append(field('未在此顺序内的条目',s),button('加入顺序',()=>{order.push({identifier:s.value,enabled:true});redraw();}));}
 for(const [key,title]of [['assistant_prefill','末尾助手预填充'],['continue_nudge_prompt','续写指令'],['custom_prompt_post_processing','消息后处理（留空／merge／strict等）']]){const input=node('textarea');input.rows=2;input.value=editing.data[key]??'';input.oninput=()=>editing.data[key]=input.value;root.append(field(title,input));}
 const continuePrefill=node('input');continuePrefill.type='checkbox';continuePrefill.checked=!!editing.data.continue_prefill;continuePrefill.onchange=()=>editing.data.continue_prefill=continuePrefill.checked;root.append(field('续写使用现有正文作为助手预填充',continuePrefill));
 const extras=node('details'),text=node('textarea');extras.append(node('summary','生成参数与其他原始字段（完整保留）'));text.rows=10;
 const omitted=new Set(['prompts','prompt_order','assistant_prefill','continue_nudge_prompt','continue_prefill','custom_prompt_post_processing']);text.value=JSON.stringify(Object.fromEntries(Object.entries(editing.data).filter(([k])=>!omitted.has(k))),null,2);
 text.oninput=()=>{try{const v=JSON.parse(text.value);if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>omitted.has(k)||['__proto__','constructor','prototype'].includes(k)))throw Error('这里只编辑参数和额外字段。');for(const k of Object.keys(editing.data))if(!omitted.has(k))delete editing.data[k];Object.assign(editing.data,v);parametersInvalid=false;text.setCustomValidity('');}catch(e){parametersInvalid=true;text.setCustomValidity(e.message);}};extras.append(text);root.append(extras);
 const warnings=node('pre');try{const result=inspectPreset(editing,editingPhase);warnings.textContent=[...result.errors,...result.warnings].join('\n');}catch(e){warnings.textContent=e.message;}root.append(button('检查当前内容',()=>redraw()),warnings,node('p','切换任务或预设前会检查未保存修改。导出保留原始未知字段；不支持的生效项会提示或阻止发送。'));
};

window.promptManagerModal.setProvider({controls:renderControls,groups,extension:renderExtension,save:client.saveNativePart,mayLeave:()=>{if(!mayLeave())return false;loadEditor();return true;}});
return {dirty,mayLeave};
}
