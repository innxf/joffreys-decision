// Legacy event contracts already own their crews while executing; derive that
// occupancy alongside reservations without migrating or restarting saved work.
export function availableLabor(g){
 const total=g.resources.find(r=>r.id==='RES-LABOR')?.quantity.value||0;
 const reserved=g.reservations.filter(r=>r.resource_id==='RES-LABOR'&&['有效','部分使用'].includes(r.status)).reduce((n,r)=>n+r.amount,0);
 const events=(g.execution?.tasks||[]).filter(t=>t.kind==='event_work'&&t.phase==='finish'&&['executing','blocked'].includes(t.status)).reduce((n,t)=>n+(g.campaign?.history.find(h=>h.task_ref===t.id&&h.choice==='work-issued')?.contract.labor||0),0);
 return Math.max(0,total-reserved-events);
}
