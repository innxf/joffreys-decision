// Delivered reform facts live in projects; balances, people and messages keep their original owners.
import {economyFields,checkEconomy,validateEconomy,economyBarriers,deliverEconomy,maintenanceUntil,servicePeriods,earmarks} from './reform-economy.mjs';
import {custodyUnavailable} from './custody-state.mjs';
import {stanceTuning} from './stance-config.mjs';
import {quoteRules} from './reform-quotation.mjs';
export const supportFields={...economyFields,force_command_or_payroll_shift:['target','source_ref','obligation_refs','reason'],institution_create_or_expand:['target','count','reason'],procedure_and_authority_grant:['target','office','operation','group','count','reason'],force_duty_reassignment:['target','group','count','post','until','reason'],physical_security_upgrade:['target','operation','reason'],intel_network_deploy:['target','reason']};
export const supportTuning=Object.freeze({fundingConflict:15});
export function delivered(g,kind){return (g.projects||[]).flatMap(p=>p.policy?.template==='general_reform'?(p.policy.effects||[]).filter(x=>x.effect.kind===kind).map(x=>({project:p,...x})):[]);}
export function latest(g,kind,target){return delivered(g,kind).filter(x=>x.effect.target===target).sort((a,b)=>b.at-a.at||b.id.localeCompare(a.id))[0];}
const now=g=>g.clock.elapsed_minutes;
const need=(v,m)=>{if(!v)throw Error(m);};
const name=(g,id)=>g.entities.find(x=>x.id===id)?.name||g.forces.find(x=>x.id===id)?.name||id;
export function checkSupport(e){
 if(checkEconomy(e))return true;
 if(e.kind==='physical_security_upgrade'){need(e.target==='RK-AEGON'&&e.operation==='seal','首批只支持已核实RK-AEGON通道封堵。');return true;}
 if(e.kind==='intel_network_deploy'){need(e.target==='ORG-PORT','首批只支持港口到货观察联络，不解锁隐秘情报。');return true;}
 if(e.kind==='institution_create_or_expand'){need(Number.isSafeInteger(e.count)&&e.count>0,'须明确实际招募书记员人数。');return true;}
 if(e.kind==='procedure_and_authority_grant'){need(['audit','muster'].includes(e.operation)&&typeof e.office==='string'&&Number.isSafeInteger(e.group)&&e.group>=0&&Number.isSafeInteger(e.count)&&e.count>=0,'核查须指定机构与实际范围。');return true;}
 if(e.kind==='force_duty_reassignment'){need(Number.isSafeInteger(e.group)&&e.group>=0&&Number.isSafeInteger(e.count)&&e.count>0&&typeof e.post==='string'&&Number.isSafeInteger(e.until)&&e.until>0,'驻守须明确来源、人数、地点和期限。');return true;}
 if(e.kind!=='force_command_or_payroll_shift')return false;
 need(typeof e.source_ref==='string'&&Array.isArray(e.obligation_refs)&&e.obligation_refs.length>0&&e.obligation_refs.length<=30&&new Set(e.obligation_refs).size===e.obligation_refs.length&&e.obligation_refs.every(x=>typeof x==='string'),'供饷路线须逐项引用现有义务，不创建新钱。');return true;
}
export function validateSupport(g,plan,e){
 if(validateEconomy(g,plan,e))return true;
 if(e.kind==='physical_security_upgrade'){
  const t=g.opening?.navigation?.tunnel;need(t?.id===e.target&&g.messages.some(m=>m.id===t.report&&m.recipient==='U001'&&m.status==='已收到'),'须先实际核查通道并送达报告，不能凭空封锁未知路径。');return true;
 }
 if(e.kind==='intel_network_deploy'){need(g.administration.organizations.some(o=>o.entity_ref===e.target),'港口机构尚不存在。');return true;}
 if(e.kind==='institution_create_or_expand'){
  const org=g.administration.organizations.find(x=>x.entity_ref===e.target);need(org,'机构不存在；须先沿既有入口成立。');
  need(org.office_refs.some(id=>g.offices.some(o=>o.id===id&&o.holder===plan.owner&&o.status==='在任'))||(e.target==='ORG-TREASURY'&&g.offices.some(o=>o.holder===plan.owner&&o.status==='在任'&&o.title.includes('财政'))),'负责人不具备该机构人事办理职责。');return true;
 }
 if(e.kind==='procedure_and_authority_grant'){
  need(g.administration.organizations.some(x=>x.entity_ref===e.office),'核查机构不存在。');
  need(g.offices.some(o=>o.holder===plan.owner&&o.status==='在任'&&o.title.includes('财政'))||g.administration.organizations.some(org=>org.entity_ref===e.office&&org.office_refs.some(id=>g.offices.some(o=>o.id===id&&o.holder===plan.owner&&o.status==='在任'))),'负责人无该机构核查职责。');
  if(e.operation==='audit'){need(e.group===0&&e.count===0,'账户核查不占用虚构部队。');need(g.politics.accounts.some(a=>a.id===e.target),'账户尚无实际可查记录。');}
  else {const f=g.forces.find(f=>f.id===e.target);need(f&&f.allocations[e.group]?.count>=e.count&&e.count>0,'点名必须指定真实班组人数。');}
  return true;
 }
 if(e.kind==='force_duty_reassignment'){
  const f=g.forces.find(f=>f.id===e.target);need(f&&f.controller===plan.owner&&f.allocations[e.group]?.count>=e.count,'须由实际指挥者调配现有班组。');
  need(e.until>now(g),'驻守期限已经过去。');need(g.administration.organizations.some(o=>o.entity_ref===e.post)||g.politics.accounts.some(a=>a.id===e.post)||['RK-AEGON','red_keep','port'].includes(e.post),'驻守地点须为明确已支持对象。');return true;
 }
 if(e.kind!=='force_command_or_payroll_shift')return false;
 const f=g.forces.find(f=>f.id===e.target);need(f,'部队不存在。');
 need(f.controller===plan.owner||g.offices.some(o=>o.holder===plan.owner&&o.status==='在任'&&o.title.includes('财政')),'须由实际统兵或财政经办人办理供饷路线。');
 const aid=delivered(g,'conditional_support').find(x=>x.id===e.source_ref&&!x.runtime?.closed&&x.effect.target===e.target&&e.obligation_refs.every(id=>x.effect.obligation_refs.includes(id)));
 need(e.source_ref==='RES-CASH'||aid||g.politics.debts.some(d=>d.id===e.source_ref&&d.initial>0),'来源须为自有国库、已实际付款债务或本部队已到账专项；经手人不是出资者。');
 need(e.obligation_refs.every(id=>g.obligations.some(p=>p.id===id&&p.unit==='金龙')),'供饷义务不存在或单位不是金龙。');
 const knownRoutes=g.politics.payroll_routes.filter(r=>r.force_ref===f.id).map(r=>r.obligation_ref);
 need(e.obligation_refs.every(id=>knownRoutes.includes(id)||(f.food_pool==='RES-FOOD-WATCH'&&['PAY01','PAY06','PAY10'].includes(id))),'这些义务尚未与目标部队建立可核对供养关系。');return true;
}
export const clerkCount=(g,office)=>delivered(g,'institution_create_or_expand').filter(x=>x.effect.target===office&&maintenanceUntil(x)>now(g)).reduce((n,x)=>n+x.effect.count,0);
export function activeGuards(g,post){return g.assignments.filter(a=>a.location==='改革驻守:'+post&&a.status==='active'&&a.start_at<=now(g)&&a.end_at>now(g)&&g.actors.some(p=>p.id===a.task_commander&&p.life==='存活')&&g.forces.some(f=>f.id===a.force_ref&&f.controller===a.task_commander)&&!g.execution?.arrests?.some(r=>['held','escorting'].includes(r.status)&&[r.target,r.custodian].includes(a.task_commander)));}
export function supportBarriers(g,p,s,spec){
 if(spec.effect.kind!=='procedure_and_authority_grant')return economyBarriers(g,p,s,spec);
 if(!spec.depends_on.every(id=>p.policy.steps.find(st=>st.id===id)?.phase==='done'))return [];
 const office=spec.effect.office,queue=g.projects.flatMap(x=>x.policy?.template==='general_reform'&&!x.policy.paused&&x.status!=='cancelled'?x.policy.steps.filter(st=>['prepare','execute','mature'].includes(st.phase)&&x.policy.plan.steps.some(sp=>sp.id===st.id&&sp.effect.office===office)).map(st=>x.id+':'+st.id):[]);
 const index=queue.indexOf(p.id+':'+s.id);
 return clerkCount(g,office)>(index<0?queue.length:index)?[]:['该机构已到岗书记员不足或被其他核查占用；保留既有有效工作。'];
}
export function deliverSupport(g,p,s,spec,item,ctx,o){
 const e=spec.effect;deliverEconomy(g,p,s,spec,item,ctx,o);
 if(e.kind==='force_duty_reassignment'){
  const a=g.assignments.find(a=>a.id===s.assignment_ref);need(a,'驻守缺少实际人员占用。');a.location='改革驻守:'+e.post;a.end_at=e.until;item.source=a.id;s.assignment_ref=null;
 }
 if(['institution_create_or_expand','force_duty_reassignment','physical_security_upgrade','intel_network_deploy'].includes(e.kind)){
  const text=e.kind==='institution_create_or_expand'?`${name(g,e.target)}已有${e.count}名书记员完成训练到岗；费用包含到岗后28日服务；${e.maintenance?'已按批准合同启用持续雇用，按期实付才续期':'后续雇用尚未授权'}。`:e.kind==='force_duty_reassignment'?`${name(g,e.target)}的${e.count}人已赴${e.post==='red_keep'?'红堡文书接洽处':name(g,e.post)}执行指定值守；至开局后${e.until}分钟结束。`:e.kind==='physical_security_upgrade'?'已核实的红堡至伊耿高丘旧通道已完成封堵；不代表其他未知路径也被封堵。':`港口到货观察联络已建立，初期经费支持28日；${e.maintenance?'后续按批准合同实付续期':'尚未授权持续服务'}，所得材料须另行回报。`;
  o.report(g,p.responsible,text,[p.id,item.id],'U001');
 }
 if(e.kind==='procedure_and_authority_grant'){
  let text;
  if(e.operation==='audit'){
   const a=g.politics.accounts.find(a=>a.id===e.target);const result=!a.receipt_present?'missing_information':a.received===a.expected?'balanced':a.transfer_ref&&g.transfers.find(t=>t.id===a.transfer_ref)?.in_transit?'delayed':'suspected_difference';
   const id=o.key(g,'AUDIT');text=`账户${a.id}核查：应收${a.expected}，已收${a.received}；${{missing_information:'缺少凭据，尚不能核实',balanced:'账证相符',delayed:'款项仍在途',suspected_difference:'存在待追查差额'}[result]}。核查结果与追缴、后续征管改善分别办理。`;
   const report=o.report(g,p.responsible,text,[p.id,item.id],'U001');g.politics.audits.push({id,account_ref:a.id,project_ref:p.id,result,at:now(g),report_ref:report,source_refs:[item.id,...a.source_refs]});item.source=id;
  }else{
   const f=g.forces.find(f=>f.id===e.target),allocated=g.assignments.filter(a=>a.force_ref===f.id&&a.group_index===e.group&&a.id!==s.assignment_ref&&!['returned','cancelled'].includes(a.status)).reduce((n,a)=>n+a.count,0);
   text=`军籍点名：${f.name}班组${e.group}在册${f.allocations[e.group].count}，本次核对${e.count}人；另有任务占用${allocated}。任务占用不等于虚报或吃空饷；未发现差额不自动减少饷款。`;item.source=o.report(g,p.responsible,text,[p.id,item.id],'U001');
  }
  o.report(g,p.responsible,text,[p.id,item.id],p.responsible);
 }
}
export function settleSupport(g){for(const a of g.assignments.filter(a=>a.location.startsWith('改革驻守:')&&(a.status==='active'&&a.end_at<=now(g)||a.status==='returning'&&a.return_at<=now(g)))){a.status='returned';a.return_at=now(g);}}
export function recallSupport(g,t){
 const p=g.projects.find(p=>p.id===t?.params.project_ref);if(!p||p.policy?.template!=='general_reform')return false;let changed=false;
 for(const e of p.policy.effects.filter(e=>e.effect.kind==='force_duty_reassignment')){const a=g.assignments.find(a=>a.id===e.source&&a.status==='active');if(a){a.status='returning';a.return_at=now(g)+60;changed=true;}}
 return changed;
}
export function passageState(g){
 const sealed=!!latest(g,'physical_security_upgrade','RK-AEGON');
 const guards=activeGuards(g,'RK-AEGON');
 return {sealed,guards:guards.reduce((n,a)=>n+a.count,0),refs:guards.map(a=>a.id)};
}
export function passageEscape(g,r,direct,warned){
 if(direct||r.target!=='P004'||!g.opening?.navigation)return false;
 const path=passageState(g);if(path.sealed)return false;
 // Existing authored route can be unknown to the squad; guards only cover this exit, this time.
 if(path.guards>=r.count&&r.count>0)return false;
 return r.escape_roll<75+(warned?stanceTuning.escapeBonus:0);
}
export function interceptLeak(g,m,o){
 if(m.channel!=='秘密传话'||!['红堡','君临·红堡'].some(prefix=>g.actors.find(a=>a.id===m.sender)?.location.includes(prefix)&&g.actors.find(a=>a.id===m.recipient)?.location.includes(prefix)))return false;
 const guard=activeGuards(g,'red_keep').find(a=>a.count>0&&a.task_commander!==m.sender&&a.task_commander!==m.recipient);
 if(!guard||!g.actors.some(a=>[m.sender,m.recipient].includes(a.id)&&a.location.includes('文书接洽')))return false;
 // The local messenger physically passes a staffed checkpoint. This does not cover ravens or unknown paths.
 m.status='失联';o.report(g,guard.task_commander,'值守发现并拦下本地秘密传话，原文：'+m.content+'；只证明取得这份传话，不自动证明其内容或指控真实。',[guard.id,m.id],'U001',15);return true;
}
export function portReport(g,network,o,recipient){
 const n=latest(g,'intel_network_deploy',network);need(n&&g.actors.some(a=>a.id===n.project.responsible&&a.life==='存活')&&!custodyUnavailable(g,n.project.responsible),'经办人目前无法送出渠道报告。');need(n&&now(g)<maintenanceUntil(n),'港口观察渠道尚未建立或本期费用尚未支付。');
 const periods=servicePeriods(g,n),arrivals=g.transfers.filter(t=>t.destination_pool==='RES-FOOD-NAVY'&&t.arrival_minute<=now(g)&&t.received>0&&periods.some(p=>t.arrival_minute>=p.from&&t.arrival_minute<p.to));
 o.report(g,n.project.responsible,'港口独立观察：'+(arrivals.length?arrivals.map(t=>`${t.id}实际到货${t.received}标准口粮`).join('；'):'本观察期间没有取得可核实的新到货记录')+'。仅限本渠道建立后港仓实际交付；没有发现不等于证明无秘密活动。',[n.id,...arrivals.map(t=>t.id)],recipient||'U001',15);
}
export function supportView(g){
 const known=g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到');
 const items=Object.keys(supportFields).flatMap(kind=>delivered(g,kind)).filter(x=>known.some(m=>m.basis?.refs.includes(x.id)));
 return items.map(x=>({id:x.id,kind:x.effect.kind,target:x.effect.target,
  count:x.effect.kind==='institution_create_or_expand'?(maintenanceUntil(x)>now(g)?x.effect.count:0):x.effect.kind==='force_duty_reassignment'?g.assignments.find(a=>a.id===x.source&&a.status==='active')?.count||0:undefined,
  post:x.effect.post||'',until:x.effect.until??maintenanceUntil(x),reports:known.filter(m=>m.basis?.refs.includes(x.id)).map(m=>m.content)}));
}
export function supplyAssessment(g,force){
 const route=latest(g,'force_command_or_payroll_shift',force),f=g.forces.find(f=>f.id===force);
 if(!f||!route)return null;
 const obligations=g.obligations.filter(x=>route.effect.obligation_refs.includes(x.id));
 const headcount=g.forces.filter(x=>x.food_pool===f.food_pool&&x.strength.value!==null).reduce((n,x)=>n+x.strength.value,0);
 const share=p=>{const explicit=g.politics.payroll_routes.filter(r=>r.force_ref===force&&r.obligation_ref===p.id);return explicit.length?Math.min(p.amount,explicit.reduce((n,r)=>n+r.wage_amount,0)):headcount>0?p.amount*(f.strength.value/headcount):p.amount;};
 const unpaid=Math.round(obligations.filter(x=>x.status!=='已支付').reduce((n,x)=>n+share(x),0)*10000)/10000;
 const cash=g.resources.find(r=>r.id==='RES-CASH')?.quantity.value||0;
 const eligible=earmarks(g,obligations.map(p=>p.id)),restricted=eligible.reduce((n,r)=>n+r.amount,0);
 const reserved=g.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)&&!eligible.includes(r)&&!obligations.some(p=>p.reservation_id===r.id)).reduce((n,r)=>n+r.amount,0);
 const aid=delivered(g,'conditional_support').find(x=>x.id===route.effect.source_ref);
 const debt=g.politics.debts.find(d=>d.id===(aid?.effect.source_ref||route.effect.source_ref));
 return {force,route:route.id,unpaid,restricted,provider:aid?.effect.counterparty||null,expires_at:aid?.effect.expires_at||null,available:Math.max(0,cash-reserved),gap:Math.max(0,unpaid-Math.max(0,cash-reserved)),creditor:debt?.outstanding>0?debt.creditor:null,outstanding:debt?.outstanding||0,at:now(g)};
}
export function supportNext(g,target){for(const e of delivered(g,'institution_create_or_expand')){const end=e.at+quoteRules.clerkServiceDays*1440;if(end>now(g))target=Math.min(target,end);}return target;}
export function supplyReport(g,force,o,recipient){
 const assessment=supplyAssessment(g,force);need(assessment,'该部队尚无已交付的明确供饷路线。');
 const f=g.forces.find(f=>f.id===force);
 const id=o.report(g,'ORG-TREASURY',`供养核对：${f.name}指定期间未支付义务${assessment.unpaid}金龙，国库可用${assessment.available}金龙，当前缺口${assessment.gap}金龙。`+(assessment.creditor?`相关未偿债权人为${name(g,assessment.creditor)}，本金${assessment.outstanding}金龙。`:'本路线未指定外部未偿债权。')+(assessment.provider?`指定专项提供者${name(g,assessment.provider)}；其中限定用途资金${assessment.restricted}金龙，到开局后${assessment.expires_at}分钟清退；这部分不是自由现金。`:'')+'预测未到账不可支用；本报告只核对指定义务。',[assessment.route],recipient||f.controller,15);
 g.messages.find(m=>m.id===id).basis.detail='supply-snapshot:'+JSON.stringify(assessment);return id;
}
// Only a real, delivered snapshot can enter the actor's command judgment.
export function knownSupply(g,actor,force){
 const m=g.messages.findLast(m=>m.recipient===actor&&m.status==='已收到'&&m.delivered_minute<=now(g)&&m.content.startsWith('供养核对：')&&m.basis?.refs.some(ref=>delivered(g,'force_command_or_payroll_shift').some(x=>x.id===ref&&x.effect.target===force)));
 if(!m)return null;try{return {...JSON.parse(m.basis.detail.startsWith('supply-snapshot:')?m.basis.detail.slice(16):m.content.slice(5).split('。')[0]),message:m.id};}catch{return null;}
}
export function fundingConcern(g,actor,force,target){
 const k=knownSupply(g,actor,force);return k&&k.creditor===target&&k.gap>0?{alignment:-supportTuning.fundingConflict,refs:[k.message],reason:'本次已知供饷存在缺口，且仍对目标承担未偿债务；仅构成相关顾虑。'}:{alignment:0,refs:k?[k.message]:[],reason:''};
}
