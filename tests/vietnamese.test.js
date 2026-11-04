'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { TRAY } = require('../src/main/labels');

const root = path.resolve(__dirname, '..');
const lines = () => import(pathToFileURL(path.join(root, 'src', 'renderer', 'js', 'lines.js')).href);

function missingKeys(example, translated, prefix = '') {
  const missing = [];
  for (const [key, value] of Object.entries(example)) {
    if (!Object.hasOwn(translated, key)) {
      missing.push(prefix + key);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      missing.push(...missingKeys(value, translated[key], prefix + key + '.'));
    }
  }
  return missing;
}

test('Các mục menu khay hệ thống đều có nhãn tiếng Việt', () => {
  assert.equal(TRAY.vi.name, 'Tiếng Việt');
  assert.deepEqual(missingKeys(TRAY.en, TRAY.vi), []);
  assert.match(TRAY.vi.motion, /Hoạt ảnh/);
  assert.match(TRAY.vi.talk, /Trò chuyện/);
});

test('Tất cả các nhóm lời thoại RT có bản dịch tiếng Việt', async () => {
  const { LINES, linesFor } = await lines();
  assert.deepEqual(missingKeys(LINES.en, LINES.vi), []);
  assert.match(LINES.vi.motion.line, /Windows đang tắt hiệu ứng hoạt ảnh/);
  assert.match(LINES.vi.motion.full, /chuyển động/);
  assert.equal(LINES.vi.chat.note, ''); // Sơn yêu cầu không hiện dòng chú thích dưới chat
  assert.match(linesFor('vi', 'codex').welcome.connect, /Codex/);
  assert.match(linesFor('vi', 'agy').welcome.connect, /Antigravity/);
});

test('Cấu hình cũ không buộc Sora hiển thị tiếng Anh', () => {
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  const config = fs.readFileSync(path.join(root, 'src', 'main', 'config.js'), 'utf8');
  assert.match(main, /if \(SORA_MODE\) return 'vi'/);
  assert.match(config, /lang: 'vi'/);
});

test('Bài trình diễn và câu trả lời đều dùng bản địa hóa tiếng Việt', () => {
  const steps = require('../scripts/demo-sequence')('vi');
  const user = steps.find(([, item]) => item.hook_event_name === 'UserPromptSubmit')[1];
  assert.match(user.prompt, /Thêm API/);
  const complete = steps.find(([, item]) => item.hook_event_name === 'Stop')[1];
  assert.match(complete.last_assistant_message, /Đã thêm/);
});
