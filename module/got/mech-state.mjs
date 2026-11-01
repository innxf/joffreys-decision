import {readMech} from './stance-engine.mjs';
import {stanceTuning} from './stance-config.mjs';
import {quoteMatches} from './middleware-evidence.mjs';
import {profiles} from './dialogue-profiles.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const dimensions=['acumen','stress','trust','respect','affection','resentment','importance','attachment'];
export const mechRevision=c=>c.known.find(k=>k.ref==='mech:'+c.actor)?.mech_revision;
export const mechContract='可选 mech_deltas 数组，默认[]；仅提议当前人物因本轮实际听见或亲历而发生的变化，每项为 {dimension:"acumen|stress|trust|respect|affection|resentment|importance|attachment",target_id:"乔弗里关系用U001；attachment用已有对象ID；能力和压力用本人ID",raw_delta:数字,quote:"当前说话人的完整原句",speaker:"player|npc",refs:["本人known中的ref"],explanation:"具体为何改变，区分听闻与事实",agenda_impact:"keep|review"}。attachment额外必填attachment_tag，明确修改本人已有关系的tag；新关系只用RELATION，原句必须明确提及对象，且有本人已知的对象依据。数值为试用小幅变化，每项绝对值不超过20，不能用一次善意直接兑换忠诚或把未发生的执行结果当依据；意志力不压制普通情感。每次都检查诉求是否受影响，需要下一轮复核用review。只修改本人，不修改世界或替他人获知。';
export function checkMechDeltas(g,c,rows,prose){
 need(Array.isArray(rows)&&rows.length<=8,'MECH_DELTA_LIST');if(!rows.length)return;
 need(Number.isSafeInteger(mechRevision(c)),'MECH_CONTEXT_MISSING');
 const keys=new Set();
 for(const d of rows){
  need(d&&Object.keys(d).sort().join('|')===['agenda_impact','dimension','explanation','quote','raw_delta','refs','speaker','target_id',...(d.dimension==='attachment'?['attachment_tag']:[])].sort().join('|'),'MECH_DELTA_FIELDS');
  need(dimensions.includes(d.dimension)&&Number.isFinite(d.raw_delta)&&Math.abs(d.raw_delta)<=stanceTuning.maxDelta&&d.raw_delta!==0,'MECH_DELTA_VALUE');
  need(typeof d.explanation==='string'&&d.explanation.length>0&&d.explanation.length<=1500&&['keep','review'].includes(d.agenda_impact),'MECH_DELTA_EXPLANATION');
  need(['player','npc'].includes(d.speaker)&&!(d.speaker==='player'&&c.utterance_origin==='chair')&&quoteMatches(d.speaker==='player'?c.input:prose,d.quote),'MECH_DELTA_QUOTE');
  need(Array.isArray(d.refs)&&d.refs.length&&d.refs.every(ref=>c.known.some(k=>k.ref===ref)),'MECH_DELTA_UNKNOWN_EVIDENCE');
  need(d.dimension==='attachment'?g.entities.some(e=>e.id===d.target_id)&&d.target_id!==c.actor&&d.target_id!=='U001':d.target_id===(['acumen','stress'].includes(d.dimension)?c.actor:'U001'),'MECH_DELTA_TARGET');
  if(d.dimension==='attachment'){
   const prior=readMech(g,c.actor).private_track.core_attachments.some(a=>a.target_id===d.target_id&&a.tag===d.attachment_tag);
   const names=[d.target_id,g.entities.find(e=>e.id===d.target_id)?.name,...(profiles[d.target_id]?.name||'').split(/[／/]/)].filter(Boolean);
   const mentions=text=>names.some(name=>String(text).includes(name));
   need(typeof d.attachment_tag==='string'&&(prior||d.attachment_tag==='RELATION')&&mentions(Array.isArray(d.quote)?d.quote.join(''):d.quote),'MECH_RELATION_BINDING');
   need(prior||c.known.some(k=>d.refs.includes(k.ref)&&k.kind!=='own_mechanism'&&(k.targets?.some(t=>t.ref===d.target_id)||mentions(k.content))),'MECH_RELATION_UNKNOWN_TARGET');
  }
  const key=d.dimension+'|'+d.target_id+'|'+(d.attachment_tag||'');need(!keys.has(key),'MECH_DELTA_DUPLICATE');keys.add(key);
 }
}
export function applyMechDeltas(g,c,rows,prose,source,{batchVersions}={}){
 checkMechDeltas(g,c,rows,prose);if(!rows.length)return;
 const actor=g.actors.find(a=>a.id===c.actor),p=readMech(g,c.actor);
 need(mechRevision(c)===(batchVersions?.get(c.actor)??p.revision),'MECH_STALE_CONTEXT');
 // The original turn and its observations are the receipt, not a second history table.
 need(!g.dialogue.observations.some(o=>o.source===source+':mech'),'MECH_ALREADY_APPLIED');
 for(const d of rows){
  let container,key;
  if(d.dimension==='acumen'){container=p;key='acumen';}
  else if(d.dimension==='stress'){container=p.private_track;key='stress';}
  else if(d.dimension==='attachment'){
   let a=p.private_track.core_attachments.find(a=>a.target_id===d.target_id&&a.tag===d.attachment_tag);
   if(!a){a={target_id:d.target_id,tag:d.attachment_tag,intensity:0};p.private_track.core_attachments.push(a);}container=a;key='intensity';
  }else{container=p.private_track.joffrey_bond;key=d.dimension;}
  const old=container[key],delta=d.dimension==='acumen'?d.raw_delta*(p.plasticity/50)*(1-p.stubbornness/120):d.raw_delta;
  container[key]=Math.max(0,Math.min(100,Math.round((old+delta)*100)/100));
  const text=`${d.dimension}（${d.target_id}${d.attachment_tag?'/'+d.attachment_tag:''}）${old}→${container[key]}：${d.explanation}；诉求${d.agenda_impact==='review'?'需要结合此事复核':'本次核对后保留'}。`;
  const patch={dimension:d.dimension,target_id:d.target_id,...(d.attachment_tag?{attachment_tag:d.attachment_tag}:{}),text,updated_at:g.clock.elapsed_minutes,source};
  const i=p.prompt_patches.findIndex(x=>x.dimension===d.dimension&&x.target_id===d.target_id&&x.attachment_tag===d.attachment_tag);
  if(i<0)p.prompt_patches.push(patch);else p.prompt_patches[i]=patch;
  // This private experience remains the speaker's even if custody changed while Post was pending.
  g.dialogue.observations.push({id:'OBS-'+(++g.execution.serial),actors:[c.actor],at:g.clock.elapsed_minutes,content:'本人本轮经历与变化：'+text,source:source+':mech',targets:[]});
 }
 p.revision++;actor.mech_profile=p;
 if(rows.some(d=>d.agenda_impact==='review')&&g.dialogue.agendas[c.actor]?.character)g.dialogue.agendas[c.actor].character.pending=true;
}
