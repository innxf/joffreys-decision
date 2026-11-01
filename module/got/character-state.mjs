// Authored personality choices. No score, no inferred future, no new world ledger.
import {profiles} from './dialogue-profiles.mjs';
import {places} from './opening-content.mjs';
const copy=structuredClone,need=(v,m)=>{if(!v)throw Error(m);};
const legacyFields={P001:null,P002:'tywin',P003:'tyrion',P012:'sansa',P060:'tommen'};
const legacyMap={P012:{other:'guarded'},P003:{trusted:'trusted'},P002:{overbearing:'overbearing',bargaining:'bargaining'}};
export function characterState(g,id){
 const p=profiles[id];need(p,'ACTOR_PROFILE_NOT_READY');
 const saved=g.dialogue?.agendas?.[id]?.character;if(saved)return copy(saved);
 const old=g.campaign?.[legacyFields[id]],mapped=legacyMap[id]?.[old]||old;
 const attitude=p.attitudes.some(a=>a.id===mapped)?mapped:p.default_attitude;
 return {version:p.version,attitude,explanation:old?'承接既有世界记录中的态度；未重算历史。':'作者开局态度；尚无新的正式判断。',basis:old?['legacy:campaign:'+legacyFields[id]]:[],reviewed:[],pending:false,source:old?'legacy':'author'};
}
function stamp(text){let h=2166136261;for(const ch of text){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return text.length+':'+(h>>>0).toString(16);}
export function characterSignals(known){return known.filter(k=>['observation','relationship','promise','report','received_order'].includes(k.kind)).map(k=>({ref:k.ref,stamp:stamp(k.content)}));}
export function characterMaterials(g,id,known){
 const p=profiles[id],a=g.actors.find(x=>x.id===id),state=characterState(g,id);
 const inCapital=!!a&&(Object.values(places).includes(a.location)||a.location==='君临'||a.location==='红堡');
 const verified=known.filter(k=>k.reliability==='confirmed');
 const has=key=>verified.some(k=>k.stage_facts?.includes(key));
 const conditions={always:true,jaime_report:has('jaime_captured')&&!has('jaime_released'),acting_hand:inCapital&&g.offices.some(o=>o.holder===id&&o.status==='在任'&&/首相|国王之手/.test(o.title)),known_victory:g.campaign?.battle?.result==='held_with_relief'&&has('blackwater_victory'),captive:/俘|拘|囚/.test(a?.mobility||''),own_wound:id==='P015'&&has('jaime_wounded'),qyburn_employed:!!g.campaign?.qyburn&&inCapital,barristan_return:g.execution.decisions.some(d=>d.actor===id&&d.kind==='return_intent'&&d.status==='accepted')};
 const stages=p.stages.filter(s=>conditions[s.condition]);
 return {expression:p.expression||'speech',state,current:p.attitudes.find(x=>x.id===state.attitude)||null,stages:copy(stages),options:copy(p.attitudes),signals:characterSignals(known)};
}
export const characterContract='人物态度：在既有JSON结果上附character:{mode:"keep|select|unsupported",attitude:"该人物已写态度id",explanation:"结合本人经历的简短判断",basis:["本人known中的ref"]}。有character资料时必须提供。keep保留现态度，select选用已写档案；unsupported表示没有适用档案，保持原状态并等待作者补充。只按本人已知经历判断，不以互动次数或国王单次善意兑换信任。认可才能与敌意可以并存。不得创造新态度或把未来原著当依据。';
export function checkCharacter(c,r){
 if(r===undefined){need(c.version!==2,'CHARACTER_RESULT_MISSING');return;} // Legacy frozen requests retain their original contract.
 need(c.character,'CHARACTER_CONTEXT_MISSING');
 need(r&&Object.keys(r).sort().join('|')==='attitude|basis|explanation|mode','CHARACTER_FIELDS');
 need(['keep','select','unsupported'].includes(r.mode)&&typeof r.explanation==='string'&&r.explanation.length>0&&r.explanation.length<=2000&&Array.isArray(r.basis),'CHARACTER_FORMAT');
 need(c.character.options.some(a=>a.id===r.attitude),'CHARACTER_NOT_AUTHORED');
 need(r.basis.every(ref=>c.known.some(k=>k.ref===ref)),'CHARACTER_UNKNOWN_EVIDENCE');
 if(r.mode!=='select')need(r.attitude===c.character.state.attitude,'CHARACTER_KEEP_CHANGED');
 // A mechanism snapshot explains the actor, but only its recorded changes are experiences.
 if(r.mode==='select'&&r.attitude!==c.character.state.attitude)need(r.basis.some(ref=>c.known.some(k=>k.ref===ref&&!['initial','heard_claim','own_mechanism'].includes(k.kind))),'CHARACTER_CHANGE_WITHOUT_EXPERIENCE');
}
export function saveCharacter(g,c,r,source){
 if(!r)return;checkCharacter(c,r);
 const agenda=g.dialogue.agendas[c.actor]??={priorities:profiles[c.actor].priorities,basis:[]};
 agenda.character={version:c.personality.version,stage_ids:c.character.stages.map(s=>s.id),attitude:r.mode==='select'?r.attitude:c.character.state.attitude,explanation:r.explanation,basis:r.basis.map(x=>x==='current-input'?source:x),reviewed:copy(c.character.signals),pending:r.mode==='unsupported',source};
}
export function characterText(c,result){
 if(!c.character)return '';
 const current=result?.mode==='select'?c.character.options.find(a=>a.id===result.attitude):c.character.current;
 return (c.character.expression==='nonverbal'?'\n表达方式：此人无口语能力，只写可观察动作；不得替他发出口头台词。':c.character.expression==='hodor'?'\n表达方式：口语限“霍多”，其余以动作和声调表现。':'')+'\n\n【当前阶段】\n'+c.character.stages.map(s=>s.label+'：'+s.text).join('\n')+'\n【对乔弗里的态度】\n'+(current?Object.entries(current).filter(([k])=>!['id','scene_cue'].includes(k)).map(([k,v])=>({label:'状态',inside:'内心判断',public:'公开表现',private:'私下表现',boundary:'合作边界',basis:'转变依据',reverse:'反向变化'}[k]+'：'+v)).join('\n'):'沿已保存历史，当前档案需要作者补充。');
}
export const finaleActors=['P002','P003','P012','P060'];
export function pendingCharacters(g,knownFor){return finaleActors.filter(id=>{const s=characterState(g,id);return g.dialogue.turns.some(t=>t.actor===id&&t.settlement&&!['done','partial'].includes(t.settlement.status))||s.pending||JSON.stringify(s.reviewed)!==JSON.stringify(characterSignals(knownFor(g,id)));});}
export function validCharacterRecord(id,s){return !s||!!profiles[id]?.attitudes.some(a=>a.id===s.attitude)&&typeof s.explanation==='string'&&Array.isArray(s.basis)&&Array.isArray(s.reviewed)&&typeof s.pending==='boolean';}

export function characterSceneCue(g,id){const p=profiles[id];return p?.attitudes.find(a=>a.id===characterState(g,id).attitude)?.scene_cue||'';}

export function requireCharacterInput(snapshot,input){
 const normalized=s=>s.replace(/\r\n/g,'\n').trim();
 need(snapshot.compiled.messages.some(m=>normalized(m.content).includes(normalized(input.personality))),'预设没有完整送入本人的人设与当前阶段／态度，请在原预设面板检查人物资料条目；未发送请求。');
}
