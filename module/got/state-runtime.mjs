import {settleReviewDates} from './reform-meetings.mjs';
import {settleAudienceRequests} from './audience-requests.mjs';
import {initializeHousehold,settleDaily} from './daily-engine.mjs';
import {settleGuards,synchronizeGuardPresence} from './household-guards.mjs';
import {worldOps} from './world-engine.mjs';
import {initializeNavigation} from './navigation-engine.mjs';
import {initializeCampaign} from './campaign-engine.mjs';
import {applyCouncilAction,liveCouncil} from './council-session.mjs';
import {initializeOpening} from './opening-engine.mjs';
import {canonical,validateWorld} from './state-validation.mjs';
import {initializeExecution,applyWorldAction,executionView,RuleError,settleNightAfterActivity} from './world-engine.mjs';
import {initializePolitics} from './political-engine.mjs';
import {applyFinaleAction,finaleView} from './finale-engine.mjs';
import {initializeDialogue} from './dialogue-core.mjs';
import {applyDialogueAction,afterWorldAction,invalidateDecisions} from './dialogue-engine.mjs';
import {initializeMemory,queueMemory,applyMemoryAction,rebranchMemory} from './memory-core.mjs';
import {initializeAutonomy,rebranchAutonomy} from './autonomy-core.mjs';

