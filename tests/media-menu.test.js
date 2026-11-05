'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(p)=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('main wheel replaces duplicated rest with MEDIA, retaining exactly eight sectors',()=>{
 const html=read('src/wheel/index.html');
 const js=read('src/wheel/wheel.js');
 const css=read('src/wheel/wheel.css');
 assert.equal([...html.matchAll(/<button class="sector"/g)].length,8);
 assert.match(html,/data-action="media" aria-label="Mở Media/);
 assert.doesNotMatch(html,/data-action="rest"/);
 assert.match(html,/data-character-action="lie" aria-label="Nằm nghỉ"/);
 assert.match(js,/\['media', 'MEDIA'\]/);
 assert.doesNotMatch(js,/\['rest', 'REST'\]/);
 assert.match(css,/\.sector\[data-action='media'\]/);
 assert.match(css,/\.wheel\[data-active='media'\]/);
});
test('wheel media action opens the built-in Sora player without toggle-closing it',()=>{
 const main=read('src/main/main.js');
 const fusion=read('src/main/sora-fusion.js');
 assert.match(main,/case 'media': fusionCenter\?\.openMini\(\); break;/);
 assert.match(fusion,/function openMini\(\)/);
 assert.match(fusion,/if \(mini && !mini\.isDestroyed\(\)\) \{\s*mini\.show\(\);\s*mini\.focus\(\);/);
 assert.match(fusion,/return \{ openDashboard, openMini, toggleMini, mediaStatus \}/);
 assert.match(main,/'wheel:action'/);
 assert.doesNotMatch(main,/case 'rest': sendCommand\('lie'\)/);
});
test('existing actions and game submenu remain available',()=>{
 const html=read('src/wheel/index.html');
 const js=read('src/wheel/wheel.js');
 for (const id of ['hide','lie','sit','stand','wave','dance','gaze'])
  assert.match(html,new RegExp(`data-character-action="${id}"`));
 assert.equal([...html.matchAll(/class="game-submenu__choice"/g)].length,8);
 assert.match(js,/function drawGames\(/);
 assert.match(js,/function drawActions\(/);
 assert.match(js,/if \(action === 'games'\) setGamesOpen\(true\)/);
});
test('README documents media usage and keeps real-Sora photo references',()=>{
 const readme=read('README.md');
 assert.match(readme,/Gọn menu chính, thêm Media/);
 assert.match(readme,/docs\/sora-overview\.png/);
 assert.match(readme,/docs\/sora-actions-preview\.png/);
});

test('fusion mini-player reuses its window; tray toggle still closes',()=>{
 const {createSoraFusion}=require('../src/main/sora-fusion.js');
 const wins=[];
 class FakeWindow {
  constructor(opts){this.opts=opts;this.closed=false;wins.push(this);this.webContents={};}
  removeMenu(){}
  loadFile(path){this.file=path;}
  once(event,handler){this.onceHandlers={...this.onceHandlers,[event]:handler};}
  on(event,handler){this.handlers={...this.handlers,[event]:handler};}
  isDestroyed(){return this.closed;}
  show(){this.showCount=(this.showCount||0)+1;}
  focus(){this.focusCount=(this.focusCount||0)+1;}
  close(){this.closed=true;this.handlers?.closed?.();}
 }
 const handlers=new Map();
 const fusion=createSoraFusion({
  app:{getPath:()=>'/tmp'},BrowserWindow:FakeWindow,
  ipcMain:{handle:(id,callback)=>handlers.set(id,callback)},
  backend:()=>null,overlay:()=>null,media:()=>false,
 });
 const first=fusion.openMini();
 assert.equal(wins.length,1);
 assert.match(first.file,/mini\.html$/);
 assert.strictEqual(fusion.openMini(),first);
 assert.equal(wins.length,1);
 assert.equal(first.showCount,1);
 assert.equal(first.focusCount,1);
 assert.equal(fusion.toggleMini(),false);
 assert.equal(first.closed,true);
 const second=fusion.openMini();
 assert.notStrictEqual(second,first);
 assert.equal(wins.length,2);
});
