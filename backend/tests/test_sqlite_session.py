"""Kiểm tra commit, rollback và đóng handle ngay cả khi exception."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sora.ai import sqlite_session as session_module


class TrackedConnection(sqlite3.Connection):
    closed_count = 0
    def close(self):
        try:
            super().close()
        finally:
            type(self).closed_count += 1


class SQLiteSessionTests(unittest.TestCase):
    def test_commits_and_closes_successfully(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'test.sqlite3'
            real_connect = sqlite3.connect
            def connect(*args, **kwargs):
                return real_connect(*args, **dict(kwargs, factory=TrackedConnection))
            before = TrackedConnection.closed_count
            with patch.object(session_module.sqlite3, 'connect', side_effect=connect):
                with session_module.sqlite_session(path) as db:
                    db.execute('CREATE TABLE test(value INTEGER)')
                    db.execute('INSERT INTO test VALUES (7)')
            self.assertEqual(TrackedConnection.closed_count - before, 1)
            with real_connect(path) as db:
                self.assertEqual(db.execute('SELECT value FROM test').fetchone()[0], 7)
            db.close()  # test handle cũng phải được đóng trước khi xóa thư mục

    def test_rolls_back_and_closes_on_exception(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'test.sqlite3'
            with session_module.sqlite_session(path) as db:
                db.execute('CREATE TABLE test(value INTEGER)')
            real_connect = sqlite3.connect
            def connect(*args, **kwargs):
                return real_connect(*args, **dict(kwargs, factory=TrackedConnection))
            before = TrackedConnection.closed_count
            with patch.object(session_module.sqlite3, 'connect', side_effect=connect):
                with self.assertRaisesRegex(RuntimeError, 'rollback'):
                    with session_module.sqlite_session(path) as db:
                        db.execute('INSERT INTO test VALUES (9)')
                        raise RuntimeError('rollback')
            self.assertEqual(TrackedConnection.closed_count - before, 1)
            with session_module.sqlite_session(path) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM test').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main()