const clone = v => structuredClone(v);
function freeze(v) { if (v && typeof v === 'object') {Object.values(v).forEach(freeze);Object.freeze(v);} return v; }
const token = app => app?.gameData?.got ? app.gameData.got.revision.branch_id+'|'+app.gameData.got.revision.state_id : app ? 'legacy' : null;
// Thin adapter over upstream variableSystem/storageService. Not a replacement store.
export function createGotRuntime({baseline,schema,sourceHash,storage,variables,finaleContent=null,enableOpening=false,enableCampaign=false,enableCourtLife=false,councilVersion=3,authoredPlay=false,presentation=null,pendingDialogue=null,onPublish=()=>{},id=()=>crypto.randomUUID()}) {
  let formal=null, persistedToken=null, tail=Promise.resolve();
  const serial = fn => { const next=tail.then(fn);tail=next.catch(()=>{});return next; };
  const read = () => formal ? clone(formal) : null;
  function check(got) { const errors=validateWorld(got,schema,sourceHash);if(errors.length) throw Error('INVALID_STATE: '+errors.slice(0,6).join('; ')); }
  function publish(got) {
    formal=freeze(clone(got));
    // A mirror for the inherited prompt/template interface, never a competing authority.
    variables.importSession({got:formal});
    try {onPublish(freeze({got:clone(formal)}));} catch(e) {console.error('GOT presentation failed after save',e);}
  }
  async function persist(got) {
    check(got);
    const app={gameData:{got:clone(got)}};
    await storage.writeGotState(app,persistedToken);
    persistedToken=token(app);
    publish(got); // only after durable success
  }
  function failure(status,code) { return {status:'not_committed',replayed:false,settlement_ref:null,
    world_revision:formal?.revision.state_id??null,validation:{status,code}}; }
  function fresh(snapshot=baseline) {
    const got=clone(snapshot);
    got._runtime={version:'m2-political-v3',contract_version:'c1.2',rule_version:'m2-political-3',run_id:id(),source_sha256:sourceHash,briefing_reads:[],receipts:[]};
    if(!got.execution)initializeExecution(got);
    initializeDialogue(got);
    initializeMemory(got);
    initializeAutonomy(got);
    if(enableOpening&&!got.finale)initializeOpening(got,enableOpening!=='legacy');
    if(enableCampaign&&!got.finale)initializeCampaign(got);
    if(enableCourtLife)initializeHousehold(got,{fresh:true});
    got.revision.branch_id='branch-'+id();
    rebranchMemory(got);
    rebranchAutonomy(got);
    if(got.finale)got.finale.binding_branch=got.revision.branch_id;
    // Source meta describes the author baseline, kept intact for provenance.
    return got;
  }
  async function init() {
    return serial(async()=>{
      await storage.init();
      const saved=await storage.readGotState();persistedToken=token(saved);
      if (saved?.gameData?.got) {
        check(saved.gameData.got);
        if(saved.gameData.got._runtime.version!=='m2-political-v3'||!saved.gameData.got.dialogue||!saved.gameData.got.memory||!saved.gameData.got.autonomy||(saved.gameData.got.opening?.version===2&&(!saved.gameData.got.opening.navigation||(enableCourtLife&&!saved.gameData.got.opening.household&&!saved.gameData.got.activities.some(a=>a.status==='active')&&!saved.gameData.got.campaign?.scene&&!saved.gameData.got.opening.travel)))){
          await storage.saveGotSlot({saveName:'运行资料更新前备份',gameData:saved.gameData,createdAt:Date.now()});
          const next=clone(saved.gameData.got);upgrade(next);next.revision.parent_state_id=next.revision.state_id;next.revision.state_id='state-'+id();
          next.revision.commit_id='migration-'+id();next.revision.applied_commit_ids.push(next.revision.commit_id);await persist(next);return {status:'migrated'};
        }
        initializeNavigation(saved.gameData.got);publish(saved.gameData.got);return {status:'restored'};
      }
      if (saved) return {status:'legacy_present'}; // do not overwrite M1 or migrate old progress
      await persist(fresh());return {status:'initialized'};
    });
  }
  function startNew(snapshot=baseline) {const copy=clone(snapshot);return serial(async()=>{await persist(fresh(copy));return read();});}
  function upgrade(got){initializeNavigation(got);if(enableCourtLife)initializeHousehold(got);if(got._runtime.version==='m2-state-v1')initializeExecution(got);else if(got._runtime.version==='m2-world-v2')initializePolitics(got);got._runtime.version='m2-political-v3';got._runtime.rule_version=got.projects.some(p=>p.policy?.template==='general_reform')?'m2-political-3-reform-1':'m2-political-3';initializeDialogue(got);initializeMemory(got);initializeAutonomy(got);queueMemory(got);}
  function prepareAction(action,sourceRefs=[]){
    if(!formal)throw Error('NO_GAME');
    return {contract_version:'c1.2',id:id(),branch_id:formal.revision.branch_id,parent_revision:formal.revision.state_id,
      as_of_minute:formal.clock.elapsed_minutes,origin:'player_ui',source_refs:clone(sourceRefs),action:clone(action)};
  }
  function prepareSettlementAction(action){return {...prepareAction(action),origin:'dialogue_worker'};}
  function prepareBackgroundAction(action){return {...prepareAction(action,action.job_ref?[action.job_ref]:[]),origin:'execution_worker'};}
  function prepareBriefingRead(briefingId) {
    if(!formal) throw Error('NO_GAME');
    return {contract_version:'c1.2',id:id(),branch_id:formal.revision.branch_id,parent_revision:formal.revision.state_id,
      as_of_minute:formal.clock.elapsed_minutes,origin:'player_ui',source_refs:[briefingId],
      action:{type:'acknowledge_briefing',briefing_id:briefingId}};
  }
  function commit(input) {
    // Freeze at submission: caller mutation during an awaited storage write cannot alter it.
    let c;
    try {c=clone(input);}catch {return Promise.resolve(failure('invalid','INVALID_CANDIDATE'));}
    return serial(async()=>{
      if(!formal) return failure('blocked','NO_GAME');
      const keys=['contract_version','id','branch_id','parent_revision','as_of_minute','origin','source_refs','action'];
      if (!c || keys.some(k=>!Object.hasOwn(c,k)) || Object.keys(c).some(k=>!keys.includes(k)) ||
        c.contract_version!=='c1.2' || typeof c.id!=='string' || !c.id || typeof c.action!=='object' || !c.action ||
        !Array.isArray(c.source_refs) || !['player_ui','execution_worker','dialogue_worker'].includes(c.origin)) return failure('invalid','INVALID_CANDIDATE');
      if(c.origin==='execution_worker'&&!['autonomy_begin','autonomy_result','autonomy_fail','autonomy_finish','autonomy_continue_time'].includes(c.action.type))return failure('invalid','INVALID_BACKGROUND_ACTION');
      if(c.origin==='dialogue_worker'&&!['dialogue_post_checkpoint','dialogue_settle','council_v3_extract'].includes(c.action.type))return failure('invalid','INVALID_BACKGROUND_ACTION');
      if(c.branch_id!==formal.revision.branch_id) return failure('stale','STALE_BRANCH');
      const fingerprint=canonical(c);
      const old=formal._runtime.receipts.find(r=>r.id===c.id);
      if(old) return old.fingerprint===fingerprint ? {...clone(old.result),replayed:true} : failure('invalid','DUPLICATE_ID_MISMATCH');
      if(c.origin!=='dialogue_worker'&&(c.parent_revision!==formal.revision.state_id || c.as_of_minute!==formal.clock.elapsed_minutes)) return failure('stale','STALE_REVISION');
      if(pendingDialogue&&(/^(guard_|nav_|daily_|wait$|start_activity|end_activity|advance_activity|opening_|campaign_|council_begin|audience_visit|order_arrest|release_prisoner)/.test(c.action.type))){const draft=await pendingDialogue();if(draft&&draft.context?.branch===formal.revision.branch_id&&!['done','discarded','stale'].includes(draft.status)&&!formal.dialogue.turns.some(t=>t.id===draft.id))return failure('blocked','当前发言尚未完成，请先保存或取消这轮对话。');}
      const next=read(),resultRevision='state-'+id();let code='BRIEFING_READ_ONLY';
      if(c.action.type==='acknowledge_briefing'){
      if(Object.keys(c.action).sort().join(',')!=='briefing_id,type' || c.source_refs.length!==1 || c.source_refs[0]!==c.action.briefing_id)
        return failure('invalid','INVALID_ACTION');
      const b=formal.briefing.find(b=>b.id===c.action.briefing_id && b.recipient==='U001');
      if(!b) return failure('invalid','BRIEFING_NOT_VISIBLE');
      if(b.message_refs.some(ref=>!formal.messages.some(m=>m.id===ref && m.recipient==='U001' && m.status==='已收到' && m.delivered_minute<=formal.clock.elapsed_minutes)))
        return failure('blocked','MESSAGE_NOT_DELIVERED');
      if(!next._runtime.briefing_reads.includes(b.id)) next._runtime.briefing_reads.push(b.id);
      }else{
        try{
          if(c.action.type.startsWith('finale_'))code=applyFinaleAction(next,c.action,{...c,result_revision:resultRevision,councilVersion,authoredPlay},finaleContent);
          else if(next.finale?.freeze)throw new RuleError('FINALE_WORLD_ACTION_DISABLED');
          else {
            invalidateDecisions(next);
            if(c.action.type.startsWith('memory_')){try{code=applyMemoryAction(next,c.action);}catch(e){throw new RuleError(e.message,'invalid');}}
            else if(c.action.type.startsWith('council_'))code=applyCouncilAction(next,c.action,{...c,result_revision:resultRevision,councilVersion,authoredPlay});
            else if(liveCouncil(next)&&!['dialogue_post_checkpoint','dialogue_settle'].includes(c.action.type)&&!c.action.type.startsWith('guard_')&&c.action.type!=='daily_preferences')throw new RuleError('大臣们还在等您的裁决，请先完成会议。');
            else if(c.action.type.startsWith('dialogue_'))code=applyDialogueAction(next,c.action,{...c,result_revision:resultRevision,councilVersion,authoredPlay});
            else {const before=clone(next);code=applyWorldAction(next,c.action,{...c,result_revision:resultRevision,councilVersion,authoredPlay});afterWorldAction(before,next,c.action,c);}
            if(['end_activity','opening_scene_end','campaign_choose','council_finish'].includes(c.action.type))settleNightAfterActivity(next,{...c,result_revision:resultRevision,councilVersion,authoredPlay});
            if(enableCourtLife&&!next.opening?.household)initializeHousehold(next);
            settleGuards(next);synchronizeGuardPresence(next,c.id);
            if(next.opening?.household&&!next.finale)settleDaily(next,{...c,result_revision:resultRevision},worldOps);
            settleReviewDates(next);settleAudienceRequests(next,worldOps);
            queueMemory(next);
          }
        }
        catch(e){if(e instanceof RuleError)return failure(e.status,e.message);throw e;}
      }
      const oldRevision=next.revision.state_id;
      next.revision.state_id=resultRevision;next.revision.parent_state_id=oldRevision;
      next.revision.commit_id=c.id;next.revision.applied_commit_ids.push(c.id);
      const result={status:'committed',replayed:false,settlement_ref:'receipt:'+c.id,world_revision:next.revision.state_id,validation:{status:'ready',code}};
      next._runtime.receipts.push({id:c.id,fingerprint,result:clone(result)});
      try {await persist(next);return result;}
      catch(e) {return failure(e.message==='STALE_STORAGE'?'stale':'blocked',e.message==='STALE_STORAGE'?'STALE_STORAGE':e.message.startsWith('INVALID_STATE:')?'INVALID_STATE':'SAVE_FAILED');}
    });
  }
  function exportSave(name='权游存档') {
    if(!formal) throw Error('NO_GAME');
    // Same inherited payload envelope; omit unrelated legacy caches/config/secrets.
    return {saveName:name,gameData:{got:read()},createdAt:Date.now(),...(presentation?{presentation:presentation.capture(read())}:{})};
  }
  function saveSlot(name) {return serial(()=>storage.saveGotSlot(exportSave(name)));}
  function restore(payload) {
    const copy=clone(payload);
    return serial(async()=>{
      const got=copy?.gameData?.got;check(got);
      const next=clone(got);
      upgrade(next);
      // Every load creates a distinct branch even if loaded at the exact same turn.
      next.revision.parent_state_id=got.revision.state_id;
      next.revision.state_id='state-'+id();next.revision.branch_id='branch-'+id();
      for(const t of next.dialogue?.turns||[])if(t.settlement&&!['done','partial'].includes(t.settlement.status)){t.settlement.branch=next.revision.branch_id;if(t.settlement.status==='running')t.settlement.status='interrupted';}
      const work=liveCouncil(next)?.session.work;if(work?.context){work.context.branch=next.revision.branch_id;work.context.world=next.revision.state_id;}
      rebranchMemory(next);
      rebranchAutonomy(next);
      next.revision.commit_id='restore-'+id();next.revision.applied_commit_ids.push(next.revision.commit_id);
      if(next.finale){next.finale.binding_branch=next.revision.branch_id;if(next.finale.ending){next.finale.ending.branch_id=next.revision.branch_id;next.finale.ending.continuation_state_ref=next.revision.state_id;}}
      await persist(next);if(presentation)try{presentation.restore(copy.presentation,next);}catch(e){console.warn('Reading position could not be restored',e);}return read();
    });
  }
  function playerView() {
    if(!formal) return null;
    return {...executionView(formal),elapsed_minutes:formal.clock.elapsed_minutes,phase:formal.clock.display_phase,
      revision:formal.revision.state_id,briefing:formal.briefing.filter(b=>b.recipient==='U001').map(b=>({
        id:b.id,title:b.title,prompt:b.decision_prompt,read:formal._runtime.briefing_reads.includes(b.id),
        reports:b.message_refs.map(ref=>formal.messages.find(m=>m.id===ref && m.recipient==='U001' && m.status==='已收到' && m.delivered_minute<=formal.clock.elapsed_minutes)).filter(Boolean).map(m=>m.content)
      }))};
  }
  return {init,startNew,read,prepareAction,prepareBackgroundAction,prepareSettlementAction,prepareBriefingRead,commit,exportSave,saveSlot,restore,playerView,finaleView:()=>formal?finaleView(formal):null};
}
