import {portraits} from './portrait-registry.mjs';
import {authoredSpeakers} from './authored-speakers.mjs';
export {portraits};
const aliases=new Map();
for(const [id,p] of Object.entries(portraits))for(const name of p.name.split(/[／/]/)){aliases.set(name,id);aliases.set(name.split('·')[0],id);}
for(const [name,id]of Object.entries({'乔佛里':'U001','乔弗里':'U001','小恶魔':'P003','小指头':'P005','猎狗':'P016','史林特':'P020','梅斯':'P030','奥莲娜':'P031','老玫瑰':'P031','红毒蛇':'R001','奥伯伦':'R001','奥柏伦':'R001','科本':'R007','魔山':'P078','太后':'P001','瓦利斯':'P004','培提尔':'P005','派席尔大学士':'P018'}))aliases.set(name,id);
export const roleNames={clerk:'书记官',guard:'守卫',attendant:'侍从',septon:'总主教',unknown:'席间人声',singer:'歌手',herald:'司仪',knight:'席间骑士',judge:'审理官员',messenger:'使者',garlan:'加兰·提利尔',ellaria:'艾拉莉亚·沙德'};
export const characterId=name=>portraits[name]?name:aliases.get(String(name).trim())||null;
export const characterName=id=>portraits[id]?.name.split('／')[0]||roleNames[id]||'来人';
const names=[...aliases.keys()].sort((a,b)=>b.length-a.length);
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const namePattern=names.map(escaped).join('|');
const roles='书记官|书记|守卫|侍从|修士';
const token='(?:'+namePattern+'|'+roles+')';
const identify=s=>characterId(s)||({'书记官':'clerk','书记':'clerk','守卫':'guard','侍从':'attendant','修士':'septon'})[s];
const speaking='说|问|答|道|喊|叫|吼|低语|反驳|插嘴|打断|宣布|提醒|请求|嘟囔|喃喃|声音|开口|接着|提议|呈报|禀报|复述';
// Presentation only. Explicit runtime speaker always wins. Never changes knowledge or state.
export function quotedSpeaker(before,after='',fallback=null){
 const suffix=after.match(new RegExp('^[，,。！!？?…—\\s]*('+token+')(?:(?:公爵|爵士|王子|大人|大学士|夫人|小姐))?[^。！？「」“”\\n]{0,14}(?:'+speaking+')'));
 if(suffix)return identify(suffix[1]);
 const cues=[...before.matchAll(new RegExp('('+token+')(?:(?:公爵|爵士|王子|大人|大学士|夫人|小姐))?[^。！？「」“”\\n]{0,35}(?:'+speaking+')[^。！？「」“”\\n]{0,12}[：:，,。]?\\s*$','g'))];
 if(cues.length)return identify(cues.at(-1)[1]);
 // A named character's action followed immediately by speech: "泰温站在桌旁。「...」".
 const action=before.match(new RegExp('(?:^|[。！？\\n])('+token+')([^「」“”\\n]{0,70})[。：:]\\s*$'));
 if(action&&!new RegExp(token).test(action[2]))return identify(action[1]);
 return fallback||'unknown';
}
export function storyParts(text,{speaker=null}={}){
 text=String(text||'');
 if(/\n\s*\n/.test(text))return text.split(/\n\s*\n/).flatMap(p=>storyParts(p,{speaker}));
 let h=2166136261;for(const c of text.trim())h=Math.imul(h^c.charCodeAt(0),16777619);
 const annotation=authoredSpeakers[(h>>>0).toString(16)];let quoteIndex=0;
 const labelled=text.match(/^([^：:\n]{1,24})[：:]\s*/);
 if(labelled&&characterId(labelled[1]))return [{kind:'speech',speaker:characterId(labelled[1]),text:text.slice(labelled[0].length)}];
 const parts=[];let end=0,last=speaker;
 for(const m of text.matchAll(/「[^」]*」|“[^”]*”/g)){
  if(m.index>end)parts.push({kind:'narration',text:text.slice(end,m.index)});
  const before=text.slice(end,m.index),after=text.slice(m.index+m[0].length);
  const who=annotation?.[quoteIndex++]??quotedSpeaker(before,after,last);
  parts.push(who==='-'?{kind:'narration',text:m[0]}:{kind:'speech',speaker:who,text:m[0]});last=['unknown','-'].includes(who)?last:who;end=m.index+m[0].length;
 }
 if(end<text.length)parts.push({kind:'narration',text:text.slice(end)});
 return parts.length?parts:[{kind:'narration',text}];
}
export function portraitSpec(id,{armour=false}={}){
 if(id==='U001')return {name:'乔弗里·拜拉席恩',file:'assets/got/character-designs/joffrey/U001-'+(armour?'armour':'court')+'-pixel-sheet-v1.png',crop:armour?[628,82,380,490]:[620,82,386,490],size:[1024,1536]};
 return portraits[id]||{name:roleNames[id]||'来人',file:'assets/got/portraits/role-silhouette.svg'};
}
