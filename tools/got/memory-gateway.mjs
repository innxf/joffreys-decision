// Same local ConnectionStore/session boundary as chat. No browser-side vector keys.
import {randomUUID} from 'node:crypto';
import {resolveCredential} from './connection-store.mjs';
export function memoryEndpoint(raw){const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('请填写完整http或https向量地址。');u.pathname=u.pathname.replace(/\/+$/,'').replace(/\/(embeddings|rerank)$/,'');return u.href.replace(/\/$/,'');}
export async function memoryGateway(path,b,{store,fetcher,session,counts,req,res}){
 if(path==='/api/memory-config'){
  const endpoint=memoryEndpoint(b.endpoint),previous=store.get(b.previousId);if(typeof b.model!=='string'||!b.model.trim()||typeof b.key!=='string')throw Error('请填写向量模型和密钥。');
  const c=resolveCredential({kind:'memory',endpoint,model:b.model.trim(),rerankModel:String(b.rerankModel||''),key:b.key,timeoutMs:30000,maxCalls:300},previous);
  const id='memory-'+randomUUID();store.save(id,c);const {key,...publicConfig}=c;return {id,...publicConfig};
 }
 if(path==='/api/memory-vector'){
  const c=store.get(b.configId);if(!c||c.kind!=='memory')throw Error('请先保存独立的记忆检索连接。');
  if(!['embed','rerank'].includes(b.operation)||typeof b.id!=='string')throw Error('记忆请求格式无效。');
  const payload=b.operation==='embed'?{model:c.model,input:b.input,encoding_format:'float'}:{model:c.rerankModel,query:b.query,documents:b.documents,top_n:b.top_n,return_documents:false};
  const texts=b.operation==='embed'?b.input:b.documents;
  if(!Array.isArray(texts)||!texts.length||texts.length>32||texts.some(t=>typeof t!=='string'||t.length>16000)||b.operation==='rerank'&&(typeof b.query!=='string'||b.query.length>20000||!Number.isSafeInteger(b.top_n)||b.top_n<1||b.top_n>15||!c.rerankModel))throw Error('向量输入过大或格式无效。');
  const fingerprint=JSON.stringify(b),old=session.cache.get(b.id);if(old){if(old.fingerprint!==fingerprint)throw Error('重复请求内容冲突。');return old.promise;}
  const used=counts.get('memory')||0;if(used>=c.maxCalls)throw Error('记忆检索请求次数已达上限。');counts.set('memory',used+1);
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),c.timeoutMs);res.on('close',()=>{if(!res.writableEnded)abort.abort();});
  const promise=(async()=>{try{
   const r=await fetcher(c.endpoint+(b.operation==='embed'?'/embeddings':'/rerank'),{method:'POST',headers:{'Content-Type':'application/json',...(c.key?{Authorization:'Bearer '+c.key}:{})},body:JSON.stringify(payload),signal:abort.signal,redirect:'error'});
   if(!r.ok)throw Error('记忆服务返回HTTP '+r.status+'，未自动重试。');const raw=await r.text();if(raw.length>8000000)throw Error('记忆服务返回过大。');const data=JSON.parse(raw);return {...data,callsUsed:used+1};
  }catch(e){throw Error(abort.signal.aborted?'记忆请求取消或超时；没有自动重试。':e.message.startsWith('记忆')?e.message:'记忆服务连接或返回格式失败。');}finally{clearTimeout(timer);}})();session.cache.set(b.id,{fingerprint,promise});return promise;
 }
 throw Error('未知记忆接口。');
}
