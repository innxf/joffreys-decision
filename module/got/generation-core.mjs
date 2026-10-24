import {requireMaterials} from './middleware-evidence.mjs';
import '../response-parser.js';
// GOT-only task data adapter. Prompt ordering and preset compilation remain in reused modules.
import {executionContract} from './autonomy-core.mjs';
import {defaultLibrary,compilePreset} from './compat/presets.js';
import {BUDGET,budgetLimits,estimateMessages} from './compat/generation-budget.js';
import {normalizeConnection} from './compat/google-provider.js';
import {providerRequest} from './compat/provider-request.js';
export const phases=['prose','pre','post','summary','execution'];
export const labels={prose:'正文',pre:'前置认知',post:'后置解析',summary:'人物记忆总结',execution:'执行判断'};
export const nativeDefaults={
 opening:'你正在协助创作《权游：乔弗里》的场景。只使用本次提供的资料。',
 background:'玩家扮演乔弗里。人物各有自己的经历、利益与判断；发言不等于行动已经完成。',
 style:'使用清楚自然的中文，描写可观察的动作，保持人物说话方式。不要代替玩家作出决定。',
 order:'回应本次输入，承接已知事实和上一条发言。',
 prefill:'我会按照当前任务要求回应。',final:'请完成本次任务，只输出要求的内容。'
};
export const contracts={execution:executionContract,prose:'输出以当前人物为重点的完整中文叙事片段，连贯呈现场景、可观察动作和人物对白，保留自然段，不输出JSON。本次为隔离检查，不执行世界行动。',
 pre:'仅返回JSON对象：{"known":[],"attention":[],"guidance":""}。只整理已提供的可知资料，不补出秘密或执行行动。',
 post:'仅返回JSON对象：{"replies":[],"candidates":[],"summary":""}。区分提议、承诺和声称完成；这里只提取，不执行。',summary:'仅返回JSON对象：{"entries":[{"text":"经历与约定","refs":["来源编号"]}]}。只整理收到的资料，不补秘密。'};
