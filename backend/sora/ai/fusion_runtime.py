"""SORA Fusion: explicitly operated, local desktop workflows and voice.

This does not replace OllamaClient, AgentCore, memory, or the RT renderer.
Microphone and TTS dependencies load only upon explicit user opt-in.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
import unicodedata
from contextlib import contextmanager
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB = ROOT / 'data' / 'fusion.sqlite3'
OLLAMA = 'http://127.0.0.1:11434'
MAX_RESULTS = 25


def _flat(text, limit=220):
    return re.sub(r'\s+', ' ', str(text)).strip()[:limit]


def _normalized(text):
    return ''.join(x for x in unicodedata.normalize('NFD', str(text).casefold())
                   if unicodedata.category(x) != 'Mn').replace('đ', 'd')


def _ollama_models():
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(OLLAMA + '/api/tags', timeout=3) as response:
            records = json.load(response).get('models', [])
        return sorted({str(x['name']) for x in records
                       if isinstance(x, dict) and isinstance(x.get('name'), str)})
    except (OSError, ValueError, KeyError, TypeError):
        return []


class FusionVoice:
    """Microphone is off until voice_start/hotword_on is explicitly requested."""
    def __init__(self, notification):
        self.notify = notification
        self.lock = threading.RLock()
        self.recorder = None
        self.frames = []
        self.model = None
        self.hotword_stop = threading.Event()
        self.hotword_thread = None
        self.ptt_active = False
        self.speaker = None

    def _transcribe(self, frames):
        import numpy as np
        audio = np.concatenate(frames).astype('float32').reshape(-1)
        if audio.size < 16000 * .3 or float(np.max(np.abs(audio))) < .008:
            return ''
        # Lazy initialization avoids minutes of CPU load on every SORA launch.
        if self.model is None:
            from faster_whisper import WhisperModel
            size = os.environ.get('SORA_WHISPER_MODEL', 'tiny')
            if size not in ('tiny', 'base', 'small'):
                size = 'tiny'
            self.model = WhisperModel(size, device='cpu', compute_type='int8')
        segments, _ = self.model.transcribe(audio, language='vi', beam_size=2,
                                            vad_filter=True)
        return _flat(' '.join(x.text.strip() for x in segments), 1200)

    def start(self):
        import sounddevice as sd
        with self.lock:
            if self.hotword_thread and self.hotword_thread.is_alive():
                return {'ok': False, 'error': 'Tắt Hey Sora trước khi sử dụng nút nói.'}
            if self.ptt_active:
                return {'ok': False, 'error': 'Micro đang ghi âm.'}
            self.frames = []
            def callback(indata, frames, tim, status):
                with self.lock:
                    if self.ptt_active:
                        self.frames.append(indata.copy())
            self.recorder = sd.InputStream(samplerate=16000, channels=1,
                                           dtype='float32', callback=callback)
            self.ptt_active = True
            try:
                self.recorder.start()
            except Exception:
                self.ptt_active = False
                self.recorder.close()
                self.recorder = None
                raise
        return {'ok': True, 'recording': True}

    def stop(self):
        with self.lock:
            if not self.ptt_active:
                return {'ok': False, 'error': 'Micro chưa được bật.'}
            self.ptt_active = False
            stream, frames = self.recorder, list(self.frames)
            self.recorder = None
            self.frames = []
        if stream:
            stream.stop()
            stream.close()
        text = self._transcribe(frames) if frames else ''
        return {'ok': True, 'text': text, 'recording': False}

    def hotword(self, enabled):
        if not enabled:
            self.hotword_stop.set()
            return {'ok': True, 'enabled': False}
        with self.lock:
            if self.ptt_active:
                return {'ok': False, 'error': 'Đang sử dụng nút nói.'}
            if self.hotword_thread and self.hotword_thread.is_alive():
                return {'ok': True, 'enabled': True}
            self.hotword_stop.clear()
            self.hotword_thread = threading.Thread(target=self._hotword_loop, daemon=True,
                                                    name='SoraHeySora')
            self.hotword_thread.start()
        return {'ok': True, 'enabled': True}

    def _hotword_loop(self):
        # Only listens while the user enabled the feature. Samples stay in RAM.
        try:
            import sounddevice as sd
            last = 0.0
            while not self.hotword_stop.is_set():
                sample = sd.rec(int(16000 * 3.2), samplerate=16000,
                                channels=1, dtype='float32')
                sd.wait()
                if self.hotword_stop.is_set():
                    break
                try:
                    text = self._transcribe([sample])
                except Exception as exc:
                    self.notify('fusion_voice_error', error=_flat(exc, 200))
                    break
                norm = _normalized(text)
                match = re.search(r'\b(?:hey|nay|oi)\s+sora\b|\bsora\s+oi\b', norm)
                if match and time.monotonic() - last > 5:
                    last = time.monotonic()
                    after = text[match.end():].strip(' ,.!?')
                    self.notify('fusion_hotword', text=after)
        except Exception as exc:
            self.notify('fusion_voice_error', error=_flat(exc, 200))
        finally:
            self.hotword_stop.set()

    def tts_status(self):
        try:
            from sora.voice.text_to_speech import TextToSpeech
            if self.speaker is None:
                self.speaker = TextToSpeech()
            return {'ok': True, 'available': bool(self.speaker.is_available()),
                    'reason': 'Cần Piper và mô hình giọng Việt do người dùng cung cấp.'}
        except Exception as exc:
            return {'ok': True, 'available': False, 'reason': _flat(exc)}

    def speak(self, text):
        status = self.tts_status()
        if not status['available']:
            return {'ok': False, 'error': status['reason']}
        self.speaker.speak(_flat(text, 1800))
        return {'ok': True}

    def close(self):
        self.hotword_stop.set()
        with self.lock:
            if self.recorder:
                try:
                    self.recorder.stop()
                    self.recorder.close()
                except Exception:
                    pass
                self.recorder = None
            self.ptt_active = False
        if self.speaker:
            self.speaker.stop()


class FusionRuntime:
    def __init__(self, db_path=None, notification=None):
        self.db = Path(db_path or os.environ.get('SORA_FUSION_DB') or DEFAULT_DB)
        self.db.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.cancellation = threading.Event()
        self.notify = notification or (lambda *args, **kw: None)
        self.voice = FusionVoice(self.notify)
        with self._db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS fusion_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS fusion_plans(
                id INTEGER PRIMARY KEY, title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS fusion_steps(
                id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL, seq INTEGER NOT NULL,
                kind TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
                result TEXT NOT NULL DEFAULT '', FOREIGN KEY(plan_id) REFERENCES fusion_plans(id));
            ''')
        saved = self.get_setting('model', '')
        if saved and saved in _ollama_models():
            from sora.ai import model_client
            model_client.MODEL_NAME = saved

    @contextmanager
    def _db(self):
        con = sqlite3.connect(str(self.db), timeout=10)
        con.execute('PRAGMA busy_timeout=10000')
        con.execute('PRAGMA foreign_keys=ON')
        try:
            yield con
            con.commit()
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()

    def get_setting(self, key, default=None):
        with self.lock, self._db() as db:
            result = db.execute('SELECT value FROM fusion_settings WHERE key=?', (key,)).fetchone()
            return result[0] if result else default

    def set_setting(self, key, value):
        with self.lock, self._db() as db:
            db.execute('INSERT OR REPLACE INTO fusion_settings(key,value) VALUES(?,?)',
                       (str(key),str(value)))

    def model_name(self):
        from sora.ai import model_client
        return model_client.MODEL_NAME

    def models(self):
        return {'ok': True, 'models': _ollama_models(), 'selected': self.model_name()}

    def change_model(self, selected):
        if not isinstance(selected, str) or selected not in _ollama_models():
            return {'ok': False, 'error': 'Chỉ chọn mô hình Ollama đã cài trên máy.'}
        from sora.ai import model_client
        model_client.MODEL_NAME = selected
        self.set_setting('model', selected)
        return {'ok': True, 'selected': selected}

    @staticmethod
    def _allowed_roots():
        roots = [Path.home() / 'Desktop', Path.home() / 'Documents',
                 Path.home() / 'Downloads', Path.home() / 'Pictures']
        return [p.resolve() for p in roots if p.is_dir()]

    def find_files(self, query, selected_root='', max_seconds=4.0):
        """Filename-only, bounded, ignores junctions and filesystem contents."""
        text = _flat(query, 120).casefold()
        if len(text) < 2:
            return {'ok': False, 'error': 'Nhập ít nhất hai ký tự để tìm tên file.'}
        roots = self._allowed_roots()
        if selected_root:
            p = Path(selected_root).expanduser().resolve()
            if not any(p == r or r in p.parents for r in roots):
                return {'ok': False, 'error': 'Chỉ tìm trong Desktop, Documents, Downloads hoặc Pictures.'}
            roots = [p]
        deadline = time.monotonic() + min(8, max(1.0, max_seconds))
        found = []
        for root in roots:
            for folder, dirs, files in os.walk(root, followlinks=False):
                if self.cancellation.is_set() or time.monotonic() > deadline:
                    break
                dirs[:] = [d for d in dirs if not d.startswith('.') and
                           not (Path(folder)/d).is_symlink()]
                for name in dirs + files:
                    if text in name.casefold():
                        found.append(str(Path(folder) / name))
                        if len(found) >= MAX_RESULTS:
                            return {'ok': True, 'files': found, 'limited': True}
            if self.cancellation.is_set() or time.monotonic() > deadline:
                break
        return {'ok': True, 'files': found, 'limited': time.monotonic() > deadline,
                'cancelled': self.cancellation.is_set()}

    def create_plan(self, title, steps):
        title = _flat(title, 150)
        if len(title) < 3 or not isinstance(steps, list) or not 1 <= len(steps) <= 20:
            return {'ok': False, 'error': 'Nhập mục tiêu và từ 1 đến 20 bước.'}
        parsed = []
        for raw in steps:
            kind = str(raw.get('kind','manual')) if isinstance(raw,dict) else 'manual'
            target = _flat(raw.get('target','') if isinstance(raw,dict) else raw, 500)
            if kind not in ('manual','find','verify') or not target:
                return {'ok': False, 'error': 'Mỗi bước phải là ghi chú, tìm file hoặc xác minh.'}
            parsed.append((kind,target))
        with self.lock, self._db() as db:
            cur = db.execute('INSERT INTO fusion_plans(title) VALUES(?)', (title,))
            number = int(cur.lastrowid)
            db.executemany('INSERT INTO fusion_steps(plan_id,seq,kind,target) VALUES(?,?,?,?)',
                           ((number,i+1,k,t) for i,(k,t) in enumerate(parsed)))
        return {'ok': True, 'plan_id': number}

    def plans(self):
        with self.lock, self._db() as db:
            rows = db.execute('''SELECT p.id,p.title,p.status,COUNT(s.id),
                                 SUM(CASE WHEN s.status='done' THEN 1 ELSE 0 END)
                                 FROM fusion_plans p LEFT JOIN fusion_steps s ON s.plan_id=p.id
                                 GROUP BY p.id ORDER BY p.id DESC LIMIT 20''').fetchall()
        return {'ok': True, 'plans': [dict(id=x[0],title=x[1],status=x[2],
                                         total=x[3],done=x[4] or 0) for x in rows]}

    def plan(self, plan_id):
        with self.lock, self._db() as db:
            p = db.execute('SELECT id,title,status,created FROM fusion_plans WHERE id=?',
                           (int(plan_id),)).fetchone()
            if p is None:
                return {'ok': False, 'error': 'Không tìm thấy kế hoạch.'}
            steps = db.execute('SELECT id,seq,kind,target,status,result FROM fusion_steps '
                               'WHERE plan_id=? ORDER BY seq',(int(plan_id),)).fetchall()
        return {'ok': True, 'id':p[0], 'title':p[1], 'status':p[2], 'created':p[3],
                'steps':[dict(id=s[0],seq=s[1],kind=s[2],target=s[3],status=s[4],result=s[5])
                         for s in steps]}

    def approve_plan(self, plan_id):
        with self.lock, self._db() as db:
            change = db.execute("UPDATE fusion_plans SET status='active' WHERE id=? AND status='draft'",
                                (int(plan_id),))
        return {'ok':change.rowcount==1}

    def finish_step(self, plan_id, step_id, evidence):
        evidence = _flat(evidence, 600)
        if len(evidence) < 3:
            return {'ok': False, 'error':'Cần ghi kết quả kiểm chứng trước khi hoàn thành bước.'}
        with self.lock, self._db() as db:
            p = db.execute('SELECT status FROM fusion_plans WHERE id=?', (int(plan_id),)).fetchone()
            if p is None or p[0] != 'active':
                return {'ok': False, 'error':'Kế hoạch chưa được duyệt.'}
            result = db.execute('''UPDATE fusion_steps SET status='done',result=?
                                  WHERE id=? AND plan_id=? AND status='pending' ''',
                                (evidence,int(step_id),int(plan_id)))
            if result.rowcount:
                undone = db.execute("SELECT count(*) FROM fusion_steps WHERE plan_id=? AND status!='done'",
                                    (int(plan_id),)).fetchone()[0]
                if not undone:
                    db.execute("UPDATE fusion_plans SET status='done' WHERE id=?",(int(plan_id),))
        return {'ok':result.rowcount==1}

    def cancel(self, plan_id=None):
        self.cancellation.set()
        if plan_id is not None:
            with self.lock, self._db() as db:
                db.execute("UPDATE fusion_plans SET status='cancelled' WHERE id=? AND status!='done'",
                           (int(plan_id),))
        return {'ok':True, 'cancelled':True}

    def report(self, plan_id):
        p = self.plan(plan_id)
        if not p.get('ok'):
            return p
        total = len(p['steps'])
        done = sum(x['status']=='done' for x in p['steps'])
        return {'ok':True,'id':p['id'],'title':p['title'],'status':p['status'],
                'total':total,'done':done,'progress':round(100*done/max(1,total)),
                'verified':[{'step':x['seq'],'result':x['result']}
                            for x in p['steps'] if x['status']=='done']}

    def dispatch(self, action, data):
        data = data if isinstance(data, dict) else {}
        try:
            if action == 'status':
                return {'ok':True, 'model':self.model_name(),
                        'tts_auto':self.get_setting('tts_auto', 'off') == 'on',
                        'hotword':bool(self.voice.hotword_thread and self.voice.hotword_thread.is_alive()),
                        'voice':self.voice.tts_status()}
            if action == 'models': return self.models()
            if action == 'model_select': return self.change_model(data.get('name'))
            if action == 'file_find':
                self.cancellation.clear()
                return self.find_files(data.get('query',''),data.get('root',''))
            if action == 'plan_create': return self.create_plan(data.get('title',''),data.get('steps'))
            if action == 'plans': return self.plans()
            if action == 'plan': return self.plan(data.get('id'))
            if action == 'plan_approve': return self.approve_plan(data.get('id'))
            if action == 'step_finish':
                return self.finish_step(data.get('id'),data.get('step'),data.get('evidence',''))
            if action == 'plan_report': return self.report(data.get('id'))
            if action == 'cancel': return self.cancel(data.get('id'))
            if action == 'voice_start': return self.voice.start()
            if action == 'voice_end': return self.voice.stop()
            if action == 'hotword_on': return self.voice.hotword(True)
            if action == 'hotword_off': return self.voice.hotword(False)
            if action == 'speak': return self.voice.speak(data.get('text',''))
            if action in ('tts_auto_on','tts_auto_off'):
                enabled = action == 'tts_auto_on'
                self.set_setting('tts_auto','on' if enabled else 'off')
                return {'ok':True,'enabled':enabled}
        except (OSError, RuntimeError, ValueError, ImportError, sqlite3.Error) as exc:
            return {'ok':False, 'error':_flat(exc,350)}
        return {'ok':False,'error':'Thao tác SORA không được hỗ trợ.'}

    def close(self):
        self.voice.close()
