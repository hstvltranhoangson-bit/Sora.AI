import unittest

from sora.ai.model_client import explicit_desktop_intent, profile_context


class ChessAgentRouteTest(unittest.TestCase):
    def test_explicit_actions_can_use_same_agent(self):
        self.assertTrue(explicit_desktop_intent('Sora ơi, giúp anh mở Notepad'))
        self.assertTrue(explicit_desktop_intent('em hãy chụp màn hình'))
        self.assertTrue(explicit_desktop_intent('Mở máy tính'))
        self.assertTrue(explicit_desktop_intent('Gõ lời chào vào ô đang chọn'))

    def test_chat_and_questions_do_not_trigger_actions(self):
        self.assertFalse(explicit_desktop_intent('Em có thể mở Notepad không?'))
        self.assertFalse(explicit_desktop_intent('Mở rộng kiến thức giúp anh'))
        self.assertFalse(explicit_desktop_intent('Anh đang chơi cờ vui quá'))
        self.assertFalse(explicit_desktop_intent('Đừng mở máy tính nhé'))

    def test_chess_context_is_only_reference_data(self):
        scene = '{"fen":"8/8/8/8/8/8/8/8","mood":"curious"}'
        info = profile_context({'chessContext': scene})
        self.assertIn('Trạng thái trò chơi', info)
        self.assertIn('không thực hiện', info)
        self.assertIn(scene, info)


if __name__ == '__main__':
    unittest.main()
