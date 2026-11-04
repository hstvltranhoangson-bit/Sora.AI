"""Lịch sử Sora: một SQLite cho chat thường và cờ vua, giữ nguyên DB cũ."""
import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sora.ai import sora_memory


class SharedConversationTests(unittest.TestCase):
    def test_migrate_old_messages_without_erasing(self):
        with tempfile.TemporaryDirectory() as folder:
            database = Path(folder) / 'memory.sqlite3'
            with closing(sqlite3.connect(database)) as db, db:
                db.execute('CREATE TABLE messages (id INTEGER PRIMARY KEY, role TEXT, content TEXT, '
                           'created DATETIME DEFAULT CURRENT_TIMESTAMP)')
                db.execute("INSERT INTO messages(role,content) VALUES ('user','Anh hỏi em từ hôm qua')")

            with patch.object(sora_memory, 'DB', database):
                memory = sora_memory.Memory()
                self.assertEqual(memory.recent(), [{'role':'user','content':'Anh hỏi em từ hôm qua'}])
                memory.add_event('Em vừa đi một nước cờ bất ngờ!', 'chess')
                memory.add('user', 'Chào em, mình tiếp tục nhé', 'chess')
                memory.add('assistant', 'Vâng anh, em nhớ rồi!', 'chess')
                self.assertEqual(len(memory.recent()), 3)
                feed = memory.conversation()
                self.assertEqual(len(feed), 4)
                self.assertEqual(feed[1]['kind'], 'event')
                self.assertEqual(feed[2]['source'], 'chess')
                self.assertEqual(feed[0]['content'], 'Anh hỏi em từ hôm qua')
                # Restart sau nâng cấp vẫn giữ nguyên mọi câu.
                self.assertEqual(sora_memory.Memory().conversation(), feed)
                memory.clear_messages()
                self.assertEqual(memory.recent(), [])
                self.assertEqual(memory.conversation(), [])

    def test_recall_old_user_words_ignores_game_events(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(sora_memory, 'DB', Path(folder) / 'memory.sqlite3'):
                memory = sora_memory.Memory()
                memory.add('user', 'Anh thích mô hình Gundam Wing và màu xanh lục')
                memory.add_event('Em đi cờ Gundam thật vui')
                for i in range(16):
                    memory.add('assistant', f'Chúng mình đã trò chuyện lần {i}')
                matched = memory.recall('Em nhớ gì về Gundam Wing của anh?', limit=2)
                self.assertEqual(len(matched), 1)
                self.assertIn('Gundam Wing', matched[0]['text'])


if __name__ == '__main__':
    unittest.main()
