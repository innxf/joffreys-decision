import {MARKERS,compilePreset,defaultLibrary,validatePreset} from './presets.js';
import {BUDGET} from './generation-budget.js';
import type {Preset,Phase,Library,PromptInput} from './presets.js';

export interface Compatibility {errors:string[];warnings:string[];recommendedOrder:number}
const phases:Phase[]=['pre','prose','post'];
const sample:PromptInput={user:'乔弗里',char:'当前人物',personality:'当前人物允许资料',scenario:'当前场景',known:'已收到的信息',guidance:'当前诉求',contract:'本阶段输出合同',payload:{preview:true},history:[],input:'预设检查，不发送请求。',generation:'normal'};
const required=['gameContract','gamePayload','worldInfoBefore','gameGuidance','chatHistory'];
export function inspectPreset(p:Preset,phase:Phase='prose'):Compatibility {
 const errors:string[]=[],warnings:string[]=[];validatePreset(p);
 const recommendedOrder=p.data.prompt_order.findIndex(x=>x.character_id===100001);
 if(recommendedOrder>=0&&p.order!==recommendedOrder)warnings.push('当前选择不是酒馆1.16.0聊天使用的 character_id=100001 顺序；不会擅自改动已保存选择。');
 const active=p.data.prompt_order[p.order]!.order.filter(o=>o.enabled).map(o=>p.data.prompts.find(x=>x.identifier===o.identifier));
 for(const id of required)if(!active.some(x=>x?.identifier===id&&(!x.injection_trigger?.length||x.injection_trigger.includes(phase==='prose'?'normal':'quiet'))))errors.push('缺少本阶段必需条目：'+id+'。可生成适配副本。');
 for(const x of active)if(x?.marker&&!MARKERS.includes(x.identifier))errors.push('未支持的动态占位：'+x.identifier+'。保留原件；适配副本可停用该条目。');
 try{const compiled=compilePreset(p,{...sample,generation:phase==='prose'?'normal':'quiet'});warnings.push(...compiled.warnings);for(const value of [sample.known,sample.guidance])if(!compiled.messages.some(m=>m.content.includes(value!)))errors.push('编译后缺少本轮知情或指导材料。');}catch(e){errors.push((e as Error).message);}
 if(phase!=='prose'&&(p.data.assistant_prefill||active.some(x=>x?.role==='assistant'&&x.content)))warnings.push('结构化处理预设含助手续写内容，可能与JSON输出合同冲突；建议使用独立前置/后置预设。');
 warnings.push('发送预览只能检查格式和组装；不能保证文风、模型效果或服务商支持全部参数。');
 return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],recommendedOrder};
}
export function checkLibrary(l:Library):string[] {
 const messages:string[]=[];
 for(const phase of phases){const p=l.items.find(x=>x.id===l.bindings[phase]);if(!p){messages.push(phase+'：绑定丢失');continue;}messages.push(...inspectPreset(p,phase).errors.map(x=>phase+' / '+p.name+'：'+x));}
 if(l.bindings.prose===l.bindings.pre||l.bindings.prose===l.bindings.post)messages.push('正文与结构化处理绑定了同一份预设；可用适配入口建立三份独立预设。');
 return messages;
}
// Place runtime information before history, never after an assistant tail/prefill.
export function addProjectMarkers(p:Preset){
 const order=p.data.prompt_order[p.order]!.order;
 const originalHistory=order.findIndex(x=>x.identifier==='chatHistory');
 const historySlot=originalHistory<0?-1:order.slice(0,originalHistory).filter(x=>!required.includes(x.identifier)).length;
 for(const id of required){
  if(!p.data.prompts.some(x=>x.identifier===id))p.data.prompts.push({identifier:id,name:id,role:'system',marker:true});
  const item=p.data.prompts.find(x=>x.identifier===id)!;
  item.marker=true;item.role='system';item.injection_position=0;item.injection_trigger=[];
  const old=order.findIndex(x=>x.identifier===id);if(old>=0)order.splice(old,1);
 }
 // Keep the existing history position, or place history before trailing assistant instructions.
 let index=historySlot;
 if(index<0){index=order.length;while(index>0&&p.data.prompts.find(x=>x.identifier===order[index-1]!.identifier)?.role==='assistant')index--;}
 order.splice(index,0,...required.map(identifier=>({identifier,enabled:true})));
}
export interface Adaptation {presets:Record<Phase,Preset>;changes:string[]}
// Budget-only migration: preserve each bound preset, including custom middle-layer instructions.
export function adaptBudgets(l:Library):Adaptation {
 const presets={} as Record<Phase,Preset>,changes:string[]=[];
 for(const phase of phases){const source=l.items.find(p=>p.id===l.bindings[phase]);if(!source)throw Error('预设绑定丢失。');
  const copy=structuredClone(source);copy.id=crypto.randomUUID();copy.version=1;copy.name+=' · 18K预算副本';
  changes.push(`${phase}：输出 ${source.data.openai_max_tokens??'未设置'} → ${BUDGET.output}；上下文 ${source.data.openai_max_context??'未设置'} → ${BUDGET.context}。`);
  copy.data.openai_max_tokens=BUDGET.output;copy.data.openai_max_context=BUDGET.context;presets[phase]=copy;
 }
 changes.push('保留三份各自的提示词、顺序、宏、预填充和未知字段；确认后切换副本。当前失败轮次仍使用旧冻结配置，不自动请求。','128K是可编辑预算，不是服务容量认证；输入70K提示整理、80K封顶，并扣除输出预留。');
 return {presets,changes};
}
// This profile was reviewed against the user's actual import. Never guess content semantics by title.
const reviewedIds={style:'58106539-e159-47ae-9cca-06d1e8b1d9b6',out:'4d179f0c-98ed-46f5-acfb-aa99b714b79b',prefill:'30ef9d7d-cf90-403d-8c2e-b65dbca95507',extra:'a9d3b11e-5e69-43e7-95e0-57f8d6017c0b'};
export function adaptForGame(source:Preset):Adaptation {
 validatePreset(source);const prose=structuredClone(source),changes:string[]=[];
 prose.id=crypto.randomUUID();prose.name=source.name+' · 游戏正文适配';prose.version=1;
 const recommended=prose.data.prompt_order.findIndex(x=>x.character_id===100001);
 if(recommended>=0){prose.order=recommended;changes.push('正文使用 character_id=100001 顺序；原始多套顺序和未知字段继续保留。');}
 const order=prose.data.prompt_order[prose.order]!.order;
 for(const o of order){const x=prose.data.prompts.find(x=>x.identifier===o.identifier);if(o.enabled&&x?.marker&&!MARKERS.includes(x.identifier)){o.enabled=false;changes.push('副本停用未实现占位：'+x.identifier+'；没有将其冒充为游戏资料。');}}
 const reviewed=Object.values(reviewedIds).every(id=>prose.data.prompts.some(x=>x.identifier===id));
 if(reviewed){for(const id of [reviewedIds.out,reviewedIds.prefill,reviewedIds.extra]){const o=order.find(x=>x.identifier===id);if(o?.enabled)o.enabled=false;}
  changes.push('此预设已核查：保留普通写作风格；副本停用另一套正文输出模板、planning预填充及本项目不制作的额外文风条目。原始内容完整保留可导出。');
 }
 const oldMax=prose.data.openai_max_tokens,oldContext=prose.data.openai_max_context;
 prose.data.openai_max_tokens=BUDGET.output;prose.data.openai_max_context=BUDGET.context;
 changes.push(`副本输出上限改为${BUDGET.output}（原值 ${oldMax??'未设置'}），上下文设为${BUDGET.context}（原值 ${oldContext??'未设置'}）；均可编辑，服务实际支持范围尚需核实。`);
 addProjectMarkers(prose);
 changes.push('启用项目合同、资料、认知指导和聊天历史；保留其他正文条目的相对顺序。');
 const defaults=defaultLibrary();const presets={prose,pre:structuredClone(defaults.items[0]!),post:structuredClone(defaults.items[2]!)};
 for(const phase of ['pre','post'] as const){presets[phase].id=crypto.randomUUID();presets[phase].name=source.name+' · '+(phase==='pre'?'前置认知':'后置解析')+'适配';}
 changes.push('前置与后置新建独立项目JSON预设；确认应用后绑定三份副本，不覆盖原预设或已有默认预设，不改变API。');
 return {presets,changes};
}
export function applyAdaptation(l:Library,a:Adaptation):Library {
 const next=structuredClone(l);
 for(const phase of phases){const p=a.presets[phase];validatePreset(p);if(next.items.some(x=>x.id===p.id))throw Error('适配副本已经应用，不能重复提交。');next.items.push(structuredClone(p));next.bindings[phase]=p.id;}
 const errors=checkLibrary(next);if(errors.length)throw Error('适配仍需处理：\n'+errors.join('\n'));
 return next;
}
