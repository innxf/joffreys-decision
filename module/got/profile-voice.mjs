// Presentation examples are separate from evidence, memories and world facts.
export function profileVoice(profile){
 const examples=profile.examples||[];
 if(!examples.length)return profile.personality;
 return profile.personality+'\n\n【语言样本：仅学表达，不是本局发生的对话或已知事实】\n'+
  examples.map(e=>`对象与语境：${e.use}\n原话样本：“${e.text}”`).join('\n')+
  '\n只学习语气与节奏，不复演样本事件；专属称呼仅在对应关系实际成立时使用。';
}
