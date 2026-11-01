// Runtime additions to the unchanged author baseline 1.1.0.
const s={type:'string'}, n={type:'number',minimum:0}, i={type:'integer',minimum:0}, b={type:'boolean'};
const list=items=>({type:'array',items});
export const record=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const refs=list(s);
const choice=(...values)=>({type:'string',enum:values});
const authority=record({id:s,issuer:s,subject:s,relation:s,object_ref:s,scope:record({actions:refs,max_count:i,group_id:s,location:s}),
  starts_at:i,expires_at:i,status:choice('active','revoked','expired'),source_refs:refs,delivery_refs:refs});
const assignment=record({id:s,order_ref:s,force_ref:s,group_index:i,count:i,task_commander:s,location:s,
  status:choice('handover','active','returning','returned','cancelled'),start_at:i,end_at:i,return_at:i,authority_ref:s,acceptance_ref:s});
const params=record({obligation_ref:s,source:s,destination:s,amount:n,count:i,duration:i,target_ref:s,
  authority_ref:s,acceptance_ref:s,commander:s,end_at:i,project_ref:s,operation:s,cost:n,reservation:s,plan_ref:s,training_days:i,preparation_left:i,recruits_delivered:i,supply_items:list(record({resource_id:s,amount:n})),audit_window:record({from:i,to:i,settlement_refs:refs})},[]);
export const executionSchemas={
  administration:record({organizations:list(record({entity_ref:s,status:choice('preparing','operating'),responsibilities:refs,office_refs:refs,parent_ref:s,source_refs:refs}))}),
  authorities:list(authority),assignments:list(assignment),
  activities:list(record({id:s,kind:choice('short_visit','private_talk','council','meal','documents'),participants:refs,location:s,nodes:list(i),node:i,remaining:i,status:choice('active','ended'),started_at:i,ended_at:{type:['integer','null']}})),
  execution:record({
    tasks:list(record({id:s,order_ref:s,kind:choice('arrest','release_prisoner','reform','event_work','tunnel_inspect','campaign_work','opening_work','review_plan','request_document','inspect_payment','payment','project','cancel','night_patrol','transfer','temporary_detail','notify_authority','guard_transfer','audit','recovery','bond_open','bond_interest','bond_principal'),actor_ref:s,params,
      status:choice('sent','accepted','executing','completed','cancelled','blocked'),phase:choice('delivery','start','finish','prepare_done','handover','return_start','return'),next_at:i,started_at:{type:['integer','null']},assignment_ref:s})),
    inspections:list(record({id:s,target_ref:s,order_ref:s,at:i,result:s})),
    decisions:list(record({id:s,actor:s,kind:s,target_ref:s,status:s,source_refs:refs,at:i,terms:record({amount:n,rate_bps:i,period_minutes:i,maturity_minutes:i})},['id','actor','kind','target_ref','status','source_refs','at'])),
    obstacles:list(record({id:s,target_ref:s,reason:s,active:b})),
    alerts:refs,shortages:list(record({resource_ref:s,unmet:n,updated_at:i})),
    opportunity_extensions:list(record({opportunity_ref:s,until:i,evidence_ref:s})),
    evidence:list(record({id:s,category:s,status:s,at:i,source_ref:s,stage_ref:s})),
    serial:i
  })
};
executionSchemas.execution.properties.audience_requests=list(record({id:s,actor:s,place:choice('R09','R22','R10'),source_ref:s,project_ref:s,node_ref:s,revision:i,created_at:i,status:choice('pending','notified','deferred','met','resolved','expired'),message_ref:{type:['string','null']},notified_ref:{type:['string','null']}}));
executionSchemas.execution.properties.arrests=list(record({id:s,target:s,executor:s,force:s,group:i,count:i,area:choice('red_keep','city'),secrecy:choice('secret','public'),reason:s,status:choice('ordered','judgment','searching','escorting','held','released','refused','failed','escaped','unreachable','cancelled'),task_ref:s,custodian:s,place:s,assignment_ref:s,report_ref:s,ordered_at:i,updated_at:i,direct:b,escape_roll:i,last_location:s,release_task:s}));
export const politicsSchema=record({
  guard_plans:list(record({id:s,organization_ref:s,count:i,commander:s,posts:choice('keep_same_posts','replace_from_reserve'),status:s,order_ref:s,force_ref:s,source_refs:refs})),
  payroll_routes:list(record({id:s,force_ref:s,obligation_ref:s,payer:s,payee:s,headcount:i,wage_amount:n,status:s,paid_at:{type:['integer','null']}})),
  accounts:list(record({id:s,expected:n,received:n,held:n,holder:s,receipt_present:b,transfer_ref:s,transfer_received:n,source_refs:refs})),
  audits:list(record({id:s,account_ref:s,project_ref:s,result:choice('balanced','missing_information','delayed','suspected_difference'),at:i,report_ref:s,source_refs:refs})),
  issues:list(record({id:s,organization_ref:s,registrar:s,goal:n,rate_bps:i,period_minutes:i,maturity_minutes:i,window_minutes:i,closes_at:i,status:choice('preparing','ordered','open','closed','cancelled','blocked'),paid:n,fee:n,source_refs:refs})),
  subscriptions:list(record({id:s,issue_ref:s,subscriber:s,amount:n,paid:n,decision_ref:s})),
  receipts:list(record({id:s,payer:s,target_ref:s,amount:n,at:i,source_refs:refs,used_by:s})),
  debts:list(record({id:s,issue_ref:s,subscription_ref:s,creditor:s,initial:n,outstanding:n,rate_bps:i,period_minutes:i,last_accrual:i,interest_numerator:{type:'string',pattern:'^[0-9]+$'},next_interest_at:i,maturity_at:i,principal_due_created:b,
    dues:list(record({obligation_ref:s,kind:choice('interest','principal'),amount:n,paid:n})),source_refs:refs}))
});
export const policySchema=record({template:s,plan_revision:i,target_refs:refs,step_refs:refs,dependency_edges:list(refs),
  decision_refs:refs,authority_refs:refs,milestones:list(record({id:s,status:s,evidence_refs:refs})),
  era_ref:s,era_class:s,base_prepare:i,base_execute:i,additional_prepare:i,additional_execute:i,
  closure_obligations:refs,next_check_minute:{type:['integer','null']}});

