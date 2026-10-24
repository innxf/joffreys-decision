// Optional literary references, never actor evidence or a world-state writer.
import {places} from './opening-content.mjs';
import {placeDescriptions} from './navigation-data.mjs';
export const categories=['scene_env','banquet_food_prop','costume_ornament','persona_mannerism','persona_dialogue','etiquette_institutional','world_lore_history'];
export const factKeys=['scene.meal','scene.feast','scene.armor','scene.court','scene.medical','scene.clear_moon','office.hand','office.kingsguard','known.renly_dead','body.tyrion_scarred','body.jaime_hand_lost','supply.feast_available'];
const count=s=>Array.from(s).length;
const digest=s=>{let h=2166136261;for(const c of s){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16);};
export function freezeCanonFrame(g,c){
 try{return makeFrame(g,c);}catch(e){return {unavailable:e.message};}
}
function makeFrame(g,c){
 const activity=g.activities.find(a=>a.id===c.activity),scene=c.event?.scene||'';
 const loc=places[c.place]?c.place:Object.keys(places).find(k=>places[k]===c.place)||null;
 const visibleTurns=[...(g.dialogue?.turns||[]),...(g.opening?.meetings||[]).filter(m=>m.status==='in_progress').flatMap(m=>m.session?.turns||[])].filter(t=>(t.activity||t.context?.activity)===c.activity&&(t.audience||t.context?.audience||[]).includes(c.actor));
 // Only completed, actually heard prose may preserve scene details. Raw samples do not.
 const heard=visibleTurns.map(t=>t.prose||'').join('\n');
 const staging=[placeDescriptions[loc]||'',scene,c.event?.staging||''].join('\n');
 const locked=visibleTurns.flatMap(t=>(t.request_records||[]).flatMap(r=>(r.snapshot?.canon_reference?.details||[]).filter(d=>d.anchors?.some(a=>t.prose?.includes(a))&&(!d.actor||d.actor===c.actor))));
 const hour=((360+(c.at||0))%1440)/60;
 const received=c.known.filter(k=>['report','observation'].includes(k.kind));
 // No fact_refs dereference; ambiguity stays unknown rather than becoming false.
 const knownRenly=received.some(k=>/蓝礼.{0,8}(?:已死|死亡|身亡|死讯)/.test(k.content)&&!/(尚未|未能|无法|谣言|传闻|不可靠|未证实)/.test(k.content));
 const own=g.actors.find(a=>a.id===c.actor),isHand=g.offices.some(o=>o.holder===c.actor&&o.status==='在任'&&/首相|国王之手/.test(o.title));
 const established=(re)=>g.facts.some(f=>f.established_minute<=c.at&&re.test(f.statement));
 const facts={'scene.meal':/lunch|dinner|meal/.test(activity?.kind||'')||/用餐|晚餐|午餐|家宴|茶叙/.test(staging),'scene.feast':/婚宴|盛宴|盛大宴席/.test(staging),'scene.armor':/身穿.{0,8}(?:甲|铠)|披甲/.test(staging),'scene.court':!!c.meeting||loc==='R08','scene.medical':loc==='R23','scene.clear_moon':/月光/.test(staging)&&!/(雨|乌云|阴云|无月|没有月光)/.test(staging)?true:null,'office.hand':isHand,'office.kingsguard':g.offices.some(o=>o.holder===c.actor&&o.status==='在任'&&/御林铁卫/.test(o.title)),'known.renly_dead':knownRenly&&g.actors.some(a=>a.id==='P007'&&a.life==='已故')?true:null,'body.tyrion_scarred':c.actor==='P003'&&established(/提利昂.{0,12}(?:削鼻|鼻子.{0,5}削掉|面部重伤)/)?true:null,'body.jaime_hand_lost':c.actor==='P015'&&established(/詹姆.{0,12}(?:断手|失去右手)/)?true:null,'supply.feast_available':/烤天鹅|蜜汁火腿|奶油栗子汤/.test(staging)?true:null};
 const requests=[...(g.dialogue?.turns||[]).slice(-6).flatMap(t=>t.request_records||[]),...(g.opening?.meetings||[]).filter(m=>m.status==='in_progress').flatMap(m=>(m.session?.turns||[]).slice(-8).flatMap(e=>e.request_records||[]))];
 const recent=requests.flatMap(r=>r.snapshot?.canon_reference?.ids||[]);
 const frame={version:3,actor:c.actor,place:loc,branch:c.branch,world:c.world,at:c.at,alive:own?.life==='存活',audience:[...c.audience],period:hour<6||hour>=20?'night':hour>=17?'dusk':hour<10?'morning':'day',facts,staging,heard,locked,topic:c.meeting?.title||'',recent,activity_kind:activity?.kind||''};
 frame.actor_name=own?.name||c.actor;return frame;
}

