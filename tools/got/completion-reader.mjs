import {BUDGET} from '../../module/got/compat/generation-budget.js';
export function providerHTTPError(status){
 const reason={401:'身份验证失败，请检查本路保存的密钥是否有效、是否属于这个服务。不是余额或预设格式问题。',402:'账户余额不足。',403:'服务拒绝访问，请检查账户或模型权限。',404:'接口路径或模型不存在。',429:'请求过于频繁或服务额度受限。'}[status]??'服务拒绝本次请求，请检查模型与参数。';
 return `模型服务返回HTTP ${status}：${reason} 没有自动重试。`;
}
export async function readCompletion(response,stream,onDelta,protocol='openai'){
 let content='',finish='',usage,bytes=0,buffer='',data=[];const decoder=new TextDecoder(),reader=response.body.getReader();
 function accept(v){if(['gemini','vertex'].includes(protocol)){
 const c=v.candidates?.[0],u=v.usageMetadata;
 if(u)usage={prompt_tokens:u.promptTokenCount,completion_tokens:(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0),total_tokens:u.totalTokenCount,google:u};
 if(c?.finishReason)finish={STOP:'stop',MAX_TOKENS:'length'}[c.finishReason]||c.finishReason;
 if(v.promptFeedback?.blockReason)finish=v.promptFeedback.blockReason;
 const text=(c?.content?.parts||[]).filter(p=>!p.thought&&typeof p.text==='string').map(p=>p.text).join('');
 if(text){content+=text;if(content.length>BUDGET.maxTextChars)throw Error('模型正文超过本地单条保存容量。');onDelta?.(text);}
 if(v.error)throw Error('模型流返回错误，草稿保留；未自动重试。');return;
 }if(v.usage)usage=v.usage;const ch=v.choices?.[0];if(ch?.finish_reason)finish=ch.finish_reason;const text=stream?ch?.delta?.content:ch?.message?.content;if(typeof text==='string'){content+=text;if(content.length>BUDGET.maxTextChars)throw Error('模型正文超过本地单条保存容量。');onDelta?.(text);}if(v.error)throw Error('模型流返回错误，草稿保留；未自动重试。');}
 function flush(){if(!data.length)return;const raw=data.join('\n');data=[];if(raw!=='[DONE]')accept(JSON.parse(raw));}
 function line(text){if(text===''){flush();return;}if(text.startsWith('data:')){let value=text.slice(5);if(value.startsWith(' '))value=value.slice(1);data.push(value);}}
 try{
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>BUDGET.maxResponseBytes)throw Error('模型返回超过本地传输容量。');buffer+=decoder.decode(part.value,{stream:true});if(stream){let i;while((i=buffer.indexOf('\n'))>=0){line(buffer.slice(0,i).replace(/\r$/,''));buffer=buffer.slice(i+1);}}}
 buffer+=decoder.decode();if(stream){if(buffer)line(buffer.replace(/\r$/,''));flush();}else accept(JSON.parse(buffer));
 if(finish==='length')throw Error('模型未完整返回：达到输出上限（包括思考用量），已收到内容保留，不能当作正式回复。');
 if(finish!=='stop'||!content.trim())throw Error('模型未完整返回（拒绝、正文为空或缺少结束标志）；草稿未采用。');
 return {content,usage,finishReason:finish};
 }catch(e){try{await reader.cancel();}catch{};e.completion={content:content.slice(0,BUDGET.maxTextChars),finishReason:finish||null,usage:usage??null,responseBytes:bytes};throw e;}
}
