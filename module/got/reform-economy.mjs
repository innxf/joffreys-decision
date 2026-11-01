// Recurring operations keep their cursor on the original delivered effect.
// Money, stock, reservations, invoices and debt remain in the existing ledgers.
import {repayPrincipal} from './political-engine.mjs';
import {availableLabor} from './labor-capacity.mjs';
export const economyFields={tax_source_create_or_modify:['target','base_ref','rate_bps','reason'],supply_line_establish:['target','recipe','period_minutes','max_cycles','operating_budget','reason'],debt_or_bond_restructure:['target','source_ref','amount','reason'],conditional_support:['target','source_ref','counterparty','amount','obligation_refs','expires_at','reason']};
export const economyRules=Object.freeze({workshopSetup:100,workshopDays:14,workshopCash:10,workshopPeriod:10080,armsPerBatch:10,clerkUpkeep:10,networkUpkeep:10,servicePeriod:40320});
const now=g=>g.clock.elapsed_minutes,need=(v,m)=>{if(!v)throw Error(m);},pos=n=>Number.isFinite(n)&&n>0&&Math.abs(n*10000-Math.round(n*10000))<1e-6;
const rows=g=>g.projects.flatMap(p=>p.policy?.template==='general_reform'?p.policy.effects.map(e=>({p,e})):[]);
const active=r=>['有效','部分使用'].includes(r.status);
const free=(g,id)=>id==='RES-LABOR'?availableLabor(g):Math.max(0,(g.resources.find(r=>r.id===id)?.quantity.value||0)-g.reservations.filter(r=>r.resource_id===id&&active(r)).reduce((n,r)=>n+r.amount,0));
const finance=(g,a)=>g.offices.some(o=>o.holder===a&&o.status==='在任'&&o.title.includes('财政'));
export const upkeepPrice=e=>e.effect.kind==='institution_create_or_expand'?e.effect.count*economyRules.clerkUpkeep:e.effect.kind==='intel_network_deploy'?economyRules.networkUpkeep:0;
export function maintenanceUntil(e){return e.runtime?.kind==='service'?e.runtime.until:e.at+economyRules.servicePeriod;}
function mergeServicePeriods(periods){
 const result=[];for(const p of periods.toSorted((a,b)=>a.from-b.from)){const last=result.at(-1);if(last&&p.from<=last.to)last.to=Math.max(last.to,p.to);else result.push({...p});}return result;
}
export function servicePeriods(g,e){
 if(e.runtime?.periods)return e.runtime.periods.map(p=>({...p}));
 const period=economyRules.servicePeriod,periods=[{from:e.at,to:e.at+period}];
 // Old saves prove their first and most recent paid periods; never assume the gap was staffed.
 if(e.runtime?.kind==='service'&&e.runtime.until>e.at+period)periods.push({from:e.runtime.until-period,to:e.runtime.until});
 for(const m of g.messages.filter(m=>m.basis?.refs.includes(e.id)&&m.content.startsWith('持续服务费用已实际支付，下一期28日能力开始；'))){
  const invoice=g.obligations.find(p=>m.basis.refs.includes(p.id)&&p.status==='已支付'&&p.basis.refs.includes(e.id));
  if(invoice&&g.settlements.some(s=>s.target_id==='RES-CASH'&&s.delta<0&&s.evidence_refs.includes(invoice.id)&&s.at_minute<=m.sent_minute))periods.push({from:m.sent_minute,to:m.sent_minute+period});
 }
 return mergeServicePeriods(periods);
}
export function checkEconomy(e){
 if(Object.hasOwn(e,'maintenance'))need(e.maintenance&&['institution_create_or_expand','intel_network_deploy'].includes(e.kind)&&Object.keys(e.maintenance).join(',')==='auto_pay'&&typeof e.maintenance.auto_pay==='boolean','持续服务必须明确是否授权按期付款。');
 if(e.kind==='tax_source_create_or_modify'){need(typeof e.base_ref==='string'&&Number.isSafeInteger(e.rate_bps)&&e.rate_bps>0&&e.rate_bps<=10000,'扣缴税须指定原合同及合法比例。');return true;}
 if(e.kind==='supply_line_establish'){need(e.recipe==='royal_arms'&&Number.isSafeInteger(e.period_minutes)&&e.period_minutes>=economyRules.workshopPeriod&&Number.isSafeInteger(e.max_cycles)&&e.max_cycles>0&&pos(e.operating_budget)&&e.operating_budget>=e.max_cycles*economyRules.workshopCash,'工坊须使用已接通配方、周期和批准批数，并另列运营费用上限。');return true;}
 if(e.kind==='debt_or_bond_restructure'){need(typeof e.source_ref==='string'&&pos(e.amount),'置换须引用已实收的新债款及明确本金。');return true;}
 if(e.kind==='conditional_support'){need(typeof e.source_ref==='string'&&typeof e.counterparty==='string'&&pos(e.amount)&&Array.isArray(e.obligation_refs)&&e.obligation_refs.length>0&&new Set(e.obligation_refs).size===e.obligation_refs.length&&e.obligation_refs.every(r=>typeof r==='string')&&Number.isSafeInteger(e.expires_at)&&e.expires_at>0,'附条件资助须说明实际来源、提供者、指定用途及期限。');return true;}
 return false;
}
export function validateEconomy(g,p,e){
 if(!economyFields[e.kind])return false;need(finance(g,p.owner),'财源、工坊财务及融资须由当前财政职责办理。');
 if(e.kind==='tax_source_create_or_modify'){const base=g.obligations.find(x=>x.id===e.base_ref);need(base&&base.payee===e.target&&base.account==='RES-CASH','须依据真实付款合同及收款人设立扣缴来源；不是任意净收入再扣损耗。');}
 if(e.kind==='supply_line_establish')need(g.administration.organizations.some(o=>o.entity_ref===e.target)&&['RES-IRON','RES-TIMBER','RES-LABOR'].every(id=>g.resources.some(r=>r.id===id&&r.quantity.value!==null)),'工坊须依托已有机构和可核对的铁、木、工班。');
 if(e.kind==='debt_or_bond_restructure'){const old=g.politics.debts.find(d=>d.id===e.target),fund=g.politics.debts.find(d=>d.id===e.source_ref);need(old&&fund&&old!==fund&&fund.outstanding>=e.amount&&g.politics.receipts.some(r=>r.used_by===fund.id),'置换必须有真实旧债和已付款且仍未清偿的新债，不接受旧债报告或认购目标。');}
 if(e.kind==='conditional_support'){
  const source=g.resources.find(r=>r.id===e.source_ref),loan=g.politics.debts.find(d=>d.id===e.source_ref);need(g.forces.some(f=>f.id===e.target)&&e.obligation_refs.every(id=>g.obligations.some(o=>o.id===id&&o.unit==='金龙')),'指定部队或现金用途不存在。');
  const force=g.forces.find(f=>f.id===e.target),routes=g.politics.payroll_routes.filter(r=>r.force_ref===e.target).map(r=>r.obligation_ref);need(e.obligation_refs.every(id=>routes.includes(id)||(force.food_pool==='RES-FOOD-WATCH'&&['PAY01','PAY06','PAY10'].includes(id))),'专项工资用途必须与指定部队有真实供养关系。');
  need(source?source.quantity.unit==='金龙'&&source.owner!=='ORG-CROWN'&&[source.owner,source.controller].includes(e.counterparty):loan&&loan.creditor===e.counterparty&&loan.outstanding>=e.amount&&g.politics.receipts.some(r=>r.used_by===loan.id),'资助须来自出资人的真实现金来源或仍未清偿的实收债务，不是财政经手人。');
  need(e.expires_at>now(g),'资助用途期限已过。');
 }
 return true;
}
export function economyBarriers(g,p,s,spec){
 const e=spec.effect,why=[];
 if(e.kind==='conditional_support'){
  const source=g.resources.find(r=>r.id===e.source_ref),loan=g.politics.debts.find(d=>d.id===e.source_ref);
  if(source&&(source.quantity.value===null||free(g,source.id)<e.amount))why.push('出资来源尚未量化核实或可交付现金不足；承诺没有变成到账。');
  if(source&&!g.execution.decisions.some(d=>d.kind==='reform_execution'&&d.target_ref===p.id&&d.actor===e.counterparty&&d.status==='accepted'&&d.at>=p.policy.approved_at))why.push('实际出资人尚未接受本版资助用途与期限。');
  if(loan&&free(g,'RES-CASH')<e.amount)why.push('已实收借款目前没有足够可用现金用于专项预留。');
  if(source&&(!g.actors.some(a=>a.id===e.counterparty&&a.life==='存活')||g.execution.arrests?.some(r=>[r.target,r.custodian].includes(e.counterparty)&&['held','escorting'].includes(r.status))))why.push('出资人目前不能兑现交付，原承诺保留。');
 }
 if(['conditional_support','debt_or_bond_restructure'].includes(e.kind)){
  const loan=g.politics.debts.find(d=>d.id===e.source_ref);const committed=rows(g).filter(x=>['conditional_support','debt_or_bond_restructure'].includes(x.e.effect.kind)&&x.e.effect.source_ref===e.source_ref).reduce((n,x)=>n+x.e.effect.amount,0);
  if(loan&&committed+e.amount>loan.initial)why.push('该笔实收借款已承接其他专项或置换，不能重复认领同一提款额度。');
 }
 if(e.kind==='debt_or_bond_restructure'){
  const old=g.politics.debts.find(d=>d.id===e.target);if(!old||old.outstanding<e.amount)why.push('旧债剩余本金已改变，须改案，不能重复偿还。');
  if(free(g,'RES-CASH')<e.amount)why.push('目前可用资金不足以落实旧债清偿；新债仍保留。');
 }
 return why;
}
function armsStock(g,ref,o){
 if(g.resources.some(r=>r.id==='RES-ARMS'))return;
 g.resources.push({id:'RES-ARMS',name:'王室工坊验收军械',kind:'军需',owner:'ORG-CROWN',controller:'ORG-HOUSEHOLD',location:'君临王室军需库',quantity:{value:0,unit:'标准军械批',design_range:[0,0],as_of_minute:now(g),basis:o.basis('工坊交付前为空库；每批用于十人装备',[ref])},condition:'实际消耗铁木和工班加工，验收后入库',access:'批准采购或军队换装领用'});
}
export function deliverEconomy(g,p,s,spec,item,ctx,o){
 const e=spec.effect;
 if(e.kind==='supply_line_establish'){armsStock(g,item.id,o);item.runtime={kind:'workshop',next_at:now(g),phase:'start',cycles:0,crew_ref:'',enabled:true};o.report(g,p.responsible,'王室军械工坊已具备开工条件；每批需铁料一批、木料一批、工班一组和10金龙，至少七日后验收入库，不会因成立立即产出。',[p.id,item.id]);}
 if(e.kind==='tax_source_create_or_modify')o.report(g,p.responsible,`合同扣缴来源已设立，比例${e.rate_bps/100}%；只在对应合同实际支付时收取，收款人取得扣缴后的净额。未付款不收税。`,[p.id,item.id]);
 if(e.kind==='debt_or_bond_restructure'){repayPrincipal(g,g.politics.debts.find(d=>d.id===e.target),e.amount,ctx,o);item.source=e.source_ref;o.report(g,p.responsible,`已用现有可用新债款清偿旧债本金${e.amount}金龙；新债本金及新旧既有利息按原合同继续。`,[p.id,item.id,e.source_ref,e.target]);}
 if(e.kind==='conditional_support'){
  const source=g.resources.find(r=>r.id===e.source_ref);if(source){o.change(g,ctx,source.id,-e.amount,'出资人按已接受的资助合同交付',[p.id,item.id]);o.change(g,ctx,'RES-CASH',e.amount,'附条件资助实际入库',[p.id,item.id,source.id]);}
  const reservation=o.reserve(g,ctx,item.id,e.amount);const r=g.reservations.find(r=>r.id===reservation);r.purpose='限定用于合同列明的应付款；未用余额到期退回实际来源';
  item.runtime={kind:'aid',reservation_ref:reservation,closed:false};item.source=e.source_ref;o.report(g,p.responsible,`实际专项资金${e.amount}金龙已预留，只用于${e.obligation_refs.join('、')}；到期未用部分退回原出资来源，不计王室自主现金。`,[p.id,item.id]);
 }
 if(['institution_create_or_expand','intel_network_deploy'].includes(e.kind)&&e.maintenance)item.runtime={kind:'service',until:now(g)+economyRules.servicePeriod,invoice_ref:'',auto_pay:e.maintenance.auto_pay,enabled:true,periods:[{from:now(g),to:now(g)+economyRules.servicePeriod}]};
}
export function earmarks(g,refs){return rows(g).filter(({e})=>e.runtime?.kind==='aid'&&!e.runtime.closed&&!e.runtime.paused&&!e.runtime.return_requested&&e.effect.expires_at>now(g)&&e.effect.obligation_refs.some(id=>refs.includes(id))).map(({e})=>g.reservations.find(r=>r.id===e.runtime.reservation_ref&&active(r))).filter(Boolean);}
function taxContract(g,payment){
 const service=rows(g).find(({e})=>upkeepPrice(e)>0&&payment.basis.refs.includes(e.id));if(service)return 'service:'+service.e.id;
 const debt=g.politics.debts.find(d=>d.dues.some(x=>x.obligation_ref===payment.id));if(debt)return 'debt:'+debt.id+':'+debt.dues.find(x=>x.obligation_ref===payment.id).kind;
 const original=g.obligations.find(p=>payment.basis.refs.includes(p.id)&&p.payee===payment.payee&&p.account===payment.account);
 return 'payment:'+(original?.id||payment.id);
}
export function paymentTax(g,payment,value,ctx,o,settlementRef){
 if(!payment)return;
 const contract=taxContract(g,payment),sources=rows(g).filter(({e})=>{const base=g.obligations.find(p=>p.id===e.effect.base_ref);return e.effect.kind==='tax_source_create_or_modify'&&e.effect.target===payment.payee&&base&&taxContract(g,base)===contract;});
 // Renewals retain one contract identity, including old invoices; a later delivered rate replaces the old rate.
 const e=sources.sort((a,b)=>a.e.at-b.e.at).at(-1)?.e,application=settlementRef?'payment:'+settlementRef:payment.id;
 if(!e||e.applied.includes(payment.id)||e.applied.includes(application)||e.runtime?.enabled===false)return;
 const tax=Math.round(value*e.effect.rate_bps)/10000;
 if(tax>0){const refs=[e.id,payment.id,...(settlementRef?[settlementRef]:[])];o.change(g,ctx,'RES-CASH',tax,'已付款合同扣缴税实收',refs);const text=`本次合同付款${value}金龙，依法扣缴${tax}金龙；收款人取得相应净额。`;o.report(g,'ORG-TREASURY',text,refs);o.report(g,'ORG-TREASURY',text,refs,payment.payee);}
 e.applied.push(application);
}
function serviceInvoice(g,p,e,ctx,o){
 const price=upkeepPrice(e),id=o.key(g,'PAY');g.obligations.push({id,due_minute:now(g),amount:price,unit:'金龙',account:'RES-CASH',payee:e.effect.kind==='institution_create_or_expand'?'ORG-HOUSEHOLD':p.responsible,reason:'持续书记员或渠道服务预付；实付后开始下一期',reservation_id:null,status:'待核验或支付',payment_condition:'已交付服务及明确续用授权；未支付不提供下一期能力',partial_allowed:false,basis:o.basis('每28日服务费；不是重复收取初期招聘费',[p.id,e.id,ctx.id])});e.runtime.invoice_ref=id;
}
function reportOnce(g,p,e,code,text,o){const tag='op:'+e.id+':'+code+':'+(e.runtime.cycles??e.runtime.until??0);if(e.applied.includes(tag))return;e.applied.push(tag);o.report(g,p.responsible,text,[p.id,e.id]);}
export function economyNext(g,target){
 for(const {e}of rows(g)){
  const r=e.runtime;if(!r)continue;
  if(r.kind==='workshop'&&r.enabled&&r.next_at>now(g))target=Math.min(target,r.next_at);
  if(r.kind==='service'&&r.enabled&&!r.invoice_ref&&r.until>now(g))target=Math.min(target,r.until);
  if(r.kind==='aid'&&!r.closed&&e.effect.expires_at>now(g))target=Math.min(target,e.effect.expires_at);
 }return target;
}
export function settleEconomy(g,ctx,o){
 for(const {p,e}of rows(g)){
  const r=e.runtime;if(!r)continue;
  if(r.kind==='service'){
   if(now(g)<r.until||!r.enabled)continue;if(!r.invoice_ref)serviceInvoice(g,p,e,ctx,o);const invoice=g.obligations.find(x=>x.id===r.invoice_ref);
   if(r.auto_pay&&invoice.status!=='已支付'&&free(g,'RES-CASH')>=invoice.amount){o.spend(g,ctx,invoice.amount,null,'已授权的持续服务费',[invoice.id,e.id]);invoice.status='已支付';}
   if(invoice.status==='已支付'){const periods=servicePeriods(g,e);r.until=now(g)+economyRules.servicePeriod;r.periods=mergeServicePeriods([...periods,{from:now(g),to:r.until}]);r.invoice_ref='';o.report(g,p.responsible,'持续服务费用已实际支付，下一期28日能力开始；历史停工不回算。',[p.id,e.id,invoice.id]);}
   else reportOnce(g,p,e,'service_unpaid','持续服务本期尚未支付，相关能力暂停；已产生一笔预付账单，未工作期间不继续累加账单。',o);
  }
  if(r.kind==='workshop'&&r.enabled&&r.next_at<=now(g)){
   if(r.phase==='finish'){o.change(g,ctx,'RES-ARMS',1,'铁木加工军械实际验收入库',[e.id]);o.release(g,r.crew_ref);r.crew_ref='';r.cycles++;r.phase='start';r.next_at=now(g);o.report(g,p.responsible,'一批王室军械已验收入库，可供十人实际换装；原料和费用已经记录。',[p.id,e.id]);}
   if(r.cycles>=e.effect.max_cycles){r.enabled=false;continue;}
   if(free(g,'RES-IRON')<1||free(g,'RES-TIMBER')<1||free(g,'RES-LABOR')<1||free(g,'RES-CASH')<economyRules.workshopCash){r.next_at=now(g)+1440;reportOnce(g,p,e,'workshop_shortage','工坊缺少本批可用原料、工班或经费，未扣料、未产出；保留此前成品。',o);continue;}
   o.change(g,ctx,'RES-IRON',-1,'工坊本批实际领用铁料',[e.id]);o.change(g,ctx,'RES-TIMBER',-1,'工坊本批实际领用木料',[e.id]);o.spend(g,ctx,economyRules.workshopCash,null,'批准的工坊每批工料费',[e.id]);const id=o.key(g,'RSV');g.reservations.push({id,resource_id:'RES-LABOR',amount:1,owner:'U001',target_id:e.id,purpose:'军械本批加工占用工班',status:'有效',start_minute:now(g),end_minute:null,release_rule:'实际交付本批或撤回加工后释放',basis:o.basis('工班占用，不消灭工人',[p.id,e.id])});r.crew_ref=id;r.phase='finish';r.next_at=now(g)+e.effect.period_minutes;
  }
  if(r.kind==='aid'&&!r.closed&&(e.effect.expires_at<=now(g)||r.return_requested)){
   const reservation=g.reservations.find(x=>x.id===r.reservation_ref),unused=active(reservation||{})?reservation.amount:0;const source=g.resources.find(x=>x.id===e.effect.source_ref);
   if(unused&&source){o.spend(g,ctx,unused,reservation.id,'退回未用专项资助',[e.id]);o.change(g,ctx,source.id,unused,'专项资助未用余额退回',[e.id]);}
   else if(unused){const loan=g.politics.debts.find(d=>d.id===e.effect.source_ref);const repay=Math.min(unused,loan?.outstanding||0);if(repay)repayPrincipal(g,loan,repay,ctx,o,reservation.id);}
   o.release(g,r.reservation_ref);r.closed=true;o.report(g,p.responsible,'专项用途期限已到，未用余额按来源退还或清偿；原借款剩余义务仍保留。',[p.id,e.id]);
  }
 }
}
export function maintainService(g,a,ctx,o){
 const row=rows(g).find(x=>x.e.id===a.effect_ref);need(row&&upkeepPrice(row.e)>0,'仅已交付书记员或渠道可设置持续服务。');const {p,e}=row;const r=e.runtime||{kind:'service',until:e.at+economyRules.servicePeriod,invoice_ref:'',auto_pay:true,enabled:true};
 need(r.kind==='service'&&['enable','disable'].includes(a.operation),'持续服务操作无效。');r.enabled=a.operation==='enable';r.auto_pay=a.auto_pay;e.runtime=r;o.report(g,'U001',`${r.enabled?'启用':'停止后续'}持续服务，每28日${upkeepPrice(e)}金龙，${a.auto_pay?'资金足够时按本次授权支付':'逐期核验支付'}；已有已付期限不倒退，已有账单保留。`,[p.id,e.id]);
}
export function controlOperation(g,a,ctx,o){
 const row=rows(g).find(x=>x.e.id===a.effect_ref);need(row,'运营成果不存在。');const {p,e}=row;let r=e.runtime;
 if(e.effect.kind==='tax_source_create_or_modify')r=e.runtime||={kind:'tax',enabled:true};
 need(r&&['workshop','tax','aid'].includes(r.kind)&&['pause','resume','cancel'].includes(a.operation),'只能控制已交付工坊、扣缴或专项。');need(!r.cancelled&&!r.closed&&!r.return_requested,'该运营已经终止，不能凭恢复创造新合同。');
 if(a.operation!=='cancel')need(r.kind==='aid'?(a.operation==='resume'?r.paused:!r.paused):(a.operation==='resume'?!r.enabled:r.enabled),'运营已处于该状态。');
 if(r.kind==='workshop')need(r.cycles<e.effect.max_cycles,'批准批数已全部交付，追加生产须新批准。');
 if(r.kind==='aid'){r.paused=a.operation==='pause';if(a.operation==='cancel')r.return_requested=true;}
 else if(a.operation==='resume'){
  if(r.kind==='workshop'&&r.phase==='finish'){
   need(free(g,'RES-LABOR')>=1,'恢复本批加工前尚缺空闲工班。');const id=o.key(g,'RSV');g.reservations.push({id,resource_id:'RES-LABOR',amount:1,owner:'U001',target_id:e.id,purpose:'恢复原未完工军械加工',status:'有效',start_minute:now(g),end_minute:null,release_rule:'本批完成或暂停释放',basis:o.basis('既有原料不重复领用',[p.id,e.id])});r.crew_ref=id;r.next_at=now(g)+(r.remaining||0);
  }else if(r.kind==='workshop')r.next_at=now(g);r.enabled=true;
 }else{if(r.kind==='workshop'){r.remaining=Math.max(0,r.next_at-now(g));o.release(g,r.crew_ref);}r.enabled=false;if(a.operation==='cancel')r.cancelled=true;}
 o.report(g,'U001',`运营已${{pause:'暂停',resume:'恢复',cancel:'终止后续工作'}[a.operation]}；实际支出、已交付库存和既有义务保留。`,[p.id,e.id]);
}
export function validateRuntime(e,g){
 const r=e.runtime;if(!r)return;const extra=r.kind==='workshop'?['next_at','phase','cycles','crew_ref','enabled','remaining','cancelled']:r.kind==='service'?['until','invoice_ref','auto_pay','enabled','periods']:r.kind==='aid'?['reservation_ref','closed','paused','return_requested']:r.kind==='tax'?['enabled','cancelled']:null;
 need(extra&&Object.keys(r).every(k=>k==='kind'||extra.includes(k)),'改革持续执行字段不合法。');
 for(const k of ['enabled','auto_pay','closed','paused','return_requested','cancelled'])if(Object.hasOwn(r,k))need(typeof r[k]==='boolean','持续执行开关不合法。');
 if(r.kind==='workshop'){
  need(e.effect.kind==='supply_line_establish'&&Number.isSafeInteger(r.next_at)&&r.next_at>=e.at&&Number.isSafeInteger(r.cycles)&&r.cycles>=0&&r.cycles<=e.effect.max_cycles&&['start','finish'].includes(r.phase)&&typeof r.crew_ref==='string','工坊周期状态不合法。');
  const produced=g.settlements.filter(s=>s.target_id==='RES-ARMS'&&s.delta===1&&s.evidence_refs.includes(e.id)).length;need(produced===r.cycles,'工坊交付批数必须对应实际库存交易。');if(r.crew_ref)need(g.reservations.some(x=>x.id===r.crew_ref&&x.resource_id==='RES-LABOR'),'工坊缺实际工班占用。');
 }
 if(r.kind==='service')need(upkeepPrice(e)>0&&Number.isSafeInteger(r.until)&&r.until>=e.at&&typeof r.invoice_ref==='string'&&(!r.invoice_ref||g.obligations.some(x=>x.id===r.invoice_ref)),'持续服务缺实际期限或账单。');
 if(r.kind==='service'&&r.periods!==undefined)need(Array.isArray(r.periods)&&r.periods.length>0&&r.periods.every((p,i)=>p&&Object.keys(p).sort().join(',')==='from,to'&&Number.isSafeInteger(p.from)&&Number.isSafeInteger(p.to)&&p.from>=e.at&&p.from<=now(g)&&p.to>p.from&&p.to<=r.until&&(!i||p.from>r.periods[i-1].to))&&r.periods.at(-1).to===r.until,'持续服务实际工作期间不合法。');
 if(r.kind==='aid')need(e.effect.kind==='conditional_support'&&g.reservations.some(x=>x.id===r.reservation_ref&&x.resource_id==='RES-CASH'),'专项资助缺真实预留。');
 if(r.kind==='tax')need(e.effect.kind==='tax_source_create_or_modify','扣缴状态必须属于真实税源。');
}

