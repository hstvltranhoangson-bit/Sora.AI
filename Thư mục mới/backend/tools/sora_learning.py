"""Run from project root: .venv\\Scripts\\python.exe tools\\sora_learning.py ..."""
import argparse,csv,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from sora.ai.sora_memory import Memory,DB

# Lệnh cũ được giữ nguyên để không làm hỏng các tập lệnh trước đây.
ALIASES = {
    'danhsach': 'list',
    'ghinho': 'remember',
    'quen': 'forget',
    'vidu': 'example',
    'cacvidu': 'examples',
    'duyet': 'approve',
    'tuchoi': 'reject',
    'xoa-vidu': 'delete-example',
    'xuat': 'export',
}

def main():
    p=argparse.ArgumentParser(description='Quản lý ký ức và dữ liệu học đã duyệt của Sora (ngoại tuyến)')
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('list',aliases=['danhsach'],help='Liệt kê các ký ức đã lưu')
    a=sub.add_parser('remember',aliases=['ghinho'],help='Ghi nhớ một thông tin');a.add_argument('key');a.add_argument('value')
    a=sub.add_parser('forget',aliases=['quen'],help='Quên một thông tin');a.add_argument('key')
    sub.add_parser('examples',aliases=['cacvidu'],help='Xem các ví dụ học')
    a=sub.add_parser('example',aliases=['vidu'],help='Thêm ví dụ mới chờ duyệt');a.add_argument('prompt');a.add_argument('answer')
    for cmd in ('approve','reject','delete-example'):
        alias = {'approve':'duyet','reject':'tuchoi','delete-example':'xoa-vidu'}[cmd]
        a=sub.add_parser(cmd,aliases=[alias]);a.add_argument('id',type=int)
    a=sub.add_parser('export',aliases=['xuat'],help='Xuất các ví dụ được duyệt thành JSONL');a.add_argument('--output',default='data/sora_train_approved.jsonl')
    args=p.parse_args();m=Memory()
    command=ALIASES.get(args.command,args.command)
    if command=='list':
        for k,v in m.facts().items():print(f'{k}: {v}')
    elif command=='remember':m.remember(args.key,args.value);print('Đã lưu ký ức được yêu cầu')
    elif command=='forget':m.forget(args.key);print('Đã xóa khóa ký ức')
    elif command=='examples':
        for i,q,a,s in m.training_examples():print(f'#{i} [{"đã duyệt" if s==1 else "đã từ chối" if s==-1 else "chờ duyệt"}] {q[:75]} -> {a[:75]}')
    elif command=='example':print('Ví dụ chờ duyệt ID:',m.add_training_example(args.prompt,args.answer))
    elif command in ('approve','reject'):print('Đã cập nhật' if m.review_training(args.id,command=='approve') else 'Không tìm thấy ID')
    elif command=='delete-example':print('Đã xóa' if m.delete_training(args.id) else 'Không tìm thấy ID')
    elif command=='export':
        path=ROOT/args.output;path.parent.mkdir(parents=True,exist_ok=True)
        rows=m.training_examples(True)
        with path.open('w',encoding='utf-8') as f:
            for _,q,a,_ in rows:f.write(json.dumps({'messages':[{'role':'user','content':q},{'role':'assistant','content':a}]},ensure_ascii=False)+'\n')
        print(f'Xuất {len(rows)} ví dụ đã duyệt: {path}')
if __name__=='__main__':main()
