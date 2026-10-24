// Author-approved design constants, not historical development speeds.
export const ERA_DAYS=Object.freeze({E0:[0,0],E1:[90,180],E2:[365,730],E3:[1095,1825]});
export const ERA_REFERENCES=Object.freeze(Object.fromEntries(Array.from({length:12},(_,i)=>['REF'+String(i+1).padStart(2,'0'),'E0'])));
export function eraDuration(classification,phase,evidence=[],now=0,stageRef=''){
  if(!Object.hasOwn(ERA_DAYS,classification))throw Error('ERA_UNCLASSIFIED');
  if(!['prepare','execute'].includes(phase))throw Error('INVALID_ERA_PHASE');
  const categories=new Set(),sources=new Set();
  for(const e of evidence){
    if(e.stage_ref!==stageRef||e.status!=='realized'||e.at>now||!['A','B','C'].includes(e.category)||!e.source_ref||sources.has(e.source_ref))continue;
    categories.add(e.category);sources.add(e.source_ref);
  }
  return Math.ceil(ERA_DAYS[classification][phase==='prepare'?0:1]*1440*(100-10*categories.size)/100);
}
export function remainingEra(classification,phase,elapsed,evidence,now,stageRef){
  if(!Number.isSafeInteger(elapsed)||elapsed<0)throw Error('INVALID_ERA_ELAPSED');
  return Math.max(0,eraDuration(classification,phase,evidence,now,stageRef)-elapsed);
}
