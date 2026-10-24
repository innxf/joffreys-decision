// Read-only projection. These records remain owned by dialogue, meetings and messages.
export function chronicleRows(g,turns=g.dialogue?.turns||[]){
 const rows=[],seen=new Set();
 const add=row=>{if(!row.text||seen.has(row.id))return;seen.add(row.id);rows.push(row);};
 for(const t of turns)if(t?.audience?.includes('U001'))add({id:'turn:'+t.id,type:'对白',at:t.at,source:t.id,text:[t.input&&'乔弗里：'+t.input,t.prose].filter(Boolean).join('\n\n')});
 for(const o of g.dialogue?.observations||[])if(o.actors?.includes('U001')){
  const minutes=(g.opening?.meetings||[]).find(m=>o.source===m.id+':minutes');
  if(minutes&&minutes.status!=='closed')continue;
  add({id:'observation:'+(o.id||o.source+':'+o.at+':'+o.content),type:minutes?'会议':'事件',at:o.at,source:o.source,text:o.content});
 }
 for(const m of g.opening?.meetings||[])if(m.status==='closed'&&!rows.some(r=>r.source===m.id+':minutes')){
  const at=g.activities?.find(a=>a.id===m.activity)?.ended_at??m.session?.started??m.scheduled;
  add({id:'meeting:'+m.id,type:'会议',at,source:m.id,text:(m.minutes||[]).map(x=>[x.title,x.choice].filter(Boolean).join('：')).join('\n')});
 }
 for(const m of g.messages||[])if(m.recipient==='U001'&&m.status==='已收到')add({id:'message:'+m.id,type:'回报',at:m.delivered_minute??m.received_at??m.delivered_at??m.deliver_at??m.due_at??0,source:m.id,text:m.content});
 for(const [i,h]of (g.finale?.progress?.history||[]).entries())add({id:'finale:'+i,type:'终章',at:g.clock.elapsed_minutes,source:h.scene,viewpoint:h.viewpoint,text:[h.title,...(h.paragraphs||[]),h.choice].filter(Boolean).join('\n\n')});
 rows.sort((a,b)=>(a.at??0)-(b.at??0));
 for(const row of rows)row.related=rows.filter(other=>row.source&&other.source===row.source&&other.id!==row.id).map(other=>other.id);
 return rows;
}
export async function loadChronicle(runtime,storage,namespace=''){
 const g=runtime.read(),state=g.revision.state_id,branch=g.revision.branch_id,turns=[];
 for(let offset=0;;offset+=50){
  const page=await storage.readGotDialoguePage(namespace,offset,50);turns.push(...page.turns);
  if(offset+50>=page.total)break;
 }
 const current=runtime.read();if(current.revision.state_id!==state||current.revision.branch_id!==branch)throw Error('进度已经改变，请重新打开纪事。');
 return chronicleRows(g,turns);
}
