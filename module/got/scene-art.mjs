// Presentation-only bindings. Coordinates describe this illustration, never travel distance.
import {destination} from './navigation-engine.mjs';
import {places} from './opening-content.mjs';
export const artVersion='pixel-scenes-20261022-rooms-v1';
const file=name=>'assets/got/scenes/'+name+'.png';
export const lightingLabels={day:'白天',dusk:'黄昏',night:'夜晚'};
// T0 is 06:00. Lighting reads game minutes only; it never advances the world.
export function lightingPeriod(elapsedMinutes=0){
 const minute=((elapsedMinutes+360)%1440+1440)%1440;
 return minute<360||minute>=1200?'night':minute>=1020?'dusk':'day';
}
export function artForPeriod(art,period){
 if(!Object.hasOwn(lightingLabels,period))throw Error('Unknown scene lighting');
 const original=art.baseFile||art.file;
 const nativeDusk=/\/(cersei|sept-room)\.png$/.test(original);
 const useOriginal=period===(nativeDusk?'dusk':'day');
 return {...art,baseFile:original,period,file:useOriginal?original:original.replace(/\.png$/,`-${period}.png`)};
}
export const timedArt=(art,elapsedMinutes)=>artForPeriod(art,lightingPeriod(elapsedMinutes));
export const sceneArt={
R04:{name:'珊莎住处',file:file('sansa-chamber-v1'),region:'Z01'},
R06:{name:'外院',file:file('outer-court-v1'),region:'Z01'},
R08:{name:'王座厅',file:file('throne-hall-v1'),region:'Z01'},
R11:{name:'训练庭院',file:file('training-yard-v1'),region:'Z01'},
R14:{name:'王家圣堂',file:file('royal-sept-v1'),region:'Z01'},
R16:{name:'城墙步道',file:file('wall-walk-v1'),region:'Z01'},
R20:{name:'女眷花园',file:file('ladies-garden-v1'),region:'Z01'},
R22:{name:'首相塔接见室',file:file('hand-reception-v1'),region:'Z01'},
R23:{name:'派席尔的药房与鸦巢',file:file('maester-chamber-v1'),region:'Z01'},
R26S:{name:'马厩',file:file('royal-stables-v1'),region:'Z01'},
R26K:{name:'宫廷仓库',file:file('palace-storehouse-v1'),region:'Z01'},
R26W:{name:'工坊',file:file('castle-workshop-v1'),region:'Z01'},
R26F:{name:'厨房',file:file('palace-kitchen-v1'),region:'Z01'},
R27:{name:'牢房接洽处',file:file('dungeon-reception-v1'),region:'Z01'},
R28:{name:'太后舞厅',file:file('queens-ballroom-v1'),region:'Z01'},
C09:{name:'炼金术士公会',file:file('alchemists-guild-v1'),region:'Z03'},
G04:{name:'诸神门',file:file('gods-gate-v1'),region:'Z05'},
G06:{name:'国王门',file:file('kings-gate-v1'),region:'Z05'},
 R01:{name:'国王寝居',file:file('royal-chamber'),region:'Z01'},
 R03:{name:'瑟曦住处',file:file('cersei'),region:'Z01'},
 R05:{name:'家庭餐室',file:file('family-dining'),region:'Z01'},
 R07:{name:'御前议事厅',file:file('council'),region:'Z01'},
 R09:{name:'文书接洽处',file:file('documents'),region:'Z01'},
 R10:{name:'白剑塔圆厅',file:file('white-sword'),region:'Z01'},
 R12:{name:'堡门与出行庭院',file:file('gate'),region:'Z01'},
 R13:{name:'园林',file:file('godswood'),region:'Z01'},
 R25:{name:'瓦里斯接洽处',file:file('documents'),region:'Z01',shared:true},
 C01:{name:'山丘街市',file:file('aegon-hill'),region:'Z02',shared:true},
 C02:{name:'圣堂广场',file:file('visenya'),region:'Z03',shared:true},
 C04:{name:'西营联络处',file:file('western-streets'),region:'Z05',shared:true},
 C05:{name:'港务院',file:file('harbor'),region:'Z06',shared:true},
 C07:{name:'河门码头',file:file('harbor'),region:'Z06',shared:true},
 C08:{name:'东营',file:file('rhaenys-hill'),region:'Z04',shared:true},
 C11:{name:'龙穴外阶',file:file('rhaenys-hill'),region:'Z04',shared:true},
 C12:{name:'跳蚤窝市集',file:file('flea-bottom'),region:'Z07',shared:true},
 C13:{name:'商街',file:file('western-streets'),region:'Z05',shared:true},
 C03:{name:'大圣堂会面室',file:file('sept-room'),region:'Z03'}
};
export const regionArt={
 Z01:{name:'红堡',file:file('red-keep'),hotspots:[
  {place:'R01',box:[.33,.02,.25,.23]},
  {place:'R03',box:[.70,.08,.21,.23]},
  {place:'R07',box:[.18,.29,.19,.21]},
  {place:'R05',box:[.62,.32,.17,.17]},
  {place:'R09',box:[.37,.43,.10,.13]},
  {place:'R10',box:[.035,.40,.09,.19]},
  {place:'R13',box:[.57,.50,.28,.18]},
  {place:'R12',box:[.34,.63,.19,.23]},
  {place:'R25',box:[.18,.55,.15,.12]}
 ]},
 Z02:{name:'伊耿高丘街区',file:file('aegon-hill'),hotspots:[{place:'C01',box:[.20,.55,.30,.24]}]},
 Z04:{name:'雷妮丝丘与东侧街区',file:file('rhaenys-hill'),hotspots:[{place:'C11',box:[.33,.12,.27,.24]},{place:'C08',box:[.12,.49,.28,.25]}]},
 Z05:{name:'西侧市街',file:file('western-streets'),hotspots:[{place:'C04',box:[.12,.20,.24,.24]},{place:'C13',box:[.37,.50,.30,.25]}]},
 Z06:{name:'河门与港区',file:file('harbor'),hotspots:[{place:'C05',box:[.37,.35,.22,.20]},{place:'C07',box:[.60,.61,.25,.22]}]},
 Z07:{name:'跳蚤窝',file:file('flea-bottom'),hotspots:[{place:'C12',box:[.40,.52,.25,.25]}]},
 Z03:{name:'维桑尼亚丘',file:file('visenya'),hotspots:[
  {place:'C03',box:[.73,.53,.21,.20]},{place:'C02',box:[.42,.68,.23,.18]}
 ],landmarks:[{name:'贝勒大圣堂',at:[.42,.29]}]}
};
// Each supported room is a direct hotspot; shared paintings do not share presence.
sceneArt.R03H={name:'太后住处外廊',file:file('queen-corridor-v1'),region:'Z01'};
// Adjacent rooms are labelled on the same illustrated wing. These are authored
// room entrances, not claims that the overview depicts every interior separately.
const courtEntrances={R01:[.47,.08],R03:[.75,.14],R04:[.75,.22],R03H:[.78,.50],
 R05:[.64,.39],R06:[.31,.59],R07:[.23,.30],R08:[.50,.21],R09:[.37,.45],
 R10:[.035,.45],R11:[.22,.51],R12:[.36,.75],R13:[.65,.63],R14:[.57,.30],
 R16:[.83,.40],R20:[.77,.31],R22:[.32,.15],R23:[.48,.01],R25:[.14,.60],
 R26S:[.15,.36],R26K:[.035,.67],R26W:[.20,.70],R26F:[.62,.48],R27:[.46,.66],R28:[.46,.38]};
