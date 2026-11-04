"""Không cần Internet, Ollama hoặc cơ sở dữ liệu thực của người dùng."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

from sora.ai.offline_brain import OfflineBrain
from sora.ai import model_client


class FakeMemory:
    def __init__(self):
        self.saved = []

    def facts(self):
        return {'màu yêu thích': 'xanh lá'}

    def recent(self, n=40):
        return self.saved[-n:]

    def training_examples(self, approved_only=False):
        examples = [
            (1, 'Sora thích làm gì?', 'Mình thích trò chuyện và giúp Sơn học lập trình.', 1),
            (2, 'Mật khẩu bí mật là gì?', 'Đây là câu chưa được duyệt.', 0),
            (3, 'Câu sai?', 'Không dùng câu đã từ chối.', -1),
        ]
        return [item for item in examples if not approved_only or item[3] == 1]

    def add(self, role, content, source='desktop'):
        self.saved.append({'role': role, 'content': content})


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dataset = Path(self.temp.name) / 'mau.jsonl'
        with self.dataset.open('w', encoding='utf-8') as file:
            file.write(json.dumps({'messages': [
                {'role': 'user', 'content': 'Hôm nay trời thế nào?'},
                {'role': 'assistant', 'content': 'Mình không có dữ liệu thời tiết trực tiếp.'},
            ]}, ensure_ascii=False) + '\n')
        self.memory = FakeMemory()
        self.brain = OfflineBrain(self.memory, self.dataset)

    def test_only_approved_examples_are_authoritative(self):
        self.assertEqual(self.brain.reply('Sora thích làm gì?'),
                         'Mình thích trò chuyện và giúp Sơn học lập trình.')
        self.assertNotIn('chưa được duyệt', self.brain.reply('Mật khẩu bí mật là gì?'))
        self.assertNotIn('từ chối', self.brain.reply('Câu sai?'))

    def test_facts_are_recalled_without_inventing(self):
        self.assertIn('xanh lá', self.brain.reply('Bạn còn nhớ màu yêu thích của tôi không?'))

    def test_rt_custom_memories_are_available_without_ollama(self):
        result = self.brain.reply('Bạn có nhớ món Gundam của tôi không?',
                                  profile={'memories': ['Sơn sưu tầm mô hình Gundam']})
        self.assertIn('Gundam', result)

    def test_high_confidence_dataset_match(self):
        self.assertEqual(self.brain.reply('Hôm nay trời thế nào?'),
                         'Mình không có dữ liệu thời tiết trực tiếp.')
        unknown = self.brain.reply('Giải thích lý thuyết hạt nhân siêu phức tạp')
        self.assertIn('chưa tìm được câu trả lời đáng tin', unknown)
        self.assertIn('cần Ollama', unknown)

    def test_ollama_connection_error_uses_offline_answer_and_saves_history(self):
        with patch.object(model_client, 'Memory', return_value=self.memory):
            client = model_client.OllamaClient()
        client.offline.dataset = self.dataset
        output, errors = [], []
        with patch.object(model_client.LOCAL_HTTP, 'open', side_effect=URLError('mất kết nối')):
            client._stream('Sora thích làm gì?', output.append, output.append, errors.append)
        self.assertFalse(errors)
        self.assertEqual(output[0], 'Mình thích trò chuyện và giúp Sơn học lập trình.')
        self.assertEqual(output[-1], output[0])
        self.assertEqual(self.memory.saved[-1]['content'], output[0])
        self.assertEqual([item['role'] for item in self.memory.saved], ['user', 'assistant'])


if __name__ == '__main__':
    unittest.main()
