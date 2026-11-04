'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const engine = pathToFileURL(path.join(root, 'src/games/tictactoe/engine.mjs')).href;
const ai = pathToFileURL(path.join(root, 'src/games/tictactoe/companion.mjs')).href;
const ui = pathToFileURL(path.join(root, 'src/games/tictactoe/ui.mjs')).href;

test('Line X đi trước, Sora O đi sau, không ghi đè ô và không được đánh sai lượt', async () => {
  const { TicTacToeGame } = await import(engine);
  const g = new TicTacToeGame();
  assert.equal(g.turn, 'X'); assert.equal(g.legalMoves().length, 9);
  assert.equal(g.play(-1), null); assert.equal(g.play(9), null); assert.equal(g.play('4'), null);
  assert.equal(g.play(0).player, 'X');
  assert.equal(g.turn, 'O'); assert.equal(g.play(0), null);
  assert.equal(g.play(4).player, 'O');
  assert.equal(g.turn, 'X'); assert.equal(g.history.length, 2);
});

test('Thắng đủ 8 hướng và khóa bàn cờ ngay khi có người nối đủ ba', async () => {
  const { TicTacToeGame, WIN_LINES } = await import(engine);
  assert.equal(WIN_LINES.length, 8);
  for (const line of WIN_LINES) {
    const g = new TicTacToeGame();
    const moves = [line[0], ...[0,1,2,3,4,5,6,7,8].filter(n => !line.includes(n)).slice(0,2), line[1], line[2]];
    // xen X O X O X, chọn ô phòng thủ khác ngoài dòng thắng.
    const seq = [line[0], moves[1], line[1], moves[2], line[2]];
    seq.forEach(i => assert.ok(g.play(i), `Ô ${i} được đi`));
    assert.equal(g.status().winner, 'X', line.join('-'));
    assert.deepEqual(g.status().line, line);
    assert.equal(g.legalMoves().length, 0);
    assert.equal(g.play([0,1,2,3,4,5,6,7,8].find(n => !g.board[n])), null);
  }
});

test('Hòa khi bàn 3×3 kín và không ai có ba dấu liên tiếp', async () => {
  const { TicTacToeGame } = await import(engine);
  const g = new TicTacToeGame();
  for (const i of [0,1,2,4,3,5,7,6,8]) assert.ok(g.play(i));
  assert.deepEqual(g.status(), { ended:true, winner:null, reason:'draw', line:[] });
});

test('Lưu/khôi phục an toàn, từ chối nước sau khi thắng và bàn cờ gian lận', async () => {
  const { TicTacToeGame } = await import(engine);
  const g = new TicTacToeGame();
  [0,4,1].forEach(i=>g.play(i));
  const copy = TicTacToeGame.restore(g.snapshot());
  assert.deepEqual(copy.board, g.board);
  assert.equal(copy.turn, 'O');
  assert.deepEqual(TicTacToeGame.restore({ moves:[0,0] }).board, new TicTacToeGame().board);
  assert.deepEqual(TicTacToeGame.restore({ moves:[0,3,1,4,2,8] }).board, new TicTacToeGame().board);
  assert.equal(g.finishByConversation('O','user-concedes'), true);
  assert.equal(g.play(3), null);
  assert.deepEqual(TicTacToeGame.restore(g.snapshot()).status(), g.status());
});

test('AI Sora chọn ô hợp lệ, chặn nước thắng; nghiêm túc không bao giờ bị Line đánh bại', async () => {
  const { TicTacToeGame } = await import(engine);
  const { chooseTicTacToeMove } = await import(ai);
  const g = new TicTacToeGame();
  [0,4,1].forEach(i=>g.play(i));
  assert.equal(chooseTicTacToeMove(g,{style:'serious'},()=>.2), 2, 'Sora phải chặn hàng trên');
  function run(game) {
    if (game.status().ended) {
      assert.notEqual(game.status().winner, 'X', 'Sora chơi nghiêm túc không được thua');
      return;
    }
    if (game.turn === 'O') {
      const move = chooseTicTacToeMove(game,{style:'serious'},()=>.3);
      assert.ok(game.legalMoves().includes(move));
      const next = TicTacToeGame.restore(game.snapshot()); next.play(move); run(next);
    } else {
      for (const m of game.legalMoves()) {
        const next = TicTacToeGame.restore(game.snapshot()); next.play(m); run(next);
      }
    }
  }
  run(new TicTacToeGame());
});

