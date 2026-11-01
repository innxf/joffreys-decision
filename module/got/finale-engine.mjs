import {absentActor,custodyRows} from './custody-state.mjs';
import {advance,RuleError} from './world-engine.mjs';
const clone=structuredClone;
const need=(v,code='FINALE_COMPATIBILITY_GAP')=>{if(!v)throw new RuleError(code,'invalid');};
const tiers={unformed:0,initial:1,stable:2};
const bools=['court_role_available','jaime_offer_available','combat_request_planned','prior_night_lead','controlled_departure_proposal_planned','rescue_route_available','tywin_access_possible','tommen_hook_qualified'];
export function validateEntry(e){
 need(e&&typeof e==='object'&&e.power_levels&&e.cast_plan&&e.flags&&e.authority_scopes&&e.prior_npc_constraints&&Array.isArray(e.source_refs)&&e.source_refs.length);
 for(const key of ['finance','military','administration','intelligence'])need(Object.hasOwn(tiers,e.power_levels[key]));
 for(const key of bools)need(typeof e[key]==='boolean');
 need(['no_political_capital','recognized_contribution','important_political_capital'].includes(e.prestige));
 need(['ROSE','VARYS'].includes(e.culprit_route)&&['MARGAERY_WEDDING','ROYAL_CELEBRATION'].includes(e.ceremony));
 need(['supports_exclusion','contradicts_exclusion','not_determined'].includes(e.evidence_basis));
 for(const key of ['standard','limited','departure'])need(Array.isArray(e.prior_npc_constraints[key]));
 need(e.prior_npc_constraints.departure.every(id=>id==='P003'));
 for(const key of ['protect','exchange','review','acquit','pardon','stop_duel','departure','alert_control'])need(typeof e.authority_scopes[key]==='boolean');
 for(const key of ['tyrion_at_banquet','myrcella_present','sansa_present','tyrell_present','guard_handover','tommen_close','secondary_present'])need(typeof e.flags[key]==='boolean');
 need(['trust','complex_affection','extreme_fear','controlled','other'].includes(e.flags.sansa_attitude));
 need(['false_accusation','truthful','absent'].includes(e.flags.shae_testimony));
 need(['stay_voluntarily','escape_not_completed','escaped','not_applicable'].includes(e.sansa_route));
}
export function compileFreeze(e,identity,content){
 validateEntry(e);need(['FIN-FREEZE-0.1','FIN-FREEZE-0.2'].includes(content.freeze_contract.version));
 const revised=content.freeze_contract.version==='FIN-FREEZE-0.2';
 if(revised){
  need(['overbearing','bargaining','recognizes_king'].includes(e.tywin_attitude));
  need(['trusted','cautious','resentful'].includes(e.tyrion_attitude));
  need(['hostile','bargaining','committed'].includes(e.tyrell_attitude));
  need(['none','tyrion','other'].includes(e.sansa_engagement));
 }
 const p=e.power_levels,s=e.authority_scopes,at=k=>tiers[p[k]],
 rank=at('finance')===2&&at('military')===2&&at('administration')===2&&at('intelligence')>=1?'independent_king':
 at('finance')>=1&&at('military')>=1&&(at('administration')>=1||at('intelligence')>=1)?'negotiating_ally':'constrained_king';
 const report=e.evidence_basis==='supports_exclusion'?'EXCLUSION_EXISTING':e.evidence_basis==='contradicts_exclusion'?'CONTRADICTORY_EXISTING':['REPORT_UNFORMED','REPORT_INITIAL','REPORT_STABLE'][at('intelligence')];
 const review=['EXCLUSION_EXISTING','REPORT_STABLE'].includes(report)?'REVIEW_CLEARED':'REVIEW_UNCLEAR';
 const release=revised?(rank==='independent_king'?'ACQUIT':'UNAVAILABLE'):review==='REVIEW_CLEARED'&&(rank==='independent_king'||s.acquit)?'ACQUIT':rank==='independent_king'||s.pardon?'PARDON':'UNAVAILABLE';
 const night=e.prior_night_lead?'NIGHT_KNOWN_LEAD':at('intelligence')>=1?'NIGHT_AUTHORED_ALERT':e.controlled_departure_proposal_planned?'NIGHT_AUTHORED_PROPOSAL':'NIGHT_NO_ALERT';
 const protect=revised?rank!=='constrained_king':at('military')>=1||s.protect,bargain=revised?rank!=='constrained_king':(rank!=='constrained_king'||s.exchange)&&e.court_role_available,
 stop=revised?rank!=='constrained_king':(at('military')>=1&&rank!=='constrained_king')||s.stop_duel,intervene=revised?rank!=='constrained_king':night!=='NIGHT_NO_ALERT'&&(at('military')>=1||s.alert_control);
 const eligible={'S04-A':true,'S04-B':true,'S04-C':true,'FIN02-01':true,'FIN02-02':protect,'CUSTODY-FAMILY':true,
 'T02-A':true,'T02-B':true,'T02-C':true,'FIN03-02':e.jaime_offer_available,'T03-B':e.jaime_offer_available&&bargain,'T03-C':true,
 'FIN03-01':e.combat_request_planned,'FIN03-03':(at('intelligence')>=1&&at('administration')>=1)||s.review,
 'FIN03-04':release!=='UNAVAILABLE','T06-B':!e.combat_request_planned,'FIN04-01':true,'FIN04-03':stop,
 'FIN05-01':night!=='NIGHT_NO_ALERT','FIN05-02':night!=='NIGHT_NO_ALERT'&&(rank!=='constrained_king'||s.departure||s.pardon),
 'FIN05-03-A':intervene,'FIN05-03-B':intervene};
 // New author rule: eligibility uses only the frozen authority rank. Cast/knowledge
 // can skip a scene, but never rescore the king or fabricate knowledge.
 if(revised)Object.assign(eligible,{
  'FIN03-02':true,'T03-B':bargain,'FIN03-01':true,'FIN03-03':rank!=='constrained_king',
  'FIN03-04':rank==='independent_king','FIN03-PARDON':rank==='independent_king',
  'FIN03-05':rank==='independent_king','T06-B':true,
  'FIN05-01':true,'FIN05-02':rank!=='constrained_king'
 });
 const exchange=(key,prefix)=>{const refuses=e.prior_npc_constraints[key];need(refuses.every(a=>['P015','P002','P003'].includes(a)));const a=['P015','P002','P003'].find(a=>refuses.includes(a));return prefix+(a?'_REFUSED_'+a:'_ACCEPTED');};
 const responses={'FIN03-02':exchange('standard','EXCHANGE_STANDARD'),'T03-B':exchange('limited','EXCHANGE_LIMITED'),
 'FIN03-03':review,'FIN03-04':release,'FIN05-02':e.prior_npc_constraints.departure.includes('P003')?'DEPARTURE_REFUSED':'DEPARTURE_ACCEPTED',
 'T02-A':e.culprit_route+'_ACCOUNTABILITY','T02-B':e.culprit_route+'_BOUNDED_EXCHANGE','T02-C':e.culprit_route+'_ALLIANCE_FIRST'};
 if(revised){responses['FIN03-PARDON']='PARDON';responses['FIN03-05']='DUEL_ASSIST_ACCEPTED';}
 const choices=Object.fromEntries(Object.entries(eligible).map(([id,yes])=>[id,{eligible:yes,label_version:id==='FIN03-04'?release:id,response_version:responses[id]??id,source_refs:clone(e.source_refs)}]));
 return {...identity,rule_version:content.freeze_contract.version,baseline:{...clone(e),rank,report,review,release,night,can_protect:protect,can_stop_duel:stop,...(revised?{can_fix_duel:rank==='independent_king'}:{})},choices};
}
const scene=(f,id=f.progress.scene)=>f.content.scenes.find(s=>s.id===id);
const has=(f,kind)=>f.records.some(r=>r.kind===kind);
const result=(f,kind)=>f.records.findLast(r=>r.kind===kind);
function context(f){const b=f.freeze.baseline,p=f.progress;return {...b.flags,rank:b.rank,ceremony:b.ceremony,culprit_route:b.culprit_route,prestige:b.prestige,
 can_protect:b.can_protect,can_stop_duel:b.can_stop_duel,can_fix_duel:b.can_fix_duel??false,duel_fixed:has(f,'duel_assistance_ordered'),
 tywin_attitude:b.tywin_attitude,tyrion_attitude:b.tyrion_attitude,tyrell_attitude:b.tyrell_attitude,sansa_engagement:b.sansa_engagement,
 jaime_present:b.cast_plan.P015!=='本版本未安排到场',
 tommen_close:b.flags.tommen_close,combat_request:b.combat_request_planned,
 supported:p.choices.includes('FIN02-02')&&p.choices.includes('S04-A'),custody_choice:p.choices.find(x=>['FIN02-01','FIN02-02','CUSTODY-FAMILY'].includes(x)),
 last_choice:p.last_choice,reply_version:f.freeze.choices[p.last_choice]?.response_version,report:b.report,night_report:b.night,
 duel_stopped:has(f,'duel_stopped'),can_reach_tywin:b.tywin_access_possible&&!has(f,'tywin_protected'),exit:p.exit_id,reason:p.ending_reason,
 sansa_present:b.flags.sansa_present&&!has(f,'sansa_escaped'),sansa_departed:has(f,'sansa_escaped'),sansa_report_known:has(f,'sansa_absence_report'),
 rescue_blocked:has(f,'rescue_blocked')||!b.rescue_route_available&&b.flags.prior_rescue_blocked===true,
 escape_report:has(f,'escape_report'),tywin_protected:has(f,'tywin_protected')};}
