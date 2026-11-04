'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const get = () => import(pathToFileURL(path.resolve(__dirname, '../src/renderer/js/perches.js')).href);

test('Thả kéo không khóa vị trí, trọng lực được cập nhật ngay lập tức', () => {
  const root = path.resolve(__dirname, '..');
  const sora = fs.readFileSync(path.join(root, 'src/renderer/js/sora.js'), 'utf8');
  assert.doesNotMatch(sora, /manualPlaceUntil/);
  assert.doesNotMatch(sora, /if \(now < this\.manualPlaceUntil\) return/);
  assert.match(sora, /this\.drop\(\)/);
  const behavior = sora.slice(sora.indexOf('  behave(now) {'), sora.indexOf('  wanderStep() {'));
  assert.ok(behavior.indexOf("if (this.stance === 'fall')") < behavior.indexOf('if (this.busy || this.dragging)'));
});

test('Đã có sprite ngồi riêng; không cần ép ngắn cẳng chân khi ngồi thanh tác vụ', () => {
  const root = path.resolve(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'assets/sora/sora-seated.png')));
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  assert.match(html, /id="seat-sprite"/);
});

test('Dáng ngồi dùng WebGL, nhịp hoạt ảnh RT thay cho ảnh tĩnh khi GPU sẵn sàng', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'src/renderer/js/sora.js'), 'utf8');
  assert.match(html, /<canvas id="seat-effects" class="sora__seat"/);
  assert.match(controller, /new SeatedRenderer\(this\.seatCanvas, this\.seatImage\)/);
  assert.match(controller, /this\.seatGpu\.draw\(this\.p, now\)/);
  assert.match(controller, /this\.seatImage\.style\.opacity = seated && !gpuReady/);
});

