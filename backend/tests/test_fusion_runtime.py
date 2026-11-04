"""Offline regression tests: no microphones, Ollama download, or Windows calls."""
import os
import tempfile
import unittest
from pathlib import Path
from sora.ai.fusion_runtime import FusionRuntime, _normalized


class FusionRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.runtime = FusionRuntime(Path(self.temp.name) / 'fusion.sqlite3')

    def tearDown(self):
        self.runtime.close()
        self.temp.cleanup()

    def test_diacritics_for_voice_wake(self):
        self.assertEqual(_normalized('Này Sora ơi'), 'nay sora oi')

    def test_empty_plan_rejected(self):
        self.assertFalse(self.runtime.create_plan('A', [])['ok'])

    def test_multi_step_plan_approval_and_verification(self):
        created = self.runtime.create_plan('Hoàn thành báo cáo', [
            {'kind':'find','target':'bao_cao.docx'},
            {'kind':'verify','target':'Kiểm tra trang đầu'},
        ])
        self.assertTrue(created['ok'])
        number = created['plan_id']
        step = self.runtime.plan(number)['steps'][0]
        self.assertFalse(self.runtime.finish_step(number,step['id'],'Đã thấy file')['ok'])
        self.assertTrue(self.runtime.approve_plan(number)['ok'])
        self.assertTrue(self.runtime.finish_step(number,step['id'],'Đã thấy file')['ok'])
        self.assertEqual(self.runtime.report(number)['progress'], 50)
        self.assertTrue(self.runtime.finish_step(number, self.runtime.plan(number)['steps'][1]['id'],
                                                 'Đã kiểm tra nội dung')['ok'])
        self.assertEqual(self.runtime.report(number)['status'], 'done')

    def test_task_cancel_never_approved_afterwards(self):
        number = self.runtime.create_plan('Kế hoạch cần ngắt',['Bước một'])['plan_id']
        self.runtime.cancel(number)
        self.assertFalse(self.runtime.approve_plan(number)['ok'])

    def test_model_selection_requires_installed_local_model(self):
        self.assertFalse(self.runtime.change_model('not-a-model-and-not-installed:invalid')['ok'])

    def test_file_search_requires_query(self):
        self.assertFalse(self.runtime.find_files('x')['ok'])

    def test_dispatch_rejects_unknown_commands(self):
        self.assertFalse(self.runtime.dispatch('__import__',{})['ok'])

if __name__ == '__main__':unittest.main()
