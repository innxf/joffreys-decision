// Author travel grouping, not a geographical scale drawing.
export const regions={
 Z01:{name:'红堡',entry:'R12',at:[.83,.18]},Z02:{name:'伊耿高丘街区',entry:'C01',at:[.56,.36]},
 Z03:{name:'维桑尼亚丘',entry:'C02',at:[.20,.18]},Z04:{name:'雷妮丝丘与东侧街区',entry:'C11',at:[.83,.62]},
 Z05:{name:'西侧市街',entry:'C13',at:[.16,.48]},Z06:{name:'河门与港区',entry:'C07',at:[.30,.85]},Z07:{name:'跳蚤窝',entry:'C12',at:[.50,.65]}
};
export const extraPlaces={R03H:'红堡·太后住处外廊',R04:'红堡·珊莎住处',R06:'红堡·外院',R08:'红堡·王座厅',R11:'红堡·训练庭院',R14:'红堡·王家圣堂',R16:'红堡·城墙步道',R20:'红堡·女眷花园',R22:'红堡·首相塔接见室',R23:'红堡·派席尔的药房与鸦巢',R26S:'红堡·马厩',R26K:'红堡·宫廷仓库',R26W:'红堡·工坊',R26F:'红堡·厨房',R27:'红堡·牢房接洽处',R28:'红堡·太后舞厅',C09:'维桑尼亚丘·炼金术士公会',G04:'西侧市街·诸神门',G06:'西侧市街·国王门',C01:'伊耿高丘·街市',C02:'维桑尼亚丘·圣堂广场',C04:'西侧市街·西营联络处',C05:'河门港区·港务院',C07:'河门港区·河门码头',C08:'雷妮丝丘·东营',C11:'雷妮丝丘·龙穴外阶',C12:'跳蚤窝·市集',C13:'西侧市街·商街',R25:'红堡·瓦里斯接洽处'};
export const placeRegions={R03H:'Z01',R04:'Z01',R06:'Z01',R08:'Z01',R11:'Z01',R14:'Z01',R16:'Z01',R20:'Z01',R22:'Z01',R23:'Z01',R26S:'Z01',R26K:'Z01',R26W:'Z01',R26F:'Z01',R27:'Z01',R28:'Z01',C09:'Z03',G04:'Z05',G06:'Z05',R01:'Z01',R03:'Z01',R05:'Z01',R07:'Z01',R09:'Z01',R10:'Z01',R12:'Z01',R13:'Z01',R25:'Z01',C01:'Z02',C02:'Z03',C03:'Z03',C04:'Z05',C05:'Z06',C07:'Z06',C08:'Z04',C11:'Z04',C12:'Z07',C13:'Z05'};
export const roads=[['Z01','Z02',15],['Z02','Z03',30],['Z02','Z06',15],['Z02','Z07',15],['Z07','Z04',15],['Z04','Z03',30],['Z03','Z05',15],['Z05','Z06',15]];
export function travelMinutes(from,to){
 if(!regions[from]||!regions[to])return null;
 const distance=Object.fromEntries(Object.keys(regions).map(k=>[k,Infinity]));distance[from]=0;const done=new Set();
 while(done.size<Object.keys(regions).length){const at=Object.keys(regions).filter(k=>!done.has(k)).sort((a,b)=>distance[a]-distance[b])[0];done.add(at);for(const [a,b,m]of roads){const n=a===at?b:b===at?a:null;if(n)distance[n]=Math.min(distance[n],distance[at]+m);}}
 return distance[to];
}
export const placeDescriptions={C01:'石阶沿山势向上伸去，车轮在石缝间颠簸。红堡的塔楼越过屋顶，城门下有人等候通报。',C02:'钟声掠过广场。朝圣者在台阶下停步，圣堂的门扉敞向日光。',C04:'西营门内传来操练声。值守的军士守着来往登记簿，等候具体的吩咐。',C05:'港务院的桌上堆着船货清单。这里的书吏能呈报经手的货物，却不能替全城作账。',C07:'河水拍打木桩，搬运工沿码头往来。河门下，货车排成一列。',C08:'东营的院门旁立着金袍守卫。换班的队伍从门内经过。',C11:'龙穴残破的穹顶投下阴影。门前的石阶荒凉，深处尚未开放。',C12:'窄巷挤着摊贩与行人，炊烟从低矮的屋顶间升起。城堡在这里显得很远。',C13:'布匹、皮革和铁器陈列在街边。店主望向王室随行的人，又低头照料自己的生意。',R25:'接洽室里留着一张空椅。这里是公开求见瓦里斯的地方，不是他所有秘密的入口。'};
