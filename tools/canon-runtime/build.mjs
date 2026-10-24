import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {encode,model,fingerprint,tokenLength} from './encoder.mjs';
import {root} from './config.mjs';
import {categories,factKeys} from '../../module/got/canon-reference.mjs';
import {places} from '../../module/got/opening-content.mjs';
import {profiles} from '../../module/got/dialogue-profiles.mjs';
const pilot=process.argv.includes('--pilot');
const hash=x=>createHash('sha256').update(x).digest('hex');
await mkdir(new URL('cache/',root),{recursive:true});
const all=(await readFile(new URL('catalog.jsonl',root),'utf8')).trim().split('\n').map(JSON.parse);
const names=Object.entries(profiles).filter(([id])=>id!=='U001').map(([id,p])=>[id,p.name?.split(/[·•]/)[0]]).filter(([,name])=>name?.length>=2);
const hints={scene_env:/城墙|房间|街道|大厅|庭院|阳光|月光|气味/,banquet_food_prop:/面包|烤肉|葡萄酒|餐盘|酒杯|晚餐|汤/,costume_ornament:/丝绸|绒|披风|盔甲|衣服|衣裙|项链/,persona_mannerism:/微笑|皱眉|手指|嘴唇|眨眼|耸肩/,persona_dialogue:/[“「]/,etiquette_institutional:/礼仪|陛下|爵士|学士|誓言|觐见/,world_lore_history:/征服者|先民|伊耿|疯王|宾客权利|鱼梁木/};
for(const r of all.filter(r=>r.status==='pending')){
 // Discovery hints only. A mention is never a speaker, owner, known fact or approval.
 r.suggested_categories=Object.entries(hints).filter(([,re])=>re.test(r.text)).map(([k])=>k);
 r.mentioned_characters=names.filter(([,n])=>r.text.includes(n)).map(([id])=>id);
 r.suggested_locations=Object.entries(places).filter(([,name])=>r.text.includes(name.split('·').at(-1))).map(([id])=>id);
}
if(!pilot)await writeFile(new URL('catalog.jsonl',root),all.map(r=>JSON.stringify(r)).join('\n')+'\n');
const rows=pilot?all.filter(x=>x.status==='reviewed').slice(0,50):all;
for(const r of rows.filter(x=>x.status==='reviewed')){
 if(!categories.includes(r.category)||r.characters.some(id=>!profiles[id])||r.locations.some(id=>!places[id]))throw Error('未知人物、地点或用途：'+r.id);
 if([...r.requires_facts,...r.forbid_facts].some(k=>!factKeys.includes(k)))throw Error('未连接的原著适用条件：'+r.id);
 if(r.periods.some(x=>!['day','morning','dusk','night'].includes(x)))throw Error('未知原著时段：'+r.id);
 if(r.characters.some(id=>r.attitudes.some(x=>!profiles[id].attitudes.some(a=>a.id===x))||r.stages.some(x=>!profiles[id].stages.some(a=>a.id===x))))throw Error('未知阶段或态度：'+r.id);
}
const vectors=[],started=performance.now(),tokens=[];
let encoded=0,cached=0;
for(let i=0;i<rows.length;i+=16){
 const batch=rows.slice(i,i+16),missing=[],slots=[];
 for(let j=0;j<batch.length;j++){
  const r=batch[j],key=hash(fingerprint+'\n'+r.text),path=new URL('cache/'+key+'.f32',root);
  try{const b=await readFile(path);if(b.length!==model.dimension*4)throw Error('缓存尺寸不符');const v=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));if(!v.every(Number.isFinite)||Math.abs(Math.hypot(...v)-1)>.01)throw Error('缓存向量无效');vectors[i+j]=b;cached++;}
  catch{missing.push(r.text);slots.push({index:i+j,path});}
 }
 if(missing.length){
  // Oversized indivisible sentences stay catalogued but are not silently truncated.
  const lengths=await Promise.all(missing.map(tokenLength));
  const safe=missing.map((s,j)=>lengths[j]<=model.maxTokens?s:null);
  const vs=await encode(safe.filter(Boolean));let vi=0;
  for(let j=0;j<slots.length;j++){
   const {index,path}=slots[j];
   if(!safe[j]){rows[index].encoding_error='原文单句超过模型512token，待人工选取完整区间';vectors[index]=Buffer.alloc(model.dimension*4);tokens.push(rows[index].id);continue;}
   const b=Buffer.from(vs[vi++].buffer);vectors[index]=b;await writeFile(path,b);encoded++;
  }
 }
 if(i%256===0)console.log(JSON.stringify({completed:Math.min(i+16,rows.length),total:rows.length,encoded,cached,seconds:Math.round((performance.now()-started)/1000)}));
}
const matrix=Buffer.concat(vectors),directory=pilot?'pilot/':'index/';await mkdir(new URL(directory,root),{recursive:true});
const manifest={format:3,version:hash(JSON.stringify(rows)+fingerprint),model,fingerprint,dimension:model.dimension,count:rows.length,reviewed:rows.filter(r=>r.status==='reviewed'&&!r.encoding_error).length,matrix_sha256:hash(matrix),milliseconds:performance.now()-started,encoded,cached,unencoded:tokens};
// Publish manifest last. Reader verifies hashes and size before accepting it.
await writeFile(new URL(directory+'vectors.f32.tmp',root),matrix);await rename(new URL(directory+'vectors.f32.tmp',root),new URL(directory+'vectors.f32',root));
const catalog=JSON.stringify(rows);manifest.catalog_sha256=hash(catalog);
await writeFile(new URL(directory+'catalog.json.tmp',root),catalog);await rename(new URL(directory+'catalog.json.tmp',root),new URL(directory+'catalog.json',root));
await writeFile(new URL(directory+'manifest.json.tmp',root),JSON.stringify(manifest,null,2));await rename(new URL(directory+'manifest.json.tmp',root),new URL(directory+'manifest.json',root));
console.log(JSON.stringify(manifest));
