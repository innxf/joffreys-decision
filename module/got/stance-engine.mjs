import {defaultMech,stanceTuning as tuning} from './stance-config.mjs';
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
export function readMech(g,id){
 const actor=g.actors.find(a=>a.id===id);if(!actor)throw Error('MECH_ACTOR_MISSING');
 return structuredClone(actor.mech_profile||defaultMech(id));
}
export function getEffectiveWeights(p){
 const progress=clamp((p.acumen-tuning.growthStart)/tuning.growthRange,0,1),pub=p.public_track;
 return Object.fromEntries(Object.entries(pub.base_weights).map(([key,value])=>[key,value+(pub.mature_weights[key]-value)*progress]));
}
export function calcPerceivedAuthority(g,id){
 const p=readMech(g,id),auth=p.public_track.authority_view,w=getEffectiveWeights(p);
 // This is the actor's estimate. Never read secret live balances or the target's private profile here.
 const share=auth.faction_shares[p.public_track.resource_share_key]||0;
 return auth.personal_prestige*w.prestige+auth.personal_dread*w.dread+auth.legitimacy*w.legitimacy+auth.political_resource*(1-share)*w.resource;
}
export function checkEmotionalOverride(p,event={}){
 // Permanent stress or feelings alone cannot create an event or reset stress.
 if(!event.source_ref)return {overridden:false,source:null};
 let impact=0,source=null;
 for(const att of p.private_track.core_attachments)if(!['PATRON','RELATION'].includes(att.tag)&&(event.harmedTargets?.includes(att.target_id)||event.violatedTags?.includes(att.tag))){
  if(att.intensity*tuning.attachmentImpact>impact){impact=att.intensity*tuning.attachmentImpact;source=att;}
 }
 if(event.joffrey_trigger==='resentment'||event.joffrey_trigger==='affection'){
  const bond=p.private_track.joffrey_bond,n=bond[event.joffrey_trigger]*bond.importance/100;
  if(n>impact){impact=n;source={target_id:'U001',tag:event.joffrey_trigger};}
 }
 const threshold=Math.max(20,p.acumen*.8+p.willpower*.6);
 return {overridden:!!source&&(impact+p.private_track.stress*tuning.stressImpact)/threshold>=tuning.emotionalRatio,source:structuredClone(source)};
}
export function evaluateCovertBehavior(p,alignment,event={}){
 const relation=p.private_track.core_attachments.filter(a=>a.target_id===event.targetId).reduce((n,a)=>Math.max(n,a.intensity),0);
 const fear=p.public_track.authority_view.personal_dread*getEffectiveWeights(p).dread;
 const incentive=relation*.9+Math.max(0,-alignment)*.6;
 const net=incentive-p.public_track.secrecy_discipline-fear*.6;
 // Each opportunity is supplied by a real execution adapter, not inferred from intelligence.
 if(event.leak_path&&net>=tuning.leakMargin)return 'COVERT_LEAK';
 if(event.sabotage_opportunity&&net>=tuning.leakMargin)return 'ACTIVE_SABOTAGE';
 if(event.can_delay&&net>=tuning.dragMargin)return 'PASSIVE_DRAG';
 return 'CLEAN_EXECUTION';
}
export function evaluateActorStance(g,id,event={}){
 const p=readMech(g,id),w=getEffectiveWeights(p),bond=p.private_track.joffrey_bond;
 const alignment=clamp(event.alignment??0,-100,100),emotional=checkEmotionalOverride(p,event);
 // Trust/respect have a small political effect; affection is not a universal loyalty score.
 const pressure=calcPerceivedAuthority(g,id)+(bond.trust+bond.respect-100)*.05-p.public_track.base_capital;
 let stance,choice='accept';
 if(emotional.overridden){stance='EMOTIONAL_RECONSIDERATION';choice='conditional';}
 else if(pressure<=0){
  stance=alignment>=tuning.cooperate?'ALLIED_COOPERATION':alignment<tuning.oppose?'COUNTER_BALANCE':'CONDITIONAL_BARGAIN';
  choice=stance==='ALLIED_COOPERATION'?'accept':stance==='COUNTER_BALANCE'?'refuse':'conditional';
 }else if(alignment<tuning.oppose&&p.public_track.agenda_type==='HONOR'&&event.violates_principle){stance='REFUSE_ON_HONOR';choice='refuse';}
 else if(alignment>=tuning.cooperate)stance='PRAGMATIC_SERVE';
 else if(w.legitimacy>=Math.max(w.dread,w.resource,w.prestige))stance='DUTIFUL_OBEY';
 else if(w.dread>=.5&&p.willpower<50)stance='SUBMISSION_FEAR';
 else stance='GRUDGING_COMPLIANCE';
 return {stance,choice,pressure,alignment,emotional,covert:choice==='accept'?evaluateCovertBehavior(p,alignment,event):'CLEAN_EXECUTION'};
}
export function mechEvidence(g,id){
 const p=readMech(g,id);
 return {ref:'mech:'+id,kind:'own_mechanism',at:g.clock.elapsed_minutes,source:'V2 trial / 本人机制状态',
  content:'本人当前机制资料（用于理解变化，不覆盖完整人设；估计不等于世界事实）：'+JSON.stringify(p),mech_revision:p.revision};
}
export function mechErrors(p,g){
 const errors=[],valid=n=>Number.isFinite(n)&&n>=0&&n<=100;
 if(!p||p.version!==1||!Number.isSafeInteger(p.revision)||p.revision<0)return ['MECH_VERSION'];
 if(['acumen','willpower','stubbornness','plasticity'].some(k=>!valid(p[k]))||Object.hasOwn(p,'current_cognition'))errors.push('MECH_ABILITY');
 const pub=p.public_track,priv=p.private_track;
 if(!pub||!valid(pub.base_capital)||!valid(pub.secrecy_discipline)||typeof pub.agenda_type!=='string'||!(pub.resource_share_key===null||typeof pub.resource_share_key==='string'))errors.push('MECH_PUBLIC');
 for(const key of ['base_weights','mature_weights']){const w=pub?.[key];if(!w||Object.keys(w).sort().join()!=='dread,legitimacy,prestige,resource'||Object.values(w).some(n=>!Number.isFinite(n)||n<0||n>1)||Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-1)>1e-8)errors.push('MECH_WEIGHTS');}
 const auth=pub?.authority_view;
 if(!auth||['personal_prestige','personal_dread','legitimacy','political_resource'].some(k=>!valid(auth[k]))||typeof auth.source!=='string'||!auth.faction_shares||Object.values(auth.faction_shares).some(n=>!Number.isFinite(n)||n<0||n>1)||Object.values(auth.faction_shares).reduce((a,b)=>a+b,0)>1)errors.push('MECH_AUTHORITY_VIEW');
 if(!priv||!valid(priv.stress)||!priv.joffrey_bond||['trust','respect','affection','resentment','importance'].some(k=>!valid(priv.joffrey_bond[k])))errors.push('MECH_PRIVATE');
 if(!Array.isArray(priv?.core_attachments)||priv.core_attachments.some(a=>typeof a.target_id!=='string'||!g.entities.some(e=>e.id===a.target_id)||typeof a.tag!=='string'||!valid(a.intensity))||new Set(priv.core_attachments.map(a=>a.target_id+'|'+a.tag)).size!==priv.core_attachments.length)errors.push('MECH_ATTACHMENTS');
 if(!Array.isArray(p.prompt_patches)||p.prompt_patches.some(x=>typeof x.dimension!=='string'||typeof x.text!=='string'||x.text.length>2000||!Number.isSafeInteger(x.updated_at)||x.updated_at<0||x.updated_at>g.clock.elapsed_minutes||typeof x.source!=='string'))errors.push('MECH_PATCHES');
 return errors;
}
