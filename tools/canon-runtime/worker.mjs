import {parentPort} from 'node:worker_threads';
import {openIndex,searchIndex} from './search.mjs';
import {readFile} from 'node:fs/promises';
import {root} from './config.mjs';
let index,queue=Promise.resolve();const waiting=new Set(),cancelled=new Set();
parentPort.on('message',({id,payload,cancel})=>{
 if(cancel){if(waiting.has(cancel))cancelled.add(cancel);return;}
 waiting.add(id);
 queue=queue.then(async()=>{try{
  if(cancelled.has(id))return;
  const manifest=JSON.parse(await readFile(new URL('index/manifest.json',root),'utf8'));
  if(index?.manifest.version!==manifest.version)index=await openIndex();
  parentPort.postMessage({id,result:await searchIndex(index,payload)});
 }catch(e){parentPort.postMessage({id,error:e.message});}finally{waiting.delete(id);cancelled.delete(id);}});
});
