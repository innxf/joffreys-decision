import {pipeline,env} from '@huggingface/transformers';
import {readFile} from 'node:fs/promises';
import {model,modelPath,fingerprint} from './config.mjs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import path from 'node:path';
const expected={
 'config.json':'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1',
 'tokenizer.json':'0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
 'tokenizer_config.json':'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
 'special_tokens_map.json':'d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7',
 'onnx/model_quantized.onnx':'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193'
};
for(const [file,sha] of Object.entries(expected))if(createHash('sha256').update(await readFile(path.join(modelPath,file))).digest('hex')!==sha)throw Error('本地模型文件版本不符：'+file);
env.allowRemoteModels=false;
env.allowLocalModels=true;
env.useBrowserCache=false;
// Keep game request/response handling responsive while ONNX runs in this worker.
env.backends.onnx.wasm.numThreads=2;
let extractor;
const inherited=vm.createContext({console});
vm.runInContext(await readFile(new URL('../../module/embedding-service.js',import.meta.url),'utf8'),inherited);
vm.runInContext(await readFile(new URL('../../module/memory-recall.js',import.meta.url),'utf8'),inherited);
export const rankScoped=(...args)=>inherited.memoryRecall.rankScoped(...args);
export async function encode(texts,kind='passage'){
  extractor??=pipeline('feature-extraction',modelPath,{dtype:model.dtype,device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  const pipe=await extractor;
  const input=texts.map(s=>(kind==='query'?model.queryPrefix:model.passagePrefix)+s);
  // The original embedding module validates ordering, dimensions and finite values;
  // gotRequest supplies local inference instead of an external Embedding API.
  return inherited.embeddingService.embed(input,{gotRequest:async()=>{
    const result=await pipe(input,{pooling:model.pooling,normalize:model.normalize,truncation:true,max_length:model.maxTokens});
    const vectors=result.tolist();
    if(vectors.some(v=>v.length!==model.dimension))throw Error('本地模型向量维度不符');
    return {data:vectors.map((embedding,index)=>({index,embedding}))};
  }});
}
export async function tokenLength(text){const pipe=await (extractor??=pipeline('feature-extraction',modelPath,{dtype:model.dtype,device:'cpu',local_files_only:true,session_options:{intraOpNumThreads:2,interOpNumThreads:1}}));return pipe.tokenizer(model.passagePrefix+text,{truncation:false}).input_ids.data.length;}
export {fingerprint,model};
