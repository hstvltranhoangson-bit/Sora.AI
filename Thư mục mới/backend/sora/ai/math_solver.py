"""Bộ giải/kiểm chứng toán xác định cho Sora (stdlib, không thực thi mã của người dùng).

Chỉ xử lý các dạng có thể kiểm chứng chặt chẽ. Bài chưa hỗ trợ trả về None
để Ollama và kho công thức hiện có tiếp tục xử lý như trước.
"""

from __future__ import annotations

import ast
import math
import re
import unicodedata
from decimal import Decimal, InvalidOperation, localcontext
from fractions import Fraction


def _plain(text: str) -> str:
    text = unicodedata.normalize('NFD', text.lower())
    return ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn').replace('đ', 'd')


def _number(text: str) -> Decimal:
    """Tiếng Việt: 880.000 là tám trăm tám mươi nghìn; 12,5 là thập phân."""
    value = text.strip().replace(' ', '')
    if re.fullmatch(r'-?\d{1,3}(?:[.,]\d{3})+(?:,\d{1,2})?', value):
        if ',' in value and value.rfind(',') > value.rfind('.'):
            *groups, last = value.split(',')
            if len(last) <= 2:
                value = ''.join(groups).replace('.', '') + '.' + last
            else:
                value = value.replace(',', '').replace('.', '')
        else:
            value = value.replace('.', '').replace(',', '')
    else:
        value = value.replace(',', '.')
    result = Decimal(value)
    if not result.is_finite() or abs(result) > Decimal('1e15'):
        raise ValueError('Số ngoài phạm vi hỗ trợ')
    return result


def _format_number(value: Decimal, places: int = 6) -> str:
    with localcontext() as ctx:
        ctx.prec = 28
        value = value.quantize(Decimal(1).scaleb(-places)) if value.as_tuple().exponent < -places else value
    text = format(value.normalize(), 'f')
    before, dot, after = text.partition('.')
    sign = '-' if before.startswith('-') else ''
    digits = before.lstrip('-')
    groups = []
    while digits:
        groups.append(digits[-3:])
        digits = digits[:-3]
    return sign + '.'.join(reversed(groups)) + (',' + after if dot else '')


def _percent_price(question: str) -> str | None:
    text = _plain(question)
    if not (('gia ban dau' in text or 'gia goc' in text) and
            ('gia cuoi' in text or 'cuoi cung' in text or 'gia sau' in text)):
        return None
    moves = re.findall(r'\b(giam|tang)\s*(\d+(?:[.,]\d+)?)\s*%', text)
    # Chỉ đảo ngược khi số tiền được gắn rõ với GIÁ CUỐI.
    # Nếu câu nói "Giá ban đầu 880.000 đồng, tính giá cuối" thì không đảo ngược.
    final_amount = re.search(
        r'gia\s+(?:cuoi(?:\s+cung)?|sau\s+(?:cung|cung\s+la))\s*'
        r'(?:la\s*|[:=]\s*)?(\d[\d.,]*)\s*(?:dong|vnd)\b', text
    )
    amounts = re.findall(r'(\d[\d.,]*)\s*(?:dong|vnd)\b', text)
    if not 1 <= len(moves) <= 4 or len(amounts) != 1 or final_amount is None:
        return None
    try:
        final = _number(final_amount.group(1))
        if final < 0:
            return None
        factor = Decimal(1)
        steps = []
        for kind, raw_percent in moves:
            percentage = _number(raw_percent)
            if not Decimal(0) <= percentage <= Decimal(100):
                return None
            current = (Decimal(1) - percentage / 100 if kind == 'giam'
                       else Decimal(1) + percentage / 100)
            factor *= current
            steps.append(f"- {'Giảm' if kind == 'giam' else 'Tăng'} "
                         f"{_format_number(percentage)}%: nhân với {_format_number(current)}.")
        if factor == 0:
            return ('Giảm 100% khiến giá cuối bằng 0 bất kể giá ban đầu; '
                    'dữ kiện giá cuối khác 0 mâu thuẫn.' if final != 0 else
                    'Sau khi giảm 100%, giá cuối bằng 0 với mọi giá ban đầu; '
                    'em không thể suy ra duy nhất giá ban đầu.')
        with localcontext() as ctx:
            ctx.prec = 28
            original = final / factor
            verified = original * factor
        close = abs(verified - final) <= max(Decimal('0.00001'), abs(final) * Decimal('1e-20'))
        if not close:
            return None
        return ('Em tính ngược và tự kiểm tra từng bước nhé anh:\n'
                + '\n'.join(steps)
                + f'\nHệ số giá cuối: {_format_number(factor)}.\n'
                + f'Giá ban đầu = {_format_number(final)} ÷ {_format_number(factor)}'
                + f' = {_format_number(original)} đồng.\n'
                + f'Kiểm tra: {_format_number(original)} × {_format_number(factor)}'
                + f' ≈ {_format_number(verified)} đồng (khớp giá cuối).')
    except (ValueError, InvalidOperation, ZeroDivisionError):
        return None