function blocks(f){const c=context(f),k=f.progress.phase==='reply'?'reply':'body';return scene(f)?.playback?.blocks.filter(b=>b.kind===k&&Object.entries(b.when).every(([key,val])=>c[key]===val))??[];}
export function finaleView(g){
 const f=g.finale;if(!f?.freeze)return {active:false};const current=scene(f);
 return {active:true,ended:f.progress.phase==='ended',scene:f.progress.scene,title:current?.title??'第一部终章',part:current?.part,
 viewpoint:current?.viewpoint,location:current?.location.replace('既有地点绑定：',''),paragraphs:blocks(f).flatMap(b=>b.text.split(/\n\n+/)),
 options:options(f),phase:f.progress.phase,history:clone(f.progress.history),exit_id:f.progress.exit_id,
 ending_title:f.progress.phase==='ended'?(f.content.exit_contract.entries.find(e=>e.id===f.progress.exit_id)?.display_title??'第一部终章'):null,known_records:f.records.filter(r=>r.known_by.includes('U001')).map(r=>({kind:r.kind,at:r.at,text:r.text}))};
}
function options(f){
 if(f.progress.phase!=='body')return [];
 let ids=scene(f)?.planned_options??[];
 if(f.progress.scene==='FIN01-S04'&&!f.freeze.baseline.flags.tyrion_at_banquet)ids=[];
 if(f.progress.scene==='FIN03-S03'&&!f.freeze.baseline.jaime_offer_available)ids=[];
 if(f.freeze.rule_version==='FIN-FREEZE-0.2'){
  if(f.progress.scene==='FIN03-S06'){
   // Four alternatives at most. Pardon remains a distinct act, not a false acquittal.
   if(f.freeze.baseline.rank==='independent_king')ids=ids.filter(id=>!['FIN03-03','T06-B'].includes(id));
   else ids=ids.filter(id=>id!=='T06-B'||!f.freeze.baseline.combat_request_planned);
   if(!f.freeze.baseline.combat_request_planned)ids=ids.filter(id=>!['FIN03-01','FIN03-05'].includes(id));
  }
  if(f.progress.scene==='FIN04-S04'&&has(f,'duel_assistance_ordered'))ids=[];
  if(f.progress.scene==='FIN05-S01'&&f.freeze.baseline.night==='NIGHT_NO_ALERT')ids=[];
 }
 return ids.filter(id=>f.freeze.choices[id]?.eligible).map(id=>({id,label:id==='FIN03-04'?f.content.freeze_contract.npc_reply_variants[f.freeze.baseline.release].label:f.content.labels[id]}));
}
function record(g,kind,text,known_by=['U001'],data={}){
 const f=g.finale;need(!has(f,kind),'DUPLICATE_STORY_RESULT');const r={id:'FIN-RESULT-'+(f.records.length+1),scene:f.progress.scene,kind,text,at:g.clock.elapsed_minutes,known_by:clone(known_by),data:clone(data)};f.records.push(r);return r.id;
}
function actor(g,id){const a=g.actors.find(a=>a.id===id);need(a,'FINALE_CAST_MISSING');return a;}
function setLife(g,id,life){const a=actor(g,id);a.life=life;a.last_updated_minute=g.clock.elapsed_minutes;}
function close(g,exit,reason){const f=g.finale;const e=f.content.exit_contract.entries.find(e=>e.id===exit);need(e&&e.ending_reasons.includes(reason),'FINALE_EXIT_MISMATCH');f.progress.exit_id=exit;f.progress.ending_reason=reason;}
function checkExit(g){
 const f=g.finale,e=f.content.exit_contract.entries.find(e=>e.id===f.progress.exit_id);need(e,'FINALE_EXIT_NOT_READY');
 const released=has(f,'release_completed'),escaped=has(f,'secret_escape_completed'),pending=has(f,'case_pending'),exchange=has(f,'exchange_effective'),departure=has(f,'departure_effective'),stopped=has(f,'duel_stopped');
 const facts={exchange_parties_accepted:exchange,exchange_essential_terms_completed:exchange,safe_handover_completed:exchange||departure,
  tyrion_detained:actor(g,'P003').mobility==='受控',case_exclusion_confirmed:has(f,'acquittal_effective')||result(f,'review_report')?.data.version==='REVIEW_CLEARED',
  release_completed:released,pardon_effective:has(f,'pardon_effective'),case_pending:pending,disposition_announced:pending,
  case_death_sentence_active:has(f,'death_sentence_active')&&!pending,duel_stopped:stopped,separation_completed:stopped,
  oberyn_alive:actor(g,'R001').life==='存活',case_new_death_sentence:has(f,'death_sentence_active')&&!pending,departure_accepted:departure,
  accessed_tywin:has(f,'tywin_death_actual'),custody_outcome_known:has(f,'rescue_blocked')||has(f,'no_rescue_plan'),tyrion_alive:actor(g,'P003').life==='存活',
  secret_escape_completed:escaped,exit_route_established:escaped,tywin_death_confirmed:actor(g,'P002').life==='已故'&&has(f,'tywin_death_actual'),death_report_received:has(f,'tywin_death_report')};
 for(const [key,expected] of Object.entries(e.actual_fact_checks))need(Object.hasOwn(facts,key)&&facts[key]===expected,'FINALE_EXIT_FACT_MISMATCH');
}
function release(g,kind){const f=g.finale;const a=actor(g,'P003');a.location=kind==='exchange'||kind==='departure'?'红堡外约定安全交接点；后续行程在途':'红堡；本案已解除看管';a.mobility='受任务、路程与守卫条件限制';
 return record(g,'release_completed','提利昂已经实际离开本案看管。',['U001','P003'],{kind});}
