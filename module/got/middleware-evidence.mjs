import {characterAliases} from './portrait-data.mjs';
// Shared, conservative checks for translated dialogue. No world mutations here.
const need=(v,c)=>{if(!v)throw Error(c);};
export const normalizedQuote=s=>String(s??'').normalize('NFKC').replace(/[“”「」『』]/g,'"').replace(/[‘’]/g,"'").replace(/[\s，,。.!！?？；;：:]/g,'');
export function quoteMatches(source,quote){
 const parts=Array.isArray(quote)?quote:[quote];
 if(!parts.length||parts.length>8||parts.some(x=>typeof x!=='string'||!x.trim()))return false;
 const full=normalizedQuote(source);let offset=0;
 for(const part of parts){const q=normalizedQuote(part),at=full.indexOf(q,offset);if(at<0)return false;offset=at+q.length;}
 // Separate spans must be complete sentences. This prevents cutting out "unless".
 return parts.length===1||parts.every(p=>/[。！？!?][”」』"]?$/.test(p.trim()));
}
// Isolate balanced quoted speech only when every selected span occurs inside
// it. Unquoted text and excerpts containing narration retain the old scope.
function speechScope(source,parts){
 const pairs={'“':'”','「':'」','『':'』','‘':'’','"':'"'},stack=[],spans=[];let start=-1;
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(stack.length&&ch===stack.at(-1)){stack.pop();if(!stack.length)spans.push([start,i+1]);}
  else if(pairs[ch]){if(!stack.length)start=i;stack.push(pairs[ch]);}
 }
 if(stack.length||!spans.length)return null;
 const bare=parts.map(p=>p.trim().replace(/^[“「『‘"]|[”」』’"]$/g,''));
 const speech=spans.map(([a,b])=>source.slice(a+1,b-1)).join('\n');
 if(!quoteMatches(speech,bare))return null;
 let outside='',last=0;for(const [a,b] of spans){outside+=source.slice(last,a);last=b;}outside+=source.slice(last);
 // A quoted order mentioned as rejected is not permission to execute it.
 if(/(?:没有|没|不|未)(?:曾|能|准|必|要|会)?(?:同意|接受|答应|允许|批准|派|调|安排|授权|决定)|撤回|撤销/.test(outside))return {rejected:true};
 return {speech,parts:bare};
}
// A business decision must retain nearby conditions and quantities. Mere
// substring matching would allow extracting 答应 from 我不答应.
export function bindingQuoteMatches(source,quote){
 if(!quoteMatches(source,quote))return false;
 // Conditions sometimes occupy a separate sentence before the extracted answer.
 // Keep the whole qualifying passage or ask for clarification instead of
 // turning that answer into an unconditional grant.
 let parts=Array.isArray(quote)?quote:[quote];
 const selected=parts.join('\n');
 if((conditionalCommand(source)&&!conditionalCommand(selected))||(explicitCondition(source)&&!explicitCondition(selected)))return false;
 const scope=speechScope(String(source),parts);if(scope?.rejected)return false;
 if(scope){source=scope.speech;parts=scope.parts;}
 const text=String(source).normalize('NFKC'),full=normalizedQuote(text);
 const significant=/不|未|无|没有|除非|只有|否则|条件|如果|若|待|再|之后|以前|截至|至少|最多|[0-9零〇一二两三四五六七八九十百千万]+(?:名|人|分钟|小时|日|天|金龙|袋|桶)/;
 let offset=0;
 for(const part of parts){const q=normalizedQuote(part),at=full.indexOf(q,offset);let begin=0,end=text.length,n=0;
  for(let i=0;i<text.length;i++){const len=normalizedQuote(text[i]).length;if(n<=at&&/[。.!！？?\n]/.test(text[i]))begin=i+1;n+=len;if(n>=at+q.length){end=i+1;while(end<text.length&&!/[。.!！？?\n]/.test(text[end]))end++;break;}}
  const surrounding=normalizedQuote(text.slice(begin,end));const local=surrounding.indexOf(q);
  if(local>=0&&significant.test(surrounding.slice(0,local)+surrounding.slice(local+q.length)))return false;
  if(offset&&significant.test(full.slice(offset,at)))return false;offset=at+q.length;
 }
 return true;
}
export const quoteText=q=>Array.isArray(q)?q.join('\n'):q;
export function conditionalCommand(q){return /除非|只有|只要|如果|倘若|(?:^|[，,。；;])若|条件是|先(?:付|支付|交付|给|保证|安排替岗)[\s\S]*再(?:派|调|给|付|接|同意|答应)/.test(quoteText(q));}
export function explicitCondition(q){
 const s=quoteText(q).replace(/(?:怎么|怎|岂|哪|何)敢不(?:答应|接受|同意)/g,'遵命');
 return /(?:我|臣)?(?:不同意|不接受|不答应|不能答应|不会接受)|除非|条件是|只有[\s\S]*才|先(?:把|给|让)[\s\S]*我再(?:接|同意|答应)/.test(s);
}
function number(s){if(/^\d+(?:\.\d+)?$/.test(s))return +s;const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};let total=0,n=0,v=0;for(const ch of s){if(ch in digits)v=digits[ch];else{const u={十:10,百:100,千:1000,万:10000}[ch];if(!u)return NaN;if(u===10000){total+=(n+v||1)*u;n=0;v=0;}else{n+=(v||1)*u;v=0;}}}return total+n+v;}
const nums=(s,units)=>[...s.matchAll(new RegExp('(?<![0-9./])([0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十百千万]+)\\s*(?:个)?(?:'+units+')','g'))].map(m=>number(m[1]));
const numeral='(?:[0-9]+(?:\\.[0-9]+)?|[零〇一二两三四五六七八九十百千万]+)';
function operativeNumbers(text){
 return text.split(/([，,。；;！？!?\n])/).map(part=>{
  const background=/^\s*(?:原有|原先|原定|先前|以前|原计划|现有|已有|库存|原本)/.test(part);
  const instruction=/再派|再调|另派|另调|这次|现在|本次|改为|改成|而是|仍|继续|保持|照旧|照原|照此/.test(part);
  return background&&!instruction?'':part;
 }).join('').replace(/(?:不用|不是|不派)[0-9零〇一二两三四五六七八九十百千万]+(?:名|人)(?:[，,；;]|而是)/g,'');
}
function orderedPeople(text){
 // An explicit total with a per-shift breakdown must also be arithmetically
 // consistent. Keep ambiguity local rather than choosing whichever value fits.
 const distribution=new RegExp('('+numeral+')(?:名|人)分('+numeral+')班[，,\\s]*每班('+numeral+')(?:名|人)','g');
 for(const m of text.matchAll(distribution))need(number(m[1])===number(m[2])*number(m[3]),'ACTION_PARAMETER_NEEDS_CLARIFICATION:count_distribution');
 return text.replace(new RegExp('每(?:班|组|队|批|人)\\s*'+numeral+'\\s*(?:名|人)','g'),'');
}
export const actionParameters={
 campaign_issue:{operation:'当前campaign_operations中的id；成本及最低天数按该项资料；正式事项须会议'},nav_inspect_tunnel:{source:'guard或varys；只委托核查'},
 create_organization:{name:'原话中的机构名称；1至80字',responsibilities:'非空职责字符串数组，每项1至200字；只筹建，须会议'},
 appoint_official:{organization_ref:'筹建中的新建机构编号',title:'原话中的职位名称；1至80字',person:'实际在君临、存活且可接触的人物编号；任命须会议且本人接受另行处理'},
 grant_authority:{organization_ref:'已知机构编号',person:'已知人物编号',expires_at:'T0起累计分钟整数；晚于发令'},activate_organization:{organization_ref:'已筹建机构编号'},
 plan_guard_transfer:{organization_ref:'筹建中或已运作的新建机构编号；正式转属须会议',count:'1至100整数，单位人，受现有兵力限制',posts:'keep_same_posts保留原岗，或replace_from_reserve预备队替岗'},execute_guard_transfer:{plan_ref:'已知guard_plan编号；按其冻结人数与岗位执行'},
 grant_operation_authority:{person:'permanent_transfer限P020；audit_account限P003或P005；register_debt限实际登记人',operation:'permanent_transfer转属、audit_account审计、register_debt登记债务',target_ref:'对应的guard_plan、account或issue编号；须已知且有效',max_count:'转属为方案人数至100的整数，单位人；审计与登记债务固定为0，不代表调兵',expires_at:'T0累计分钟整数；晚于当前，最多31天'},
 temporary_detail:{count:'1至12整数，单位人',commander:'仅P016桑铎',authority_ref:'P001向P048发出、已送达的FORCE02-C有限借调授权编号',acceptance_ref:'P016对该授权的有效接受记录编号',end_at:'T0累计分钟整数；晚于当前75分钟，至多24小时，且不超授权期限'},
 cancel_order:{order_ref:'已知命令编号；撤销仍须送达'},inspect_payment:{obligation_ref:'已有应付款编号；只核验'},pay_obligation:{obligation_ref:'已核验应付款编号；金额按账本，不另填'},
 opening_decide:{meeting:'当前会议编号',issue:'当前议题编号',choice:'当前choices内的编号；由固定绑定办理'},opening_invite:{},replace_kingsguard:{plan_ref:'已有guard_plan编号；七席条件仍须成立'},
 night_patrol:{count:'1至200整数，单位人，使用现有兵力',duration:'60或120，单位分钟；一小时=60；无新招募'},
 create_project:{template:'仅records_inventory；预留10金龙，筹备30分钟、执行90分钟，沿原时期效率修正',title:'原话中的项目名称；1至100字'},
 transfer_stock:{source:'仅RES-FOOD-RK红堡、RES-FOOD-WATCH金袍子、RES-FOOD-NAVY港仓口粮池',destination:'同source允许列表；不得与source相同',amount:'正数，不超过2000标准人日口粮；不得超过可用数量；不能把袋、斤或金龙直接当人日；发出后送达，出库至入库需60分钟'}
};
export function checkActionEvidence(c,a,quote){
 const s=quoteText(quote),known=c.known||[],all=s+'\n'+known.filter(k=>k.ref==='current-input').map(k=>k.content).join('\n');
 const numeric=operativeNumbers(s);
 const checkNumber=(key,units)=>{if(a[key]===undefined)return;const values=nums(orderedPeople(numeric),units);need(values.length>0&&values.every(n=>n===a[key]),'ACTION_PARAMETER_MISMATCH:'+key);};
 checkNumber('count','名|人');if(!(a.type==='grant_operation_authority'&&['audit_account','register_debt'].includes(a.operation)&&a.max_count===0))checkNumber('max_count','名|人');
 if(a.duration!==undefined){const values=[...nums(numeric,'分钟|分'),...nums(numeric,'小时').map(n=>n*60),...nums(numeric,'时辰').map(n=>n*120)];need(values.length>0&&values.every(n=>n===a.duration),'ACTION_PARAMETER_MISMATCH:duration');}
 if(a.amount!==undefined){const values=nums(numeric,a.type==='transfer_stock'?'标准人日口粮|标准人日|人日|口粮单位|单位口粮':'袋|斤|石|份|单位|金龙|枚|桶');need(values.length>0&&values.every(n=>n===a.amount),'ACTION_PARAMETER_MISMATCH:amount_or_unit');}
 for(const k of ['end_at','expires_at'])if(a[k]!==undefined){
  const times=[];for(const m of numeric.matchAll(/T0\s*\+\s*(\d+)\s*分钟/g))times.push(+m[1]);
  for(const m of numeric.matchAll(/([0-9零〇一二两三四五六七八九十百千万]+)\s*(分钟|小时|时辰)(?:后|以后|之内|内)/g))times.push(c.at+number(m[1])*({分钟:1,小时:60,时辰:120}[m[2]]));
  for(const m of numeric.matchAll(/(?:到|至|截止|截至)(今天|今日|明天|明日|后天)?(上午|下午|晚上|夜里)?([0-9零〇一二两三四五六七八九十百千万]+)[点时](半|[0-9零〇一二两三四五六七八九十百千万]+分)?/g)){
   let h=number(m[3]);if(['下午','晚上','夜里'].includes(m[2])&&h<12)h+=12;
   const day=Math.floor((c.at+360)/1440)+({明天:1,明日:1,后天:2}[m[1]]||0),min=m[4]==='半'?30:m[4]?number(m[4].slice(0,-1)):0;
   if(h<=23&&min<60)times.push(day*1440+h*60+min-360);
  }
  need(times.length>0&&times.every(t=>t===a[k]),'ACTION_PARAMETER_NEEDS_CLARIFICATION:'+k);
 }
 if(a.posts)need((a.posts==='keep_same_posts'&&/原岗|原岗位|原来岗位/.test(s))||(a.posts==='replace_from_reserve'&&/预备队|后备人员|替岗/.test(s)),'ACTION_PARAMETER_MISMATCH:posts');
 if(a.type==='nav_inspect_tunnel')need(a.source==='varys'?/瓦里斯/.test(s):/守卫|近卫|交接/.test(s),'ACTION_PARAMETER_MISMATCH:source');
 if(a.type==='create_project')need(a.template==='records_inventory'&&/档案|文书|记录|名册|目录/.test(s),'ACTION_PARAMETER_MISMATCH:template');
 if(a.type==='grant_operation_authority')need(s.includes(a.operation)||({permanent_transfer:/转属|永久调拨/,audit_account:/审计|核账|查账/,register_debt:/登记债务|登记借款/}[a.operation]?.test(s)),'ACTION_PARAMETER_NEEDS_CLARIFICATION:operation');
 // Referenced records may be cited by ID or their exact authored names. A vague
 // "that one" is deliberately not enough to authorize a different target.
 for(const [key,value]of Object.entries(a)){
  if(!['person','commander','source','destination','organization_ref','target_ref','plan_ref','order_ref','obligation_ref','authority_ref','acceptance_ref'].includes(key)||['guard','varys'].includes(value))continue;
  const names=c.entity_names?.[value]?[...c.entity_names[value],...characterAliases(value)]:[];
  need(s.includes(value)||names.some(n=>n.length>1&&s.includes(n)),'ACTION_PARAMETER_NEEDS_CLARIFICATION:'+key);
 }
 if(a.type==='transfer_stock'){
  const names=id=>[id,...(c.entity_names?.[id]||[])],from=names(a.source).flatMap(n=>[...s.matchAll(new RegExp('(?:从|由)\\s*'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))].map(m=>m.index)),to=names(a.destination).flatMap(n=>[...s.matchAll(new RegExp('(?:到|至|给|入)\\s*'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))].map(m=>m.index));
  need(from.length===1&&to.length===1&&from[0]<to[0],'ACTION_PARAMETER_NEEDS_CLARIFICATION:transfer_direction');
 }
 for(const key of ['title','name'])if(a[key])need(s.includes(a[key]),'ACTION_PARAMETER_MISMATCH:'+key);
 if(a.responsibilities)need(a.responsibilities.every(r=>s.includes(r)),'ACTION_PARAMETER_MISMATCH:responsibilities');
 if(a.type==='campaign_issue')need(c.campaign_operations?.some(o=>o.id===a.operation&&(all.includes(o.id)||all.includes(o.label))),'ACTION_PARAMETER_MISMATCH:operation');
 return a;
}
export function requireMaterials(snapshot,input){
 const normalize=s=>s.replace(/\r\n/g,'\n').trim(),messages=snapshot.compiled.messages.map(m=>normalize(m.content));
 for(const k of ['known','guidance'])if(input[k]?.trim())need(messages.some(m=>m.includes(normalize(input[k]))),'PROMPT_MATERIAL_MISSING:'+k);
}
export function councilEvidence(batch,phaseInput){
 const evidence=[],index=new Map();
 const turns=batch.turns.map(t=>{const material=JSON.parse(phaseInput(t.context,t.pre,t.prose,'post').known);const allowed=[];
  for(const k of material.known){const key=JSON.stringify(k);if(!index.has(key)){index.set(key,evidence.length);evidence.push(k);}allowed.push(index.get(key));}
  delete material.known;
  return {turn_id:t.id,...material,allowed_evidence:allowed,input:t.context.input,prose:t.prose,pre:t.pre};
 });return {evidence,turns};
}
