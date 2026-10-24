// Local worker shares the existing server. No model credentials, HTTP fallback or
// memory Embedding settings are read by this path.
import {Worker} from 'node:worker_threads';
import {randomUUID} from 'node:crypto';
let worker;const pending=new Map();
function rejectAll(error){for(const p of pending.values())p.finish(error);pending.clear();worker=null;}
function start(){
 if(worker)return worker;
 const w=worker=new Worker(new URL('../canon-runtime/worker.mjs',import.meta.url));w.unref();
 w.on('message',m=>{const p=pending.get(m.id);if(p)p.finish(m.error?Error(m.error):null,m.result);});
 w.on('error',rejectAll);w.on('exit',code=>{if(worker===w)rejectAll(Error('本机向量线程已退出：'+code));});return w;
}
export function searchCanon(payload,signal){
 if(signal?.aborted)return Promise.reject(Error('本地检索已取消'));
 if(pending.size>=8)return Promise.reject(Error('本地检索繁忙，本轮未注入原著参考'));
 return new Promise((resolve,reject)=>{
  const id=randomUUID(),w=start(),cancel=()=>finish(Error('本地检索已取消'));
  const timer=setTimeout(()=>finish(Error('本地检索超时，本轮未注入原著参考')),30000);
  const finish=(error,result)=>{if(!pending.has(id))return;pending.delete(id);clearTimeout(timer);signal?.removeEventListener('abort',cancel);if(error)w.postMessage({cancel:id});if(!pending.size)w.unref();error?reject(error):resolve(result);};
  pending.set(id,{finish});signal?.addEventListener('abort',cancel,{once:true});w.ref();w.postMessage({id,payload});
 });
}
export async function closeCanonWorker(){const w=worker;worker=null;rejectAll(Error('本地检索服务关闭'));if(w)await w.terminate();}
