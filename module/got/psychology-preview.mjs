// Offline, read-only psychology prototype. No production caller or state writer.
import {actorEvidence, profiles} from './dialogue-core.mjs';
import {characterMaterials} from './character-state.mjs';
import {memoryMaterials} from './memory-core.mjs';

const copy = structuredClone;
const need = (ok, code) => { if (!ok) throw Error('PSYCHOLOGY_' + code); };
const common = {crown_recognized:['yes','no'], coercive_pressure:['high','low']};
export const psychologyVocabulary = Object.freeze({
  arrest: {...common, order_notice:['received','warning','custody'], force_control:['reliable','contested'],
    target_position:['located','uncertain'], target_preparation:['prepared','unprepared'], preparation_window:['brief','extended'],
    target_tie:['patron','family','none'], personal_stake:['threatened','protected'], accountability:['credible','weak']},
  marriage: {...common, finance:['independent','dependent'], force_control:['reliable','contested'],
    force_capacity:['proven','unproven'], battle_credit:['personal','shared','allied'], promise_record:['kept','broken'],
    proposal_style:['exchange','command'], goal_dynasty:['preserved','lost','unclear'], goal_family_order:['preserved','lost','unclear']},
  treatment: {threat:['active','ceased'], outside_support:['available','cut_off'], safety_source:['king_only','independent'],
    escape_channel:['credible','closed'], guards:['restrictive','permissive'], marriage_relief:['delivered'], gift:['received'],
    protection:['kept'], refusal:['respected','punished'], kin_loss:['received'], blame:['king','uncertain','other'],
    // Longitudinal patterns require author-reviewed interpretation; no interaction-count thresholds.
    pattern:['coercive_dependency','stable_respect','costly_autonomous_closeness']}
});
const eventKeys = new Set(['marriage_relief','gift','protection','refusal','kin_loss']);
const experienceKinds = new Set(['observation','report','own_status','relationship']);
const actors = {arrest:['P001','P002','P015','P016','P020'],marriage:['P002'],treatment:['P012']};

export function buildPsychologyFrame(world, request) {
  need(request && typeof request.id === 'string' && request.id.length > 0, 'TOPIC');
  need(actors[request.kind]?.includes(request.actor), 'UNSUPPORTED_CASE_ACTOR');
  need(['private','public'].includes(request.setting), 'SETTING');
  const g = copy(world), actor = request.actor, profile = profiles[actor];
  const known = actorEvidence(g, actor), memory = memoryMaterials(g, actor);
  const all = [...known,...memory.long,...memory.recent,...memory.recalled,...(memory.latest?[memory.latest]:[])];
  const byRef = new Map();
  for (const row of all) {
    need(typeof row.ref === 'string' && Number.isFinite(row.at) && row.at <= g.clock.elapsed_minutes, 'EVIDENCE_TIME');
    if (!byRef.has(row.ref)) byRef.set(row.ref, row);
  }
  return copy({version:1, topic:request.id, kind:request.kind, actor, setting:request.setting,
    branch:g.revision.branch_id, world:g.revision.state_id, at:g.clock.elapsed_minutes,
    profile, character:characterMaterials(g, actor, known),
    priorities:g.dialogue?.agendas?.[actor]?.priorities || profile.priorities, known:[...byRef.values()]});
}

