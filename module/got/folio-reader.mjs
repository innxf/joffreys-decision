import '../game-ui.js';
// Presentation only. Page turns never submit world actions or model requests.
let scope='local',branch='unsaved';
export function setReadingContext(world,namespace='formal') { scope=namespace;branch=world?.revision?.branch_id||'unsaved'; }
const hash=s=>{let h=2166136261;for(const ch of s){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);};
export const narrativeText=(value,options={})=>globalThis.storyReader.text(value,options);
export const readingPages=(value,limit=310)=>globalThis.storyReader.pages(value,{limit});
// Only for translating v1 saved cursors. Never used for normal pagination.
function legacyPages(value,limit=310){
 const text=String(value||''),pages=[];let page='';
 const flush=()=>{if(page.trim())pages.push(page.trim());page='';};
 for(const paragraph of text.split(/\n\s*\n|\n/).filter(x=>x.trim())){
  const sentences=paragraph.match(/[^。！？!?]+[。！？!?]+[”」’』）)]*|[^。！？!?]+$/g)||[paragraph];
  let block='';
  for(const sentence of sentences){if(block&&block.length+sentence.length>limit){if(page)flush();page=block;flush();block='';}block+=sentence;}
  if(page&&page.length+block.length>limit)flush();page+=(page?'\n\n':'')+block;
 }flush();return pages.length?pages:[''];
}
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null')||{};}catch{return {};}}
function write(key,data){try{localStorage.setItem(key,JSON.stringify(data));}catch{/* Reading remains possible if preferences cannot be saved. */}}
// Saved with the inherited save envelope, outside authoritative gameData.
export function captureReading(world,namespace=scope){
 const prefix=`got-reading:${namespace}:${world?.revision?.branch_id||'unsaved'}:`,positions={};
 try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(prefix))positions[key.slice(prefix.length)]=read(key);}}catch{}
 return {version:1,positions};
}
export function restoreReading(record,world,namespace=scope){
 if(record?.version!==1||!record.positions||typeof record.positions!=='object')return;
 const prefix=`got-reading:${namespace}:${world.revision.branch_id}:`;
 for(const [key,value]of Object.entries(record.positions).slice(0,10000))if(key.length<200&&Number.isInteger(value?.page)&&value.page>=0)write(prefix+key,{page:value.page,expanded:!!value.expanded,...(value.version===2?{version:2}:{})});
}
export function mountReading(parent,value,{id,portrait=null,name='',expanded=false,legacy=false}={}){
 const text=narrativeText(value,{legacy}),key=`got-reading:${scope}:${branch}:${id||hash(text)}`;
 const saved=read(key);let state={...saved,expanded:saved.expanded??expanded};
 if(saved.version!==2&&Number.isInteger(saved.page)){
  const previous=legacyPages(text),needle=previous[saved.page];
  const offset=needle?text.indexOf(needle):-1,first=offset>=0?text.slice(offset).trimStart():'';
  state.page=first?Math.max(0,readingPages(text).findIndex(p=>p.startsWith(first.slice(0,Math.min(24,p.length))))):0;
  state.version=2;write(key,state);
 }
 const box=document.createElement('article');box.className='got-folio';box.dataset.readingKey=key;box.dataset.reader='inherited';
 if(portrait){const focus=document.createElement('aside');focus.className='folio-focus';focus.append(portrait);const n=document.createElement('span');n.textContent=name;focus.append(n);box.append(focus);box.dataset.focus=portrait.dataset.actor||'';}
 const main=document.createElement('div');main.className='folio-main';box.append(main);parent.append(box);
 globalThis.storyReader.mount(main,text,{state,onChange:s=>write(key,s),fontSize:()=>{const current=Number(read('got-reading-font').size)||20;const size=current>=24?18:current+2;write('got-reading-font',{size});document.documentElement.style.setProperty('--reading-size',size+'px');}});
 document.documentElement.style.setProperty('--reading-size',(Number(read('got-reading-font').size)||20)+'px');return box;
}
