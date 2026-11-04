const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('right click only opens wheel after double-click window expires', async () => {
  const { createSoraRightClick } = await import(pathToFileURL(path.join(root,'src/renderer/js/sora-gestures.mjs')));
  let now=0, seq=0, pending=new Map(), opened=0, dialogs=0;
  const gesture=createSoraRightClick({single:()=>opened++,double:()=>dialogs++,delay:285,
    now:()=>now,schedule:(fn,ms)=>{const id=++seq; pending.set(id,fn); return id;},
    cancel:(id)=>pending.delete(id)});
  gesture.press(); now=150; gesture.press();
  assert.equal(dialogs,1);assert.equal(opened,0);assert.equal(pending.size,0);
  gesture.press();assert.equal(opened,0);
  [...pending.values()].forEach(fn=>fn());pending.clear();
  assert.equal(opened,1);assert.equal(dialogs,1);
});

test('all missing RT acts can be requested, and lying pose handled', async () => {
  const source=read('src/renderer/js/sora.js');
  const actions=read('src/renderer/js/acting.js');
  const commands=read('src/renderer/js/sora-features.mjs');
  assert.match(source,/async playRequestedAct\(name/);
  assert.match(source,/this\.setStance\('stand'\)/);
  for(const a of ['curious','split','flinch','spin','dance','wave','listen']) {
    assert.match(actions,new RegExp('\\b'+a+':\\s*\\{'));
  }
  for(const command of ['/tomo','/phantan','/giatminh','/xoay','/nhay','/vaytay','/langnghe']) {
    assert.ok(commands.includes(command),command);
  }
});

test('a lying Sora stands for a requested act and returns to the perch', async () => {
  globalThis.matchMedia ||= () => ({matches:false,addEventListener(){}});
  const { Sora } = await import(pathToFileURL(path.join(root,'src/renderer/js/sora.js')));
  const avatar=Object.create(Sora.prototype);
  const steps=[];
  avatar.stance='lie';avatar.perch={id:'taskbar',dx:170};avatar.pos={x:300,y:650};
  avatar.dragging=false;avatar.busy=false;avatar.hidden=false;avatar.stowed=false;avatar.dormant=false;
  avatar.wake=()=>{};avatar.endAct=()=>{};avatar.drawFrame=()=>{};
  avatar.setStance=(stance, options={})=>{ steps.push(stance);avatar.stance=stance;avatar.perch=options.perch||null; };
  avatar.perform=async(name)=>{steps.push(name);};avatar.perchWin=()=>({id:'taskbar'});
  avatar.canSit=()=>true;avatar.canLie=()=>true;
  assert.equal(await avatar.playRequestedAct('wave',1),true);
  assert.deepEqual(steps,['stand','wave','lie']);
});

test('hidden click can wake mask or biochip and portrait preserves its shape', () => {
  const app=read('src/renderer/js/app.js');
  const chip=read('src/renderer/js/chip.js');
  assert.match(app,/sora\.rouse\(\)/);
  assert.match(app,/pointerdown/);
  assert.match(app,/onMask\(\)/);
  assert.match(chip,/5\.5 \* Math\.sin\(now \/ 520\)/);
  assert.match(chip,/drawHiddenPortrait/);
  assert.doesNotMatch(chip,/this\.eyes\['blink/);
});

test('wheel close IPC, drag recovery and animated lying legs are wired', () => {
  assert.match(read('src/main/main.js'),/menu:close/);
  assert.match(read('src/preload.js'),/closeMenu/);
  assert.match(read('src/renderer/js/sora.js'),/e\.buttons === 0/);
  assert.match(read('src/renderer/js/seated-renderer.js'),/43\.0 \* swingA/);
});

test('Sora icon fallback is available; no original sprite is removed', () => {
  assert.ok(fs.existsSync(path.join(root,'assets/icons/sora.ico')));
  assert.ok(fs.existsSync(path.join(root,'assets/sora/sora-full.png')));
  assert.match(read('src/main/main.js'),/icon\.isEmpty\(\)/);
});
