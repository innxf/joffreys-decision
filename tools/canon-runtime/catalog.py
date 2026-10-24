"""Rebuild the complete five-book source catalog plus explicitly reviewed ranges."""
import json,re,pathlib,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];DESIGN=ROOT.parent/'权游重制'
out=ROOT/'.local/canon';out.mkdir(parents=True,exist_ok=True)
ps=[json.loads(s) for s in (DESIGN/'设计样本/核心25人人设原文/paragraphs.jsonl').read_text(encoding='utf-8').splitlines()]
byid={p['id']:p for p in ps}
curated=[json.loads(s) for s in re.findall(r'```canon-chunk\s*\n(.*?)\n```',(DESIGN/'原著质感素材维护稿.md').read_text(encoding='utf-8'),re.S)]
records=[]
for x in curated:
 x['text']=x['raw_text']
 if 'source_ref' in x:
  p=byid[x['source_ref']];assert p['text'][x['start']:x['end']]==x['raw_text'],x['id'];assert p['text_sha256']==x['source_hash']
  x['parts']=[{'ref':p['id'],'start':x['start'],'end':x['end'],'sha256':p['text_sha256']}]
 else:
  # Full-catalog chunks can be reviewed in the same maintenance file, retaining
  # their original multi-paragraph ranges. Never join unrelated scene fragments.
  previous=None;positions={p['id']:i for i,p in enumerate(ps)}
  for part in x['parts']:
   p=byid[part['ref']]
   assert p['text_sha256']==part['sha256'] and 0<=part['start']<part['end']<=len(p['text']),x['id']
   if previous:
    q,prior=previous
    assert (p['book'],p['member'])==(q['book'],q['member']),x['id']
    assert (p['id']==q['id'] and part['start']==prior['end']) or (positions[p['id']]==positions[q['id']]+1 and prior['end']==len(q['text']) and part['start']==0),x['id']
   previous=(p,part)
  assert '\n'.join(byid[t['ref']]['text'][t['start']:t['end']] for t in x['parts'])==x['raw_text'],x['id']
 records.append(x)
# Boundaries are always source sentence/paragraph boundaries. Adjacent short
# paragraphs join only inside the same chapter, with explicit individual ranges.
group=[];size=0;key=None
def flush():
 global group,size
 if not group:return
 text='\n'.join(x['text'] for x in group);first=byid[group[0]['ref']]
 parts=[{k:x[k] for k in ['ref','start','end','sha256']} for x in group]
 ident='NOVEL-'+hashlib.sha256(json.dumps(parts,sort_keys=True).encode()).hexdigest()[:20]
 records.append({'id':ident,'text':text,'parts':parts,'book':first['book'],'title':first['title'],'chapter':first['chapter'],'member':first['member'],'status':'pending','category':None,'characters':[],'locations':[],'topics':[],'review':'全卷连续切片；尚未确认归属与适用范围，不进入运行候选。'})
 group=[];size=0
for p in ps:
 k=(p['book'],p['member'])
 if key!=k:flush();key=k
 text=p['text'];start=0
 # Keep closing quotes attached to their sentence.
 sentences=list(re.finditer(r'.*?(?:[。！？!?][”’」』]*|$)',text,re.S))
 for m in sentences:
  if not m.group():continue
  a,b=m.span()
  if size+len(m.group())>300 and group:flush()
  group.append({'ref':p['id'],'start':a,'end':b,'sha256':p['text_sha256'],'text':m.group()});size+=b-a
  if size>=220:flush()
flush()
# An approved full-catalog ID overrides only its metadata, not its raw ranges.
seen={};unique=[]
for r in records:
 if r['id'] in seen:
  prior=seen[r['id']]
  assert r['id'].startswith('NOVEL-') and prior['text']==r['text'],r['id']
  continue
 seen[r['id']]=r;unique.append(r)
records=unique
# Joining sentence pieces from one paragraph must not insert fictional newlines.
for r in records:
 pieces=[]
 for x in r['parts']:
  if pieces and pieces[-1]['ref']==x['ref'] and pieces[-1]['end']==x['start']:pieces[-1]['end']=x['end']
  else:pieces.append(dict(x))
 r['parts']=pieces;r['text']='\n'.join(byid[x['ref']]['text'][x['start']:x['end']] for x in pieces)
 r['text_sha256']=hashlib.sha256(r['text'].encode()).hexdigest()
(out/'catalog.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf-8')
(out/'source-manifest.json').write_text(json.dumps({'format':1,'paragraphs':len(ps),'records':len(records),'reviewed':sum(r['status']=='reviewed' for r in records),'books':sorted(set(r['book'] for r in records))},ensure_ascii=False,indent=2),encoding='utf-8')
print((out/'source-manifest.json').read_text(encoding='utf-8'))
