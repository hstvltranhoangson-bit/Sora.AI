"""SQLite memory. Explicitly approved facts and training examples only."""
import os, sqlite3, threading, json, shutil, re, unicodedata
from pathlib import Path
from .sqlite_session import sqlite_session
ROOT = Path(__file__).resolve().parents[2]
DB = Path(os.environ.get('SORA_MEMORY_DB', str(ROOT / 'data' / 'memory.sqlite3')))
_LOCK = threading.RLock()
_REMEMBER_COMMAND = re.compile(
    r'^\s*(?:(?:sora|em)\s*[,!]?\s*)?'
    r'(?:(?:anh muốn em|anh muốn|em hãy|hãy|làm ơn|nhờ em|em)\s+)?'
    r'(?:ghi nhớ|nhớ kỹ|nhớ giúp anh|lưu vào ký ức|lưu lại)'
    r'(?:\s+(?:rằng|là))?\s+(?P<body>.+)$', re.IGNORECASE | re.DOTALL)


def parse_natural_remember(message):
    """Chỉ ghi nhận yêu cầu lưu dữ kiện RÕ RÀNG, có tên và giá trị.

    Không phân tích mọi lời nói để tự suy đoán ký ức vĩnh viễn.
    """
    if not isinstance(message, str) or len(message) > 1200:
        return None
    matched = _REMEMBER_COMMAND.match(message)
    if not matched:
        return None
    body = re.split(r'\.\s*(?:hãy|em hãy|xác nhận|trả lời)\b',
                    matched.group('body'), maxsplit=1, flags=re.IGNORECASE)[0].strip(' .\n')
    parts = re.split(r'\s+(?:là|bằng)\s+|\s*[=:]\s*', body, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) != 2:
        return None
    key, value = (item.strip(' \t\n.\"“”') for item in parts)
    if not key or not value or len(key) > 100 or len(value) > 500:
        return None
    return key, value


def _fold_unicode(value):
    value = unicodedata.normalize('NFD', str(value).casefold()).replace('đ', 'd')
    return ''.join(char for char in value if unicodedata.category(char) != 'Mn')