function settleChoice(g){
 const f=g.finale,p=f.progress,id=p.last_choice,rv=f.freeze.choices[id].response_version;
 if(['S04-A','S04-B','S04-C'].includes(id))record(g,'banquet_response','国王作出了宴会上的回应。',['U001','P003'],{choice:id});
 else if(['FIN02-01','FIN02-02','CUSTODY-FAMILY'].includes(id)){
  actor(g,'P003').location=id==='FIN02-02'?'红堡保护性看管处':'红堡正式监押处';actor(g,'P003').mobility='受控';record(g,'custody_effective','本案看管安排已经接令执行。',['U001','P003','P001'],{choice:id});
 }else if(['T02-A','T02-B','T02-C'].includes(id))record(g,'tyrell_response','提利尔代表作出对应答复；旧筹备关联不等于本次投毒已经定罪。',['U001','P030','P031'],{choice:id});
 else if(['FIN03-02','T03-B'].includes(id)){
  if(rv.includes('REFUSED'))record(g,'exchange_refused','有关人物拒绝了这份交换。',['U001','P002','P003','P015'],{response:rv});
  else{record(g,'exchange_effective','交换条款经各方接受，必要的安全交接已完成。',['U001','P002','P003','P015'],{variant:id==='T03-B'?'limited':'standard',future_inheritance:'尚须履约'});release(g,'exchange');
   const seat=g.kingsguard.find(k=>k.holder==='P015');if(seat){seat.holder=null;seat.available=false;seat.duty='詹姆正式退职；此席待补';}const lc=g.offices.find(o=>o.id==='OFF-LC');if(lc){lc.holder=null;lc.status='空缺';}
   actor(g,'P015').roles=actor(g,'P015').roles.filter(r=>!r.includes('御林')&&!r.includes('队长'));close(g,'FX01',id==='T03-B'?'exchange_limited_completed':'exchange_standard_completed');}
 }else if(id==='FIN03-03'){
  record(g,'review_report','复核报告已当面呈交。',['U001'],{version:rv});
  if(rv==='REVIEW_CLEARED'){release(g,'acquit');record(g,'acquittal_effective','现有本案指控不能成立。');close(g,'FX02','review_cleared_release_completed');}
  else{record(g,'case_pending','本案依法未决，比武和新的死刑推进暂停。');close(g,'FX04','review_unclear_disposition_completed');}
 }else if(id==='FIN03-04'||id==='FIN03-PARDON'){
  release(g,rv==='ACQUIT'?'acquit':'pardon');record(g,rv==='ACQUIT'?'acquittal_effective':'pardon_effective',rv==='ACQUIT'?'本案指控不能成立。':'国王赦免本案追诉；未宣告所有指控均属虚假。');close(g,rv==='ACQUIT'?'FX02':'FX03',rv==='ACQUIT'?'acquittal_release_completed':'pardon_release_completed');
 }else if(id==='T06-B'){record(g,'case_pending','现行合法看管保留，本案没有新增死刑推进。');close(g,'FX04','lawful_pending_disposition_completed');}
 else if(id==='FIN03-01'||id==='FIN03-05'){
  record(g,'combat_authorized','国王准许比武审判。');
  if(id==='FIN03-05')record(g,'duel_assistance_ordered','国王密令亲信削弱魔山的体力，帮助奥柏伦取胜。',['U001']);
 }
 else if(id==='FIN04-03'){record(g,'duel_stopped','号令已执行，双方已实际分隔；案件仍未决。');record(g,'case_pending','比武没有完成，不按胜负新增死刑。');}
 else if(id==='FIN04-01'){setLife(g,'R001','已故');record(g,'oberyn_death','奥柏伦在比武中死亡。',['U001']);record(g,'gregor_wounded','格雷果受伤中毒，仍在救治。',['U001']);}
 else if(id==='FIN05-02'){
  if(rv==='DEPARTURE_ACCEPTED'){record(g,'departure_effective','受控离开条件已经接受，安全交接已完成。',['U001','P003']);release(g,'departure');close(g,'FX06','controlled_departure_handover_completed');}
  else record(g,'departure_refused','提利昂拒绝了受控离开条款。',['U001','P003']);
 }else if(id==='FIN05-03-A'){record(g,'rescue_blocked','当值者已截断所报告的接应。');close(g,'FX07','rescue_block_confirmed');}
 else if(id==='FIN05-03-B')record(g,'tywin_protected','首相住区的相应通行保护已经执行。');
}
function completeScene(g,ctx){
 const f=g.finale,p=f.progress,s=scene(f),b=f.freeze.baseline;let next=s.default_next;
 const end=g.clock.elapsed_minutes+s.minutes;advance(g,end,ctx);
 if(s.id==='FIN01-S06')record(g,'poison_delivery','污染的礼仪份错置给托曼。',[]);
 if(s.id==='FIN01-S10'){
  if(b.tommen_hook_qualified){actor(g,'P060').location='科本秘密照护处';actor(g,'P060').mobility='受控';record(g,'secret_care_transfer','托曼秘密送交科本，抢救结果未定。',['R007']);record(g,'sealed_letter_arrived','科本的封件已经按私人渠道送达，尚未阅读。',[]);}
  else{setLife(g,'P060','已故');record(g,'tommen_death_actual','托曼实际死亡。',['P001','P018']);}
  if(b.sansa_route==='escaped'){
   actor(g,'P012').location='依已接受的接应离开红堡；既定离京行程在途';actor(g,'P012').mobility='受任务、路程与守卫条件限制';
   record(g,'sansa_escaped','珊莎依婚礼前已接受的接应实际离开。',['P012']);
  }else if(b.sansa_route==='escape_not_completed'){
   actor(g,'P012').location='红堡；仍在既定宫廷安排内';actor(g,'P012').mobility='受控';record(g,'sansa_departure_not_completed','珊莎未能完成离开，恐惧或受控不等于自愿。',['P012']);
  }else if(b.sansa_route==='stay_voluntarily')record(g,'sansa_stayed_voluntarily','珊莎依既有态度与安排选择留下。',['P012']);
 }
 if(s.id==='FIN01-S11')record(g,'tommen_declared_dead','托曼被公开宣布死亡。',['U001','P001','P003']);
 if(s.id==='FIN03-S01'){
  record(g,'evidence_report','案情材料已呈报；存在提利尔旧筹备关联。',['U001'],{version:b.report});
  if(has(f,'sansa_escaped')&&b.power_levels.intelligence!=='unformed')record(g,'sansa_absence_report','回报确认珊莎已不在原处，完整接应和目的地仍未获知。');
 }
 if(s.id==='FIN03-S05'&&b.combat_request_planned)record(g,'combat_requested','提利昂提出比武审判。',['U001','P003']);
 if(s.id==='FIN04-S02'&&has(f,'duel_assistance_ordered'))record(g,'duel_assistance_completed','亲信确认秘密安排已落实，魔山上场时体力受损。',['U001']);
 if(s.id==='FIN04-S04'&&has(f,'duel_assistance_completed')){
  setLife(g,'P078','已故');record(g,'gregor_death_in_duel','格雷果在比武中被奥柏伦杀死。',['U001','P003','R001']);
  record(g,'oberyn_victory','奥柏伦赢得比武并存活。',['U001','P003','R001']);
 }
 if(s.id==='FIN04-S05'){
  if(has(f,'oberyn_victory')){
   release(g,'trial_by_combat');record(g,'acquittal_effective','依据比武审判，提利昂获判无罪。',['U001','P003','R001'],{basis:'trial_by_combat'});
   close(g,'FX02','oberyn_victory_release_completed');
  }else if(has(f,'duel_stopped')){record(g,'gregor_wounded','格雷果受伤中毒，仍在救治。');close(g,'FX05','duel_stopped_disposition_completed');}
  else record(g,'death_sentence_active','比武结果导致提利昂仍面临死亡危险。',['U001','P003']);
 }
 if(s.id==='FIN05-S01'&&!p.exit_id&&!b.rescue_route_available){
  record(g,b.flags.prior_rescue_blocked?'rescue_blocked':'no_rescue_plan',b.flags.prior_rescue_blocked?'既有阻断仍有效。':'既定接应不存在，看管继续。',[]);
  close(g,'FX07',b.flags.prior_rescue_blocked?'prior_rescue_block_confirmed':'custody_continues_no_rescue');
 }
 if(s.id==='FIN05-S02'){actor(g,'P003').location='君临秘密离城途中';actor(g,'P003').mobility='受任务、路程与守卫条件限制';record(g,'secret_escape_completed','提利昂秘密离监，进入已成立的离城路线。',[]);}
 if(s.id==='FIN06-S01'&&(!b.tywin_access_possible||has(f,'tywin_protected')))close(g,'FX08','secret_departure_without_tywin_access');
 if(s.id==='FIN06-S02'){setLife(g,'P002','已故');record(g,'tywin_death_actual','泰温在私下致命冲突中死亡。',[]);const o=g.offices.find(o=>o.id==='OFF-HAND');o.holder=null;o.status='空缺';}
 if(s.id==='FIN06-S03'){record(g,'tywin_death_report','泰温死亡查验报告已经送达国王。');record(g,'escape_report','监押处确认提利昂已不在房中，完整逃亡经过仍未查明。');close(g,'FX09','tywin_death_verified_and_report_received');}
 if(s.id==='FIN07-S04')record(g,'private_letter_read','科本来信：托曼仍有生命迹象，抢救未停止，结果未定。',['U001','R007']);
 if(s.id==='FIN07-S01'){
  if(['FIN-PLAYER-1.1','FIN-PLAYER-1.2'].includes(f.content.version)&&p.exit_id==='FX02')record(g,'royal_alliance_pledged','提利昂承诺继续为国王效力，奥柏伦愿协助国王与多恩交涉。',['U001','P003','R001'],{title:'牢不可破的联盟'});
  need(p.exit_id,'FINALE_EXIT_NOT_READY');next=b.tommen_hook_qualified&&has(f,'secret_care_transfer')&&has(f,'sealed_letter_arrived')?'FIN07-S04':'FIN07-S05';
 }else if(s.id==='FIN07-S04')next='FIN07-S05';
 else if(p.exit_id)next='FIN07-S01';
 else if(s.id==='FIN03-S03')next='FIN03-S04';
 else if(s.id==='FIN03-S06')next=['FIN03-01','FIN03-05'].includes(p.last_choice)?'FIN04-S01':next;
 if(next==='FIN02-S05'&&b.cast_plan.P015==='本版本未安排到场'){p.skipped.push(next);next='FIN03-S01';}
 if(next==='FIN03-S03'&&!b.jaime_offer_available){p.skipped.push(next);next='FIN03-S04';}
 p.completed.push(s.id);p.scene=next;p.phase='body';
 if(next==='FIN07-S05'){
  checkExit(g);
  p.phase='ended';record(g,'ending_saved','终章结果已保存。',[]);
  f.ending={technical_end:'END_CONTINUE',exit_id:p.exit_id,last_story_scene:p.completed.findLast(x=>!x.startsWith('FIN07')),reason:p.ending_reason,
   actual_result_refs:f.records.map(r=>r.id),closure_fragment_ids:p.history.map((h,i)=>h.scene.startsWith('FIN07')?'history:'+i:null).filter(Boolean),
   freeze_id:f.freeze.freeze_id,branch_id:g.revision.branch_id,last_completed_closure:s.id,source_world_version:g.revision.state_id,continuation_state_ref:ctx.result_revision};
 }else{
  const upcoming=scene(f,next);need(upcoming?.playback,'FINALE_SCENE_MISSING');
  if(upcoming.scheduled_clock){const [h,m]=upcoming.scheduled_clock.split(':').map(Number);const when=(360+(upcoming.scheduled_day_offset??0))*1440+h*60+m-360;need(when>=g.clock.elapsed_minutes,'FINALE_TIME_CONFLICT');if(when>g.clock.elapsed_minutes)advance(g,when,ctx);}
 }
}
export function applyFinaleAction(g,a,ctx,content){
 need(a&&['finale_enter','finale_continue','finale_choose'].includes(a.type));
 if(a.type==='finale_enter'){
  need(Object.keys(a).length===1);need(g.finale?.entry,'FINALE_ENTRY_MISSING');const f=g.finale;
  if(f.freeze)return 'FINALE_ALREADY_ENTERED';
   need(!custodyRows(g).some(r=>['escorting','held','escaped'].includes(r.status)),'当前拘押或失踪与固定终章的出场冲突；本次未进入终章，也未自动释放任何人。需先处理拘押，失踪分支尚需作者内容支持。');
  for(const id of ['U001','P001','P002','P003','P060','R001'])need(actor(g,id).life==='存活','FINALE_CAST_INCOMPATIBLE');
  if(f.entry.tommen_hook_qualified)need(actor(g,'R007').life==='存活','FINALE_CARE_INCOMPATIBLE');
  f.content=clone(content);f.freeze=compileFreeze(f.entry,{freeze_id:'freeze-'+ctx.id,campaign_id:g._runtime.run_id,branch_id:g.revision.branch_id,source_world_version:g.revision.state_id,frozen_at:g.clock.elapsed_minutes,source_refs:clone(f.entry.source_refs)},content);
  f.progress={scene:'FIN01-S01',phase:'body',last_choice:null,choices:[],completed:[],skipped:[],history:[],exit_id:null,ending_reason:null};f.records=[];f.ending=null;
  return 'FINALE_ENTERED';
 }
 const f=g.finale;need(f?.freeze&&f.progress.phase!=='ended','FINALE_NOT_ACTIVE');need(f.binding_branch===g.revision.branch_id,'FINALE_BRANCH_MISMATCH');
 const v=finaleView(g);
 if(a.type==='finale_choose'){
  need(Object.keys(a).sort().join(',')==='choice_id,type');need(f.progress.phase==='body'&&v.options.some(o=>o.id===a.choice_id),'FINALE_OPTION_UNAVAILABLE');
  f.progress.history.push({scene:v.scene,title:v.title,viewpoint:v.viewpoint,paragraphs:v.paragraphs,choice:v.options.find(x=>x.id===a.choice_id).label});
  f.progress.choices.push(a.choice_id);f.progress.last_choice=a.choice_id;f.progress.phase='reply';settleChoice(g);
  need(blocks(f).length,'FINALE_REPLY_MISSING');return 'FINALE_CHOICE_APPLIED';
 }
 need(Object.keys(a).length===1);need(!v.options.length,'FINALE_CHOICE_REQUIRED');
 f.progress.history.push({scene:v.scene,title:v.title,viewpoint:v.viewpoint,paragraphs:v.paragraphs,choice:null});
 completeScene(g,ctx);return f.progress.phase==='ended'?'FINALE_ENDED':'FINALE_SCENE_ADVANCED';
}
export function finaleErrors(f,g){
 if(!f)return [];
 try{
  validateEntry(f.entry);need(f.binding_branch===g.revision.branch_id);
  if(!f.freeze){need(f.progress===null&&f.ending===null&&Array.isArray(f.records)&&f.records.length===0,'FINALE_FREEZE_MISSING');return [];}
  need(['FIN-PLAYER-1.0','FIN-PLAYER-1.1','FIN-PLAYER-1.2'].includes(f.content?.version)&&['FIN-FREEZE-0.1','FIN-FREEZE-0.2'].includes(f.freeze.rule_version));
  need(f.progress&&['body','reply','ended'].includes(f.progress.phase)&&Array.isArray(f.progress.choices)&&new Set(f.progress.choices).size===f.progress.choices.length);
  need(Array.isArray(f.content.scenes)&&f.content.scenes.length===37&&new Set(f.content.scenes.map(s=>s.id)).size===37&&Array.isArray(f.records)&&new Set(f.records.map(r=>r.id)).size===f.records.length);
  const keys=new Set(['guard_handover','ceremony','rank','tyrell_present','prestige','tommen_close','myrcella_present','sansa_present','sansa_departed','sansa_report_known','tyrion_at_banquet','can_protect','supported','custody_choice','report','culprit_route','shae_testimony','combat_request','can_stop_duel','duel_stopped','night_report','can_reach_tywin','last_choice','reply_version','exit','reason','secondary_present','rescue_blocked','escape_report','tywin_protected','sansa_attitude','can_fix_duel','duel_fixed','tywin_attitude','tyrion_attitude','tyrell_attitude','sansa_engagement','jaime_present']);
  for(const s of f.content.scenes){
   if(['FIN07-S02','FIN07-S03','FIN07-S05'].includes(s.id))continue;
   need(s.playback?.id===s.id&&Array.isArray(s.playback.blocks)&&s.playback.blocks.length>0,'FINALE_SCRIPT_CORRUPT');
   for(const b of s.playback.blocks)need(['body','reply'].includes(b.kind)&&typeof b.text==='string'&&b.text.length>0&&b.when&&Object.entries(b.when).every(([k,v])=>keys.has(k)&&['string','boolean'].includes(typeof v)),'FINALE_SCRIPT_CORRUPT');
  }
  need(Number.isInteger(f.freeze.frozen_at)&&f.freeze.frozen_at<=g.clock.elapsed_minutes);
  need(Array.isArray(f.progress.history)&&Array.isArray(f.progress.completed)&&new Set(f.progress.completed).size===f.progress.completed.length);
  const choiceIds=Object.keys(f.freeze.choices);need(choiceIds.length===(f.freeze.rule_version==='FIN-FREEZE-0.2'?24:22)&&f.progress.choices.every(id=>f.freeze.choices[id]?.eligible));
  need(f.content.scenes.some(s=>s.id===f.progress.scene));
  need(f.records.every(r=>Number.isInteger(r.at)&&r.at<=g.clock.elapsed_minutes&&r.at>=f.freeze.frozen_at&&Array.isArray(r.known_by)&&r.known_by.every(id=>g.actors.some(a=>a.id===id))&&typeof r.text==='string'));
  if(f.progress.phase==='ended'){need(f.ending?.exit_id===f.progress.exit_id&&f.ending.actual_result_refs.every(ref=>f.records.some(r=>r.id===ref)));checkExit(g);}
  if(f.progress.exit_id)need(f.content.exit_contract.entries.some(e=>e.id===f.progress.exit_id));
  const rebuilt=compileFreeze(f.entry,{},f.content);need(JSON.stringify(rebuilt.choices)===JSON.stringify(f.freeze.choices),'FINALE_FREEZE_CORRUPT');
  need(JSON.stringify(rebuilt.baseline)===JSON.stringify(f.freeze.baseline),'FINALE_FREEZE_CORRUPT');
  return [];
 }catch(e){return [e.message||'Invalid finale'];}
}
