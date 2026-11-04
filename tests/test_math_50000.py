"""Kiểm tra toàn bộ dữ liệu và một số đẳng thức độc lập với bộ sinh."""
import json
import math
import unittest
from fractions import Fraction as F
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'backend' / 'data' / 'sora_math_50000.jsonl'


class MathDatasetTests(unittest.TestCase):
    def test_format_count_variety(self):
        seen = set()
        skills = set()
        with DATA.open(encoding='utf-8') as source:
            for line in source:
                item = json.loads(line)
                question = item['messages'][0]['content']
                answer = item['messages'][1]['content']
                self.assertNotIn(question, seen)
                self.assertIn(item['formula'], answer)
                self.assertIn(item['expected_answer'], answer)
                self.assertTrue(item['formula'])
                seen.add(question)
                skills.add(item['skill'])
        self.assertEqual(len(seen), 50000)
        self.assertGreaterEqual(len(skills), 70)

    def test_independent_examples(self):
        visited = set()
        checks = {
            'Phương trình bậc nhất',
            'Ẩn cả hai vế',
            'Phương trình bậc hai',
            'Hệ hai phương trình',
            'Tính phần trăm',
            'Cộng phân số',
            'Thể tích hình trụ',
            'Định lý Pythagoras',
            'Đạo hàm đơn thức',
            'Tích phân xác định hàm bậc nhất',
            'Tổ hợp',
            'Hai biến cố độc lập',
        }
        with DATA.open(encoding='utf-8') as source:
            for line in source:
                item = json.loads(line)
                skill, variables, expected = item['skill'], item['variables'], item['expected_answer']
                if skill not in checks or skill in visited:
                    continue
                p = variables
                if skill == 'Phương trình bậc nhất':
                    self.assertEqual(p['a'] * int(expected) + p['b'], p['c'])
                elif skill == 'Ẩn cả hai vế':
                    x = int(expected)
                    self.assertEqual(p['a']*x+p['b'], p['c']*x+p['d'])
                elif skill == 'Phương trình bậc hai':
                    roots = expected.replace('x=', '').split(' hoặc ')
                    for root in roots:
                        x = int(root)
                        self.assertEqual(p['a']*x*x+p['b']*x+p['c'], 0)
                elif skill == 'Hệ hai phương trình':
                    left, right = expected.replace('x=', '').split(', y=')
                    x, y = int(left), int(right)
                    self.assertEqual(p['a']*x+p['b']*y, p['e'])
                    self.assertEqual(p['c']*x+p['d']*y, p['f'])
                elif skill == 'Tính phần trăm':
                    self.assertEqual(F(expected), F(p['x']*p['p'],100))
                elif skill == 'Cộng phân số':
                    self.assertEqual(F(expected), F(p['a'],p['b']) + F(p['c'],p['d']))
                elif skill == 'Thể tích hình trụ':
                    self.assertEqual(expected, f"{p['r']**2*p['h']}pi cm^3")
                elif skill == 'Định lý Pythagoras':
                    self.assertEqual(p['a']**2+p['b']**2, int(expected)**2)
                elif skill == 'Đạo hàm đơn thức':
                    self.assertEqual(int(expected), p['a']*p['n']*p['x']**(p['n']-1))
                elif skill == 'Tích phân xác định hàm bậc nhất':
                    v = F(p['m']*(p['hi']**2-p['lo']**2),2)+p['c']*(p['hi']-p['lo'])
                    self.assertEqual(F(expected),v)
                elif skill == 'Tổ hợp':
                    self.assertEqual(int(expected),math.comb(p['n'],p['k']))
                elif skill == 'Hai biến cố độc lập':
                    self.assertEqual(F(expected), F(p['a'],p['a']+p['b'])*F(p['c'],p['c']+p['d']))
                visited.add(skill)
                if len(visited) == len(checks):
                    break
        self.assertEqual(visited, checks)


if __name__ == '__main__':
    unittest.main()
