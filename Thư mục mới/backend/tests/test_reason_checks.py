import unittest

from sora.ai.reason_checks import verify_arithmetic_claim


class ReasonCheckTests(unittest.TestCase):
    def test_corrects_false_simple_arithmetic(self):
        self.assertIn('= 3', verify_arithmetic_claim('1 + 2 = 2?'))
        self.assertIn('không phải 2', verify_arithmetic_claim('1 + 2 = 2?'))

    def test_accepts_true_and_checks_zero(self):
        self.assertIn('Đúng rồi', verify_arithmetic_claim('7 * 6 = 42'))
        self.assertIn('chia cho 0', verify_arithmetic_claim('1 / 0 = 0?'))

    def test_does_not_intercept_other_questions(self):
        self.assertIsNone(verify_arithmetic_claim('Anh tính 1 + 2 ra mấy?'))
        self.assertIsNone(verify_arithmetic_claim('print(1 + 2 = 2)'))
