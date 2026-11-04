from __future__ import annotations
import argparse, ast, datetime, pathlib, re, shutil, sys

MARK = '# SORA_NETWORK_OFFLINE_FALLBACK_V3'
HELPER = '''        # SORA_NETWORK_OFFLINE_FALLBACK_V3: never replace fresh web research with stale offline memory.
        def _sora_network_fallback():
            if cancel_event is not None and cancel_event.is_set():
                return on_done("")
            fallback_text = (
                "Hửm... em đã đọc được nguồn web, nhưng Ollama chưa phản hồi nên "
                "em chưa thể tổng hợp chính xác nội dung vừa đọc. Em không lấy "
                "câu trả lời cũ trong bộ nhớ để thay thế kết quả mới đâu anh."
                + source_footer(network_result)
            )
            self.memory.add("user", user_message)
            self.memory.add("assistant", fallback_text)
            on_token(fallback_text)
            return on_done(fallback_text)

'''

def patch_source(src):
    ast.parse(src)
    if MARK in src:
        return src, False
    if '# SORA_NETWORK_ACCURACY_V2' not in src:
        raise ValueError('Chưa thấy Network Accuracy V2; không áp dụng bản vá này.')
    tree=ast.parse(src)
    cls=next((x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='OllamaClient'),None)
    fn=next((x for x in cls.body if isinstance(x,ast.FunctionDef) and x.name=='_stream'),None) if cls else None
    if fn is None: raise ValueError('Không tìm thấy OllamaClient._stream')
    lines=src.splitlines(keepends=True)
    body=''.join(lines[fn.lineno-1:fn.end_lineno])
    anchor='        payload = json.dumps({'
    if body.count(anchor)!=1 or body.count('        network_result = research(user_message, cancel_event)') !=1:
        raise ValueError('Cấu trúc _stream không còn khớp. Không ghi đè.')
    if 'source_footer(network_result)' not in body: raise ValueError('Thiếu source_footer.')
    call='self._reply_offline(user_message, on_token, on_done, on_error, cancel_event, profile)'
    line_return=f'                return {call}'
    line_except=f'            {call}'
    if body.count(line_return)!=1 or body.count(line_except)<1:
        raise ValueError('Nhánh dự phòng thay đổi; cần ghép mã thủ công.')
    # Only within OllamaClient._stream; no other offline behavior or memory path changes.
    body=body.replace(anchor, HELPER+anchor,1)
    body=body.replace(line_return, f'                return _sora_network_fallback() if network_result["attempted"] else {call}',1)
    except_pos=body.rfind(line_except)
    if except_pos<0:raise ValueError('Thiếu nhánh except của Ollama')
    body=body[:except_pos]+'            return _sora_network_fallback() if network_result["attempted"] else '+call+body[except_pos+len(line_except):]
    candidate=''.join(lines[:fn.lineno-1])+body+''.join(lines[fn.end_lineno:])
    ast.parse(candidate)
    return candidate, True

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--root',type=pathlib.Path,required=True)
    g=p.add_mutually_exclusive_group()
    g.add_argument('--check',action='store_true')
    g.add_argument('--restore',action='store_true')
    args=p.parse_args()
    root=args.root.resolve()
    source=root/'backend/sora/ai/model_client.py'
    backups=root/'network_fallback_backups'
    if args.restore:
        options=sorted([x for x in backups.glob('*') if x.is_dir()],reverse=True) if backups.is_dir() else []
        if not options:raise SystemExit('Không tìm thấy bản sao lưu.')
        saved=options[0]/'model_client.py'
        if not saved.is_file():raise SystemExit('Bản sao lưu không đầy đủ.')
        shutil.copy2(saved,source)
        print('Đã khôi phục:',str(saved));return
    if not source.is_file():raise SystemExit(f'Không tìm thấy {source}')
    before=source.read_text(encoding='utf-8-sig')
    try:after,changed=patch_source(before)
    except (ValueError,SyntaxError) as err: raise SystemExit('KHÔNG SỬA: '+str(err))
    print('KIỂM TRA OK — '+('cần vá' if changed else 'đã tích hợp')+' : '+str(source))
    if args.check or not changed: return
    stamp=datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    slot=backups/stamp
    slot.mkdir(parents=True,exist_ok=False)
    shutil.copy2(source,slot/'model_client.py')
    try:
        source.write_text(after,encoding='utf-8')
        ast.parse(source.read_text(encoding='utf-8'))
    except Exception:
        shutil.copy2(slot/'model_client.py',source)
        raise
    print('ĐÃ CÀI — ngăn bộ nhớ offline ghi đè kết quả nghiên cứu web.')
    print('Sao lưu:',slot)
    print('Mốc SHA-256 hiện có KHÔNG được tự thay đổi.')

if __name__=='__main__':
    main()
