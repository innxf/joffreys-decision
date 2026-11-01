import {characterAliases} from './portrait-data.mjs';
const need=(v,m)=>{if(!v)throw Error(m);};
const names=id=>[id,...characterAliases(id)];
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const after=(s,verb,id)=>names(id).some(x=>new RegExp('(?:'+verb+')[^。；\\n]{0,12}?'+escape(x)).test(s));
export function checkArrestEvidence(c,a,quote){
 const s=Array.isArray(quote)?quote.join('\n'):quote,input=c.input||'';
 need(!/^[\s]*[“「『"]/.test(input),'引用的句子不是当前发令。');
 need(!/(如果|假如|假设|是否|能否|讨论|听说|据说|他说|她说|转述|引用|不要|不准|不必|撤回|取消|[？?])/.test(input),'抓捕或释放尚非明确的当前命令。');
 need(/下令|命令|现在|立刻|立即|给我/.test(s),'请明确现在发令，讨论不会执行。');
 if(a.type==='release_prisoner'){need(/释放|放人|解除拘押|解除看管/.test(s)&&s.includes(a.arrest_ref),'请指出要释放的拘押记录。');return;}
 need(/抓捕|逮捕|拘押|拿下/.test(s)&&after(s,'抓捕|逮捕|拘押|拿下',a.target)&&after(s,'下令|命令|派|由|让',a.executor),'抓捕对象和执行者须来自完整原句。');
 need(typeof a.reason==='string'&&a.reason.trim()&&s.includes(a.reason),'抓捕事由须来自原句，不得替玩家编造。');
 need(a.area==='red_keep'?/红堡/.test(s):a.area==='city'&&/全城|君临|城内|街头/.test(s),'请明确搜捕范围。');
 need(a.secrecy==='secret'?/秘密|暗中/.test(s):a.secrecy==='public'&&/公开/.test(s),'请明确秘密或公开执行。');
 if(a.force){need(s.includes(a.force)&&s.includes('班组'+a.group),'请以已知部队编号及班组明确所用兵力。');}
 else need(a.count===1&&a.group===0&&/亲自|独自/.test(s),'单名近卫执行须明确亲自执行。');
}