export function operatingTerms(plan){return plan.steps.map(s=>{const e=s.effect;
 if(e.maintenance)return `另授权每28日${(e.kind==='institution_create_or_expand'?e.count:1)*10}金龙持续服务，${e.maintenance.auto_pay?'可用资金足够时支付':'逐期批准支付'}；未付款停工，不补算停工工作。`;
 if(e.kind==='supply_line_establish')return `另批准最多${e.max_cycles}批、运营费用上限${e.operating_budget}金龙；每批实际用铁木各一批及工班一组，每批10金龙。`;
 if(e.kind==='debt_or_bond_restructure')return `另清偿旧本金${e.amount}金龙，资金源${e.source_ref}；既有利息保留。`;
 if(e.kind==='conditional_support')return `专项${e.amount}金龙，仅供${e.obligation_refs.join('、')}，到T0+${e.expires_at}分钟退回未用额。`;
 if(e.kind==='tax_source_create_or_modify')return `合同${e.base_ref}及续期实付扣缴${e.rate_bps/100}%；收款人取得净额。`;
 return '';
}).join('');}
export function operationView(g,p){
 const known=g.messages.filter(m=>m.recipient==='U001'&&m.status==='已收到');
 return p.policy.effects.filter(e=>(e.runtime||['tax_source_create_or_modify','force_command_or_payroll_shift'].includes(e.effect.kind)||upkeepPrice(e))&&known.some(m=>m.basis?.refs.includes(e.id))).map(e=>{
  const actions=[],r=e.runtime,service=upkeepPrice(e)>0;
  const push=(label,action,confirmation)=>actions.push({label,action,confirmation});
  const payment=id=>{const invoice=g.obligations.find(x=>x.id===id);if(!invoice||invoice.status==='已支付')return;push('核验付款 '+id,{type:'inspect_payment',obligation_ref:id});push('支付 '+id+' · '+invoice.amount+'金龙',{type:'pay_obligation',obligation_ref:id},'只在实际核验回报送达后支付；按原预留与限定用途处理，不重复扣款。');};
  if(e.effect.kind==='force_command_or_payroll_shift')for(const id of e.effect.obligation_refs)payment(id);
  if(service){
   for(const [label,operation,auto_pay]of [['持续雇用并按期付款','enable',true],['保留续用，逐期核验付款','enable',false],['停止后续续费','disable',false]])push(label,{type:'reform_maintain',effect_ref:e.id,operation,auto_pay},`${label}：每28日${upkeepPrice(e)}金龙，未付期间无能力；已付期限和既有账单保留。`);
   if(r?.invoice_ref&&known.some(m=>m.basis?.refs.includes(r.invoice_ref)))payment(r.invoice_ref);
  }else if(e.effect.kind!=='force_command_or_payroll_shift'&&!r?.cancelled&&!r?.closed&&!r?.return_requested&&!(r?.kind==='workshop'&&r.cycles>=e.effect.max_cycles)){
   const paused=r?.kind==='aid'?r.paused:r?.enabled===false;
   push(paused?'恢复运营':'暂停运营',{type:'reform_operation_control',effect_ref:e.id,operation:paused?'resume':'pause'},'保留实际投入、库存与义务；不扩大原批准范围。');
   push('终止后续运营',{type:'reform_operation_control',effect_ref:e.id,operation:'cancel'},'停止后续工作，未用专项按实际来源退回；沉没投入保留。');
  }
  return {id:e.id,text:`${e.id}：${operatingTerms({steps:[{effect:e.effect}]})} `+(known.findLast(m=>m.basis?.refs.includes(e.id))?.content||''),actions};
 });
}