function collect(frame, input) {
  need(input && input.origin === 'reviewed' && Array.isArray(input.signals), 'REVIEWED_INPUT_REQUIRED');
  for (const key of ['topic','actor','branch','world','at']) need(input[key] === frame[key], 'STALE_OR_WRONG_SCOPE');
  const evidence = new Map(frame.known.map(k=>[k.ref,k])), active = new Map(), disputed = [], seen = new Set();
  for (const s of input.signals) {
    need(s && psychologyVocabulary[frame.kind][s.key]?.includes(s.value), 'SIGNAL');
    need(['believed','disputed'].includes(s.belief), 'BELIEF');
    need(Array.isArray(s.refs) && s.refs.length > 0 && typeof s.quote === 'string' && s.quote.trim().length > 0, 'CITATION');
    const rows = s.refs.map(ref=>{need(evidence.has(ref), 'UNKNOWN_EVIDENCE');return evidence.get(ref);});
    need(rows.some(r=>r.content.includes(s.quote)), 'QUOTE');
    if (eventKeys.has(s.key) || s.key === 'pattern') {
      need(rows.every(r=>experienceKinds.has(r.kind)), 'EXPERIENCE_REQUIRED');
      if (s.key === 'pattern') need(s.review === 'author', 'PATTERN_REVIEW_REQUIRED');
    }
    const stamp = JSON.stringify([s.key,s.value,s.belief,[...s.refs].sort()]);
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    if (s.belief === 'disputed') {disputed.push(copy(s));continue;}
    const at = Math.max(...rows.map(r=>r.at)), old = active.get(s.key);
    if (!old || at > old.at) active.set(s.key, {...copy(s),at});
    else if (at === old.at) need(s.value === old.value, 'CONFLICTING_EVIDENCE');
  }
  return {active,disputed};
}

