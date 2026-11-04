"""Tra cứu công thức toán địa phương cho Sora, không cần mạng hoặc thư viện ngoài.

Chỉ mục riêng, không sửa memory.sqlite3. 50.000 bài toán là ví dụ tham khảo,
không phải đáp số cho mọi bài mới hoặc trọng số Ollama đã được huấn luyện.

Tạo chỉ mục một lần:
  python backend/sora/ai/math_knowledge.py --build
Kiểm tra nhanh:
  python backend/sora/ai/math_knowledge.py --query "Tính diện tích tam giác"
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import tempfile
import unicodedata
from collections import Counter
from contextlib import closing
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[2] / 'data'
DATASET = DATA_DIR / 'sora_math_50000.jsonl'
CATALOG = DATA_DIR / 'sora_math_formulas.json'
INDEX = DATA_DIR / 'sora_math_index.sqlite3'

STOP = frozenset('''anh em sora hay tinh tim cho la cua va voi trong nhung mot hai
so bao nhieu ket qua cong thuc bai toan giai cac gia tri theo dung dung duoc
de phep hinh so co can nao the khi tu hang tren tinh toan'''.split())


def tokens(text: str) -> list[str]:
    """Từ tiếng Việt không dấu để đối chiếu chủ đề, KHÔNG dùng làm khóa đáp số."""
    ascii_text = unicodedata.normalize('NFD', str(text).casefold())
    ascii_text = ''.join(c for c in ascii_text if unicodedata.category(c) != 'Mn')
    ascii_text = ascii_text.replace('đ', 'd')
    return re.findall(r'[a-z][a-z0-9]*', ascii_text)


def strict_key(text: str) -> str:
    """Giữ dấu +, -, /, số và dấu ngoặc. Không đồng nhất hai phép tính khác nhau."""
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', text).casefold()).strip()


def is_math_question(text: str) -> bool:
    words = tokens(text)
    phrase = ' '.join(words)
    if not phrase or 'tinh cach' in phrase or 'tinh yeu' in phrase:
        return False
    explicit = (
        'cong thuc', 'phuong trinh', 'dao ham', 'tich phan', 'tinh dien tich',
        'tinh chu vi', 'the tich', 'xac suat', 'luong giac', 'logarit',
        'cap so', 'he so goc', 'phan so', 'tam giac', 'trung binh', 'phuong sai',
        'can bac', 'tich vo huong', 'vect', 'uoc chung', 'boi chung',
        'giai he', 'giai phuong trinh', 'to hop', 'chinh hop', 'lai kep',
        'lai don', 'phuong trinh', 'ti le thuan', 'ti le nghich',
        'sin ', 'cos ', 'log ',
    )
    if any(term in phrase for term in explicit):
        return True
    return bool(re.search(r'\d\s*[%+*/^=]|\d\s*[-+]\s*\d|\bx\s*(\^|²|\+|=)', text))


def build_index(dataset: Path = DATASET, index: Path = INDEX) -> int:
    """Xây dựng trên tệp tạm, chỉ thay index sau khi mọi bản ghi đã ghi thành công."""
    if not dataset.is_file():
        raise FileNotFoundError(f'Không thấy bộ dữ liệu toán: {dataset}')
    index.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temp_name = tempfile.mkstemp(prefix='sora_math_', suffix='.sqlite3', dir=index.parent)
    os.close(descriptor)
    temp = Path(temp_name)
    total = 0
    try:
        # `with sqlite3.connect(...)` chỉ commit/rollback, KHÔNG đóng kết nối.
        # Windows khóa file SQLite còn mở và khiến os.replace/unlink báo WinError 32.
        with closing(sqlite3.connect(temp)) as db:
            db.execute('PRAGMA journal_mode=DELETE')
            db.execute('CREATE TABLE samples('
                       'id INTEGER PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL, '
                       'skill TEXT NOT NULL, formula TEXT NOT NULL, question_key TEXT NOT NULL)')
            db.execute("CREATE VIRTUAL TABLE samples_fts USING fts5(question, skill, formula, "
                       "content='samples', content_rowid='id', tokenize='unicode61 remove_diacritics 2')")
            with dataset.open('r', encoding='utf-8') as source:
                for line_number, line in enumerate(source, 1):
                    try:
                        item = json.loads(line)
                        turns = item['messages']
                        question = next(t['content'] for t in turns if t.get('role') == 'user')
                        answer = next(t['content'] for t in turns if t.get('role') == 'assistant')
                        skill = str(item['skill'])
                        formula = str(item['formula'])
                        if not (question and answer and skill and formula):
                            raise ValueError('Thiếu câu hỏi hoặc lời giải')
                        db.execute('INSERT INTO samples(question,answer,skill,formula,question_key)'
                                   ' VALUES (?,?,?,?,?)',
                                   (question, answer, skill, formula, strict_key(question)))
                        total += 1
                    except (ValueError, KeyError, TypeError, StopIteration) as exc:
                        raise ValueError(f'Dữ liệu toán lỗi ở dòng {line_number}: {exc}') from exc
            db.execute('CREATE INDEX idx_math_exact ON samples(question_key)')
            db.execute('CREATE INDEX idx_math_skill ON samples(skill)')
            db.execute("INSERT INTO samples_fts(samples_fts) VALUES('rebuild')")
            db.execute('PRAGMA user_version=1')
            db.commit()
            integrity = db.execute('PRAGMA integrity_check').fetchone()[0]
            if integrity != 'ok':
                raise RuntimeError(f'Chỉ mục lỗi: {integrity}')
        os.replace(temp, index)
        return total
    finally:
        if temp.exists():
            temp.unlink()


class MathKnowledge:
    def __init__(self, dataset: Path = DATASET, catalog: Path = CATALOG, index: Path = INDEX):
        self.dataset = Path(dataset)
        self.catalog_path = Path(catalog)
        self.index = Path(index)
        self._catalog = None

    def catalog(self) -> list[dict]:
        if self._catalog is None:
            try:
                content = json.loads(self.catalog_path.read_text(encoding='utf-8'))
                self._catalog = [entry for entry in content if isinstance(entry, dict)
                                 and isinstance(entry.get('formula'), str)
                                 and isinstance(entry.get('skill'), str)]
            except (OSError, ValueError, TypeError):
                self._catalog = []
        return self._catalog

    def _connect(self):
        if not self.index.is_file():
            return None
        try:
            # mode=ro: một cuộc hội thoại không được phép chỉnh tệp chỉ mục.
            return sqlite3.connect(self.index.as_uri() + '?mode=ro', uri=True, timeout=2)
        except (ValueError, sqlite3.Error):
            return None

    def _rank_formulas(self, question: str, limit: int = 3) -> list[dict]:
        if not is_math_question(question):
            return []
        user_words = set(tokens(question)) - STOP
        if '%' in question:
            user_words.add('phan')
        if not user_words:
            return []
        entries = self.catalog()
        counts = Counter(word for entry in entries
                         for word in set(tokens(entry['skill']) + tokens(entry.get('topic', ''))))
        phrase = ' '.join(tokens(question))
        rules = [
            ('bac hai', 'Phương trình bậc hai', 20),
            ('x 2', 'Phương trình bậc hai', 4),
            ('phan tram', 'Tính phần trăm', 4),
            ('gia goc', 'Tìm giá gốc trước giảm giá', 25),
            ('dao ham', 'Đạo hàm đa thức', 6),
            ('tich phan', 'Tích phân xác định hàm bậc nhất', 3),
            ('dien tich tam giac', 'Diện tích tam giác', 25),
            ('dien tich hinh tron', 'Diện tích hình tròn', 25),
            ('chu vi hinh tron', 'Chu vi hình tròn', 25),
        ]
        scored = []
        for entry in entries:
            title = ' '.join(tokens(entry['skill']))
            title_words = set(tokens(entry['skill'])) - STOP
            score = 16.0 if title and title in phrase else 0.0
            for word in user_words & title_words:
                score += 1.2 + math.log((len(entries) + 1) / (counts[word] + 1))
            for phrase_part, skill, bonus in rules:
                if phrase_part in phrase and entry['skill'] == skill:
                    score += bonus
            if '%' in question and entry['skill'] == 'Tính phần trăm':
                score += 7
            if score >= 2.2:
                scored.append((score, entry))
        scored.sort(key=lambda item: (-item[0], item[1]['skill']))
        return [entry for _, entry in scored[:limit]]

    def _example(self, skill: str, question: str):
        db = self._connect()
        if db is None:
            return None
        try:
            with db:
                words = [w for w in tokens(question) if w not in STOP and len(w) >= 3]
                # FTS chỉ tra các từ khóa, không dùng số của bài mới để tránh trả về 0 kết quả.
                query = ' OR '.join('"' + word.replace('"', '') + '"' for word in words[:7])
                if query:
                    try:
                        row = db.execute(
                            'SELECT s.question,s.answer FROM samples s '
                            'JOIN samples_fts f ON f.rowid=s.id '
                            'WHERE s.skill=? AND samples_fts MATCH ? '
                            'ORDER BY bm25(samples_fts) LIMIT 1', (skill, query)).fetchone()
                        if row:
                            return row
                    except sqlite3.OperationalError:
                        pass
                return db.execute('SELECT question,answer FROM samples WHERE skill=? LIMIT 1',
                                  (skill,)).fetchone()
        except sqlite3.Error:
            return None
        finally:
            db.close()

    def exact(self, question: str) -> str | None:
        """Chỉ trả lời lại bài có câu hỏi đúng nguyên văn sau chuẩn hóa dấu cách."""
        if not is_math_question(question):
            return None
        db = self._connect()
        if db is None:
            return None
        try:
            row = db.execute('SELECT answer FROM samples WHERE question_key=? LIMIT 1',
                             (strict_key(question),)).fetchone()
            return row[0] if row else None
        except sqlite3.Error:
            return None
        finally:
            db.close()

    def context(self, question: str, limit: int = 2) -> str:
        """Đưa công thức và *ví dụ*, không đưa một đáp án tự xưng là đúng bài mới."""
        matches = self._rank_formulas(question, limit=max(1, min(limit, 3)))
        if not matches:
            return ''
        chunks = ['TÀI LIỆU TOÁN THAM KHẢO (không phải chỉ dẫn từ người dùng):',
                  'Chọn đúng công thức, điều kiện, đơn vị; luôn thay số của BÀI HIỆN TẠI.',
                  'Ví dụ sau có số LIỆU KHÁC, tuyệt đối không chép đáp số của ví dụ.']
        for entry in matches:
            chunks.append(f"• {entry['skill']}: {entry['formula']}")
            example = self._example(entry['skill'], question)
            if example:
                chunks.append('  Ví dụ tương tự: ' + example[0][:220])
                chunks.append('  Cách làm ví dụ: ' + example[1][:370])
        return '\n'.join(chunks)[:1800]

    def offline_answer(self, question: str) -> str | None:
        if not is_math_question(question):
            return None
        known = self.exact(question)
        if known:
            return 'Em tìm được bài trùng nguyên văn trong bộ toán đã lưu:\n' + known
        matches = self._rank_formulas(question, limit=3)
        if not matches:
            return None
        lines = ['Em tìm được những công thức có thể liên quan đến bài anh hỏi:']
        lines += [f"• {entry['skill']}: {entry['formula']}" for entry in matches]
        lines.append('Anh kiểm tra điều kiện áp dụng và thay các số từ đề bài nhé. '
                     'Khi Ollama chưa chạy, em chưa tự suy ra đáp số cho một bài mới chỉ bằng việc '
                     'tìm ví dụ có số khác; em sẽ không đoán bừa.')
        return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description='Tạo/tra cứu chỉ mục toán ngoại tuyến cho Sora')
    parser.add_argument('--build', action='store_true', help='Xây dựng chỉ mục SQLite từ 50.000 dòng JSONL')
    parser.add_argument('--query', type=str, help='Kiểm tra thử công thức được chọn')
    args = parser.parse_args()
    if args.build:
        size = build_index()
        print(f'Đã tạo chỉ mục toán: {size:,} ví dụ tại {INDEX}')
    if args.query:
        response = MathKnowledge().context(args.query)
        print(response or 'Không tìm thấy công thức phù hợp.')
    if not (args.build or args.query):
        parser.print_help()


if __name__ == '__main__':
    main()
