// Explicit late-stage test worlds. They are not earned campaign progress.
import {initializeExecution} from './world-engine.mjs';
export const profiles=[
 {id:'oberyn-victory',name:'比武改写 · 可暗助奥柏伦获胜',rank:'independent',tywin:'bargaining',tyrion:'trusted',engagement:'none'},
 {id:'independent',name:'独立国王 · 完整选择',rank:'independent'},
 {id:'ally',name:'协商国王 · 部分权限',rank:'ally'},
 {id:'constrained',name:'受制国王 · 默认审判链',rank:'constrained'},
 {id:'pardon',name:'既有反证 · 赦免出口',rank:'independent',evidence:'contradicts_exclusion'},
 {id:'review-unclear',name:'复核不足 · 未决出口',rank:'ally'},
 {id:'no-combat',name:'无比武请求 · 合法未决',rank:'constrained',combat:false},
 {id:'exchange-refused',name:'交换遭拒 · 继续审判',rank:'independent',refusal:true},
 {id:'no-rescue',name:'没有接应 · 看管继续',rank:'constrained',rescue:false},
 {id:'blocked-rescue',name:'既有接应已阻断',rank:'ally',rescue:false,priorBlock:true},
 {id:'no-tywin-access',name:'离监但无法接近泰温',rank:'constrained',access:false},
 {id:'secret-care',name:'庆典 · 科本私人悬念',rank:'independent',care:true,celebration:true,plot:'VARYS'},
 {id:'absent-cast',name:'部分人物缺席 · 替换正文',rank:'ally',absent:true,plot:'VARYS'},
 {id:'departure-refused',name:'受控离开遭拒',rank:'ally',departureRefused:true},
 {id:'sansa-escape',name:'珊莎已接受接应 · 逃离路线',rank:'constrained',sansaRoute:'escaped',sansaAttitude:'other'},
 {id:'sansa-stay-fear',name:'珊莎畏惧受控 · 未能逃离',rank:'constrained',sansaRoute:'escape_not_completed',sansaAttitude:'extreme_fear'}
];
const entryFor=p=>({
 tywin_attitude:p.tywin??'overbearing',tyrion_attitude:p.tyrion??'cautious',tyrell_attitude:p.plot==='VARYS'?'committed':'bargaining',sansa_engagement:p.engagement??'tyrion',
 power_levels:Object.fromEntries(['finance','military','administration','intelligence'].map(k=>[k,p.rank==='independent'?'stable':p.rank==='ally'?'initial':'unformed'])),
 prestige:p.rank==='independent'?'important_political_capital':p.rank==='ally'?'recognized_contribution':'no_political_capital',
 authority_scopes:Object.fromEntries(['protect','exchange','review','acquit','pardon','stop_duel','departure','alert_control'].map(k=>[k,false])),
 court_role_available:p.rank!=='constrained',jaime_offer_available:!p.absent,combat_request_planned:p.combat!==false,
 evidence_basis:p.evidence??'not_determined',prior_npc_constraints:{standard:p.refusal?['P002']:[],limited:p.refusal?['P002']:[],departure:p.departureRefused?['P003']:[]},
 prior_night_lead:false,controlled_departure_proposal_planned:false,rescue_route_available:p.rescue!==false,tywin_access_possible:p.access!==false,
 culprit_route:p.plot??'ROSE',ceremony:p.celebration?'ROYAL_CELEBRATION':'MARGAERY_WEDDING',sansa_route:p.absent?'not_applicable':p.sansaRoute??(p.rank==='constrained'?'escape_not_completed':'stay_voluntarily'),tommen_hook_qualified:!!p.care,
 cast_plan:{P002:'已在君临',P003:'已在君临',P015:p.absent?'本版本未安排到场':'婚礼后按既定行程到场',R001:'已在君临',R007:p.care?'实际受用并到场':'未受用'},
 flags:{tyrion_at_banquet:!p.absent,myrcella_present:!p.absent,sansa_present:!p.absent,tyrell_present:true,guard_handover:p.rank!=='constrained',tommen_close:!!p.care,
 secondary_present:true,sansa_attitude:p.sansaAttitude??(p.absent?'other':p.rank==='constrained'?'extreme_fear':'trust'),shae_testimony:'absent',prior_rescue_blocked:!!p.priorBlock},
 source_refs:['FIXTURE:'+p.id,'FIN-RULE-0.5','FIN-FREEZE-0.2']
});
export function makeFinaleFixture(baseline,id){
 const p=profiles.find(p=>p.id===id);if(!p)throw Error('UNKNOWN_FINALE_FIXTURE');
 const g=structuredClone(baseline);initializeExecution(g);const now=360*1440+18*60-360;
 g.clock.elapsed_minutes=now;g.clock.display_phase='晚间';g.revision.last_settled_minute=now;
 g.revision.state_id='fixture-D360-'+p.id;g.revision.turn_id='D360.preview';g.revision.commit_id='FIXTURE-'+p.id;g.revision.applied_commit_ids=[g.revision.commit_id];
 // Future test obligations are explicit relative offsets; no old T0 arrears are silently replayed.
 for(const o of g.obligations)o.due_minute+=now;
 for(const r of g.receivables)r.earliest_minute+=now;
 for(const c of g.consumption)c.last_settled_minute=now;
 for(const o of g.opportunities)o.status='已关闭';
 g.messages=[];
 for(const e of g.events){e.next_check_minute=null;e.stage_detail='该早期事件不在此独立终章测试的执行范围；不代表正式主线完成';}
 g.orders=[];g.transfers=[];g.briefing=[];g.beliefs=[];
 g.execution.tasks=[];g.execution.opportunity_extensions=[];
 // The current finite fixture has enough rations for the seven-day excerpt, not a simulated year.
 for(const r of g.resources.filter(r=>r.id.startsWith('RES-FOOD')))if(r.quantity.value!==null)r.quantity.value=Math.max(r.quantity.value,40000);
 const addActor=(id,name)=>{
  if(!g.entities.some(e=>e.id===id))g.entities.push({...structuredClone(g.entities.find(e=>e.id==='P018')),id,name});
  if(!g.actors.some(a=>a.id===id))g.actors.push({...structuredClone(g.actors.find(a=>a.id==='P018')),id,roles:[name],location:'君临；已按测试场景到场',life:'存活',last_updated_minute:now});
 };
 addActor('R001','奥柏伦·马泰尔');if(p.care)addActor('R007','科本');
 for(const id of ['P002','P003','P015','P030','P031','P032','P060','P061']){const a=g.actors.find(a=>a.id===id);a.location='君临；按终章固定场景出席';a.last_updated_minute=now;}
 g.actors.find(a=>a.id==='P015').mobility='受任务、路程与守卫条件限制';
 const jaimeSeat=g.kingsguard.find(k=>k.holder==='P015');jaimeSeat.available=!p.absent;jaimeSeat.duty=p.absent?'本测试未安排回到君临':'已经回到君临，按终章行程当值';
 g.actors.find(a=>a.id==='P015').location=p.absent?'未回君临；无本批出场安排':'君临；按终章固定场景出席';
 if(p.absent){g.actors.find(a=>a.id==='P012').location='已离开君临，当前确切地点未获知';g.actors.find(a=>a.id==='P061').location='多恩；不在当前场景';}
 // Wedding/celebration and Sansa read one shared relationship record each.
 const engagement=g.commitments.find(c=>c.parties.includes('U001')&&c.parties.includes('P012'));if(engagement){
  engagement.status='已解除';engagement.terms='测试快照：已解除乔弗里与珊莎原婚约';
  if((p.engagement??'tyrion')==='tyrion')g.commitments.push({...structuredClone(engagement),id:'C-FIN-SANSA',parties:['P003','P012'],status:'有效',terms:'婚礼前测试快照：提利昂与珊莎已订婚，双方读取同一记录'});
 }
 g.finale={entry:entryFor(p),binding_branch:g.revision.branch_id,freeze:null,fixture_id:p.id,content:null,progress:null,records:[],ending:null};
 return g;
}
