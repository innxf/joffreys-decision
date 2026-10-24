// Author appointments augment the existing roster; positions are still written by campaign schedule.
import {eventCardData} from './event-cards-data.mjs';
import {conditionsMet} from './event-work.mjs';
export const annualCards=eventCardData.cards.flatMap(c=>[c,...(c.segments||[]).map(s=>({...c,...s,parent:c.id}))]).filter(c=>c.enabled);
export const annualGuests=[...new Map(annualCards.flatMap(c=>c.cast||[]).map(p=>[p.id,p])).values()];
export function cardRoutine(g,id,hour){
 const day=Math.floor(g.clock.elapsed_minutes/1440);
 const c=annualCards.find(c=>(c.actor===id||c.companions?.includes(id))&&day>=c.days[0]&&day<=c.days[1]&&conditionsMet(g,c.requires)&&hour>=c.hours[0]&&hour<c.hours[1]);
 return c?.places[0]||null;
}
export function extraRoutineRoster(){
 // No invented pre-arrival meetings. Guest arrival/departure is an explicit authored journey.
 return [...annualGuests.map(p=>({id:p.id,name:p.name,stages:[{from:0,location:'本卡登记的到访行程'},{from:p.arrival,location:'君临'},{from:p.departure+1,location:'已离开君临，沿既有后续行程'}],daily:[6,9,12,18].map(hour=>({hour,place:p.place}))})),
 {id:'R001',name:'奥柏伦',stages:[{from:345,location:'君临'}],daily:[6,9,12,18].map(hour=>({hour,place:'R20'}))},
 {id:'R007',name:'科本',stages:[{from:300,location:'君临'}],daily:[6,9,12,18].map(hour=>({hour,place:'R23'}))}];
}
export const additionalDaily={P017:['R22','R11','R22','R12'],P049:['C09','C09','C09','C09'],P064:['R27','R27','R27','R27'],P065:['R27','R27','R27','R27'],P109:['R26S','R26S','R26S','R26S'],P042:['C04','G04','C04','C04'],P053:['R10','R11','R12','R10'],P021:['R22','R07','R09','R22'],P055:['C13','C04','C13','C13'],P056:['C13','C04','C13','C13'],P057:['C13','C04','C13','C13']};
