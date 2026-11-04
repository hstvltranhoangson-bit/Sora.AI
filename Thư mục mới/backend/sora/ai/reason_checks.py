"""Kiểm chứng phép tính nhỏ trước khi Sora đồng tình với một khẳng định.

Không thực thi biểu thức hoặc eval; chỉ hỗ trợ đúng mẫu a op b = c.
"""

from __future__ import annotations

from fractions import Fraction
import re

_SIMPLE = re.compile(
    r'^\s*(-?\d{1,5})\s*([+\-*/×÷])\s*(-?\d{1,5})\s*=\s*(-?\d{1,6})\s*[?？!.\s]*$',
)


def verify_arithmetic_claim(message: str) -> str | None:
    match = _SIMPLE.fullmatch(message)
    if not match:
        return None
    left, symbol, right, claimed = match.groups()
    a, b, c = int(left), int(right), int(claimed)
    if symbol in ('/', '÷') and b == 0:
        return 'Anh ơi, không thể chia cho 0 được nhé.'
    result = {
        '+': lambda: Fraction(a + b),
        '-': lambda: Fraction(a - b),
        '*': lambda: Fraction(a * b),
        '×': lambda: Fraction(a * b),
        '/': lambda: Fraction(a, b),
        '÷': lambda: Fraction(a, b),
    }[symbol]()
    actual = str(result.numerator) if result.denominator == 1 else f'{result.numerator}/{result.denominator}'
    expression = f'{a} {symbol} {b}'
    if result == c:
        return f'Đúng rồi anh! Em đã kiểm tra: {expression} = {actual}. 😊'
    return f'Khoan đã anh 😄 Em tính lại rồi: {expression} = {actual}, không phải {c} nhé.'

