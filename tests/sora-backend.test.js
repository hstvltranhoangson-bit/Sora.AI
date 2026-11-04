'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { SoraBackend } = require('../src/main/sora-backend');

function fixture(options = {}) {
  const sent = [];
  let processRef;
  const backend = new SoraBackend({
    root: options.root || path.resolve(__dirname, '..'), python: 'test-python',
    memoryDb: options.memoryDb, timeoutMs: 500,
    spawnProcess(command, args, spawnOpts) {
      assert.equal(command, 'test-python');
      assert.deepEqual(args, ['-u', '-m', 'sora.bridge']);
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new Writable({ write(chunk, encoding, cb) {
        sent.push(JSON.parse(String(chunk)));
        cb();
      } });
      child.spawnOpts = spawnOpts;
      child.kill = () => child.emit('exit', 0);
      processRef = child;
      return child;
    },
  });
  return { backend, sent, get child() { return processRef; },
    emit: (msg) => processRef.stdout.write(JSON.stringify(msg) + '\n') };
}

test('streams chat events and completes one request', async () => {
  const h = fixture();
  const events = [];
  const { id, promise } = h.backend.requestHandle('chat', { text: 'Chào' }, { onEvent: e => events.push(e) });
  assert.equal(h.sent[0].method, 'chat');
  h.emit({ id, kind: 'event', event: 'delta', text: 'Xin ' });
  h.emit({ id, kind: 'event', event: 'delta', text: 'chào' });
  h.emit({ id, kind: 'result', ok: true, text: 'Xin chào' });
  assert.deepEqual((await promise).text, 'Xin chào');
  assert.deepEqual(events.map(x => x.text), ['Xin ', 'chào']);
  assert.equal(h.backend.pending.size, 0);
  h.backend.stop();
});

test('forwards approval and explicit cancellation as private protocol events', async () => {
  const h = fixture();
  const { id, promise } = h.backend.requestHandle('chat', { text: '/do mở ghi chú' });
  const ticket = '0123456789abcdef0123456789abcdef';
  h.backend.respondApproval(ticket, true);
  h.backend.cancel(id);
  assert.deepEqual(h.sent.at(-2), { method: 'approve', approval_id: ticket, allowed: true });
  assert.deepEqual(h.sent.at(-1), { method: 'cancel', id });
  h.emit({ id, kind: 'result', ok: false, error: 'cancelled' });
  assert.equal((await promise).error, 'cancelled');
  h.backend.stop();
});

test('does not trust malformed approval ids', () => {
  const h = fixture();
  h.backend.start();
  h.backend.respondApproval('not-a-ticket', true);
  assert.equal(h.sent.length, 0);
  h.backend.stop();
});

test('fails pending work when Python exits', async () => {
  const h = fixture();
  const promise = h.backend.request('status');
  h.child.emit('exit', 1);
  await assert.rejects(promise, /đã dừng/);
  assert.equal(h.backend.pending.size, 0);
});

test('recovers from EPIPE on Python stdin without an uncaught Electron crash', async () => {
  const h = fixture();
  const warnings = [];
  h.backend.on('warning', warning => warnings.push(warning));
  const promise = h.backend.request('chat', { text: 'Chào Sora' });
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
  h.child.stdin.emit('error', epipe);
  await assert.rejects(promise, /EPIPE/);
  assert.equal(h.backend.pending.size, 0);
  assert.match(warnings.at(-1), /Mất kết nối với Python/);
  h.child.emit('exit', 9009);
  assert.equal(h.backend.child, null);
});

test('preserves existing writable SQLite database on startup', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sora-backend-test-'));
  try {
    const dest = path.join(tmp, 'data', 'memory.sqlite3');
    fs.mkdirSync(path.dirname(dest));
    fs.writeFileSync(dest, 'do-not-overwrite');
    const h = fixture({ memoryDb: dest });
    h.backend.start();
    assert.equal(fs.readFileSync(dest, 'utf8'), 'do-not-overwrite');
    assert.equal(h.child.spawnOpts.env.SORA_MEMORY_DB, dest);
    h.backend.stop();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
