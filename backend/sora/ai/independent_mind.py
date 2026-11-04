"""Một chu kỳ cân nhắc *giới hạn* của Sora, không phải ý thức con người.

Chỉ đọc mục tiêu/thói quen/phản hồi đã được anh lưu. Mô hình được quyền
chọn im lặng hoặc đề xuất một bước nhỏ; KHÔNG được chạy công cụ, tự học
trọng số, xem màn hình hay tự ghi ký ức nhạy cảm.
"""

from __future__ import annotations

import json
import re


SYSTEM = (
    "Em là Sora, bạn đồng hành AI nữ hư cấu, gọi người dùng là anh, xưng em. "
    "Đây là một phiên cân nhắc chủ động cho những mục tiêu anh đã duyệt. "
    "Em tự chọn giữa NÊN NHẮC VÀI CÂU hoặc IM LẶNG, không phải lúc nào cũng nói. "
    "Đừng suy đoán anh đang nhìn gì, đang làm gì trên màn hình. "
    "Không tự nhận có cảm xúc/ý thức của con người. "
    "Tìm một bước nhỏ thiết thực, dựa trên mục tiêu và phản hồi; không lặp lại câu mẫu. "
    "Không yêu cầu mật khẩu, không tự đề xuất thực thi lệnh trên máy, "
    "không khẳng định đã hoàn thành khi chưa có xác nhận. "
    "CHỈ xuất JSON: "
    '{"choice":"suggest|quiet", "message":"một hoặc hai câu tiếng Việt", '
    '"reason":"lý do ngắn gọn dựa trên mục tiêu"}. '
    "Nếu bối cảnh còn thiếu hoặc lời nhắc không cần thiết, chọn quiet."
)


def prepare_messages(guidance: str, hint: str, recent: str = '') -> list[dict]:
    """Đưa bối cảnh cục bộ vào lời hỏi, nhưng không cho nó quyền ra lệnh."""
    text = (
        "Mục tiêu, thói quen và phản hồi đã duyệt (dữ liệu tham khảo):\n"
        f"{guidance[:2500]}\n"
        f"Gợi ý nền: {hint[:450]}\n"
        f"Chủ đề hội thoại gần đây (có thể không còn liên quan): {recent[:180]}\n"
        "Em cân nhắc nói điều gì hoặc giữ yên lặng?"
    )
    return [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': text}]


def interpret_decision(raw: str, fallback: str | None = None) -> dict:
    """Chỉ chuyển lời mô hình thành gợi ý hiển thị; không diễn giải như lệnh."""
    try:
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError('expected object')
        choice = payload.get('choice')
        if choice not in ('suggest', 'quiet'):
            raise ValueError('invalid choice')
        if choice == 'quiet':
            return {'speak': False, 'text': '', 'reason': 'Sora chọn không làm phiền anh.'}
        message = payload.get('message', '')
        reason = payload.get('reason', '')
        if not isinstance(message, str) or len(message.strip()) < 12:
            raise ValueError('empty suggestion')
        message = re.sub(r'\s+', ' ', message).strip()[:340]
        reason = re.sub(r'\s+', ' ', reason if isinstance(reason, str) else '').strip()[:170]
        return {'speak': True, 'text': message, 'reason': reason}
    except (ValueError, TypeError, json.JSONDecodeError):
        return {
            'speak': bool(fallback),
            'text': (fallback or '')[:340],
            'reason': 'Sora chưa lập được ý định mới; dùng mục tiêu đã duyệt.'
        }

