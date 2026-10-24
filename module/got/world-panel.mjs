const $=id=>document.getElementById(id);
export const executionErrors={
  ACTIVITY_ACTIVE:'请先继续或结束当前活动，再等待。',PERSON_BUSY:'所需人物尚未确认到场，或正被其他活动占用。',
  PAYMENT_NOT_VERIFIED:'尚未收到这笔付款的核验回报，不能直接付款。',ALREADY_PAID:'这笔款已经支付，不能重复付款。',
  DUPLICATE_WORK:'已有同类委托正在进行，请等待回报。',RESOURCE_UNAVAILABLE:'可用资源不足；没有扣款或自动借款。',
  PENDING_DECISION:'还缺少当事人的接受或授权记录，当前不会替人物答应。',NO_AUTHORITY:'当前授权或对象状态不允许这项操作。',
  AUTHORITY_NOT_DELIVERED:'授权尚未实际送达，不能开始履职。',MECHANIC_UNIMPLEMENTED:'该机制尚未实现，不能用项目名称代替执行。',
  INVALID_ORGANIZATION:'请填写机构名称及明确职责。',ACTIVITY_NOT_ACTIVE:'这项活动已经结束。'
};
Object.assign(executionErrors,{INVALID_STATE:'候选结果未通过状态检查，已保留原进度；这是程序规则错误，不能靠再次扣款解决。',DUPLICATE_APPOINTMENT:'该机构已经登记这个职位，本批尚未支持替换任职者。'});
Object.assign(executionErrors,{PLAN_NOT_READY:'该方案当前状态不允许这项操作。',APPOINTMENT_MISSING:'请先落实对应机构的指挥任命。',REPLACEMENT_MISSING:'机动预备不足以填补原岗位，请等待归队或缩小方案。',REGISTRAR_NOT_READY:'发行机构和登记人的接受、到岗尚未落实。',NOT_ARRIVED:'相关人物尚未实际到场。',ACCOUNT_DETAILS_UNAVAILABLE:'此账户还没有已保存的明细，不能临时编造异常。',REPORT_NOT_RECEIVED:'报告尚未送达。',TERMS_NOT_ACCEPTED:'认购者尚未明确接受本期金额及偿付条款。',ISSUE_CLOSED:'发行尚未开放或已经关闭。',INTEREST_NOT_DUE:'没有这笔可支付的未付利息。',HANDOVER_NOT_COMPLETED:'守卫尚未实际交接，不能据此完成白袍替换。',PURSUIT_ACTIVE:'追捕撤令尚未实际生效。',SEAT_ALREADY_CHANGED:'该白袍席位已经变更。'});
function textRow(parent,text){const p=document.createElement('p');p.textContent=text;parent.append(p);}
export function renderExecution(v,{button,act}){
  for(const id of ['activity-controls','action-controls','org-controls','org-list','orders','reports','political-controls','political-list'])$(id).replaceChildren();
  $('org-name').disabled=!v;if(!v){$('activity-status').textContent='请先建立或载入存档。';return;}
  const activity=v.activities.find(a=>a.status==='active');
  const add=(id,label,action,confirmation)=>$(id).append(button(label,()=>act(typeof action==='function'?action():action,confirmation)));
  const names={documents:'处理文书',meal:'用餐',private_talk:'私人会谈',short_visit:'短探视',council:'御前会议'};
  if(activity){
    $('activity-status').textContent=`当前活动：${names[activity.kind]||activity.kind}；第${activity.node+1}/${activity.nodes.length}节点，剩余${activity.remaining}分钟。`;
    add('activity-controls','推进当前节点',{type:'advance_activity',activity_ref:activity.id});
    add('activity-controls','延长15分钟',{type:'extend_activity',activity_ref:activity.id,minutes:15},'在活动末尾增加15分钟？期间的消息和事务会继续推进。');
    add('activity-controls','现在结束',{type:'end_activity',activity_ref:activity.id});
  }else{
    $('activity-status').textContent='当前没有正在进行的活动。';
    for(const minutes of [15,60,1440])add('activity-controls',`等待${minutes===1440?'一天':minutes+'分钟'}`,{type:'wait',minutes},minutes===1440?'等待一天？机会窗口、消息、任务及口粮会照常推进。':null);
    add('activity-controls','独自处理文书 · 15分钟',{type:'start_activity',kind:'documents',participants:['U001']});
    add('activity-controls','午餐计时样本 · 30分钟',{type:'start_activity',kind:'meal',participants:['U001']});
  }
  add('action-controls','撤销巴利斯坦追捕',{type:'cancel_order',order_ref:'ORD01'},'发出撤令？通知执行者需要180分钟；公开正名、邀请及复职仍需另行处理。');
  add('action-controls','委托核验首期金袍子饷款',{type:'inspect_payment',obligation_ref:'PAY01'});
  add('action-controls','确认支付首期饷款 · 700金龙',{type:'pay_obligation',obligation_ref:'PAY01'},'收到核验回报后按到期安排支付700金龙？实际支付才扣现金，已有预留不会重复扣款。');
  add('action-controls','加强夜巡 · 40人／60分钟',{type:'night_patrol',count:40,duration:60},'从现有机动预备中安排40人夜巡？20:00后按班次执行，归队前不能重复派遣。');
  add('action-controls','整理指定账册目录 · 上限10金龙',{type:'create_project',template:'records_inventory',title:'指定账册目录整理'},'预留10金龙，委托财政经办安排整理？这是有限目录工作，不等于审计或追回资金。');
  add('action-controls','红堡拨200口粮至守备队',{type:'transfer_stock',source:'RES-FOOD-RK',destination:'RES-FOOD-WATCH',amount:200},'发出本地调拨命令？出库与入库分开，沿用两处既有供养，不新增口粮。');
  const labels={review_plan:'征询方案答复',request_document:'请求补交凭据',guard_transfer:'守卫交接',audit:'专题核账',cancel:'撤令',inspect_payment:'饷款核验',payment:'付款',night_patrol:'夜巡',project:'目录项目',transfer:'库存调拨',notify_authority:'通知授权',temporary_detail:'有限借调'};
  for(const o of v.orders){const line=document.createElement('div');line.className='slot';textRow(line,`${o.id} · ${labels[o.action]||o.action} · ${o.status}`);
    if(o.action!=='cancel'&&o.status!=='已完成')line.append(button('发出撤令',()=>act({type:'cancel_order',order_ref:o.id},'撤令也需要送达；已经执行的部分会保留。')));$('orders').append(line);}
  add('org-controls','登记筹建',()=>({type:'create_organization',name:$('org-name').value.trim(),responsibilities:['拟定局部守卫职责与交接方案；具体实施另行授权']}),'只登记筹建和拟定职责，不增加编制、兵权或资金。继续？');
  for(const o of v.organizations){const box=document.createElement('div');box.className='panel';textRow(box,`${o.name} · ${o.status==='preparing'?'筹建中':'有限职责运行'} · ${o.id}`);
    box.append(button('任命桑铎为筹办人',()=>act({type:'appoint_official',organization_ref:o.id,title:'筹办人',person:'P016'},'批准筹办任命？桑铎接受与到岗另行处理，原白袍身份不变。')));
    box.append(button('发送一天的筹备文书授权',()=>act({type:'grant_authority',organization_ref:o.id,person:'P016',expires_at:v.elapsed_minutes+1440},'仅授权准备方案和整理文书，不包含接管守军。')));
    box.append(button('检查开始履职条件',()=>act({type:'activate_organization',organization_ref:o.id})));
    box.append(button('登记财政筹办任命 · 需到场',()=>act({type:'appoint_official',organization_ref:o.id,title:'债务登记人',person:'P005'},'批准有限财政登记职责？仍需本人接受和到岗。')));
    box.append(button('拟定100人近卫转属',()=>act({type:'plan_guard_transfer',organization_ref:o.id,count:100,posts:'keep_same_posts'},'拟定从原守备队转属100人、继续原红堡岗位的方案？交兵和白袍处置分别决定。')));
    box.append(button('筹备首期债券 · 目标5000',()=>act({type:'create_bond_issue',organization_ref:o.id,registrar:'P005',goal:5000,rate_bps:100,period_minutes:40320,maturity_minutes:120960,window_minutes:10080},'拟定有限平价试办：目标5000金龙、每28日1%单利、84日还本、7日发行窗口，预留100金龙准备与发行费？这是待执行条款，不保证有人认购。')));$('org-list').append(box);}
  for(const p of v.guard_plans||[]){const box=document.createElement('div');box.className='panel';textRow(box,`近卫方案 ${p.id} · ${p.count}人 · ${p.status}`);
    if(['preparing','blocked'].includes(p.status))for(const [actor,kind,label]of [['P016','guard_command','传令询问桑铎是否接受指挥'],['P020','permanent_transfer','传令询问史林特是否接受转属']])box.append(button(label,()=>act({type:'autonomy_request_review',actor,target_ref:p.id,kind})));
    box.append(button('发送限额转属授权',()=>act({type:'grant_operation_authority',person:'P020',operation:'permanent_transfer',target_ref:p.id,max_count:p.count,expires_at:v.elapsed_minutes+1440})));
    box.append(button('检查并发出交接令',()=>act({type:'execute_guard_transfer',plan_ref:p.id},'检查双方接受、限额授权、岗位与供养，再发出交接令？')));
    if(['preparing','blocked'].includes(p.status)){box.append(button('改为20人试办',()=>act({type:'revise_guard_plan',plan_ref:p.id,count:20,posts:'keep_same_posts'},'缩小为20人？旧同意与授权保留为历史，新方案需要重新接受。')));box.append(button('撤回此方案',()=>act({type:'withdraw_political_plan',plan_ref:p.id})));}
    if(p.status==='completed')box.append(button('检查七席协调复职',()=>act({type:'replace_kingsguard',plan_ref:p.id},'检查桑铎另行同意离任、巴利斯坦接受且已到场、追捕已撤，再协调七席？')));$('political-list').append(box);}
  for(const t of v.audit_targets||[])add('political-controls',`核查已授权账户 ${t.id}`,{type:'start_audit',account_ref:t.id,executor:t.executor},'按已授范围进行专题核查？预算10金龙，只报告资料，不直接追回资金。');
  for(const a of v.audits||[])textRow($('political-list'),`已收到核查 ${a.id} · ${a.account_ref} · ${a.result}`);
  for(const i of v.issues||[]){const box=document.createElement('div');box.className='panel';textRow(box,`发行 ${i.id} · 目标${i.goal} · 已付款本金${i.paid} · ${i.status}`);
    if(['preparing','blocked'].includes(i.status)){box.append(button('发送有限登记授权',()=>act({type:'grant_operation_authority',person:i.registrar,operation:'register_debt',target_ref:i.id,max_count:0,expires_at:v.elapsed_minutes+30*1440})));box.append(button('检查并开始发行准备',()=>act({type:'open_bond_issue',issue_ref:i.id},'检查机构、登记人员和授权，开工才支付发行费。继续？')));box.append(button('撤回未开始方案',()=>act({type:'withdraw_political_plan',plan_ref:i.id})));}
    if(i.status==='open')box.append(button('关闭发行窗口',()=>act({type:'close_bond_issue',issue_ref:i.id},'停止后续认购与收款？已发行债务及已支付费用继续保留。')));$('political-list').append(box);}
  for(const d of v.debts||[]){textRow($('political-list'),`债务 ${d.id} · 未偿本金${d.outstanding}`);
    if(d.outstanding)$('political-list').append(button('偿还此笔本金',()=>act({type:'repay_bond_principal',debt_ref:d.id,amount:d.outstanding},`确认偿还${d.outstanding}金龙本金？利息另行支付。`)));
    for(const due of d.dues.filter(x=>x.kind==='interest'&&!x.paid))$('political-list').append(button(`支付利息 ${due.amount}`,()=>act({type:'pay_bond_interest',obligation_ref:due.obligation_ref},`确认支付${due.amount}金龙利息？不会减少本金。`)));}
  for(const m of v.messages.filter(m=>m.at>=0).slice(-20).reverse())textRow($('reports'),`T0+${m.at}分钟 · ${m.text}`);
  if(!v.messages.some(m=>m.at>=0))textRow($('reports'),'暂无新的已送达回报。');
}
