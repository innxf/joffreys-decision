import {speech,story,renderCouncilSeats} from './portrait-panel.mjs';
import {profiles} from './dialogue-core.mjs';
import {topicOf} from './council-v3.mjs';
import {liveCouncil,pendingCouncilBatch} from './council-session.mjs';
import {demoWork,demoBatch} from './council-v3-demo.mjs';
const readableError=text=>String(text).replaceAll('RESOURCE_UNAVAILABLE','可用钱款或物资不足，请核对本次其他已定安排').replaceAll('STALE_DIALOGUE_CONTEXT','存档或会议已改变，旧回复没有采用').replaceAll('SAVE_FAILED','尚未保存成功，可重试保存').replaceAll('INCOMPLETE_MODEL_RESPONSE','模型输出被截断，已收到的内容保留').replaceAll('DIALOGUE_CANCELLED','生成已停止，已收到的内容保留');
const defChoice=(q,id,g)=>g.opening.meetings.flatMap(m=>m.session?.turns||[]).find(t=>t.issue===q.id)?.context.meeting?.choices.find(c=>c[0]===id)?.[1];
const name=id=>profiles[id]?.name||(id==='U001'?'乔弗里':'书记');
export function renderCouncilV3(runtime,host,{button,act}){
 const g=runtime.read(),m=liveCouncil(g),s=m.session,q=topicOf(m),r=window.gotDialogue;
 const el=(tag,text,parent=host)=>{const e=document.createElement(tag);if(tag==='p'&&/[「“]/.test(text))return story(parent,text);e.textContent=text;parent.append(e);return e;};
 const add=(label,fn)=>{const b=button(label,fn);b.disabled=!!r?.busy;host.append(b);return b;};
 const action=(label,a)=>add(label,()=>{if(['council_v3_edit','council_v3_add'].includes(a.type)&&!demo&&!r?.councilRequestsEnabled){r.councilError='自由提案需要启用模型。可以继续采用既定方案，或在设置中配置连接。';document.getElementById('runtime-notice').hidden=false;document.getElementById('runtime-notice').textContent=r.councilError;return;}if(r)r.councilAutoResume=true;return act(a);});
 const isolated=new URLSearchParams(location.search).get('opening-test')==='1';
 const demo=isolated&&new URLSearchParams(location.search).get('council-demo')==='1';
 el('h2','御前会议');
 renderCouncilSeats(g,m,host);
 if(isolated&&r?.councilWork?.context?.branch===g.revision.branch_id&&r.councilWork.context.activity===m.activity){const snap=r.councilWork.requests?.findLast(x=>x.snapshot.stage==='prose')?.snapshot;if(snap?.canon_reference){const detail=el('details','');el('summary','本轮正文实际采用的原著素材（只读）',detail);el('pre',JSON.stringify(snap.canon_reference,null,2),detail);}}
 el('small',({reports:'大臣陈奏',agenda:'核对议题',agenda_ready:'确认本次议程',topic_review:'核对修订',polishing:'完善命题',speaking:'席间商议',decision:'请国王裁决',clarify:'书记请示',archiving:'记录本题裁决',ready:'诸事议毕',registering:'书记整理文书',review:'文书待用印'})[s.phase]||'御前会议');
 if(demo)el('p','离线演示：下列发言为固定样本，不代表模型判断。');
 const work=async()=>{
  r.councilAutoResume=true;r.councilError='';
  if(demo)await act(demoWork(runtime.read(),liveCouncil(runtime.read())));else{if(!r.councilRequestsEnabled)throw Error('当前服务未开启模型请求，记录已保留。');await r.runCouncilWork();}
 };
 const closing=async(regenerate=false)=>{try{
  if(demo){let batch;while((batch=pendingCouncilBatch(liveCouncil(runtime.read()))))await act({type:'council_parse_issue',issue:batch.issue,result:demoBatch(batch),request_record:{source:'isolated-fixed-demo'}});}
  else if(pendingCouncilBatch(liveCouncil(runtime.read()))){if(!r.councilRequestsEnabled)throw Error('当前服务未开启模型请求，文书已保存。');await r.registerCouncil({regenerate});}
  // An all-silent meeting has no prose batch to translate.
  if(liveCouncil(runtime.read()).session.phase==='registering')await act({type:'council_prepare'});
  await act({type:'council_finish'});
 }catch(e){r.councilError=readableError(e.message);throw e;}};
 if(s.phase==='reports'){
  {const report=s.entries.filter(e=>e.kind==='report').at(-1);story(host,report?.content||'大臣展开卷宗。',{speaker:report?.speaker});}
  action(s.index<s.order.length-1?'继续听取陈奏':'陈奏已毕，核对议题',{type:'council_v3_read'});
 }else if(['agenda','topic_review','agenda_ready'].includes(s.phase)){
  if(q){el('h3',q.title);el('p','要解决的问题：'+q.problem);el('p','初步方向：'+q.approach);el('p','拟负责人：'+(q.owner?name(q.owner):'由本次讨论决定'));
   const reply=s.entries.filter(e=>e.issue===q.id&&e.kind==='topic').at(-1);if(reply)speech(host,reply.speaker,reply.content,{id:reply.id});
   if(!s.input){action('照此讨论',{type:'council_v3_confirm_topic'});action('修改这项议题',{type:'council_v3_edit'});}
  }else{for(const t of s.agenda)el('p',t.title+'：'+t.problem);action('议题齐了，开始讨论',{type:'council_v3_start'});action('补充一项议题',{type:'council_v3_add'});}
 }else{
  if(q)el('h3',q.title);
  const recent=s.entries.filter(e=>e.issue===q?.id&&e.kind!=='report'&&e.kind!=='silence');
  const e=recent.filter(e=>e.content).at(-1);if(e)speech(host,e.speaker,e.content,{id:e.id});
  if(s.phase==='decision'&&!s.input){
   action('采用席间提出的方案',{type:'council_v3_menu'});action('提出修改或另一种办法',{type:'council_v3_edit'});
   if(s.selectionMenu){const list=el('section','');list.className='council-proposals';const ps=q.proposals.filter(p=>p.status==='active');if(!ps.length)el('p','席间尚无人提出可直接采用的办法。可以提出自己的意见。',list);
    for(const p of ps){const b=button(name(p.actor)+'：'+p.summary,()=>{if(r)r.councilAutoResume=true;return act({type:'council_v3_select',proposal:p.id});});b.disabled=!!r?.busy;list.append(b);el('small','拟负责人：'+(p.owner?name(p.owner):'依原职权或待明确')+(p.conditions.length?'；条件：'+p.conditions.join('；'):''),list);if(p.detail)el('small',p.detail,list);if(p.actions?.length)el('p','执行范围：'+p.actions.map(a=>Object.entries(a).filter(([k])=>k!=='type').map(([k,v])=>({count:'人数',duration:'分钟',amount:'数量',source:'调出方',destination:'调入方',person:'人选',commander:'指挥者',title:'名称',name:'名称',organization_ref:'机构',operation:'事务',end_at:'截止分钟',expires_at:'权限截止分钟',posts:'岗位',template:'工作类型',responsibilities:'职责',target_ref:'对象'}[k]||k)+'：'+v).join('；')).join(' / '),list);if(p.choice)el('p','实际采用：'+(defChoice(q,p.choice,g)||p.summary),list);}
   }
  }
  if(s.phase==='clarify')el('p',s.clarification);
  if(s.phase==='ready'&&!s.turns.some(t=>t.extraction&&t.extraction.status!=='done'&&s.agenda.find(q=>q.id===t.issue)?.revision===t.extraction.revision)){el('p','书记合上最后一页。「陛下，今日各项议题都已记妥。诸位没有别的事项了。」');add('宣布散会',async()=>{await act({type:'council_v3_close'});await closing();});}
  if(['registering','review'].includes(s.phase)){el('p','书记逐项核对裁决，众人稍歇。文书尚未用印。');add('继续整理文书',()=>closing());if(r?.councilError&&!demo)add('重新请求未完成议题整理',()=>closing(true));
   if(r?.councilError){el('p','尚未完成：'+r.councilError);const details=el('details','');el('summary','澄清相关议题',details);for(const t of s.agenda)details.append(button(t.title,()=>act({type:'council_v3_reopen',issue:t.id})));}
  }
 }
 if(s.input){
  const box=el('section','');box.className='council-input';el('label',s.input.kind==='topic'?'陛下希望这次商议什么？':'乔弗里的话',box);
  const input=el('textarea','',box);input.rows=4;input.maxLength=6000;input.placeholder='写下你的意见，或点名向某人提问。';input.value=r?.councilInput||'';input.oninput=()=>{r.councilInput=input.value;};
  const select=el('select','',box);const option=el('option','交由相关大臣回应',select);option.value='';for(const id of g.activities.find(a=>a.id===m.activity).participants.filter(id=>profiles[id])){el('option',name(id),select).value=id;}
  const send=button('说出这番话',async()=>{await act({type:'council_v3_input',text:input.value.trim(),actor:select.value||null});r.councilInput='';r.councilAutoResume=true;await work();});send.disabled=!!r?.busy||(!demo&&!r?.councilRequestsEnabled);box.append(send);
 }
 if(s.work){
  if(r?.councilWork?.work.id===s.work.id&&r.councilWork.prose&&r.councilWork.status!=='done')speech(host,s.work.actor,r.councilWork.prose+'（尚未记入正式发言）',{id:s.work.id+':draft'});
  if(r?.busy){el('p',s.work.kind==='summary'?'书记正在记录。':'请稍候……');add('停止生成',()=>r.cancel()).disabled=false;}
  else if(!demo&&!r?.councilRequestsEnabled){el('p','当前未开启模型请求，会议在此等候。已经读过的呈报和议题已保存。');if(isolated){const link=el('a','使用隔离的固定演示继续');link.href=location.pathname+'?opening-test=1&council-demo=1';}}
  else if(r?.councilError){el('p','本步未完成：'+r.councilError);add('重试未完成步骤',work);}
  else if(!r?.councilAutoResume&&!demo)add('继续会议讨论',work);
  else if(r&&r.councilScheduled!==s.work.id){r.councilScheduled=s.work.id;queueMicrotask(()=>work().catch(e=>{r.councilError=readableError(e.message);r.notify(r);}));}
 }
 for(const t of s.turns.filter(t=>t.issue===q?.id&&t.extraction?.issues?.length))el('p',name(t.context.actor)+'的'+t.extraction.issues.length+'项提案尚有不明确之处，没有加入可采纳方案。可提出修改继续讨论。');
 const pendingExtract=s.turns.filter(t=>t.extraction&&t.extraction.status!=='done'&&s.agenda.find(q=>q.id===t.issue)?.revision===t.extraction.revision);
 for(const t of pendingExtract){el('p',name(t.context.actor)+'的原话已记下，方案'+(r?.postBusy?'正在整理。':'尚待核对。'));if(t.extraction.error)el('p','未完成：'+readableError(t.extraction.error));const cached=t.extraction.response||r?.postResults.has(g.revision.branch_id+'|'+t.id);const b=add(cached?'继续整理／保存':'恢复方案整理',()=>r.extractCouncil(t.id,{retry:!cached&&t.extraction.status==='failed'}));b.disabled=!!r?.postBusy;if(cached&&t.extraction.status==='failed'){const b=add('重新请求方案整理',()=>r.extractCouncil(t.id,{retry:true}));b.disabled=!!r?.postBusy;}}
 if(s.entries.length){const history=el('details','');history.className='council-history';el('summary','查看发言记录',history);const filter=el('select','',history);el('option','全部人物',filter).value='';for(const id of [...new Set(s.entries.map(e=>e.speaker))])el('option',name(id),filter).value=id;const body=el('div','',history);
  const draw=()=>{body.replaceChildren();for(const e of s.entries.filter(e=>!['silence','character-review'].includes(e.kind)&&(!filter.value||e.speaker===filter.value))){el('small',s.agenda.find(q=>q.id===e.issue)?.title||'会议',body);speech(body,e.speaker,e.content,{id:e.id});}};filter.onchange=draw;draw();
 }
}
