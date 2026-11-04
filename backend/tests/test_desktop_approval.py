"""Security regression tests for actions; never touch the real desktop."""

import json
import sys
import threading
import types
import unittest
from unittest.mock import patch

# These tests stub ask_model and never call HTTP. Keep the permission
# regression suite runnable before optional pip setup on a new machine.
try:
    import requests  # noqa: F401
except ImportError:
    sys.modules['requests'] = types.ModuleType('requests')

from sora.ai.sora_agent import Agent


class DummyMemory:
    def recent(self, n=12):
        return []

    def facts(self):
        return {}

    def add(self, role, text):
        pass


class DesktopPermissionTests(unittest.TestCase):
    def setUp(self):
        self.agent = object.__new__(Agent)
        self.agent.config = {'model': 'fake', 'ollama_url': 'http://unused',
                             'max_steps': 2, 'enable_actions': True}
        self.agent.memory = DummyMemory()

    def test_rejected_tool_does_not_call_perform(self):
        responses = iter([
            json.dumps({'tool': 'open_app', 'args': {'app': 'notepad'}, 'reason': 'Test'}),
            'Tôi đã không thao tác vì bị từ chối.',
        ])
        self.agent.ask_model = lambda messages: next(responses)
        with patch('sora.ai.sora_agent.perform') as perform:
            answer, logs = self.agent.reply('mở ghi chú', lambda *_: False)
            perform.assert_not_called()
        self.assertIn('từ chối', answer)
        self.assertEqual(logs[0]['result']['error'], 'Người dùng từ chối')

    def test_approved_tool_executes_and_reports_result(self):
        responses = iter([
            json.dumps({'tool': 'open_app', 'args': {'app': 'notepad'}, 'reason': 'Test'}),
            'Đã mở ghi chú.',
        ])
        self.agent.ask_model = lambda messages: next(responses)
        observed = []
        with patch('sora.ai.sora_agent.perform', return_value={'opened': 'notepad'}) as perform:
            _, logs = self.agent.reply('mở ghi chú', lambda *_: True,
                                       on_action=lambda *args: observed.append(args))
            perform.assert_called_once_with('open_app', {'app': 'notepad'})
        self.assertEqual(logs[0]['result']['opened'], 'notepad')
        self.assertEqual(observed[0][0], 'tool_started')
        self.assertEqual(observed[1], ('tool_result', 'open_app', True))

    def test_cancel_before_execution(self):
        cancelled = threading.Event()
        cancelled.set()
        self.agent.ask_model = lambda messages: self.fail('model should not run')
        with patch('sora.ai.sora_agent.perform') as perform:
            answer, _ = self.agent.reply('mở ghi chú', lambda *_: True,
                                         cancel_event=cancelled)
            perform.assert_not_called()
        self.assertIn('hủy', answer)


if __name__ == '__main__':
    unittest.main()