def _as_fraction(value: int | float) -> Fraction:
    return Fraction(str(value))


def _polynomial(expression: str) -> tuple[Fraction, Fraction, Fraction]:
    """Chuyển AST sang a + bx + cx²; không eval hay gọi hàm của người dùng."""
    expression = expression.lower().replace('²', '^2').replace('^', '**')
    expression = re.sub(r'(?<=\d)(?=x|\()', '*', expression)
    expression = re.sub(r'(?<=x)(?=\()', '*', expression)
    expression = re.sub(r'(?<=\))(?=x|\d|\()', '*', expression)
    root = ast.parse(expression, mode='eval')
    if len(list(ast.walk(root))) > 55:
        raise ValueError('Biểu thức quá dài')

    def mul(left, right):
        product = [Fraction(0) for _ in range(5)]
        for i, a in enumerate(left):
            for j, b in enumerate(right):
                product[i + j] += a * b
        if any(product[3:]):
            raise ValueError('Chỉ giải phương trình bậc 1 và 2')
        return tuple(product[:3])

    def walk(node):
        if isinstance(node, ast.Name) and node.id == 'x':
            return (Fraction(0), Fraction(1), Fraction(0))
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return (_as_fraction(node.value), Fraction(0), Fraction(0))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            arg = walk(node.operand)
            return tuple(-x for x in arg) if isinstance(node.op, ast.USub) else arg
        if isinstance(node, ast.BinOp):
            a = walk(node.left)
            b = walk(node.right)
            if isinstance(node.op, ast.Add):
                return tuple(x + y for x, y in zip(a, b))
            if isinstance(node.op, ast.Sub):
                return tuple(x - y for x, y in zip(a, b))
            if isinstance(node.op, ast.Mult):
                return mul(a, b)
            if isinstance(node.op, ast.Div) and b[1] == b[2] == 0 and b[0]:
                return tuple(x / b[0] for x in a)
            if isinstance(node.op, ast.Pow) and b[1] == b[2] == 0 and b[0].denominator == 1:
                power = int(b[0])
                if 0 <= power <= 2:
                    result = (Fraction(1), Fraction(0), Fraction(0))
                    for _ in range(power):
                        result = mul(result, a)
                    return result
        raise ValueError('Phép toán chưa được hỗ trợ')

    result = walk(root.body)
    if any(abs(x.numerator) > 10**15 or x.denominator > 10**12 for x in result):
        raise ValueError('Biểu thức quá lớn')
    return result


def _f(value: Fraction) -> str:
    return str(value.numerator) if value.denominator == 1 else f'{value.numerator}/{value.denominator}'


def _sqrt_exact(value: Fraction) -> Fraction | None:
    if value < 0:
        return None
    numerator, denominator = math.isqrt(value.numerator), math.isqrt(value.denominator)
    if numerator**2 == value.numerator and denominator**2 == value.denominator:
        return Fraction(numerator, denominator)
    return None


