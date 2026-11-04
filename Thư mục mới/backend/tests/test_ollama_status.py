"""Regression tests for reliable status on a freshly restarted local Ollama."""
import io
import json
import unittest
from unittest.mock import patch
from sora.ai import model_client


class FakeResponse(io.BytesIO):
    def __init__(self, obj, status=200):
        super().__init__(json.dumps(obj).encode('utf-8'))
        self.status = status


class OllamaStatusTests(unittest.TestCase):
    def setUp(self):
        self.client = object.__new__(model_client.OllamaClient)

    def test_ollama_with_expected_model_is_online(self):
        with patch.object(model_client.LOCAL_HTTP, 'open', return_value=FakeResponse({
            'models': [{'name': 'qwen2.5:1.5b'}]})):
            self.assertTrue(self.client.is_connected())

    def test_no_required_model_is_offline(self):
        with patch.object(model_client.LOCAL_HTTP, 'open', return_value=FakeResponse({
            'models': [{'name': 'some-other-model:latest'}]})):
            self.assertFalse(self.client.is_connected())

    def test_connection_failure_is_offline(self):
        with patch.object(model_client.LOCAL_HTTP, 'open', side_effect=OSError('connection refused')):
            self.assertFalse(self.client.is_connected())


if __name__ == '__main__':
    unittest.main()
