'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
test('wheel keeps GAME and exposes eight independent launch icons',()=>{
  const html=read('src/wheel/index.html');
  const js=read('src/wheel/wheel.js');
  const css=read('src/wheel/wheel.css');
  const main=read('src/main/main.js');
  for(const id of ['chess','tictactoe','connect4','gomoku','word','reversi','battleship','detective'])assert.match(html,new RegExp(`data-game="${id}"`));
  assert.match(js,/gameButtons\.length - 1/);
  assert.match(js,/setGamesOpen/);
  assert.doesNotMatch(html,/data-game="allgames"/);
  assert.match(css,/is-highlighted/);
  for(const id of ['connect4','gomoku','word','reversi','battleship','detective'])
    assert.match(main,new RegExp(`case 'game-${id}': openChessWindow\\('${id}'\\)`));
  assert.match(main,/const GAME_IDS = new Set/);
});
test('all eight choices remain selectable in Windows tray',()=>{
  const main=read('src/main/main.js');
  for(const id of ['chess','tictactoe','connect4','gomoku','word','reversi','battleship','detective'])
    assert.match(main,new RegExp(`openChessWindow\\('${id}'\\)`));
});
test('Windows RT emotions are bridged by owned game renderer only',()=>{
  const main=read('src/main/main.js');
  const preload=read('src/main/chess-preload.js');
  const rt=read('src/renderer/js/app.js');
  assert.match(main,/event\.sender!==chessWindow\.webContents/);
  assert.match(main,/sendCommand\('game-emotion'/);
  assert.match(preload,/ipcRenderer\.send\('chess:emotion'/);
  assert.match(rt,/case 'game-emotion'/);
});

// v6: Direct activation and redundant fallback for Electron game selection.
test('eight-game rail is explicit, scrollable and includes a visible version badge',()=>{
 const html=read('src/games/chess/index.html');
 const css=read('src/games/hub/hub.css');
 const js=read('src/games/chess/chess.js');
 const main=read('src/main/main.js');
 for(const id of ['chess','tictactoe','connect4','gomoku','word','reversi','battleship','detective'])
   assert.match(html,new RegExp(`data-game="${id}"`));
 assert.match(html,/data-gamehub-version="6"/);
 assert.match(html,/8 TRÒ/);
 assert.match(html,/game-rail-left/);assert.match(html,/game-rail-right/);
 assert.match(js,/rail\.addEventListener\('wheel'/);
 assert.match(js,/new URLSearchParams\(window\.location\.search\)\.get\('game'\)/);
 assert.match(css,/overflow-x:auto/);
 assert.match(main,/&hub=6/);
});