test('Shader ngồi đồng bộ màu, sao tóc, viền tím và độ động với sprite RT', () => {
  const root = path.resolve(__dirname, '..');
  const shader = fs.readFileSync(path.join(root, 'src/renderer/js/seated-renderer.js'), 'utf8');
  const original = fs.readFileSync(path.join(root, 'src/renderer/js/sprite.js'), 'utf8');
  for (const fragment of ['rgb2hsv', 'hsv2rgb', 'uGrade', 'uSparkle', 'uMisreg',
    'uRim', 'uBoil', 'uHair', 'uMane', 'uArmL', 'uArmR', 'uKickL', 'uKickR']) {
    assert.ok(shader.includes(fragment), `Shader ngồi thiếu ${fragment}`);
    assert.ok(original.includes(fragment), `Shader RT thiếu ${fragment}`);
  }
  assert.match(shader, /gl\.uniform1f\(u\.uGrade, p\.grade \?\? 1\)/);
  assert.match(shader, /gl\.uniform1f\(u\.uSparkle, p\.sparkle \?\? 1\)/);
  assert.match(shader, /gl\.uniform2f\(u\.uMisreg/);
  assert.match(shader, /gl\.uniform3f\(u\.uRim, 0\.48, 0\.24, 1\.0\)/);
  assert.match(shader, /sin\(t \* 1\.7/);
  assert.match(shader, /gl_FragColor = vec4\(col \+ uRim \* rim, min\(1\.0, alpha \+ rim\)\) \* uAlpha/);
  for (const effect of ['uSplit', 'uSil', 'uDissolve', 'uGlitchSeed']) {
    assert.ok(shader.includes(effect), `Dáng ngồi/nằm chưa hỗ trợ hiệu ứng ${effect}`);
    assert.ok(original.includes(effect), `Dáng đứng chưa hỗ trợ hiệu ứng ${effect}`);
  }
});

test('Chuyển tư thế mượt giữa đứng, ngồi và nằm, không đúp hình khi đã hoàn thành', async () => {
  const { poseCrossfade } = await get();
  assert.deepEqual(poseCrossfade('stand', 'sit', 0), { stand: 1, sit: 0, lie: 0 });
  const middle = poseCrossfade('stand', 'sit', 160);
  assert.ok(middle.stand < 1 && middle.sit < 1);
  assert.ok(middle.stand + middle.sit < 1, 'Không được cùng hiển thị 2 sprite ở 100%');
  assert.deepEqual(poseCrossfade('stand', 'sit', 320), { stand: 0, sit: 1, lie: 0 });
  assert.deepEqual(poseCrossfade('sit', 'lie', 320), { stand: 0, sit: 0, lie: 1 });
  assert.deepEqual(poseCrossfade('lie', 'stand', 320), { stand: 1, sit: 0, lie: 0 });
});

test('Không trộn dáng ngồi cũ lên ảnh RT ngồi và chỉ có một bộ điều khiển opacity', () => {
  const root = path.resolve(__dirname, '..');
  const sora = fs.readFileSync(path.join(root, 'src/renderer/js/sora.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/renderer/styles/sora.css'), 'utf8');
  assert.match(sora, /stance === 'sit' && !this\.seatReady \? 1 : 0/);
  assert.match(sora, /this\.seatReady \? 'stand' : 'sit'/);
  assert.match(sora, /const perched = this\.perch \|\|/);
  assert.match(sora, /this\.poseTransition = \{ from: 'stand', to: pose/);
  assert.match(css, /\.sora__sprite\s*\{[^}]+transition: none/s);
  assert.match(css, /\.sora__seat\s*\{[^}]+transition: none/s);
});

test('Tên trong giao diện chơi cờ được đổi, hội thoại vẫn tự nhiên', () => {
  const root = path.resolve(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'src/games/chess/index.html'), 'utf8');
  const chess = fs.readFileSync(path.join(root, 'src/games/chess/chess.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  assert.match(page, /<title>Sora<\/title>/);
  assert.match(page, />Line <small id="player-piece">QUÂN TRẮNG/);
  assert.match(page, />Sora <small id="sora-piece">QUÂN ĐỎ/);
  assert.doesNotMatch(page, /Tinh nghịch|Cờ vua cùng anh/);
  assert.doesNotMatch(page, /id="mood"/);
  assert.match(chess, /'Line' : 'Sora'/);
  assert.match(main, /title: 'Sora'/);
});

test('Gập khớp gối trên taskbar, giữ nguyên chiều dài cẳng chân và hông bám mép', async () => {
  const { taskbarKneeBend } = await get();
  for (const gap of [40, 48, 60, 80]) {
    for (const scale of [0.4, 0.6, 0.8, 1.0]) {
      const angle = taskbarKneeBend(gap, scale);
      assert.ok(angle >= 0 && angle <= Math.PI / 2);
      const belowHip = ((305 - 232) * 0.3 + (418 - 305) * Math.cos(angle)) * scale;
      assert.ok(belowHip <= gap - 8 || angle === Math.PI / 2,
        `Taskbar ${gap}px: chân vượt ${belowHip}px`);
    }
  }
});

test('Nhớ vùng anh vừa dời nhân vật ra và tránh vùng ấy khi chọn chỗ ngồi', async () => {
  const { isRecentlyDisplaced, chooseHorizontalPerch } = await get();
  const now = 200_000;
  const zone = { x: 500, y: 1000, radius: 300, until: now + 120_000 };
  assert.equal(isRecentlyDisplaced({ x: 540, y: 1020 }, [zone], now), true);
  assert.equal(isRecentlyDisplaced({ x: 540, y: 1020 }, [zone], now + 120_001), false);
  const bar = { id: 'taskbar', x: 0, y: 1020, w: 1920, h: 60 };
  const choice = chooseHorizontalPerch({ bar, mode: 'taskbar', random: () => 0.2,
    avoid: (x, y) => isRecentlyDisplaced({ x, y }, [zone], now) });
  assert.ok(choice);
  assert.equal(isRecentlyDisplaced({ x: choice.win.x + choice.dx, y: choice.win.y }, [zone], now), false);
});

test('Có thể chọn nhiều vị trí trên thanh tác vụ thay vì cố định một chỗ', async () => {
  const { chooseHorizontalPerch } = await get();
  const bar = { id: 'taskbar', x: 0, y: 1020, w: 1920, h: 60 };
  const first = chooseHorizontalPerch({ bar, random: () => 0.1 });
  const second = chooseHorizontalPerch({ bar, previous: { id: 'taskbar', dx: first.dx }, random: () => 0.85 });
  assert.equal(first.win.id, 'taskbar');
  assert.equal(second.win.id, 'taskbar');
  assert.ok(second.dx - first.dx > 130);
});

test('Sora ưu tiên khám phá cửa sổ có mép ngang vừa xuất hiện', async () => {
  const { chooseHorizontalPerch } = await get();
  const windows = [
    { id: 'old', x: 0, y: 230, w: 760, h: 500 },
    { id: 'new', x: 780, y: 300, w: 710, h: 460 },
  ];
  const selected = chooseHorizontalPerch({ windows,
    mode: 'surfaces', recentIds: ['new'], random: () => 0.32 });
  assert.equal(selected.win.id, 'new');
  const ignored = chooseHorizontalPerch({ windows,
    mode: 'surfaces', recentIds: ['new'], covered: (win) => win.id === 'new', random: () => 0.32 });
  assert.equal(ignored.win.id, 'old');
});

test('Dáng nằm có chỗ neo trên cửa sổ, khuôn mặt không bị uốn méo mạnh', () => {
  const root = path.resolve(__dirname, '..');
  const sora = fs.readFileSync(path.join(root, 'src/renderer/js/sora.js'), 'utf8');
  const shader = fs.readFileSync(path.join(root, 'src/renderer/js/seated-renderer.js'), 'utf8');
  assert.match(sora, /const surfaceY = ledge\?\.y \?\? this\.view\.floor/);
  assert.match(sora, /lieOn\(\{ win, dx \}, duration/);
  assert.match(sora, /window\.addEventListener\('mousedown'/);
  assert.match(shader, /float face = 1\.0 - smoothstep\(0\.16, 0\.25/);
  assert.match(shader, /float torso = smoothstep/);
  assert.match(shader, /float upperFoot = foot/);
});

test('Ưu tiên mép cửa sổ còn trống, tránh điểm bị che và màn hình không có thanh tác vụ đáy', async () => {
  const { chooseHorizontalPerch } = await get();
  const wins = [
    { id: 1, x: 0, y: 250, w: 700, h: 500 },
    { id: 2, x: 720, y: 330, w: 650, h: 350 },
  ];
  const bar = { id: 'taskbar', x: 0, y: 1020, w: 1920, h: 60 };
  const next = chooseHorizontalPerch({ windows: wins, bar, mode: 'surfaces',
    covered: (win) => win.id === 1, random: () => 0.5 });
  assert.equal(next.win.id, 2);
  assert.ok(next.dx > 65 && next.dx < 585);
  const narrow = chooseHorizontalPerch({ bar: { ...bar, h: 0 } });
  assert.equal(narrow, null);
});

test('Trình khởi chạy dùng EXE, không phụ thuộc VBS, giữ --debug', () => {
  const root = path.resolve(__dirname, '..');
  const bat = fs.readFileSync(path.join(root, 'Sora.bat'), 'utf8');
  const native = fs.readFileSync(path.join(root, 'tools', 'native_launcher', 'main.go'), 'utf8');
  assert.match(bat, /Sora\.exe/);
  assert.doesNotMatch(bat, /wscript\.exe|Sora\.vbs/i);
  assert.match(bat, /--debug/);
  assert.match(native, /exec\.Command\(electron, root\)/);
  assert.match(native, /SORA_MEMORY_DB/);
  assert.equal(fs.existsSync(path.join(root, 'Sora.vbs')), false);
});
