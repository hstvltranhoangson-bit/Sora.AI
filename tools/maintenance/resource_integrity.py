"""Optional SHA-256 integrity for Sora's artwork, animations, audio and official README."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import os

EXT = {'.svg','.png','.jpg','.jpeg','.webp','.gif','.bmp','.ico','.mp3','.wav','.ogg','.flac','.glb','.gltf','.fbx','.bin','.atlas','.skel','.json'}
ROOTS = ['assets','src/assets','src/renderer/assets','src/games/chess/assets','docs']
SKIP = {'node_modules','.venv','venv','__pycache__','.git','cache','logs','temp','tmp'}

def scan(root: Path):
    out = {}
    paths=[root/x for x in ROOTS if (root/x).is_dir()]
    for base in paths:
        for folder,dirs,files in os.walk(base):
            dirs[:]=[d for d in dirs if d.lower() not in SKIP]
            for name in files:
                file=Path(folder)/name
                if file.suffix.lower() not in EXT or file.is_symlink() or not file.is_file(): continue
                rel=file.relative_to(root).as_posix()
                if rel in out: continue
                digest=hashlib.sha256()
                with file.open('rb') as f:
                    for block in iter(lambda:f.read(1024*1024),b''):
                        digest.update(block)
                out[rel]=digest.hexdigest()
    doc=root/'README.md'
    if doc.is_file(): out['README.md']=hashlib.sha256(doc.read_bytes()).hexdigest()
    return dict(sorted(out.items()))

def main():
    p=argparse.ArgumentParser()
    p.add_argument('action',choices=['seal','check'])
    p.add_argument('--root',type=Path,required=True)
    p.add_argument('--manifest',type=Path,required=True)
    p.add_argument('--replace',action='store_true')
    a=p.parse_args()
    root=a.root.resolve(); manifest=a.manifest.resolve()
    if not root.is_dir() or root == manifest or root in manifest.parents: raise SystemExit('Sai đường dẫn hoặc mốc nằm bên trong dự án.')
    current=scan(root)
    if a.action == 'seal':
        if not current: raise SystemExit('Không tìm thấy ảnh/tài nguyên/README để tạo mốc.')
        if manifest.exists() and not a.replace: raise SystemExit('Mốc đã tồn tại, không tự ghi đè.')
        manifest.parent.mkdir(parents=True,exist_ok=True)
        if manifest.exists():
            stamped=manifest.with_name(f'{manifest.stem}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
            stamped.write_bytes(manifest.read_bytes())
        temp=manifest.with_suffix('.json.new')
        temp.write_text(json.dumps({'schema':1,'created_utc':datetime.now(timezone.utc).isoformat(),'files':current},ensure_ascii=False,indent=2),encoding='utf-8')
        temp.replace(manifest)
        print('Đã tạo mốc tài nguyên:',len(current),'tệp');return 0
    if not manifest.is_file(): raise SystemExit('Chưa có mốc tài nguyên.')
    data=json.loads(manifest.read_text(encoding='utf-8-sig'))
    if data.get('schema') != 1 or not isinstance(data.get('files'),dict): raise SystemExit('Mốc không hợp lệ.')
    old=data['files']; removed=sorted(set(old)-set(current)); added=sorted(set(current)-set(old)); modified=sorted(x for x in current.keys() & old.keys() if current[x]!=old[x])
    for name,items in [('BỊ SỬA',modified),('BỊ THÊM',added),('BỊ XÓA',removed)]:
        for x in items[:40]: print(f'[{name}] {x}')
        if len(items)>40: print('... và',len(items)-40,'tệp khác')
    print(f'Tổng: {len(current)} tệp. Sửa={len(modified)}, thêm={len(added)}, xóa={len(removed)}')
    return 2 if modified or added or removed else 0

if __name__=='__main__': raise SystemExit(main())
