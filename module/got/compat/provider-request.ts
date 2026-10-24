import type {Request} from './model-client.js';
// Explicit official-host adapter; custom compatible services retain their own contract.
// DeepSeek API docs checked 2026-10-12; ST 1.16.0 sendDeepSeekRequest supplies prefix/JSON handling.
export function providerRequest(r:Pick<Request,'connection'|'stage'|'compiled'|'stream'>){
 let endpoint=r.connection.endpoint;const parameters={...r.compiled.parameters},messages=r.compiled.messages.map(m=>({...m})),warnings:string[]=[];
 const deepseek=new URL(endpoint).hostname==='api.deepseek.com';
 if(deepseek){
  const supported=['temperature','top_p','max_tokens','reasoning_effort','stop'];
  for(const key of Object.keys(parameters))if(!supported.includes(key)){delete parameters[key];warnings.push('DeepSeek官方接口不发送此通用预设参数：'+key+'（原预设保留）。');}
  if(messages.at(-1)?.role==='assistant'){
   endpoint='https://api.deepseek.com/beta/chat/completions';
   Object.assign(messages.at(-1)!,{prefix:true});warnings.push('DeepSeek预填充使用官方 /beta 接口和 prefix 标记。');
  }
  if(['pre','post'].includes(r.stage)){parameters.response_format={type:'json_object'};warnings.push('中间层启用DeepSeek JSON输出；人物权限与证据仍由游戏检查。');}
  if(r.stage==='test')parameters.reasoning_effort='none';
 }
 const max=parameters.max_tokens;delete parameters.max_tokens;const output=max===null||max===undefined?{}:{[deepseek?'max_tokens':r.connection.tokenField]:max};
 return {endpoint,body:{...parameters,model:r.connection.model,messages,stream:r.stream,...output},warnings};
}
