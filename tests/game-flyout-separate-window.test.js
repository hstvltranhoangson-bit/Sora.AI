'use strict';
// Regression tests retained under this original filename so overlay updates
// also replace previous assertions for the abandoned second-HWND approach.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=file=>fs.readFileSync(path.join(root,file),'utf8');

test('GAME uses ONE native window: no focus-changing popup and no hover resizing',()=>{
 const main=src('src/main/main.js');
 const wheel=main.slice(main.indexOf('function openWheel('),main.indexOf('function requestToolApproval'));
 assert.doesNotMatch(main,/showGameFlyout\(|gameFlyoutWindow|game-flyout\.html/);
 assert.doesNotMatch(wheel,/setSize\(|setBounds\(/);
 assert.match(wheel,/new BrowserWindow\(/);
 assert.match(main,/case 'game-chess': openChessWindow\('chess'\)/);
 assert.match(main,/case 'game-tictactoe': openChessWindow\('tictactoe'\)/);
});

test('the ZIP must include the matching DOM, layout, and in-renderer hover mechanism',()=>{
 const html=src('src/wheel/index.html');
 const js=src('src/wheel/wheel.js');
 const css=src('src/wheel/wheel.css');
 for (const id of ['wheel-stage','game-submenu','game-segments','game-arc']) assert.match(html,new RegExp(`id="${id}"`));
 assert.match(html,/data-game="chess"/);
 assert.match(html,/data-game="tictactoe"/);
 assert.match(js,/if \(action === 'games'\) setGamesOpen\(true\)/);
 assert.match(js,/window\.soraWheel\?\.action\('game-' \+ button\.dataset\.game\)/);
 assert.match(css,/\.wheel-stage\[data-submenu='games'\] \.game-submenu/);
 assert.match(css,/\.wheel-stage\[data-submenu='games'\] \.game-submenu__choice \{ pointer-events:auto; \}/);
});
