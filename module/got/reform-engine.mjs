import {maintainService,controlOperation,validateRuntime,operatingTerms,operationView,upkeepPrice} from './reform-economy.mjs';
import {validateSupport,supplyReport,supportBarriers,deliverSupport,activeGuards,portReport} from './reform-support.mjs';
import {reformQuotation} from './reform-quotation.mjs';
import {custodyUnavailable} from './custody-state.mjs';
import {DAY,REFORM_VERSION,isReform,checkReformPlan,reformTiming,exactKeys} from './reform-contract.mjs';
import {initializeReviews,reviewHold,reviewKnowledge,reviewErrors,dueReviews} from './reform-meetings.mjs';
const now=g=>g.clock.elapsed_minutes;
const copy=structuredClone;
const rows=g=>g.projects.filter(isReform);
const live=s=>['prepare','execute','mature'].includes(s.phase);
const done=s=>s.phase==='done';
const round=n=>Math.round(n*10000)/10000;
const freshStep=s=>({id:s.id,phase:'pending',worked:0,delayed:0,paid:false,approved:false,reason:'',assignment_ref:null,completed_at:null});
const need=(ok,message)=>{if(!ok)throw Error(message);};
const label={prepare:'准备',execute:'执行',mature:'初效核验',done:'已交付',pending:'待开始',decision:'待国王决定',blocked:'等待条件',unmapped:'待补充结算能力'};
const duration=(step,phase)=>step[{prepare:'prepare_days',execute:'execute_days',mature:'observe_days'}[phase]]*DAY;
const outcome=e=>['income','tax_loss_reduction'].includes(e.kind)?`${e.target}按基数${e.base}金龙的周期净收支调整${e.delta>0?'+':''}${e.delta}金龙；自交付日起按本期有效天数计入正常缴库，未到缴库日不冒充现金`:e.kind==='handover'?`${e.count}名现有人手实际转属${e.commander}，总兵员不增加`:e.kind==='training'||e.kind==='equipment'?`${e.target}班组${e.group}中${e.count}人形成${e.kind==='training'?'基础轮训':'战斗装备'}交付；仍受实际出勤、粮饷约束`:e.kind==='tax_source_create_or_modify'?'指定合同扣缴规程已生效，仅在实际付款时结算':e.kind==='supply_line_establish'?'工坊建成，后续按批准批数和真实投入生产；尚无凭空成品':e.kind==='debt_or_bond_restructure'?`旧债本金${e.amount}金龙已实还，实收新债及既有利息保留`:e.kind==='conditional_support'?`专项${e.amount}金龙实际预留，限定用途及余款退回条件保留`:e.kind==='physical_security_upgrade'?'已核实通道已封堵，只对本路径生效':e.kind==='intel_network_deploy'?'港口观察渠道已建立，所得信息须实际送达':e.kind==='force_command_or_payroll_shift'?'供饷路线已登记，核对报告按真实消息送达':e.kind==='institution_create_or_expand'?`${e.count}名书记员完成招募和工作训练，已到岗`:e.kind==='force_duty_reassignment'?`${e.count}人已赴${e.post}驻守至T0+${e.until}分钟`:e.kind==='procedure_and_authority_grant'?'已完成指定范围核对，实际报告另行送达':e.kind==='defense'?`${e.target}对应君临城防交付，后续战前核验可用`:'国库常规付款沿实际核验、到期与资金条件执行';
function validateInputs(g,plan){for(const s of plan.steps){
 for(const m of s.materials)need(g.resources.some(r=>r.id===m.resource&&r.quantity.value!==null),'材料须引用已有且可计量的资源。');
 for(const r of s.requires){const collection={authority:g.authorities,decision:g.execution.decisions,message:g.messages,project:g.projects}[r.kind];need(collection.some(x=>x.id===r.ref),'前置条件须引用已存在的记录；尚无记录的缺项应写入准备依据。');}
}}
export function reformTarget(g,id){const p=rows(g).find(p=>p.id===id);if(p)return {ref:p.id,kind:'reform',title:p.name,owner:p.responsible,revision:p.policy.plan_revision,plan:copy(p.policy.plan)};const e=rows(g).flatMap(p=>p.policy.effects).find(e=>e.id===id);return e?{ref:e.id,kind:'reform_effect',title:e.id,service_price:upkeepPrice(e),effect:copy(e.effect)}:null;}
const currentOffice=(g,actor,title)=>g.offices.some(o=>o.holder===actor&&o.status==='在任'&&o.title.includes(title));
export function reformCatalogue(g,actor){
 const targets=[];
 if(currentOffice(g,actor,'财政')){
  for(const payee of new Set(g.obligations.filter(p=>p.unit==='金龙'&&p.account==='RES-CASH').map(p=>p.payee)))targets.push({ref:payee,kind:'reform_payee',title:g.entities.find(x=>x.id===payee)?.name||payee,contracts:g.obligations.filter(p=>p.payee===payee&&p.unit==='金龙').map(p=>({ref:p.id,amount:p.amount,status:p.status})),notice:'实际合同付款才有扣缴；未付款不是收入'});
  for(const d of g.politics.debts)targets.push({ref:d.id,kind:'reform_debt',title:'已实收公债 '+d.id,creditor:d.creditor,outstanding:d.outstanding,initial:d.initial,notice:'本金和既有利息分别保留，不再增加一次现金'});
 }
 if(currentOffice(g,actor,'财政'))for(const a of g.politics.accounts)targets.push({ref:a.id,kind:'reform_account',title:a.id});
 if(actor==='P004')targets.push({ref:'ORG-PORT',kind:'reform_network',title:'港口观察渠道'});
 if(currentOffice(g,actor,'财政'))for(const r of g.receivables)if(!targets.some(t=>t.source===r.source))targets.push({ref:r.id,kind:'reform_income',title:r.source,source:r.source,base:r.expected_amount,unit:r.unit,notice:'周期净预测，不能当作已到账或推定侵吞'});
 for(const f of g.forces.filter(f=>f.controller===actor))targets.push({ref:f.id,kind:'reform_force',title:f.name,groups:f.allocations.map((a,i)=>({index:i,count:a.count,task:a.task,effects:f.id==='FORCE01'&&i===4?['training','equipment','handover']:['handover']})),controller:f.controller,defense_supported:f.id==='FORCE01'});
 for(const org of g.administration.organizations)if(org.office_refs.some(id=>g.offices.some(o=>o.id===id&&o.holder===actor&&o.status==='在任'))||(org.entity_ref==='ORG-TREASURY'&&currentOffice(g,actor,'财政'))||(org.entity_ref==='ORG-ENVOY'&&currentOffice(g,actor,'大学士')))targets.push({ref:org.entity_ref,kind:'reform_office',title:g.entities.find(e=>e.id===org.entity_ref)?.name||org.entity_ref});
 return targets.filter((t,i)=>targets.findLastIndex(x=>x.ref===t.ref)===i);
}
export function reformKnowledge(g,actor){
 const result=[],targets=reformCatalogue(g,actor);
 if(targets.length)result.push({ref:'reform-duty:'+actor,kind:'own_status',content:'本人职务范围的改革对象（预测与真实交付分开）：'+JSON.stringify(targets),at:now(g),source:'当前实际职务',targets});
 for(const p of rows(g)){
  const t=g.execution.tasks.find(t=>t.id===p.policy.task_ref),o=g.orders.find(o=>o.id===t?.order_ref);
  if(actor===p.responsible&&o?.delivered_minute!==null&&o?.delivered_minute<=now(g))result.push({ref:'reform-plan:'+p.id,kind:'own_task',content:reformText(g,p,true)+"\n"+reviewKnowledge(g,p),at:now(g),source:o.id,targets:[reformTarget(g,p.id),...p.policy.effects.map(e=>reformTarget(g,e.id))]});
  else {const received=g.messages.filter(m=>m.recipient===actor&&m.status==='已收到'&&m.basis?.refs.includes(p.id));if(received.length)result.push({ref:'reform-plan:'+p.id,kind:'report',content:received.map(m=>m.content).join('\n'),at:received.at(-1).delivered_minute,source:received.at(-1).id,targets:actor==='U001'&&received.some(m=>m.basis.refs.includes('reform-version:'+p.policy.plan_revision))?[reformTarget(g,p.id),...p.policy.effects.filter(e=>received.some(m=>m.basis.refs.includes(e.id))).map(e=>reformTarget(g,e.id))]:[]});}
 }
 return result;
}
function recorded(p,kind,step,text,g,o){
 const prior=p.policy.log.findLast(x=>x.step===step);if(prior?.kind===kind&&prior?.text===text)return;
 const entry={id:o.key(g,'REFLOG'),at:now(g),kind,step,text,report_ref:null};
 const person=g.actors.find(a=>a.id===p.responsible),sender=text.startsWith('国王')?'U001':person?.life==='存活'&&/君临|红堡/.test(person.location)?p.responsible:'ORG-HOUSEHOLD';
 entry.report_ref=o.report(g,sender,p.name+'：'+text,[p.id,entry.id,'reform-version:'+p.policy.plan_revision],p.responsible);p.policy.log.push(entry);p.progress=text;
}
export function reformText(g,p,internal=false,actor='U001'){
 const r=p.policy,logs=internal?r.log:r.log.filter(x=>g.messages.some(m=>m.id===x.report_ref&&m.recipient===actor&&m.status==='已收到'));
 const timing=r.timing.long?'目标工期未定，本局不预计取得目标成果':r.timing.first_days===null?'尚无完整可结算分项，需补充结算能力或明确拆分；不是时代延期':`正常条件初效目标：交办后${r.timing.first_days}日；暂停与缺条件另计`;
 return `${p.id} · ${p.name}\n目标：${r.plan.objective}\n范围：${r.plan.scope.join('、')}；负责人：${p.responsible}；批准建设/阶段费用上限${r.plan.budget}金龙。${operatingTerms(r.plan)}\n${timing}。\n时代依据：${r.plan.era.technology}；本地基础：${r.plan.era.local_basis}；办法：${r.plan.era.method}。${r.plan.era.missing.length?'缺项：'+r.plan.era.missing.join('；')+'。':''}\n${internal?'共同准备尚余'+round(r.preparation_left/DAY)+'日；实际已投入'+r.spent+'金龙。\n':''}${internal?r.steps.map(s=>s.id+' '+label[s.phase]+'（本段有效工作'+round(s.worked/DAY)+'日；累计停工'+round(s.delayed/DAY)+'日）'+(s.reason?'：'+s.reason:'')).join('；'):''}\n${logs.map(x=>`第${Math.floor(x.at/DAY)}日：${x.text}`).join('\n')||'已交办；执行情况等待送达回报。'}`;
}
function playerKnowsLog(g,p,l){return g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&(m.id===l.report_ref||(m.basis?.refs.includes(p.id)&&m.delivered_minute>=l.at&&m.content.startsWith(p.id+' · '))))||g.dialogue.observations.some(o=>o.actors.includes('U001')&&o.at>=l.at&&o.targets?.some(t=>t.ref===p.id));}
export function reformView(g){return rows(g).map(p=>({id:p.id,name:p.name,status:p.status,operations:operationView(g,p),posts:p.policy.effects.filter(x=>x.effect.kind==='force_duty_reassignment'&&g.assignments.some(a=>a.id===x.source&&a.status==='active')).map(x=>x.source),networks:p.policy.effects.filter(x=>x.effect.kind==='intel_network_deploy').map(x=>x.effect.target),supply_forces:p.policy.effects.filter(x=>x.effect.kind==='force_command_or_payroll_shift').map(x=>x.effect.target),revision:p.policy.plan_revision,order_ref:g.execution.tasks.find(t=>t.id===p.policy.task_ref)?.order_ref,text:reformText(g,p)+(g.messages.findLast(m=>m.recipient==='U001'&&m.status==='已收到'&&m.basis?.refs.includes(p.id)&&m.content.startsWith(p.id+' · '))?.content?'\n最近收到的完整回报：\n'+g.messages.findLast(m=>m.recipient==='U001'&&m.status==='已收到'&&m.basis?.refs.includes(p.id)&&m.content.startsWith(p.id+' · ')).content:''),pending:p.policy.steps.filter(s=>s.phase==='decision'&&p.policy.log.some(l=>l.step===s.id&&l.kind==='decision'&&playerKnowsLog(g,p,l))).map(s=>({id:s.id,reason:s.reason})),delay_pending:p.policy.timing.exceeds_window&&!p.policy.window_approved&&p.policy.log.some(l=>l.kind==='decision'&&l.step===''&&playerKnowsLog(g,p,l)),commanders:[...new Set(p.policy.plan.steps.map(s=>s.effect.commander||s.effect.counterparty).filter(Boolean))].filter(actor=>!g.execution.decisions.some(d=>d.actor===actor&&d.kind==='reform_execution'&&d.target_ref===p.id&&d.status==='accepted')),paused:p.policy.paused}));}
export const reformAgenda=g=>reformView(g).map(p=>({project_ref:p.id,plan_revision:p.revision,report:p.text,decisions:p.pending}));
function validTarget(g,plan,e){
 const actor=g.actors.find(a=>a.id===plan.owner);need(actor&&actor.life==='存活','负责人不在当前存活人物中。');
 need(plan.scope.includes(e.target),'效果超出批准范围。');
 if(e.kind==='unmapped')return;
 if(validateSupport(g,plan,e))return;
 if(['income','tax_loss_reduction'].includes(e.kind)){
  const r=g.receivables.find(r=>r.id===e.target);need(r&&r.destination==='RES-CASH'&&r.unit==='金龙'&&r.expected_amount===e.base,'收入来源或报价基数已改变，请重新核对。');
  need(currentOffice(g,plan.owner,'财政')||g.authorities.some(a=>a.subject===plan.owner&&a.object_ref===e.target&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length&&a.scope.actions.includes('reform_finance')),'此负责人尚无该财源的办理权限。');
 }else if(['training','equipment','handover','defense'].includes(e.kind)){
  const f=g.forces.find(f=>f.id===e.target);need(f,'该部队尚不存在。');
  need(e.kind==='handover'||(f.id==='FORCE01'&&(e.kind==='defense'||e.group===4)),'这个部队或岗位的实力成果尚无本局战斗消费者，请保留待议，不能伪装成时代困难。');
  need(f.controller===plan.owner||g.authorities.some(a=>a.subject===plan.owner&&a.object_ref===f.id&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length&&a.scope.actions.includes('reform_military')),'该负责人尚未取得这支部队的实际办理权限。');
  if(e.group!==undefined&&e.operation!=='audit')need(f.allocations[e.group]?.count>=e.count,'本班组没有这么多人，不能凭改革增加兵员。');
  if(e.kind==='handover')need(g.actors.some(a=>a.id===e.commander&&a.life==='存活'),'接任人不在当前存活人物中。');
 }else need(e.target==='ORG-TREASURY'&&currentOffice(g,plan.owner,'财政'),'付款核验须由实际财政职务在国库范围办理。');
}
function requirement(g,r){
 if(r.kind==='authority')return g.authorities.some(a=>a.id===r.ref&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length);
 if(r.kind==='decision')return g.execution.decisions.some(d=>d.id===r.ref&&d.status==='accepted');
 if(r.kind==='message')return g.messages.some(m=>m.id===r.ref&&m.status==='已收到');
 return g.projects.some(p=>p.id===r.ref&&p.status==='completed');
}
function barriers(g,p,s,spec){
 const reasons=supportBarriers(g,p,s,spec);if(reviewHold(g,p,spec))reasons.push('已到约定检查点，受影响步骤等待国王明确决定；独立工作不受此项等待影响');try{validTarget(g,p.policy.plan,spec.effect);}catch(e){reasons.push(e.message);}
 const person=g.actors.find(a=>a.id===p.responsible);
 if(custodyUnavailable(g,p.responsible)||spec.effect.commander&&custodyUnavailable(g,spec.effect.commander))reasons.push('负责人或交接人目前无法履行职责，保留已完成成果');
 if(person&&!/君临|红堡/.test(person.location))reasons.push('负责人尚未抵达本地，不能把任命当作到岗');
 for(const r of spec.requires)if(!requirement(g,r))reasons.push('尚待落实 '+r.kind+' '+r.ref);
 for(const x of g.execution.obstacles.filter(x=>x.active&&[p.id,p.responsible,spec.effect.target].includes(x.target_ref)&&!(x.reason==='physical_resistance'&&activeGuards(g,x.target_ref).length)))reasons.push('执行遇到阻碍，需要本人回报或进一步协商');
 if(['training','equipment','handover'].includes(spec.effect.kind)){
  const f=g.forces.find(f=>f.id===spec.effect.target);
  if(f&&(g.resources.find(r=>r.id===f.food_pool)?.quantity.value||0)<=0)reasons.push('口粮不足，本段不能计有效训练或交接');
  if(spec.effect.kind==='handover'&&!g.execution.decisions.some(d=>d.kind==='reform_execution'&&d.target_ref===p.id&&d.actor===spec.effect.commander&&d.status==='accepted'&&d.at>=p.policy.approved_at))reasons.push('接任人尚未明确接受本版方案');
  if(spec.effect.kind==='handover'&&!/君临|红堡/.test(g.actors.find(a=>a.id===spec.effect.commander)?.location||''))reasons.push('接任人尚未实际抵达，不能远程完成交接');
 }
 return reasons;
}
function free(g,f,index,exclude){return f.allocations[index].count-g.assignments.filter(a=>a.id!==exclude&&a.force_ref===f.id&&a.group_index===index&&!['returned','cancelled'].includes(a.status)).reduce((n,a)=>n+a.count,0)-g.politics.guard_plans.filter(p=>p.status==='executing'&&f.id==='FORCE01'&&(index===1||(index===4&&p.posts==='replace_from_reserve'))).reduce((n,p)=>n+p.count,0);}
function releaseStep(g,s){const a=g.assignments.find(a=>a.id===s.assignment_ref);if(a){a.status='returned';a.return_at=now(g);}s.assignment_ref=null;}
function readyWork(g,p,s,spec,to=now(g)){
 if(barriers(g,p,s,spec).length)return false;
 if(g.activities.some(a=>a.status==='active'&&a.participants.includes(p.responsible))||g.opening?.travel?.actors.includes(p.responsible))return false;
 if(spec.effect.group!==undefined&&spec.effect.operation!=='audit'){const f=g.forces.find(f=>f.id===spec.effect.target),food=g.resources.find(r=>r.id===f?.food_pool),rate=g.consumption.filter(c=>c.resource_id===f?.food_pool).reduce((n,c)=>n+c.rate_per_day,0);if(!food||food.quantity.value<rate*Math.max(0,to-now(g))/DAY)return false;}
 return true;
}
export function accrueReforms(g,to){
 const elapsed=to-now(g);if(elapsed<=0)return;
 for(const p of rows(g)){
  const r=p.policy,t=g.execution.tasks.find(t=>t.id===r.task_ref);if(!t||t.status!=='executing'||r.paused||r.timing.long||p.status==='cancelled')continue;
  if(r.preparation_left>0){if(r.plan.steps[r.plan.independent?'some':'every'](spec=>readyWork(g,p,r.steps.find(s=>s.id===spec.id),spec,to)))r.preparation_left=Math.max(0,r.preparation_left-elapsed);continue;}
  if(!r.plan.independent&&r.steps.some(s=>!done(s)&&(s.phase==='decision'||s.phase==='unmapped'||barriers(g,p,s,r.plan.steps.find(x=>x.id===s.id)).length)))continue;
  for(const s of r.steps.filter(live)){const spec=r.plan.steps.find(x=>x.id===s.id);if(readyWork(g,p,s,spec,to))s.worked=Math.min(duration(spec,s.phase),s.worked+elapsed);else s.delayed+=elapsed;}
 }
}
function applyEffect(g,p,s,spec,ctx,o){
 const e=spec.effect,r=p.policy;if(r.effects.some(x=>x.step===s.id))return;
 const item={id:o.key(g,'REFEFFECT'),step:s.id,at:now(g),effect:copy(e),source:null,applied:[]};
 if(['income','tax_loss_reduction'].includes(e.kind))item.source=g.receivables.find(x=>x.id===e.target).source;
 if(e.kind==='procedure'&&e.operation==='payment_review'){
  const auth=o.key(g,'AUTH');g.authorities.push({id:auth,issuer:'U001',subject:'U001',relation:'reform_procedure',object_ref:e.target,scope:{actions:['approved_payment_review'],max_count:0,group_id:'',location:'君临'},starts_at:now(g),expires_at:Number.MAX_SAFE_INTEGER,status:'active',source_refs:[p.id,item.id],delivery_refs:[g.execution.tasks.find(t=>t.id===r.task_ref).order_ref]});if(g.campaign)g.campaign.standing=true;
 }
 if(e.kind==='handover'){
  const f=g.forces.find(f=>f.id===e.target);f.allocations[e.group].count-=e.count;f.strength.value-=e.count;f.strength.as_of_minute=now(g);
  const id=o.key(g,'FORCE');g.forces.push({...copy(f),id,name:p.name+' · 实际交接分队',controller:e.commander,strength:{...copy(f.strength),value:e.count,design_range:[e.count,e.count],basis:o.basis('从原班组实际转属，人数与供养没有新增',[p.id,item.id])},allocations:[{task:'按批准范围交接的分队',count:e.count,until:'新的实际调令'}],readiness:'沿原训练与装备；交接不增加实力',basis:o.basis('原班组同额扣减，既有口粮与工资仍覆盖同一批人',[p.id,item.id])});item.source=id;
 }
 deliverSupport(g,p,s,spec,item,ctx,o);r.effects.push(item);if(e.kind==='force_command_or_payroll_shift'){supplyReport(g,e.target,o);supplyReport(g,e.target,o,'U001');}releaseStep(g,s);
 g.execution.evidence.push({id:item.id,category:'reform:'+e.kind,status:'realized',at:now(g),source_ref:p.id,stage_ref:s.id});
}
function startStep(g,p,s,spec,ctx,o){
 if(spec.effect.kind==='unmapped'){s.phase='unmapped';s.reason='目标已记录，但对应结果尚无结算能力；不是时代罚时。可先讨论已支持的独立部分。';recorded(p,'unmapped',s.id,s.reason,g,o);return;}
 if(spec.gate&&!s.approved){s.phase='decision';s.reason='重要节点：是否开始「'+spec.title+'」？范围和预算沿已批准合同；改变方案须另议。';recorded(p,'decision',s.id,s.reason,g,o);return;}
 s.phase='prepare';s.worked=!spec.depends_on.length&&p.policy.timing.preparation===0?Math.min(spec.prepare_days*DAY,15):0;recorded(p,'phase',s.id,'开始准备「'+spec.title+'」。',g,o);
}
function enterExecution(g,p,s,spec,ctx,o){
 const e=spec.effect;
 for(const m of spec.materials)need(g.resources.some(r=>r.id===m.resource&&r.quantity.value!==null&&r.quantity.value>=m.amount),'材料不足：'+m.resource);
 if(e.group!==undefined&&e.operation!=='audit'){const f=g.forces.find(f=>f.id===e.target);need(free(g,f,e.group,s.assignment_ref)>=e.count,'本班组人员仍在其他岗位或工作中，等待释放或调整方案。');}
 if(!s.paid){if(spec.cost)o.spend(g,ctx,spec.cost,p.active_reservation_id,'改革阶段投入：'+spec.title,[p.id,s.id]);for(const m of spec.materials)o.change(g,ctx,m.resource,-m.amount,'改革实际领用：'+spec.title,[p.id,s.id]);s.paid=true;p.policy.spent=round(p.policy.spent+spec.cost);}
 if(e.group!==undefined&&e.operation!=='audit'&&!s.assignment_ref){const id=o.key(g,'ASN');g.assignments.push({id,order_ref:g.execution.tasks.find(t=>t.id===p.policy.task_ref).order_ref,force_ref:e.target,group_index:e.group,count:e.count,task_commander:p.responsible,location:'本地改革实际工作',status:'active',start_at:now(g),end_at:now(g)+(spec.execute_days+spec.observe_days)*DAY,return_at:0,authority_ref:'',acceptance_ref:p.id});s.assignment_ref=id;}
 s.phase='execute';s.worked=0;recorded(p,'phase',s.id,'准备完成，开始执行「'+spec.title+'」；本阶段已投入'+spec.cost+'金龙。',g,o);
}
export function runReformTask(g,t,ctx,o){
 if(t.kind!=='reform'||t.phase==='delivery')return false;
 const p=rows(g).find(p=>p.id===t.params.project_ref);need(p,'改革任务缺少合同。');const r=p.policy;initializeReviews(p);
 if(p.status==='cancelled'){t.status='cancelled';return true;}
 if(r.paused){t.status='blocked';o.control(g,t).wait='decision';return true;}
 t.status='executing';t.phase='finish';t.started_at??=now(g);o.order(g,t).status='执行中';
 if(!r.plan.independent&&r.plan.steps.some(spec=>spec.effect.kind==='unmapped')){
  for(const spec of r.plan.steps.filter(spec=>spec.effect.kind==='unmapped')){const s=r.steps.find(s=>s.id===spec.id);if(s.phase!=='unmapped')startStep(g,p,s,spec,ctx,o);}
  t.status='blocked';o.control(g,t).wait='decision';r.next_check_minute=null;return true;
 }
 if(r.timing.long){p.status='preparing';t.status='blocked';o.control(g,t).wait='decision';recorded(p,'long','',`目标仍在长期准备：${r.plan.era.missing.join('；')}。目标效果尚未产生；已批准准备之外不自动追加费用。补齐依据或改变方案后再讨论。`,g,o);return true;}
 if(r.timing.exceeds_window&&!r.window_approved){t.status='blocked';o.control(g,t).wait='decision';recorded(p,'decision','',`当前工作量预计${r.timing.first_days}日初效，超出本类${r.timing.target_days}日目标；请决定缩小范围或接受明确延期。`,g,o);return true;}
 if(r.preparation_left>0){const reasons=r.plan.steps.flatMap(spec=>barriers(g,p,r.steps.find(s=>s.id===spec.id),spec));if(reasons.length)recorded(p,'blocked','',reasons.join('；'),g,o);t.next_at=now(g)+Math.min(DAY,r.preparation_left);return true;}
 let next=now(g)+DAY;
 for(const s of r.steps.filter(s=>s.phase==='pending')){const spec=r.plan.steps.find(x=>x.id===s.id);if(spec.depends_on.every(id=>done(r.steps.find(x=>x.id===id))))startStep(g,p,s,spec,ctx,o);}
 for(const s of r.steps){
  const spec=r.plan.steps.find(x=>x.id===s.id);
  if(s.phase==='pending'&&spec.depends_on.every(id=>done(r.steps.find(x=>x.id===id))))startStep(g,p,s,spec,ctx,o);
  if(!live(s))continue;
  const reasons=barriers(g,p,s,spec);if(!r.plan.independent&&r.steps.some(x=>!done(x)&&(x.phase==='decision'||x.phase==='unmapped'||barriers(g,p,x,r.plan.steps.find(y=>y.id===x.id)).length)))reasons.push('一揽子方案尚有未落实条件，先等待共同条件或另议独立分项。');if(reasons.length){s.reason=reasons.join('；');recorded(p,'blocked',s.id,s.reason,g,o);continue;}
  if(s.reason){s.reason='';recorded(p,'resumed',s.id,'相关条件已恢复，保留先前有效工作，继续「'+spec.title+'」。',g,o);}
  for(let transitions=0;transitions<3&&live(s)&&s.worked>=duration(spec,s.phase);transitions++){
   if(s.phase==='prepare'){try{enterExecution(g,p,s,spec,ctx,o);}catch(e){s.reason=e.message;recorded(p,'blocked',s.id,e.message,g,o);break;}}
   else if(s.phase==='execute'){s.phase='mature';s.worked=0;recorded(p,'phase',s.id,'执行完成，核验「'+spec.title+'」的初效交付。',g,o);}
   else {applyEffect(g,p,s,spec,ctx,o);s.phase='done';s.worked=0;s.completed_at=now(g);recorded(p,'delivered',s.id,'「'+spec.title+'」已经交付：'+outcome(spec.effect)+'。依据：'+spec.effect.reason+'。仅对批准范围生效，不等待整项改革成熟。',g,o);}
  }
  if(live(s)&&!s.reason){const left=duration(spec,s.phase)-s.worked;next=Math.min(next,now(g)+Math.max(1,left));}
  const assignment=g.assignments.find(a=>a.id===s.assignment_ref);if(assignment)assignment.end_at=next;
 }
 p.status=r.steps.every(done)?'completed':r.steps.some(done)?'partially_completed':r.steps.some(s=>s.phase==='execute'||s.phase==='mature')?'executing':'preparing';
 if(r.steps.every(done)){o.release(g,p.active_reservation_id);o.finish(g,t,p.name+'已按范围交付；持续效果按实际条件和期次运行。');r.next_check_minute=null;}
 else if(r.steps.every(s=>['done','decision','unmapped','pending'].includes(s.phase))){t.status='blocked';o.control(g,t).wait='decision';r.next_check_minute=null;}
 else {t.next_at=next;r.next_check_minute=next;}
 return true;
}
export function cancelReform(g,t,o){if(t.kind!=='reform')return;const p=rows(g).find(p=>p.id===t.params.project_ref);if(p.policy.task_ref!==t.id)return;for(const s of p.policy.steps)releaseStep(g,s);p.policy.paused=true;recorded(p,'cancelled','','撤令已送达，停止未交付工作；已经交付的效果、费用与义务保留。',g,o);}
export function applyReformAction(g,a,ctx,o){
 if(a.type==='reform_maintain'){exactKeys(a,['type','effect_ref','operation','auto_pay']);need(typeof a.auto_pay==='boolean','续用须说明付款授权。');maintainService(g,a,ctx,o);return 'REFORM_SERVICE_AUTHORIZED';}
 if(a.type==='reform_operation_control'){exactKeys(a,['type','effect_ref','operation']);controlOperation(g,a,ctx,o);return 'REFORM_OPERATION_CONTROLLED';}
 if(a.type==='reform_intel_report'){exactKeys(a,['type','network_ref']);portReport(g,a.network_ref,o);return 'PORT_REPORT_SENT';}
 if(a.type==='reform_supply_report'){exactKeys(a,['type','force_ref']);supplyReport(g,a.force_ref,o);supplyReport(g,a.force_ref,o,'U001');return 'SUPPLY_REPORT_SENT';}
 if(a.type==='reform_revise'){
  exactKeys(a,['type','project_ref','revision','plan']);const p=rows(g).find(p=>p.id===a.project_ref);need(p&&p.policy.plan_revision===a.revision&&p.status!=='cancelled','改革已撤回或版本已改变。');
  const r=p.policy,plan=copy(checkReformPlan(a.plan));validateInputs(g,plan);need(plan.owner===r.plan.owner,'更换负责人须撤回剩余委托后另行交办；既有成果不会撤销。');
  for(const s of r.steps.filter(s=>s.paid||done(s)))need(JSON.stringify(plan.steps.find(x=>x.id===s.id))===JSON.stringify(r.plan.steps.find(x=>x.id===s.id)),'已经投入或交付的分项必须原样保留；撤回未完工作后可另立后续方案。');
  for(const spec of plan.steps)if(!r.steps.some(s=>s.id===spec.id&&done(s)))validTarget(g,plan,spec.effect);
  const remaining=plan.steps.filter(spec=>!r.steps.some(s=>s.id===spec.id&&s.paid)).reduce((n,s)=>n+s.cost,0);need(plan.budget>=r.spent+remaining,'新预算不能抹去既有支出或低于剩余承诺。');
  const old=g.execution.tasks.find(t=>t.id===r.task_ref);old.status='cancelled';o.order(g,old).status='已撤销';o.control(g,old).wait=null;
  for(const d of g.execution.decisions.filter(d=>d.kind==='reform_execution'&&d.target_ref===p.id))d.status='superseded';
  o.release(g,p.active_reservation_id);p.active_reservation_id=plan.budget>r.spent?o.reserve(g,ctx,p.id,round(plan.budget-r.spent)):null;
  const previous=JSON.stringify(r.plan);r.steps=plan.steps.map(spec=>{const s=r.steps.find(s=>s.id===spec.id);return s&&JSON.stringify(spec)===JSON.stringify(r.plan.steps.find(x=>x.id===spec.id))?s:freshStep(spec);});
  const priorPreparation=r.timing.preparation??0;r.plan=plan;initializeReviews(p);r.plan_revision++;r.timing=reformTiming(plan);r.preparation_left=Math.max(0,r.preparation_left+(r.timing.preparation??0)-priorPreparation);r.window_approved=false;r.paused=false;
  p.name=plan.title;p.status='preparing';p.estimated_cash_cost.value=plan.budget;p.estimated_cash_cost.design_range=[plan.budget,plan.budget];p.estimated_cash_cost.as_of_minute=now(g);
  const t=o.task(g,ctx,'reform',plan.owner,{project_ref:p.id,target_ref:p.id});r.task_ref=t.id;r.next_check_minute=t.next_at;o.order(g,t).reservation_refs=p.active_reservation_id?[p.active_reservation_id]:[];o.order(g,t).execution_condition=JSON.stringify(plan);
  recorded(p,'revised','',`国王批准第${r.plan_revision}版，已投入和交付保持；剩余工作重新送交负责人确认。上一版合同：${previous}`,g,o);return 'REFORM_REVISED';
 }
 if(a.type==='reform_propose'){
  exactKeys(a,['type','plan']);const plan=copy(checkReformPlan(a.plan));validateInputs(g,plan);for(const s of plan.steps)validTarget(g,plan,s.effect);
  need(!rows(g).some(p=>!['cancelled'].includes(p.status)&&JSON.stringify(p.policy.plan)===JSON.stringify(plan)),'相同改革已经交办，请查询原项目或明确修改剩余工作。');
  const id=o.key(g,'REFORM'),timing=reformTiming(plan),reservation=plan.budget?o.reserve(g,ctx,id,plan.budget):null;
  const p={id,name:plan.title,status:'preparing',responsible:plan.owner,event_refs:[],earliest_work_days:0,required_resources:{},estimated_cash_cost:{value:plan.budget,unit:'金龙',design_range:[plan.budget,plan.budget],as_of_minute:now(g),basis:o.basis('获批准的改革预算上限，不等于已支出',[ctx.id])},active_reservation_id:reservation,progress:'已交办，等待送达和负责人接受',completion_condition:'批准步骤实际交付并留下证据；初效即可使用',basis:o.basis('批准的通用改革合同',[ctx.id]),policy:{template:'general_reform',version:REFORM_VERSION,plan_revision:1,plan,timing,approved_at:now(g),preparation_left:Math.max(0,(timing.preparation??0)-15),task_ref:'',paused:false,window_approved:false,spent:0,next_check_minute:null,steps:plan.steps.map(s=>({id:s.id,phase:'pending',worked:0,delayed:0,paid:false,approved:false,reason:'',assignment_ref:null,completed_at:null})),effects:[],log:[]}};
  initializeReviews(p);g.projects.push(p);g._runtime.rule_version='m2-political-3-reform-1';const t=o.task(g,ctx,'reform',plan.owner,{project_ref:id,target_ref:id});p.policy.task_ref=t.id;p.policy.next_check_minute=t.next_at;o.order(g,t).reservation_refs=reservation?[reservation]:[];o.order(g,t).execution_condition=plan.objective+'；'+JSON.stringify(plan);
  o.report(g,'U001','批准并交办改革「'+plan.title+'」。'+(timing.long?'目标工期未定。':timing.first_days===null?'尚待补充结算能力或明确独立拆分。':`正常条件初效估计${timing.first_days}日；准备期包含在内。`),[id,ctx.id,'reform-version:1'],'U001',0);return 'REFORM_ORDERED';
 }
 if(a.type==='reform_report'){
  exactKeys(a,['type','project_ref']);const p=rows(g).find(p=>p.id===a.project_ref);need(p,'尚未找到该改革。');const t=g.execution.tasks.find(t=>t.id===p.policy.task_ref),ord=g.orders.find(x=>x.id===t.order_ref);need(ord.delivered_minute!==null,'命令尚未送达负责人，暂时只能查看已经交办的记录。');need(g.actors.some(x=>x.id===p.responsible&&x.life==='存活'&&/君临|红堡/.test(x.location))&&!g.opening?.travel?.actors.includes(p.responsible),'负责人目前无法在本地回复；已收到的记录仍可查阅。');o.report(g,p.responsible,reformText(g,p,true)+'\n'+reviewKnowledge(g,p),[p.id,'reform-version:'+p.policy.plan_revision],'U001',15);return 'REFORM_REPORT_REQUESTED';
 }
 if(a.type==='reform_control'){
  exactKeys(a,['type','project_ref','revision','operation','step_ref']);const p=rows(g).find(p=>p.id===a.project_ref);need(p&&p.policy.plan_revision===a.revision,'改革方案版本已改变。');const r=p.policy,t=g.execution.tasks.find(t=>t.id===r.task_ref);need(p.status!=='cancelled'&&(p.status!=='completed'||a.operation==='approve_checkpoint'),'此改革已经撤回或交付；新增工作须另行批准。');
  need(['pause','resume','approve_step','accept_delay','approve_checkpoint'].includes(a.operation),'未识别的改革决定。');
  if(a.operation==='pause'){r.paused=true;recorded(p,'paused','','国王暂停未来工作，既有成果及债务不撤销。',g,o);}
  else if(a.operation==='approve_step'){const s=r.steps.find(s=>s.id===a.step_ref);need(s?.phase==='decision','这一步没有等待批准。');s.approved=true;s.phase='pending';recorded(p,'approved',s.id,'国王批准继续既定步骤，未扩大预算和范围。',g,o);}
  else if(a.operation==='approve_checkpoint'){initializeReviews(p);const c=dueReviews(g,p).find(c=>c.id===a.step_ref);need(c&&c.mode==='decision','这个检查点尚未到期或已处理。');r.reviews.find(x=>x.id===c.id).resolved=ctx.id;recorded(p,'approved',c.id,'国王批准通过检查点「'+c.title+'」，仅继续原预算与范围内工作；真实资源和接受条件仍需满足。',g,o);}
  else if(a.operation==='accept_delay'){need(r.timing.exceeds_window,'没有需要接受的超窗排程。');r.window_approved=true;recorded(p,'approved','','国王接受已经说明的工期；没有缩短真实工作量。',g,o);}
  else {need(!r.timing.long,'缺失条件仍需通过新方案或证据讨论，不能靠恢复按钮获得成果。');r.paused=false;recorded(p,'resumed','','国王恢复原合同内工作。',g,o);}
  // A control decision never substitutes for an NPC's acceptance.
  if(p.status!=='completed'&&o.order(g,t).accepted_minute!==null&&!r.paused&&o.control(g,t).wait!=='judgment'&&o.control(g,t).wait!=='refused'){t.status='executing';t.next_at=now(g);o.control(g,t).wait=null;}
  return 'REFORM_CONTROL_RECORDED';
 }
 return null;
}
function effects(g,kind){return rows(g).flatMap(p=>p.policy.effects.filter(e=>e.effect.kind===kind||(kind==='income'&&e.effect.kind==='tax_loss_reduction')).map(e=>({p,e})));}
export function reformIncome(g,receivable,base,ctx,o){
 let delta=0;const seen=new Set();
 for(const {p,e} of effects(g,'income')){
  if(e.source!==receivable.source||e.at>=receivable.earliest_minute||seen.has(e.source+'|'+e.effect.reason))continue;
  const spec=p.policy.plan.steps.find(s=>s.id===e.step);if(spec.requires.some(r=>!requirement(g,r))||g.execution.obstacles.some(x=>x.active&&[p.id,e.effect.target].includes(x.target_ref)))continue;
  const fraction=Math.min(1,Math.max(0,(receivable.earliest_minute-e.at)/(7*DAY)));
  const change=round(e.effect.delta*(base/e.effect.base)*fraction);delta+=change;seen.add(e.source+'|'+e.effect.reason);if(!e.applied.includes(receivable.id))e.applied.push(receivable.id);
 }
 // Independent changes share the same source capacity, never unbounded stacking.
 return round(Math.max(0,base+Math.max(-base,Math.min(base,delta))));
}
export function reformCapability(g,kind,target,group=4){
 const counts=effects(g,kind).filter(({e})=>e.effect.target===target&&(e.effect.group===undefined||e.effect.group===group));
 if(kind==='defense'||kind==='procedure')return counts.length>0;
 // Cohort identities are not fabricated. Overlapping batches conservatively use max.
 const f=g.forces.find(f=>f.id===target);return Math.min(f?.allocations[group]?.count||0,Math.max(0,...counts.map(({e})=>e.effect.count||0)));
}
export const reformProcedure=(g,operation)=>effects(g,'procedure').find(({e})=>e.effect.operation===operation)?.p.id||null;
export function reformErrors(p,g){
 try{
  const r=p.policy;exactKeys(r,['template','version','plan_revision','plan','timing','approved_at','preparation_left','task_ref','paused','window_approved','spent','next_check_minute','steps','effects','log',...(r.reviews?['reviews']:[])]);need(!reviewErrors(p,g).length,'改革检查点状态不完整。');
  need(r.version===REFORM_VERSION&&Number.isSafeInteger(r.plan_revision)&&r.plan_revision>=1&&Number.isSafeInteger(r.approved_at)&&r.approved_at<=now(g)&&Number.isSafeInteger(r.preparation_left)&&r.preparation_left>=0&&Number.isFinite(r.spent)&&r.spent>=0&&r.spent<=r.plan.budget&&typeof r.paused==='boolean'&&typeof r.window_approved==='boolean','改革版本、时间或预算无效。');checkReformPlan(r.plan);
  need(JSON.stringify(r.timing)===JSON.stringify(reformTiming(r.plan)),'改革工期与合同不一致。');
  validateInputs(g,r.plan);need(p.name===r.plan.title&&p.responsible===r.plan.owner&&p.estimated_cash_cost.value===r.plan.budget,'改革主记录与合同不一致。');
  need(r.steps.length===r.plan.steps.length&&new Set(r.steps.map(s=>s.id)).size===r.steps.length,'改革步骤记录重复或缺失。');
  for(const s of r.steps){exactKeys(s,['id','phase','worked','delayed','paid','approved','reason','assignment_ref','completed_at']);const spec=r.plan.steps.find(x=>x.id===s.id);need(spec&&['pending','prepare','execute','mature','done','decision','unmapped'].includes(s.phase)&&Number.isSafeInteger(s.worked)&&s.worked>=0&&Number.isSafeInteger(s.delayed)&&s.delayed>=0&&typeof s.paid==='boolean'&&typeof s.approved==='boolean'&&typeof s.reason==='string','改革步骤状态无效。');if(live(s))need(s.worked<=duration(spec,s.phase),'改革工作量越界。');if(s.assignment_ref)need(g.assignments.some(a=>a.id===s.assignment_ref),'改革人员占用缺失。');}
  need(g.execution.tasks.some(t=>t.id===r.task_ref&&t.kind==='reform'&&t.params.project_ref===p.id),'改革缺少执行任务。');
  need(new Set(r.effects.map(e=>e.step)).size===r.effects.length,'改革效果重复交付。');
  need(new Set(r.effects.map(e=>e.id)).size===r.effects.length&&r.effects.length===r.steps.filter(done).length,'已完成分项须且仅须交付一次。');
  need(round(r.steps.filter(s=>s.paid).reduce((n,s)=>n+r.plan.steps.find(x=>x.id===s.id).cost,0))===r.spent,'实际支出与阶段投入不一致。');
  for(const e of r.effects){exactKeys(e,['id','step','at','effect','source','applied',...(e.runtime?['runtime']:[])]);validateRuntime(e,g);const s=r.steps.find(s=>s.id===e.step),spec=r.plan.steps.find(s=>s.id===e.step);need(s&&done(s)&&e.at===s.completed_at&&e.at<=now(g)&&JSON.stringify(e.effect)===JSON.stringify(spec.effect)&&Array.isArray(e.applied)&&new Set(e.applied).size===e.applied.length,'改革效果缺少真实阶段交付。');}
  for(const e of r.effects)need(Number.isSafeInteger(e.at)&&e.at>=0&&e.applied.every(x=>typeof x==='string')&&g.execution.evidence.some(x=>x.id===e.id&&x.category==='reform:'+e.effect.kind&&x.source_ref===p.id&&x.stage_ref===e.step&&x.at===e.at),'效果缺少对应交付证据。');
  need(new Set(r.log.map(l=>l.id)).size===r.log.length,'改革记录编号重复。');
  for(const l of r.log){exactKeys(l,['id','at','kind','step','text','report_ref']);need(Number.isSafeInteger(l.at)&&l.at>=0&&l.at<=now(g)&&typeof l.text==='string'&&g.messages.some(m=>m.id===l.report_ref),'改革记录缺少回报。');}
  return [];
 }catch(e){return [e.message];}
}