export function worldInvariantErrors(g){
  const out=[];
  for(const field of Object.keys(executionSchemas))if(!g[field])out.push(`${field}: missing execution data`);
  if(!g.execution||!g.assignments||!g.activities)return out;
  const allIds=new Set(g.entities.map(e=>e.id));
  const clock=g.clock.elapsed_minutes;
  for(const records of [g.authorities,g.assignments,g.activities,g.execution.tasks,g.execution.inspections,g.execution.decisions,g.execution.evidence]){
    if(new Set(records.map(x=>x.id)).size!==records.length)out.push('duplicate execution id');
  }
  for(const c of g.consumption)if(c.last_settled_minute>clock||!Number.isInteger(c.rate_per_day))out.push('unsupported consumption rate or future settlement');
  for(const a of g.activities){
    if(!a.nodes.length||a.nodes.some(n=>n<=0)||a.node>a.nodes.length||a.remaining>(a.nodes[a.node]??0)||a.participants.some(p=>!g.actors.some(x=>x.id===p)))out.push('invalid activity node or actor');
  }
  for(const e of g.execution.opportunity_extensions){
    if(!g.opportunities.some(o=>o.id===e.opportunity_ref)||!g.execution.decisions.some(d=>d.id===e.evidence_ref&&d.kind==='meeting_accepted'&&d.actor==='P011'&&d.status==='accepted'&&d.at<=clock&&d.source_refs.length))out.push('unproven opportunity extension');
  }
  for(const a of g.authorities){
    if(!allIds.has(a.issuer)||!allIds.has(a.subject))out.push('authority actor missing');
    if(a.expires_at<a.starts_at)out.push('authority interval');
  }
  for(const f of g.forces){
    if(f.strength.value!==null&&f.allocations.every(a=>a.count!==null)&&f.allocations.reduce((n,a)=>n+a.count,0)!==f.strength.value)out.push('force allocation conservation');
    f.allocations.forEach((allocation,index)=>{
      const used=g.assignments.filter(a=>a.force_ref===f.id&&a.group_index===index&&!['returned','cancelled'].includes(a.status)).reduce((n,a)=>n+a.count,0);
      if(used>allocation.count)out.push(`${f.id}: double allocation`);
    });
  }
  for(const t of g.transfers){
    if(Math.abs(t.quantity-t.in_transit-t.lost-t.received)>0.000001)out.push(`${t.id}: transfer conservation`);
    if(!g.resources.some(r=>r.id===t.destination_pool))out.push(`${t.id}: destination missing`);
  }
  const busy=new Set();
  for(const a of g.activities.filter(a=>a.status==='active'))for(const p of a.participants){if(busy.has(p))out.push('actor double activity');busy.add(p);}
  for(const t of g.execution.tasks.filter(t=>t.status==='executing'&&['event_work','opening_work','inspect_payment','project','request_document','tunnel_inspect'].includes(t.kind))){if(busy.has(t.actor_ref))out.push('actor double task');busy.add(t.actor_ref);}
  for(const a of g.assignments)if(!g.forces.some(f=>f.id===a.force_ref&&f.allocations[a.group_index]))out.push('assignment origin missing');
  for(const t of g.execution.tasks)if(!g.orders.some(o=>o.id===t.order_ref))out.push('task order missing');
  for(const p of g.projects.filter(p=>p.policy)){
    const s=p.policy;if(s.template==='general_reform')continue;
    const rules={records_inventory:['REF03',30,90],guard_transfer:['REF02',60,120],audit:['REF03',60,180],bond_open:['REF06',60,120]},r=rules[s.template];
    if(!r||s.era_ref!==r[0]||s.era_class!=='E0'||s.base_prepare!==r[1]||s.base_execute!==r[2]||s.additional_prepare!==0||s.additional_execute!==0)out.push('unsupported or modified project rule');
  }
  if(g.politics){
    for(const rows of Object.values(g.politics))if(new Set(rows.map(x=>x.id)).size!==rows.length)out.push('duplicate political record');
    for(const f of g.forces.filter(x=>x.id==='FORCE01'))for(const index of [1,4]){
      const pending=g.politics.guard_plans.filter(p=>p.status==='executing'&&(index===1||p.posts==='replace_from_reserve')).reduce((n,p)=>n+p.count,0);
      const used=g.assignments.filter(a=>a.force_ref===f.id&&a.group_index===index&&!['returned','cancelled'].includes(a.status)).reduce((n,a)=>n+a.count,0);
      if(pending+used>f.allocations[index].count)out.push('pending handover double allocation');
    }
    for(const t of g.execution.tasks.filter(t=>t.status==='executing'&&['guard_transfer','audit','bond_open'].includes(t.kind))){if(busy.has(t.actor_ref))out.push('actor double political task');busy.add(t.actor_ref);}
    for(const issue of g.politics.issues){const subs=g.politics.subscriptions.filter(s=>s.issue_ref===issue.id);const principal=g.politics.debts.filter(d=>d.issue_ref===issue.id).reduce((n,d)=>n+d.initial,0);if(Math.abs(subs.reduce((n,s)=>n+s.paid,0)-issue.paid)>0.000001||Math.abs(principal-issue.paid)>0.000001||issue.paid>issue.goal||!issue.period_minutes||!issue.maturity_minutes)out.push('bond issue conservation');}
    for(const s of g.politics.subscriptions)if(s.paid>s.amount||!g.politics.issues.some(i=>i.id===s.issue_ref))out.push('subscription conservation');
    for(const d of g.politics.debts){
      if(d.outstanding>d.initial||!d.period_minutes||!g.politics.subscriptions.some(s=>s.id===d.subscription_ref)||d.dues.some(x=>x.paid>x.amount||!g.obligations.some(p=>p.id===x.obligation_ref)))out.push('debt conservation');
    }
    for(const r of g.politics.payroll_routes)if(!g.forces.some(f=>f.id===r.force_ref)||!g.obligations.some(p=>p.id===r.obligation_ref))out.push('payroll reference missing');
    for(const a of g.politics.accounts){const tr=g.transfers.find(t=>t.id===a.transfer_ref);if(a.received+a.held+(tr?.in_transit||0)>a.expected+0.000001||a.transfer_received>(tr?.received||0)||!allIds.has(a.holder))out.push('account flow conservation');}
    for(const r of g.politics.receipts)if(r.used_by&&!g.politics.debts.some(d=>d.id===r.used_by&&d.initial===r.amount&&d.creditor===r.payer))out.push('receipt debt reference mismatch');
    if(new Set(g.politics.subscriptions.map(s=>s.decision_ref)).size!==g.politics.subscriptions.length)out.push('duplicate subscription decision');
  }
  return out;
}