// Old snapshots remain displayable; new selections contain only continuous raw text.
export const heading='【本幕原著写作参考】\n以下原著片段用于参考描写、动作、对白语气和叙事节奏。以当前游戏场景和已发生经历为准，不把片段中的事件、关系或承诺当成本局事实，不必逐段照抄。已有菜单、衣着及天气优先。\n';
export function referenceText(items){return items.length?heading+items.map(x=>`〔${x.category}〕${x.text??x.raw_text??x.clean_text}`).join('\n'):'';}
export function canonQuery(frame,c,pre){
 const stage=c.character?.stages?.map(s=>s.title||s.name||s.id).join('、')||'';
 // Identity is already constrained by canonEligible. Repeating the actor's name
 // in the vector query overwhelms short everyday questions in a larger corpus.
 const fields=[['本轮',String(c.input||'').slice(0,180)],['事件',c.event?.title||frame.topic||''],['地点',places[frame.place]||frame.place],['场景',String(frame.staging||frame.activity_kind||'').slice(0,120)],['阶段',stage.slice(0,60)],['指导',(pre?.guidance||[]).map(x=>x.text).join(' ').slice(0,100)]];
 return fields.filter(([,value])=>value).map(([label,value])=>`${label}：${value}`).join('\n');
}
export function canonEligible(x,f,c){
 if(x.status!=='reviewed'||x.encoding_error||x.secret||!x.text)return false;
 if(!categories.includes(x.category))return false;
 if([...x.requires_facts||[],...x.forbid_facts||[]].some(k=>!factKeys.includes(k)))return false;
 if((x.requires_facts||[]).some(k=>f.facts?.[k]!==true)||(x.forbid_facts||[]).some(k=>f.facts?.[k]!==false))return false;
 if(x.exclusive_actor&&(x.characters||[]).length&&!x.characters.includes(f.actor))return false;
 // Environment belongs to its real place. A person's voice can be used in other rooms.
 if(['scene_env','banquet_food_prop'].includes(x.category)&&x.locations?.length&&!x.locations.includes(f.place))return false;
 if(x.periods?.length&&!x.periods.includes(f.period)&&!(f.period==='morning'&&x.periods.includes('day')))return false;
 if(x.stages?.some(id=>!c.stages?.includes(id)))return false;
 if(x.attitudes?.length&&!x.attitudes.includes(c.attitude))return false;
 if(x.audience_requires?.some(id=>!f.audience?.includes(id)))return false;
 if(x.category==='persona_dialogue'&&c.expression==='nonverbal')return false;
 if(['world_lore_history','etiquette_institutional'].includes(x.category)&&x.characters?.length&&!x.characters.includes(f.actor))return false;
 const established=[f.staging||'',f.heard||''].join('\n');
 // Ordinary detail may enrich an unspecified scene. If a concrete menu/outfit is
 // already authored, permit only the same literal detail, never replace it.
 if(x.detail_group==='menu'){
  const anchors=established.match(/奶油栗子汤|烤天鹅|蜜汁火腿|柠檬蛋糕|鳗鱼派|牛尾汤|螃蟹派|南瓜甜汤|黑面包|燕麦粥|稀粥|烤排骨|韭菜胡萝卜烤羊肉/g)||[];
  if(anchors.length&&!anchors.every(a=>x.text.includes(a)))return false;
 }
 if(x.detail_group==='outfit'){
  const own=(f.outfit||'');if(own&& !x.text.includes(own))return false;
  // Explicitly named clothing in this actor's visible scene is already chosen.
  const re=new RegExp((f.actor_name||f.actor).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'.{0,8}(?:穿着|身穿|穿一|披着|换上)([^。；，\n]{2,30})');
  const m=established.match(re);if(m&&!x.text.includes(m[1]))return false;
 }
 return true;
}
export function selectReferences(ranked,{frame,index_version,model,fingerprint,timing}){
 const result={version:3,index_version,model,fingerprint,ids:[],items:[],text:'',chars:0,diagnostics:[],timing};
 const threshold=Math.max(.77,(ranked[0]?.similarity||0)-.015);
 const used=new Set();
 for(const row of [...ranked].sort((a,b)=>(b.similarity-(frame.recent?.includes(b.id)?.025:0))-(a.similarity-(frame.recent?.includes(a.id)?.025:0))||a.id.localeCompare(b.id))){
  if(row.similarity<threshold||result.items.length>=6)continue;
  if(used.has(row.text)||result.items.some(y=>y.text.includes(row.text)||row.text.includes(y.text)||row.parts?.some(p=>y.parts?.some(q=>p.ref===q.ref&&Math.max(p.start,q.start)<Math.min(p.end,q.end)))))continue;
  // Do not offer two competing menus or outfits in one round.
  if(row.detail_group&&result.items.some(y=>y.detail_group===row.detail_group))continue;
  const x={id:row.id,category:row.category,text:row.text,parts:row.parts,source:{book:row.book,title:row.title,chapter:row.chapter,member:row.member},similarity:row.similarity,detail_group:row.detail_group,characters:row.characters};
  if(count(referenceText([...result.items,x]))>1000)continue;
  result.items.push(x);used.add(row.text);
 }
 result.ids=result.items.map(x=>x.id);result.text=referenceText(result.items);result.chars=count(result.text);
 result.diagnostics.push({eligible:ranked.length,warning:result.items.length?null:'本轮没有适用原文，未注入原著参考。'});return result;
}
export async function selectLocalCanon(frame,c,pre,search,signal){
 const empty=reason=>({version:3,index_version:null,ids:[],items:[],text:'',chars:0,diagnostics:[{warning:'本轮未注入原著参考',reason}]});
 if(frame?.version!==3)return empty('旧请求沿用原快照，不补注入');
 if(frame.unavailable||!frame.alive||!frame.place||frame.actor!==c.actor||!frame.audience?.includes(c.actor))return empty('场景或在场资料不可用');
 try{
  if(typeof search!=='function')throw Error('本地向量接口未连接');
  const context={actor:c.actor,stages:c.character?.stages?.map(s=>s.id)||[],attitude:pre?.character?.mode==='select'?pre.character.attitude:c.character?.state?.attitude,expression:c.character?.expression};
  const result=await search({frame,context,query:canonQuery(frame,c,pre)},signal);
  if(result.version!==3||result.chars>1000||result.text!==referenceText(result.items))throw Error('本地向量结果格式无效');
  return result;
 }catch(e){if(signal?.aborted)throw e;return empty(e.message);}
}
// One compiler for native and imported presets; optional references lose budget first.
export function compileWithCanon(input,selection,compile){
 const base=compile(input);if(!selection?.text){if(selection?.diagnostics?.length){base.canon_reference={ids:[],text:'',chars:0,diagnostics:selection.diagnostics};base.preview.warnings.push('本轮未注入原著参考：'+(selection.diagnostics[0].reason||selection.diagnostics[0].warning||'无适用原文'));}return base;}
 let items=[...selection.items];while(items.length){
  const text=selection.version<3&&items.length===selection.items.length?selection.text:referenceText(items),next={...input,guidance:input.guidance+'\n'+text};let s;
  try{s=compile(next);}catch(e){if(/预算|容量|context|token/i.test(e.message)){items.pop();continue;}throw e;}
  if((s.compiled.trimmed||0)>(base.compiled.trimmed||0)){items.pop();continue;}
  if(!s.compiled.messages.some(m=>m.content.includes(text)))throw Error('预设未传入原著演出素材，请检查指导资料条目；未发送请求。');
  s.canon_reference={model:selection.model,index_version:selection.index_version,fingerprint:selection.fingerprint,ids:items.map(x=>x.id),text,chars:count(text),details:items.filter(x=>x.detail_group).map(x=>({id:x.id,group:x.detail_group,actor:x.detail_group==='outfit'?x.characters?.[0]:null,anchors:x.anchors}))};
  s.preview.warnings.push('本地原著素材 '+items.length+' 条／'+count(text)+' 字；仅正文使用。');return s;
 }
 base.preview.warnings.push('输入预算不足，已省略可选原著素材。');return base;
}
