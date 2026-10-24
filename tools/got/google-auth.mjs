// SPDX-License-Identifier: AGPL-3.0-only
// Adapted from SillyTavern 1.16.0 src/endpoints/google.js (generateJWTToken/getAccessToken).
// Changes: local-only validation, injected transport, abort support, memory-only token cache,
// fixed Google token audience, redacted errors. See docs/third-party/SillyTavern-Vertex.md.
import {createPrivateKey,createSign} from 'node:crypto';
const tokenURL='https://oauth2.googleapis.com/token';
export function validateServiceAccount(raw){
 let x;try{if(typeof raw!=='string'||raw.length>65536)throw Error();x=JSON.parse(raw);}catch{throw Error('服务账号JSON无法解析或超过64KB。');}
 if(x?.type!=='service_account'||typeof x.client_email!=='string'||!/^[-.a-zA-Z0-9_]+@[-.a-zA-Z0-9]+\.gserviceaccount\.com$/.test(x.client_email)||!(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/).test(x.project_id||'')||typeof x.private_key!=='string')throw Error('服务账号JSON缺少有效的type、project_id、client_email或private_key。');
 try{const k=createPrivateKey(x.private_key);if(k.asymmetricKeyType!=='rsa')throw Error();}catch{throw Error('服务账号私钥不是有效的RSA私钥。');}
 return {type:'service_account',project_id:x.project_id,client_email:x.client_email,private_key:x.private_key};
}
export function generateJWTToken(account,now=Math.floor(Date.now()/1000)){
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=encode({alg:'RS256',typ:'JWT'})+'.'+encode({iss:account.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:tokenURL,iat:now,exp:now+3600});
 return input+'.'+createSign('RSA-SHA256').update(input).sign(account.private_key,'base64url');
}
export function googleAuth(fetcher){
 const cache=new Map();
 return async(config,signal)=>{
  if(config.type==='gemini')return {'x-goog-api-key':config.key};
  if(config.type!=='vertex')return config.key?{Authorization:'Bearer '+config.key}:{};
  const account=validateServiceAccount(config.serviceAccountJson),key=config.serviceAccountJson;
  const cached=cache.get(key);if(cached&&cached.until>Date.now())return {Authorization:'Bearer '+cached.token};
  const response=await fetcher(tokenURL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:generateJWTToken(account)}).toString(),signal,redirect:'error'});
  if(!response.ok){await response.body?.cancel();throw Error('模型认证失败：Google令牌服务返回HTTP '+response.status+'。检查服务账号及系统时间；没有自动重试。');}
  let body;try{body=await response.json();}catch{throw Error('模型认证失败：令牌响应格式无效。');}
  if(typeof body.access_token!=='string'||!body.access_token||body.access_token.length>16384||!Number.isFinite(body.expires_in)||body.expires_in<=0)throw Error('模型认证失败：缺少有效的访问令牌或有效期。');
  if(cache.size>32)cache.clear();cache.set(key,{token:body.access_token,until:Date.now()+Math.max(0,Math.min(body.expires_in,3600)-60)*1000});
  return {Authorization:'Bearer '+body.access_token};
 };
}
