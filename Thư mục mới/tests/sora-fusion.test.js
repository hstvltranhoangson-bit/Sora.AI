'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('private Python bridge is still the only model client; fusion requests are allowlisted',()=>{
 const s=read('src/main/sora-fusion.js');
 assert.match(s,/backend\(\)\?\.request\('fusion'/);
 assert.match(s,/whitelist/);
 assert.doesNotMatch(s,/shell\.openExternal\(.*text/);
});
test('model switches only between installed Ollama tags, no cloud uploads',()=>{
 const s=read('backend/sora/ai/fusion_runtime.py');
 assert.match(s,/selected not in _ollama_models\(\)/);
 assert.match(s,/urllib\.request\.ProxyHandler\(\{\}\)/);
});
test('one extra perch canvas, original seated body and rendering retained',()=>{
 const s=read('src/renderer/js/sora.js');
 const h=read('src/renderer/index.html');
 assert.match(s,/this\.perch60\.sync/);
 assert.match(s,/new SoraPerch60/);
 assert.match(h,/id="sora-perch-60"/);
 assert.match(s,/this\.seatGpu/);
});
test('60-frame assets from user provided archive retain their original dimensions',()=>{
 for(const name of ['sora-perch-60.png','sora-perch-music-60.png']){
  const data=fs.readFileSync(path.join(root,'assets/sora',name));
  assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16),11760);
  assert.equal(data.readUInt32BE(20),384);
 }
});
test('perch frame loop uses 60 frames at 12 fps',async()=>{
 const file=pathToFileURL(path.join(root,'src/renderer/js/sora-perch-60.mjs')).href;
 const {frameAt}=await import(file);
 assert.equal(frameAt(0),0);
 assert.equal(frameAt(1000),12);
 assert.equal(frameAt(5000),0);
});
test('native media helper optional and no system-wide keyboard hooks',()=>{
 const s=read('src/main/sora-fusion.js');
 assert.match(s,/SORA_MEDIA_HELPER/);
 assert.match(s,/existsSync\(binary\)/);
 assert.doesNotMatch(s,/globalShortcut/);
});
test('Escape stop and notifications wired to existing RT chat',()=>{
 const s=read('src/renderer/js/app.js');
 assert.match(s,/case 'fusion_text'/);
 assert.match(s,/host\.chatStop\(chat\.turn\)/);
});
