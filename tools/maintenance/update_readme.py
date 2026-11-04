"""Append one tested release note to the sole project README.md."""
from __future__ import annotations
import argparse
from datetime import date
from pathlib import Path
import shutil

MARK = '<!-- SORA_CHANGELOG_START -->'
END = '<!-- SORA_CHANGELOG_END -->'


def update(path: Path, release: str, change: str, backup: Path, *, check=False):
    data = path.read_text(encoding='utf-8-sig')
    if data.count(MARK) != 1 or data.count(END) != 1:
        raise ValueError('README chưa có vùng changelog chuẩn; không tự ghi đè.')
    if not release.strip() or not change.strip():
        raise ValueError('Thiếu tên bản cập nhật hoặc mô tả thay đổi.')
    first, rest = data.split(MARK, 1)
    middle, last = rest.split(END, 1)
    entry = f'\n- **{date.today().isoformat()} — {release.strip()}**: {change.strip()}\n'
    if entry in middle:
        print('Đã có bản ghi, không chèn trùng.'); return False
    if check:
        print('OK — có thể cập nhật changelog duy nhất:', path)
        return True
    backup.mkdir(parents=True, exist_ok=True)
    name = f'README_before_{date.today().isoformat()}_{len(list(backup.glob("README_before_*.md"))) + 1:03d}.md'
    shutil.copy2(path, backup / name)
    updated = first + MARK + entry + middle + END + last
    tmp = path.with_suffix('.md.new')
    tmp.write_text(updated, encoding='utf-8')
    tmp.replace(path)
    print('Đã cập nhật duy nhất:', path)
    print('Lịch sử lưu ngoài dự án:', backup / name)
    return True


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root',type=Path,default=Path(r'H:\SORA'))
    p.add_argument('--release',required=True)
    p.add_argument('--change',required=True)
    p.add_argument('--check',action='store_true')
    args=p.parse_args()
    root=args.root
    return 0 if update(root / 'README.md',args.release,args.change,root.parent / 'SORA_Audit' / 'readme_history',check=args.check) is not None else 1

if __name__ == '__main__':
    raise SystemExit(main())
