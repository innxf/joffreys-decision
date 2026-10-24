"""Explicit first-install download only; gameplay cannot download models."""
from pathlib import Path
import urllib.request,hashlib,json
root=Path(__file__).resolve().parents[2]/'.local/canon/model'
revision='761b726dd34fb83930e26aab4e9ac3899aa1fa78'
files=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx']
root.mkdir(parents=True,exist_ok=True)
receipt=[]
for name in files:
    target=root/name;target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists():
        print('Download',name,flush=True)
        with urllib.request.urlopen('https://huggingface.co/Xenova/multilingual-e5-small/resolve/'+revision+'/'+name,timeout=120) as response, target.with_suffix(target.suffix+'.part').open('wb') as out:
            while block:=response.read(1024*1024):out.write(block)
        target.with_suffix(target.suffix+'.part').replace(target)
    receipt.append({'file':name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    print('Ready',name,target.stat().st_size,flush=True)
(root/'download-receipt.json').write_text(json.dumps({'revision':revision,'files':receipt},indent=2),encoding='utf8')
