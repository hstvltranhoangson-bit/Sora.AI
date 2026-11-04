'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { showInteractiveMenu } = require('../src/main/menu-interaction');

function fakeOverlay() {
  const events = [];
  return {
    events,
    isDestroyed: () => false,
    setIgnoreMouseEvents: (on) => events.push(['ignore', on]),
    setAlwaysOnTop: (...args) => events.push(['onTop', ...args]),
    setFocusable: (on) => events.push(['focusable', on]),
    focus: () => events.push(['focus']),
  };
}

test('menu focuses a normal window temporarily and restores topmost click-through avatar', () => {
  const overlay = fakeOverlay();
  let popupOptions;
  let closed = 0;
  const menu = { popup(options) { popupOptions = options; } };
  assert.equal(showInteractiveMenu(menu, overlay, () => { closed++; }), true);
  assert.equal(popupOptions.window, overlay);
  assert.deepEqual(overlay.events.slice(0, 4), [
    ['ignore', true], ['onTop', false], ['focusable', true], ['focus'],
  ]);
  popupOptions.callback();
  popupOptions.callback();
  assert.equal(closed, 1);
  assert.deepEqual(overlay.events.slice(-3), [
    ['ignore', true], ['focusable', false], ['onTop', true, 'screen-saver'],
  ]);
});

test('failed menu popup still restores original overlay', () => {
  const overlay = fakeOverlay();
  let restored = false;
  assert.throws(() => showInteractiveMenu({ popup: () => { throw new Error('native popup unavailable'); } },
    overlay, () => { restored = true; }), /native popup unavailable/);
  assert.equal(restored, true);
  assert.deepEqual(overlay.events.at(-1), ['onTop', true, 'screen-saver']);
});

test('Sora chat no longer displays the unwanted AI disclaimer', () => {
  const vi = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'vi.js'), 'utf8');
  assert.doesNotMatch(vi, /Câu trả lời do AI Ollama trên máy tính tạo ra/);
  assert.match(vi, /note: ''/);
});

test('screen submenu is available even on a laptop with one display', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.doesNotMatch(main, /enabled: displays\.length > 1/);
  assert.match(main, /Căn chỉnh lại vị trí và vùng nhấp của Sora/);
});

test('launcher uses existing local Python and Node/Electron without copying runtime', () => {
  const batch = fs.readFileSync(path.join(__dirname, '..', 'Sora.bat'), 'utf8');
  assert.doesNotMatch(batch, /SORA_PORTABLE|portable\.mode|PreparePortable|runtime\\python/);
  assert.match(batch, /node_modules\\electron\\dist\\electron\.exe/);
  assert.match(batch, /\.venv\\Scripts\\python\.exe/);
  assert.match(batch, /data\\memory\.sqlite3/);
});

