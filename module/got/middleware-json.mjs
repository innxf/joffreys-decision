import '../json-repair-helper.js';
// Extract one complete object. Repairs never invent missing values or close a
// truncated object. Reasoning tags inside a quoted JSON value remain untouched.
export function parseMiddlewareJson(raw){
 let text=String(raw).trim();
 while(/^<think>/i.test(text)){const end=text.toLowerCase().indexOf('</think>');if(end<0)throw Error('INCOMPLETE_MIDDLEWARE_JSON');text=text.slice(end+8).trim();}
 text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const roots=[];let depth=0,start=-1,string=false,escape=false;
 for(let i=0;i<text.length;i++){if(!depth&&/^<think>/i.test(text.slice(i))){const end=text.toLowerCase().indexOf('</think>',i);if(end<0)throw Error('INCOMPLETE_MIDDLEWARE_JSON');i=end+7;continue;}const ch=text[i];if(string){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch==='"')string=false;continue;}if(ch==='"'&&depth){string=true;continue;}if(ch==='{'){if(!depth)start=i;depth++;}else if(ch==='}'&&depth&&!--depth)roots.push(text.slice(start,i+1));}
 if(depth||string||roots.length!==1)throw Error('INCOMPLETE_OR_AMBIGUOUS_MIDDLEWARE_JSON');
 let value=(globalThis.safeParseLLMJson||globalThis.window?.safeParseLLMJson)(roots[0],{allowRepair:false});
 if(value===null){
  // A trailing comma is structural; strings are skipped by this scanner.
  let cleaned='',quoted=false,escaped=false;
  for(let i=0;i<roots[0].length;i++){const ch=roots[0][i];if(!quoted&&ch===','&&/^\s*[}\]]/.test(roots[0].slice(i+1)))continue;cleaned+=ch;if(quoted){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')quoted=false;}else if(ch==='"')quoted=true;}
  value=(globalThis.safeParseLLMJson||globalThis.window?.safeParseLLMJson)(cleaned,{allowRepair:false});
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_MIDDLEWARE_JSON');return value;
}
