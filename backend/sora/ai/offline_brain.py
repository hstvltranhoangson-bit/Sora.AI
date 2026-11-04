"""Trả lời dự phòng bằng ký ức và ví dụ đã duyệt khi Ollama ngừng chạy.

Đây là truy xuất văn bản có kiểm soát, KHÔNG phải mô hình sinh ngôn ngữ
hay quá trình huấn luyện mới. Dữ liệu JSONL chỉ được dùng như mẫu hội thoại
tham khảo khi câu hỏi trùng khớp rất cao; không biến thành dữ kiện cá nhân.
"""

from __future__ import annotations

import json
import re
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path
from sora.ai.math_solver import solve_math_question

DATASET = Path(__file__).resolve().parents[2] / 'data' / 'sora_vietnamese_50000.jsonl'


def normalize(value: str) -> str:
    value = unicodedata.normalize('NFC', str(value)).casefold()
    return ' '.join(re.findall(r'\w+', value, flags=re.UNICODE))


def similarity(first: str, second: str) -> float:
    a, b = normalize(first), normalize(second)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    ta, tb = set(a.split()), set(b.split())
    common = ta & tb
    if not common:
        return 0.0
    overlap = len(common) / len(ta | tb)
    return 0.65 * SequenceMatcher(None, a, b).ratio() + 0.35 * overlap


def dataset_pairs(path: Path):
    """Đọc tuần tự để không chiếm hàng chục MB RAM của laptop."""
    if not path.is_file():
        return
    with path.open('r', encoding='utf-8') as file:
        for line in file:
            try:
                obj = json.loads(line)
            except (ValueError, UnicodeError):
                continue
            turns = obj.get('messages', []) if isinstance(obj, dict) else []
            if not isinstance(turns, list):
                continue
            question = next((turn.get('content') for turn in turns
                             if isinstance(turn, dict) and turn.get('role') == 'user'), None)
            answer = next((turn.get('content') for turn in turns
                           if isinstance(turn, dict) and turn.get('role') == 'assistant'), None)
            if isinstance(question, str) and isinstance(answer, str) and answer.strip():
                yield question, answer