export function upgradeSettings(s){
 s.execution??={automatic:false};
 s.modes.execution??='native';s.native.execution??={};
 if(!s.library.bindings.execution){const p=structuredClone(defaultLibrary().items.find(p=>p.id==='default-pre'));p.id='default-execution';p.name='执行判断 · 项目默认';s.library.items.push(p);s.library.bindings.execution=p.id;}
 s.modes.summary??='native';s.native.summary??={};
 if(!s.library.bindings.summary){const p=structuredClone(defaultLibrary().items.find(p=>p.id==='default-post'));p.id='default-summary';p.name='人物记忆总结 · 项目默认';s.library.items.push(p);s.library.bindings.summary=p.id;}
 s.memory??={autoSummary:false,autoResume:false,autoRetry:false,retryLimit:0,retrieval:false,rerank:false,summaryOutput:null};return s;
}
export function initialSettings(){return upgradeSettings({revision:0,connections:{},history:{prose:[],middleware:[]},modes:{prose:'native',pre:'native',post:'native'},native:{prose:{},pre:{},post:{}},library:defaultLibrary()});}
export function defaultConnection(){return {type:'openai',endpoint:'',apiKey:'',model:'',temperature:0.9,maxOutputTokens:18000,maxContextTokens:128000,streamMode:'stream',timeoutMs:BUDGET.timeoutMs,maxCalls:20,tokenField:'max_tokens',topP:1,topPEnabled:false,topK:200,topKEnabled:false,frequencyPenalty:0,presencePenalty:0,frequencyPenaltyEnabled:false,presencePenaltyEnabled:false};}
export function connectionConfig(role,ui,previous){
 if(!['prose','middleware'].includes(role))throw Error('连接角色无效。');
 const c={...defaultConnection(),...ui};
 const endpoint=normalizeConnection(c);
 let projectId=c.projectId||previous?.projectId;
 if(c.type==='vertex'&&c.serviceAccountJson?.trim()){try{projectId=JSON.parse(c.serviceAccountJson).project_id;}catch{throw Error('服务账号JSON无法解析。');}}
 const publicConfig={id:role+'-'+crypto.randomUUID(),role,type:c.type,...(c.type==='vertex'?{region:c.region||'us-central1',projectId}:{}),endpoint,model:String(c.model).trim(),temperature:Number(c.temperature),maxOutputTokens:Number(c.maxOutputTokens),maxContextTokens:Number(c.maxContextTokens),streamMode:c.streamMode,timeoutMs:Number(c.timeoutMs),maxCalls:Number(c.maxCalls),tokenField:c.tokenField,
 topP:c.topP,topPEnabled:!!c.topPEnabled,topK:c.topK,topKEnabled:!!c.topKEnabled,frequencyPenalty:c.frequencyPenalty,frequencyPenaltyEnabled:!!c.frequencyPenaltyEnabled,presencePenalty:c.presencePenalty,presencePenaltyEnabled:!!c.presencePenaltyEnabled};
 if(!publicConfig.model)throw Error('请填写模型名。');
 budgetLimits(publicConfig.maxContextTokens,publicConfig.maxOutputTokens);
 if(!Number.isFinite(publicConfig.temperature)||publicConfig.temperature<0||publicConfig.temperature>2)throw Error('温度应在0到2之间。');
 return {publicConfig,privateConfig:{...publicConfig,key:c.type==='vertex'?'':String(c.apiKey||''),...(c.type==='vertex'?{serviceAccountJson:String(c.serviceAccountJson||'')}:{}),previousId:previous?.id}};
}
// Deliberately projects an allowlist: no global world, author secrets or other people's history.
export function allowedInput(x,phase){
 const str=v=>typeof v==='string'?v:'';
 const arr=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'):[];
 return {user:str(x.user),char:str(x.char),personality:str(x.personality),scenario:str(x.scenario),known:str(x.known),guidance:str(x.guidance),input:str(x.input),latest:str(x.latest),previous:arr(x.previous),recent:arr(x.recent),recalled:arr(x.recalled),contract:contracts[phase]};
}
export function sampleInput(phase='prose'){
 return {user:'乔弗里',char:'桑铎·克里冈',personality:'国王的当值护卫。说话直接，对空洞的荣誉和骑士表演怀有鄙夷。',scenario:'红堡内，会后的一次短谈。仅用于接口检查，不属于正式历史。',known:'国王提出讨论护卫安排；尚未任命新职位，也没有人员交接。',guidance:'可以追问职责和待遇，不应声称已接受尚未谈妥的职位。',latest:'桑铎站在门旁，等着国王开口。',previous:[],recent:[],recalled:[],input:phase==='post'?'国王：我想听听你的条件。桑铎：先说清楚要我管什么。':'如果让你负责近身护卫，你有什么条件？'};
}
export function compileTask(settings,phase,input,builder,generation='normal',continuation='',taskContract=null){
 if(!phases.includes(phase))throw Error('未知任务。');
 const role=phase==='prose'?'prose':'middleware',connection=structuredClone(settings.connections[role]||defaultConnection()),p=allowedInput(input,phase);
 if(taskContract!==null)p.contract=taskContract;
 const summaryLimit=settings.memory?.summaryOutput??null;
 const outputReserve=phase==='summary'?(summaryLimit??BUDGET.output):connection.maxOutputTokens;
 let compiled;
 if(settings.modes[phase]==='tavern'){
  let preset=settings.library.items.find(x=>x.id===settings.library.bindings[phase]);
  if(!preset)throw Error('预设绑定不存在。');
  if(phase==='summary'){preset=structuredClone(preset);preset.data.openai_max_tokens=outputReserve;}
  const history=[...p.previous,...p.recalled,...p.recent].map(content=>({role:'system',content}));
  if(p.latest)history.push({role:'assistant',content:p.latest});
  compiled=compilePreset(preset,{...p,payload:{task:phase},history,generation:generation==='normal'&&phase!=='prose'?'quiet':generation,continuation,vars:{}},{contextTokens:connection.maxContextTokens});
 }else{
  const parts={...nativeDefaults,...(phase!=='prose'?{style:'客观整理本次资料。',prefill:'我会按要求输出JSON。'}:{}),...settings.native[phase]};
  const limits=budgetLimits(connection.maxContextTokens,outputReserve);
  let messages=builder({...p,parts,structured:['pre','post'].includes(phase),customPrefill:!!settings.native[phase]?.prefill}),trimmed=0;
  while(estimateMessages(messages)>limits.inputLimit&&(p.previous.length||p.recalled.length||p.recent.length)){
   (p.previous.length?p.previous:p.recalled.length?p.recalled:p.recent).shift();trimmed++;messages=builder({...p,parts,structured:['pre','post'].includes(phase),customPrefill:!!settings.native[phase]?.prefill});
  }
  if(generation==='continue')throw Error('原作六条消息模式本批不提供续写；可使用带续写预填充的酒馆预设。');
  if(estimateMessages(messages)>limits.inputLimit)throw Error('必要资料超过输入预算，请缩短资料或调整配置。');
  const parameters={temperature:connection.temperature,max_tokens:connection.maxOutputTokens};
  for(const [key,target] of [['topP','top_p'],['topK','top_k'],['frequencyPenalty','frequency_penalty'],['presencePenalty','presence_penalty']])if(connection[key+'Enabled'])parameters[target]=connection[key];
  compiled={messages,parameters,prefix:'',rawPrefix:'',vars:{},generation,trimmed,preset:{id:'native-'+phase,version:settings.revision},estimatedTokens:estimateMessages(messages),warnings:[(['pre','post'].includes(phase)?'中间层使用任务说明与本轮材料两条消息。':'沿用姬侠传正文编排。'),'token为估算。'],budget:{...limits,estimatedInput:estimateMessages(messages),needsOrganization:estimateMessages(messages)>=limits.softInput}};
  if(compiled.budget.needsOrganization)compiled.warnings.push('资料已达到整理阈值；本批不自动发起总结。');
 }
 if(phase==='summary'){
  compiled.parameters.max_tokens=summaryLimit;
  compiled.warnings.push(summaryLimit===null?'总结输出跟随服务默认上限；输入仍预留18000 token空间。':'总结采用单独输出上限，输入容量已扣除相应预留。');
 }
 requireMaterials({compiled},p);
 const previewConnection={...connection,endpoint:connection.endpoint||'http://127.0.0.1:1/v1/chat/completions',model:connection.model||'尚未设置'};
 const prepared=providerRequest({connection:previewConnection,stage:phase,compiled,stream:phase==='prose'&&connection.streamMode!=='non-stream'});
 return {id:crypto.randomUUID(),proseFormat:2,stage:phase,connection,configId:connection.id,compiled,stream:phase==='prose'&&connection.streamMode!=='non-stream',preview:{endpoint:connection.endpoint?prepared.endpoint:'尚未配置',body:prepared.body,warnings:[...compiled.warnings,...prepared.warnings]},input:p};
}
export function displayText(prefix,raw){return prefix&&raw.startsWith(prefix)?raw:prefix+raw;}
export function proseText(prefix,raw,streaming=false){return globalThis.responseParser.narrative(displayText(prefix,raw),{streaming});}
export function failureStatus(error){if(error.name==='AbortError')return 'cancelled';if(error.diagnostic?.finishReason==='length')return 'truncated';return error.diagnostic?.content?'interrupted':'failed';}
