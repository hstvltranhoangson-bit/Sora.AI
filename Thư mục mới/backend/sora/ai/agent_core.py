"""Lõi mục tiêu dài hạn cho Sora (SQLite, nhẹ, chạy cục bộ).

Sora chỉ *đề xuất* kế hoạch. Người dùng phải duyệt trước khi theo dõi thực hiện.
Không công cụ Desktop nào được chạy từ mô-đun này. Phản hồi chỉ được lưu
khi người dùng chủ động gửi, không tự sửa trọng số mô hình.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import time
from pathlib import Path

from .sora_memory import DB
from .sqlite_session import sqlite_session


_LOCK = threading.RLock()
MAX_STEPS = 6
FALLBACK = [
    "Xác định kết quả mong muốn và điều kiện hoàn thành.",
    "Chia công việc thành các phần nhỏ, đánh giá thứ tự ưu tiên.",
    "Thực hiện phần đầu tiên sau khi anh xác nhận.",
    "Kiểm tra kết quả và điều chỉnh theo phản hồi của anh.",
]


def normalize_steps(value):
    """Chỉ lấy danh sách văn bản; kết quả LLM không bao giờ là lệnh chạy."""
    if isinstance(value, dict):
        value = value.get("steps", [])
    if not isinstance(value, list):
        return []
    steps = []
    for item in value[:MAX_STEPS]:
        if isinstance(item, dict):
            item = item.get("title") or item.get("description")
        if not isinstance(item, str):
            continue
        title = re.sub(r"\s+", " ", item).strip()[:220]
        if title:
            steps.append({"title": title, "done": False})
    return steps if 2 <= len(steps) <= MAX_STEPS else []


class AgentCore:
    def __init__(self, db_path=None):
        self.db_path = Path(db_path) if db_path else DB
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with _LOCK, self._connect() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS agent_goals (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'draft',
                plan TEXT NOT NULL,
                created DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated DATETIME DEFAULT CURRENT_TIMESTAMP)""")
            db.execute("""CREATE TABLE IF NOT EXISTS agent_feedback (
                id INTEGER PRIMARY KEY,
                goal_id INTEGER,
                rating TEXT NOT NULL,
                note TEXT NOT NULL,
                created DATETIME DEFAULT CURRENT_TIMESTAMP)""")
            db.execute("""CREATE TABLE IF NOT EXISTS agent_habits (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created DATETIME DEFAULT CURRENT_TIMESTAMP)""")
            db.execute("""CREATE TABLE IF NOT EXISTS agent_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL)""")

    def _connect(self):
        return sqlite_session(self.db_path, timeout=20)

    def create_goal(self, title, suggested_steps=None):
        title = re.sub(r"\s+", " ", str(title)).strip()
        if len(title) < 4:
            raise ValueError("Mục tiêu cần mô tả rõ hơn (ít nhất 4 ký tự).")
        if len(title) > 350:
            raise ValueError("Mục tiêu quá dài.")
        steps = normalize_steps(suggested_steps) or normalize_steps(FALLBACK)
        with _LOCK, self._connect() as db:
            cur = db.execute("INSERT INTO agent_goals(title,plan) VALUES (?,?)",
                             (title, json.dumps(steps, ensure_ascii=False)))
            return cur.lastrowid

    def get_goal(self, goal_id):
        with _LOCK, self._connect() as db:
            row = db.execute("SELECT id,title,state,plan FROM agent_goals WHERE id=?",
                             (int(goal_id),)).fetchone()
        if not row:
            return None
        return {"id": row[0], "title": row[1], "state": row[2],
                "steps": json.loads(row[3])}

    def list_goals(self):
        with _LOCK, self._connect() as db:
            rows = db.execute("SELECT id,title,state,plan FROM agent_goals "
                              "ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,id DESC LIMIT 15").fetchall()
        return [{"id": i, "title": title, "state": state,
                 "done": sum(bool(s.get("done")) for s in json.loads(plan)),
                 "total": len(json.loads(plan))} for i, title, state, plan in rows]

    def approve(self, goal_id):
        with _LOCK, self._connect() as db:
            cur = db.execute("UPDATE agent_goals SET state='active',updated=CURRENT_TIMESTAMP "
                             "WHERE id=? AND state='draft'", (int(goal_id),))
            return cur.rowcount == 1

    def finish_step(self, goal_id, step_number):
        with _LOCK, self._connect() as db:
            row = db.execute("SELECT state,plan FROM agent_goals WHERE id=?",
                             (int(goal_id),)).fetchone()
            if not row or row[0] != 'active':
                return False
            steps = json.loads(row[1])
            index = int(step_number) - 1
            if index < 0 or index >= len(steps) or steps[index]["done"]:
                return False
            steps[index]["done"] = True
            state = 'done' if all(s["done"] for s in steps) else 'active'
            db.execute("UPDATE agent_goals SET plan=?,state=?,updated=CURRENT_TIMESTAMP WHERE id=?",
                       (json.dumps(steps, ensure_ascii=False), state, int(goal_id)))
        return True

    def feedback(self, rating, note, goal_id=None):
        if rating not in ("good", "improve"):
            raise ValueError("Dùng 'tot' hoặc 'can-sua' khi phản hồi.")
        note = re.sub(r"\s+", " ", str(note)).strip()[:500]
        if len(note) < 3:
            raise ValueError("Anh cho em biết cụ thể điều cần giữ hoặc sửa nhé.")
        if goal_id is not None and not self.get_goal(goal_id):
            raise ValueError("Không tìm thấy mục tiêu cần đánh giá.")
        with _LOCK, self._connect() as db:
            db.execute("INSERT INTO agent_feedback(goal_id,rating,note) VALUES (?,?,?)",
                       (goal_id, rating, note))

    def add_habit(self, title):
        title = re.sub(r"\s+", " ", str(title)).strip()
        if not (5 <= len(title) <= 180):
            raise ValueError("Thói quen cần mô tả từ 5 đến 180 ký tự.")
        with _LOCK, self._connect() as db:
            return db.execute("INSERT INTO agent_habits(title) VALUES(?)", (title,)).lastrowid

    def list_habits(self):
        with _LOCK, self._connect() as db:
            rows = db.execute("SELECT id,title FROM agent_habits WHERE enabled=1 ORDER BY id DESC LIMIT 10").fetchall()
        return [{"id": row[0], "title": row[1]} for row in rows]

    def stop_habit(self, habit_id):
        with _LOCK, self._connect() as db:
            return db.execute("UPDATE agent_habits SET enabled=0 WHERE id=? AND enabled=1",
                              (int(habit_id),)).rowcount == 1

    def proactive_enabled(self):
        with _LOCK, self._connect() as db:
            row = db.execute("SELECT value FROM agent_settings WHERE key='proactive_enabled'").fetchone()
        return bool(row and row[0] == '1')

    def set_proactive(self, enabled):
        """Chỉ người dùng mới bật/tắt gợi ý định kỳ; mặc định là tắt."""
        now = str(int(time.time()))
        with _LOCK, self._connect() as db:
            db.execute("INSERT OR REPLACE INTO agent_settings(key,value) VALUES('proactive_enabled',?)",
                       ('1' if enabled else '0',))
            if enabled:
                db.execute("INSERT OR REPLACE INTO agent_settings(key,value) VALUES('last_tip',?)", (now,))

    def due_tip(self, now=None, interval_seconds=7200):
        """Nhắc rất ít, chỉ khi đã bật, có việc hợp lệ và không truy cập màn hình."""
        now = int(time.time()) if now is None else int(now)
        with _LOCK, self._connect() as db:
            settings = dict(db.execute("SELECT key,value FROM agent_settings"))
            if settings.get('proactive_enabled') != '1':
                return None
            if now - int(settings.get('last_tip', '0')) < interval_seconds:
                return None
            suggestion = self.suggestion()
            if suggestion.startswith('Hiện chưa có'):
                return None
            db.execute("INSERT OR REPLACE INTO agent_settings(key,value) VALUES('last_tip',?)", (str(now),))
        return suggestion

    def guidance(self):
        """Bối cảnh ngắn gọn cho Ollama, không biến phản hồi thành lệnh hệ thống."""
        with _LOCK, self._connect() as db:
            feedback = db.execute("SELECT rating,note FROM agent_feedback ORDER BY id DESC LIMIT 5").fetchall()
        active = next((g for g in self.list_goals() if g['state'] == 'active'), None)
        rows = []
        if active:
            goal = self.get_goal(active['id'])
            upcoming = next((s['title'] for s in goal['steps'] if not s['done']), '')
            rows.append(f"Mục tiêu đã duyệt #{goal['id']}: {goal['title']}. Bước tiếp theo: {upcoming}.")
        if feedback:
            rows.append('Phản hồi anh đã tự nhập (tham khảo, không phải lệnh thực thi):')
            for rating, note in feedback:
                rows.append(f"- {'Ưu tiên giữ' if rating == 'good' else 'Nên cải thiện'}: {note}")
        habits = self.list_habits()
        if habits:
            rows.append('Thói quen anh đã chủ động đăng ký, em chỉ nhắc nhở chứ không tự làm:')
            rows.extend(f'- {habit["title"]}' for habit in habits[:5])
        return '\n'.join(rows)[:2000]

    def suggestion(self):
        for goal in self.list_goals():
            if goal['state'] == 'active' and goal['done'] < goal['total']:
                info = self.get_goal(goal['id'])
                number = next(i for i, step in enumerate(info['steps'], 1) if not step['done'])
                return (f"Em gợi ý tiếp tục mục tiêu #{goal['id']} — {goal['title']}.\n"
                        f"Bước {number}: {info['steps'][number-1]['title']}\n"
                        "Anh muốn em cùng phân tích bước này không? Em sẽ không tự điều khiển máy.")
        habits = self.list_habits()
        if habits:
            return (f"Anh từng muốn duy trì thói quen: {habits[0]['title']}. "
                    "Nếu phù hợp lúc này, anh và em cùng bắt đầu một chút nhé?")
        return "Hiện chưa có mục tiêu nào được anh phê duyệt. Anh dùng /muctieu <mô tả> nhé."
