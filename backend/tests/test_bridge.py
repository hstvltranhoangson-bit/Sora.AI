"""Unit tests: no Ollama server, GUI, Windows APIs or user's SQLite needed."""

import io
import json
import threading
import time
import unittest

from sora.bridge import Bridge
from sora.ai.model_client import explicit_desktop_intent


class FakeMemory:
    def __init__(self):
        self.messages = [{'role': 'user', 'content': 'Xin chào'}]
        self.cleared = False

    def recent(self, n=40):
        return self.messages[-n:]

    def clear_messages(self):
        self.cleared = True
        self.messages.clear()


class FakeClient:
    def __init__(self):
        self.memory = FakeMemory()
        self.action_approval = None
        self.cleared = False
        self.finished = threading.Event()

    def is_connected(self):
        return True

    def clear_history(self):
        self.cleared = True

    def send(self, user_message, on_token, on_done, on_error, cancel_event=None, on_action=None, profile=None):
        def worker():
            try:
                if user_message.startswith(('/do ', '/lam ')) or explicit_desktop_intent(user_message):
                    allowed = self.action_approval('open_app', {'app': 'notepad'}, 'Test')
                    if allowed:
                        on_action('tool_started', 'open_app', True)
                    on_action('tool_result', 'open_app', allowed)
                    answer = 'Đã mở ghi chú' if allowed else 'Đã từ chối'
                else:
                    answer = 'Chào Sơn, vui quá!'
                on_token(answer)
                on_done(answer)
            finally:
                self.finished.set()
        threading.Thread(target=worker, daemon=True).start()

    def consider_next_step(self, tip):
        return {'speak': True, 'text': 'Em nhắc anh kiểm tra bước tiếp theo nhé.', 'reason': 'Mục tiêu đang làm'}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.writer = io.StringIO()
        self.client = FakeClient()
        self.bridge = Bridge(client=self.client, writer=self.writer)

    def output(self):
        return [json.loads(line) for line in self.writer.getvalue().splitlines()]

    def test_status_and_history(self):
        self.bridge.dispatch({'id': 1, 'method': 'status'})
        self.bridge.dispatch({'id': 2, 'method': 'history'})
        events = self.output()
        self.assertTrue(events[0]['online'])
        self.assertEqual(events[1]['messages'][0]['content'], 'Xin chào')

    def test_heartbeat_emits_no_notification_when_not_opted_in(self):
        class DisabledAgent:
            @staticmethod
            def due_tip():
                return None
        self.client.agent_core = DisabledAgent()
        self.bridge.dispatch({'id': 30, 'method': 'heartbeat'})
        self.assertEqual([m for m in self.output() if m.get('event') == 'proactive'], [])
        self.assertFalse(self.output()[-1]['spoken'])

    def test_heartbeat_can_reflect_without_touching_desktop(self):
        class EnabledAgent:
            @staticmethod
            def due_tip():
                return 'Anh còn một bước chưa làm'
        self.client.agent_core = EnabledAgent()
        self.bridge.dispatch({'id': 31, 'method': 'heartbeat'})
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and not any(m.get('event') == 'proactive' for m in self.output()):
            time.sleep(.01)
        self.assertTrue(any(m.get('event') == 'proactive' for m in self.output()))
        self.assertTrue(any(m.get('kind') == 'result' and m.get('spoken') for m in self.output()))

    def test_status_keeps_sqlite_chat_available_when_ollama_is_off(self):
        self.client.is_connected = lambda: False
        self.bridge.dispatch({'id': 22, 'method': 'status'})
        status = self.output()[-1]
        self.assertTrue(status['ok'])
        self.assertFalse(status['online'])
        self.assertTrue(status['offline_ready'])

    def test_stream_emotion_and_single_terminal_response(self):
        self.bridge.dispatch({'id': 7, 'method': 'chat', 'text': 'Cảm ơn bạn'})
        self.assertTrue(self.client.finished.wait(2))
        events = self.output()
        self.assertEqual([e['event'] for e in events if e['kind'] == 'event'],
                         ['thinking', 'delta', 'completed'])
        self.assertEqual(next(e for e in events if e.get('event') == 'completed')['emotion'], 'happy')
        self.assertEqual(len([e for e in events if e['kind'] == 'result']), 1)

    def test_approval_rejected_by_default(self):
        self.bridge.dispatch({'id': 8, 'method': 'chat', 'text': '/do mở ghi chú'})
        end = time.monotonic() + 2
        while time.monotonic() < end and not any(e.get('event') == 'approval_required' for e in self.output()):
            time.sleep(.01)
        req = next(e for e in self.output() if e.get('event') == 'approval_required')
        self.bridge.dispatch({'method': 'approve', 'approval_id': req['approval_id'], 'allowed': False})
        self.assertTrue(self.client.finished.wait(2))
        self.assertFalse(next(e for e in self.output() if e.get('event') == 'completed')['tool_succeeded'])

    def test_vietnamese_desktop_command_keeps_approval_gate(self):
        self.bridge.dispatch({'id': 12, 'method': 'chat', 'text': '/lam mở ghi chú'})
        end = time.monotonic() + 2
        while time.monotonic() < end and not any(e.get('event') == 'approval_required' for e in self.output()):
            time.sleep(.01)
        thinking = next(e for e in self.output() if e.get('event') == 'thinking')
        self.assertTrue(thinking['tool_mode'])
        req = next(e for e in self.output() if e.get('event') == 'approval_required')
        self.bridge.dispatch({'method': 'approve', 'approval_id': req['approval_id'], 'allowed': False})
        self.assertTrue(self.client.finished.wait(2))
        self.assertFalse(next(e for e in self.output() if e.get('event') == 'completed')['tool_succeeded'])

    def test_natural_desktop_request_still_requires_approval(self):
        self.bridge.dispatch({'id': 13, 'method': 'chat',
                              'text': 'Sora ơi, giúp anh mở Notepad'})
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline and not any(
                e.get('event') == 'approval_required' for e in self.output()):
            time.sleep(.01)
        self.assertTrue(next(e for e in self.output() if e.get('event') == 'thinking')['tool_mode'])
        req = next(e for e in self.output() if e.get('event') == 'approval_required')
        self.bridge.dispatch({'method': 'approve', 'approval_id': req['approval_id'], 'allowed': False})
        self.assertTrue(self.client.finished.wait(2))
        self.assertFalse(next(e for e in self.output() if e.get('event') == 'completed')['tool_succeeded'])

    def test_approval_accepted_by_user_only(self):
        self.bridge.dispatch({'id': 9, 'method': 'chat', 'text': '/do mở ghi chú'})
        end = time.monotonic() + 2
        while time.monotonic() < end and not any(e.get('event') == 'approval_required' for e in self.output()):
            time.sleep(.01)
        approval = next(e for e in self.output() if e.get('event') == 'approval_required')
        self.bridge.dispatch({'method': 'approve', 'approval_id': approval['approval_id'], 'allowed': True})
        self.assertTrue(self.client.finished.wait(2))
        self.assertTrue(next(e for e in self.output() if e.get('event') == 'completed')['tool_succeeded'])

    def test_cancel_during_approval_fails_closed(self):
        self.bridge.dispatch({'id': 10, 'method': 'chat', 'text': '/do mở ghi chú'})
        end = time.monotonic() + 2
        while time.monotonic() < end and not any(e.get('event') == 'approval_required' for e in self.output()):
            time.sleep(.01)
        self.bridge.dispatch({'method': 'cancel', 'id': 10})
        self.assertTrue(self.client.finished.wait(2))
        self.assertEqual(len([e for e in self.output() if e.get('event') == 'cancelled']), 1)

    def test_explicit_forget_preserves_other_state(self):
        self.bridge.dispatch({'id': 11, 'method': 'clear_history'})
        self.assertTrue(self.client.memory.cleared)
        self.assertTrue(self.client.cleared)


if __name__ == '__main__':
    unittest.main()
