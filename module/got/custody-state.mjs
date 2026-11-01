import {places} from './opening-content.mjs';
// One authority for local custody. Knowledge is still delivered through observations/messages.
export const custodyRows=g=>g.execution?.arrests||[];
export const custodyOf=(g,id)=>custodyRows(g).find(r=>r.target===id&&['escorting','held'].includes(r.status));
export const absentActor=(g,id)=>!!custodyOf(g,id)||custodyRows(g).some(r=>r.target===id&&r.status==='escaped');
export const custodyDuty=(g,id)=>custodyRows(g).some(r=>r.custodian===id&&['escorting','held'].includes(r.status));
export const custodyUnavailable=(g,id)=>absentActor(g,id)||custodyDuty(g,id);
export const localActor=a=>!!a&&a.life==='存活'&&(/红堡|君临|炼金术士会馆/.test(a.location)||Object.values(places).includes(a.location))&&!/途中|隐匿|行踪未明/.test(a.location);
export function arrestTarget(g,id){const r=custodyRows(g).find(r=>r.id===id);return r?{ref:r.id,kind:'arrest_order',target:r.target,executor:r.executor,force:r.force,group:r.group,count:r.count,area:r.area,reason:r.reason,secrecy:r.secrecy}:null;}
export function custodyErrors(g){
 const errors=[],seen=new Set();
 if(new Set(custodyRows(g).map(r=>r.id)).size!==custodyRows(g).length)errors.push('duplicate arrest id');
 for(const r of custodyRows(g)){
  if(r.escape_roll>99)errors.push('invalid arrest roll');
  if(!g.actors.some(a=>a.id===r.target)||!g.actors.some(a=>a.id===r.executor)||!g.execution.tasks.some(t=>t.id===r.task_ref&&t.params.target_ref===r.id))errors.push('custody missing actor/task');
  if(['escorting','held'].includes(r.status)){
   if(seen.has(r.target))errors.push('duplicate active custody');seen.add(r.target);
   if(!r.custodian||g.actors.find(a=>a.id===r.target)?.location!==r.place)errors.push('custody location or keeper mismatch');
   if(r.assignment_ref&&!g.assignments.some(a=>a.id===r.assignment_ref&&a.status==='active'))errors.push('custody lost assigned guards');
  }
 }
 return errors;
}
// A clerk may present only a document actually delivered before this meeting.
export function custodyClerkReport(g,presenters,who){
 if(!presenters?.some(id=>absentActor(g,id)))return null;
 const documents=g.messages.filter(m=>presenters.includes(m.sender)&&m.recipient==='U001'&&m.status==='已收到');
 return '负责呈报的人未到场。'+(documents.length?'书记代呈此前实际收到的卷宗（不是本人当前发言）：\n'+documents.slice(-3).map(m=>m.content).join('\n'):'书记没有收到可供代呈的卷宗，不能代述其现况或私人意见。');
}
