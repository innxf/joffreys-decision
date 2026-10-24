// Disable network functions in this fresh process before importing Transformers.
// This is a process-level disconnected test, not a change to system networking.
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import assert from 'node:assert/strict';
let attempts=0;const denied=()=>{attempts++;throw Error('OFFLINE_NETWORK_FORBIDDEN');};
net.Socket.prototype.connect=denied;http.request=denied;http.get=denied;https.request=denied;https.get=denied;globalThis.fetch=denied;
const {openIndex,searchIndex}=await import('./search.mjs');
const index=await openIndex();
const result=await searchIndex(index,{frame:{version:3,actor:'P001',place:'R05',period:'day',audience:['U001','P001'],facts:{'scene.meal':true,'scene.armor':false}},context:{actor:'P001'},query:'母亲和我一起用膳，王室家宴的饭菜。'});
assert(result.ids.includes('CANON-0011'));assert.equal(attempts,0);
console.log(JSON.stringify({passed:true,networkAttempts:attempts,model:index.manifest.model,index:index.manifest.version,ids:result.ids,scope:'进程禁止socket/http/https/fetch；未改操作系统网络设置'}));
