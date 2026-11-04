'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Nháy đúp không được tạo hai phiên chat đồng thời', async () => {
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  const { Chat } = await import(pathToFileURL(path.resolve(__dirname, '../src/renderer/js/chat.js')).href);
  let statusCalls = 0;
  let showCalls = 0;
  let openedBadge = '';
  let resolveStatus;
  const sora = { stowed: false, wake() {}, perform() {}, nextMove: 0, nextGaze: 0 };
  const panel = { chatInput: { focus() {} }, say(msg) { openedBadge = msg.badge; showCalls += 1; return true; } };
  const host = {
    onChatDelta() {},
    chatStatus() { statusCalls += 1; return new Promise((resolve) => { resolveStatus = resolve; }); },
    chatMemory: async () => [],
    openApps: async () => [],
    focusOverlay() {},
  };
  const brain = { t: { chat: {
    badge: 'AI cục bộ', hello: ['Chào Sơn'], again: ['Chào lại'], placeholder: 'Nhắn tin',
    send: 'Gửi', close: 'Đóng', noteTag: 'AI', note: 'AI cục bộ',
    offlineReady: 'Đang dùng bộ nhớ', offlineNote: 'Dữ liệu ngoại tuyến',
  } } };
  const chat = new Chat({ sora, panel, host, brain, voice: {} });
  const first = chat.start();
  const second = chat.start();
  assert.equal(statusCalls, 1);
  resolveStatus({ ok: true, offline: true, provider: 'offline', model: 'Sora · ký ức', local: true });
  await Promise.all([first, second]);
  assert.equal(showCalls, 1);
  assert.equal(openedBadge, 'AI · OFFLINE');
  assert.equal(chat.open, true);
  assert.equal(chat.starting, false);
});

test('Trạng thái AI không bị nhầm với trạng thái Internet của máy', async () => {
  const { Chat } = await import(pathToFileURL(path.resolve(__dirname, '../src/renderer/js/chat.js')).href);
  const panel = { current: { kind: 'chat' }, state: { textContent: '' } };
  const chat = new Chat({ panel, sora: {}, host: { onChatDelta() {} }, voice: {}, brain: {} });
  chat.open = true;
  chat.updateBackendStatus({ ok: true, provider: 'offline', offline: true });
  assert.equal(panel.state.textContent, 'AI · OFFLINE');
  chat.updateBackendStatus({ ok: true, provider: 'ollama', offline: false });
  assert.equal(panel.state.textContent, 'AI · ONLINE');
});

test('Tương tác chuột có khoảng chống nháy đúp và giao diện phục hồi khi bị lỗi', () => {
  const root = path.resolve(__dirname, '..');
  const sora = fs.readFileSync(path.join(root, 'src/renderer/js/sora.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.match(sora, /lastClickAt/);
  assert.match(sora, /now - this\.lastClickAt > 380/);
  assert.match(main, /rendererRecoveries/);
  assert.match(main, /overlay\.reload\(\)/);
  assert.match(main, /offline_ready/);
});
