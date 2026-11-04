const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.join(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('taskbar always gets original sitClassic, even when music plays',async()=>{
 const {selectSitMode}=await import(pathToFileURL(path.join(root,'src/renderer/js/sora-sit-mode.mjs')));
 assert.equal(selectSitMode({id:'taskbar'},'222'), 'sitClassic');
 assert.equal(selectSitMode({id:22},'22'), 'perchMusic');
 assert.equal(selectSitMode({id:123},'22'), 'perchWindow');
 assert.equal(selectSitMode({id:123},null),'perchWindow');
 assert.equal(selectSitMode({id:123},null,false),'sitClassic');
});

test('60-frame pivot fixes hip to top of ledge for arbitrary screen positions',async()=>{
 const {perchArtworkBox,PERCH_ART}=await import(pathToFileURL(path.join(root,'src/renderer/js/sora-sit-mode.mjs')));
 for(const scale of [0.35,0.6,1,1.4])for(const atX of [80,320,900]) {
  const y=400,bob=-2;
  const b=perchArtworkBox({atX,ledgeY:y,scale,bob});
  assert.ok(Math.abs((b.x+b.width*PERCH_ART.hipX)-atX)<0.001);
  assert.ok(Math.abs((b.y+b.height*PERCH_ART.hipY)-(y+3+bob))<0.001);
 }
});

test('the existing seated render pipeline remains intact',()=>{
 const s=read('src/renderer/js/sora.js');
 const sh=read('src/renderer/js/seated-renderer.js');
 assert.match(s,/this\.seatGpu\.draw\(this\.p, now\)/);
 assert.match(s,/this\.sitVisualMode\(/);
 assert.match(s,/perch60\.sync\(/);
 assert.match(sh,/refreshTexture\(/);
 assert.match(sh,/uGlitch|uSparkle/);
 assert.match(s,/sitClassic/);
});

test('mini-player identity is sourced from its real HWND, not song playback',()=>{
 const s=read('src/main/sora-fusion.js');
 assert.match(s,/getNativeWindowHandle/);
 assert.match(s,/miniWindowId/);
 assert.doesNotMatch(read('src/fusion/mini.html'),/<canvas/i);
});

test('only one seated canvas per mode visible',()=>{
 const s=read('src/renderer/js/sora.js');
 assert.match(s,/!usePerch60/g);
 assert.match(s,/this\.perch60\?\.hide\(\)/);
});