class Memory:
    def __init__(self):
        DB.parent.mkdir(parents=True, exist_ok=True)
        # Chỉ sao chép dữ liệu mẫu khi cài mới. Không bao giờ ghi đè SQLite
        # đang tồn tại cùng các ví dụ học đã được người dùng phê duyệt.
        seed = ROOT / 'data' / 'memory_seed.sqlite3'
        if not DB.exists() and seed.exists() and DB.resolve() != seed.resolve():
            with _LOCK:
                if not DB.exists():
                    shutil.copy2(seed, DB)
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, role TEXT, content TEXT, created DATETIME DEFAULT CURRENT_TIMESTAMP)')
            # Nâng cấp tại chỗ, giữ nguyên toàn bộ tin nhắn đã có trong DB cũ.
            columns = {row[1] for row in db.execute('PRAGMA table_info(messages)')}
            if 'kind' not in columns:
                db.execute("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'")
            if 'source' not in columns:
                db.execute("ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT 'desktop'")
            db.execute('CREATE TABLE IF NOT EXISTS facts (key TEXT PRIMARY KEY, value TEXT)')
            db.execute('CREATE TABLE IF NOT EXISTS training_examples (id INTEGER PRIMARY KEY, prompt TEXT NOT NULL, answer TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created DATETIME DEFAULT CURRENT_TIMESTAMP)')
    def add(self, role, content, source='desktop'):
        if role not in ('user','assistant') or not content: return
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('INSERT INTO messages(role,content,kind,source) VALUES (?,?,?,?)',
                       (role,str(content)[:10000], 'chat', str(source)[:32]))
    def add_event(self, content, source='chess'):
        """Lời thoại sự kiện không phải câu người dùng viết; không nạp như chỉ thị LLM."""
        if not str(content).strip(): return
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('INSERT INTO messages(role,content,kind,source) VALUES (?,?,?,?)',
                       ('assistant', str(content).strip()[:2000], 'event', str(source)[:32]))
    def recent(self, n=12):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            rows=db.execute("SELECT role,content FROM messages WHERE kind='chat' ORDER BY id DESC LIMIT ?", (max(1,min(n,40)),)).fetchall()
        return [{'role':r,'content':c} for r,c in reversed(rows)]
    def conversation(self, n=100):
        """Luồng hiển thị chung cho mọi giao diện, gồm chat và sự kiện trò chơi."""
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            rows=db.execute('SELECT id,role,content,kind,source,created FROM messages ORDER BY id DESC LIMIT ?',
                            (max(1,min(int(n),200)),)).fetchall()
        return [dict(id=i,role=r,content=c,kind=k,source=s,created=t)
                for i,r,c,k,s,t in reversed(rows)]
    def recall(self, query, limit=3):
        """Gợi lại lời của anh từ lâu, tra đơn giản theo từ khóa, không tự suy diễn sự kiện."""
        stop = {'anh','em','sora','này','được','không','trong','đang','muốn','nhưng',
                'giúp','cho','nhé','là','của','một','những','với','thì','hôm','qua',
                'vừa','mới','thế','nào','nhớ','tôi','chúng','mình','về','tại','sao'}
        words = [w for w in re.findall(r'(?u)[^\W_]{3,}', str(query).lower()) if w not in stop]
        tokens = list(dict.fromkeys(sorted(words, key=len, reverse=True)))[:6]
        if not tokens: return []
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            # Bỏ 12 tin mới nhất: chúng đã có trong ngữ cảnh cuộc trò chuyện.
            rows = db.execute("SELECT content,created FROM messages WHERE kind='chat' AND role='user' "
                              "AND id < COALESCE((SELECT id FROM messages WHERE kind='chat' "
                              "ORDER BY id DESC LIMIT 1 OFFSET 11),0) "
                              "ORDER BY id DESC LIMIT 350").fetchall()
        matches = []
        for content, created in rows:
            lowered = content.lower()
            hits = sum(1 for word in tokens if word in lowered)
            if hits:
                matches.append((hits, len(matches), {'when':created, 'text':content[:360]}))
        matches.sort(key=lambda row: (-row[0], row[1]))
        return [item for _,_,item in matches[:max(0,min(int(limit),5))]]
    def lookup_fact_question(self, question):
        """Truy xuất dữ kiện đã lưu theo đúng tên, không nhờ LLM đoán giá trị."""
        text = _fold_unicode(question)
        if not any(marker in text for marker in ('?', 'la gi', 'bao nhieu', 'nho', 'da luu', 'da ghi')):
            return None
        for key, value in sorted(self.facts().items(), key=lambda item: len(item[0]), reverse=True):
            folded_key = _fold_unicode(key)
            if len(folded_key) >= 3 and re.search(r'(?<!\w)' + re.escape(folded_key) + r'(?!\w)', text):
                return key, value
        return None

    def clear_messages(self):
        """Delete conversation only after explicit user request; keep facts/examples."""
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('DELETE FROM messages')
    def remember(self, key, value):
        if not str(key).strip() or not str(value).strip(): raise ValueError('Tên và nội dung ký ức không được trống')
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('INSERT OR REPLACE INTO facts(key,value) VALUES (?,?)',(str(key).strip()[:120],str(value).strip()[:2000]))
    def forget(self,key):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            db.execute('DELETE FROM facts WHERE key=?',(key,))
    def facts(self):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            return dict(db.execute('SELECT key,value FROM facts ORDER BY key LIMIT 100'))
    def add_training_example(self,prompt,answer):
        if not prompt.strip() or not answer.strip(): raise ValueError('Ví dụ không được trống')
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            cur=db.execute('INSERT INTO training_examples(prompt,answer,approved) VALUES (?,?,0)',(prompt[:4000],answer[:8000]))
            return cur.lastrowid
    def review_training(self,example_id,approve):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            cur=db.execute('UPDATE training_examples SET approved=? WHERE id=?',(1 if approve else -1,int(example_id)))
            return cur.rowcount>0
    def training_examples(self,approved_only=False):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            q='SELECT id,prompt,answer,approved FROM training_examples'
            if approved_only:q+=' WHERE approved=1'
            return db.execute(q+' ORDER BY id').fetchall()
    def delete_training(self,example_id):
        with _LOCK, sqlite_session(DB, timeout=20) as db:
            return db.execute('DELETE FROM training_examples WHERE id=?',(int(example_id),)).rowcount>0
