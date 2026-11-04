"""Context-aware display emotions for SORA; the AI doesn't literally feel them.

Only processes the current conversational exchange. No sentiment API calls,
Ollama prompt changes, SQLite writes or implicit learning are introduced.
"""

import re
import unicodedata


PHRASES = {
    "PLAYFUL": (
        "trêu anh", "trêu đùa", "tinh nghịch", "nghịch một chút", "đùa thôi",
        "hehe", "hê hê", "hihi hử", "nhéo", "đừng bắt được em", "😛", "😝", "😜",
    ),
    "ANNOYED": (
        "em dỗi", "giận anh", "hơi giận", "tức giận", "bực mình", "hừ",
        "đáng ghét", "không thèm", "😤", "😠",
    ),
    "HAPPY": (
        "tuyệt", "tốt quá", "hay quá", "vui", "hạnh phúc", "chúc mừng",
        "cảm ơn", "thích quá", "đáng yêu", "happy", "great", "congrats",
        "love", "nice", "haha", "hihi", "😊", "🥰", "❤", "✨",
    ),
    "CONCERNED": (
        "buồn", "mệt", "lo lắng", "lo âu", "khó khăn", "sợ", "stress",
        "xin lỗi", "rất tiếc", "đau", "mất mát", "cô đơn", "sad", "sorry",
        "tired", "worried", "😢", "😭", "💔",
    ),
    "SURPRISED": (
        "bất ngờ", "thật sao", "không ngờ", "không thể tin", "wow",
        "trời ơi", "ơ kìa", "surprise", "😮", "😲", "🤯",
    ),
    "CURIOUS": (
        "tại sao", "vì sao", "thế nào", "làm sao", "không biết",
        "mình tò mò", "bạn nghĩ", "what if", "why", "how", "curious", "🤔",
    ),
}


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", (value or "").casefold())
    return "".join("d" if c == "đ" else c for c in value if unicodedata.category(c) != "Mn")


def _score(value: str) -> dict[str, float]:
    text = _normalize(value)
    scores = {name: 0.0 for name in PHRASES}
    for name, phrases in PHRASES.items():
        for phrase in phrases:
            pattern = r"(?<!\w)" + re.escape(_normalize(phrase)) + r"(?!\w)"
            if re.search(pattern, text):
                scores[name] += 1.0
    if "?" in value or "？" in value:
        scores["CURIOUS"] += 0.35
    if "!" in value:
        scores["SURPRISED"] += 0.15
    return scores


def detect_emotion(text: str) -> str:
    """Backwards-compatible single-message classification."""
    scores = _score(text)
    name = max(scores, key=scores.get)
    return name if scores[name] >= 0.35 else "CALM"


def choose_emotion(user_message: str, reply: str, previous: str = "CALM") -> str:
    """Factor the user's circumstances into the response expression.

    User distress has extra weight, so a supportive reply isn't depicted as
    a cheerful celebration just because it includes a positive expression.
    """
    request = _normalize(user_message)
    # Yêu cầu diễn xuất trực tiếp phải thắng lời xin lỗi chung chung của mô hình.
    # Trò chuyện *về* cơn giận không có nghĩa là Sora đang giận.
    explicit_act = bool(re.search(r'\b(?:hay|thu|gia vo|lam bo mat|cho anh xem|cuoi len)\b', request))
    if explicit_act:
        if re.search(r'\b(?:tuc gian|gian du|noi gian|mat gian)\b', request):
            return "ANNOYED"
        if re.search(r'\b(?:cuoi|vui ve|mat cuoi|hihi)\b', request):
            return "PLAYFUL"
    user = _score(user_message)
    answer = _score(reply)
    scores = {name: answer[name] * 1.2 + user[name] * 0.58 for name in PHRASES}
    if user["CONCERNED"] >= 1:
        scores["CONCERNED"] += user["CONCERNED"] * 1.3
    if previous in scores:
        scores[previous] += 0.20
    result = max(scores, key=scores.get)
    return result if scores[result] >= 0.7 else "CALM"
