'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const actionIds=['hide','lie','sit','stand','wave','dance','gaze'];
test('HIDE sector becomes ACTION and keeps eight main segments',()=>{
 const html=read('src/wheel/index.html');
 const js=read('src/wheel/wheel.js');
 assert.match(html,/data-action="actions" aria-label="Hành động"/);
 assert.doesNotMatch(html,/<button[^>]+data-action="hide"/);
 assert.match(js,/\['actions', 'ACTION'\]/);
 assert.equal([...html.matchAll(/<button class="sector" /g)].length,8);
});
test('seven action targets each have an aria label and use one shared transparent native wheel',()=>{
 const html=read('src/wheel/index.html');
 const js=read('src/wheel/wheel.js');
 const css=read('src/wheel/wheel.css');
 const main=read('src/main/main.js');
 assert.match(html,/id="action-submenu" role="menu"/);
 for(const action of actionIds){
  assert.match(html,new RegExp(`data-character-action="${action}" aria-label=`));
  assert.match(main,new RegExp(`case 'action-${action}':`));
 }
 assert.match(js,/function drawActions\(/);
 assert.match(js,/function setActionsOpen\(/);
 assert.match(css,/\[data-submenu='actions'\] \.action-submenu/);
 assert.match(main,/const layout = calculateWheelLayout\(point, area\)/);
 assert.doesNotMatch(main,/function showActionPopup/);
});
test('hidden arc cannot intercept menu pointer events when switching menus',()=>{
 const css=read('src/wheel/wheel.css');
 const js=read('src/wheel/wheel.js');
 assert.match(css,/\.game-submenu__hit,\.action-submenu__hit \{ pointer-events:none; \}/);
 assert.match(css,/\[data-submenu='games'\] \.game-submenu__hit \{ pointer-events:all; \}/);
 assert.match(css,/\[data-submenu='actions'\] \.action-submenu__hit \{ pointer-events:all; \}/);
 assert.match(js,/setGamesOpen\(false\);setActionsOpen\(false\);/);
 assert.match(js,/const choices = gamesOpen \?/);
});
test('actions reuse existing RT stances and validated animation names',()=>{
 const app=read('src/renderer/js/app.js');
 const acts=read('src/renderer/js/acting.js');
 const main=read('src/main/main.js');
 assert.match(main,/case 'action-hide': toggleVisible\(\)/);
 assert.match(main,/case 'action-lie': sendCommand\('lie'\)/);
 assert.match(app,/case 'action-sit'/);
 assert.match(app,/sora\.sitOn\(seat\)/);
 assert.match(app,/case 'action-stand'/);
 assert.match(app,/sora\.teleport\(sora\.spot\('post'\),\{stance:'stand'\}\)/);
 assert.match(app,/sora\.playRequestedAct\(act\)/);
 for(const action of ['wave','dance','gaze']) assert.match(acts,new RegExp(`\\b${action}: \\{`));
});
test('README keeps real Sora photos and distinguishes Chromium menu preview',()=>{
 const readme=read('README.md');
 assert.match(readme,/docs\/sora-overview\.png/);
 assert.match(readme,/docs\/sora-actions-preview\.png/);
 assert.match(readme,/05\/11\/2026/);
 assert.match(readme,/Chromium/);
});