class OfflineBrain:
    def __init__(self, memory, dataset: Path = DATASET, math_knowledge=None):
        self.memory = memory
        self.dataset = Path(dataset)
        self.math_knowledge = math_knowledge

    def reply(self, text: str, cancel_event=None, profile=None) -> str:
        query = normalize(text)
        if not query:
            return 'Anh hỏi lại em bằng một câu ngắn nhé.'

        # Khi Ollama tắt, những dạng đã có công cụ giải chính xác vẫn
        # kiểm chứng được hoàn toàn ngoại tuyến.
        checked_math = solve_math_question(text)
        if checked_math is not None:
            return checked_math

        # Trả lời truy vấn dữ kiện được ghi nhớ bằng SQLite, không đoán.
        find_fact = getattr(self.memory, 'lookup_fact_question', None)
        fact = find_fact(text) if callable(find_fact) else None
        if fact:
            key, value = fact
            return f'Em nhớ, anh đã lưu: {key} = {value}'

        # Chỉ thông tin mà chủ nhân thực sự đã lưu, không suy ra ký ức từ
        # lịch sử trò chuyện hoặc các câu hỏi trong tập dữ liệu mẫu.
        facts = self.memory.facts()
        rt_notes = profile.get('memories', []) if isinstance(profile, dict) else []
        rt_notes = [item.strip() for item in rt_notes
                    if isinstance(item, str) and item.strip()] if isinstance(rt_notes, list) else []
        if any(marker in query for marker in (
                'nhớ', 'biết gì về', 'thông tin của tôi', 'sở thích của tôi',
                'của tôi', 'của anh', 'em biết anh', 'anh là ai', 'tên anh')):
            matches = []
            for key, value in facts.items():
                tokens = set(normalize(key).split())
                if tokens and len(tokens & set(query.split())) >= max(1, len(tokens) * 0.6):
                    matches.append((key, value))
            if matches:
                return 'Theo ký ức anh đã lưu:\n' + '\n'.join(f'• {key}: {value}' for key, value in matches[:8])
            trivial = {'sơn', 'mình', 'tôi', 'bạn', 'có', 'nhớ', 'đã', 'là', 'và', 'thích', 'trong'}
            terms = set(query.split()) - trivial
            related_notes = [note for note in rt_notes
                             if (set(normalize(note).split()) - trivial) & terms]
            if related_notes:
                return 'Theo ghi chú anh đã thêm trong giao diện:\n' + '\n'.join('• ' + note[:200] for note in related_notes[:5])
            if not facts and not rt_notes and not any(term in query for term in
                     ('đã nói', 'từng nói', 'lần trước', 'trước đây', 'hôm trước', 'nhớ lại')):
                return 'Em chưa có ký ức nào được anh xác nhận. Anh có thể dùng /ghinho tên = nội dung nhé.'

        # Nhắc lại chính những gì anh từng nói, nếu anh yêu cầu tìm trong
        # lịch sử. Phân biệt lời đã nói với dữ kiện đã được xác nhận.
        if any(marker in query for marker in
               ('đã nói', 'từng nói', 'lần trước', 'trước đây', 'hôm trước', 'nhớ lại')):
            recall = getattr(self.memory, 'recall', None)
            if callable(recall):
                matches = recall(text, limit=3)
                if matches:
                    citations = [str(item.get('text', '')).strip()[:240]
                                 for item in matches if isinstance(item, dict) and item.get('text')]
                    if citations:
                        return ('Em tìm thấy những câu anh đã nói trước đây (em chưa tự kiểm chứng nội dung):\n'
                                + '\n'.join('• ' + sentence for sentence in citations))

        # Bài toán cần đối chiếu ĐÚNG dữ kiện. Không để ngưỡng gần đúng
        # của training_examples trả nhầm đáp số của bài có số khác.
        # Các câu không liên quan toán học vẫn đi theo bộ nhớ như cũ.
        if self.math_knowledge is not None:
            math_answer = self.math_knowledge.offline_answer(text)
            if math_answer:
                return math_answer

        # Ví dụ được phê duyệt có độ tin cậy ưu tiên cao nhất.
        best_score, best_answer = 0.0, ''
        for _, prompt, answer, _ in self.memory.training_examples(approved_only=True):
            score = similarity(query, prompt)
            if score > best_score:
                best_score, best_answer = score, answer
        if best_score >= 0.76:
            return best_answer

        # Khi chủ nhân nhắc lại chính câu hỏi cũ, có thể trích lời giải từ
        # hội thoại trước. Đây không phải "sự thật đã xác minh".
        recent = self.memory.recent(40)
        for index in range(len(recent) - 1):
            first, second = recent[index:index + 2]
            if first.get('role') != 'user' or second.get('role') != 'assistant':
                continue
            answer = second.get('content', '')
            if not isinstance(answer, str) or not answer.strip() or len(answer) > 4000:
                continue
            if answer.startswith('[Sora đang dùng ký ức'):
                continue  # tránh lặp nhiều lần câu trả lời dự phòng
            if answer.startswith(('Em chưa tìm được câu trả lời đáng tin',
                                  'Em vẫn ở đây với anh. Hiện Ollama')):
                continue  # không biến câu thiếu dữ liệu thành một lời giải đã nhớ
            if similarity(query, first.get('content', '')) >= 0.94:
                return ('Em tìm thấy câu trả lời trước đây của anh và em (chưa được xác minh lại):\n'
                        + answer)

        # Bộ JSONL dùng làm mẫu lời thoại, không được xem như tri thức thật.
        # Cần khớp cực cao và không truy xuất nếu đang hủy yêu cầu.
        query_terms = set(query.split())
        for prompt, answer in dataset_pairs(self.dataset):
            if cancel_event is not None and cancel_event.is_set():
                return ''
            prompt_terms = set(normalize(prompt).split())
            if not prompt_terms:
                continue
            overlap = len(query_terms & prompt_terms) / len(query_terms | prompt_terms)
            # Khi trùng từ thấp, không thể đạt ngưỡng 0.9 dù chuỗi có giống.
            # Tránh so khớp chuỗi tốn CPU trên 50.000 câu mẫu.
            if overlap < 0.72:
                continue
            score = similarity(query, prompt)
            if score > best_score:
                best_score, best_answer = score, answer
                if score == 1.0:
                    break
        if best_score >= 0.9:
            return best_answer

        if query in ('chào', 'xin chào', 'chào sora', 'sora ơi', 'alo', 'em ơi'):
            return 'Em đây, anh! Em vẫn nhớ những điều mình đã lưu. Anh có chuyện gì muốn kể em nghe không?'
        if '?' in text or any(query.startswith(prefix) for prefix in
                              ('tại sao', 'vì sao', 'cách', 'làm sao', 'giải thích', 'như thế nào')):
            return ('Em chưa tìm được câu trả lời đáng tin cho câu này trong ký ức đã lưu, anh à. '
                    'Em vẫn tra lại được ký ức, nhưng cần Ollama hoạt động để phân tích một câu hỏi mới.')
        return ('Em vẫn nghe anh đây. Em còn giữ ký ức đã lưu, nhưng Ollama đang tắt '
                'nên em chưa tự tạo được lời đáp linh hoạt cho điều anh vừa nói. '
                'Anh kể cụ thể thêm một chút nhé?')
