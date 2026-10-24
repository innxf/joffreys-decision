// Fixed domain operations. All mutations run inside the existing GOT transaction.
export function initializePolitics(g){g.politics={guard_plans:[],payroll_routes:[],accounts:[],audits:[],issues:[],subscriptions:[],receipts:[],debts:[]};}
export const politicalKinds=['guard_transfer','audit','recovery','bond_open','bond_interest','bond_principal'];
export const politicalWorkers=['guard_transfer','audit','bond_open'];
const clock=g=>g.clock.elapsed_minutes;
export function officeStart(at){const tod=(at+360)%1440;return tod<480?at+480-tod:tod>=1080?at+1440-tod+480:at;}
export function officeFinish(at,minutes){let time=officeStart(at),left=minutes;while(left){const room=1080-(time+360)%1440,take=Math.min(room,left);time+=take;left-=take;if(left)time=officeStart(time);}return time;}
const accepted=(g,actor,kind,target)=>g.execution.decisions.find(d=>d.actor===actor&&d.kind===kind&&d.target_ref===target&&d.status==='accepted'&&d.at<=clock(g)&&d.source_refs.length);
function permit(g,actor,operation,target,limit,o){
  const a=g.authorities.find(a=>a.subject===actor&&a.object_ref===target&&a.status==='active'&&a.starts_at<=clock(g)&&a.expires_at>clock(g)&&a.delivery_refs.length&&a.scope.actions.includes(operation)&&a.scope.max_count>=limit);
  o.need(a,'AUTHORITY_NOT_DELIVERED');return a;
}
function project(g,ctx,name,actor,template,targets,prepare,execute,cost,o){
  const id=o.key(g,'PRJ'),reservation=cost?o.reserve(g,ctx,id,cost):null;
  const refs={guard_transfer:'REF02',audit:'REF03',bond_open:'REF06'};
  g.projects.push({id,name,status:'preparing',responsible:actor,event_refs:[template==='guard_transfer'?'KL05':'KL08'],earliest_work_days:0,required_resources:{},
    estimated_cash_cost:{value:cost,unit:'金龙',design_range:[cost,cost],as_of_minute:clock(g),basis:o.basis('本批有限工作量；不追加既有工资')},active_reservation_id:reservation,
    progress:'已建立方案，等待前提与命令',completion_condition:'对应交接或报告形成；不替代后续政治判断',basis:o.basis('M2第三批固定规则',[ctx.id]),
    policy:{template,plan_revision:1,target_refs:targets,step_refs:[],dependency_edges:[],decision_refs:[ctx.id],authority_refs:[],milestones:[{id:id+'-prepare',status:'pending',evidence_refs:[]},{id:id+'-delivery',status:'pending',evidence_refs:[]}],
      era_ref:refs[template],era_class:'E0',base_prepare:prepare,base_execute:execute,additional_prepare:0,additional_execute:0,closure_obligations:[],next_check_minute:null}});
  return g.projects.at(-1);
}
function workStarted(g,t,cost,prepare,execute,ctx,o){
  const p=g.projects.find(p=>p.id===t.params.project_ref);if(cost)o.spend(g,ctx,cost,p.active_reservation_id,'有限项目实付材料与发行费',[p.id]);
  p.status='preparing';p.progress='正在筹备已确认范围，尚未完成筹备';
  t.phase='prepare_done';t.next_at=t.kind==='guard_transfer'?clock(g)+prepare:officeFinish(clock(g),prepare);p.policy.next_check_minute=t.next_at;
}
function completeProject(g,t){const p=g.projects.find(p=>p.id===t.params.project_ref);p.status='completed';p.progress='有限交付完成';p.policy.milestones[1].status='achieved';p.policy.milestones[1].evidence_refs=[t.order_ref];p.policy.next_check_minute=null;}
function guardReady(g,p,o){
  const org=g.administration.organizations.find(x=>x.entity_ref===p.organization_ref);o.need(org&&org.office_refs.some(ref=>g.offices.some(f=>f.id===ref&&f.holder===p.commander)),'APPOINTMENT_MISSING');
  o.need(accepted(g,p.commander,'guard_command',p.id),'PENDING_DECISION','awaiting_decision');
  o.need(accepted(g,'P020','permanent_transfer',p.id),'PENDING_DECISION','awaiting_decision');
  permit(g,'P020','permanent_transfer',p.id,p.count,o);
  const used=g.politics.guard_plans.filter(x=>x.id!==p.id&&x.status==='completed').reduce((n,x)=>n+x.count,0);o.need(p.count+used<=100,'POST_CAPACITY');
  const f=g.forces.find(f=>f.id==='FORCE01');o.need(o.freeGroup(g,f,1,p.id)>=p.count,'PERSONNEL_UNAVAILABLE');
  if(p.posts==='replace_from_reserve')o.need(o.freeGroup(g,f,4,p.id)>=p.count,'REPLACEMENT_MISSING');
  o.need(o.actorFreeAt(g,p.commander)<=clock(g),'PERSON_BUSY');
}
function auditReady(g,account,executor,o){
  o.need(g.politics.accounts.some(a=>a.id===account),'ACCOUNT_DETAILS_UNAVAILABLE');
  o.need(g.actors.some(a=>a.id===executor&&a.life==='存活'&&a.location.includes('君临')||a.id===executor&&a.life==='存活'&&a.location.includes('红堡')),'EXECUTOR_UNAVAILABLE');
  o.need(['P003','P005'].includes(executor),'NO_AUTHORITY');
  if(executor==='P003')o.need(g.offices.some(f=>f.id==='OFF-ACTING'&&f.holder==='P003')&&g.actors.find(a=>a.id==='P003').location.includes('红堡'),'NOT_ARRIVED');
  permit(g,executor,'audit_account',account,0,o);
}
function openingReady(g,issue,o){
  const org=g.administration.organizations.find(x=>x.entity_ref===issue.organization_ref);o.need(org?.status==='operating','REGISTRAR_NOT_READY');
  o.need(org.office_refs.some(ref=>g.offices.some(f=>f.id===ref&&f.holder===issue.registrar&&f.status==='在任')),'REGISTRAR_NOT_READY');
  permit(g,issue.registrar,'register_debt',issue.id,0,o);
}
function obligation(g,ctx,debt,amount,kind,at,o){
  const id=o.key(g,'PAY');g.obligations.push({id,due_minute:at,amount,unit:'金龙',account:'RES-CASH',payee:debt.creditor,reason:kind==='interest'?'新债合同单利':'新债合同本金',reservation_id:null,status:'待核验或支付',payment_condition:'已成立合同与实际提款；本人明确批准付款',partial_allowed:false,basis:o.basis('新合同实际应付；不改旧债报告',[debt.id,ctx.id])});
  debt.dues.push({obligation_ref:id,kind,amount,paid:0});return id;
}
function accrue(debt,to){
  const units=BigInt(Math.round(debt.outstanding*10000));const elapsed=BigInt(to-debt.last_accrual);
  debt.interest_numerator=(BigInt(debt.interest_numerator)+units*BigInt(debt.rate_bps)*elapsed).toString();debt.last_accrual=to;
}
export function politicalNextEvent(g,target){
  for(const d of g.politics.debts.filter(d=>d.outstanding>0))target=Math.min(target,d.next_interest_at,d.principal_due_created?Infinity:d.maturity_at);
  for(const i of g.politics.issues.filter(i=>i.status==='open'))target=Math.min(target,i.closes_at);
  return target;
}
export function settlePolitics(g,ctx,o){
  for(const a of g.politics.accounts){
    if(a.transfer_ref){const tr=g.transfers.find(t=>t.id===a.transfer_ref);if(tr&&tr.received>a.transfer_received){a.received+=tr.received-a.transfer_received;a.transfer_received=tr.received;}}
  }
  for(const d of g.politics.debts.filter(d=>d.outstanding>0)){
    if(d.next_interest_at<=clock(g)){
      accrue(d,d.next_interest_at);const denom=BigInt(d.period_minutes)*10000n;const value=Number((BigInt(d.interest_numerator)+denom/2n)/denom)/10000;
      if(value)obligation(g,ctx,d,value,'interest',d.next_interest_at,o);d.interest_numerator='0';d.next_interest_at+=d.period_minutes;
    }
    if(!d.principal_due_created&&d.maturity_at<=clock(g)){obligation(g,ctx,d,d.outstanding,'principal',d.maturity_at,o);d.principal_due_created=true;}
  }
  for(const i of g.politics.issues.filter(i=>i.status==='open'&&i.closes_at<=clock(g))){i.status='closed';o.report(g,i.registrar,`发行窗口结束：目标${i.goal}，已付款本金${i.paid}；未付认购不能使用。`,[i.id]);}
}
export function politicalPayment(g,pay){
  for(const route of g.politics.payroll_routes.filter(r=>r.obligation_ref===pay.id&&r.status==='pending')){route.status='paid';route.paid_at=clock(g);}
}
export function cancelPolitical(g,t,o){
  if(t.kind==='guard_transfer'){const p=g.politics.guard_plans.find(x=>x.id===t.params.target_ref);if(p.status!=='completed')p.status='cancelled';}
  if(t.kind==='bond_open'){const i=g.politics.issues.find(x=>x.id===t.params.target_ref);i.status='cancelled';}
}
export function blockPolitical(g,t){
  if(t.kind==='guard_transfer')g.politics.guard_plans.find(x=>x.id===t.params.target_ref).status='blocked';
  if(t.kind==='bond_open')g.politics.issues.find(x=>x.id===t.params.target_ref).status='blocked';
}
function revised(g,id,ctx){
  for(const d of g.execution.decisions.filter(x=>x.target_ref===id&&x.status==='accepted'))d.status='superseded';
  for(const a of g.authorities.filter(x=>x.object_ref===id))a.status='revoked';
  const p=g.projects.find(x=>x.id===id);p.status='preparing';p.policy.plan_revision++;p.policy.decision_refs.push(ctx.id);p.progress='方案修订，旧同意与授权不挪用于新版本';
}
export function applyPoliticalAction(g,a,ctx,o){
  if(a.type==='withdraw_political_plan'){
    o.exact(a,['plan_ref']);const target=g.politics.guard_plans.find(p=>p.id===a.plan_ref)||g.politics.issues.find(p=>p.id===a.plan_ref);
    o.need(target&&['preparing','blocked'].includes(target.status),'PLAN_NOT_READY');const p=g.projects.find(p=>p.id===target.id);target.status='cancelled';p.status='cancelled';o.release(g,p.active_reservation_id);return 'PLAN_WITHDRAWN';
  }
  if(a.type==='revise_guard_plan'){
    o.exact(a,['plan_ref','count','posts']);const p=g.politics.guard_plans.find(p=>p.id===a.plan_ref);
    o.need(p&&['preparing','blocked'].includes(p.status),'PLAN_NOT_READY');o.need(Number.isSafeInteger(a.count)&&a.count>0&&a.count<=100&&['keep_same_posts','replace_from_reserve'].includes(a.posts),'INVALID_PLAN','invalid');
    p.count=a.count;p.posts=a.posts;p.status='preparing';revised(g,p.id,ctx);return 'PLAN_REVISED_NEEDS_CONSENT';
  }
  if(a.type==='plan_guard_transfer'){
    o.exact(a,['organization_ref','count','posts']);const org=g.administration.organizations.find(x=>x.entity_ref===a.organization_ref);
    o.need(org&&org.source_refs[0]!=='T0'&&['preparing','operating'].includes(org.status),'NO_AUTHORITY');
    o.need(Number.isSafeInteger(a.count)&&a.count>0&&a.count<=100&&['keep_same_posts','replace_from_reserve'].includes(a.posts),'INVALID_PLAN','invalid');
    const pr=project(g,ctx,'局部金袍子转属','P020','guard_transfer',['FORCE01',org.entity_ref],60,120,0,o);
    g.politics.guard_plans.push({id:pr.id,organization_ref:org.entity_ref,count:a.count,commander:'P016',posts:a.posts,status:'preparing',order_ref:'',force_ref:'',source_refs:[ctx.id]});return 'GUARD_PLAN_PREPARING';
  }
  if(a.type==='grant_operation_authority'){
    o.exact(a,['person','operation','target_ref','max_count','expires_at']);
    const target=a.operation==='permanent_transfer'?g.politics.guard_plans.find(p=>p.id===a.target_ref):a.operation==='audit_account'?g.politics.accounts.find(p=>p.id===a.target_ref):a.operation==='register_debt'?g.politics.issues.find(p=>p.id===a.target_ref):null;
    o.need(target&&g.actors.some(x=>x.id===a.person&&x.life==='存活'),'UNKNOWN_TARGET');
    o.need((a.operation==='permanent_transfer'&&a.person==='P020'&&a.max_count>=target.count&&a.max_count<=100)||(a.operation==='audit_account'&&['P003','P005'].includes(a.person)&&a.max_count===0)||(a.operation==='register_debt'&&a.person===target.registrar&&a.max_count===0),'NO_AUTHORITY');
    o.need(Number.isSafeInteger(a.expires_at)&&a.expires_at>clock(g)&&a.expires_at<=clock(g)+31*1440,'INVALID_DURATION','invalid');
    const id=o.key(g,'AUTH');g.authorities.push({id,issuer:'U001',subject:a.person,relation:'limited_operation',object_ref:a.target_ref,scope:{actions:[a.operation],max_count:a.max_count,group_id:a.operation==='permanent_transfer'?'FORCE01-RK':'',location:'君临'},starts_at:clock(g),expires_at:a.expires_at,status:'active',source_refs:[ctx.id],delivery_refs:[]});
    o.task(g,ctx,'notify_authority',a.person,{target_ref:id});return 'AUTHORITY_RECORDED_NOT_DELIVERED';
  }
  if(a.type==='execute_guard_transfer'){
    o.exact(a,['plan_ref']);const p=g.politics.guard_plans.find(p=>p.id===a.plan_ref);o.need(p&&p.status==='preparing','PLAN_NOT_READY');guardReady(g,p,o);
    const t=o.task(g,ctx,'guard_transfer','P020',{target_ref:p.id,project_ref:p.id});t.actor_ref=p.commander;p.order_ref=t.order_ref;p.status='ordered';g.projects.find(x=>x.id===p.id).policy.step_refs=[t.order_ref];return 'HANDOVER_ORDERED';
  }
  if(a.type==='replace_kingsguard'){
    o.exact(a,['plan_ref']);const p=g.politics.guard_plans.find(x=>x.id===a.plan_ref);o.need(p&&p.status==='completed','HANDOVER_NOT_COMPLETED');
    o.need(accepted(g,'P016','leave_kingsguard',p.id)&&accepted(g,'P011','return_kingsguard',p.id),'PENDING_DECISION','awaiting_decision');
    o.need(g.orders.find(x=>x.id==='ORD01').status==='已撤销','PURSUIT_ACTIVE');o.need(g.actors.find(a=>a.id==='P011').location.includes('红堡'),'NOT_ARRIVED');
    const seat=g.kingsguard.find(x=>x.holder==='P016');o.need(seat&&!g.kingsguard.some(x=>x.holder==='P011'),'SEAT_ALREADY_CHANGED');
    seat.holder='P011';seat.office_ref='OFF-LC';seat.duty='恢复白袍及队长职责，私人信任另判';seat.basis=o.basis('实际交接后按双方已接受安排协调七席',[p.id]);
    const jaime=g.kingsguard.find(x=>x.holder==='P015');jaime.office_ref=null;g.offices.find(x=>x.id==='OFF-LC').holder='P011';
    g.actors.find(x=>x.id==='P016').roles=[...new Set(g.actors.find(x=>x.id==='P016').roles.filter(x=>x!=='御林铁卫成员').concat(['王室近卫指挥者']))];
    const barristan=g.actors.find(x=>x.id==='P011');barristan.roles=['御林铁卫队长'];barristan.actual_authority='恢复白袍护卫、训练与队长职责；其他机构权限须另获任命';barristan.authority_basis='本局实际恢复白袍与队长任命';barristan.limits=['私人信任仍据经历变化','财政与城市行政不附赠'];barristan.last_updated_minute=clock(g);
    const jaimeActor=g.actors.find(x=>x.id==='P015');jaimeActor.roles=jaimeActor.roles.map(x=>x.replace('御林铁卫队长','御林铁卫成员'));jaimeActor.actual_authority='仍占御林铁卫一席，队长已另任；其他行动限制照实际处境';jaimeActor.last_updated_minute=clock(g);
    o.report(g,'ORG-CROWN','七席协调交接已登记；巴利斯坦正式复职，詹姆仍占一席。私人信任不随此结清。',[p.id]);return 'SEVEN_SEATS_COORDINATED';
  }
  if(a.type==='start_audit'){
    o.exact(a,['account_ref','executor']);auditReady(g,a.account_ref,a.executor,o);
    const existing=g.execution.tasks.find(t=>t.kind==='audit'&&t.actor_ref===a.executor&&t.params.target_ref===a.account_ref&&t.status==='blocked'&&['condition','decision'].includes(o.control(g,t).wait));
    if(existing){o.control(g,existing).wait='condition';return 'AUDIT_WAITING_FOR_EXISTING_WORK';}
    o.need(!g.execution.tasks.some(t=>t.kind==='audit'&&t.params.target_ref===a.account_ref&&['sent','accepted','executing'].includes(t.status)),'DUPLICATE_WORK');
    const p=project(g,ctx,'指定账户专题核查',a.executor,'audit',[a.account_ref],60,180,10,o);const t=o.task(g,ctx,'audit',a.executor,{target_ref:a.account_ref,project_ref:p.id});p.policy.step_refs=[t.order_ref];return 'AUDIT_ORDERED';
  }
  if(a.type==='receive_account_document'){
    o.exact(a,['account_ref','evidence_ref']);const account=g.politics.accounts.find(x=>x.id===a.account_ref),e=g.execution.evidence.find(x=>x.id===a.evidence_ref&&x.category==='receipt'&&x.stage_ref===a.account_ref&&x.status==='realized'&&x.at<=clock(g)&&x.source_ref);
    o.need(account&&e,'DOCUMENT_NOT_DELIVERED');o.need(!account.receipt_present,'ALREADY_RECORDED');account.receipt_present=true;account.source_refs.push(e.id);o.report(g,'ORG-TREASURY','签收凭据已实际取得；是否对账一致仍需复核。',[e.id]);return 'DOCUMENT_RECEIVED';
  }
  if(a.type==='recover_funds'){
    o.exact(a,['audit_ref','amount']);const audit=g.politics.audits.find(x=>x.id===a.audit_ref),account=audit&&g.politics.accounts.find(x=>x.id===audit.account_ref);
    o.need(audit&&audit.result==='suspected_difference'&&g.messages.some(m=>m.id===audit.report_ref&&m.recipient==='U001'&&m.status==='已收到'),'REPORT_NOT_RECEIVED');
    o.need(o.amount(a.amount)&&account.held>=a.amount&&accepted(g,account.holder,'funds_delivery',account.id),'RECOVERY_NOT_DELIVERABLE');
    o.need(!g.execution.tasks.some(t=>t.kind==='recovery'&&t.params.target_ref===account.id&&['sent','accepted','executing'].includes(t.status)),'DUPLICATE_WORK');
    o.task(g,ctx,'recovery','P005',{target_ref:account.id,amount:a.amount});return 'RECOVERY_ORDERED';
  }
  if(a.type==='create_bond_issue'){
    o.exact(a,['organization_ref','registrar','goal','rate_bps','period_minutes','maturity_minutes','window_minutes']);
    const org=g.administration.organizations.find(x=>x.entity_ref===a.organization_ref);o.need(org&&org.source_refs[0]!=='T0'&&['P003','P005'].includes(a.registrar),'REGISTRAR_NOT_READY');
    o.need(o.amount(a.goal)&&a.goal<=5000&&Number.isSafeInteger(a.rate_bps)&&a.rate_bps>=0&&a.rate_bps<=1000&&Number.isSafeInteger(a.period_minutes)&&a.period_minutes>=1440&&a.period_minutes<=31*1440&&Number.isSafeInteger(a.maturity_minutes)&&a.maturity_minutes>=a.period_minutes&&a.maturity_minutes%a.period_minutes===0&&a.maturity_minutes<=180*1440&&Number.isSafeInteger(a.window_minutes)&&a.window_minutes>=1440&&a.window_minutes<=28*1440,'INVALID_BOND_TERMS','invalid');
    const pr=project(g,ctx,'有限平价国债试办',a.registrar,'bond_open',[org.entity_ref],60,120,100,o);
    g.politics.issues.push({id:pr.id,organization_ref:org.entity_ref,registrar:a.registrar,goal:a.goal,rate_bps:a.rate_bps,period_minutes:a.period_minutes,maturity_minutes:a.maturity_minutes,window_minutes:a.window_minutes,closes_at:0,status:'preparing',paid:0,fee:100,source_refs:[ctx.id]});return 'BOND_ISSUE_PREPARING';
  }
  if(a.type==='open_bond_issue'){
    o.exact(a,['issue_ref']);const issue=g.politics.issues.find(x=>x.id===a.issue_ref);o.need(issue&&issue.status==='preparing','ISSUE_NOT_READY');openingReady(g,issue,o);
    const t=o.task(g,ctx,'bond_open',issue.registrar,{target_ref:issue.id,project_ref:issue.id});issue.status='ordered';g.projects.find(p=>p.id===issue.id).policy.step_refs=[t.order_ref];return 'ISSUE_OPENING_ORDERED';
  }
  if(a.type==='subscribe_bonds'){
    o.exact(a,['issue_ref','subscriber','amount']);const issue=g.politics.issues.find(x=>x.id===a.issue_ref),d=accepted(g,a.subscriber,'subscribe_bonds',a.issue_ref);
    o.need(issue&&issue.status==='open','ISSUE_CLOSED');openingReady(g,issue,o);o.need(d&&d.terms&&d.terms.amount===a.amount&&d.terms.rate_bps===issue.rate_bps&&d.terms.period_minutes===issue.period_minutes&&d.terms.maturity_minutes===issue.maturity_minutes,'TERMS_NOT_ACCEPTED');
    o.need(o.amount(a.amount)&&g.entities.some(x=>x.id===a.subscriber)&&g.politics.subscriptions.filter(s=>s.issue_ref===issue.id).reduce((n,s)=>n+s.amount,0)+a.amount<=issue.goal,'ISSUE_LIMIT');
    o.need(!g.politics.subscriptions.some(s=>s.decision_ref===d.id),'ALREADY_RECORDED');g.politics.subscriptions.push({id:o.key(g,'SUB'),issue_ref:issue.id,subscriber:a.subscriber,amount:a.amount,paid:0,decision_ref:d.id});return 'SUBSCRIBED_NOT_PAID';
  }
  if(a.type==='receive_bond_payment'){
    o.exact(a,['subscription_ref','receipt_ref']);const sub=g.politics.subscriptions.find(x=>x.id===a.subscription_ref),issue=sub&&g.politics.issues.find(x=>x.id===sub.issue_ref),r=g.politics.receipts.find(x=>x.id===a.receipt_ref);
    o.need(issue&&issue.status==='open','ISSUE_CLOSED');openingReady(g,issue,o);o.need(r&&r.payer===sub.subscriber&&r.target_ref===issue.id&&r.at<=clock(g)&&r.source_refs.length&&!r.used_by,'PAYMENT_NOT_DELIVERED');
    o.need(o.amount(r.amount)&&sub.paid+r.amount<=sub.amount&&issue.paid+r.amount<=issue.goal,'ISSUE_LIMIT');
    o.change(g,ctx,'RES-CASH',r.amount,'债券实际缴款入库',[r.id]);sub.paid+=r.amount;issue.paid+=r.amount;
    const id=o.key(g,'DEBT');g.politics.debts.push({id,issue_ref:issue.id,subscription_ref:sub.id,creditor:sub.subscriber,initial:r.amount,outstanding:r.amount,rate_bps:issue.rate_bps,period_minutes:issue.period_minutes,
      last_accrual:clock(g),interest_numerator:'0',next_interest_at:clock(g)+issue.period_minutes,maturity_at:clock(g)+issue.maturity_minutes,principal_due_created:false,dues:[],source_refs:[r.id,sub.decision_ref]});r.used_by=id;
    o.report(g,issue.registrar,`实收债券款${r.amount}金龙，登记同额本金；尚未缴付的认购仍不可用。`,[r.id,id]);return 'BOND_PAYMENT_RECEIVED';
  }
  if(a.type==='pay_bond_interest'){
    o.exact(a,['obligation_ref']);const debt=g.politics.debts.find(d=>d.dues.some(x=>x.obligation_ref===a.obligation_ref&&x.kind==='interest'&&x.paid===0));const p=g.obligations.find(x=>x.id===a.obligation_ref);
    o.need(debt&&p&&p.due_minute<=clock(g),'INTEREST_NOT_DUE');o.need(!g.execution.tasks.some(t=>t.kind==='bond_interest'&&t.params.obligation_ref===p.id&&['sent','accepted','executing'].includes(t.status)),'DUPLICATE_WORK');
    o.task(g,ctx,'bond_interest','P005',{obligation_ref:p.id,target_ref:debt.id});return 'DEBT_PAYMENT_ORDERED';
  }
  if(a.type==='repay_bond_principal'){
    o.exact(a,['debt_ref','amount']);const debt=g.politics.debts.find(x=>x.id===a.debt_ref);o.need(debt&&o.amount(a.amount)&&a.amount<=debt.outstanding,'INVALID_PRINCIPAL');
    o.need(!g.execution.tasks.some(t=>t.kind==='bond_principal'&&t.params.target_ref===debt.id&&['sent','accepted','executing'].includes(t.status)),'DUPLICATE_WORK');
    o.task(g,ctx,'bond_principal','P005',{target_ref:debt.id,amount:a.amount});return 'PRINCIPAL_PAYMENT_ORDERED';
  }
  if(a.type==='close_bond_issue'){
    o.exact(a,['issue_ref']);const issue=g.politics.issues.find(x=>x.id===a.issue_ref);o.need(issue&&issue.status==='open','ISSUE_CLOSED');issue.status='closed';o.report(g,issue.registrar,'发行关闭；未付认购停止收取，已生效债务及费用继续存在。',[issue.id]);return 'ISSUE_CLOSED';
  }
  return null;
}
export function runPoliticalTask(g,t,ctx,o){
  const p=t.params;
  if(t.phase==='prepare_done'&&politicalWorkers.includes(t.kind)){
    const pr=g.projects.find(x=>x.id===p.project_ref);pr.status='executing';pr.progress='筹备完成，开始执行';pr.policy.milestones[0].status='achieved';pr.policy.milestones[0].evidence_refs=[t.order_ref];t.phase='finish';t.next_at=t.kind==='guard_transfer'?clock(g)+pr.policy.base_execute:officeFinish(clock(g),pr.policy.base_execute);pr.policy.next_check_minute=t.next_at;return true;
  }
  if(t.phase==='start'){
    if(['audit','bond_open'].includes(t.kind)&&officeStart(clock(g))>clock(g)){t.next_at=officeStart(clock(g));t.status='accepted';t.started_at=null;o.order(g,t).status='已接受';return true;}
    if(t.kind==='guard_transfer'){const plan=g.politics.guard_plans.find(x=>x.id===p.target_ref);guardReady(g,plan,o);plan.status='executing';workStarted(g,t,0,60,120,ctx,o);return true;}
    if(t.kind==='audit'){auditReady(g,p.target_ref,t.actor_ref,o);workStarted(g,t,10,60,180,ctx,o);return true;}
    if(t.kind==='bond_open'){const issue=g.politics.issues.find(x=>x.id===p.target_ref);openingReady(g,issue,o);workStarted(g,t,100,60,120,ctx,o);return true;}
    if(t.kind==='recovery'){
      const account=g.politics.accounts.find(x=>x.id===p.target_ref);o.need(account.held>=p.amount&&accepted(g,account.holder,'funds_delivery',account.id),'RECOVERY_NOT_DELIVERABLE');account.held-=p.amount;
      const id=o.key(g,'TR');g.transfers.push({id,resource_id:'RES-CASH',source_pool:account.holder,destination_pool:'RES-CASH',quantity:p.amount,in_transit:p.amount,lost:0,received:0,sent_minute:clock(g),arrival_minute:clock(g)+60,status:'在途',commit_id:ctx.id});account.transfer_ref=id;account.transfer_received=0;t.phase='finish';t.next_at=clock(g)+60;return true;
    }
    if(t.kind==='bond_interest'){
      const d=g.politics.debts.find(d=>d.id===p.target_ref),due=d.dues.find(x=>x.obligation_ref===p.obligation_ref),pay=g.obligations.find(x=>x.id===p.obligation_ref);o.need(!due.paid,'ALREADY_PAID');
      o.spend(g,ctx,pay.amount,null,'新债实付利息',[pay.id,d.id]);due.paid=pay.amount;pay.status='已支付';o.finish(g,t,'本期利息已支付；债务本金没有因此减少。');return true;
    }
    if(t.kind==='bond_principal'){
      const d=g.politics.debts.find(x=>x.id===p.target_ref);o.need(p.amount<=d.outstanding,'INVALID_PRINCIPAL');accrue(d,clock(g));o.spend(g,ctx,p.amount,null,'实还债券本金',[d.id]);d.outstanding-=p.amount;
      for(const due of d.dues.filter(x=>x.kind==='principal')){const paid=Math.min(p.amount,due.amount-due.paid);due.paid+=paid;const obligation=g.obligations.find(x=>x.id===due.obligation_ref);obligation.amount=due.amount-due.paid;if(!obligation.amount)obligation.status='已支付';}
      if(!d.outstanding){const denom=BigInt(d.period_minutes)*10000n;const value=Number((BigInt(d.interest_numerator)+denom/2n)/denom)/10000;if(value)obligation(g,ctx,d,value,'interest',clock(g),o);d.interest_numerator='0';}
      o.finish(g,t,`本金已偿还${p.amount}；未偿本金${d.outstanding}。既有利息义务继续存在。`);return true;
    }
  }
  if(t.phase==='finish'){
    if(t.kind==='guard_transfer'){
      const plan=g.politics.guard_plans.find(x=>x.id===p.target_ref);guardReady(g,plan,o);const f=g.forces.find(x=>x.id==='FORCE01');f.allocations[1].count-=plan.count;
      if(plan.posts==='replace_from_reserve'){f.allocations[4].count-=plan.count;f.allocations[1].count+=plan.count;}
      f.strength.value-=plan.count;f.strength.as_of_minute=clock(g);const id=o.key(g,'FORCE');g.forces.push({id,name:'王室近卫（本局局部编制）',controller:plan.commander,location:'红堡',strength:{value:plan.count,unit:'人',design_range:[plan.count,plan.count],as_of_minute:clock(g),basis:o.basis('来自原金袍子转属',[plan.id])},scale_grade:'局部近卫',readiness:'原训练与装备继续；不因改名变精锐',allocations:[{task:plan.posts==='keep_same_posts'?'原红堡守备岗位':'另行确认的王室近身护卫岗位',count:plan.count,until:'实际新调令'}],food_pool:'RES-FOOD-WATCH',event_refs:['KL05'],basis:o.basis('原队扣减，新队同额；沿既有口粮和工资',[plan.id])});
      for(const pay of g.obligations.filter(x=>['PAY01','PAY06','PAY10'].includes(x.id)&&x.status!=='已支付'))g.politics.payroll_routes.push({id:o.key(g,'ROUTE'),force_ref:id,obligation_ref:pay.id,payer:'RES-CASH',payee:'P016',headcount:plan.count,wage_amount:plan.count*0.02*(pay.id==='PAY10'?13:14),status:'pending',paid_at:null});
      plan.force_ref=id;plan.status='completed';const org=g.administration.organizations.find(x=>x.entity_ref===plan.organization_ref);org.status='operating';for(const ref of org.office_refs){const off=g.offices.find(x=>x.id===ref);if(off.holder==='P016'){off.status='在任';off.limits='仅实际交接近卫与已授职责；白袍身份另处置';}}
      const sandor=g.actors.find(x=>x.id==='P016');sandor.actual_authority='指挥本局实际转属的近卫；白袍离任另行协调，不能调动其余金袍子';if(!sandor.roles.includes('王室近卫指挥者'))sandor.roles.push('王室近卫指挥者');sandor.limits=['不自动忠诚于国王','白袍离任及职责冲突需另行处理'];sandor.last_updated_minute=clock(g);
      completeProject(g,t);o.finish(g,t,`局部转属${plan.count}人完成：金袍子${f.strength.value}，近卫${plan.count}。沿原供饷分账，七席未变。`);o.report(g,'P020','已完成本局限定守卫转属，王室住区权限与其他部队不在此交接内。',[plan.id],'P001',180);return true;
    }
    if(t.kind==='audit'){
      auditReady(g,p.target_ref,t.actor_ref,o);
      const a=g.politics.accounts.find(x=>x.id===p.target_ref);let result=a.receipt_present?'balanced':'missing_information';
      const waiting=o.control(g,t);
      if(!a.receipt_present){
       if(!waiting.request_ref){
        const inquiry=o.task(g,ctx,'request_document',a.holder,{target_ref:a.id,source:t.id},15,t.actor_ref);
        waiting.request_ref='account:'+a.id;waiting.request_scope={order_ref:inquiry.order_ref,issuer:t.actor_ref,authority_refs:g.authorities.filter(x=>x.subject===t.actor_ref&&x.object_ref===a.id&&x.status==='active').map(x=>x.id)};
       }
       o.waitTask(g,t,'MISSING_DOCUMENT',o);const pr=g.projects.find(x=>x.id===p.project_ref);pr.progress='核查已发现凭据缺失；执行者已向经手人补件，尚未完成。';
       if(!g.politics.audits.some(x=>x.project_ref===p.project_ref&&x.result==='missing_information'))g.politics.audits.push({id:o.key(g,'AUDIT'),account_ref:a.id,project_ref:p.project_ref,result,at:clock(g),report_ref:o.order(g,t).report_message_id,source_refs:[t.order_ref,...a.source_refs]});
       return true;
      }
      if(a.receipt_present&&a.received<a.expected)result=a.transfer_ref&&g.transfers.find(x=>x.id===a.transfer_ref)?.in_transit?'delayed':'suspected_difference';
      const id=o.key(g,'AUDIT'),text=`指定账户${a.id}核查：应收${a.expected}、已收${a.received}；${{balanced:'凭据与总账一致',missing_information:'缺签收凭据，不能据此认定侵吞',delayed:'实际资金仍在途，延期历史保留',suspected_difference:'存在可追查差额，责任及追讨另行处理'}[result]}。`;
      completeProject(g,t);o.finish(g,t,text);g.politics.audits.push({id,account_ref:a.id,project_ref:p.project_ref,result,at:clock(g),report_ref:o.order(g,t).report_message_id,source_refs:[t.order_ref,...a.source_refs]});o.report(g,t.actor_ref,text,[id],t.actor_ref,0);return true;
    }
    if(t.kind==='recovery'){o.finish(g,t,'有来源的追回资金已交付入库；不是因调查完成额外发钱。');return true;}
    if(t.kind==='bond_open'){const issue=g.politics.issues.find(x=>x.id===p.target_ref);openingReady(g,issue,o);issue.status='open';issue.closes_at=clock(g)+issue.window_minutes;completeProject(g,t);o.finish(g,t,'有限发行登记工作就绪；目标与认购均不是国库现金。');return true;}
  }
  return false;
}
export function politicalView(g){
  const received=id=>g.messages.some(m=>m.id===id&&m.recipient==='U001'&&m.status==='已收到');
  return {guard_plans:g.politics.guard_plans.map(p=>({id:p.id,organization_ref:p.organization_ref,count:p.count,posts:p.posts,status:p.order_ref&&!received(g.orders.find(x=>x.id===p.order_ref).report_message_id)?'awaiting_report':p.status})),
    audit_targets:[...new Map(g.authorities.filter(a=>a.issuer==='U001'&&a.scope.actions.includes('audit_account')).map(a=>[a.object_ref+':'+a.subject,{id:a.object_ref,executor:a.subject}])).values()],
    audits:g.politics.audits.filter(a=>received(a.report_ref)).map(a=>({id:a.id,account_ref:a.account_ref,result:a.result})),
    issues:g.politics.issues.map(i=>{const step=g.projects.find(p=>p.id===i.id)?.policy?.step_refs[0]||i.source_refs.find(ref=>g.orders.some(o=>o.id===ref)),order=step&&g.orders.find(o=>o.id===step);return {id:i.id,goal:i.goal,paid:i.paid,registrar:i.registrar,status:order&&!received(order.report_message_id)?'awaiting_report':i.status};}),
    debts:g.politics.debts.map(d=>({id:d.id,outstanding:d.outstanding,dues:d.dues.map(x=>({...x}))}))};
}
