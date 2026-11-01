import {absentActor} from './custody-state.mjs';
import {availableLabor} from './labor-capacity.mjs';
import '../special-event.js';
// Finite authored work uses the original order queue, reservations and reports.
// A model cannot submit a definition or an arbitrary world-field patch here.
import {eventCardData} from './event-cards-data.mjs';
const now=g=>g.clock.elapsed_minutes;
export const eventFact=(g,tag)=>g.execution.evidence.some(e=>e.category==='event:'+tag&&e.status==='realized');
export function cardCondition(g,key){
 const [kind,...parts]=key.split(':'),value=parts.join(':');
 if(kind==='any')return value.split('|').some(k=>cardCondition(g,k));
 if(kind==='not')return !cardCondition(g,value);
 if(kind==='operation')return g.campaign.completed.some(x=>x.operation===value);
 if(kind==='fact')return eventFact(g,value);
 if(kind==='alive')return g.actors.some(a=>a.id===value&&a.life==='存活');
 if(kind==='local')return g.actors.some(a=>a.id===value&&a.life==='存活'&&/红堡|君临|伊耿高丘|维桑尼亚丘|河门|西侧市街|雷妮丝丘|跳蚤窝/.test(a.location)&&!/途中|已离开/.test(a.location));
 if(kind==='event')return g.campaign.events.includes(value);
 if(kind==='scene')return g.campaign.private_done.includes(value);
 if(kind==='appointment')return g.opening.appointments.some(a=>a.source===value&&a.status==='arrived'&&a.arrive<=now(g)&&now(g)<=a.arrive+90);
 if(kind==='report')return g.messages.some(m=>m.recipient==='U001'&&m.status==='已收到'&&m.content.includes(value));
 if(kind==='food')return globalThis.specialEventCore.compare(g.resources.find(r=>r.id===value)?.quantity.value,{min:Number.MIN_VALUE});
 if(kind==='received')return g.execution.tasks.some(t=>t.params.source?.startsWith(value)&&t.status==='completed'&&g.messages.some(m=>m.id===g.orders.find(o=>o.id===t.order_ref)?.report_message_id&&m.status==='已收到'));
 if(kind==='guard')return g.politics.guard_plans.some(p=>p.status==='completed');
 if(kind==='tunnel')return !!g.opening.navigation.tunnel&&g.messages.some(m=>m.id===g.opening.navigation.tunnel.report&&m.status==='已收到');
 if(kind==='married')return g.commitments.some(c=>c.kind==='婚约'&&c.parties.includes(value)&&c.status==='有效');
 if(kind==='protected')return !!g.campaign.marriage_protected;
 if(kind==='north')return globalThis.specialEventCore.compare(g.campaign.north,{equals:value});
 if(kind==='battle')return globalThis.specialEventCore.compare(g.campaign.battle?.result,{equals:value});
 if(kind==='cash')return g.resources.find(r=>r.id==='RES-CASH').quantity.value-g.reservations.filter(r=>r.resource_id==='RES-CASH'&&['有效','部分使用'].includes(r.status)).reduce((n,r)=>n+r.amount,0)>=Number(value);
 if(kind==='day-before')return now(g)<Number(value)*1440;
 if(kind==='authority')return g.authorities.some(a=>a.subject==='U001'&&a.status==='active'&&a.starts_at<=now(g)&&a.expires_at>now(g)&&a.delivery_refs.length&&a.scope.actions.includes(value));
 if(kind==='resource'){const [id,n]=value.split('/');return globalThis.specialEventCore.compare(g.resources.find(r=>r.id===id)?.quantity.value,{min:Number(n)});}
 if(kind==='attitude'){const [id,states]=value.split('/');return states.split('|').includes(g.dialogue?.agendas?.[id]?.character?.attitude||({P012:g.campaign.sansa,P060:g.campaign.tommen}[id]));}
 throw Error('Unknown event condition: '+key);
}
export const conditionsMet=(g,keys=[])=>globalThis.specialEventCore.matches(keys,k=>cardCondition(g,k));
function note(g,c,choice,text,extra={}){g.campaign.history.push({scene:c.id,choice,text,at:now(g),...extra});}
export function issueEventWork(g,c,choice,ctx,o){
 const b=c.bindings[choice];o.need(b&&b.kind==='work','没有登记这项有限工作。');
 const prior=g.campaign.history.find(h=>h.scene===c.id&&h.choice==='work-issued'&&h.option===choice);
 if(prior)return prior.order_ref;
 o.need(conditionsMet(g,b.requires),'办理条件已经改变，请重新选择本项处置。');
 const worker=b.worker||'ORG-HOUSEHOLD';
 o.need(g.entities.some(e=>e.id===worker),'经手岗位尚未成立。');
 const t=o.task(g,ctx,'event_work',worker,{source:c.id,operation:choice,cost:b.cost||0,duration:b.minutes||60,reservation:''},b.delivery??15);
 if(b.cost)t.params.reservation=o.reserve(g,ctx,t.order_ref,b.cost);
 // Freeze only the accepted work. Author notes and later branches are never stored here.
 note(g,c,'work-issued',b.instruction,{option:choice,order_ref:t.order_ref,task_ref:t.id,contract:structuredClone(b),version:eventCardData.version,source_ref:ctx.id});
 g.orders.find(x=>x.id===t.order_ref).execution_condition=b.instruction;
 return t.order_ref;
}
export function runEventWork(g,t,ctx,o){
 if(t.kind!=='event_work'||t.phase==='return')return false;
 const row=g.campaign.history.find(h=>h.choice==='work-issued'&&h.task_ref===t.id),b=row?.contract;
 o.need(b,'这项旧委托缺少已保存的工作内容。');
 const involved=b.effect==='rosby'?['P060']:b.effect==='release-redwyne'?['P064','P065']:[];
 if(involved.some(id=>absentActor(g,id))){o.waitTask(g,t,'当事人无法自由行动，原委托等待明确解除限制；不自动释放或改押。',o);return true;}
 if(t.phase==='start'){
  if(!conditionsMet(g,b.requires)){o.waitTask(g,t,'原先约定的办理条件尚未成立。',o);return true;}
  if((b.materials||[]).some(x=>g.resources.find(r=>r.id===x.resource)?.quantity.value<x.amount)){o.waitTask(g,t,'RESOURCE_UNAVAILABLE',o);return true;}
  if((b.labor||0)>availableLabor(g)){o.waitTask(g,t,'工班正在办理其他工程，等待原班次交接。',o);return true;}
  if(b.troops){
   const f=g.forces.find(f=>f.id==='FORCE01');
   if(o.freeGroup(g,f,4)<b.troops){o.waitTask(g,t,'PERSONNEL_UNAVAILABLE',o);return true;}
   const id=o.key(g,'ASN');g.assignments.push({id,order_ref:t.order_ref,force_ref:f.id,group_index:4,count:b.troops,task_commander:t.actor_ref,location:b.location||'君临',status:'active',start_at:now(g),end_at:now(g)+t.params.duration,return_at:0,authority_ref:'',acceptance_ref:t.order_ref});t.assignment_ref=id;
  }
  if(b.effect==='rosby'){
   const child=g.actors.find(a=>a.id==='P060');
   o.need(child?.life==='存活'&&child.location.startsWith('红堡'),'托曼此刻不在红堡，不能再次发出护送。');
   child.location='前往罗斯比城途中';child.last_updated_minute=now(g);
  }
  for(const x of b.materials||[])o.change(g,ctx,x.resource,-x.amount,'有限工程实际领用材料',[t.order_ref]);
  t.phase='finish';t.next_at=now(g)+t.params.duration;return true;
 }
 if(t.phase!=='finish')return true;
 if(b.effect==='relief'&&g.resources.find(r=>r.id==='RES-FOOD-RK').quantity.value<b.rations){o.waitTask(g,t,'FOOD_UNAVAILABLE',o);return true;}
 if(b.cost)o.spend(g,ctx,b.cost,t.params.reservation,b.instruction,[t.order_ref]);
 if(t.params.reservation)o.release(g,t.params.reservation);
 if(t.assignment_ref){const a=g.assignments.find(a=>a.id===t.assignment_ref);a.status='returned';a.return_at=now(g);}
 if(b.effect==='sale'){
  // A single named lot, not an unlimited new income source.
  if(!eventFact(g,'asset-lot-sold')){o.change(g,ctx,'RES-CASH',b.receipts,'指定闲置银器实际售出',[t.order_ref]);g.execution.evidence.push({id:o.key(g,'EV'),category:'event:asset-lot-sold',status:'realized',at:now(g),source_ref:t.order_ref,stage_ref:t.params.source});}
 }
 if(b.effect==='tax')o.change(g,ctx,'RES-CASH',b.receipts,'本期限定摊位铜板税实际缴库',[t.order_ref]);
 if(b.effect==='relief'){const r=g.resources.find(r=>r.id==='RES-FOOD-RK');o.need(r.quantity.value>=b.rations,'现有宫廷口粮不足以照此施食。');o.change(g,ctx,r.id,-b.rations,'在册临时施食实际领粮',[t.order_ref]);}
 if(b.effect==='release-redwyne')for(const id of ['P064','P065']){const a=g.actors.find(a=>a.id===id);if(a?.life==='存活')a.location='随获准使团离开君临途中';}
 if(b.effect==='rosby'){const child=g.actors.find(a=>a.id==='P060');if(child?.life==='存活'){child.location='罗斯比城·避险住处';child.last_updated_minute=now(g);}}
 if(b.effect==='marriage-release'){
  for(const c of g.commitments.filter(c=>c.kind==='婚约'&&c.parties.includes('P012')&&c.status==='有效')){c.status='已解除';c.terms+='；本次有效王室裁决解除订婚，双方获通知。';}
  g.campaign.marriage_protected=true;
 }
 if(b.effect==='tyrion-finance'){
  // Existing minister remains in office; a defined delegated scope is distinct from replacing him.
  g.authorities.push({id:o.key(g,'AUTH'),issuer:'U001',subject:'P003',relation:'delegated_scope',object_ref:'ORG-TREASURY',scope:{actions:['audit_account'],max_count:0,group_id:'',location:'君临'},starts_at:now(g),expires_at:500*1440,status:'active',source_refs:[t.order_ref],delivery_refs:[t.order_ref]});
 }
 if(b.effect==='wildfire-discovery'&&!eventFact(g,'wildfire-old-sealed'))o.change(g,ctx,'RES-WILDFIRE-OLD',300,'龙穴另一批三百罐旧藏清点封存，未验收为可用野火',[t.order_ref]);
 for(const tag of b.facts||[])g.execution.evidence.push({id:o.key(g,'EV'),category:'event:'+tag,status:'realized',at:now(g),source_ref:t.order_ref,stage_ref:t.params.source});
 if(b.inspection)g.execution.inspections.push({id:o.key(g,'CHECK'),target_ref:b.inspection,order_ref:t.order_ref,at:now(g),result:b.result});
 note(g,{id:t.params.source},'work-completed',b.result,{task_ref:t.id,order_ref:t.order_ref,source_ref:ctx.id});
 for(const recipient of b.notify||[])o.report(g,t.actor_ref,b.result,[t.order_ref],recipient);
 o.finish(g,t,b.result);return true;
}
export function eventWorkErrors(g){const errors=[];
 for(const t of g.execution.tasks.filter(t=>t.kind==='event_work')){
  const h=g.campaign?.history.find(h=>h.task_ref===t.id&&h.choice==='work-issued');
  if(!h?.contract||h.option!==t.params.operation||h.scene!==t.params.source||h.contract.cost!==t.params.cost||h.contract.minutes!==t.params.duration)errors.push('event work snapshot mismatch');
 }
 return errors;
}
