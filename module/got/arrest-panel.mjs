import {arrestExecutors,arrestView,arrestForceChoices} from './arrest-engine.mjs';
const node=(tag,text,parent)=>{const e=document.createElement(tag);e.textContent=text||'';parent?.append(e);return e;};
export function renderArrests(runtime,host,{button,act}){
 const g=runtime.read(),names=id=>g.entities.find(e=>e.id===id)?.name||id;
 const fold=node('details','',host);node('summary','抓捕与拘押',fold);
 node('p','发令后仍须接令、查找、押送和看管交接。公开程度按实际行动；全城搜捕会走漏消息。',fold);
 const select=(label,items)=>{const l=node('label',label,fold),s=node('select','',l);for(const [value,text]of items){const o=node('option',text,s);o.value=value;}return s;};
 const target=select('目标 ',g.actors.filter(a=>a.life==='存活'&&a.id!=='U001').map(a=>[a.id,names(a.id)]));
 const executor=select('执行者 ',arrestExecutors(g).map(id=>[id,names(id)]));
 const force=select('兵力 ',[['','单名现任白袍亲自执行'],...arrestForceChoices(g).map(c=>[c.force+':'+c.group,c.label])]);
 const label=node('label','人数 ',fold),count=node('input','',label);count.type='number';count.min='1';count.value='1';
 const area=select('范围 ',[['red_keep','红堡'],['city','君临城内搜捕']]),secrecy=select('公开程度 ',[['secret','秘密'],['public','公开']]);
 const reason=node('textarea','',fold);reason.setAttribute('aria-label','抓捕事由');reason.placeholder='写明这次命令的事由';
 fold.append(button('确认发出抓捕命令',async()=>{const [f='',group='0']=force.value.split(':');await act({type:'order_arrest',target:target.value,executor:executor.value,force:f,group:+group,count:+count.value,area:area.value,secrecy:secrecy.value,reason:reason.value},'发出此抓捕命令？发令不等于抓获；执行者仍可拒绝，行动可能公开或失败。');}));
 for(const r of arrestView(g)){node('h4',names(r.target)+' · '+r.id,fold);node('p',r.text,fold);if(r.can_release)fold.append(button('命令释放',()=>act({type:'release_prisoner',arrest_ref:r.id},'命令看管者办理释放交接？')));else if(r.order_ref)fold.append(button('撤回尚未完成的抓捕',()=>act({type:'cancel_order',order_ref:r.order_ref})));}
}
