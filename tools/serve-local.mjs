// Adapted from the archived prototype scripts/serve.mjs. M1 is static-only.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createGateway} from './got/model-gateway.mjs';
import {ConnectionStore} from './got/connection-store.mjs';
import {localBuild} from './got/local-build.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
let gateway;
const loadedBuild=localBuild();
let distribution=null;try{distribution=JSON.parse(readFileSync(path.join(root,'release-manifest.json'),'utf8')).release||null;}catch{}
const port=Number(process.env.GOT_PORT||8090);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid GOT_PORT');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ttf':'font/ttf','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4'};
export async function handleLocalRequest(req,res,{shutdown}={}){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"connect-src 'self'; form-action 'self'; frame-ancestors 'self'"};
 try{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/api/exit'){
   const actualPort=req.socket.localPort;
   const origin=`http://127.0.0.1:${actualPort}`;
   if(req.method!=='POST'){res.writeHead(405,headers);res.end();return;}
   // Only an explicit action from this server's page can stop this process.
   // No GET exit link, arbitrary PID, shell command, or cross-origin form.
   if(req.headers.host!==`127.0.0.1:${actualPort}`||req.headers.origin!==origin||req.headers['x-got-exit']!=='confirmed'){
    res.writeHead(403,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({error:'只能从本游戏页面确认退出。'}));return;
   }
   if(typeof shutdown!=='function'){res.writeHead(503,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify({error:'当前服务未启用界面退出，请使用关闭游戏入口。'}));return;}
   res.writeHead(202,{...headers,'Content-Type':'application/json','Connection':'close'});
   res.once('finish',shutdown);res.end(JSON.stringify({exiting:true}));return;
  }
  if(url.pathname==='/api/health'&&req.method==='GET'){
   res.writeHead(200,{...headers,'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({app:'got-fork-baseline',stage:'firstday-play',build:loadedBuild,distribution,features:['memory-v1','middleware-background-v2','execution-judgment-v1','opening-council-v1','continuous-council-v2','council-issue-batches-v1','firstday-play-v1','pixel-scenes-v1','event-cards-annual-156-v1','court-folio-v1','authored-council-v1','inherited-reuse-v1','google-native-vertex-v1','music-slots-v1','canon-vector-local-v1','court-life-v1'],source:'5cec5f53c3304f5c6d9e2e7e15c15d3823341cfa',modelRequestsEnabled:process.env.GOT_ENABLE_API==='1',pid:process.pid}));return;
  }
  if(url.pathname.startsWith('/api/')){
   gateway ??= createGateway(process.env.GOT_ENABLE_API==='1' ? fetch : async()=>{throw Error('本机服务未开启模型请求；既定剧情可继续游玩，自由生成需要另行启用。');},new ConnectionStore(path.join(root,'.local','model-connections.json')));
   if(await gateway(req,res,Number(req.headers?.host?.split(':').at(-1))))return;
   res.writeHead(503,{...headers,'Content-Type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({error:'未找到此本机接口，请确认页面与服务版本一致。'}));return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return;}
  let rel=decodeURIComponent(url.pathname);
  if(['/','/index.html','/start-screen-noST.html'].includes(rel))rel='/got-state.html';
  // Keep source modules/assets, but do not run old settlement pages against GOT saves.
  if(rel.toLowerCase().endsWith('.html') && !['/got-state.html','/got-finale.html','/got-generation.html','/got-art.html','/got-ui-preview.html'].includes(rel)){
   res.writeHead(410,headers);res.end('Legacy gameplay is archived. Open /got-state.html');return;
  }
  if(rel.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(404,headers);res.end('Not found');return;}
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile())throw Error('Not found');
  if(rel.split('/').some(x=>x.startsWith('.')) || rel.startsWith('/tools/') || /\.(ts|md|log)$/i.test(rel))throw Error('Not found');
  const data=await readFile(file);
  res.writeHead(200,{...headers,'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':data.length});
  res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404,headers);res.end('Not found');}
}
// Importing the handler for offline tests does not open a socket.
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
let exiting=false;
const shutdown=()=>{if(exiting)return;exiting=true;server.close();setTimeout(()=>{server.closeAllConnections();process.exit(0);},150);};
const server=http.createServer((req,res)=>handleLocalRequest(req,res,{shutdown}));
server.on('error',e=>{console.error('Local baseline startup failed:',e.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
 console.log('GOT local: http://127.0.0.1:'+port+'/got-state.html');
 console.log('External model requests: '+(process.env.GOT_ENABLE_API==='1'?'enabled':'disabled')+'. Ctrl+C to stop.');
});
}