export function evaluatePsychology(world, request, input) {
  const f = buildPsychologyFrame(world, request), {active,disputed} = collect(f,input);
  const v = key => active.get(key)?.value || 'unknown', yes = (k,x) => v(k) === x;
  const trace = [], missing = new Set();
  const rule = (id, keys, explanation) => {
    keys.filter(k=>!active.has(k)).forEach(k=>missing.add(k));
    trace.push({id, explanation, refs:[...new Set(keys.flatMap(k=>active.get(k)?.refs||[]))], profile:f.profile.source});
  };
  let internal = {}, expression = {}, tendencies = [], deferred = [];
  if (f.kind === 'arrest') {
    const notice = v('order_notice'), threatened = yes('personal_stake','threatened');
    const linked = ['patron','family'].includes(v('target_tie')) || ['P001','P002','P015'].includes(f.actor);
    internal = {notice, crown:v('crown_recognized'), perceived_control:v('force_control'),
      target_location:v('target_position'), preparedness:v('target_preparation'), preparation:v('preparation_window'),
      conflict:notice==='unknown'?'unaware':linked||threatened?'personal_interest_conflict':v('target_tie')==='unknown'||v('personal_stake')==='unknown'?'unresolved_interests':'assess_task_risk',
      pressure:v('coercive_pressure'), execution_confidence:'unknown'};
    rule('arrest.notice',['order_notice'],'只有本人已收到的命令、警告或拘押消息触发相应反应；未知时不预演为已知。');
    if (notice !== 'unknown') {
      if (yes('force_control','reliable') && yes('target_position','located') && yes('target_preparation','unprepared')) internal.execution_confidence='perceived_favourable';
      if (yes('force_control','contested') || yes('target_preparation','prepared')) internal.execution_confidence='expects_resistance';
      rule('arrest.capacity',['force_control','target_position','target_preparation','preparation_window'],'这是本人对可行性的认识；真实控制、准备耗时与现场胜负仍由执行模块结算。');
      if (f.actor === 'P001') {
        tendencies = notice==='custody'?['seek_information','seek_family_support']:['question_king','seek_council_or_family_support'];
        internal.conflict='maternal_status_and_safety_threat';
        expression={public:yes('coercive_pressure','high')?'guarded_status_protest':'assert_queen_mother_status',private:'hurt_anger_and_questioning'};
      } else if (['P002','P015'].includes(f.actor)) {
        tendencies=['seek_reasons_and_family_safety','consider_pressure'];
        expression={public:yes('coercive_pressure','high')?'controlled_objection':'demand_explanation',private:'family_interest_conflict'};
      } else {
        if (linked || threatened) tendencies.push('consider_delay_or_protect_target');
        if (yes('accountability','weak') && (linked || threatened)) tendencies.push('consider_concealment_or_warning');
        if (yes('accountability','credible') || yes('target_tie','none') && yes('personal_stake','protected')) tendencies.push('consider_careful_compliance');
        expression={public:yes('coercive_pressure','high')?'deferential_or_guarded':'qualified_response',private:internal.conflict};
      }
      rule('arrest.conflict',['target_tie','personal_stake','coercive_pressure','accountability'],'利益冲突影响顾虑与候选倾向；压力可约束表露，不能等同真心赞成，也不自动产生背叛。');
    } else expression={public:'no_case_specific_response',private:'no_case_specific_response'};
    deferred=['actual_command_chain','preparation_clock','leak_delivery','force_conflict','release_or_escape','post_capture_spread'];
  }
  if (f.kind === 'marriage') {
    const independent = yes('finance','independent') && yes('force_control','reliable') && yes('force_capacity','proven');
    const stance = independent?'political_counterparty':yes('finance','dependent')?'family_dependent':f.character.state.attitude==='bargaining'?'existing_bargaining':'unresolved';
    const goals = {dynasty:v('goal_dynasty'),family_order:v('goal_family_order')};
    const preserved = Object.values(goals).every(x=>x==='preserved'), lost = Object.values(goals).includes('lost');
    internal = {crown:v('crown_recognized'), bargaining_position:stance,
      competence:{finance:v('finance'),military:v('force_capacity'),personal_battle_credit:v('battle_credit')},
      dependence_on_allies:yes('finance','dependent')||yes('battle_credit','allied')?'material_dependency':'not_established',
      goals, promise_trust:v('promise_record'), private_affinity:'unchanged',
      proposal:lost?'interest_conflict':preserved&&yes('promise_record','kept')?'credible_exchange':preserved?'verify_guarantees':'needs_concrete_alternative',
      view_update:independent?'recognize_capacity_without_affection':'no_new_capacity_conclusion'};
    rule('tywin.power',['crown_recognized','finance','force_control','force_capacity','battle_credit'],'名分、财政、实际控制、战力及本人战功分开；援军功劳不自动兑换国王个人能力。只读取泰温获知并相信的材料。');
    rule('tywin.interest',['goal_dynasty','goal_family_order','promise_record'],'只核对档案已有的家族延续与家族秩序目标；可交换不等于已经同意婚事，也不增加私人好感。');
    if (yes('proposal_style','command') && (lost || !preserved)) {
      internal.conflict='crown_vs_family_control';
      internal.view_update='resent_override_capacity_assessed_separately';
    }
    expression={public:yes('coercive_pressure','high')?'restrained_conditions':stance==='family_dependent'?'paternal_correction':'negotiate_conditions',
      private:internal.proposal==='credible_exchange'?'discuss_price_and_guarantees':'press_family_interests'};
    tendencies=[internal.proposal==='credible_exchange'?'consider_substitution':'seek_terms_or_counterproposal'];
    rule('tywin.expression',['proposal_style','coercive_pressure'],'强令会触发名分与家长权力冲突；外表克制、承认实力与内心反对可以共存。');
    deferred=['marriage_commitment','alternative_resources','formal_agreement','persist_relationship'];
  }
  if (f.kind === 'treatment') {
    const baseline=f.character.state.attitude, controlled=baseline==='controlled', afraid=controlled||baseline==='extreme_fear';
    internal={fear:afraid?'high':'guarded',trust:['trust','complex_affection'].includes(baseline)?'limited':'uncertain',
      gratitude:'not_established',grievance:'father_death_unresolved',attachment:controlled?'fear_dependency':baseline==='complex_affection'?'complex_affection':'unresolved',
      agency:afraid?'suppressed':'cautious',grief:'no_new_kin_news',revenge_desire:'not_established',escape_desire:'possible',
      escape_daring:'unknown',perceived_opportunity:v('escape_channel'),known_guards:v('guards')};
    rule('sansa.baseline',[],'读取现有完整人设及已保存态度；父亲之死、旧怨和礼貌自保保留，不把表露当作内心。');
    if (yes('threat','active') || yes('refusal','punished')) {internal.fear='high';internal.agency='suppressed';internal.trust='damaged';}
    if (yes('gift','received')) {internal.pleasant_response='momentary';rule('sansa.gift',['gift'],'礼物可令她片刻高兴，不能单独改变信任、依赖、旧怨或婚约意愿。');}
    if (yes('marriage_relief','delivered')) {internal.gratitude='specific_marriage_relief';internal.motive_reading=yes('threat','active')?'relief_under_control':'possible_protection_still_uncertain';}
    const coercion=yes('pattern','coercive_dependency') && yes('outside_support','cut_off') && yes('safety_source','king_only');
    if (coercion) {internal.attachment='fear_dependency';internal.agency='suppressed';internal.fear='high';internal.dependency_reward='seeks_approval_and_safety';}
    const safe=yes('threat','ceased') && yes('refusal','respected') && yes('protection','kept');
    if (safe && ['stable_respect','costly_autonomous_closeness'].includes(v('pattern'))) {
      internal.fear='easing';internal.trust='limited';internal.agency='recovering';
      if (controlled && yes('outside_support','available')) internal.attachment='dependency_with_growing_autonomy';
      if (yes('pattern','costly_autonomous_closeness') && yes('outside_support','available')) internal.attachment='complex_closeness';
    }
    if (yes('kin_loss','received')) {
      internal.grief='acute';internal.escape_desire='heightened';
      internal.revenge_desire=yes('blame','king')?'directed_at_king':yes('blame','other')?'directed_elsewhere':'target_uncertain';
      if (yes('blame','king')) {internal.grievance='renewed_family_harm';internal.trust='damaged';internal.attachment+='|conflicted_by_family_harm';}
    }
    if (yes('escape_channel','closed')) internal.escape_daring='inhibited_by_no_route';
    else if (yes('escape_channel','credible')) internal.escape_daring=internal.fear==='high'?'hesitant_despite_route':'can_consider_attempt';
    // Actual guards do not erase a wish or decide success; only perceived guards enter this view.
    expression={public:internal.fear==='high'?'safe_words_and_compliance':'polite_cautious_expression',
      private:internal.fear==='high'?'conceal_anger_check_displeasure':internal.trust==='limited'?'limited_candid_requests':'guarded_questions',
      gratitude:internal.gratitude,does_not_establish:['forgiveness','marriage_consent','betrayal','escape_attempt']};
    tendencies=[internal.attachment.startsWith('fear_dependency')?'seek_king_approval':'protect_remaining_choices'];
    if (internal.escape_desire==='heightened') tendencies.push('consider_escape');
    rule('sansa.experience',['threat','refusal','protection','marriage_relief','pattern','outside_support','safety_source'],'有经历支持时允许真实恐惧性依赖，也允许有限信任与复杂亲近；都没有刷次数或道德奖惩公式。');
    rule('sansa.kin_and_exit',['kin_loss','blame','escape_channel','guards'],'亲人死讯必须送达；归责、复仇愿望、逃离意愿、敢不敢及实际机会分离，当前只评估前几项。');
    deferred=['actual_escape_route','guard_interception','revenge_action','persist_relationship'];
  }
  expression.current_setting=f.setting;
  expression.current_tendency=expression[f.setting];
  return {version:1,status:'preview_only',visibility:'actor_internal_author_debug',
    binding:{topic:f.topic,actor:f.actor,branch:f.branch,world:f.world,at:f.at},
    author_basis:{source:f.profile.source,attitude:f.character.state.attitude,priorities:f.priorities},
    internal,expression,tendencies,trace,missing:[...missing],disputed,
    handoff:{execution_decision:null,state_patch:null,deferred},
    limits:['semantic_annotations_require_review','no_player_visibility_grant','no_time_advance','no_formal_attitude_change']};
}

export function psychologySemanticContract(frame) {
  return {version:1,origin:'llm_candidate',binding:{topic:frame.topic,actor:frame.actor,branch:frame.branch,world:frame.world,at:frame.at},
    allowed:copy(psychologyVocabulary[frame.kind]),known:copy(frame.known),priorities:copy(frame.priorities),
    instructions:'只将当前事项映射到已有词表，逐项给出 key/value/belief/refs/quote；无法确定就省略。不得创造利益或事实，不得输出决定、正式态度、行动或状态补丁。pattern 只能交作者复核。引用检查不能代替语义复核。此候选不能直接送入评估入口。'};
}
