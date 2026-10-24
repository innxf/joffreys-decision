import {AutonomyClient} from './autonomy-client.mjs';
import {profiles} from './dialogue-profiles.mjs';
import {executionErrors} from './world-panel.mjs';
export function mountAutonomy(runtime,client,dialogue,memory,{refresh=()=>{},enabled=false,available=true}={}){
 const root=document.getElementById('autonomy-panel'),node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const worker=new AutonomyClient({runtime,client,builder:window.promptBuilder.buildTaskMessages,notify:()=>{render();refresh();},enabled,isBusy:()=>memory.worker.isRunning()||memory.indexBusy||dialogue.busy||dialogue.draft&&!['done','discarded','stale'].includes(dialogue.draft.status)});
 const run=fn=>async()=>{try{await fn();}catch(e){worker.status=executionErrors[e.message]||e.message;}render();};
 const button=(text,fn)=>{const b=node('button',text);b.onclick=run(fn);return b;};
 function render(){if(!root)return;const g=runtime.read();root.replaceChildren(node('summary','委托进度与执行者答复'),node('p','常规委托按时间推进；特殊利益冲突才需要判断。答复和完成结果经回报送达后才成为国王的消息。'));
  const label=node('label',''),check=node('input','');check.type='checkbox';check.checked=!!client.settings.execution.automatic;check.onchange=run(async()=>{const next=structuredClone(client.settings);next.execution.automatic=check.checked;await client.saveSettings(next);await worker.pump();});label.append(check,document.createTextNode('关键节点自动处理执行判断（使用中间层；默认关闭）'));root.append(label);
  if(!worker.enabled)root.append(node('p','本机服务未开启真实请求，常规事务继续；需要人物判断的事务保留等待。'));
  if(!available)root.append(node('p','当前本机服务尚未加载2E接口。请先关闭旧服务，再运行主工程的“启动本地基线.cmd”；刷新页面即可，现有任务会保留。'));
  for(const j of g.autonomy.jobs.filter(j=>!['done','stale'].includes(j.status))){
   const box=node('div','');box.className='panel';box.append(node('p',`${profiles[j.actor]?.name||'执行者'} · ${j.status==='failed'?'判断未完成':j.status==='running'?'已保存处理中位置':'等待处理已送达的委托'}`));
   const b=button(j.result?'保存已有答复':'处理这次答复',()=>worker.run(j.id));b.disabled=worker.busy||!!worker.unsaved||!available;box.append(b);root.append(box);
  }
  for(const c of g.autonomy.controls.filter(c=>c.wait)){
   const t=g.execution.tasks.find(t=>t.id===c.task_ref),o=g.orders.find(o=>o.id===t.order_ref);
   if(!g.messages.some(m=>m.id===o.report_message_id&&m.recipient==='U001'&&m.status==='已收到'))continue;
   const box=node('div','');box.className='panel';box.append(node('p',`${o.id}：${c.reason}`));if(['condition','decision'].includes(c.wait))box.append(button('按现有条件继续核对',async()=>{const r=await runtime.commit(runtime.prepareAction({type:'autonomy_resume',task_ref:t.id}));if(r.status!=='committed')throw Error(r.validation.code);}));root.append(box);
  }
  if(worker.unsaved)root.append(button('只重试保存已有结果',()=>worker.saveRetry()));
  if(g.autonomy.checkpoint)root.append(button('继续原定时间，其余事务照常推进',()=>worker.commit({type:'autonomy_continue_time'})));
  root.append(button('取消本次后台请求',()=>worker.cancel()),node('p',worker.status||'没有发起额外模型请求。'));
 }
 window.gotAutonomy=worker;render();window.addEventListener('got-world-changed',()=>{render();setTimeout(()=>worker.pump(),0);});return worker;
}
