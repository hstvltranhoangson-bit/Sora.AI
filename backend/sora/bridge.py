"""Sora JSON-lines bridge for the RT/Electron front-end.

Input/output are UTF-8 JSON objects, one per line. This is a private child
process over stdio: it does not open an HTTP port or expose filesystem tools
to the renderer. Tool approval *always* returns through the host dialog.

Commands:
  {"id":1,"method":"status"}
  {"id":2,"method":"history"}
  {"id":3,"method":"chat","text":"Chào SORA"}
  {"method":"approve","approval_id":"...","allowed":false}
  {"method":"cancel","id":3}
  {"id":4,"method":"clear_history"}  (explicit user menu action only)
  {"method":"shutdown"}  (host closes the private worker)
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
import threading
import uuid
from dataclasses import dataclass, field

from sora.ai.model_client import MODEL_NAME, OllamaClient, explicit_desktop_intent
from sora.ai.fusion_runtime import FusionRuntime  # SORA-FUSION
from sora.ai.companion_voice import companion_voice, CompanionVoiceStream
from sora.character.emotion_engine import choose_emotion


MAX_LINE = 1024 * 1024
MAX_PROMPT = 10000
GAME_SOURCES = frozenset({"chess", "tictactoe", "connect4", "gomoku", "word", "reversi", "battleship", "detective"})


@dataclass
class Request:
    id: int | str
    text: str
    cancel: threading.Event = field(default_factory=threading.Event)
    completed: bool = False
    action_succeeded: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)

    def mark_done(self):
        with self.lock:
            if self.completed:
                return False
            self.completed = True
            return True


class Bridge:
    def __init__(self, client=None, writer=None):
        self.client = client if client is not None else OllamaClient()
        self.write = writer if writer is not None else sys.stdout
        self.write_lock = threading.Lock()
        self.active = {}
        self.active_lock = threading.RLock()
        self.approvals = {}
        self.approvals_lock = threading.Lock()
        self.client.action_approval = self.approve_tool
        self.last_emotion = 'CALM'
        self.closing = False
        self.fusion = FusionRuntime(notification=lambda event, **kw: self.emit(
            {'kind':'notification','event':event,**kw}))  # SORA-FUSION

    def emit(self, message):
        data = json.dumps(message, ensure_ascii=False, separators=(",", ":"))
        with self.write_lock:
            self.write.write(data + "\n")
            self.write.flush()

    def reply(self, request_id, **payload):
        self.emit({"id": request_id, "kind": "result", **payload})

    def event(self, request_id, name, **payload):
        self.emit({"id": request_id, "kind": "event", "event": name, **payload})

    def approve_tool(self, name, args, reason):
        # Called on the worker thread created by OllamaClient. The reader
        # thread remains available to receive the user's approve/reject click.
        with self.active_lock:
            active = next(iter(self.active.values()), None)
        if active is None or active.cancel.is_set():
            return False
        approval_id = uuid.uuid4().hex
        ticket = {"event": threading.Event(), "allowed": False, "request": active}
        with self.approvals_lock:
            self.approvals[approval_id] = ticket
        try:
            self.event(active.id, "approval_required", approval_id=approval_id,
                       tool=name, args=args, reason=reason)
            ticket["event"].wait(timeout=120)
            return bool(ticket["allowed"] and not active.cancel.is_set())
        finally:
            with self.approvals_lock:
                self.approvals.pop(approval_id, None)

    def _finish(self, request, ok, text="", error=""):
        if not request.mark_done():
            return
        with self.active_lock:
            self.active.pop(request.id, None)
        if request.cancel.is_set():
            self.event(request.id, "cancelled")
            self.reply(request.id, ok=False, error="cancelled")
        elif ok:
            emotion = choose_emotion(request.text, text, self.last_emotion)
            self.last_emotion = emotion
            self.event(request.id, "completed", emotion=emotion.lower(),
                       tool_succeeded=request.action_succeeded)
            self.reply(request.id, ok=True, text=text)
        else:
            self.event(request.id, "failed", error=error)
            self.reply(request.id, ok=False, error=error)

    def _chat(self, msg):
        request_id = msg.get("id")
        content = msg.get("text")
        if not isinstance(request_id, (int, str)) or not isinstance(content, str):
            self.reply(request_id, ok=False, error="Yêu cầu trò chuyện không hợp lệ.")
            return
        text = content.strip()
        if not text or len(text) > MAX_PROMPT:
            self.reply(request_id, ok=False, error="Tin nhắn phải có từ 1 đến 10.000 ký tự.")
            return
        with self.active_lock:
            if self.active:
                self.reply(request_id, ok=False, error="Sora đang trả lời một yêu cầu khác.")
                return
            request = Request(request_id, text)
            self.active[request_id] = request
        tool_mode = text.lower().startswith(("/do ", "/lam ")) or explicit_desktop_intent(text)
        self.event(request_id, "thinking", tool_mode=tool_mode)
        profile = msg.get('profile') if isinstance(msg.get('profile'), dict) else {}

        voice = CompanionVoiceStream(
            lambda chunk: self.event(request_id, 'delta', text=chunk)
            if not request.cancel.is_set() and not request.completed else None)

        def on_token(chunk):
            if not request.cancel.is_set() and not request.completed:
                voice.feed(chunk)

        def on_done(answer):
            if not request.cancel.is_set():
                voice.finish()
            self._finish(request, True, text=companion_voice(answer))
            if not request.cancel.is_set() and self.fusion.get_setting('tts_auto','off') == 'on':
                self.fusion.voice.speak(companion_voice(answer))  # SORA-FUSION: opt-in

        def on_error(message):
            self._finish(request, False, error=str(message))

        def on_action(name, tool, ok):
            if request.cancel.is_set() or request.completed:
                return
            if name == 'tool_result' and ok:
                request.action_succeeded = True
            self.event(request.id, name, tool=tool, ok=bool(ok))

        try:
            self.client.send(text, on_token=on_token, on_done=on_done,
                             on_error=on_error, cancel_event=request.cancel,
                             on_action=on_action, profile=profile)
        except Exception as exc:
            self._finish(request, False, error=str(exc))

    def _heartbeat(self, request_id):
        """Cân nhắc chủ động rất thưa, chỉ nếu anh đã bật /chudong bat."""
        with self.active_lock:
            if self.active or self.closing:
                self.reply(request_id, ok=True, spoken=False)
                return
        tip = self.client.agent_core.due_tip()
        if not tip:
            self.reply(request_id, ok=True, spoken=False)
            return

        def reflect():
            try:
                thought = self.client.consider_next_step(tip)
                with self.active_lock:
                    quiet = self.closing or bool(self.active)
                spoken = bool(not quiet and thought.get('speak') and thought.get('text'))
                if spoken:
                    self.event(request_id, 'proactive', text=companion_voice(thought['text']))
                self.reply(request_id, ok=True, spoken=spoken)
            except Exception as exc:
                self.reply(request_id, ok=False, error=str(exc))

        threading.Thread(target=reflect, daemon=True).start()

    def dispatch(self, msg):
        if not isinstance(msg, dict):
            return
        method = msg.get("method")
        request_id = msg.get("id")
        if method == 'shutdown':
            self.closing = True
            self.fusion.close()  # SORA-FUSION
            with self.active_lock:
                requests = list(self.active.values())
                for req in requests:
                    req.cancel.set()
            with self.approvals_lock:
                for ticket in self.approvals.values():
                    ticket['event'].set()
            return
        if method == "approve":
            approval_id = msg.get("approval_id")
            with self.approvals_lock:
                ticket = self.approvals.get(approval_id)
                if ticket:
                    ticket["allowed"] = msg.get("allowed") is True
                    ticket["event"].set()
            return
        if method == "cancel":
            with self.active_lock:
                req = self.active.get(request_id)
            if req:
                req.cancel.set()
                with self.approvals_lock:
                    for ticket in self.approvals.values():
                        if ticket["request"] is req:
                            ticket["event"].set()
            return
        if method == 'fusion':  # SORA-FUSION: never dispatch arbitrary Python names
            outcome = self.fusion.dispatch(str(msg.get('action',''))[:64],msg.get('data',{}))
            self.reply(request_id,ok=True,data=outcome)
            return
        if method == "chat":
            self._chat(msg)
        elif method == 'reminders_due':
            # SORA-FEATURES-INTEGRATION: lời nhắc tồn tại xuyên phiên, chỉ trả về qua IPC riêng.
            try:
                items = self.client.sora_reminders.pop_due(limit=3)
                for number, text, due in items:
                    self.event(request_id, 'proactive', kind='reminder',
                               text=f'Anh ơi, đến giờ rồi: {text}')
                self.reply(request_id, ok=True, count=len(items))
            except sqlite3.Error as error:
                self.reply(request_id, ok=False, error=str(error))
        elif method == "status":
            self.reply(request_id, ok=True, online=self.client.is_connected(),
                       model=self.fusion.model_name(), backend="python-sora", local=True,
                       offline_ready=True)
        elif method == "heartbeat":
            self._heartbeat(request_id)
        elif method == "history":
            if msg.get('feed') is True:
                self.reply(request_id, ok=True, messages=self.client.memory.conversation(100))
            else:
                self.reply(request_id, ok=True, messages=self.client.memory.recent(40))
        elif method == 'conversation_event':
            # Chỉ UI được host cho phép mới có thể gửi sự kiện. Bối cảnh
            # bàn cờ không thành câu lệnh người dùng trong lịch sử AI.
            content = str(msg.get('text', '')).strip()[:2000]
            source = str(msg.get('source', 'chess'))[:32]
            if source not in GAME_SOURCES or not content:
                self.reply(request_id, ok=False, error='Sự kiện hội thoại không hợp lệ')
            else:
                self.client.memory.add_event(content, source)
                self.reply(request_id, ok=True)
        elif method == 'conversation_turn':
            # Những lệnh cờ được UI thực hiện ngay (xin nhường/tái đấu)
            # cũng là hội thoại thật, lưu cùng luồng SQLite của Sora.
            user = str(msg.get('user', '')).strip()[:3000]
            answer = str(msg.get('assistant', '')).strip()[:2000]
            if str(msg.get('source', '')) not in GAME_SOURCES or not user or not answer:
                self.reply(request_id, ok=False, error='Lượt hội thoại không hợp lệ')
            else:
                self.client.memory.add('user', user, str(msg.get('source')))
                self.client.memory.add('assistant', answer, str(msg.get('source')))
                self.reply(request_id, ok=True)
        elif method == "clear_history":
            # Only call this from the explicit 'Forget our conversations' menu.
            self.client.clear_history()
            self.client.memory.clear_messages()
            if hasattr(self.client, 'experiences'):
                self.client.experiences.clear_chat_experiences()
            self.reply(request_id, ok=True)
        elif method == 'experience':
            if not hasattr(self.client, 'experiences'):
                self.reply(request_id, ok=False, error='Bộ nhớ trải nghiệm chưa sẵn sàng')
                return
            try:
                profile = self.client.experiences.record(
                    str(msg.get('category', '')),
                    str(msg.get('detail', ''))[:280],
                    mood=str(msg.get('mood', ''))[:24],
                    winner=str(msg.get('winner', ''))[:12],
                    feedback=msg.get('feedback', '') if msg.get('feedback') in ('good', 'improve') else '')
                self.reply(request_id, ok=True, personality=profile)
            except (ValueError, sqlite3.Error) as exc:
                self.reply(request_id, ok=False, error=str(exc))
        elif method == 'personality':
            if hasattr(self.client, 'experiences'):
                self.reply(request_id, ok=True, personality=self.client.experiences.profile())
            else:
                self.reply(request_id, ok=False)
        else:
            self.reply(request_id, ok=False, error="Lệnh hệ thống không được hỗ trợ.")


def main():
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    bridge = Bridge()
    bridge.emit({"kind": "ready", "backend": "python-sora", "model": bridge.fusion.model_name()})
    for raw in sys.stdin:
        if len(raw) > MAX_LINE:
            continue
        try:
            bridge.dispatch(json.loads(raw))
            if bridge.closing:
                break
        except Exception as exc:
            # Diagnostics go to stderr; stdout must remain machine-readable.
            print("[Sora - giao tiếp nội bộ]", repr(exc), file=sys.stderr)


if __name__ == "__main__":
    main()
