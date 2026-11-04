"""Kiểm tra chọn yên lặng / đưa gợi ý, không kết nối mạng và không dùng công cụ."""

import unittest

from sora.ai.independent_mind import prepare_messages, interpret_decision


class IndependentMindTests(unittest.TestCase):
    def test_can_choose_quiet(self):
        outcome = interpret_decision('{"choice":"quiet","reason":"Anh cần tập trung"}')
        self.assertFalse(outcome['speak'])
        self.assertEqual(outcome['text'], '')

    def test_bounded_suggestion_with_explanation(self):
        outcome = interpret_decision('{"choice":"suggest","message":"Anh còn bước kiểm tra lại báo cáo. Em nghĩ mình rà soát lỗi chính tả trước nhé!","reason":"Bước còn dang dở"}')
        self.assertTrue(outcome['speak'])
        self.assertIn('báo cáo', outcome['text'])
        self.assertIn('dang dở', outcome['reason'])

    def test_invalid_content_does_not_execute(self):
        self.assertFalse(interpret_decision('xin chào')['speak'])
        self.assertFalse(interpret_decision('{"choice":"execute","message":"lệnh"}')['speak'])
        self.assertEqual(interpret_decision('error', fallback='Anh nhớ xem lại mục tiêu nhé')['speak'], True)

    def test_only_approved_context_passed_to_prompt(self):
        messages = prepare_messages('Mục tiêu đã duyệt: làm bài', 'Xem phần kết quả')
        self.assertEqual(len(messages), 2)
        self.assertIn('Mục tiêu đã duyệt', messages[1]['content'])
        self.assertIn('không', messages[0]['content'].lower())


if __name__ == '__main__':
    unittest.main()
