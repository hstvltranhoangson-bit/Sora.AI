"""Kiểm thử SQLite: sao chép mẫu khi cài mới, không ghi đè dữ liệu đã học."""

import sqlite3
from contextlib import closing
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sora.ai import sora_memory, model_client


class SeedTests(unittest.TestCase):
    def test_seed_only_for_a_new_database(self):
        with tempfile.TemporaryDirectory(prefix='sora-seed-') as folder:
            root = Path(folder)
            seed = root / 'data' / 'memory_seed.sqlite3'
            seed.parent.mkdir()
            with closing(sqlite3.connect(seed)) as db, db:
                db.execute('CREATE TABLE facts (key TEXT PRIMARY KEY, value TEXT)')
                db.execute("INSERT INTO facts VALUES ('ten', 'Sơn')")

            dest = root / 'user' / 'memory.sqlite3'
            with patch.object(sora_memory, 'ROOT', root), patch.object(sora_memory, 'DB', dest):
                memory = sora_memory.Memory()
                self.assertEqual(memory.facts()['ten'], 'Sơn')
                memory.remember('ten', 'Sơn - đã cập nhật')
                # Khởi động lại không đưa bộ nhớ về bản mẫu.
                memory = sora_memory.Memory()
                self.assertEqual(memory.facts()['ten'], 'Sơn - đã cập nhật')

            with closing(sqlite3.connect(seed)) as db, db:
                self.assertEqual(db.execute("SELECT value FROM facts WHERE key='ten'").fetchone()[0], 'Sơn')

    def test_natural_language_remember_and_restart_recall(self):
        with tempfile.TemporaryDirectory(prefix='sora-memory-fact-') as folder:
            database = Path(folder) / 'memory.sqlite3'
            with patch.object(sora_memory, 'DB', database):
                first = model_client.OllamaClient.__new__(model_client.OllamaClient)
                first.memory = sora_memory.Memory()
                replies, errors = [], []
                first.send('Anh muốn em ghi nhớ mã thử nghiệm là MEO-731. Hãy xác nhận đúng mã này.',
                           lambda _: None, replies.append, errors.append)
                self.assertEqual(errors, [])
                self.assertIn('MEO-731', replies[-1])
                self.assertEqual(first.memory.facts()['mã thử nghiệm'], 'MEO-731')
                # Một phiên mới dùng lại DB: không cần Ollama hoạt động.
                second = model_client.OllamaClient.__new__(model_client.OllamaClient)
                second.memory = sora_memory.Memory()
                replies.clear()
                second.send('Mã thử nghiệm anh vừa bảo em ghi nhớ là gì?',
                            lambda _: None, replies.append, errors.append)
                self.assertEqual(errors, [])
                self.assertIn('MEO-731', replies[-1])
                self.assertEqual(second.memory.lookup_fact_question('mã thử nghiệm là gì?'),
                                 ('mã thử nghiệm', 'MEO-731'))

    def test_no_implicit_persistent_fact_from_ordinary_chat(self):
        self.assertIsNone(sora_memory.parse_natural_remember('Mã thử nghiệm anh vừa bảo em nhớ là gì?'))
        self.assertIsNone(sora_memory.parse_natural_remember('Anh định bàn chuyện ghi nhớ mã thử nghiệm.'))



if __name__ == '__main__':
    unittest.main()