regionArt.Z01.hotspots=Object.entries(courtEntrances).map(([place,[x,y]])=>({place,box:[x,y,.15,.055]}));
regionArt.Z03.hotspots.push({place:'C09',box:[.08,.57,.24,.14]});
regionArt.Z05.hotspots.push({place:'G04',box:[.04,.76,.22,.12]},{place:'G06',box:[.70,.20,.24,.13]});
export function currentArt(g){
 const location=g.actors.find(a=>a.id==='U001')?.location;
 const place=Object.keys(places).find(id=>places[id]===location);
 return place?{place,...sceneArt[place]}:null;
}
// Scripted scenes use their own camera location, not the player's last free-roam room.
// Unpainted halls, cells and battlefields get an establishing overview, never a false room.
export function storyArt(g,finale=null){
 if(finale){
  const room=['国王书房','国王寝居'].includes(finale.location)?'R01':null;
  return room?{place:room,...sceneArt[room]}:{...regionArt.Z01,name:'红堡 · 区域远景'};
 }
 if(g.opening?.travel){const r=sceneArt[g.opening.travel.destination]?.region||'Z01';return {...regionArt[r],name:regionArt[r].name+' · 途中远望'};}
 if(['battle','battle-result','defeat','finale'].includes(g.campaign?.scene))return {...regionArt.Z01,name:'红堡 · 区域远景'};
 return currentArt(g)||{...regionArt.Z01,name:'红堡 · 区域远景'};
}
// Display shares the actual movement gate.
export const mapDestination=(g,place,options={})=>destination(g,place,options);
