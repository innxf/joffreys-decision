// V2 trial calibration, not canon or a replacement for the authored personas.
// All values below are tunable. Actual funds, troops and command remain in the world ledgers.
export const stanceTuning=Object.freeze({growthStart:25,growthRange:60,cooperate:15,oppose:-35,
  emotionalRatio:1.35,attachmentImpact:1.15,stressImpact:.5,leakMargin:25,dragMargin:10,
  leakMinutes:15,dragMinutes:15,escapeBonus:10,maxDelta:20});
const weights=(prestige,dread,legitimacy,resource)=>({prestige,dread,legitimacy,resource});
export const authorityEstimate={personal_prestige:45,personal_dread:65,legitimacy:75,political_resource:40,
  faction_shares:{lannister_tywin:.5,baelish_network:.05},source:'V2试用开局估计；不是当前真实兵力或现金'};
// Explicit IDs from the existing actor array. Other actors use neutral trial slots.
const seeds={
 P002:[96,95,75,5,95,90,'FAMILY_HEGEMONY','lannister_tywin',weights(.15,0,.15,.70)],
 P005:[92,75,20,20,35,20,'SELF_PROFIT','baelish_network',weights(.05,.40,0,.55)],
 P004:[95,85,30,10,40,85,'BALANCE_CHAOS',null,weights(.10,.15,0,.75)],
 P011:[35,85,80,15,20,95,'HONOR',null,weights(.25,0,.70,.05)],
 P012:[25,40,25,85,5,50,'SURVIVAL',null,weights(.10,.80,.05,.05)],
 P020:[40,25,20,30,25,15,'SELF_PROFIT',null,weights(.10,.55,.05,.30)]
};
const attachments={P001:[['P060','CHILD_SAFETY',100],['P061','CHILD_SAFETY',100]],
 P003:[['P044','LOVE',85]],P012:[['P008','KIN_SURVIVAL',95],['P009','KIN_SURVIVAL',90]],
 P020:[['P005','PATRON',75]]};
export function defaultMech(id){
 const [acumen,willpower,stubbornness,plasticity,capital,discipline,agenda,share,bw]=seeds[id]||[50,50,50,50,20,60,'DUTY',null,weights(.2,.2,.4,.2)];
 return {version:1,revision:0,acumen,willpower,stubbornness,plasticity,
  public_track:{base_capital:capital,resource_share_key:share,secrecy_discipline:discipline,agenda_type:agenda,
   base_weights:bw,mature_weights:id==='P012'?weights(.20,.35,.10,.35):{...bw},authority_view:structuredClone(authorityEstimate)},
  private_track:{stress:id==='P012'?65:20,joffrey_bond:{trust:25,respect:30,affection:10,resentment:id==='P012'?80:20,importance:50},
   core_attachments:(attachments[id]||[]).map(([target_id,tag,intensity])=>({target_id,tag,intensity}))},
  prompt_patches:[]};
}
