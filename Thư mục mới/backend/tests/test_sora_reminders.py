import tempfile
import unittest
from pathlib import Path

from sora.ai.sora_reminders import SoraReminders, reminder_command


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'memory.sqlite3'
        self.reminders = SoraReminders(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_schedule_persists_and_does_not_delete_existing_tables(self):
        rid = self.reminders.schedule(10, 'nghi', now=1000)
        another = SoraReminders(self.path)
        self.assertEqual(another.list_pending()[0][0], rid)
        self.assertEqual(another.pop_due(now=1599), [])
        self.assertEqual(len(another.pop_due(now=1600)), 1)
        self.assertEqual(another.pop_due(now=1601), [])

    def test_cancel(self):
        rid = self.reminders.schedule(3, 'di ngu', now=1000)
        self.assertTrue(self.reminders.cancel(rid))
        self.assertFalse(self.reminders.cancel(rid))
        self.assertEqual(self.reminders.pop_due(now=10000), [])

    def test_commands(self):
        self.assertIsNone(reminder_command('xin chao', self.reminders))
        self.assertIn('nhắc', reminder_command('/nhac 5 Nghỉ giải lao', self.reminders))
        self.assertIn('Nghỉ giải lao', reminder_command('/lichnhac', self.reminders))
        self.assertIn('hủy', reminder_command('/huy-nhac 1', self.reminders))
        self.assertIn('Cú pháp', reminder_command('/nhac', self.reminders).replace('Lệnh:', 'Cú pháp'))
        self.assertIn('1 đến', reminder_command('/nhac 0 abc', self.reminders))
