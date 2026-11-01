// Presentation of the actual pending contract, independent of a model's summary.
import {operatingTerms} from './reform-economy.mjs';
const effects={tax_source_create_or_modify:'合同扣缴',tax_loss_reduction:'净收入改善',income:'净收入调整',supply_line_establish:'军械生产',debt_or_bond_restructure:'债务置换',conditional_support:'限定用途资助',training:'训练',equipment:'换装',handover:'转属',defense:'城防',procedure:'付款核验规程',force_command_or_payroll_shift:'供饷路线',force_duty_reassignment:'岗位值守',physical_security_upgrade:'通道安保',intel_network_deploy:'港口观察',institution_create_or_expand:'书记员招募',procedure_and_authority_grant:'核查规程',unmapped:'尚未接通的成果'};
const fields={target:'作用对象',base_ref:'原付款合同',rate_bps:'扣缴比例（万分率）',source_ref:'资金来源',counterparty:'出资人',amount:'金额（金龙）',obligation_refs:'限定付款事项',expires_at:'用途截止（开局后分钟）',recipe:'生产配方',period_minutes:'每批周期（分钟）',max_cycles:'批准批数',operating_budget:'运营费用上限（金龙）',count:'人数',group:'来源班组',commander:'接任人',base:'原周期净额（金龙）',delta:'周期净额变化（金龙）',office:'经办机构',operation:'办理事项',post:'值守岗位',until:'截止（开局后分钟）'};
const words={royal_arms:'王室军械',payment_review:'按授权核验付款',audit:'账户核查',muster:'班组点名',seal:'封堵',red_keep:'红堡文书接洽处'};
const value=(v,name)=>Array.isArray(v)?v.map(x=>value(x,name)).join('、'):words[v]||name(v);
export function reformApprovalText(plan,name=x=>String(x)){
 const lines=[`${plan.title}；负责人：${name(plan.owner)}；范围：${plan.scope.map(name).join('、')}；建设/阶段费用上限${plan.budget}金龙。`,
  `目标：${plan.objective}。${plan.independent?'已允许独立分项先行':'一揽子实施，未授权独立先行'}。`];
 for(const s of plan.steps){
  const e=s.effect,details=Object.entries(e).filter(([k])=>!['kind','reason','maintenance'].includes(k)).map(([k,v])=>`${fields[k]||k}：${value(v,name)}`);
  lines.push(`${s.title}：投入${s.cost}金龙；准备${s.prepare_days}日、执行${s.execute_days}日、核验${s.observe_days}日；${effects[e.kind]||e.kind}；${details.join('；')}。${operatingTerms({steps:[s]})}依据：${e.reason}。`);
  if(s.materials.length)lines.push('投入材料：'+s.materials.map(m=>`${name(m.resource)} × ${m.amount}`).join('、'));
  if(s.depends_on.length||s.requires.length||s.gate)lines.push(`前置分项：${s.depends_on.join('、')||'无'}；前置依据：${s.requires.map(r=>name(r.ref)).join('、')||'无'}；${s.gate?'开工前须再请示':'按原授权推进'}。`);
 }
 for(const c of plan.checkpoints||[])lines.push(`第${c.week}周 ${c.title}：${c.checks}；影响分项：${c.steps.map(id=>plan.steps.find(s=>s.id===id)?.title||id).join('、')}；${c.mode==='decision'?'须裁决':'汇报核查'}${c.urgent?'，已授权必要时求见':''}。`);
 return lines.join('\n');
}
export function reformActionText(action,name){
 return (action.type==='reform_revise'?`修订对象：${action.project_ref}；原合同版本：${action.revision}。\n`:'')+reformApprovalText(action.plan,name);
}
