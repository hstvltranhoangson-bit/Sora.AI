"""Kiểm tra tích hợp tra cứu toán với bộ 50.000 mẫu do người dùng tạo."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'sora_math_50000' / 'backend' / 'data'
MODULE = ROOT / 'backend' / 'sora' / 'ai' / 'math_knowledge.py'
spec = importlib.util.spec_from_file_location('sora_math_knowledge', MODULE)
math_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(math_module)


class StubMemory:
    def facts(self):
        return {}

    def training_examples(self, approved_only=False):
        return []

    def recent(self, n=40):
        return []


class MathKnowledgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.index = Path(cls.temp.name) / 'math.sqlite3'
        cls.dataset = SOURCE / 'sora_math_50000.jsonl'
        cls.catalog = SOURCE / 'sora_math_formulas.json'
        cls.count = math_module.build_index(cls.dataset, cls.index)
        cls.kb = math_module.MathKnowledge(cls.dataset, cls.catalog, cls.index)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_index_contains_full_dataset(self):
        self.assertEqual(self.count, 50_000)
        self.assertTrue(self.index.exists())

    def test_reference_lookup(self):
        text = self.kb.context('Tính diện tích tam giác đáy 12 cm chiều cao 8 cm')
        self.assertIn('Diện tích tam giác', text)
        self.assertIn('S=ah/2', text)
        self.assertIn('không chép đáp số', text)
        self.assertIn('Ví dụ tương tự', text)

    def test_exact_never_confuses_different_numbers(self):
        with self.dataset.open('r', encoding='utf-8') as source:
            example = json.loads(source.readline())
        question = example['messages'][0]['content']
        answer = example['messages'][1]['content']
        self.assertEqual(self.kb.exact(question), answer)
        # Đổi số: không được trả đáp số cũ chỉ vì câu hỏi na ná nhau.
        modified = question.replace('18320', '18321')
        self.assertNotEqual(modified, question)
        self.assertIsNone(self.kb.exact(modified))
        self.assertIn('công thức', self.kb.offline_answer(modified).lower())

    def test_unrelated_chat_is_not_hijacked(self):
        self.assertEqual(self.kb.context('Sora ơi, hôm nay em thích làm gì?'), '')
        self.assertIsNone(self.kb.offline_answer('Anh muốn nói chuyện với em'))
        self.assertEqual(self.kb.context('Tính cách của em như thế nào?'), '')

    def test_missing_index_uses_catalog_only(self):
        absent = math_module.MathKnowledge(self.dataset, self.catalog, Path(self.temp.name) / 'missing.sqlite3')
        self.assertIn('Diện tích hình tròn', absent.context('Công thức diện tích hình tròn'))
        self.assertNotIn('Ví dụ tương tự', absent.context('Công thức diện tích hình tròn'))

    def test_offline_integration(self):
        off_spec = importlib.util.spec_from_file_location('test_offline_brain',
                    ROOT / 'backend' / 'sora' / 'ai' / 'offline_brain.py')
        off = importlib.util.module_from_spec(off_spec)
        off_spec.loader.exec_module(off)
        brain = off.OfflineBrain(StubMemory(), dataset=Path(self.temp.name) / 'missing.jsonl',
                                 math_knowledge=self.kb)
        response = brain.reply('Tính diện tích tam giác có đáy 14 cm và chiều cao 9 cm')
        self.assertIn('Diện tích tam giác', response)
        self.assertNotIn('đáp số: 63', response.lower())  # Không giả vờ đã tính bài mới.


if __name__ == '__main__':
    unittest.main()
