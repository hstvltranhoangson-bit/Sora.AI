import io
import json
import tempfile
import unittest
from pathlib import Path

from sora.ai.sora_reminders import SoraReminders
from sora.bridge import Bridge
from sora.ai.model_client import OllamaClient


class FakeMemory:
    def __init__(self): self.items = []
    def add(self, role, text, source='desktop'): self.items.append((role,text))


class BridgeRemindersTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.db = SoraReminders(Path(self.folder.name) / 'sora-memory.sqlite3')
        # Avoid LLM initialization: reminder commands are synchronous and offline.
        self.client = OllamaClient.__new__(OllamaClient)
        self.client.memory = FakeMemory()
        self.client.sora_reminders = self.db

    def tearDown(self): self.folder.cleanup()

    def test_synchronous_command_does_not_call_model(self):
        output = []
        self.client.send('/nhac 5 uống nước', output.append, output.append,
                         lambda error: self.fail(error))
        self.assertTrue(any('5 phút' in line for line in output))
        self.assertEqual(len(self.db.list_pending()), 1)
        self.assertEqual(self.client.memory.items[0][0], 'user')

    def test_bridge_dispatch_due_reminder_as_sora_event(self):
        self.db.schedule(5,'uống nước',now=1)
        stream = io.StringIO()
        bridge = Bridge(client=self.client, writer=stream)
        # The date is already far in the past, so it must fire once.
        bridge.dispatch({'id':14,'method':'reminders_due'})
        events = [json.loads(x) for x in stream.getvalue().splitlines()]
        self.assertEqual(events[0]['event'],'proactive')
        self.assertEqual(events[0]['kind'],'reminder')
        self.assertIn('uống nước', events[0]['text'])
        self.assertEqual(events[1]['count'],1)
        stream.seek(0);stream.truncate(0)
        bridge.dispatch({'id':15,'method':'reminders_due'})
        self.assertEqual(json.loads(stream.getvalue().splitlines()[0])['count'],0)
