'use strict';

// Runs the actual private Python JSONL process. Offline: never touches the
// user's shipped SQLite file and never executes Windows Desktop Agent tools.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('real Python bridge, isolated SQLite, status/history/local memory command', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'sora-real-'));
  try {
    const python = process.env.SORA_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    // Tạo DB rỗng trước để kiểm thử phiên sạch, không sao chép dữ liệu
    // memory_seed.sqlite3 thật của người dùng vào thư mục kiểm thử.
    const database = path.join(scratch, 'test.sqlite3');
    fs.writeFileSync(database, '');
    const input = [
      { id: 1, method: 'status' },
      { id: 2, method: 'history' },
      { id: 3, method: 'chat', text: '/memory' },
      { method: 'shutdown' },
    ].map(x => JSON.stringify(x)).join('\n') + '\n';
    const p = spawnSync(python, ['-u', '-m', 'sora.bridge'], {
      input, encoding: 'utf8', timeout: 15000,
      cwd: path.resolve(__dirname, '..', 'backend'),
      env: { ...process.env, SORA_MEMORY_DB: database, PYTHONIOENCODING: 'utf-8' },
    });
    assert.equal(p.status, 0, p.stderr || String(p.error));
    const out = p.stdout.trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(out[0].kind, 'ready');
    assert.equal(out.find(x => x.id === 1 && x.kind === 'result').model, 'qwen2.5:1.5b');
    assert.deepEqual(out.find(x => x.id === 2 && x.kind === 'result').messages, []);
    assert.equal(out.find(x => x.id === 3 && x.kind === 'result').ok, true);
    assert.ok(fs.existsSync(path.join(scratch, 'test.sqlite3')));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
