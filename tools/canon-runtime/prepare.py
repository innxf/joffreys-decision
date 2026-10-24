"""One-time migration: retain literal ranges, never encode edited clean_text."""
import hashlib,json,re,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
DESIGN=ROOT.parent/'权游重制'
PAR=DESIGN/'设计样本/核心25人人设原文/paragraphs.jsonl'
SOURCE=DESIGN/'_备份/原著向量修复-20261023-113933/原著质感素材维护稿.md'
if not SOURCE.exists():
    found=list((DESIGN/'_备份/原著向量修复-20261023-113933').rglob('原著质感素材维护稿.md'))
    SOURCE=found[0]
paragraphs=[json.loads(s) for s in PAR.read_text(encoding='utf-8').splitlines()]
byid={p['id']:p for p in paragraphs}
old=[json.loads(s) for s in re.findall(r'```canon-chunk\s*\n(.*?)\n```',SOURCE.read_text(encoding='utf-8'),re.S)]
# Each pair denotes a continuous, reviewed interval in the existing source paragraph.
# None includes the whole source interval. No words are generated or substituted.
selected={
1:(None,None),2:(None,None),3:(None,'征服者伊耿'),4:(None,'柏洛斯'),
5:('圣贝勒大教堂','彼端'),6:('彼端','两丘之间'),7:('繁华城区','圣贝勒'),
8:('月光',None),9:(None,'他刚进门'),10:('炼金术士的公会大厅','哈林领'),
11:('他们从','提利昂极为'),12:('有个小贩','新鲜的老鼠当然'),13:(None,'此人真是'),
17:(None,None),18:('除了丝绸','太监向来'),19:(None,None),
21:('他身披','“珊莎小姐到'),24:(None,'“给我两周'),25:(None,'他是个衣衫'),26:('他是个衣衫','“十分抱歉'),
32:(None,None),33:('随后','之后，他'),34:('奈德转身','“把他的盔甲'),
35:(None,'他越读'),36:('锁链乃是','他说除此'),37:('有关宾客的法则','他朝'),38:(None,None),
39:('她在香炉','徒利家族'),40:('征服者伊耿',None),45:(None,None),
48:('当他们抵达红堡','守卫们把'),49:('西边，红色','北面则'),
50:('圣堂前','这里，钟声'),51:('“任何一把剑','泰温公爵表示'),53:(None,None),
56:(None,None),57:(None,None),59:('石匠负责','炼金术士公会'),60:(None,None),
61:(None,'“拜瓦特'),63:('胖胖的小王子','托曼不过'),66:(None,None),
70:(None,None),71:(None,None),75:(None,None),76:(None,None),78:(None,None),79:(None,None),80:(None,None),
85:(None,None),86:(None,'他啐了'),87:(None,None),90:(None,None),
94:('马林爵士','“他们在'),96:(None,None),98:('漫长的地窖','提魅没走'),
101:('他身穿','……或者'),102:('奥斯蒙·凯特布莱克爵士的模样','凯特布莱克原本'),
103:(None,'她被他俩'),107:('霍柏爵士骑着','雷德温家'),108:(None,None),
112:('那是片足有','他们在树前'),113:('这里安详','此地的心树'),
114:('他每根指头','歌谣里'),115:('歌谣里',None),116:(None,'楼座上'),
117:(None,'洛丽丝'),118:('这天他们','杰诺斯伯爵说'),119:(None,None),
121:('他做个手势','我真是'),124:('爱拉雅雅站在门口','她冷静'),125:(None,None),
129:('他高近八尺',None),131:(None,'是有几分'),
132:(None,'提利尔公爵'),133:('而提利尔家的女孩','她年方'),135:(None,'若非父亲'),136:('她穿了一袭','提利昂等'),137:('那名男子','他有着'),
138:(None,'瑟曦见到'),139:(None,None),140:('这次选的比较朴素','这没关系'),141:(None,'但他脸上'),
142:('非常漂亮',None),143:('“秋天的花朵','对了，你会'),145:(None,None),
146:(None,'她坐在'),149:('“我要面包','仆人鞠了'),
}
out=[]
for x in old:
    n=int(x['id'][-4:]);p=byid[x['source_ref']];raw=x['raw_text']
    assert raw in p['text'],x['id']
    approved=n in selected
    # Wardrobe additions are individually reviewed after conversion below.
    a,b=selected.get(n,(None,None));start=raw.index(a) if a else 0;end=raw.index(b,start) if b else len(raw)
    text=raw[start:end];offset=p['text'].index(raw)+start
    item={k:x.get(k,[]) for k in ['id','category','characters','locations','topics','periods','requires_facts','forbid_facts','stages','attitudes']}
    item.update(source_ref=p['id'],start=offset,end=offset+len(text),source_hash=p['text_sha256'],raw_text=text,
      book=p['book'],title=p['title'],chapter=p['chapter'],member=p['member'],
      status='reviewed' if approved else 'pending',speaker=x.get('speaker',''),addressee=x.get('addressee',''),
      review='连续原文区间；作为表达参考，非本局经历。' if approved else '旧改写退出运行；保留原文定位，人物关系、场合或情节联系仍需逐条确认。',
      origin='原131条' if n<=131 else '上轮候选扩充',exclusive_actor=x['category'].startswith('persona_') or x['category']=='costume_ornament')
    if n==11:item['requires_facts']=['scene.meal']
    if n==8:item['periods']=['night']
    if n==48:item['periods']=['night']
    if n==49:item['periods']=['dusk']
    if n in [32,33]:item['requires_facts']=['scene.medical']
    if n in [19,63,75,76,119]:item['audience_requires']=['P012']
    if n==53:item['audience_requires']=['P003']
    if n in [34,35,36,37,38,39,40,115]:item['exclusive_actor']=False
    if n==98:item['category']='scene_env';item['characters']=[];item['locations']=['C09']
    if n in [94,101,107,129]:item['requires_facts']+=['scene.armor']
    if n==21:item['requires_facts']=['office.kingsguard']
    if n==132:item['requires_facts']=['office.hand']
    if n in [135,136,137,138,139,140,141]:item['requires_facts']=[]
    if n in [11,117,118,119,149]:item['detail_group']='menu';item['requires_facts']=['scene.meal']
    if item['category']=='costume_ornament':item['detail_group']='outfit'
    if n in [12,24,32,59,85,87,90,108]:item['review']+=' 保留原话的说话对象与原场景；不得把话中的命令、数量或承诺作为本局结果。'
    out.append(item)
dest=DESIGN/'原著质感素材维护稿.md'
dest.write_text('# 原著写作参考：连续原文与用途标注\n\n唯一人工维护入口。原文只修改 start/end 定位并从来源重建，不改写 raw_text。status=reviewed 方可运行；pending 仍编码但不发送。全五卷自动切片目录由构建工具重建。编号保留原 CANON；用途标注不是人物知情。\n\n'+''.join('## '+x['id']+'\n\n```canon-chunk\n'+json.dumps(x,ensure_ascii=False,indent=2)+'\n```\n\n' for x in out),encoding='utf-8')
print(json.dumps({'reviewed':sum(x['status']=='reviewed' for x in out),'pending':sum(x['status']=='pending' for x in out)},ensure_ascii=False))
