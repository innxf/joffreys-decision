import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localBuild} from './got/local-build.mjs';
const exec=promisify(execFile),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const root=fileURLToPath(new URL('../',import.meta.url));

// Process ownership comes from Windows, never a health response alone.
export async function launch({offline,stop=false,build,inspect,health,terminate,start,open,wait=sleep}){
 let owner=await inspect();
 if(owner.pid&&!owner.owned)throw Error('该端口由其他程序或其他游戏目录占用，未停止它。请先处理端口占用。');
 if(stop){if(owner.pid)await terminate(owner.pid);return 'stopped';}
 const h=owner.pid?await health():null;
 if(owner.pid&&h?.app==='got-fork-baseline'&&h.pid===owner.pid&&h.build===build&&h.modelRequestsEnabled===!offline){await open();return 'reused';}
 if(owner.pid){await terminate(owner.pid);for(let i=0;i<40;i++){owner=await inspect();if(!owner.pid)break;await wait(100);}if(owner.pid)throw Error('旧服务尚未退出，未重复启动。');}
 const childPid=await start();
 for(let i=0;i<100;i++){
  const ready=await health();
  if(ready?.pid===childPid&&ready.build===build&&ready.modelRequestsEnabled===!offline){await open();return 'started';}
  await wait(200);
 }
 throw Error('服务未在规定时间内就绪；请查看 .local/startup.log。再次双击可检查并恢复本目录服务。');
}
async function main(){
 const port=Number(process.env.GOT_PORT||8090),offline=process.argv.includes('--offline');
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('端口必须是1到65535的整数。');
 if(process.platform!=='win32')throw Error('此双击启动器用于Windows。其他系统请直接运行 tools/serve-local.mjs。');
 const url=`http://127.0.0.1:${port}/`,local=path.join(root,'.local');fs.mkdirSync(local,{recursive:true});
 const lock=path.join(local,`launcher-${port}.lock`);let acquired=false;
 for(let i=0;i<150;i++){
  try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);acquired=true;break;}
  catch(e){if(e.code!=='EEXIST')throw e;
   try{const pid=Number(fs.readFileSync(lock,'utf8'));if(pid>0){try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH')fs.unlinkSync(lock);}}else if(Date.now()-fs.statSync(lock).mtimeMs>30000)fs.unlinkSync(lock);}catch{}
   await sleep(200);
  }
 }
 if(!acquired)throw Error('另一个启动器仍在处理，请稍后再试。');
 try{
  const script=path.join(root,'tools','serve-local.mjs');
  const windows=async(action,expectedPid=0)=>{
   const r=await exec('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'tools','launcher-process.ps1'),'-Port',String(port),'-ScriptPath',script,'-NodePath',process.execPath,'-Action',action,'-ExpectedPid',String(expectedPid)],{windowsHide:true,timeout:12000});
   return JSON.parse(r.stdout.trim());
  };
  const status=await launch({offline,stop:process.argv.includes('--stop'),build:localBuild(),
   inspect:()=>windows('inspect'),terminate:pid=>windows('stop',pid),
   health:async()=>{try{const r=await fetch(url+'api/health',{signal:AbortSignal.timeout(800)});return r.ok?await r.json():null;}catch{return null;}},
   start:async()=>{
    const fd=fs.openSync(path.join(local,'startup.log'),'a');
    fs.writeSync(fd,`\n[${new Date().toISOString()}] launch port=${port} api=${!offline}\n`);
    try{
     const child=spawn(process.execPath,[script],{cwd:root,env:{...process.env,GOT_ENABLE_API:offline?'0':'1'},detached:true,windowsHide:true,stdio:['ignore',fd,fd]});
     await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();return child.pid;
    }finally{fs.closeSync(fd);}
   },
   open:async()=>{if(process.argv.includes('--no-open'))return;try{await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Start-Process '${url}'`],{windowsHide:true,timeout:15000});}catch{throw Error(`服务已就绪，但系统未能打开浏览器。请打开 ${url}`);}}
  });
  console.log(status==='stopped'?'本目录游戏服务已关闭。':`游戏已就绪：${url}（${offline?'API关闭':'使用自备API设置'}）`);
 }finally{fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error('启动未完成：'+e.message);process.exitCode=1;});
