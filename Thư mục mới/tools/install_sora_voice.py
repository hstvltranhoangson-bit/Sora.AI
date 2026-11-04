r"""Gắn giọng Sora vào chat và cờ vua, không ghi đè nguyên file người dùng.

Lệnh: .\.venv\Scripts\python.exe tools\install_sora_voice.py
"""

from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parents[1]
SHARED_IMPORT = "import { soraSpeech } from '../../shared/sora-voice-pack.mjs';"


def replace_once(content, old, new, label):
    if new in content:
        return content
    if content.count(old) != 1:
        raise ValueError(f"{label}: không tìm thấy đúng vị trí; có thể file đã được sửa khác phiên bản")
    return content.replace(old, new, 1)


def integrate_chat(content):
    if SHARED_IMPORT not in content:
        content = replace_once(content,
            "import { ASSISTANT_NAMES } from './lines.js';",
            "import { ASSISTANT_NAMES } from './lines.js';\n" + SHARED_IMPORT,
            "Chat - import")
    content = replace_once(content,
        "    this.host.focusOverlay(false);\n    this.sora.nextMove = performance.now() + 30000;",
        "    this.host.focusOverlay(false);\n    soraSpeech.stop();\n    this.sora.nextMove = performance.now() + 30000;",
        "Chat - stop")
    if "soraSpeech.speak(answer);" not in content:
        content = replace_once(content,
            "    this.panel.setChatBusy(false);\n    if (!this.agent) this.after(res.text, answer, asked, early, text);",
            "    this.panel.setChatBusy(false);\n"
            "    if (!this.voice.muted) soraSpeech.speak(answer);\n"
            "    if (!this.agent) this.after(res.text, answer, asked, early, text);",
            "Chat - speak")
    if "const greeting = status.offline" not in content:
        content = replace_once(content,
            "    const shown = this.panel.say({\n      kind: 'chat',",
            "    const greeting = status.offline ? (t.offlineReady || 'Em đang dùng ký ức ngoại tuyến.')\n"
            "      : tiny ? t.tiny : pick(this.history.length ? t.again : t.hello);\n"
            "    const shown = this.panel.say({\n      kind: 'chat',",
            "Chat - greeting")
        content = replace_once(content,
            "      line: status.offline ? (t.offlineReady || 'Em đang dùng ký ức ngoại tuyến.')\n"
            "        : tiny ? t.tiny : pick(this.history.length ? t.again : t.hello),",
            "      line: greeting,",
            "Chat - greeting text")
    content = replace_once(content,
        "    this.open = true;\n    setTimeout(() => this.panel.chatInput.focus(), 150);",
        "    this.open = true;\n    if (!this.voice.muted) soraSpeech.speak(greeting);\n"
        "    setTimeout(() => this.panel.chatInput.focus(), 150);",
        "Chat - greeting voice")
    return content


def integrate_chess(content):
    if SHARED_IMPORT not in content:
        content = replace_once(content,
            "import { startGlitchStatus } from '../../shared/glitch-status.mjs';",
            "import { startGlitchStatus } from '../../shared/glitch-status.mjs';\n" + SHARED_IMPORT,
            "Chess - import")
    old = """function speak(line) {
  if (!byId('voice-toggle').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.lang = 'vi-VN'; utterance.rate = 1.03; utterance.pitch = 1.13;
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((v) => v.lang.toLowerCase().startsWith('vi')) || null;
  speechSynthesis.speak(utterance);
}"""
    new = """function speak(line) {
  if (byId('voice-toggle')?.checked) soraSpeech.speak(line);
}"""
    return replace_once(content, old, new, "Chess - speak")


def main():
    targets = [
        (ROOT / "src" / "renderer" / "js" / "chat.js", integrate_chat),
        (ROOT / "src" / "games" / "chess" / "chess.js", integrate_chess),
    ]
    try:
        planned = [(path, path.read_text(encoding="utf-8"), editor) for path, editor in targets]
        prepared = [(path, previous, editor(previous)) for path, previous, editor in planned]
    except (ValueError, OSError) as exc:
        raise SystemExit(f"Chưa thay đổi file nào: {exc}")

    for path, previous, updated in prepared:
        if previous == updated:
            print(f"Đã có sẵn: {path.relative_to(ROOT)}")
            continue
        backup = path.with_suffix(path.suffix + ".before_sora_voice.bak")
        if not backup.exists():
            shutil.copy2(path, backup)
        path.write_text(updated, encoding="utf-8")
        print(f"Đã tích hợp: {path.relative_to(ROOT)}")
    print("Xong! Tệp dự phòng chỉ tạo một lần, đặt cạnh tệp gốc.")


if __name__ == "__main__":
    main()
