import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../',import.meta.url)));
const manifest=JSON.parse(readFileSync(path.join(root,'release-manifest.json'),'utf8')),missing=[],changed=[],unsafe=[];
for(const f of manifest.files){
 const target=path.resolve(root,f.path);
 if(!target.startsWith(root+path.sep)||/(^|\/)\.local(\/|$)/.test(f.path)){unsafe.push(f.path);continue;}
 if(!existsSync(target)){missing.push(f.path);continue;}
 if(createHash('sha256').update(readFileSync(target)).digest('hex')!==f.sha256)changed.push(f.path);
}
// All local static references of the four formal pages must be present in the independent directory.
for(const page of ['got-state.html','got-generation.html','got-finale.html','got-art.html']){
 const source=readFileSync(path.join(root,page),'utf8');
 for(const m of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)){
  const rel=m[1].split(/[?#]/)[0];if(!rel||/^(?:https?:|data:|blob:)/.test(rel))continue;
  if(!existsSync(path.resolve(root,rel)))missing.push(page+' -> '+rel);
 }
}
const result={release:manifest.release,files:manifest.files.length,bytes:manifest.files.reduce((n,x)=>n+x.bytes,0),missing,changed,unsafe,privateLocalDirectory:existsSync(path.join(root,'.local'))};
console.log(JSON.stringify(result,null,2));if(missing.length||changed.length||unsafe.length)process.exitCode=1;
