// Token estimator ported from Ji-Haitang/char_card_1 module/token-utils.js,
// commit 5cec5f53c3304f5c6d9e2e7e15c15d3823341cfa. See 参考/姬侠传-5cec5f5/来源.json.
// Changes: typed ES exports; shared transport/storage limits and budget checks below are local.
export function estimate(text       )        {
 if(!text)return 0;
 const cjk=(text.match(/[\u4e00-\u9fff\u3000-\u303f]/g)||[]).length;
 return Math.ceil(Math.ceil(cjk*1.5+(text.length-cjk)/4)*1.1);
}
export function estimateMessages(messages                   )        {
 return messages.reduce((total,m)=>total+4+estimate(m.content||''),0);
}
export const BUDGET={context:128000,output:18000,softInput:70000,hardInput:80000,
 timeoutMs:300000,maxTimeoutMs:1800000,maxTextChars:500000,maxRequestBytes:8000000,maxResponseBytes:8000000,maxSaveBytes:64000000}         ;
                                                                      
                                                                                                                                                                                 
export function checkCapacity(c         ){for(const v of [c.contextTokens,c.outputTokens])if(v!==undefined&&(!Number.isSafeInteger(v)||v<1))throw Error('服务容量必须是正整数；未知时留空。');}
export function budgetLimits(context       ,output       ,c         ={}){
 checkCapacity(c);
 if(!Number.isSafeInteger(context)||!Number.isSafeInteger(output)||output<1||context<=output)throw Error('上下文容量必须大于正整数输出预算。');
 if(c.outputTokens!==undefined&&output>c.outputTokens)throw Error('输出预算超过填写的服务输出上限；请修改预设或核实服务能力。');
 const effective=Math.min(context,c.contextTokens??context),inputLimit=Math.min(BUDGET.hardInput,effective-output);
 if(inputLimit<1)throw Error('服务上下文无法同时容纳输出预留与输入。');
 return {context:effective,outputReserve:output,inputLimit,softInput:Math.min(BUDGET.softInput,inputLimit),capacityVerified:c.contextTokens!==undefined&&c.outputTokens!==undefined};
}
