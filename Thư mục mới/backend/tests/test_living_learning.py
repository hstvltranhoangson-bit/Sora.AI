"""Behavior change must be based on explicit feedback and review, not on AI claims."""
import tempfile
import threading
from types import SimpleNamespace
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from sora.ai.agent_core import AgentCore
from sora.ai.experience_memory import ExperienceMemory
from sora.ai.living_learning import LivingLearning
from sora.ai import model_client


class LearningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='sora-learning-')
        self.addCleanup(self.tmp.cleanup)
        self.db = Path(self.tmp.name) / 'memory.sqlite3'
        self.learning = LivingLearning(self.db)

    def test_pending_not_applied_until_approved_and_survives_restart(self):
        lesson = self.learning.record_feedback('improve', 'Câu trả lời về code nên ngắn và có ví dụ')
        self.assertIn('chờ', self._status(lesson))
        self.assertEqual(self.learning.prompt_context(), '')
        second = LivingLearning(self.db)
        self.assertTrue(second.review(lesson, True))
        prompt = LivingLearning(self.db).prompt_context()
        self.assertIn('Câu trả lời về code', prompt)
        self.assertIn('không sửa quyền Desktop Agent', prompt)
        self.assertFalse(second.review(lesson, True))

    def _status(self, lesson_id):
        labels = {'pending': 'chờ', 'approved':'đã duyệt', 'needs_review':'cần sửa', 'rejected':'bỏ'}
        return labels[next(i for i in self.learning.list_lessons() if i['id']==lesson_id)['state']]

    def test_failed_outcome_disables_lesson_until_review(self):
        lesson = self.learning.record_feedback('good', 'Trả lời tiếng Việt tự nhiên, không máy móc')
        self.assertTrue(self.learning.review(lesson, True))
        self.assertTrue(self.learning.evaluate(lesson, False, 'Vẫn trả lời bằng tiếng Anh ở ván cờ'))
        self.assertEqual(self.learning.prompt_context(), '')
        self.assertEqual(self.learning.metrics()['failed'], 1)
        self.assertTrue(self.learning.review(lesson, True))
        self.assertTrue(self.learning.evaluate(lesson, True, 'Câu tiếp theo đã trả lời tiếng Việt'))
        self.assertEqual(self.learning.metrics()['passed'], 1)

    def test_erase_removes_original_note_and_evidence(self):
        lesson = self.learning.record_feedback('improve', 'Thói quen riêng không nên lưu sai')
        self.assertTrue(self.learning.review(lesson, True))
        self.assertTrue(self.learning.evaluate(lesson, True, 'Đã sửa được cách ghi nhớ'))
        self.assertTrue(self.learning.remove(lesson))
        self.assertFalse(self.learning.remove(lesson))
        self.assertNotIn('Thói quen riêng', str(self.learning.journal()))
        self.assertNotIn('Đã sửa được', str(self.learning.journal()))
        self.assertEqual(self.learning.metrics()['evaluations'], 0)
        self.assertEqual(self.learning.prompt_context(), '')

    def test_rejected_lesson_never_enters_prompt(self):
        lesson = self.learning.record_feedback('improve', 'Không tự xưng là con người thật')
        self.assertTrue(self.learning.review(lesson, False))
        self.assertNotIn('con người thật', self.learning.prompt_context())
        self.assertEqual(self.learning.metrics()['rejected'], 1)

    def test_feedback_dedup_and_validation(self):
        first = self.learning.record_feedback('good', 'Trả lời đủ ý và đúng trọng tâm')
        self.assertEqual(first, self.learning.record_feedback('good', 'Trả lời đủ ý và đúng trọng tâm'))
        self.assertEqual(self.learning.metrics()['pending'], 1)
        with self.assertRaises(ValueError):
            self.learning.record_feedback('improve', 'a')
        with self.assertRaises(ValueError):
            self.learning.record_feedback('untrusted', 'Các câu hỏi khó quá')

    def test_only_approved_feedback_reaches_ollama_payload(self):
        lessons = self.learning
        client = model_client.OllamaClient.__new__(model_client.OllamaClient)
        client.learning = lessons
        client.memory = SimpleNamespace(facts=lambda: {}, recent=lambda n: [],
                                        recall=lambda q: [], add=lambda *args: None)
        client.agent_core = SimpleNamespace(guidance=lambda: '')
        client.math_knowledge = SimpleNamespace(context=lambda _: '')
        client.experiences = SimpleNamespace(profile=lambda: {}, context=lambda: '')
        client.screen_context = SimpleNamespace(prompt_context=lambda: '')
        client.ensure_vietnamese = lambda s: s
        payloads = []

        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def __iter__(self):
                return iter([b'{"message":{"content":"Em nghe anh."},"done":true}\n'])

        def open_fake(request, timeout=60):
            payloads.append(json.loads(request.data.decode('utf-8')))
            return Response()

        pending = lessons.record_feedback('improve', 'Nhớ trình bày từng bước rõ ràng khi viết code')
        with patch.object(model_client, 'research', return_value={'attempted': False}), \
             patch.object(model_client.LOCAL_HTTP, 'open', side_effect=open_fake):
            client._stream('Em giúp anh viết code nhé', lambda s: None, lambda s: None, lambda s: None)
            self.assertNotIn('Nhớ trình bày từng bước', payloads[-1]['messages'][0]['content'])
            lessons.review(pending, True)
            client._stream('Em giúp anh viết code nhé', lambda s: None, lambda s: None, lambda s: None)
            self.assertIn('Nhớ trình bày từng bước', payloads[-1]['messages'][0]['content'])
            lessons.evaluate(pending, False, 'Kết quả vẫn thiếu các bước quan trọng')
            client._stream('Em giúp anh viết code nhé', lambda s: None, lambda s: None, lambda s: None)
            self.assertNotIn('Nhớ trình bày từng bước', payloads[-1]['messages'][0]['content'])

    def test_chat_commands_and_feedback_flow(self):
        # Commands must work without Ollama, internet or UI to learn from feedback.
        client = model_client.OllamaClient.__new__(model_client.OllamaClient)
        client.learning = self.learning
        client.memory = SimpleNamespace(lookup_fact_question=lambda _: None)
        client.agent_core = AgentCore(db_path=self.db)
        client.experiences = ExperienceMemory(database=self.db)

        def ask(prompt):
            output, errors, finished = [], [], threading.Event()
            client.send(prompt, lambda _: None,
                        lambda reply: (output.append(reply), finished.set()),
                        lambda error: (errors.append(error), finished.set()))
            self.assertTrue(finished.wait(3), 'learning command timed out')
            self.assertEqual(errors, [])
            return output[-1]

        answer = ask('/phanhoi can-sua Trả lời code cần chính xác hơn')
        self.assertIn('bài học nháp #1', answer)
        self.assertIn('chờ duyệt', ask('/baihoc'))
        self.assertNotIn('Trả lời code', client.agent_core.guidance())
        self.assertNotIn('Trả lời code', client.experiences.context())
        self.assertIn('Đã duyệt', ask('/duyetbaihoc 1'))
        self.assertIn('Trả lời code', self.learning.prompt_context())
        self.assertIn('bài học', ask('/nhatky').lower())
        self.assertIn('ghi kết quả', ask('/danhgia-baihoc 1 chua-dat Vẫn có câu trả lời sai'))
        self.assertEqual(self.learning.prompt_context(), '')
        self.assertIn('cần xem lại', ask('/baihoc'))
        self.assertIn('0 đạt', ask('/tiendo-hoc'))
        self.assertIn('Đã xóa', ask('/xoa-baihoc 1'))
        self.assertEqual(self.learning.list_lessons(), [])


if __name__ == '__main__':
    unittest.main()
