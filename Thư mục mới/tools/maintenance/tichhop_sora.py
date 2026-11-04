"""Chèn tính năng Sora tương thích với SORA, bảo toàn file người dùng đã sửa.

Run:  python tools/maintenance/tichhop_sora.py
The script is intentionally NOT a forced replacement of app.js / model_client.py.
"""
from __future__ import annotations

import datetime
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT.parent
TAG = 'SORA-FEATURES-INTEGRATION'


def inject(source, anchor, replacement, label):
    if TAG in replacement and replacement in source:
        return source
    matches = source.count(anchor)
    if matches != 1:
        raise RuntimeError(f'{label}: cần 1 điểm chèn, tìm thấy {matches}. Không ghi đè.')
    return source.replace(anchor, replacement, 1)


def prepare_updates():
    edits = {}
    f = ROOT/'src/renderer/js/acting.js'
    s = f.read_text(encoding='utf-8')
    block = '''  // SORA-FEATURES-INTEGRATION: pose mới trên shader RT của Sora, không dùng sprite Sora.
  dance: { priority:2, fps:24, keys:[
    [3,{sy:0.9,sx:1.08,bob:6,mane:-0.12,arms:-0.2}],
    [3,{bob:-15,tilt:-7,head:-0.12,mane:0.4,arms:0.7,echo:[5,0]}],
    [4,{bob:-8,tilt:7,head:0.13,mane:0.4,arms:1.0,echo:[-5,0]}],
    [3,{bob:-16,tilt:-6,head:-0.12,mane:0.3,arms:0.85}],
    [4,{bob:-8,tilt:6,head:0.12,mane:0.3,arms:0.8}],
    [3,{bob:-20,head:0,mane:0.5,arms:1.1,echo:[0,-5]}],
    [3,{bob:2,sy:0.88,sx:1.08,arms:-0.12}],
    [3,{bob:0,sy:1,sx:1,arms:0}]
  ] },
  wave: { priority:1, keys:[
    [3,{head:-0.06,armR:0.3,mane:0.12}],
    [4,{head:0.06,armR:1.3,mane:0.26}],
    [3,{armR:0.95,head:-0.03}],
    [4,{armR:1.35,head:0.08}],
    [3,{armR:0.7,head:0}],
    [3,{armR:0}]
  ] },
  listen: { priority:1, keys:[
    [2,{head:-0.04,mane:0.06}],
    [10,{head:0.16,mane:0.13,arms:-0.13}],
    [5,{head:0.08,arms:-0.05}],
    [3,{head:0}]
  ] },

'''
    if TAG not in s: s = inject(s, 'export const ACTS = {\n', 'export const ACTS = {\n'+block, f.name)
    edits[f] = s

    f = ROOT/'src/renderer/js/app.js'
    s=f.read_text(encoding='utf-8')
    if TAG not in s:
        s=inject(s, "import { pick, fmt, reducedMotion } from './util.js';\n",
                 "import { pick, fmt, reducedMotion } from './util.js';\nimport { createSoraFeatures } from './sora-features.mjs'; // SORA-FEATURES-INTEGRATION\n",f.name)
        s=inject(s, '  const chat = new Chat({ sora, panel, voice, host, brain });\n',
                 '  const chat = new Chat({ sora, panel, voice, host, brain });\n'
                 '  chat.soraFeatures = createSoraFeatures(sora); // SORA-FEATURES-INTEGRATION\n'
                 '  setInterval(() => chat.soraFeatures.tick(), 10000);\n',f.name)
        s=inject(s, '    brain.onWindows(data);\n',
                 '    brain.onWindows(data);\n    chat.soraFeatures.observe(data); // SORA-FEATURES-INTEGRATION\n',f.name)
    edits[f]=s

    f=ROOT/'src/renderer/js/chat.js';s=f.read_text(encoding='utf-8')
    if TAG not in s:
        s=inject(s, '  async send(text) {\n    if (this.turn || !this.open) return;\n',
            '''  async send(text) {
    if (this.turn || !this.open) return;
    // SORA-FEATURES-INTEGRATION: các lệnh chỉ điều khiển hoạt ảnh, không gửi Ollama.
    const local = this.soraFeatures?.command(text);
    if (local !== null && local !== undefined) {
      this.panel.chatTurn({ quote: text, face: 'look' });
      this.panel.stream(local, { done: true });
      this.panel.setFace('grin');
      return;
    }
''',f.name)
    edits[f]=s

    f=ROOT/'backend/sora/ai/model_client.py';s=f.read_text(encoding='utf-8')
    if TAG not in s:
        s=inject(s,'from sora.ai.sora_personality import sora_personality_text\n',
                 'from sora.ai.sora_personality import sora_personality_text\n'
                 'from sora.ai.sora_reminders import SoraReminders, reminder_command  # SORA-FEATURES-INTEGRATION\n',f.name)
        s=inject(s,'        self.memory = Memory()\n',
                 '        self.memory = Memory()\n        self.sora_reminders = SoraReminders()  # SORA-FEATURES-INTEGRATION\n',f.name)
        s=inject(s,'        command = user_message.strip()\n',
                 '''        command = user_message.strip()
        # SORA-FEATURES-INTEGRATION: không chạm SQLite ở hội thoại thông thường.
        if command.lower().split(' ', 1)[0] in ('/nhac', '/lichnhac', '/huy-nhac'):
            store = getattr(self, 'sora_reminders', None)
            if store is None:
                store = SoraReminders()
                self.sora_reminders = store
            notice = reminder_command(command, store)
            if notice is not None:
                self.memory.add('user', command)
                self.memory.add('assistant', notice)
                on_token(notice)
                on_done(notice)
                return
''',f.name)
    edits[f]=s

    f=ROOT/'backend/sora/bridge.py';s=f.read_text(encoding='utf-8')
    if TAG not in s:
        s=inject(s,'        elif method == "status":\n',
            '''        elif method == 'reminders_due':
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
''',f.name)
    edits[f]=s

    f=ROOT/'src/main/main.js';s=f.read_text(encoding='utf-8')
    if TAG not in s:
        s=inject(s,'      soraBackend.start();\n',
            '''      soraBackend.start();
      // SORA-FEATURES-INTEGRATION: kiểm tra lời nhắc SQLite tối đa 1 lần/30 giây.
      // Không mở thêm cửa sổ, không yêu cầu Ollama hoặc Internet.
      const remindersTimer = setInterval(() => {
        if (!soraBackend || !overlay || overlay.isDestroyed() || quitting) return;
        soraBackend.request('reminders_due', {}, {
          timeoutMs: 10000,
          onEvent: (evt) => {
            if (evt.event === 'proactive' && evt.kind === 'reminder') {
              overlay?.webContents.send('sora:event', evt);
            }
          },
        }).catch((err) => console.warn('[Sora] Lời nhắc chưa phản hồi:', err.message));
      }, 30000);
      remindersTimer.unref?.();
''',f.name)
    edits[f]=s

    f = ROOT/'src/main/windows.js'; s = f.read_text(encoding='utf-8')
    if TAG not in s:
        s = inject(s, '      onUpdate({ fg: snap.fg, wins });\n',
                   "      onUpdate({ fg: snap.fg, wins, kind: snap.kind || '' }); // SORA-FEATURES-INTEGRATION\n", f.name)
    edits[f] = s

    f = ROOT/'src/main/windows.ps1'; s = f.read_text(encoding='utf-8')
    if TAG not in s:
        s = inject(s, '  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();\n',
                   '''  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  // SORA-FEATURES-INTEGRATION: chỉ suy ra code/game từ tên tiến trình, không đọc tiêu đề.
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
''', f.name)
        s = inject(s, '  public static string Snapshot(long self) {\n',
                   '''  public static string WindowCategory() {
    try {
      uint pid;
      GetWindowThreadProcessId(GetForegroundWindow(), out pid);
      if (pid == 0) return "";
      var proc = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
      if (proc == "code" || proc == "devenv" || proc.StartsWith("netbeans") ||
          proc.StartsWith("godot") || proc.StartsWith("pycharm") || proc.StartsWith("idea64")) return "code";
      if (proc.StartsWith("steam") || proc.StartsWith("minecraft") || proc.StartsWith("valorant") ||
          proc.StartsWith("leagueclient") || proc.StartsWith("riotclient")) return "game";
    } catch (Exception) { /* no permission / window exited */ }
    return "";
  }

  public static string Snapshot(long self) {
''', f.name)
        anchor = r'    sb.Append("{\"fg\":").Append(GetForegroundWindow().ToInt64()).Append(",\"wins\":[");' + '\n'
        replacement = (r'    sb.Append("{\"fg\":").Append(GetForegroundWindow().ToInt64());' + '\n'
                       + r'    sb.Append(",\"kind\":\"").Append(WindowCategory()).Append("\",\"wins\":["); // SORA-FEATURES-INTEGRATION' + '\n')
        s = inject(s, anchor, replacement, f.name)
    edits[f] = s
    return edits


