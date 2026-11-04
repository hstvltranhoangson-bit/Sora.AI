"""Offline regression tests: web claims require retrieved evidence."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from sora.ai import network_research, model_client


class WebVerifiedTests(unittest.TestCase):
    def test_exact_question_bypasses_llm(self):
        instance = model_client.OllamaClient.__new__(model_client.OllamaClient)
        saved = []
        instance.memory = SimpleNamespace(add=lambda *a: saved.append(a))
        tokens, completed = [], []
        with patch.object(model_client, 'research_config', return_value={'public_enabled': True}), \
             patch.object(model_client.LOCAL_HTTP, 'open', side_effect=AssertionError('Should not call Ollama')), \
             patch.object(model_client, 'research', side_effect=AssertionError('Should not call web')):
            instance.send('Em có thể truy cập Internet không?', tokens.append, completed.append, lambda s: self.fail(s))
        self.assertEqual(tokens, completed)
        self.assertIn('/tim', completed[0])
        self.assertNotIn('không có khả năng truy cập', completed[0])

    def test_backend_diagnostic_without_llm(self):
        instance = model_client.OllamaClient.__new__(model_client.OllamaClient)
        tokens, completed = [], []
        with patch.object(model_client, 'research_config', return_value={'public_enabled': True}):
            instance.send('/trangthai-web', tokens.append, completed.append, lambda s: self.fail(s))
        self.assertIn('SORA WEB CHECK', completed[0])
        self.assertIn('BẬT', completed[0])
        self.assertEqual(tokens, completed)

    def test_source_dates_and_attribution(self):
        result = {'sources':[{'title':'Thông báo AI tháng 10','url':'https://example.org/ai',
                   'published_at':'2026-10-01T12:00:00Z','excerpt':'Bài viết nói về mô hình mới.'}],
                  'retrieved_at_utc':'2026-11-01T01:00:00+00:00'}
        with patch.object(network_research, 'datetime') as mocked:
            from datetime import datetime, timezone
            mocked.now.return_value = datetime(2026,11,1,tzinfo=timezone.utc)
            out = network_research.evidence_first_reply(result)
        self.assertIn('https://example.org/ai', out)
        self.assertIn('2026-10-01', out)
        self.assertIn('quá 14 ngày', out)
        self.assertIn('chưa phải xác nhận', out)

    def test_missing_publication_date_never_invented(self):
        out = network_research.evidence_first_reply({
            'sources':[{'title':'Một trang','url':'https://example.org/','excerpt':'Dữ kiện sơ bộ'}],
            'retrieved_at_utc':'2026-11-01T01:00:00+00:00'})
        self.assertIn('Chưa xác minh được ngày công bố', out)
        self.assertNotIn('Ngày công bố trang khai báo:', out)

    def test_latest_search_does_not_call_ollama_or_invent_news(self):
        instance = model_client.OllamaClient.__new__(model_client.OllamaClient)
        seen=[]
        instance.math_knowledge = SimpleNamespace(context=lambda s: '')
        instance.memory = SimpleNamespace(facts=lambda:{}, recent=lambda n:[],
            recall=lambda s:[], add=lambda *args: seen.append(args))
        instance.agent_core = SimpleNamespace(guidance=lambda:'')
        instance.learning = SimpleNamespace(prompt_context=lambda:'')
        instance.experiences = SimpleNamespace(profile=lambda:{},context=lambda:'')
        instance.screen_context = SimpleNamespace(prompt_context=lambda:'')
        sample={'attempted':True,'sources':[{'title':'Bài thử nguồn A',
                'url':'https://example.org/news','published_at':'2026-10-01T10:00:00Z',
                'excerpt':'Thông tin trên trang A'}],
                'context':'[Nguồn 1] Nguồn A', 'error':'', 'question':'tin tức AI mới nhất',
                'retrieved_at_utc':'2026-11-01T01:00:00+00:00'}
        tokens, done, errors=[],[],[]
        with patch.object(model_client, 'research', return_value=sample), \
             patch.object(model_client.LOCAL_HTTP, 'open', side_effect=AssertionError('Ollama must not invent news')):
            instance._stream('/tim tin tức AI mới nhất', tokens.append, done.append, errors.append)
        self.assertFalse(errors)
        self.assertEqual(done, tokens)
        self.assertEqual(len(done), 1)
        self.assertIn('https://example.org/news', done[0])
        self.assertEqual(len(seen), 2)

    def test_direct_web_read_is_source_grounded_not_ollama_claim(self):
        instance = model_client.OllamaClient.__new__(model_client.OllamaClient)
        seen = []
        instance.math_knowledge = SimpleNamespace(context=lambda s: '')
        instance.memory = SimpleNamespace(facts=lambda: {}, recent=lambda n: [],
            recall=lambda s: [], add=lambda *args: seen.append(args))
        instance.agent_core = SimpleNamespace(guidance=lambda: '')
        instance.learning = SimpleNamespace(prompt_context=lambda: '')
        instance.experiences = SimpleNamespace(profile=lambda: {}, context=lambda: '')
        instance.screen_context = SimpleNamespace(prompt_context=lambda: '')
        source = {'attempted': True, 'sources': [{'title': 'Python.org',
            'url': 'https://www.python.org/', 'excerpt': 'Welcome to Python.org'}],
            'context': 'public snippet', 'error':'', 'question':'https://www.python.org/'}
        tokens, done, errors = [], [], []
        with patch.object(model_client, 'research', return_value=source), \
             patch.object(model_client.LOCAL_HTTP, 'open', side_effect=AssertionError('Do not call Ollama')):
            instance._stream('/web https://www.python.org/', tokens.append, done.append, errors.append)
        self.assertEqual(errors, [])
        self.assertEqual(done, tokens)
        self.assertIn('Welcome to Python.org', done[0])
        self.assertIn('https://www.python.org/', done[0])
        self.assertNotIn('không có khả năng truy cập Internet', done[0])
        self.assertEqual(len(seen), 2)

    def test_direct_page_reply_without_sources_does_not_fabricate(self):
        result = {'attempted': True, 'sources': [], 'error': 'failed', 'error_code':'fetch_failed'}
        text = network_research.direct_page_reply(result)
        self.assertIn('chưa đọc được', text)
        self.assertNotIn('Welcome to Python', text)

    def test_html_publication_metadata(self):
        p=network_research.VisibleHTML()
        p.feed('<html><head><meta property="article:published_time" content="2026-10-17T11:00:00Z"></head><body><p>Thông tin công khai.</p></body></html>')
        self.assertEqual(p.published_at, '2026-10-17T11:00:00Z')

    def test_news_detector_and_old_nonnews(self):
        self.assertTrue(network_research.is_current_info_query('/tim tin tức công nghệ AI mới nhất'))
        self.assertFalse(network_research.is_current_info_query('/web https://www.python.org/'))


if __name__ == '__main__':
    unittest.main()
