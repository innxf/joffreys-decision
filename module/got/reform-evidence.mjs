import {checkReformPlan} from './reform-contract.mjs';
import {economyRules} from './reform-economy.mjs';
import {quotedNumbers} from './middleware-evidence.mjs';
const need=(ok,message)=>{if(!ok)throw Error(message);};
const normalized=s=>String(s).normalize('NFKC').replace(/[\s，,]/g,'');
const names=(c,id)=>[id,...(c.entity_names?.[id]||[]),...(c.targets||[]).filter(t=>t.ref===id).map(t=>t.title).filter(Boolean)];
const mentions=(c,q,id)=>names(c,id).some(n=>n&&normalized(q).includes(normalized(n)));
const explicit=(q,n,unit)=>quotedNumbers(q,unit).includes(n);
export function checkReformEvidence(c,p,quote){
  const offer=c.targets?.find(t=>t.kind==='reform_quotation'&&JSON.stringify(t.plan)===JSON.stringify(p));if(offer){need(quote.includes(offer.text),'报价须完整来自本轮NPC建议，不得拼接背景金额。');for(const s of p.steps)checkFinancialTerms(c,s.effect,quote);return p;}
 checkReformPlan(p);const known=new Set((c.known||[]).map(k=>k.ref));
 need(mentions(c,quote,p.owner),'改革负责人须能在原话中核对，不能替玩家指定。');
 need(p.scope.every(id=>mentions(c,quote,id)),'改革范围须能在原话中逐项核对。');
 need(p.budget===0?/无新增费用|不另收费|零预算|预算\s*0/.test(quote):explicit(quote,p.budget,'金龙|枚'),'改革预算须由原话明确，不能从背景金额拼接。');
 for(const ref of [...p.era.evidence_refs,...p.steps.flatMap(s=>s.evidence_refs)])need(known.has(ref),'改革估计引用了当前人物未知的依据。');
 for(const s of p.steps){const e=s.effect;
  const start=quote.indexOf(s.title);if(p.steps.length>1)need(start>=0,'多分项改革须分别列明分项名称、费用和效果，不能交叉拼接数字。');
  const end=p.steps.filter(x=>x.id!==s.id).map(x=>quote.indexOf(x.title,start+s.title.length)).filter(i=>i>start).sort((a,b)=>a-b)[0]??quote.length;
  const part=p.steps.length>1?quote.slice(start,end):quote;
  need(s.cost===0||explicit(part,s.cost,'金龙|枚'),'阶段费用未在方案原话中说明。');
  if(e.count)need(explicit(part,e.count,'人|名'),'改革不能从背景人数猜定实际参与人数。');
  if(e.commander)need(mentions(c,quote,e.commander),'接任人没有原话依据。');
  if(e.maintenance){need(/持续|续用|续聘/.test(part)&&/每\s*28\s*[日天]/.test(part)&&explicit(part,(e.kind==='institution_create_or_expand'?e.count:1)*10,'金龙|枚'),'持续服务的期限及周期费用须在建议中明确。');if(e.maintenance.auto_pay)need(/自动支付|按期支付|持续支付|资金足够时支付|按期付款/.test(part),'按期扣费授权必须明示。');}
   checkFinancialTerms(c,e,part,quote);
  if(e.kind==='supply_line_establish')need(explicit(part,e.max_cycles,'批')&&explicit(part,e.operating_budget,'金龙|枚')&&explicit(part,economyRules.workshopCash,'金龙|枚')&&/铁/.test(part)&&/木/.test(part)&&/工班/.test(part),'生产须明确批准批数、运营费用上限与每批真实投入。');
  if(['income','tax_loss_reduction'].includes(e.kind)){
   const t=c.targets?.find(t=>t.ref===e.target&&t.kind==='reform_income');need(t&&t.base===e.base,'收入效果缺少当前职务范围内的预测基数。');
   const direction=e.delta>0?/(?:增加|增收|多收|改善|提高)[^，,。；;]{0,35}/g:/(?:减少|少收|降低|减免)[^，,。；;]{0,35}/g;
   need([...part.matchAll(direction)].some(m=>explicit(m[0],Math.abs(e.delta),'金龙|枚')),'收入变化的金额与方向须在该分项被批准的方案中说明。');
  }
  if(['training','equipment','handover'].includes(e.kind)){
   const t=c.targets?.find(t=>t.ref===e.target&&t.kind==='reform_force'),group=t?.groups.find(x=>x.index===e.group);need(group&&group.count>=e.count,'该人物没有对应班组与人数的可核对资料。');
   need(quote.includes(group.task)||(/机动|预备/.test(group.task)&&/机动|预备/.test(quote))||quote.includes('班组'+e.group),'必须说明人员来源班组，不能随意抽空其他岗位。');
  }
  for(const m of s.materials)need(mentions(c,quote,m.resource)&&explicit(quote,m.amount,'单位|人日|份|件'),'投入材料必须有明确来源、数量与单位。');
 }
 for(const cpoint of p.checkpoints||[]){need(quote.includes(cpoint.title)&&explicit(quote,cpoint.week,'周'),'检查点名称和审议周须在获批准方案中明确。');if(cpoint.mode==='decision')need(/请示|决定|批准|裁决/.test(quote),'必决关口必须明示');if(cpoint.urgent)need(/求见|面见|急事|紧急/.test(quote),'会间求见须在方案中说明');}
 if(p.independent)need(/分别|分项|独立|能做的先做|可先|先行|分批/.test(quote),'独立分项先行须在方案中说明，不静默拆开一揽子条件。');
 return p;
}
function checkFinancialTerms(c,e,part,quote=part){
 if(e.kind==='tax_source_create_or_modify')need(mentions(c,quote,e.base_ref)&&explicit(part,e.rate_bps/100,'%|％')&&/扣缴|印花/.test(part),'扣缴必须明示合同、比例及实际净付款。');
 if(['debt_or_bond_restructure','conditional_support'].includes(e.kind))need(mentions(c,quote,e.source_ref)&&explicit(part,e.amount,'金龙|枚'),'资金用途须列明实际来源及金额，不拼接背景。');
 if(e.kind==='conditional_support')need(mentions(c,quote,e.counterparty)&&e.obligation_refs.every(id=>mentions(c,quote,id))&&explicit(part,e.expires_at,'分钟')&&/退回/.test(part),'专项须明确出资人、限定用途、期限及余款退回。');
}
export function checkReformReference(c,a,quote){
 const t=c.targets?.find(t=>t.ref===a.project_ref&&t.kind==='reform');need(t&&mentions(c,quote,a.project_ref),'请明确所查询或处理的改革。');
 if(a.type==='reform_report')return;
 need(a.revision===t.revision,'改革决定使用了旧版方案。');
 if(a.type==='reform_revise'){need(/修改|改案|修订|改为|调整方案/.test(quote),'缺少明确改案指示。');return;}
 const meanings={pause:/暂停|暂缓/,resume:/恢复|继续原方案/,approve_step:/批准|同意|继续/,accept_delay:/接受|同意/,approve_checkpoint:/批准|同意|继续/};
 need(meanings[a.operation]?.test(quote),'没有对应的明确改革决定。');
 if(a.operation==='approve_checkpoint')need(t.plan.checkpoints?.some(n=>n.id===a.step_ref&&(quote.includes(n.id)||quote.includes(n.title))),'没有明确批准哪个检查点。');
 if(a.operation==='approve_step')need(t.plan.steps.some(s=>s.id===a.step_ref&&(quote.includes(s.id)||quote.includes(s.title))),'没有明确批准哪一步。');
}
