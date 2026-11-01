import {custodyErrors} from './custody-state.mjs';
import {mechErrors} from './stance-engine.mjs';
import {audienceRequestErrors} from './audience-requests.mjs';
import {reformErrors} from './reform-engine.mjs';
import {householdErrors} from './daily-engine.mjs';
import {navigationErrors} from './navigation-engine.mjs';
import {campaignErrors} from './campaign-engine.mjs';
import {openingErrors} from './opening-engine.mjs';
import {dialogueErrors} from './dialogue-engine.mjs';
import {memoryErrors} from './memory-core.mjs';
import {autonomyErrors} from './autonomy-core.mjs';
import {executionSchemas,policySchema,politicsSchema,worldInvariantErrors} from './world-schema.mjs';
import {finaleErrors} from './finale-engine.mjs';
// Deliberately bounded to the keywords used by opening.schema.json.
// Unsupported schema keywords fail closed rather than being silently ignored.
const keywords = new Set(['type','properties','required','additionalProperties','items','minimum',
  'minLength','enum','maxItems','minItems','uniqueItems','propertyNames','pattern','$schema','title','description']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function validateSchema(value, schema, path = '$', errors = []) {
  for (const key of Object.keys(schema)) if (!keywords.has(key)) errors.push(`${path}: unsupported schema ${key}`);
  const matches = t => t === 'object' ? object(value) : t === 'array' ? Array.isArray(value) :
    t === 'null' ? value === null : t === 'integer' ? Number.isSafeInteger(value) :
    t === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === t;
  if (schema.type && ![].concat(schema.type).some(matches)) { errors.push(`${path}: type`); return errors; }
  if (schema.enum && !schema.enum.some(v => canonical(v) === canonical(value))) errors.push(`${path}: enum`);
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) errors.push(`${path}: minLength`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: pattern`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems`);
    if (schema.uniqueItems && new Set(value.map(canonical)).size !== value.length) errors.push(`${path}: uniqueItems`);
    if (schema.items) value.forEach((v,i) => validateSchema(v,schema.items,`${path}[${i}]`,errors));
  }
  if (object(value)) {
    for (const key of schema.required || []) if (!Object.hasOwn(value,key)) errors.push(`${path}.${key}: required`);
    for (const [key,v] of Object.entries(value)) {
      if (['__proto__','prototype','constructor'].includes(key)) errors.push(`${path}.${key}: unsafe key`);
      if (schema.propertyNames) validateSchema(key,schema.propertyNames,`${path} key`,errors);
      if (schema.properties && Object.hasOwn(schema.properties,key)) validateSchema(v,schema.properties[key],`${path}.${key}`,errors);
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: unknown field`);
      else if (object(schema.additionalProperties)) validateSchema(v,schema.additionalProperties,`${path}.${key}`,errors);
    }
  }
  return errors;
}
const str = {type:'string',minLength:1};
const resultSchema = {type:'object',properties:{status:{enum:['committed'],type:'string'},replayed:{type:'boolean'},
  settlement_ref:str,world_revision:str,validation:{type:'object',properties:{status:{enum:['ready'],type:'string'},code:str},required:['status','code'],additionalProperties:false}},
  required:['status','replayed','settlement_ref','world_revision','validation'],additionalProperties:false};
export const runtimeSchema = {type:'object',properties:{
  version:{type:'string',enum:['m2-state-v1','m2-world-v2','m2-political-v3']},contract_version:{type:'string',enum:['c1.2']},
  rule_version:{type:'string',enum:['m2-state-1','m2-world-2','m2-political-3','m2-political-3-reform-1']},run_id:str,source_sha256:str,
  briefing_reads:{type:'array',uniqueItems:true,items:str},
  receipts:{type:'array',items:{type:'object',properties:{id:str,fingerprint:str,result:resultSchema},required:['id','fingerprint','result'],additionalProperties:false}}
},required:['version','contract_version','rule_version','run_id','source_sha256','briefing_reads','receipts'],additionalProperties:false};

export function validateWorld(got, schema, sourceHash) {
  if (!object(got)) return ['not GOT state'];
  const {_runtime,administration,authorities,assignments,activities,execution,politics,finale,dialogue,memory,autonomy,opening,campaign,...base} = got;
  const politicalMode=_runtime?.version==='m2-political-v3';
  const worldMode=_runtime?.version==='m2-world-v2'||politicalMode;
  const policyErrors=[];
  if(Array.isArray(base.actors))base.actors=base.actors.map(a=>{
    if(!Object.hasOwn(a,'mech_profile'))return a;
    const {mech_profile,...record}=a;
    policyErrors.push(...mechErrors(mech_profile,got));return record;
  });
  if(Array.isArray(base.projects))base.projects=base.projects.map(p=>{
    if(!Object.hasOwn(p,'policy'))return p;
    const {policy,...record}=p;
    if(!worldMode)policyErrors.push('legacy save cannot carry policy');
    if(policy.template==='general_reform')policyErrors.push(...reformErrors(p,got));else validateSchema(policy,policySchema,'$.projects.policy',policyErrors);return record;
  });
  const effectiveSchema=structuredClone(schema);
  if(autonomy)effectiveSchema.properties.orders.items.properties.status.enum.push('等待条件');
  if(finale)effectiveSchema.properties.kingsguard.items.properties.holder.type=['string','null'];
  const errors = validateSchema(base,effectiveSchema);
  errors.push(...householdErrors(got));errors.push(...openingErrors(got));errors.push(...navigationErrors(got));
  errors.push(...campaignErrors(got));errors.push(...audienceRequestErrors(got),...custodyErrors(got));
  errors.push(...finaleErrors(finale,got));
  errors.push(...dialogueErrors(dialogue,got));
  errors.push(...memoryErrors(memory,got));
  errors.push(...autonomyErrors(autonomy,got));
  errors.push(...policyErrors);
  if(worldMode){
    for(const [key,s] of Object.entries(executionSchemas))validateSchema(got[key],s,'$.'+key,errors);
    if(politicalMode)validateSchema(politics,politicsSchema,'$.politics',errors);else if(politics!==undefined)errors.push('legacy political extension mismatch');
    if(!errors.length)errors.push(...worldInvariantErrors(got));
    if(_runtime.rule_version!==(politicalMode?(got.projects.some(p=>p.policy?.template==='general_reform')?'m2-political-3-reform-1':'m2-political-3'):'m2-world-2'))errors.push('rule version mismatch');
  }else if([administration,authorities,assignments,activities,execution,politics].some(v=>v!==undefined))errors.push('legacy extension mismatch');
  validateSchema(_runtime,runtimeSchema,'$._runtime',errors);
  if (got.model_id !== 'got-phase1-state' || got.model_version !== '1.1.0') errors.push('unsupported baseline version');
  if (_runtime?.source_sha256 !== sourceHash) errors.push('baseline source mismatch');
  // Record IDs are local to each collection. Not a second global naming scheme.
  for (const [key,rows] of Object.entries(base)) if (Array.isArray(rows) && rows.every(r => object(r) && typeof r.id === 'string')) {
    if (new Set(rows.map(r=>r.id)).size !== rows.length) errors.push(`${key}: duplicate id`);
  }
  if (!Array.isArray(got.kingsguard) || got.kingsguard.length !== 7 || new Set(got.kingsguard.filter(r=>r.holder!==null).map(r=>r.holder)).size !== got.kingsguard.filter(r=>r.holder!==null).length) errors.push('seven distinct Kingsguard seats required');
  if (Array.isArray(got.actors) && Array.isArray(got.kingsguard)) {
    const ids = new Set(got.actors.map(a=>a.id));
    if (got.kingsguard.some(r=>r.holder!==null&&!ids.has(r.holder))) errors.push('Kingsguard holder missing');
  }
  if (Array.isArray(got.resources) && Array.isArray(got.reservations)) {
    for (const r of got.resources) {
      const used=got.reservations.filter(x=>x.resource_id===r.id && ['有效','部分使用'].includes(x.status)).reduce((n,x)=>n+x.amount,0);
      if (r.quantity.value !== null && used > r.quantity.value) errors.push(`${r.id}: reservations exceed quantity`);
    }
    if (got.reservations.some(x=>!got.resources.some(r=>r.id===x.resource_id))) errors.push('reservation resource missing');
  }
  if (_runtime && Array.isArray(_runtime.receipts) && Array.isArray(_runtime.briefing_reads)) {
    if (new Set(_runtime.receipts.map(r=>r.id)).size !== _runtime.receipts.length) errors.push('duplicate receipt');
    if (_runtime.briefing_reads.some(id=>!got.briefing?.some(b=>b.id===id && b.recipient==='U001'))) errors.push('unknown briefing read');
  }
  return errors;
}
