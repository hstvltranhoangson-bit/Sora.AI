"""Advisory SHA-256 source baseline, kept outside the project directory."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path

SOURCE_EXT = {".py", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".json", ".css", ".html", ".ps1", ".bat", ".cmd", ".toml", ".yml", ".yaml", ".sql"}
SKIP_DIRS = {".venv", "venv", "node_modules", "__pycache__", ".git", ".idea", ".vscode", "assets", "data", "logs", "cache", ".cache", "tmp", "temp", "dist", "build", "bin", "obj", "network_backups", "glitch_backups", "persona_backups", "screen_context_backups", "integrity_backups"}


def snapshot(root: Path):
    hashes = {}
    for location, directories, files in os.walk(root):
        directories[:] = [d for d in directories if d.casefold() not in SKIP_DIRS and not d.startswith(".")]
        for filename in files:
            path = Path(location) / filename
            if path.suffix.lower() not in SOURCE_EXT:
                continue
            if path.is_symlink() or not path.is_file():
                continue
            relative = path.relative_to(root).as_posix()
            sha = hashlib.sha256()
            with path.open("rb") as f:
                for block in iter(lambda: f.read(1024 * 1024), b""):
                    sha.update(block)
            hashes[relative] = sha.hexdigest()
    return dict(sorted(hashes.items()))


def main():
    p = argparse.ArgumentParser(description="Tạo hoặc kiểm tra mốc SHA-256 mã nguồn Sora.")
    p.add_argument("action", choices=("seal", "check"))
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--replace", action="store_true", help="Tạo lại mốc sau khi đã xác minh bản cập nhật hợp lệ")
    a = p.parse_args()
    root = a.root.resolve()
    manifest = a.manifest.resolve()
    if not root.is_dir():
        raise SystemExit("Không có thư mục dự án " + str(root))
    if manifest == root or root in manifest.parents:
        raise SystemExit("Mốc phải nằm NGOÀI thư mục dự án Sora.")
    hashes = snapshot(root)
    if a.action == "seal":
        if manifest.exists() and not a.replace:
            raise SystemExit("Mốc đã tồn tại! Không ghi đè. Chỉ dùng --replace sau khi xác minh thay đổi hợp lệ.")
        if not hashes:
            raise SystemExit("Không tìm thấy mã nguồn để tạo mốc.")
        payload = {"schema": 1, "created_utc": datetime.now(timezone.utc).isoformat(),
                   "root": str(root), "files": hashes,
                   "notes": "Phát hiện thay đổi mã nguồn, KHÔNG chứng minh sạch mã độc."}
        manifest.parent.mkdir(parents=True, exist_ok=True)
        if manifest.exists() and a.replace:
            archived = manifest.with_name("integrity_baseline_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".json")
            archived.write_bytes(manifest.read_bytes())
            print("Đã lưu bản mốc cũ:", archived)
        temp = manifest.with_name(manifest.name + ".new")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(manifest)
        print("ĐÃ TẠO MỐC:", len(hashes), "file")
        print("Đường dẫn:", manifest)
        print("Không xóa hoặc chỉnh sửa code Sora.")
        return 0
    if not manifest.is_file():
        raise SystemExit("Chưa có mốc. Chỉ tạo sau khi đã kiểm tra dự án hoạt động bình thường.")
    stored = json.loads(manifest.read_text(encoding="utf-8-sig"))
    old = stored.get("files", {})
    if not isinstance(old, dict) or stored.get("schema") != 1:
        raise SystemExit("Mốc SHA-256 không hợp lệ.")
    removed = sorted(set(old) - set(hashes))
    new = sorted(set(hashes) - set(old))
    modified = sorted(k for k in set(old) & set(hashes) if old[k] != hashes[k])
    print("ĐÃ QUÉT:", len(hashes), "file")
    for name, paths in (("BỊ SỬA", modified), ("BỊ THÊM", new), ("BỊ XÓA", removed)):
        for path in paths[:40]:
            print(f"[{name}] {path}")
        if len(paths) > 40:
            print("...và", len(paths) - 40, "file", name.lower(), "khác")
    if removed or new or modified:
        print("PHÁT HIỆN THAY ĐỔI:", len(modified), "sửa,", len(new), "thêm,", len(removed), "xóa")
        return 2
    print("OK: Không thấy thay đổi trong các file mã nguồn đã giám sát.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
