// General reform contracts: names are free; executable effects are typed.
// No arbitrary property paths, scripts, global efficiency or loyalty scores.
import {economyRules} from './reform-economy.mjs';
import {supportFields,checkSupport} from './reform-support.mjs';
import {reformEraWindow} from './era-rules.mjs';
export const REFORM_VERSION=1;
export const DAY=1440;
const fail=(ok,message)=>{if(!ok)throw Error(message);};
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=3000;
const number=x=>Number.isFinite(x)&&Math.abs(x*10000-Math.round(x*10000))<1e-6;
const refs=x=>Array.isArray(x)&&x.length<=30&&x.every(text)&&new Set(x).size===x.length;
export const exactKeys=(x,keys)=>fail(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===[...keys].sort().join('|'),'改革合同字段不完整或含未允许字段。');
export const isReform=p=>p?.policy?.template==='general_reform';
export function checkEffect(e){
 const fields={...supportFields,tax_loss_reduction:['target','base','delta','reason'],income:['target','base','delta','reason'],training:['target','group','count','reason'],equipment:['target','group','count','reason'],handover:['target','group','count','commander','reason'],defense:['target','reason'],procedure:['target','operation','reason'],unmapped:['target','reason']};
 fail(e&&Object.hasOwn(fields,e.kind),'该效果尚无处理器；不能用漫长筹备冒充已经支持。');
 exactKeys(e,['kind',...fields[e.kind],...(Object.hasOwn(e,'maintenance')?['maintenance']:[])]);fail(text(e.target)&&text(e.reason),'改革效果缺少目标或因果依据。');
 if(['income','tax_loss_reduction'].includes(e.kind))fail(number(e.base)&&e.base>0&&number(e.delta)&&e.delta!==0&&Math.abs(e.delta)<=e.base,'收支调整须引用已知基数，变化不得超出该基数。');
 if(['training','equipment','handover'].includes(e.kind))fail(Number.isSafeInteger(e.group)&&e.group>=0&&Number.isSafeInteger(e.count)&&e.count>0,'部队成果须指定来源班组与人数。');
 if(e.kind==='handover')fail(text(e.commander),'交接缺少接任人。');
 if(e.kind==='procedure')fail(e.operation==='payment_review','该流程效果尚未接入，不能任意创建规则。');
 checkSupport(e);return e;
}
export function checkReformPlan(p){
 exactKeys(p,['title','objective','domain','scope','owner','budget','independent','era','steps',...(Object.hasOwn(p,'checkpoints')?['checkpoints']:[])]);
 fail(['economic','military','administration','mixed'].includes(p.domain),'改革领域不明确。');
 fail(text(p.title)&&p.title.length<=100&&text(p.objective)&&refs(p.scope)&&p.scope.length&&text(p.owner)&&number(p.budget)&&p.budget>=0&&typeof p.independent==='boolean','改革目标、范围、负责人或预算不完整。');
 exactKeys(p.era,['level','technology','local_basis','method','missing','evidence_refs']);
 fail(['native','slight','moderate','remote','unknown'].includes(p.era.level)&&['technology','local_basis','method'].every(k=>text(p.era[k]))&&refs(p.era.missing)&&refs(p.era.evidence_refs)&&p.era.evidence_refs.length,'时代评估须有实际功能、本地基础、方法与依据。');
 fail(!['remote','unknown'].includes(p.era.level)||p.era.missing.length,'长期或未定筹备必须说明缺失条件。');
 fail(Array.isArray(p.steps)&&p.steps.length>0&&p.steps.length<=12&&new Set(p.steps.map(s=>s.id)).size===p.steps.length,'改革步骤为空、过多或编号重复。');
 for(const s of p.steps){
  exactKeys(s,['id','title','depends_on','prepare_days','execute_days','observe_days','cost','materials','requires','gate','effect','evidence_refs']);
  fail(text(s.id)&&text(s.title)&&refs(s.depends_on)&&refs(s.evidence_refs)&&s.evidence_refs.length&&typeof s.gate==='boolean','改革步骤缺少名称、依赖或证据。');
  fail(['prepare_days','execute_days','observe_days'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<=3650)&&s.prepare_days+s.execute_days+s.observe_days>0&&number(s.cost)&&s.cost>=0,'阶段必须有明确的游戏日与非负费用。');
  fail(Array.isArray(s.materials)&&s.materials.length<=12&&Array.isArray(s.requires)&&s.requires.length<=12,'材料或前置条件格式不符。');
  for(const m of s.materials){exactKeys(m,['resource','amount']);fail(text(m.resource)&&number(m.amount)&&m.amount>0,'材料缺少来源或数量。');}
  fail(new Set(s.materials.map(m=>m.resource)).size===s.materials.length,'同一阶段的同一材料须合并数量，不能重复扣取。');
  for(const r of s.requires){exactKeys(r,['kind','ref']);fail(['authority','decision','message','project'].includes(r.kind)&&text(r.ref),'只能使用有处理器的明确前置条件。');}
  checkEffect(s.effect);
  if(s.effect.kind==='supply_line_establish')fail(s.cost>=economyRules.workshopSetup&&s.execute_days>=economyRules.workshopDays,'工坊须有真实建设投入和十四日施工；每批另消耗实际铁、木、工班与经费。');
  if(s.effect.kind==='physical_security_upgrade')fail(s.cost>=20&&s.execute_days>=2,'通道封堵须投入材料工费并实际施工至少2日。');
  if(s.effect.kind==='intel_network_deploy')fail(s.cost>=20&&s.execute_days>=14,'港口联络须实际招募和观察准备，不因付钱立即知道秘密。');
  if(s.effect.kind==='institution_create_or_expand')fail(s.cost>=s.effect.count*20&&s.execute_days>=14,'书记员须有实际招募与训练：试用每人20金龙、14有效日，不能只改编制。');
  if(s.effect.kind==='procedure_and_authority_grant')fail(s.execute_days>=1,'核查须有实际工作。');
  if(s.effect.kind==='training')fail(s.execute_days>=28,'基础轮训至少保留既有二十八个有效训练日；任免不是训练。');
  if(s.effect.kind==='equipment'&&s.materials.some(m=>m.resource==='RES-ARMS'))fail(s.effect.count<=s.materials.filter(m=>m.resource==='RES-ARMS').reduce((n,m)=>n+m.amount,0)*economyRules.armsPerBatch,'领用的实际军械批数不足以覆盖本次换装人数。');
  if(s.effect.kind==='equipment')fail(s.execute_days>=2&&s.cost+s.materials.length>0,'装备须有采购或材料投入，不能次日凭空装备全军。');
  if(s.effect.kind==='defense')fail(s.execute_days>=14&&s.cost+s.materials.length>0,'城防交付沿现有至少十四日工程基线，并须投入。');
 }
 fail(p.steps.reduce((n,s)=>n+s.cost,0)<=p.budget,'分项费用超过已批准总预算。');
 const path=(id,seen=[])=>{fail(!seen.includes(id),'改革步骤存在循环依赖。');const s=p.steps.find(s=>s.id===id);fail(s,'改革引用了不存在的步骤。');return s.prepare_days+s.execute_days+s.observe_days+Math.max(0,...s.depends_on.map(d=>path(d,[...seen,id])));};
 for(const s of p.steps)path(s.id);
 if(p.checkpoints!==undefined){
  fail(Array.isArray(p.checkpoints)&&p.checkpoints.length<=12&&new Set(p.checkpoints.map(c=>c.id)).size===p.checkpoints.length,'检查点过多或编号重复。');
  for(const c of p.checkpoints){
   exactKeys(c,['id','title','week','steps','mode','checks','urgent']);
   fail(text(c.id)&&text(c.title)&&Number.isSafeInteger(c.week)&&c.week>0&&c.week<=520&&refs(c.steps)&&c.steps.length&&c.steps.every(id=>p.steps.some(s=>s.id===id))&&['review','decision'].includes(c.mode)&&text(c.checks)&&typeof c.urgent==='boolean','检查点须指定审议周、检查内容和受影响步骤。');
  }
 }
 return p;
}
export function reformTiming(plan){
 checkReformPlan(plan);
 const path=id=>{const s=plan.steps.find(s=>s.id===id);return s.prepare_days+s.execute_days+s.observe_days+Math.max(0,...s.depends_on.map(path));};
 const executable=id=>{const s=plan.steps.find(s=>s.id===id);return s.effect.kind!=='unmapped'&&s.depends_on.every(executable);};
 const candidates=plan.independent||plan.steps.every(s=>executable(s.id))?plan.steps.filter(s=>executable(s.id)):[];
 const deliverable=candidates.length>0;
 const first=deliverable?Math.min(...candidates.map(s=>path(s.id))):0;
 const economic=plan.steps.some(s=>['income','tax_loss_reduction','tax_source_create_or_modify','supply_line_establish','debt_or_bond_restructure','conditional_support','procedure','procedure_and_authority_grant','institution_create_or_expand'].includes(s.effect.kind));
 const personnel=plan.steps.every(s=>s.effect.kind==='handover');
 const {minimum:floor,maximum:ceiling,long}=reformEraWindow(plan.era.level,{economic,personnel});
 // One shared preparation interval, never the old penalty once per substep.
 const preparation=long?null:Math.max(0,floor-first)*DAY;
 return {preparation:deliverable?preparation:0,first_days:long||!deliverable?null:Math.max(first,floor),target_days:ceiling,long,exceeds_window:!long&&deliverable&&Math.max(first,floor)>ceiling};
}
export const reformInstructions='自由改革使用reform_propose，不按改革名称或示例匹配。plan={title,objective,domain:economic|military|administration|mixed,scope:[已知对象编号],owner:实际负责人编号,budget:总费用上限,independent:是否允许独立子项先行,era:{level:native|slight|moderate|remote|unknown,technology:实际功能超前程度,local_basis:本地基础,method:实施理由,missing:[缺失条件],evidence_refs:[known引用]},steps:[{id,title,depends_on:[],prepare_days:整数游戏日,execute_days:整数游戏日,observe_days:整数游戏日,cost:费用,materials:[{resource,amount}],requires:[{kind:authority|decision|message|project,ref}],gate:是否在本步开始前主动请国王决定,effect:允许效果,evidence_refs:[known引用]}]}。效果：income={kind,target:已知应收编号,base:该来源已知周期金额,delta:本方案预估的周期变化,reason}；training/equipment={kind,target:部队编号,group:班组序号,count:人数,reason}；defense={kind,target:部队编号,reason}；procedure={kind,target:机构编号,operation:payment_review,reason}。只有已知catalogue标注支持的财源、机构、部队岗位可承接效果；当前训练/装备接通金袍子机动预备，城防接通君临，其他部队岗位用unmapped明确待议。效果名称是底层能力，不是改革名单；任意改革可组合这些能力。未支持的效果明确说明，不能伪装软失败。同一构想含不同时代的职能时，只有玩家允许拆分才形成分别估时的关联合同，不能给整套方案一个remote后又声称内部短项可按native完成。预算、范围、负责人、人数、费用及收入变化必须在可批准的原话中说明；阶段天数与时代理由是带依据的估计，不伪称国王原话。经济正常约21日、略超前30—60日、中等且理由充分75—90日见实际初效；远超基础则缺条件长期筹备，无自动收益。训练沿28有效日，城防沿14日工程，装备须实际投入。初效立即适用于后续周期和战斗，不另锁成熟期。普通执行自动记录；重大节点gate=true，预算/范围/条件改变须另议。修改未投入的方案用reform_revise={type,project_ref,revision,plan}，已投入或交付分项保持；重新送交负责人确认。查询已有改革使用reform_report；暂停、恢复、批准待决步骤使用reform_control，取消用原cancel_order。';

