// Explicit isolated demonstration. Never used as a fallback for failed live requests.
import {issues} from './opening-content.mjs';
import {campaignIssue} from './campaign-engine.mjs';
import {contextForCouncilWork,topicOf} from './council-v3.mjs';
export function demoWork(g,m){
 const s=m.session,w=s.work,q=topicOf(m),actor=w.actor||q.presenters.find(id=>g.activities.find(x=>x.id===m.activity).participants.includes(id))||s.turns.find(t=>t.issue===q.id)?.context.actor||'P018';
 const context=contextForCouncilWork(g,m),pre={intent:{mode:'chat',purpose:'就当前议题提出建议',means:[],joint_conditions:[],unresolved:[]},focus_refs:[],agenda:{mode:'keep',...context.agenda},guidance:[],character:{mode:'keep',attitude:context.character.state.attitude,explanation:'固定演示维持已有态度，不模拟政治判断。',basis:[]}};
 let result;
 if(w.kind==='speech'){
  const d=campaignIssue(g,q.origin)||issues[q.origin],main=q.presenters.find(id=>g.activities.find(x=>x.id===m.activity).participants.includes(id))||actor;
  const choices=d?.choices||[];
  const proposals=actor===main?choices.map(c=>({summary:c[1],quote:c[1],owner:null,conditions:[],choice:c[0]})):[];
  if(!d&&actor===main)proposals.push({summary:'先记下议案，暂不施行',quote:'先记下议案，暂不施行',owner:null,conditions:[],choice:null});
  result={speak:actor===main,pre,prose:proposals.map(p=>'「'+p.summary+'。」').join('\n'),proposals};
 }else if(w.kind==='topic')result={title:q.title==='补充议题'?'国王补充的议题':q.title,problem:s.lastInput,approach:q.approach,owner:null,reply:'「先将陛下提出的问题记下，具体办法和负责人，留待席间商议。」'};
 else result={consistent:true,summary:q.resolution.summary+'。'+(q.resolution.conditions.length?'条件尚待落实：'+q.resolution.conditions.join('；'):'书记已记下裁决，尚未发令。'),question:''};
 return {type:'council_v3_result',work_id:w.id,context,result,requests:[{source:'isolated-fixed-demo',task:w.kind}]};
}
export function demoBatch(batch){return {turns:batch.turns.map(t=>({turn_id:t.id,post:{consistent:true,summary:'固定演示：'+t.prose,decisions:[],experiences:[],candidates:[]}}))};}
