import {initialSettings,upgradeSettings,defaultConnection,connectionConfig,compileTask,sampleInput,displayText,proseText,failureStatus} from './generation-core.mjs';
import {normalizeConnection} from './compat/google-provider.js';
import {BUDGET} from './compat/generation-budget.js';

export class GenerationClient {
 constructor(storage){this.storage=storage;this.settings=initialSettings();this.settingsToken=null;this.draft=null;this.draftToken=null;this.listeners=[];this.session=null;this.busy=false;this.abort=null;this.queue=Promise.resolve();this.callStats={};}
 notify(){for(const fn of this.listeners)fn(this);}
 async init(){await this.storage.init();const s=await this.storage.readGotGenerationRecord('settings');if(s){if(s.version!==1)throw Error('设置版本不兼容，保留原件。');this.settings=s.settings;this.settingsToken=s.revision;}this.draft=await this.storage.readGotGenerationRecord('draft');this.draftToken=this.draft?.revision??null;
  if(this.draft?.status==='running')await navigator.locks.request('got-generation-request',{ifAvailable:true},async lock=>{if(lock){await this.persistDraft({...this.draft,status:'interrupted',error:'上次生成未完成；已保存内容保留，没有自动重发。'});}});
  upgradeSettings(this.settings);this.notify();
 }
 async saveSettings(next){const rev=(this.settingsToken||0)+1;next=structuredClone(next);next.revision=rev;await this.storage.writeGotGenerationRecord('settings',{version:1,revision:rev,settings:next},this.settingsToken);this.settings=next;this.settingsToken=rev;this.notify();}
 async persistDraft(next){const rev=(this.draftToken||0)+1;const value={...structuredClone(next),revision:rev};try{if(new TextEncoder().encode(JSON.stringify(value)).byteLength>BUDGET.maxSaveBytes)throw Error('检查草稿超过64MB保存上限，请先导出已有记录。');await this.storage.writeGotGenerationRecord('draft',value,this.draftToken);}catch(e){e.storageFailure=true;throw e;}this.draft=value;this.draftToken=rev;this.notify();return value;}
 configForUI(role){const c=this.settings.connections[role];return {...defaultConnection(),...c,apiKey:'',saved:!!c};}
 history(role){return (this.settings.history[role]||[]).map(c=>({...c,apiKey:'',_label:c.model+' · '+new URL(c.endpoint).hostname}));}
 async local(path,body,renew=true,signal){if(!this.session){const r=await fetch('/api/session',{signal});const v=await r.json();if(!r.ok)throw Error(v.error);this.session=v.token;}
  const r=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json','x-local-session':this.session},body:JSON.stringify(body),signal});
  const v=await r.json();if(!r.ok){if(r.status===403){this.session=null;if(renew&&['restore','config'].includes(path))return this.local(path,body,false);}throw Error(v.error||'本机服务请求失败。');}return v;
 }
 async saveConnection(role,ui){const endpoint=normalizeConnection(ui);const previous=(this.settings.history[role]||[]).find(c=>c.id===ui.credentialId)||(this.settings.history[role]||[]).find(c=>c.endpoint===endpoint&&(c.type||'openai')===(ui.type||'openai'))||this.settings.connections[role];const {publicConfig,privateConfig}=connectionConfig(role,ui,previous);
  await this.local('config',{config:privateConfig,previousId:previous?.id});const next=structuredClone(this.settings);next.connections[role]=publicConfig;next.history[role]=[publicConfig,...next.history[role].filter(c=>c.endpoint!==publicConfig.endpoint||c.model!==publicConfig.model||c.type!==publicConfig.type||c.projectId!==publicConfig.projectId)].slice(0,3);await this.saveSettings(next);
 }
 async models(role,endpoint,key,type='openai'){const c=this.settings.connections[role];return (await this.local('models',{endpoint:normalizeConnection({endpoint,type}),type,key:key||'',configId:c?.id})).models;}
 async validateServiceAccount(serviceAccountJson){return this.local('validate-service-account',{serviceAccountJson});}
 async testConnection(role,ui){try{await this.saveConnection(role,{...this.configForUI(role),...ui});const c=this.settings.connections[role];const req={id:crypto.randomUUID(),stage:'test',configId:c.id,connection:c,compiled:{messages:[{role:'user',content:'仅回复：连接成功。'}],parameters:{max_tokens:128},budget:{context:c.maxContextTokens}},stream:false};const r=await this.request(req);this.lastTest=r;this.notify();return {success:true,content:r.content};}catch(e){return {success:false,error:e.message};}}
 compile(phase,input=sampleInput(phase),generation='normal',continuation=''){return this.lastPreview=compileTask(this.settings,phase,input,window.promptBuilder.buildTaskMessages,generation,continuation);}
 async request(snapshot,callbacks,signal){
  const c=snapshot.connection;if(!c?.id)throw Error('请先保存本路API连接。');
  // Restore only the frozen connection; never silently use the newly selected config.
  const restored=await this.local('restore',{configs:[{...c,contextTokens:undefined,outputTokens:undefined}]});
  if(!restored.ready.some(x=>x.id===c.id))throw Error('本次请求使用的连接已失效，请保存连接后开始新的尝试。');
  const r=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json','x-local-session':this.session},body:JSON.stringify({id:snapshot.id,stage:snapshot.stage,configId:c.id,messages:snapshot.compiled.messages,parameters:snapshot.compiled.parameters,budget:snapshot.compiled.budget,stream:snapshot.stream}),signal});
  const stats=v=>{this.callStats[c.role]={calls:v.callsUsed??this.callStats[c.role]?.calls??0,ms:v.metric?.ms??v.diagnostic?.metric?.ms??0,usage:v.usage??v.diagnostic?.usage??null};this.notify();};
  if(!r.ok||!snapshot.stream){const v=await r.json();stats(v);if(!r.ok||v.error){const e=Error(v.error||'本机服务返回失败。');e.diagnostic=v.diagnostic;throw e;}return v;}
  const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='',done=null,partial='';
  const consume=line=>{if(!line.trim())return;const v=JSON.parse(line);if(v.type==='delta'){partial+=v.text;callbacks?.onToken?.(v.text);}else if(v.type==='done'){done=v;stats(v);}else if(v.type==='error'){stats(v);const e=Error(v.error);e.diagnostic=v.diagnostic;throw e;}};
  try{while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,i));buffer=buffer.slice(i+1);}}buffer+=decoder.decode();if(buffer)consume(buffer);if(!done){const e=Error('本机响应中断，草稿保留。');e.diagnostic={content:partial};throw e;}return done;}
  catch(e){try{await reader.cancel();}catch{}if(!e.diagnostic)e.diagnostic={content:partial};throw e;}
 }
 async generate(snapshot){
  if(this.busy)throw Error('当前生成尚未结束。');
  return navigator.locks.request('got-generation-request',{ifAvailable:true},async lock=>{
   if(!lock)throw Error('另一个页面正在生成，请先在那里结束。');
   this.busy=true;this.cancelRequested=false;this.notify();let raw='',lastSaved=0,saveFailure=null;this.queue=Promise.resolve();
   const shown=(raw,streaming=false)=>snapshot.stage==='prose'&&snapshot.proseFormat===2?proseText(snapshot.compiled.prefix||'',raw,streaming):displayText(snapshot.compiled.prefix||'',raw);
   const previousAttempts=this.draft?[...(this.draft.previousAttempts||[]),Object.fromEntries(Object.entries(this.draft).filter(([k])=>k!=='previousAttempts'))]:[];
   const draft={version:1,id:snapshot.id,status:'running',snapshot:structuredClone(snapshot),raw:'',prefix:snapshot.compiled.prefix||'',display:shown('',true),createdAt:Date.now(),metrics:null,error:null,previousAttempts};
   const enqueue=()=>{const copy={...draft,raw,display:shown(raw,true)};this.queue=this.queue.then(()=>this.persistDraft(copy)).catch(e=>{saveFailure=e;this.abort?.();});};
   try{
    await this.persistDraft(draft);
    if(this.cancelRequested)throw new DOMException('已停止生成。','AbortError');
    let result;
    if(snapshot.stream){result=await new Promise((resolve,reject)=>{const handle=window.apiService.sendMessagesStream(snapshot.compiled.messages,{onToken:delta=>{raw+=delta;window.updateStoryText(shown(raw,true));if(Date.now()-lastSaved>250){lastSaved=Date.now();enqueue();}},onComplete:(text,usage,r)=>resolve(r),onError:reject},{gotRequest:snapshot});this.abort=()=>handle.abort();});}
    else{const abort=new AbortController();this.abort=()=>abort.abort();result=await window.apiService.sendMessages(snapshot.compiled.messages,{gotRequest:snapshot,signal:abort.signal});}
    await this.queue;if(saveFailure)throw saveFailure;raw=result.content;
    await this.persistDraft({...draft,status:'complete',raw,display:shown(raw),metrics:result.metric,usage:result.usage,finishReason:result.finishReason});
   }catch(e){await this.queue;if(saveFailure||e.storageFailure){const issue=saveFailure||e;if(issue.message==='STALE_GENERATION_RECORD')throw issue;throw Error('草稿保存失败，停在最后成功位置：'+issue.message);}
    const text=e.diagnostic?.content||raw;
    await this.persistDraft({...draft,status:failureStatus(e),raw:text,display:shown(text,true),metrics:e.diagnostic?.metric||null,usage:e.diagnostic?.usage||null,finishReason:e.diagnostic?.finishReason||null,error:e.name==='AbortError'?'已停止生成，收到的内容保留。':e.message});
   }finally{this.abort=null;this.busy=false;this.notify();}
  });
 }
 cancel(){if(this.busy)this.cancelRequested=true;this.abort?.();}
}
