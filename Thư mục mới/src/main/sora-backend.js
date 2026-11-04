'use strict';

// One private Python SORA backend per Electron instance. All messages use
// stdin/stdout UTF-8 JSONL; nothing is opened on localhost. Never expose this
// raw channel to a renderer or to a webpage.
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { StringDecoder } = require('node:string_decoder');

class SoraBackend extends EventEmitter {
  constructor({ root, python, memoryDb, spawnProcess = spawn, timeoutMs = 180000 } = {}) {
    super();
    this.root = root || path.resolve(__dirname, '..', '..');
    this.backendDir = path.join(this.root, 'backend');
    this.python = python || process.env.SORA_PYTHON || this.findPython();
    this.memoryDb = memoryDb || process.env.SORA_MEMORY_DB || null;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.seq = 0;
    this.pending = new Map();
    this.child = null;
    this.ready = false;
    this.stopping = false;
    this.lastError = '';
  }

  findPython() {
    const candidates = process.platform === 'win32'
      ? [path.join(this.backendDir, '.venv', 'Scripts', 'python.exe')]
      : [path.join(this.backendDir, '.venv', 'bin', 'python')];
    return candidates.find((f) => fs.existsSync(f)) || (process.platform === 'win32' ? 'python' : 'python3');
  }

  start() {
    if (this.child) return;
    this.stopping = false;
    this.lastError = '';
    if (this.memoryDb) {
      try {
        const seedFile = path.join(this.backendDir, 'data', 'memory_seed.sqlite3');
        const seed = fs.existsSync(seedFile)
          ? seedFile : path.join(this.backendDir, 'data', 'memory.sqlite3');
        fs.mkdirSync(path.dirname(this.memoryDb), { recursive: true });
        // Only seed on first launch. Never overwrite a user's learned facts,
        // approved examples or conversation history during app upgrades.
        if (!fs.existsSync(this.memoryDb) && fs.existsSync(seed)) fs.copyFileSync(seed, this.memoryDb, fs.constants.COPYFILE_EXCL);
      } catch (error) {
        this.lastError = `Không thể chuẩn bị bộ nhớ SQLite: ${error.message}`;
        return;
      }
    }
    let child;
    try {
      child = this.spawnProcess(this.python, ['-u', '-m', 'sora.bridge'], {
        cwd: this.backendDir,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8',
          ...(this.memoryDb ? { SORA_MEMORY_DB: this.memoryDb } : {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      this.lastError = error.message;
      return;
    }
    this.child = child;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (buffer.length > 2 * 1024 * 1024) {
        buffer = '';
        this.emit('warning', 'Hệ thống Sora gửi dữ liệu vượt giới hạn cho phép');
      }
      for (let pos; (pos = buffer.indexOf('\n')) !== -1;) {
        const line = buffer.slice(0, pos).trim();
        buffer = buffer.slice(pos + 1);
        if (!line) continue;
        try { this._onMessage(JSON.parse(line)); }
        catch (_) { this.emit('warning', 'Dữ liệu từ hệ thống Sora không đúng định dạng JSON'); }
      }
    });
    child.stderr.on('data', (chunk) => this.emit('stderr', String(chunk)));
    // Windows may close Python stdin before Electron receives the exit event.
    // A stream without an error listener would crash the entire main process
    // with an uncaught EPIPE when an in-flight request is written.
    child.stdin.on('error', (error) => {
      if (this.child !== child) return;
      this.lastError = `Mất kết nối với Python: ${error.message}`;
      this.ready = false;
      this._failAll(error);
      if (!this.stopping) this.emit('warning', this.lastError);
    });
    child.on('error', (error) => { this.lastError = error.message; this._failAll(error); });
    child.on('exit', (code) => {
      if (this.child !== child) return;
      this.child = null;
      this.ready = false;
      if (!this.stopping) {
        const error = new Error(this.lastError || `Tiến trình Python của Sora đã dừng (mã ${code})`);
        this._failAll(error);
        this.emit('offline', error);
      }
    });
  }

  _onMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'ready') { this.ready = true; this.emit('ready', message); return; }
    if (message.kind === 'notification') {
      // One-way, user-opted-in prompt. Never treated as a tool approval.
      this.emit('notification', message);
      return;
    }
    const task = this.pending.get(message.id);
    if (!task) return;
    if (message.kind === 'event') {
      try { task.onEvent?.(message); }
      catch (err) { this.emit('warning', `Lỗi xử lý sự kiện Sora: ${err.message}`); }
    } else if (message.kind === 'result') {
      this.pending.delete(message.id);
      clearTimeout(task.timer);
      task.resolve(message);
    }
  }

  _send(payload) {
    if (!this.child || this.child.stdin.destroyed || !this.child.stdin.writable) throw new Error(this.lastError || 'Hệ thống Python của Sora chưa kết nối');
    const line = JSON.stringify(payload);
    if (line.length > 1024 * 1024) throw new Error('Tin nhắn gửi Sora vượt giới hạn dung lượng');
    this.child.stdin.write(line + '\n', 'utf8');
  }

  request(method, params = {}, { onEvent, timeoutMs } = {}) {
    this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        try { this._send({ method: 'cancel', id }); } catch (_) { /* already offline */ }
        reject(new Error(`Sora xử lý yêu cầu ${method} quá thời gian cho phép`));
      }, timeoutMs || this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer, onEvent });
      try { this._send({ id, method, ...params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  cancel(id) {
    // id is the internal request id returned by requestHandle below.
    const task = this.pending.get(id);
    if (!task) return;
    this._send({ method: 'cancel', id });
  }

  requestHandle(method, params = {}, options = {}) {
    // Expose the internal request id for chat:stop without using renderer ids.
    const id = this.seq + 1;
    const promise = this.request(method, params, options);
    return { id, promise };
  }

  respondApproval(approvalId, allowed) {
    if (typeof approvalId !== 'string' || !/^[0-9a-f]{32}$/.test(approvalId)) return;
    try { this._send({ method: 'approve', approval_id: approvalId, allowed: allowed === true }); }
    catch (_) { /* fail-closed: backend approval expires */ }
  }

  _failAll(error) {
    for (const task of this.pending.values()) {
      clearTimeout(task.timer);
      task.reject(error);
    }
    this.pending.clear();
  }

  stop() {
    this.stopping = true;
    this._failAll(new Error('Hệ thống Python của Sora đang tắt'));
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.ready = false;
  }
}

module.exports = { SoraBackend };
