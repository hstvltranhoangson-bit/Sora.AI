"""Lời nhắc cá nhân có sự đồng ý, lưu trong SQLite SORA hiện có.

Lấy cảm hứng từ cơ chế nhắc việc của Sora AI. Không cần dịch vụ nền,
không thay đổi bảng ký ức, không đọc màn hình, không gửi dữ liệu lên mạng.
"""
from __future__ import annotations

import re
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

from sora.ai.sora_memory import DB
from sora.ai.sqlite_session import sqlite_session

_LOCK = threading.RLock()


class SoraReminders:
    def __init__(self, db_path=None):
        self.db_path = Path(db_path) if db_path is not None else DB
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with _LOCK, sqlite_session(self.db_path) as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS sora_reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                due_at REAL NOT NULL,
                created_at REAL NOT NULL,
                delivered_at REAL,
                cancelled_at REAL
            )""")
            conn.execute("CREATE INDEX IF NOT EXISTS sora_reminders_due ON sora_reminders(due_at)")

    def schedule(self, minutes, text, now=None):
        minutes = int(minutes)
        text = str(text).strip()
        if not 1 <= minutes <= 43200 or not 1 <= len(text) <= 240:
            raise ValueError('Thời gian phải từ 1 đến 43200 phút, nội dung tối đa 240 ký tự.')
        now = time.time() if now is None else float(now)
        with _LOCK, sqlite_session(self.db_path) as conn:
            item = conn.execute(
                'INSERT INTO sora_reminders(message,due_at,created_at) VALUES (?,?,?)',
                (text, now + minutes * 60, now))
            return item.lastrowid

    def list_pending(self, limit=20):
        with _LOCK, sqlite_session(self.db_path) as conn:
            return conn.execute(
                'SELECT id,message,due_at FROM sora_reminders '
                'WHERE delivered_at IS NULL AND cancelled_at IS NULL ORDER BY due_at,id LIMIT ?',
                (max(1,min(int(limit),30)),)).fetchall()

    def cancel(self, reminder_id):
        try:
            reminder_id = int(reminder_id)
        except (TypeError,ValueError):
            return False
        with _LOCK, sqlite_session(self.db_path) as conn:
            result = conn.execute(
                'UPDATE sora_reminders SET cancelled_at=? WHERE id=? '
                'AND delivered_at IS NULL AND cancelled_at IS NULL',
                (time.time(),reminder_id))
            return result.rowcount == 1

    def pop_due(self, now=None, limit=3):
        """Claim in a transaction so a reminder is never sent twice by simultaneous polls."""
        now = time.time() if now is None else float(now)
        limit = max(1,min(int(limit),5))
        with _LOCK, sqlite_session(self.db_path) as conn:
            rows = conn.execute(
                'SELECT id,message,due_at FROM sora_reminders '
                'WHERE due_at<=? AND delivered_at IS NULL AND cancelled_at IS NULL '
                'ORDER BY due_at,id LIMIT ?', (now,limit)).fetchall()
            if rows:
                conn.executemany('UPDATE sora_reminders SET delivered_at=? WHERE id=?',
                                 [(now,r[0]) for r in rows])
            return rows


def reminder_command(text, store):
    """Returns None for non-reminder messages; never executes inferred commands."""
    raw = str(text).strip()
    if not re.match(r'^/nhac(?:\s|$)|^/lichnhac(?:\s|$)|^/huy-nhac(?:\s|$)',raw,re.I):
        return None
    if re.fullmatch(r'/lichnhac\s*',raw,re.I):
        entries = store.list_pending()
        if not entries:
            return 'Em chưa có lời nhắc nào đang chờ, anh nhé.'
        lines = []
        for rid,msg,due in entries:
            stamp = datetime.fromtimestamp(due).strftime('%d/%m %H:%M')
            lines.append(f'#{rid} · {stamp}: {msg}')
        return 'Các lời nhắc đang chờ:\n' + '\n'.join(lines)
    cancel = re.fullmatch(r'/huy-nhac\s+(\d+)\s*',raw,re.I)
    if cancel:
        return ('Em đã hủy lời nhắc #' if store.cancel(cancel.group(1)) else
                'Không có lời nhắc đang chờ mang mã #') + cancel.group(1) + '.'
    create = re.fullmatch(r'/nhac\s+(\d{1,5})\s+([\s\S]{1,240})',raw,re.I)
    if create:
        try:
            rid = store.schedule(int(create.group(1)),create.group(2))
            return f'Em sẽ nhắc anh sau {int(create.group(1))} phút (mã #{rid}).'
        except ValueError as exc:
            return str(exc)
    return ('Lệnh: /nhac <số phút> <nội dung> (ví dụ /nhac 15 nghỉ giải lao); '
            '/lichnhac; /huy-nhac <mã>.')
