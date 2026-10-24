import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encode,rankScoped,fingerprint,model,tokenLength} from './encoder.mjs';
import {root} from './config.mjs';
import {canonEligible,selectReferences,factKeys} from '../../module/got/canon-reference.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export async function openIndex(directory='index/'){
 const start=performance.now(),manifest=JSON.parse(await readFile(new URL(directory+'manifest.json',root),'utf8'));
 if(manifest.format!==3||manifest.fingerprint!==fingerprint||manifest.dimension!==384)throw Error('原著索引与本机模型不兼容');
 const [catalog,matrix]=await Promise.all([readFile(new URL(directory+'catalog.json',root)),readFile(new URL(directory+'vectors.f32',root))]);
 if(hash(catalog)!==manifest.catalog_sha256||hash(matrix)!==manifest.matrix_sha256||matrix.length!==manifest.count*384*4)throw Error('原著索引校验失败');
 const rows=JSON.parse(catalog);if(rows.length!==manifest.count)throw Error('原文目录与向量数量不一致');
 const ids=new Set();
 for(let i=0;i<rows.length;i++){
  const r=rows[i];if(ids.has(r.id))throw Error('原文编号重复');ids.add(r.id);
  if(r.status!=='reviewed'||r.encoding_error)continue;
  if([...r.requires_facts||[],...r.forbid_facts||[]].some(k=>!factKeys.includes(k)))throw Error('原著目录存在未连接条件：'+r.id);
  r.vector=new Float32Array(matrix.buffer.slice(matrix.byteOffset+i*1536,matrix.byteOffset+(i+1)*1536));
  if(!r.vector.every(Number.isFinite)||Math.abs(Math.hypot(...r.vector)-1)>.01)throw Error('原著向量无效：'+r.id);
  r.fingerprint=fingerprint;
 }
 return {manifest,rows:rows.filter(r=>r.vector),load_ms:performance.now()-start};
}
export async function searchIndex(index,payload){
 const {frame,context,query}=payload||{};
 if(frame?.version!==3||!context||frame.actor!==context.actor||!Array.isArray(frame.audience)||typeof query!=='string'||query.length>3000)throw Error('原著查询资料无效');
 const begin=performance.now();let q=query;
 // Query is not a source extract. Trim the assembled query to the model window;
 // source passages themselves were checked at build time, never silently cut.
 while(await tokenLength(q)>model.maxTokens)q=q.slice(0,Math.floor(q.length*.85));
 const [vector]=await encode([q],'query');const encoded=performance.now();
 const candidates=index.rows.filter(r=>canonEligible(r,frame,context));
 const ranked=rankScoped(candidates,vector,fingerprint,[],candidates.length||1,1000000);
 const done=performance.now();
 return selectReferences(ranked,{frame,index_version:index.manifest.version,model,fingerprint:hash(JSON.stringify(payload)),timing:{index_load_ms:index.load_ms,query_encode_ms:encoded-begin,similarity_ms:done-encoded}});
}
