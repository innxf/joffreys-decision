import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {validateServiceAccount} from './google-auth.mjs';

// Server-only. Never return these records through a browser status endpoint.
export class ConnectionStore {
 constructor(file=null){this.file=file;this.records={};if(file){try{const x=JSON.parse(readFileSync(file,'utf8'));if(x.version!==1||!x.records)throw Error('version');this.records=x.records;}catch(e){if(e.code!=='ENOENT')throw Error('本地连接文件无法读取；保留原件，未覆盖。');}}}
 get(id){return Object.hasOwn(this.records,id)?structuredClone(this.records[id]):undefined;}
 save(id,config){const next={...this.records,[id]:structuredClone(config)};this.commit(next);}
 remove(id){const next={...this.records};if(id)delete next[id];else for(const key of Object.keys(next))delete next[key];this.commit(next);}
 commit(next){if(this.file){mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';writeFileSync(tmp,JSON.stringify({version:1,records:next}),{mode:0o600});renameSync(tmp,this.file);}this.records=next;}
}
export function resolveCredential(config,previous){
 const type=config.type||'openai';
 if(type==='vertex'){
  const raw=config.serviceAccountJson?.trim()||(previous?.type==='vertex'?previous.serviceAccountJson:'');
  const account=validateServiceAccount(raw);
  if(config.projectId&&config.projectId!==account.project_id)throw Error('服务账号项目与保存的配置不一致。');
  return {...config,key:'',projectId:account.project_id,serviceAccountJson:JSON.stringify(account)};
 }
 const key=(config.key||'').trim()||(previous?.endpoint===config.endpoint&&(previous.type||'openai')===type?previous.key:'');
 const host=new URL(config.endpoint).hostname;
 if(!key&&!['127.0.0.1','localhost','[::1]'].includes(host))throw Error('尚未保存此接口的密钥。请在API设置中填写一次；空栏只会保留已有密钥。');
 return {...config,key};
}
