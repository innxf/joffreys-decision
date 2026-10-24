// Formal author path. Every choice comes from the maintained issue definition;
// this module never fabricates a model response or grants a character decision.
const openings={
 remains:'派席尔用指节压住卷宗的一角，声音拖得很慢。「首级与遗体如何处置，请陛下明示。静默姐妹能照料遗体，至于北方的人肯不肯来接，还须另送消息。」',
 pursuit:'瓦里斯轻轻垂首。「追捕未能带回人来，陛下。若您愿意撤令，便还有另说一番话的余地。」史林特的手停在腰带上。桑铎没有接话。',
 theft:'派席尔将缺了签名的那一栏转向国王。「银盘不会自己长腿，陛下。可这道门究竟由谁放人进去，眼下各执一词。」书记已经备好了空白文书，等待裁决。'
};
export function authoredIssue(g,m,q,definition,listeners){
 if(!definition?.choices?.length)return null;
 const actor=(q.presenters||[]).find(id=>listeners.includes(id))||'clerk';
 let prose=openings[q.origin]||definition.report||definition.question||q.problem;
 if(q.origin==='pursuit'&&!['P004','P020','P016'].every(id=>listeners.includes(id)))prose='书记代读追捕呈报，随后将撤令与继续搜捕的文书一并呈上，等候国王裁定。';
 if(actor==='clerk')prose='书记把负责人的呈报放在长桌上，代为读出待定的事项。\n\n'+q.problem;
 return {actor,prose,proposals:definition.choices.map(([choice,summary,detail])=>({actor,summary,quote:summary,owner:null,conditions:[],choice,status:'active',authored:true,detail:detail||''}))};
}
