// Shared by the browser and local gateway. No requests, discovery or redirects here.
// ST 1.16.0 custom Chat Completion appends /chat/completions to the supplied base.
export function normalizeEndpoint(value:unknown):string {
 if(typeof value!=='string'||!value.trim())throw Error('请填写API基础地址，例如 https://example.com/v1。');
 const raw=value.trim();
 if(!/^https?:\/\//i.test(raw))throw Error('API地址开头需要 http:// 或 https://；可直接填写酒馆使用的基础地址。');
 let u:URL;try{u=new URL(raw);}catch{throw Error('API地址无法解析，请检查域名、端口和空格。');}
 if(u.username||u.password)throw Error('地址不能包含用户名或密码；密钥请填在单独的密钥栏。');
 if(u.search||u.hash)throw Error('当前Chat Completions连接不支持带问号参数或#片段的地址；请填写服务提供的基础地址，密钥放在密钥栏。');
 const path=u.pathname.replace(/\/+$/,'');
 if(/\/(messages|responses|(?:stream)?generateContent)$/i.test(path)||/:\w*generateContent$/i.test(path))throw Error('这是另一种API协议的接口；当前支持Chat Completions，请使用该服务的兼容入口，不能仅改接口后缀。');
 u.pathname=path.endsWith('/chat/completions')?path:path+'/chat/completions';
 return u.href;
}