def _solve_equation(question: str) -> str | None:
    if len(question) > 500 or '=' not in question:
        return None
    # Chỉ lấy cặp biểu thức số học đầu tiên chứa x. Phần lời nhắn không phải mã.
    matches = re.findall(r'([\d.xX²()+*/^\-\s]+)\s*=\s*([\d.xX²()+*/^\-\s]+)', question)
    for raw_left, raw_right in matches:
        left, right = raw_left.strip().rstrip('.'), raw_right.strip().rstrip('.')
        if not re.search(r'x', left + right, re.I) or len(left + right) > 130:
            continue
        try:
            a, b = _polynomial(left), _polynomial(right)
            c0, c1, c2 = (x - y for x, y in zip(a, b))
            if c2 == 0:
                if c1 == 0:
                    return ('Phương trình đúng với mọi x.' if c0 == 0 else 'Phương trình vô nghiệm.')
                solution = -c0 / c1
                # Kiểm tra bằng cách thế nghiệm vào hai vế đã phân tích độc lập.
                lhs = sum((coefficient * solution**i for i, coefficient in enumerate(a)), Fraction())
                rhs = sum((coefficient * solution**i for i, coefficient in enumerate(b)), Fraction())
                if lhs != rhs:
                    return None
                result = (f'Em rút gọn {left} = {right} thành '
                          f'{_f(c1)}x = {_f(-c0)}.\n'
                          f'Suy ra x = {_f(solution)}.\n'
                          f'Kiểm tra: thay x = {_f(solution)} vào hai vế, '
                          f'đều bằng {_f(lhs)}. Vậy nghiệm đúng rồi anh nhé.')
                return result
            discriminant = c1 * c1 - 4 * c2 * c0
            if discriminant < 0:
                return f'Phương trình bậc hai có Δ = {_f(discriminant)} < 0, nên vô nghiệm thực.'
            root = _sqrt_exact(discriminant)
            if root is not None:
                solutions = sorted(set(((-c1 + root) / (2 * c2), (-c1 - root) / (2 * c2))))
                verified = all(c0 + c1 * x + c2 * x * x == 0 for x in solutions)
                if not verified:
                    return None
                return (f'Em tính Δ = b² − 4ac = {_f(discriminant)}.\n'
                        + '\n'.join(f'x = {_f(x)}' for x in solutions)
                        + '\nEm đã thay từng nghiệm vào phương trình: cả hai vế đều bằng nhau.')
            approximate = [(-float(c1) + sign * math.sqrt(float(discriminant))) /
                           (2 * float(c2)) for sign in (1, -1)]
            if not all(math.isfinite(x) for x in approximate):
                return None
            return (f'Δ = {_f(discriminant)}. Đây là nghiệm gần đúng:\n'
                    + '\n'.join(f'x ≈ {x:.7g}' for x in sorted(approximate))
                    + '\nEm đã dùng công thức nghiệm bậc hai; dấu ≈ thể hiện kết quả làm tròn.')
        except (SyntaxError, ValueError, ZeroDivisionError, OverflowError):
            continue
    return None


def _circle(question: str) -> str | None:
    text = _plain(question)
    if 'hinh tron' not in text or 'ban kinh' not in text:
        return None
    radius_match = re.search(r'ban kinh\s*(?:r\s*=\s*)?(\d+(?:[.,]\d+)?)\s*(cm|mm|m|km)?', text)
    if not radius_match:
        return None
    try:
        radius = _number(radius_match.group(1))
        if radius <= 0:
            return None
        unit = radius_match.group(2) or 'đơn vị'
        lines = []
        if 'dien tich' in text:
            lines.append(f'Diện tích: S = πr² = {_format_number(radius * radius)}π '
                         f'≈ {_format_number(radius * radius * Decimal(str(math.pi)))} {unit}².')
        if 'chu vi' in text:
            lines.append(f'Chu vi: C = 2πr = {_format_number(2 * radius)}π '
                         f'≈ {_format_number(2 * radius * Decimal(str(math.pi)))} {unit}.')
        return '\n'.join(lines) if lines else None
    except (ValueError, InvalidOperation):
        return None


def _triangle(question: str) -> str | None:
    text = _plain(question)
    if not ('tam giac' in text and 'dien tich' in text):
        return None
    base = re.search(r'(?:canh )?day\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(cm|mm|m|km)?', text)
    height = re.search(r'chieu cao\s*(?:la\s*)?(\d+(?:[.,]\d+)?)\s*(cm|mm|m|km)?', text)
    if not base or not height:
        return None
    try:
        a, h = _number(base.group(1)), _number(height.group(1))
        if a <= 0 or h <= 0 or (base.group(2) and height.group(2) and base.group(2) != height.group(2)):
            return None
        unit = base.group(2) or height.group(2) or 'đơn vị'
        area = a * h / 2
        return (f'Diện tích tam giác: S = đáy × chiều cao ÷ 2 = '
                f'{_format_number(a)} × {_format_number(h)} ÷ 2 = '
                f'{_format_number(area)} {unit}².\n'
                'Em đã kiểm tra lại phép nhân và chia cho 2 rồi anh nhé.')
    except (ValueError, InvalidOperation):
        return None


def solve_math_question(question: str) -> str | None:
    """Trả về lời giải đã tính/kiểm tra hoặc None; tuyệt đối không tự nhận đã giải mọi bài."""
    if not isinstance(question, str) or len(question) > 600:
        return None
    if question.strip().startswith('/'):
        return None
    for solver in (_percent_price, _solve_equation, _circle, _triangle):
        try:
            result = solver(question)
            if result:
                return result
        except (ArithmeticError, ValueError, TypeError):
            continue
    return None


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Kiểm tra toán độc lập cho Sora')
    parser.add_argument('--query', required=True, help='Câu hỏi toán cần kiểm chứng')
    args = parser.parse_args()
    print(solve_math_question(args.query) or 'Dạng toán chưa được bộ kiểm chứng hỗ trợ.')
