"""Kiểm thử ký ức và điều chỉnh hành vi không ảnh hưởng dữ liệu người dùng."""
import tempfile
import unittest
from pathlib import Path
from sys import path as sys_path

sys_path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from sora.ai.experience_memory import ExperienceMemory  # noqa: E402


class ExperienceMemoryTests(unittest.TestCase):
    def test_feedback_chess_and_persistence(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'memory.sqlite3'
            memory = ExperienceMemory(database)
            initial = memory.profile()
            memory.record('chess_chat', 'Anh: em vui không?; Sora: em vẫn đang suy nghĩ', mood='playful')
            memory.record('chess_result', 'Ván 1: Sora thắng', mood='excited', winner='b')
            changed = memory.record('feedback', 'Anh thích em trêu đùa cho vui', feedback='good')
            self.assertGreater(changed['playfulness'], initial['playfulness'])
            self.assertGreater(changed['chess_courage'], initial['chess_courage'])
            self.assertIn('Ván 1', ExperienceMemory(database).context())

    def test_tictactoe_shares_sqlite_but_keeps_chess_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = ExperienceMemory(Path(directory) / 'memory.sqlite3')
            original = memory.profile()['chess_skill']
            memory.record('tictactoe_chat', 'Anh vừa đặt X ở góc trên')
            memory.record('tictactoe_result', 'Line nối đủ 3 dấu', winner='X')
            self.assertIn('Line nối đủ 3 dấu', memory.context())
            self.assertEqual(memory.profile()['chess_skill'], original)
            memory.clear_chat_experiences()
            self.assertNotIn('Line nối đủ 3 dấu', memory.context())

    def test_boundaries_and_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = ExperienceMemory(Path(directory) / 'memory.sqlite3')
            for _ in range(20):
                memory.record('feedback', 'Trêu đùa vui', feedback='good')
            self.assertEqual(memory.profile()['playfulness'], 0.9)
            reset = memory.reset_weights()
            self.assertEqual(reset['playfulness'], 0.55)
            with self.assertRaises(ValueError):
                memory.record('arbitrary_command', 'delete files')

    def test_explicit_chat_reset_keeps_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            memory = ExperienceMemory(Path(directory) / 'memory.sqlite3')
            memory.record('feedback', 'Em nói ngắn gọn tập trung', feedback='good')
            memory.record('chess_chat', 'Một ký ức ván trước')
            changed = memory.profile()
            memory.clear_chat_experiences()
            self.assertNotIn('Một ký ức', memory.context())
            self.assertEqual(memory.profile(), changed)


if __name__ == '__main__':
    unittest.main()