test('required RT images are present and missing fonts cannot stop boot', () => {
  const root = path.join(__dirname, '..');
  const imageDir = path.join(root, 'assets', 'sora');
  const required = [
    'sora-full.png',
    ...['grin','laugh','eyes','many','look'].map(name => `cutin-${name}.png`),
    ...['grab','mouth1','mouth2','mouth3','wave1','wave2','wave3','smear','happy'].map(name => `intro-${name}.webp`),
  ];
  for (const file of required) {
    assert.ok(fs.statSync(path.join(imageDir, file)).size > 0, `Thiếu ảnh RT: ${file}`);
  }
  const app = fs.readFileSync(path.join(root, 'src', 'renderer', 'js', 'app.js'), 'utf8');
  assert.match(app, /loadOptionalFont\('600 16px/);
  assert.match(app, /document\.fonts\.load\(specification\)\.catch/);
});

test('launching Sora twice reveals the existing RT character and debug passes into Electron', () => {
  const root = path.join(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  const batch = fs.readFileSync(path.join(root, 'Sora.bat'), 'utf8');
  assert.match(main, /function revealExistingSora\(\)/);
  assert.match(main, /config\.save\(\{ visible: true \}\)/);
  assert.match(main, /sendCommand\('stow', \{ on: false \}\)/);
  assert.match(main, /app\.on\('second-instance', \(\) => \{/);
  assert.match(main, /process\.env\.SORA_DEBUG === '1'/);
  assert.match(batch, /set "SORA_DEBUG=1"/);
});

test('wheel menu uses a continuously rotating circular green-purple ring and a gamepad', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src', 'wheel', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src', 'wheel', 'wheel.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'src', 'wheel', 'wheel.js'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'src', 'main', 'main.js'), 'utf8');
  assert.match(html, /class="wheel__ring-spin"/);
  assert.match(html, /class="wheel__ring-arc wheel__ring-arc--top"/);
  assert.match(html, /class="wheel__ring-arc wheel__ring-arc--bottom"/);
  assert.match(html, /M12 100 A88 88 0 0 1 188 100/);
  assert.match(html, /M188 100 A88 88 0 0 1 12 100/);
  assert.doesNotMatch(html, /class="wheel__frame"/);
  assert.match(html, /data-action="games" aria-label="Trò chơi"/);
  assert.doesNotMatch(html, /title="Trò chơi"/, 'Native tooltip must not obscure the flyout');
  assert.match(main, /resizable: false/, 'The transparent menu must keep fixed bounds while hovering');
  assert.doesNotMatch(main, /function showGameFlyout\(/, 'There must not be a second Electron popup');
  assert.match(main, /const layout = calculateWheelLayout\(point, area\)/);
  assert.doesNotMatch(main, /resizeWheelForGames/, 'Never resize the native window while hovering GAME');
  assert.match(main, /ipcMain\.on\('wheel:ready'/, 'Renderer must request its initial layout');
  assert.match(css, /transform:scale\(1\); pointer-events:none;/, 'Only flyout buttons should catch pointer events');
  assert.doesNotMatch(html, /data-action="chess"/);
  assert.match(js, /\['games', 'GAME'\]/);
  assert.match(css, /\.wheel\[data-active='games'\]/);
  assert.match(css, /\.wheel__ring-spin/);
  assert.match(css, /animation:wheel-ring-spin 12s linear infinite/);
  assert.match(css, /wheel-ring-spin \{ to \{ transform:rotate\(360deg\)/);
  assert.match(css, /\.wheel__ring-arc--top \{ stroke:#21ff61; \}/);
  assert.match(css, /\.wheel__ring-arc--bottom \{ stroke:#9d42ff; \}/);
  assert.doesNotMatch(css, /\.wheel__frame/);
  assert.match(html, /class="game-submenu"/);
  assert.match(html, /data-game="chess"/);
  assert.match(html, /data-game="tictactoe"/);
  assert.match(css, /\.wheel-stage\[data-submenu='games'\] \.game-submenu/);
  assert.match(js, /pointerenter/);
  assert.doesNotMatch(js, /window\.soraWheel\?\.submenu\(open\)/);
  assert.match(main, /case 'game-chess': openChessWindow\('chess'\)/);
  assert.match(main, /case 'game-tictactoe': openChessWindow\('tictactoe'\)/);
  assert.doesNotMatch(main, /case 'games': setTimeout\(openGamesMenu/);
  assert.match(main, /calculateWheelLayout/);
  assert.doesNotMatch(main, /ipcMain\.on\('wheel:submenu'/);
  assert.match(main, /win\.loadURL\('sora:\/\/app\/src\/wheel\/index\.html\?'\+q\.toString\(\)\)/);

});

test('hidden Sora uses the approved transparent PNG unchanged, not a redrawn mask', async () => {
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {} });
  globalThis.window ??= { devicePixelRatio: 1 };
  globalThis.requestAnimationFrame ??= () => 1;
  const { pathToFileURL } = require('node:url');
  const { Chip, Mask, drawHiddenPortrait } = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'renderer', 'js', 'chip.js')).href);
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, key) { return target[key] ?? ((...args) => calls.push([key, ...args])); },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { style: {}, hidden: true, width: 0, height: 0, getContext: () => ctx };
  const chip = new Chip(canvas);
  chip.place(1280, 720);
  assert.ok(chip.contains(chip.face.x, chip.face.y), 'click the approved face to restore Sora');
  assert.ok(chip.contains(chip.face.x, chip.face.y + 18), 'floating white mouth is clickable at 78.4px');
  assert.equal(chip.contains(chip.face.x, chip.face.y + 53, 0), false,
    'transparent area outside hidden Sora remains click-through');
  assert.equal(chip.contains(800, 200), false, 'other desktop area stays click-through');
  assert.equal(chip.contains(chip.face.x - 100, chip.face.y + 65, 0), false,
    'old extra shard no longer creates a clickable region');
  const image = { complete: true, naturalWidth: 807, naturalHeight: 532 };
  chip.art = image;
  chip.show();
  chip.draw(performance.now() + 260, 60);
  assert.equal(chip.visible, true);
  assert.equal(canvas.hidden, false);
  assert.ok(calls.some(([kind, loaded]) => kind === 'drawImage' && loaded === image),
    'the renderer must paint the provided artwork directly');
  assert.equal(drawHiddenPortrait(ctx, 110, 79, 1, { image }), true);
  assert.ok(calls.filter(([kind]) => kind === 'drawImage').length >= 2);
  assert.notEqual(chip.draw, Mask.prototype.draw, 'sleep mask is a separate animation');
  const asset = path.join(__dirname, '..', 'assets', 'sora', 'sora-hidden.png');
  assert.deepEqual([...fs.readFileSync(asset).subarray(0, 8)], [137,80,78,71,13,10,26,10]);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'js', 'chip.js'), 'utf8'),
    /sora-hidden\.png/);
  chip.hide();
  assert.equal(canvas.hidden, true);
});
