// Project-owned checkpoints; council entries are sourced snapshots, not a second ledger.
import {isReform,DAY} from './reform-contract.mjs';
const now=g=>g.clock.elapsed_minutes;
const rows=g=>g.projects.filter(isReform);
const signature=c=>JSON.stringify(c);
export function initializeReviews(p){
 const old=p.policy.reviews||[];
 p.policy.reviews=(p.policy.plan.checkpoints||[]).map(c=>old.find(r=>r.id===c.id&&r.signature===signature(c))||{id:c.id,signature:signature(c),resolved:null,due_at:null,heard:[]});
}
export function reviewDue(g,c){return g.opening?.meetings.find(m=>m.type==='regular'&&m.week===c.week&&!m.missed)?.scheduled??(c.week-1)*7*DAY+180;}
export function dueReviews(g,p){return (p.policy.plan.checkpoints||[]).filter(c=>(p.policy.reviews?.find(r=>r.id===c.id)?.due_at??reviewDue(g,c))<=now(g)&&!p.policy.reviews?.find(r=>r.id===c.id)?.resolved);}
export function settleReviewDates(g){for(const p of rows(g)){initializeReviews(p);for(const c of p.policy.plan.checkpoints||[]){const r=p.policy.reviews.find(r=>r.id===c.id);if(r.due_at===null&&reviewDue(g,c)<=now(g))r.due_at=reviewDue(g,c);}}}
export function reviewHold(g,p,spec){
 const affected=new Set(dueReviews(g,p).filter(c=>c.mode==='decision').flatMap(c=>c.steps));
 const blocked=id=>affected.has(id)||p.policy.plan.steps.find(s=>s.id===id).depends_on.some(blocked);
 return blocked(spec.id)&&p.policy.steps.find(s=>s.id===spec.id)?.phase!=='done';
}
export function reviewNext(g,next){for(const p of rows(g).filter(p=>!['completed','cancelled'].includes(p.status)))for(const c of p.policy.plan.checkpoints||[]){const at=reviewDue(g,c);if(at>now(g)&&!p.policy.reviews?.find(r=>r.id===c.id)?.resolved)next=Math.min(next,at);}return next;}
export function reviewProblems(p,c){return p.policy.steps.filter(s=>c.steps.includes(s.id)&&s.phase!=='done'&&(s.reason||['decision','unmapped'].includes(s.phase))).map(s=>s.reason||s.phase);}
export function reformPending(g,p){
 if(p.status==='cancelled')return [];
 const r=p.policy,out=dueReviews(g,p).filter(c=>c.mode==='decision'||reviewProblems(p,c).length).map(c=>({id:c.id,title:c.title,reason:c.checks+'；'+(reviewProblems(p,c).join('；')||'按原合同等待国王决定是否继续'),checkpoint:true,urgent:c.urgent}));
 for(const s of r.steps.filter(s=>s.phase==='decision'))out.push({id:'step:'+s.id,title:r.plan.steps.find(x=>x.id===s.id).title,reason:s.reason,checkpoint:false,urgent:false});
 if(r.timing.exceeds_window&&!r.window_approved)out.push({id:'delay',title:'超出初效目标的工期',reason:'需要明确接受延期或修改剩余工作',checkpoint:false,urgent:false});
 return out;
}
export function ownerKnows(g,p){const t=g.execution.tasks.find(t=>t.id===p.policy.task_ref),o=g.orders.find(o=>o.id===t?.order_ref);return o?.delivered_minute!==null&&o?.delivered_minute<=now(g);}
const phase={pending:'待开始',prepare:'正在筹备',execute:'正在执行',mature:'正在核验初效',done:'已经交付',decision:'等待决定',unmapped:'结算能力待补充'};
export function reformBrief(g,p){
 const r=p.policy,check=dueReviews(g,p),next=(r.plan.checkpoints||[]).filter(c=>reviewDue(g,c)>now(g)&&!r.reviews?.find(x=>x.id===c.id)?.resolved).sort((a,b)=>a.week-b.week)[0];
 return `${p.id}「${p.name}」第${r.plan_revision}版，截至第${Math.floor(now(g)/DAY)+1}日：${p.status==='cancelled'?'已撤回':r.paused?'已暂停':r.preparation_left>0?'正在共同准备':r.steps.map(s=>r.plan.steps.find(x=>x.id===s.id).title+'：'+phase[s.phase]+(s.reason?'，'+s.reason:'')).join('；')}。实际支出${r.spent}／批准上限${r.plan.budget}金龙；已交付${r.effects.length}项。${r.log.at(-1)?.kind==='revised'?'剩余工作按当前修订合同办理。':r.log.at(-1)?.text||'命令已交办，等待实际接受与执行。'}${check.length?' 本周检查：'+check.map(c=>c.title+'（'+c.checks+'）'+(reviewProblems(p,c).length?'：'+reviewProblems(p,c).join('；'):c.mode==='decision'?'：原合同约定须明确决定':'：目前未记录需追加授权的问题')).join('；'):''}${next?' 下次预定检查：第'+next.week+'周「'+next.title+'」。':''}`;
}
export const reformIssueId=p=>'reform-report:'+p.id;
export function reformMeetingIssue(g,id){const p=rows(g).find(p=>reformIssueId(p)===id);return p?{id,title:p.name+' · 改革汇报',question:'核对实际进度、约定检查点及需要明确决定的事项',presenter:p.responsible,presenters:[p.responsible],category:p.policy.plan.domain==='military'?'军事':'财政／行政',choices:[],reform_ref:p.id}:null;}
export function attachReformAgenda(g,m){
 for(const p of rows(g)){
  if(['completed','cancelled'].includes(p.status)&&(p.status==='cancelled'||!(p.policy.plan.checkpoints||[]).some(c=>!p.policy.reviews?.find(r=>r.id===c.id)?.resolved))&&g.opening.meetings.some(x=>x.status==='closed'&&x.session?.agenda.some(q=>q.reform_ref===p.id&&q.report_snapshot?.terminal===p.status&&q.report_snapshot?.revision===p.policy.plan_revision)))continue;
  const id=reformIssueId(p);m.issues[id]??={status:'pending',reported:false,choice:null,decision_ref:null,order_refs:[]};
 }
}
export function meetingReformReport(g,m,q,listeners){
 const p=rows(g).find(p=>p.id===q.reform_ref),present=listeners.includes(p.responsible)&&ownerKnows(g,p);
 const received=g.messages.filter(x=>x.recipient==='U001'&&x.status==='已收到'&&x.basis?.refs.includes(p.id));
 const report=present?reformBrief(g,p):received.at(-1)?.content||'尚无已送达的负责人报告；不能代报当前执行情况。';
 q.report_snapshot={current:present,revision:p.policy.plan_revision,at:now(g),source:present?p.policy.task_ref:received.at(-1)?.id||null,terminal:present?p.status:null,checks:present?dueReviews(g,p).map(c=>c.id):[]};
 q.report_only=!reformPending(g,p).length;
 // Absence never exposes current internal work: only already delivered pending facts may be discussed.
 // The approved due node remains on the agenda even without a fresh report; no hidden details are supplied.
 return (present?'负责人呈报：':'书记宣读已收到记录（负责人未在场，不代表当前最新情况）：')+report;
}
export function acknowledgeReformReport(g,m,q){
 const p=rows(g).find(p=>p.id===q.reform_ref);if(!p||!q.report_snapshot)return;
 initializeReviews(p);
 for(const id of q.report_snapshot.checks){const c=p.policy.plan.checkpoints.find(c=>c.id===id),r=p.policy.reviews.find(r=>r.id===id);if(!r||q.report_snapshot.revision!==p.policy.plan_revision)continue;if(!r.heard.includes(m.id))r.heard.push(m.id);if(c.mode==='review'&&!reviewProblems(p,c).length)r.resolved=m.id;}
}
export function reviewKnowledge(g,p){return (p.policy.plan.checkpoints||[]).map(c=>`${c.id} 第${c.week}周 ${c.title}：${c.checks}；${p.policy.reviews?.find(r=>r.id===c.id)?.resolved?'已处理':dueReviews(g,p).some(x=>x.id===c.id)?'已到检查时间':'尚未到期'}；${c.mode==='decision'?'须明确决定，涉及 '+c.steps.join('、'):'正常检查不暂停工作'}${c.urgent?'，需决定时可传达求见':''}`).join('\n');}
export function reviewErrors(p,g){
 const r=p.policy.reviews;if(r===undefined)return [];
 const specs=p.policy.plan.checkpoints||[];
 return Array.isArray(r)&&r.length===specs.length&&new Set(r.map(x=>x.id)).size===r.length&&r.every(x=>specs.some(c=>c.id===x.id&&signature(c)===x.signature)&&(x.resolved===null||typeof x.resolved==='string')&&(x.due_at===null||Number.isSafeInteger(x.due_at)&&x.due_at<=now(g))&&Array.isArray(x.heard)&&x.heard.every(y=>typeof y==='string')&&new Set(x.heard).size===x.heard.length)?[]:['改革检查点状态不完整。'];
}
