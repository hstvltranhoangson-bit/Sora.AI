"""Regression: web capability questions must reflect SORA tools, not LLM defaults."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from sora.ai import model_client
from sora.ai import network_research


class InternetCapabilityTests(unittest.TestCase):
    def test_capability_question_recognized(self):
        for question in (
            'em có thể truy cập internet ko ?',
            'Sora có thể tìm kiếm thông tin trên mạng không?',
            'Em có truy cập web được không?',
            'Sora có khả năng vào mạng không?',
        ):
            with self.subTest(question=question):
                self.assertTrue(model_client.is_internet_capability_question(question))

    def test_search_request_not_intercepted(self):
        for question in (
            '/tim tin tức AI',
            'Em hãy tìm thông tin trên mạng về Python',
            'Tin tức AI hôm nay thế nào?',
            'Internet hôm nay bị chập chờn vì sao?',
        ):
            with self.subTest(question=question):
                self.assertFalse(model_client.is_internet_capability_question(question))

    def test_capability_answer_without_ollama(self):
        client = model_client.OllamaClient.__new__(model_client.OllamaClient)
        saved = []
        client.memory = SimpleNamespace(add=lambda *args: saved.append(args))
        chunks, done, errors = [], [], []
        with patch.object(model_client, 'research_config', return_value={'public_enabled': True}), \
             patch.object(model_client, 'research', side_effect=AssertionError('Should not search')), \
             patch.object(model_client.LOCAL_HTTP, 'open', side_effect=AssertionError('Should not call Ollama')):
            client.send('Em có thể truy cập internet ko?', chunks.append, done.append, errors.append)
        self.assertEqual(errors, [])
        self.assertEqual(chunks, done)
        self.assertIn('/tim ', done[0])
        self.assertIn('Ollama', done[0])
        self.assertEqual(len(saved), 2)

    def test_public_network_disabled_no_false_claim(self):
        with patch.object(model_client, 'research_config', return_value={'public_enabled': False}):
            self.assertIn('đang tắt', model_client.internet_capability_reply())

    def test_real_search_is_routed_by_keywords(self):
        conf = {'auto_search': True}
        self.assertTrue(network_research.should_research('Em tìm kiếm trên web thông tin về Python', conf))
        self.assertTrue(network_research.should_research('/tim AI', conf))
        self.assertFalse(network_research.should_research('Em có thể truy cập internet ko?', conf))


if __name__ == '__main__':
    unittest.main()