def main():
    if not (ROOT/'package.json').is_file() or not (ROOT/'backend/sora/bridge.py').is_file():
        raise RuntimeError('Không tìm thấy mã nguồn SORA trong thư mục đang dùng.')
    changes = {k:v for k,v in prepare_updates().items() if k.read_text(encoding='utf-8')!=v}
    if not changes:
        print('Các điểm kết nối đã được áp dụng. Không thay đổi file.')
        return
    # Verify ALL files before writing any of them; never replace a modified local source blindly.
    node = BASE/'Nodejs/node.exe'
    if not node.exists():
        node = shutil.which('node')
    if node:
        for f,s in changes.items():
            if f.suffix!='.js':continue
            # type=module supports ESM renderer and CJS main; syntax validation only.
            mode = 'commonjs' if '/main/' in f.as_posix() else 'module'
            result = subprocess.run([str(node),'--input-type='+mode,'--check'], input=s,
                         text=True,encoding='utf-8',capture_output=True)
            if result.returncode:raise RuntimeError(f'Lỗi cú pháp {f.name}: {result.stderr}')
    for f,s in changes.items():
        if f.suffix == '.py': compile(s,str(f),'exec')
    stamp=datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backups=BASE/'backup'/'SoraIntegration'/stamp
    for f in changes:
        target = backups/f.relative_to(ROOT)
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(f,target)
    try:
        for f,s in changes.items():
            f.write_text(s,encoding='utf-8')
    except Exception:
        for f in changes:
            saved=backups/f.relative_to(ROOT)
            if saved.exists(): shutil.copy2(saved,f)
        raise
    print(f'[OK] Đã tích hợp {len(changes)} file vào SORA. Bản sao lưu: {backups}')
    print('Giữ nguyên README.md, Sora.exe, hoạt ảnh Ẩn, DIALOG và bộ nhớ hiện tại.')


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('DỪNG AN TOÀN:',error,file=sys.stderr)
        sys.exit(1)