export const supportInstructions='效果字段：'+JSON.stringify(supportFields)+'。均用kind。tax_loss_reduction沿income的target/base/delta/reason改变已知周期净额，不再扣损耗。tax_source_create_or_modify仅已存在现金合同base_ref及其续期实付扣缴，rate_bps万分率，收款人取得净额；不是未调查贸易税基。supply_line_establish仅royal_arms工坊，建设至少100金龙、14日；每批领铁木各一批、占工班一组、另付10金龙，至少7日交付供十人装备的一批。须明确max_cycles与operating_budget上限。debt_or_bond_restructure引用真实旧债target及已实收新债source_ref，amount只还本金，不再入现金，利息保留。conditional_support指定实际出资人counterparty、已核实现金或实收债务source_ref、amount、obligation_refs、expires_at；私人财富未核实/出资人未接受则等待，不生成钱；未用余款退回。institution_create_or_expand仅已有机构，每名书记员招募训练20金龙、14日，含首28日服务；intel_network_deploy仅ORG-PORT，20金龙14日筹建，含首28日。二者可附maintenance:{auto_pay:true或false}明确持续雇用，每28日每名书记员或每渠道10金龙实付续期，缺钱停工、不补算、不累积未工作账单；旧合同未附则保留28日试用，不暗扣。procedure_and_authority_grant仅现有账户audit或部队muster，office已有且须有到岗书记员；查账不自动造收益。force_duty_reassignment指定班组、人数、post、until绝对分钟，交付后仍占人。physical_security_upgrade只封已核查RK-AEGON，至少20金龙、2日施工。供饷source_ref为RES-CASH、实收债务或本部队已到账专项效果编号，obligation_refs为现有军饷。reform_maintain管理持续服务，reform_operation_control管理工坊/扣缴/专项暂停恢复终止；不得冒充原批准。未知能力仍unmapped。';
export const reformExtraInstructions='新方案同时提出checkpoints:[{id,title,week:游戏绝对周次,steps:[受影响步骤编号],mode:review普通检查或decision必决关口,checks:需要核验的事实与追加授权条件,urgent:是否获准在待决时请求会间面见}]，与方案一起由国王批准。不要凭空添加必决关口；旧合同可省略。周会普通报告听取即过，不代表新授权。到期decision只等待相关步骤与其依赖；普通review不制造困难。approve_checkpoint使用reform_control和step_ref=检查点编号，仅允许明确同意继续原范围；改预算或目标必须改案。会间近卫只传实际求见消息，不代负责人汇报。'+
 'handover={kind,target:原部队编号,group:班组序号,count:交接人数,commander:接任人编号,reason}，转属须原执行者与接任人分别接受，沿原供饷不增加兵员；正常3—7日。未知效果用unmapped={kind,target:目标编号或明确范围,reason:尚缺何种结算能力}保留待议，不能写任意字段，也不能冒充时代困难。整体远超时代可用remote保留长期筹备，不产生目标收益；不能只按现代名称归类。军事实力改善14—90日；经济native在21日内。';

export const capabilityCoverage=Object.freeze({tax_source_create_or_modify:'actual payment withholding',tax_loss_reduction:'net income only',supply_line_establish:'royal arms workshop from actual iron/timber/labor/cash',debt_or_bond_restructure:'repay an existing debt using an already funded new loan',force_training_and_equip:'existing separate training/equipment',force_command_or_payroll_shift:'payroll route only; command uses existing handover',force_duty_reassignment:'bounded local post',defense_engineering:'existing local defense',physical_security_upgrade:'verified RK-AEGON seal only',intel_network_deploy:'port arrivals observation with explicitly paid continued service',institution_create_or_expand:'existing institution clerks with explicitly paid continued service',procedure_and_authority_grant:'account audit/muster; existing payment_review'});
