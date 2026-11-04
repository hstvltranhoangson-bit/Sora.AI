"""Quy ước anh/em cho lời đáp *hiển thị*, không chỉnh dữ liệu người dùng.

Mô hình nhỏ có thể bỏ qua prompt và tự xưng tôi/bạn. Bộ lọc này chỉ đổi đại từ
trong lời nói thường, giữ nguyên vùng code Markdown và không can thiệp công cụ.
"""

from __future__ import annotations

import re
from typing import Callable


_CODE = re.compile(r'(```[\s\S]*?```|`[^`\n]*`)', re.UNICODE)
_WORDS = re.compile(
    r'(?<!\w)(chúng\s+mình|Chúng\s+mình|chúng\s+tôi|Chúng\s+tôi|'
    r'Tôi|tôi|Mình|mình|Bạn|bạn|Cậu|cậu)(?!\w)', re.UNICODE)
_MAP = {
    'tôi': 'em', 'mình': 'em', 'bạn': 'anh', 'cậu': 'anh',
    'chúng mình': 'anh và em', 'chúng tôi': 'anh và em',
}
_AWKWARD_ALTERNATIVES = re.compile(
    r'(?i)\b(?:anh|bạn|cậu)\s*/\s*(?:anh ấy|em|bạn|cậu)\b'
)
_CANNED_ENGLISH = {
    'hello again, sora! how can i assist you today?':
        'Anh quay lại rồi à? Em đang nghe đây, anh muốn kể em chuyện gì nào?',
    'how can i assist you today?': 'Anh muốn em giúp gì hôm nay?',
}
_ENGLISH_TOKENS = frozenset(
    'hello again how can i assist you today what do want help with your my the this '
    'that please let me know thanks sorry about understand would could should'
    .split()
)


def companion_voice(message: str) -> str:
    """Chỉnh cách xưng hô, không sửa code, đường dẫn nằm trong dấu backtick."""
    if not isinstance(message, str):
        return message

    def change(sentence):
        # Mô hình bé đôi khi in nhiều lựa chọn xưng hô cách nhau bằng "/".
        # Đó không phải hai nhân vật; Sora chỉ nên gọi người đối thoại là anh.
        sentence = _AWKWARD_ALTERNATIVES.sub('anh', sentence)
        def word(match):
            original = match.group(0)
            if original.lower() == 'bạn' and re.match(r'\s+(bè|học|thân)\b', sentence[match.end():], re.I):
                return original
            new = _MAP.get(original.lower(), original)
            return new[0].upper() + new[1:] if original[0].isupper() else new

        return _WORDS.sub(word, sentence)

    if message.strip().lower() in _CANNED_ENGLISH:
        return _CANNED_ENGLISH[message.strip().lower()]
    pieces = _CODE.split(message)
    return ''.join(part if index % 2 else change(part)
                   for index, part in enumerate(pieces))


def needs_vietnamese_translation(message: str) -> bool:
    """Phát hiện đoạn tiếng Anh rõ ràng, tránh dịch nhầm các lệnh/đoạn mã."""
    prose = _CODE.sub(' ', message)
    words = re.findall(r'\b[a-zA-Z]+\b', prose.lower())
    if len(words) < 8:
        return False
    english = sum(word in _ENGLISH_TOKENS for word in words)
    return english >= 4 and english / len(words) >= 0.32


class CompanionVoiceStream:
    """Giữ hai từ cuối để đại từ không bị vỡ qua nhiều token Ollama."""

    def __init__(self, send: Callable[[str], None]):
        self.send = send
        self.pending = ''
        self.in_fence = False

    def _emit_ready(self, ready: str) -> None:
        sections = ready.split('```')
        for index, part in enumerate(sections):
            if part:
                self.send(part if self.in_fence else companion_voice(part))
            if index < len(sections) - 1:
                self.send('```')
                self.in_fence = not self.in_fence

    def feed(self, chunk: str) -> None:
        self.pending += chunk
        spaces = list(re.finditer(r'\s+', self.pending))
        if len(spaces) < 4:
            return
        cut = spaces[-3].end()
        ready, self.pending = self.pending[:cut], self.pending[cut:]
        self._emit_ready(ready)

    def finish(self) -> None:
        if self.pending:
            self._emit_ready(self.pending)
        self.pending = ''
