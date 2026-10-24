import {MemoryClient} from './memory-client.mjs';
import {profiles} from './dialogue-profiles.mjs';
import {memoryMaterials} from './memory-core.mjs';
export function mountMemory(runtime,client,runner,{namespace='',refresh=()=>{}}={}){
 const root=document.getElementById('memory-panel'),node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const run=fn=>async()=>{try{await fn();}catch(e){memory.status=e.message;}render();};
 const button=(text,fn)=>{const b=node('button',text);b.onclick=run(fn);return b;};
 let selected='P016';
 const memory=new MemoryClient({runtime,client,storage:storageService,namespace,builder:window.promptBuilder.buildTaskMessages,upstream:{summary:summaryRunner,embedding:embeddingService,recall:memoryRecall,reranker},notify:()=>{render();refresh();},isDialoguePending:()=>runner.busy||runner.draft&&!['done','discarded','stale'].includes(runner.draft.status)});
 function render(){if(!root)return;const g=runtime.read();root.replaceChildren(node('summary','人物记忆与后台整理'),node('p','原文保留。总结只替换发送材料，不改事实、承诺或游戏时间。索引是可重建缓存，不进入导出存档。'));
  const select=node('select','');select.id='memory-actor';for(const [id,p]of Object.entries(profiles)){const o=node('option',p.name);o.value=id;select.append(o);}select.value=selected;select.onchange=()=>{selected=select.value;render();};root.append(select);
  const counts=g.memory?.jobs||[],filter=counts.filter(j=>j.actor===selected);root.append(node('p',`正式原文 ${g.dialogue.turns.length} 轮；此人总结：待处理 ${filter.filter(j=>j.status==='pending').length}，失败 ${filter.filter(j=>j.status==='failed').length}，完成 ${filter.filter(j=>j.status==='done').length}。`));
  const missing=memoryMaterials(g,selected).missing;if(missing.length)root.append(node('p',`此人有 ${missing.length} 轮旧记录缺少摘要，原文仍保留；尚未批量整理，不会自动请求服务。来源：${missing.slice(0,10).join('、')}${missing.length>10?'等':''}`));
  for(const [key,title]of [['autoSummary','活动结束或积累20轮后自动总结（会请求中间层）'],['autoResume','刷新后自动恢复待处理总结'],['autoRetry','失败自动重试（最多一次；默认关闭）'],['rerank','检索后使用可选精排（增加一次请求）']]){
   const label=node('label',''),input=document.createElement('input');input.type='checkbox';input.checked=!!client.settings.memory[key];input.onchange=run(async()=>{const next=structuredClone(client.settings);next.memory[key]=input.checked;if(key==='autoRetry')next.memory.retryLimit=input.checked?1:0;await client.saveSettings(next);memory.schedule();});label.append(input,document.createTextNode(title));root.append(label,document.createElement('br'));
  }
  const label=node('label','总结输出上限（空白跟随服务）：'),limit=document.createElement('input');limit.type='number';limit.min='1';limit.value=client.settings.memory.summaryOutput??'';limit.onchange=run(async()=>{const value=limit.value===''?null:Number(limit.value);if(value!==null&&(!Number.isSafeInteger(value)||value<1))throw Error('请输入正整数或留空。');const next=structuredClone(client.settings);next.memory.summaryOutput=value;await client.saveSettings(next);});label.append(limit);root.append(label);
  const job=filter.find(j=>j.status!=='done');
  const start=button('处理此人的下一批总结',async()=>{if(!job){memory.status='没有待总结批次；活动结束或积累20轮会登记。';return;}await memory.worker.run(job.id);});start.id='memory-summary-run';start.disabled=memory.worker.isRunning()||runner.busy;root.append(start,button('取消后台请求',()=>{memory.worker.cancel();memory.indexAbort?.abort();}));
  root.append(button('查看索引数量并补建',()=>memory.rebuild(selected,{confirm:n=>confirm(`此人有 ${n} 条摘要。只补建当前模型缺少的记录，每批最多16条；会产生向量服务请求。继续？`)})),button('清除当前人物索引',()=>memory.clearIndex(selected)));
  root.append(node('p',memory.status||'后台未发起请求。'),node('p','总结任务及其来源随完整存档保存。失败保留已有摘要，不自动生成新的世界成果。'));
 }
 memory.mountConfig=(modal,role)=>{if(role!=='middleware')return;const c=client.settings.memory.connection||{},get=id=>modal.querySelector('#'+id);
  get('emb-endpoint-input').value=c.endpoint||'https://api.siliconflow.cn/v1';get('emb-model-input').value=c.model||'BAAI/bge-m3';get('emb-rerank-model-input').value=c.rerankModel||'BAAI/bge-reranker-v2-m3';get('emb-key-input').value='';get('emb-enabled-input').checked=!!client.settings.memory.retrieval;
  const save=button('保存记忆连接',async()=>{await memory.saveConfig({endpoint:get('emb-endpoint-input').value,key:get('emb-key-input').value,model:get('emb-model-input').value,rerankModel:get('emb-rerank-model-input').value,enabled:get('emb-enabled-input').checked});get('emb-key-input').value='';get('emb-status').textContent=memory.status;});save.id='memory-save-config';get('emb-status').before(save);get('emb-status').textContent=c.id?'已有本机密钥，空栏保留。保存记忆连接不会发送请求。':'独立向量连接，与聊天API分别保存；模板尚未经过真实服务验证。';
 };
 memory.testEmbedding=async()=>{const status=document.getElementById('emb-status');try{if(!client.settings.memory.connection)throw Error('请先点击“保存记忆连接”。');await memory.embed(['这是记忆连接测试。'],client.settings.memory.connection);status.textContent='向量格式检查通过；不代表检索效果已经验收。';}catch(e){status.textContent=e.message;}};
 memory.rebuildSelected=run(()=>memory.rebuild(selected,{confirm:n=>confirm(`为${profiles[selected].name}补建索引，共 ${n} 条候选摘要。会产生请求，继续？`)}));
 runner.recall=(c,s,signal)=>memory.recall(c,s,signal);
 window.gotMemory=memory;render();window.addEventListener('got-world-changed',()=>{render();setTimeout(()=>memory.schedule(),0);});setTimeout(()=>memory.schedule({resume:true}),0);return memory;
}
