"""Cách xưng hô hiển thị không ảnh hưởng câu lệnh và đoạn mã người dùng."""

import unittest

from sora.ai.companion_voice import companion_voice, CompanionVoiceStream, needs_vietnamese_translation
from sora.character.emotion_engine import choose_emotion


class CompanionVoiceTests(unittest.TestCase):
    def test_changes_pronouns_without_changing_code(self):
        self.assertEqual(companion_voice('Tôi đang hỗ trợ bạn với câu hỏi của bạn.'),
                         'Em đang hỗ trợ anh với câu hỏi của anh.')
        self.assertEqual(companion_voice('Chúng mình cùng làm nhé!'), 'Anh và em cùng làm nhé!')
        self.assertEqual(companion_voice('Bạn bè của tôi rất vui.'), 'Bạn bè của em rất vui.')
        self.assertEqual(companion_voice('Dùng `print("tôi")` để kiểm tra.'),
                         'Dùng `print("tôi")` để kiểm tra.')

    def test_streaming_deltas_match_full_result(self):
        sentence = 'Tôi đang giúp bạn. Chúng mình cùng kiểm tra kết quả nhé!'
        parts = []
        voice = CompanionVoiceStream(parts.append)
        for character in sentence:
            voice.feed(character)
        voice.finish()
        self.assertEqual(''.join(parts), companion_voice(sentence))

    def test_streaming_fenced_code_not_rewritten(self):
        sentence = 'Tôi gợi ý đoạn code:\n```python\nprint("tôi")\n```\nBạn chạy thử nhé.'
        parts = []
        voice = CompanionVoiceStream(parts.append)
        for chunk in [sentence[i:i + 3] for i in range(0, len(sentence), 3)]:
            voice.feed(chunk)
        voice.finish()
        self.assertEqual(''.join(parts), companion_voice(sentence))

    def test_playful_and_annoyed_moods_for_small_gentle_teasing(self):
        self.assertEqual(choose_emotion('Chào em', 'Hihi, em trêu anh một chút thôi!'), 'PLAYFUL')
        self.assertEqual(choose_emotion('Sora sao thế?', 'Hừ, em hơi giận anh rồi đó.'), 'ANNOYED')

    def test_explicit_act_overrides_apologetic_reply(self):
        self.assertEqual(choose_emotion('hãy làm bộ mặt tức giận cho anh xem', 'Em xin lỗi nhé.'), 'ANNOYED')
        self.assertEqual(choose_emotion('cười lên cho anh xem đi', 'Em làm thử nhé.'), 'PLAYFUL')
        self.assertNotEqual(choose_emotion('Em có biết tức giận không?', 'Em sẽ giải thích nhé.'), 'ANNOYED')

    def test_corrects_slash_pronouns_and_basic_english(self):
        self.assertEqual(companion_voice('Em sẽ giúp anh/anh ấy giải thích.'),
                         'Em sẽ giúp anh giải thích.')
        self.assertEqual(companion_voice('Hello again, Sora! How can I assist you today?'),
                         'Anh quay lại rồi à? Em đang nghe đây, anh muốn kể em chuyện gì nào?')
        self.assertTrue(needs_vietnamese_translation('Hello again, how can I assist you with your problem today?'))
        self.assertFalse(needs_vietnamese_translation('Em sẽ giúp anh viết `print("hello")` nhé.'))


if __name__ == '__main__':
    unittest.main()
