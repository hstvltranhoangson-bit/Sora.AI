const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function load() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/renderer/js/sora-features.mjs')).href);
}
function avatar() {
  const calls = [];
  return {calls,stowed:false,dormant:false,hidden:false,dragging:false,busy:false,act:null,
    mode:'idle',wander:true,perform(x){calls.push(x);},towardCenter(){return 1;}};
}
test('RT actions use existing avatar, do not create a second character',async()=>{
  const {createSoraFeatures}=await load();
  const sora=avatar();
  const feature=createSoraFeatures(sora);
  assert.match(feature.command('/nhay'),/nhảy/);
  assert.match(feature.command('/vaytay'),/chào/);
  assert.deepEqual(sora.calls,['dance','wave']);
  assert.equal(feature.command('xin chào'),null);
});
test('window awareness is opt in and never stores title',async()=>{
  const {createSoraFeatures}=await load();
  let t=50000;
  const sora=avatar();
  const feature=createSoraFeatures(sora,{now:()=>t});
  const window={fg:1,kind:'code',wins:[{id:1}]};
  feature.observe(window);
  assert.equal(sora.calls.length,0);
  feature.command('/theodoi bat');
  feature.observe(window);
  assert.deepEqual(sora.calls,['listen']);
  t+=31000;
  feature.observe({fg:2,kind:'game',wins:[{id:2}]});
  assert.deepEqual(sora.calls,['listen','dance']);
  feature.command('/theodoi tat');
  t+=31000;
  feature.observe(window);
  assert.equal(sora.calls.length,2);
});
test('focus can be cancelled or expire and restores original wandering',async()=>{
  const {createSoraFeatures}=await load();
  let t=10000;
  const sora=avatar();
  const feature=createSoraFeatures(sora,{now:()=>t});
  feature.command('/taptrung 10');
  assert.equal(sora.wander,false);
  t+=600000;
  feature.tick();
  assert.equal(sora.wander,true);
  feature.command('/taptrung 15');
  feature.command('/taptrung tat');
  assert.equal(sora.wander,true);
});
