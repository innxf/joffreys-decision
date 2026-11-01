import {reformActionText} from './reform-approval.mjs';
import {speech} from './portrait-panel.mjs';
import {dailyForActivity} from './daily-engine.mjs';
import {campaignIssue} from './campaign-engine.mjs';
import {liveCouncil} from './council-session.mjs';
import {GenerationClient} from './generation-client.mjs';
import {installPromptSettings} from './generation-settings.mjs';
import {DialogueRunner} from './dialogue-runner.mjs';
import {profiles,audience,target} from './dialogue-core.mjs';
import {proposalView} from './dialogue-engine.mjs';
import {executionErrors} from './world-panel.mjs';
import {mountMemory} from './memory-panel.mjs';
import {mountAutonomy} from './autonomy-panel.mjs';
const $=id=>document.getElementById(id);
const names={pre:'整理人物认知',prose:'生成正文草稿',post:'解释对白',save:'保存正式结果',done:'已正式保存'};
const states={pending:'等待开始',running:'进行中',interrupted:'已中断',cancelled:'已取消',failed:'未完成',truncated:'输出被截断',stale:'旧版本草稿',discarded:'已放弃'};
const fieldNames={target:'抓捕对象',executor:'执行者',force:'所用部队',group:'现有班组',area:'行动范围',secrecy:'公开程度',reason:'命令事由',arrest_ref:'拘押记录',name:'机构名称',responsibilities:'职责',organization_ref:'所属机构',title:'职务／事项',person:'执行人',commander:'指挥者',count:'人数',duration:'持续分钟',end_at:'结束时间（开局后分钟）',expires_at:'授权截止（开局后分钟）',plan_ref:'转属方案',authority_ref:'授权依据',acceptance_ref:'人物答复',order_ref:'命令',obligation_ref:'付款事项',operation:'操作范围',target_ref:'操作对象',max_count:'人数上限',posts:'原岗位安排',template:'项目类型',source:'来源',destination:'去向',amount:'数量'};
function describeAction(a){if(['reform_propose','reform_revise'].includes(a.type))return reformActionText(a);return Object.entries(a).filter(([k])=>k!=='type').map(([k,v])=>`${fieldNames[k]||k}：${profiles[v]?.name||({keep_same_posts:'保留原岗位',permanent_transfer:'永久转属',temporary_detail:'临时借调',prepare_records:'整理目录'}[v])||(Array.isArray(v)?v.join('、'):v)}`).join('；');}
const errors={STALE_DIALOGUE_CONTEXT:'当前活动、存档或世界已经改变；旧草稿未采用。请放弃这份草稿，再按当前状态开始。',PENDING_DIALOGUE_EXISTS:'还有一轮未提交的对话，请继续、重写或放弃草稿。',UNKNOWN_EVIDENCE:'返回引用了人物尚未知晓的资料，未提交。',DIALOGUE_CONTRADICTION:'正文和可执行结果不相容，保留草稿；可以重试解析或重写正文。',CONDITIONAL_NOT_ACCEPTED:'答复仍有条件，不能当成无条件接受。',SAVE_FAILED:'正式结果没有保存成功；重试保存不会重新请求模型。',ACTOR_NOT_PRESENT:'此人尚未确认在本场活动中。',PRESENCE_WITHOUT_ACTIVITY:'缺少本场到场记录。',...executionErrors};
export async function mountDialogue(runtime,{testMode,namespace=null,refresh}){
 const client=new GenerationClient(storageService);window.gotGeneration=client;await client.init();
 const status=t=>$('dialogue-status').textContent=t;
 const run=fn=>async()=>{try{await fn();refresh();render();}catch(e){status(errors[e.message]||e.message);render(false);}};
 const {dirty,mayLeave}=installPromptSettings(client,status);
 let memory=null,historyOffset=0,historyTicket=0,requestsEnabled=false,executionAvailable=false,serviceReady=false;
 async function checkService(){
  const notice=$('runtime-notice');
  try{const r=await fetch('/api/health');if(!r.ok)throw Error('服务没有正确响应');const h=await r.json();
   requestsEnabled=!!h.modelRequestsEnabled;executionAvailable=!!h.features?.includes('execution-judgment-v1');
   serviceReady=!!h.features?.includes('council-issue-batches-v1');
   if(notice){notice.hidden=serviceReady;notice.textContent=!serviceReady?'当前服务尚未加载新版会议，请重新启动本机服务。已有进度保留。':'';}
  }catch{serviceReady=false;requestsEnabled=false;if(notice){notice.hidden=false;notice.textContent='本机服务未连接。请运行“启动本地游戏.bat”，再刷新此页。已有进度保留。';}}
 }
 const runner=new DialogueRunner({runtime,client,storage:storageService,record:namespace||(testMode?'dialogue-preview':'dialogue'),builder:window.promptBuilder.buildTaskMessages,notify:()=>{render();if(window.gotRuntime)refresh();if(memory&&!runner.busy)setTimeout(()=>memory.schedule(),0);}});window.gotDialogue=runner;
 const act=async action=>{if(runner.busy)throw Error('请先结束当前生成。');const r=await runtime.commit(runtime.prepareAction(action));if(r.status!=='committed')throw Error(r.validation.code);refresh();};
 const testScene=async participants=>{if(!testMode)throw Error('仅供隔离样本');if(participants.includes('P020')){const snapshot=runtime.exportSave();snapshot.gameData.got.actors.find(a=>a.id==='P020').location='红堡（隔离测试：已赴约）';await runtime.restore(snapshot);}return act({type:'start_activity',kind:'private_talk',participants:['U001',...participants]});};
 const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=run(fn);return b;};
 const para=(container,text)=>{const p=document.createElement('p');p.textContent=text;container.append(p);};
 function render(showStatus=true){
  const g=runtime.read();if(!g)return;const activity=g.activities.find(a=>a.status==='active'&&a.participants.includes('U001'));
  const council=liveCouncil(g);
  const actors=activity?audience(g,activity.id).filter(p=>profiles[p]):[];const selected=$('dialogue-actor').value;
  $('dialogue-actor').replaceChildren();for(const actor of actors){const o=document.createElement('option');o.value=actor;o.textContent=profiles[actor].name;$('dialogue-actor').append(o);}if(actors.includes(selected))$('dialogue-actor').value=selected;
  if(council&&$('dialogue-actor').dataset.issue!==council.current){const speaker=campaignIssue(g,council.current)?.presenters.find(id=>actors.includes(id))||{remains:'P018',pursuit:'P004',compensation:'P020',theft:'P018'}[council.current];if(actors.includes(speaker))$('dialogue-actor').value=speaker;$('dialogue-actor').dataset.issue=council.current;}
  $('dialogue-presence').textContent=actors.length?'实际在场：乔弗里、'+actors.map(p=>profiles[p].name).join('、'):'本场尚无可对话人物。区域位置不会自动变成对话听众。';
  const scenes=$('dialogue-scenes');scenes.replaceChildren();
  if(!activity){scenes.append(button('与当值桑铎短谈 · 30分钟活动',()=>act({type:'start_activity',kind:'short_visit',participants:['U001','P016']})));
   if(testMode){scenes.append(button('守卫交涉样本 · 已安排会面',()=>testScene(['P016','P020','P048'])),button('家庭用餐样本 · 已安排到场',()=>act({type:'start_activity',kind:'meal',participants:['U001','P012','P060','P061']})),button('摄政私谈样本 · 已安排到场',()=>act({type:'start_activity',kind:'private_talk',participants:['U001','P001']})));}
  }
  const share=$('dialogue-share');share.replaceChildren();if(activity&&actors.length){
   const refs=[...g.politics.guard_plans.map(x=>x.id),...g.administration.organizations.filter(o=>o.source_refs[0]!=='T0').flatMap(o=>o.office_refs),...g.authorities.filter(a=>a.issuer==='U001'||a.id.startsWith('DAUTH-')).map(x=>x.id),...g.dialogue.requests.map(x=>x.id)];
   for(const ref of refs){const t=target(g,ref);share.append(button('向在场者说明：'+(t.title||({guard_plan:'转属方案',authority:'有限授权',detail_request:'临时借调请求'}[t.kind]))+' '+ref,()=>act({type:'dialogue_share',activity_ref:activity.id,target_ref:ref})));}
   if(actors.includes('P001'))share.append(button('拟一份4人家兵借调请求 · 截止明日此时',()=>act({type:'dialogue_request_detail',count:4,end_at:g.clock.elapsed_minutes+1440})));
   if(testMode)for(const p of activity.participants.filter(p=>profiles[p])){const present=actors.includes(p);share.append(button(profiles[p].name+(present?'暂时离席':'返回原会面'),()=>act({type:'dialogue_presence',activity_ref:activity.id,actor:p,present:!present})));}
  }
  const d=runner.draft;if(d){$('story-text').replaceChildren();speech($('story-text'),d.context?.actor,d.prose||'',{id:d.id||d.context?.activity});if(showStatus)status((names[d.stage]||'待开始')+' · '+(d.status==='done'?'正式发言已保存':d.status==='running'?'进行中；尚未成为正式发言':states[d.status]||d.status)+(d.error?'：'+(d.status==='cancelled'?'已停止本次生成，已有草稿保留；未写入人物记忆。':errors[d.error]||d.error):''));}
  const history=$('dialogue-history'),ticket=++historyTicket;history.replaceChildren();storageService.readGotDialoguePage(namespace||(testMode?'dialogue-preview':''),historyOffset,20).then(page=>{if(ticket!==historyTicket)return;for(const t of page.turns){speech(history,'U001',t.input,{id:t.id+':player'});speech(history,t.actor,t.prose,{id:t.id});}const older=button('更早20轮',()=>{historyOffset+=20;render();}),newer=button('较新20轮',()=>{historyOffset=Math.max(0,historyOffset-20);render();});older.disabled=historyOffset+20>=page.total;newer.disabled=historyOffset===0;history.append(older,newer);}).catch(e=>para(history,'历史读取未完成：'+e.message));
  if(d?.memorySelection?.warning&&showStatus)$('dialogue-status').textContent+='；'+d.memorySelection.warning;
  const candidates=$('dialogue-candidates');candidates.replaceChildren();for(const p of g.dialogue.proposals.filter(p=>p.status==='pending')){
   const v=proposalView(g,p),box=document.createElement('div');box.className='panel';para(box,v.title);para(box,describeAction(v.action));para(box,v.cost+'；'+v.duration);if(v.reason)para(box,'尚缺：'+(errors[v.reason]||v.reason));
   const confirm=button(v.title==='送交御前会议讨论'?'送交御前会议':'确认执行这项行动',()=>act({type:'dialogue_execute',proposal_ref:p.id}));confirm.disabled=!v.ready||runner.busy;box.append(confirm,button('撤回这项提案',()=>act({type:'dialogue_discard',proposal_ref:p.id})));candidates.append(box);
  }
  for(const t of g.dialogue.turns.filter(t=>t.settlement&&!['done'].includes(t.settlement.status))){
   const job=t.settlement,box=document.createElement('div');box.className='panel';
   para(box,(profiles[t.actor]?.name||t.actor)+'的对白已保存。'+(job.status==='partial'?'部分事项需要澄清。':runner.postBusy?'书记正在整理。':'文书尚待整理。'));
   if(job.error)para(box,'整理未完成：'+job.error);
   for(const issue of job.issues||[])para(box,'待核对：'+issue.reason);
   if(!['partial','done'].includes(job.status)){const cached=job.response||runner.postResults.has(g.revision.branch_id+'|'+t.id);const retry=button(cached?'继续整理／保存':'重试整理',()=>runner.settle(t.id,{retry:!cached&&job.status==='failed'}));retry.disabled=runner.postBusy;box.append(retry);if(cached&&job.status==='failed'){const regenerate=button('重新请求整理',()=>runner.settle(t.id,{retry:true}));regenerate.disabled=runner.postBusy;box.append(regenerate);}}
   candidates.append(box);
  }
  const pending=d&&!['done','discarded','stale'].includes(d.status);
  if($('dialogue-availability')){$('dialogue-availability').hidden=requestsEnabled;$('dialogue-availability').textContent='自由交谈尚未开启。既定选项照常可用；如需生成新内容，可在右上角设置中配置连接，并开启本机服务的模型请求。';}
  if($('dialogue-composer'))$('dialogue-composer').hidden=dailyForActivity(g,activity?.id)?.external===false&&!pending;
  if(pending&&$('dialogue-composer'))$('dialogue-composer').open=true;
  $('dialogue-retry').textContent=d?.stage==='save'?'重试保存':d?.stage==='post'?'重试整理':'重试生成';
  if(d?.version>=2&&d.requests.some(x=>x.snapshot.stage===d.stage&&x.response&&!x.superseded))$('dialogue-retry').textContent='继续解析／保存';
  $('dialogue-regenerate').textContent=d?.pre?'重新生成正文':'重新请求前置判断';
  if(g.opening?.version===2){
   $('dialogue-panel').hidden=!activity;
   for(const id of ['dialogue-mode','dialogue-scenes','dialogue-share','dialogue-preview','dialogue-preview-box','memory-panel','autonomy-panel'])$(id).hidden=true;
   if(testMode&&d?.canonSelection){$('dialogue-preview').hidden=false;$('dialogue-preview-box').hidden=false;$('dialogue-preview').textContent='查看本轮正文发送记录（只读）';}
   $('dialogue-candidates').hidden=!!council;
   $('story-text').hidden=!!d&&(d.context.activity!==activity?.id||(!!council&&d.status==='done'));
   $('dialogue-history').closest('details').hidden=!!council;
   $('dialogue-retry').hidden=!pending;$('dialogue-regenerate').hidden=!pending;$('dialogue-discard').hidden=!pending;$('dialogue-cancel').hidden=!runner.busy;
   if(showStatus&&d)status(d.error?'本次回复未完成：'+(errors[d.error]||d.error):runner.councilError?'文书还未核妥，已完成的记录保留。':runner.busy?'请稍候……':council?'书记已记下这段话。':'');
  }
  
  if(council?.session.version===3)$('dialogue-panel').hidden=true;
  $('dialogue-send').disabled=!serviceReady||!requestsEnabled||runner.busy||pending||!actors.length||(council&&!['intro','discussion','extra'].includes(council.session.phase));$('dialogue-retry').disabled=runner.busy||!pending;
  $('dialogue-regenerate').disabled=runner.busy||!pending||(!d?.pre&&d?.version<2);$('dialogue-discard').disabled=runner.busy||!d||['done','discarded'].includes(d.status);$('dialogue-cancel').disabled=!runner.busy;
 }
 $('dialogue-prose-api').onclick=()=>window.showConfigModal('prose');$('dialogue-middle-api').onclick=()=>window.showConfigModal('middleware');
 $('dialogue-prompts').onclick=()=>{if(!$('prompt-section').hidden&&!mayLeave())return;$('prompt-section').hidden=!$('prompt-section').hidden;if(!$('prompt-section').hidden)window.promptManagerModal.render($('gs-prompt-manager-root'));};
 const current=()=>{const activity=runtime.read().activities.find(a=>a.status==='active'&&a.participants.includes('U001'));if(!activity)throw Error('请先进入有实际参与者的活动。');return [ $('dialogue-actor').value,activity.id,$('dialogue-input').value ];};
 $('dialogue-send').onclick=run(async()=>{if(!serviceReady||!requestsEnabled)throw Error('本机服务尚未准备好，请按页面上方提示启动。');await runner.start(...current());$('dialogue-input').value='';});$('dialogue-retry').onclick=run(()=>runner.run());$('dialogue-regenerate').onclick=run(()=>runner.run('regenerate'));$('dialogue-discard').onclick=run(()=>runner.discard());$('dialogue-cancel').onclick=()=>runner.cancel();
 $('dialogue-preview').onclick=run(()=>{const s=runner.draft?.requests?.findLast(x=>x.snapshot.stage==='prose')?.snapshot||runner.preview(...current());$('dialogue-request').textContent=JSON.stringify({messages:s.compiled.messages,parameters:s.compiled.parameters,endpoint:s.preview.endpoint,warnings:s.preview.warnings,canon_reference:s.canon_reference||null},null,2);$('dialogue-preview-box').open=true;status('预览不发请求、不走时、不执行行动。');});
 window.addEventListener('got-world-changed',()=>render());window.addEventListener('beforeunload',e=>{if(runner.busy||runner.postBusy||runner.postResults.size||dirty()){e.preventDefault();e.returnValue='';}});
 await runner.init();memory=mountMemory(runtime,client,runner,{namespace:namespace||(testMode?'dialogue-preview':''),refresh:render});render();$('dialogue-mode').textContent=testMode?'隔离测试存档：会面已安排，人物可用于接口检查，不代表正式T0发生了这些安排。':'正式世界：只对已进入活动的人生成发言。委托与回报按时间推进；开局引导见上方会议与日程；旧存档保留原有状态。';
 await checkService();if(namespace==='council-v3-preview'){const n=$('runtime-notice');n.hidden=false;n.textContent='这是隔离的固定演示，不会发出模型请求，也不改变正式进度。';}runner.councilRequestsEnabled=serviceReady&&requestsEnabled;runner.councilAutoResume=!liveCouncil(runtime.read());render();refresh();
 mountAutonomy(runtime,client,runner,memory,{refresh:render,enabled:requestsEnabled&&executionAvailable,available:executionAvailable});
}
