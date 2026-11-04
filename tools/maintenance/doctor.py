"""Read-only diagnostic for the SORA desktop companion. Stdlib only."""
from __future__ import annotations
import argparse
import ast
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
import urllib.request


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=Path(r'H:\SORA'))
    p.add_argument('--online',action='store_true')
    args=p.parse_args()
    root=args.root
    results=[]
    def record(name, status, detail):
        results.append(dict(test=name,status=status,detail=str(detail)[:250]))
        print('[{}] {}: {}'.format(status,name,detail))
    checks={
        'Sora.bat':'Sora.bat',
        'Python backend':'backend/sora/ai/model_client.py',
        'SQLite ký ức':'data/memory.sqlite3',
        'Network Guard':'backend/sora/ai/network_research.py',
        'Cấu hình mạng':'backend/sora/network_settings.json',
        'Engram Personality':'backend/sora/ai/sora_personality.py',
        'README duy nhất':'README.md',
    }
    for key,loc in checks.items():
        file=root/loc
        record(key, 'PASS' if file.is_file() else 'WARN', loc if file.is_file() else 'Không tìm thấy: '+loc)
    model=root/'backend/sora/ai/model_client.py'
    if model.is_file():
        try:
            source=model.read_text(encoding='utf-8-sig')
            ast.parse(source)
            record('Cú pháp model_client.py','PASS','Hợp lệ')
            for mark,label in (('SORA_NETWORK_RESEARCH_V1','Nối nguồn web'),('SORA_NETWORK_ACCURACY_V2','Network Accuracy V2'),('SORA_NETWORK_OFFLINE_FALLBACK_V3','Chống fallback ký ức cũ')):
                record(label, 'PASS' if mark in source else 'WARN', 'Có' if mark in source else 'Chưa thấy marker trong mã')
        except Exception as ex:
            record('Cú pháp model_client.py','FAIL',ex)
    settings=root/'backend/sora/network_settings.json'
    if settings.is_file():
        try:
            cfg=json.loads(settings.read_text(encoding='utf-8-sig'))
            record('Cấu hình Internet/LAN','PASS',f"Internet={cfg.get('public_enabled')}, LAN={cfg.get('internal_enabled')}, hosts={len(cfg.get('internal_hosts',[]))}")
        except Exception as ex:
            record('Cấu hình Internet/LAN','FAIL',ex)
    try:
        req=urllib.request.Request('http://127.0.0.1:11434/api/tags',headers={'Accept':'application/json'})
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req,timeout=3) as reply:
            names=[x.get('name','') for x in json.loads(reply.read(100000)).get('models',[])]
        record('Ollama API','PASS',f'Server đang phản hồi; {len(names)} model')
    except Exception as ex:
        record('Ollama API','WARN',f'Chưa kết nối được: {type(ex).__name__} (có thể Ollama đang tắt)')
    if args.online:
        net=root/'backend/sora/ai/network_research.py'
        if net.is_file():
            try:
                spec=importlib.util.spec_from_file_location('sora_maintenance_research',net)
                mod=importlib.util.module_from_spec(spec)
                sys.modules[spec.name]=mod
                spec.loader.exec_module(mod)
                blocked=mod.research('/web http://127.0.0.1:11434/api/tags')
                if blocked.get('sources') or not blocked.get('error'):
                    record('Chặn loopback','FAIL','Không từ chối đúng như dự kiến')
                else:
                    record('Chặn loopback','PASS',blocked.get('error'))
                result=mod.research('/web https://www.python.org/')
                if result.get('sources'):
                    record('Internet công cộng','PASS','Đã đọc nguồn công cộng')
                else:
                    record('Internet công cộng','WARN',result.get('error') or 'Chưa lấy được nguồn')
            except Exception as ex:
                record('Network Guard runtime','FAIL',str(ex))
    output=root.parent/'SORA_Audit'/'maintenance_check.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'checked_utc':datetime.now(timezone.utc).isoformat(),'root':str(root),'online':args.online,'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Báo cáo:',output)
    print('Kiểm tra này không đảm bảo mọi thao tác Electron đã đúng; cần mở ứng dụng và thử thực tế.')
    return 2 if any(x['status']=='FAIL' for x in results) else 0

if __name__=='__main__':
    raise SystemExit(main())
