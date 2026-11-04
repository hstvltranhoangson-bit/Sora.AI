const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const src = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('a perch 60 frame sequence starts at zero on entering a seat', async () => {
  const { frameAt, frameFromEntry, PERCH_FRAME } = await import(pathToFileURL(path.join(root, 'src/renderer/js/sora-perch-60.mjs')));
  assert.equal(frameFromEntry(101234, 101234), 0);
  assert.equal(frameFromEntry(101284, 101234), 0);
  assert.equal(frameFromEntry(101334, 101234), 1);
  assert.equal(frameFromEntry(999, 1000), 0);
  assert.equal(frameFromEntry(101234 + 5000, 101234), 0);
  assert.equal(frameAt(5000), 0);
  assert.equal(PERCH_FRAME.count, 60);
});

test('60-frame perch renderer uses compact-safe shader deformation, independent of original sitting art', () => {
  const perch = src('src/renderer/js/sora-perch-60.mjs');
  const shader = src('src/renderer/js/seated-renderer.js');
  assert.match(perch, /new SeatedRenderer\(this\.canvas,this\.frameCanvas,\{compactPerch:true\}\)/);
  assert.match(shader, /uniform float uCompactPerch;/);
  assert.match(shader, /if \(uCompactPerch > 0\.5\)/);
  assert.match(shader, /gl\.uniform1f\(u\.uCompactPerch, this\.compactPerch \? 1 : 0\)/);
  assert.match(shader, /float face = 1\.0 - smoothstep\(/);
  assert.match(shader, /q \+= \(1\.0 - face\) \* grain/);
  assert.match(shader, /if \(uLying > 0\.5\)/); // leave lying shader path intact
});

test('landing gesture does not squash or widen the head more than 2%', async () => {
  const { ACTS } = await import(pathToFileURL(path.join(root, 'src/renderer/js/acting.js')));
  for (const [, pose] of ACTS.plop.keys) {
    assert.ok(Math.abs((pose.sy ?? 1) - 1) <= .02, 'sitting animation scales Y too much');
    assert.ok(Math.abs((pose.sx ?? 1) - 1) <= .02, 'sitting animation scales X too much');
  }
});

test('README includes a current update and authentic Sora screenshots', () => {
  const readme = src('README.md');
  assert.match(readme, /04\/11\/2026/);
  assert.match(readme, /ảnh chụp thật/i);
  assert.match(readme, /docs\/sora-demo\.png/);
  assert.match(readme, /Cờ Nối 4/);
  assert.match(readme, /Thám Tử/);
});