test('Giao diện chung DIALOG, VOICE, nút đổi trò và đường IPC có giới hạn', () => {
  const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
  const html = read('src/games/chess/index.html');
  const chess = read('src/games/chess/chess.js');
  const css = read('src/games/chess/chess.css');
  const main = read('src/main/main.js');
  const preload = read('src/main/chess-preload.js');
  const memory = read('backend/sora/ai/experience_memory.py');
  assert.match(html, /id="game-tab-chess"/);
  assert.match(html, /id="game-tab-tictactoe"/);
  assert.match(html, /id="tic-board"/);
  assert.match(html, /id="messages"/);
  assert.match(html, /id="voice-toggle"/);
  assert.match(css, /\.tic-board\s*\{/);
  assert.match(chess, /gameContext\(mode/);
  assert.match(chess, /new TicTacToeUI\(/);
  assert.match(chess, /tic\.deactivate\(\)/);
  assert.match(chess, /tic\.activate\(\)/);
  assert.match(main, /chess:select-game/);
  assert.match(main, /gameType === 'tictactoe'/);
  assert.match(preload, /onSelectGame/);
  assert.match(memory, /GAME_KINDS/);
  assert.match(memory, /tictactoe/);
  assert.doesNotMatch(html, /<div id="tic-messages"/);
});

test('UI giữ trạng thái Tic và điểm sau chuyển tab, lưu cả lịch sử khi restart', async () => {
  const { TicTacToeUI } = await import(ui);
  const data = new Map();
  const prev = { document:global.document, localStorage:global.localStorage };
  global.localStorage = { getItem:key=>data.get(key)||null, setItem:(key,value)=>data.set(key,String(value)) };
  class Elem {
    constructor() { this.children=[]; this.dataset={}; this.attrs={}; this.style={}; this.className=''; this.disabled=false; this.listeners={}; this.classList={add:()=>{}}; }
    setAttribute(k,v) { this.attrs[k]=v; }
    addEventListener(k,fn) { this.listeners[k]=fn; }
    replaceChildren(...children) { this.children=children; }
    append(child) { this.children.push(child); }
    querySelector(k) { if(!this.refs) this.refs={}; return this.refs[k] ||= {textContent:''}; }
  }
  global.document = {createElement:()=>new Elem()};
  let active=true;
  const board=new Elem(), status=new Elem(), score=new Elem(), counter=new Elem();
  const spoken=[], memories=[];
  const config = {board,status,scores:score,counter,
    say:(who,text)=>spoken.push({who,text}),remember:(...args)=>memories.push(args),
    expand:()=>{},style:()=> 'serious',isActive:()=>active};
  try {
    const controller = new TicTacToeUI(config);
    assert.equal(board.children.length,9);
    assert.equal(controller.playUser(0),true);
    controller.deactivate(); active=false;
    assert.equal(controller.game.board[0], 'X');
    active=true; controller.activate(); controller.cancelTimer();
    assert.equal(controller.game.board[0], 'X');
    assert.equal(board.children.length,9);
    assert.equal(controller.game.turn, 'O');
    const reloaded = new TicTacToeUI(config);
    assert.equal(reloaded.game.board[0], 'X');
    reloaded.deactivate();
    assert.match(reloaded.newGame(), /anh|Anh/);
    assert.equal(reloaded.game.board.every(v=>v===null),true);
    assert.ok(spoken.length>0);
    assert.equal(memories.length,0);
  } finally { global.document=prev.document; global.localStorage=prev.localStorage; }
});
