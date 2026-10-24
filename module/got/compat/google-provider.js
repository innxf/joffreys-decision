import '../../api-service.js';
import {normalizeEndpoint} from './api-endpoint.js';
export function normalizeConnection(c){
 const type=c.type||'openai';
 if(type==='openai')return normalizeEndpoint(c.endpoint);
 if(type==='vertex'){
  const region=c.region||'us-central1';
  if(!/^[a-z][a-z0-9-]{1,40}$/.test(region))throw Error('Vertex 地区格式无效。');
  return region==='global'?'https://aiplatform.googleapis.com/v1':`https://${region}-aiplatform.googleapis.com/v1`;
 }
 if(type!=='gemini')throw Error('不支持的API类型。');
 let u;try{u=new URL(c.endpoint||'https://generativelanguage.googleapis.com/v1beta');}catch{throw Error('Gemini 地址无效。');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||[...u.searchParams].some(([k,v])=>k!=='alt'||v!=='sse'))throw Error('Gemini 地址仅填写基础地址或生成地址，密钥放入独立栏。');
 u.search='';u.pathname=u.pathname.replace(/\/models(?:\/[^/]+:(?:streamGenerateContent|generateContent))?\/?$/,'').replace(/\/+$/,'')||'/v1beta';
 return u.href.replace(/\/$/,'');
}
export function googleRequest(r){
 const c=r.connection,base=normalizeConnection(c),method=r.stream?'streamGenerateContent':'generateContent',model=String(c.model).replace(/^models\//,'');
 if(!/^[a-zA-Z0-9._-]+$/.test(model))throw Error('Google 模型名格式无效，请填写模型ID。');
 if(c.type==='vertex'&&!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(c.projectId||''))throw Error('请先校验并保存服务账号JSON，取得项目ID。');
 const endpoint=c.type==='vertex'?`${base}/projects/${c.projectId}/locations/${c.region||'us-central1'}/publishers/google/models/${model}:${method}`:`${base}/models/${model}:${method}`;
 const config={},warnings=[],params=r.compiled.parameters;
 const fields={temperature:'temperature',max_tokens:'maxOutputTokens',top_p:'topP',top_k:'topK',frequency_penalty:'frequencyPenalty',presence_penalty:'presencePenalty',seed:'seed',stop:'stopSequences'};
 for(const [key,value]of Object.entries(params)){
  if(value===null||value===undefined)continue;
  if(fields[key])config[fields[key]]=key==='stop'?(Array.isArray(value)?value:[value]):value;
  else warnings.push('原生Google接口未发送此通用参数：'+key+'；预设原值保留。');
 }
 const body=globalThis.jxGeminiBody(r.compiled.messages,config);
 warnings.push('沿用姬侠传Gemini编排：系统消息合并为systemInstruction，助手角色转换为model。');
 if(r.compiled.messages.at(-1)?.role==='assistant')warnings.push('末尾助手预填充按model内容发送；不同Google模型的支持情况需单独测试。');
 return {endpoint:endpoint+(r.stream?'?alt=sse':''),body,warnings};
}
