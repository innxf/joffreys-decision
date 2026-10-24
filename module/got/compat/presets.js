import {BUDGET,budgetLimits,estimateMessages} from './generation-budget.js';
                                                                    
// SillyTavern 1.16.0 text-only Chat Completion preset compatibility.
                                       
                                                                
                                             
                                                                                
                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                          
                                                                                 
                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                 
const roles       =['system','user','assistant'];
const safeKey=(k       )=>!['__proto__','constructor','prototype'].includes(k);
const assert=(v        ,m       )     =>{if(!v)throw Error(m);};
const json=(x        )=>JSON.stringify(x);
export function validatePreset(p       ){
 assert(p&&typeof p.id==='string'&&typeof p.name==='string'&&Number.isInteger(p.version)&&p.data&&Array.isArray(p.data.prompts)&&p.data.prompts.length<=200,'预设基础格式无效。');
 assert(new Set(p.data.prompts.map(x=>x.identifier)).size===p.data.prompts.length,'提示词编号重复。');
 for(const x of p.data.prompts)assert(typeof x.identifier==='string'&&(!x.role||roles.includes(x.role))&&(x.content===undefined||typeof x.content==='string'),'提示词条目格式无效。');
 assert(Array.isArray(p.data.prompt_order)&&p.data.prompt_order.length>0&&p.data.prompt_order.every(x=>Array.isArray(x.order)&&x.order.every(e=>typeof e.identifier==='string'&&typeof e.enabled==='boolean'))&&Number.isInteger(p.order)&&!!p.data.prompt_order[p.order],'选择的发送顺序不存在。');
 assert(json(p).length<500000,'预设超过本版500KB限制。');
}
export function importPreset(raw       ,name='导入预设')        {const x=JSON.parse(raw);const data=structuredClone(x.data?.prompts?x.data:x);if(!Array.isArray(data.prompts))throw Error('需要酒馆聊天预设的prompts数组。');if(!data.prompt_order?.length)data.prompt_order=[{character_id:100001,order:data.prompts.map((p       )=>({identifier:p.identifier,enabled:true}))}];const p       ={id:crypto.randomUUID(),name:x.name||name,version:1,order:Math.max(0,data.prompt_order.findIndex((o                      )=>o.character_id===100001)),data};validatePreset(p);return p;}
export function exportPreset(p       ){validatePreset(p);return JSON.stringify(p.data,null,2);}
export const MARKERS=['worldInfoBefore','worldInfoAfter','personaDescription','charDescription','charPersonality','scenario','dialogueExamples','chatHistory','gameContract','gamePayload','gameGuidance'];
export function defaultLibrary()         {const items         =(['pre','prose','post']           ).map(phase=>{const prompts         =[{identifier:'main',name:'主提示词',role:'system',content:phase==='prose'?'用中文扮演{{char}}，回应{{user}}。直接输出对白和可观察动作，不输出JSON，不代替玩家决定。':'你是游戏中间处理助手。按本次输出合同返回JSON，不附Markdown。'},...['gameContract','charDescription','scenario','worldInfoBefore','gameGuidance','gamePayload','chatHistory'].map(identifier=>({identifier,name:identifier,role:'system'        ,marker:true})),{identifier:'jailbreak',name:'历史后指令',role:'system',content:''}];return {id:'default-'+phase,name:{pre:'前置认知 · 项目默认',prose:'正文 · 项目默认',post:'后置解析 · 项目默认'}[phase],version:1,order:0,data:{prompts,prompt_order:[{character_id:100001,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))}],openai_max_context:BUDGET.context,openai_max_tokens:BUDGET.output,temperature:phase==='prose'?0.8:0.2,top_p:1,assistant_prefill:'',continue_prefill:true,continue_nudge_prompt:'继续当前尚未确认的回复，不重写已经生成的部分。',custom_prompt_post_processing:'',names_behavior:0}};});return {version:1,items,bindings:{pre:'default-pre',prose:'default-prose',post:'default-post'}};}
export function loadLibrary()         {const raw=localStorage.getItem('joffrey-presets-v1');if(!raw)return defaultLibrary();const x=JSON.parse(raw)           ;assert(x.version===1&&Array.isArray(x.items),'预设库格式不支持。');x.items.forEach(validatePreset);for(const id of Object.values(x.bindings))assert(x.items.some(p=>p.id===id),'预设绑定丢失。');return x;}
export function saveLibrary(l        ){l.items.forEach(validatePreset);assert(Object.values(l.bindings).every(id=>l.items.some(p=>p.id===id)),'不能删除正在使用的预设。');localStorage.setItem('joffrey-presets-v1',json(l));}
export function selectedPresets(l        )                     {return Object.fromEntries((['pre','prose','post']           ).map(k=>[k,structuredClone(l.items.find(p=>p.id===l.bindings[k]) )]))                        ;}
export function expandMacros(source       ,values                      ,variables                      ,warnings         )        {
 let s=source;for(let pass=0;pass<20&&/\{\{[^{}]*\}\}/.test(s);pass++){let changed=false;s=s.replace(/\{\{([^{}]*)\}\}/g,(whole,body       )=>{const [raw,...args]=body.split('::');const key=raw .trim().toLowerCase();if(key in values){changed=true;return values[key] ;}
 if(key==='trim'){changed=true;return '\u0001';}if(key==='noop'||key.startsWith('//')){changed=true;return '';}
 if(['setvar','getvar','addvar','incvar','decvar','setglobalvar','getglobalvar'].includes(key)){const name=(key.includes('global')?'global:':'local:')+(args[0]??'');if(!args[0]||!safeKey(args[0]))throw Error('无效预设变量名。');changed=true;
  if(key.startsWith('get'))return variables[name]??'';if(key.startsWith('set')){variables[name]=args.slice(1).join('::');return '';}
  const old=variables[name]??'0';const n=key==='incvar'?1:key==='decvar'?-1:Number(args[1]);variables[name]=Number.isFinite(Number(old))&&Number.isFinite(n)?String(Number(old)+n):old+args.slice(1).join('::');return key==='incvar'||key==='decvar'?variables[name]  :'';
 }warnings.push('未支持宏：'+whole);return whole;});if(!changed)break;}
 return s.replace(/\s*\u0001\s*/g,'');
}
const settings=new Set(['prompts','prompt_order','temperature','top_p','top_k','top_a','min_p','frequency_penalty','presence_penalty','repetition_penalty','seed','openai_max_context','openai_max_tokens','stop','stop_strings','assistant_prefill','continue_prefill','continue_nudge_prompt','continue_postfix','custom_prompt_post_processing','names_behavior','wi_format','scenario_format','personality_format','new_chat_prompt','new_example_chat_prompt','group_nudge_prompt','send_if_empty','stream_openai','name','extensions','reasoning_effort','verbosity']);
export function presetWarnings(p       ){const w         =[];for(const [k,v]of Object.entries(p.data))if(!settings.has(k)&&v!==null&&v!==''&&v!==false)w.push('保留但不执行字段：'+k);return w;}
export function postProcess(ms          ,mode       ,user       ,char       )          {
 if(!mode)return ms;if(!['merge','claude','semi','strict','single'].includes(mode))throw Error('未支持消息处理模式：'+mode);
 let out          =[];for(const m of ms){let content=m.content,role=m.role;if(m.name)content=m.name+': '+content;if(mode==='single'){if(!m.name&&role!=='system')content=(role==='user'?user:char)+': '+content;role='user';}if(out.at(-1)?.role===role&&content)out.at(-1) .content+='\n\n'+content;else out.push({role,content});}
 if(!out.length)out=[{role:'user',content:"Let's get started."}];if(['semi','strict'].includes(mode)){out=out.map((m,i)=>i>0&&m.role==='system'?{...m,role:'user'}:m);if(mode==='strict'&&(out[0] .role!=='user')&&(out[0] .role!=='system'||out[1]?.role!=='user'))out.splice(out[0] .role==='system'?1:0,0,{role:'user',content:"Let's get started."});return postProcess(out,'merge',user,char);}return out;
}
export function compilePreset(p       ,input            ,capacity         ={})          {
 validatePreset(p);const d=p.data,warnings=presetWarnings(p),vars={...input.vars};
 const values                      ={user:input.user,char:input.char,description:input.personality,personality:input.personality,scenario:input.scenario,persona:input.user,mesexamples:(input.examples??[]).map(x=>x.content).join('\n'),lastmessage:input.input||input.history.at(-1)?.content||'',lastusermessage:input.input,lastcharmessage:[...input.history].reverse().find(x=>x.role==='assistant')?.content??'',newline:'\n',input:input.input};
 const expand=(v        )=>expandMacros(typeof v==='string'?v:'',values,vars,warnings);const wrap=(tpl        ,body       ,macro       )=>typeof tpl==='string'&&tpl?expand(tpl.replaceAll(macro,body)):body;
 const active=p.data.prompt_order[p.order] .order.filter(e=>e.enabled).map(e=>{const x=p.data.prompts.find(x=>x.identifier===e.identifier);if(!x)throw Error('顺序引用了不存在的条目：'+e.identifier);return x;}).filter(x=>!x.injection_trigger?.length||x.injection_trigger.includes(input.generation));
 const expanded=active.map(x=>{let content                 ;switch(x.identifier){case 'gameContract':content=input.contract;break;case 'gamePayload':content=json(input.payload);break;case 'gameGuidance':content=input.guidance;break;case 'worldInfoBefore':content=wrap(d.wi_format,input.known,'{0}');break;case 'worldInfoAfter':content='';break;case 'personaDescription':content=input.user;break;case 'charDescription':content=input.personality;break;case 'charPersonality':content=wrap(d.personality_format,input.personality,'{{personality}}');break;case 'scenario':content=wrap(d.scenario_format,input.scenario,'{{scenario}}');break;case 'chatHistory':case 'dialogueExamples':content='';break;default:if(x.marker)warnings.push('未知占位条目：'+x.identifier);content=expand(x.content??'');}return {...x,role:x.role??'system',content};});
 for(const x of expanded){if(x.injection_position!==undefined&&![0,1].includes(x.injection_position))warnings.push('未知插入位置：'+x.identifier);if((x.injection_depth??0)<0||!Number.isInteger(x.injection_depth??0))throw Error('深度必须是非负整数。');}
 const parameters                       ={};for(const k of ['temperature','top_p','top_k','top_a','min_p','frequency_penalty','presence_penalty','repetition_penalty','seed'])if(d[k]!==undefined){assert(typeof d[k]==='number'&&Number.isFinite(d[k]),'参数必须是数值：'+k);if(k!=='seed'||(d[k]          )>=0)parameters[k]=d[k];}
 // Chat-compatible convention; no provider-specific capability is inferred from an imported preset.
 const effort=d.reasoning_effort;
 if(effort!==undefined&&effort!==''&&effort!=='auto'){
  assert(typeof effort==='string'&&['none','min','minimal','low','medium','high','max','xhigh'].includes(effort),'不支持的 reasoning_effort 值。');
  parameters.reasoning_effort=effort==='max'?'high':effort==='min'?'low':effort;
  if(effort==='min'||effort==='max')warnings.push('reasoning_effort '+effort+' 按通用Chat兼容约定发送为 '+parameters.reasoning_effort+'；不推断服务商专用思考预算。');
 }
 const verbosity=d.verbosity;
 if(verbosity!==undefined&&verbosity!==''&&verbosity!=='auto'){assert(['low','medium','high'].includes(String(verbosity)),'不支持的 verbosity 值。');parameters.verbosity=verbosity;}
 if(parameters.reasoning_effort||parameters.verbosity)warnings.push('思考强度和详细程度已加入请求；当前服务是否接受仍需实测，不支持时明确报错，不自动删参。');
 const stops=d.stop??d.stop_strings;if(stops!==undefined){assert(Array.isArray(stops)&&stops.every(x=>typeof x==='string'),'停止词必须是字符串数组。');parameters.stop=stops;}
 const max=Number(d.openai_max_tokens??BUDGET.output),context=Number(d.openai_max_context??BUDGET.context);const limits=budgetLimits(context,max,capacity);parameters.max_tokens=max;
 const prefix=input.generation==='continue'&&d.continue_prefill?input.continuation??'':expand(d.assistant_prefill);const preparedHistory=input.history.map(m=>({...m}));
 // Current utterance and unfinished continuation are not removable history.
 const current        ={role:'user',content:input.input||expand(d.send_if_empty)||'请根据已送达事项回应。'};
 const names=Number(d.names_behavior??0);if(![-1,0,1,2].includes(names))warnings.push('未支持名称处理模式：'+names);
 const chatIntro=expand(d.new_chat_prompt),exampleIntro=expand(d.new_example_chat_prompt),continueNudge=expand(d.continue_nudge_prompt),groupNudge=expand(d.group_nudge_prompt);
 const assemble=(history          )=>{
  const reversed=[...history,current].reverse();let offset=0;const injections=expanded.filter(x=>x.injection_position===1&&x.content);const depths=[...new Set(injections.map(x=>x.injection_depth??0))].sort((a,b)=>a-b);
  for(const depth of depths){const same=injections.filter(x=>(x.injection_depth??0)===depth);const entries          =[];for(const order of [...new Set(same.map(x=>x.injection_order??100))].sort((a,b)=>b-a))for(const role of ['system','user','assistant']          ){const content=same.filter(x=>(x.injection_order??100)===order&&x.role===role).map(x=>x.content .trim()).join('\n');if(content)entries.push({role,content});}reversed.splice(Math.min(depth+offset,reversed.length),0,...entries);offset+=entries.length;}
  const hist=reversed.reverse();const out          =[];for(const x of expanded){if(x.injection_position===1)continue;if(x.identifier==='chatHistory'){const intro=chatIntro;if(intro)out.push({role:'system',content:intro});out.push(...hist);}else if(x.identifier==='dialogueExamples'){const intro=exampleIntro;if(intro)out.push({role:'system',content:intro});out.push(...(input.examples??[]));}else if(x.content)out.push({role:x.role        ,content:x.content});}
  if(input.generation==='continue'&&!d.continue_prefill){if(input.continuation)out.push({role:'assistant',content:input.continuation});const n=continueNudge;if(n)out.push({role:'system',content:n});}
  const group=groupNudge;if(group)out.push({role:'system',content:group});
  for(let i=0;i<out.length;i++){const m={...out[i] };if(m.name&&(names===2||(names===0&&(m.role==='assistant'||!!m.speaker&&m.speaker!==input.user))))m.content=(m.speaker??m.name)+': '+m.content;if(names!==1)delete m.name;else if(m.name)m.name=m.name.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64);delete m.speaker;out[i]=m;}
  let result=postProcess(out,String(d.custom_prompt_post_processing??''),input.user,input.char);if(prefix){if(result.at(-1)?.role==='assistant')result[result.length-1]={role:'assistant',content:result.at(-1) .content+'\n\n'+prefix};else result.push({role:'assistant',content:prefix});}return result;
 };
 let history=preparedHistory,trimmed=0,messages=assemble(history);const estimate=estimateMessages;while(estimate(messages)>limits.inputLimit&&history.length){history=history.slice(1);trimmed++;messages=assemble(history);}if(estimate(messages)>limits.inputLimit)throw Error('必要资料超过输入上界或服务上下文扣除输出预留后的容量；请整理资料或缩短预设，没有发送请求。');
 if(estimate(messages)>=limits.softInput)warnings.push('材料达到70K整理阈值（或更小的服务容量）；本批仅提示，后台整理在第2批接入。');
 if(!limits.capacityVerified)warnings.push('服务实际容量未完整填写；128K等配置是请求预算，不是模型能力认证。');
 if(warnings.some(x=>/未支持宏|未知占位|未知插入|未支持名称/.test(x)))throw Error([...new Set(warnings)].join('\n'));
 if(input.contract&&!active.some(x=>x.identifier==='gameContract'))warnings.push('项目输出合同条目未启用，可能无法通过后置校验。');
 if(!active.some(x=>x.identifier==='chatHistory'))warnings.push('聊天历史条目未启用；当前输入只在项目资料条目存在时可见。');
 return {budget:{...limits,estimatedInput:estimate(messages),needsOrganization:estimate(messages)>=limits.softInput},messages,parameters,prefix,rawPrefix:prefix,vars,warnings:[...new Set(warnings),'token沿用姬侠传的中日韩字符加权估算，不是模型精确计数。'],estimatedTokens:estimate(messages),trimmed,preset:{id:p.id,version:p.version},generation:input.generation};
}
