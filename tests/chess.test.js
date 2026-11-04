'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = '../src/games/chess/engine.mjs';
const opponent = '../src/games/chess/companion.mjs';

test('Bàn cờ xuất phát, luật sinh nước đi (perft 1–3)', async () => {
  const { ChessGame } = await import(source);
  const game = new ChessGame();
  const count = (board, depth) => depth === 0 ? 1 : board.legalMoves().reduce((sum, move) => {
    const next = board.clone(); next.apply(move, { record:false });
    return sum + count(next, depth-1);
  }, 0);
  assert.equal(game.toFEN(), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(count(game, 1), 20);
  assert.equal(count(game, 2), 400);
  assert.equal(count(game, 3), 8902);
});

test('Chiếu tướng kết thúc ván, không cho đi sai luật', async () => {
  const { ChessGame } = await import(source);
  const game = new ChessGame();
  assert.equal(game.play('e2', 'e5'), null);
  for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']])
    assert.ok(game.play(from,to), `${from}${to} phải hợp lệ`);
  assert.deepEqual(game.status(), { ended:true, reason:'checkmate', winner:'b', check:true });
  assert.equal(game.legalMoves().length, 0);
});

test('Chế độ cờ tự do: không khóa nước đi do chiếu, bắt vua mới kết thúc', async () => {
  const { ChessGame } = await import(source);
  const free = new ChessGame({ variant:'free' });
  for (const [from, to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']])
    assert.ok(free.play(from,to));
  assert.equal(free.status().ended, false, 'không tự xử thua do chiếu hết');
  assert.ok(free.play('h2','h3'), 'được đi tốt khác dù vua đang bị chiếu');
  const capture = new ChessGame({ empty:true, variant:'free' });
  capture.board[7][4] = 'wK'; capture.board[0][4] = 'bK'; capture.board[1][4] = 'wQ';
  assert.equal(capture.play('e7','e8').capture, 'bK');
  assert.deepEqual(capture.status(), { ended:true, reason:'king-captured', winner:'w', check:false });
});

test('Hội thoại đầu hàng: bỏ câu phủ định và cho Sora quyết định theo mood', async () => {
  const { ChessGame } = await import(source);
  const { wantsToConcede, moodBasedConcession } = await import('../src/games/chess/intent.mjs');
  assert.equal(wantsToConcede('Anh đầu hàng rồi'), true);
  assert.equal(wantsToConcede('Anh không đầu hàng đâu'), false);
  assert.equal(wantsToConcede('Em thắng rồi'), true);
  assert.equal(wantsToConcede('Anh đầu hàng không?'), false);
  const gentle = moodBasedConcession('worried', 0.25);
  const assertive = moodBasedConcession('excited', 0.85);
  assert.equal(gentle.winner, 'w'); assert.equal(assertive.winner, 'b');
  const game = new ChessGame({ variant:'free' });
  assert.equal(game.finishByConversation(gentle.winner, gentle.reason), true);
  assert.equal(game.status().reason, 'sora-yields');
  assert.equal(game.finishByConversation('b'), false);
});

test('Bắt tốt qua đường và phong cấp', async () => {
  const { ChessGame } = await import(source);
  const game = new ChessGame();
  for (const [from, to] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5']])
    assert.ok(game.play(from,to));
  const ep = game.play('e5','d6');
  assert.equal(ep.enPassant, true);
  assert.equal(game.board[3][3], null);
  assert.equal(game.board[2][3], 'wP');
  const other = new ChessGame({ empty:true });
  other.board[7][4] = 'wK'; other.board[0][4] = 'bK'; other.board[1][0] = 'wP';
  other.castling = '';
  assert.equal(other.play('a7','a8','Q').promotion, 'Q');
  assert.equal(other.board[0][0], 'wQ');
});

test('Nhập thành đủ quyền, không được đi ngang qua ô bị chiếu', async () => {
  const { ChessGame } = await import(source);
  const game = new ChessGame({ empty:true });
  game.board[7][4] = 'wK'; game.board[7][7] = 'wR';
  game.board[0][4] = 'bK'; game.castling = 'K';
  assert.equal(game.play('e1','g1').castle, 'king');
  assert.equal(game.board[7][5], 'wR');
  assert.equal(game.castling, '');
  const blocked = new ChessGame({ empty:true });
  blocked.board[7][4] = 'wK'; blocked.board[7][7] = 'wR';
  blocked.board[0][4] = 'bK'; blocked.board[0][5] = 'bR'; blocked.castling = 'K';
  assert.equal(blocked.play('e1','g1'), null);
});

test('Sora đánh hợp lệ ở cả ba độ khó và trạng thái cảm xúc thay đổi theo điểm', async () => {
  const { ChessGame } = await import(source);
  const { ChessCompanion, chooseSoraMove } = await import(opponent);
  const base = new ChessGame(); base.play('e2','e4');
  for (const difficulty of ['easy','normal','hard']) {
    const g = base.clone();
    const choice = chooseSoraMove(g,difficulty,() => 0.3);
    assert.ok(g.legalMoves().some((m) => JSON.stringify(m.from)===JSON.stringify(choice.from)
      && JSON.stringify(m.to)===JSON.stringify(choice.to)));
    assert.ok(g.apply(choice));
  }
  const player = new ChessCompanion(() => 0.2);
  assert.match(player.greet(), /[Âa]nh|em/i);
  assert.ok(player.react(base, null, 'w'));
});

test('Game và menu vòng tròn được gắn vào chương trình; ảnh nằm còn trong dự án', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root,'src/main/main.js'),'utf8');
  const sora = fs.readFileSync(path.join(root,'src/renderer/js/sora.js'),'utf8');
  const html = fs.readFileSync(path.join(root,'src/renderer/index.html'),'utf8');
  assert.match(main, /'chess:talk'/);
  assert.match(main, /function openChessWindow/);
  assert.match(main, /function openWheel/);
  assert.match(sora, /lieDown\(duration/);
  assert.match(html, /id="lie-effects"/);
  assert.ok(fs.existsSync(path.join(root,'assets/sora/sora-lying.png')));
});

test('Giao diện cờ vua DIALOG hacker và lời chào Sora được cập nhật', () => {
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'src/games/chess/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/games/chess/chess.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src/renderer/js/app.js'), 'utf8');
  const wheel = fs.readFileSync(path.join(root, 'src/wheel/wheel.css'), 'utf8');
  assert.match(html, />DIALOG<\/span>/);
  assert.match(html, /class="terminal-log"/);
  assert.match(html, /class="terminal-prompt"/);
  assert.match(html, />VOICE<\/span>/);
  assert.match(html, /assets\/icons\/tray.png/);
  assert.doesNotMatch(html, /TRÒ CHUYỆN CÙNG SORA|KHÔNG XÓA KHI SANG VÁN|CHẾ ĐỘ TỰ DO|Anh muốn nói gì với em|TRÒ CHƠI/);
  assert.match(css, /\.terminal-log\s*\{/);
  assert.match(css, /clip-path:polygon\(/);
  assert.match(wheel, /\.wheel__drawing\s*\{/);
  assert.match(app, /SORA_OPENERS/);
  assert.match(app, /Hey! Em ở đây cơ mà/);
});

test('Menu thực sự tròn và nhỏ; cờ vua không còn thanh tiêu đề hoặc thanh cuộn ngoài', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/chess-preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/games/chess/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/games/chess/chess.css'), 'utf8');
  const wheel = fs.readFileSync(path.join(root, 'src/wheel/wheel.css'), 'utf8');
  assert.match(main, /const layout = calculateWheelLayout\(point, area\)/);
  assert.match(wheel, /width:162px; height:162px;/);
  assert.match(wheel, /\.wheel__center\s*\{[^}]*border-radius:50%/);
  assert.doesNotMatch(wheel, /\.wheel__center\s*\{[^}]*clip-path/);
  assert.match(main, /title: 'Sora', frame: false/);
  assert.match(main, /ipcMain\.on\('chess:window-control'/);
  assert.match(main, /soraBackend\.request\('chat', \{ text, profile \}/);
  assert.match(preload, /windowControl:/);
  assert.match(html, /data-window-action="close"/);
  assert.match(html, /data-window-action="minimize"/);
  assert.match(css, /-webkit-app-region:drag/);
  assert.match(css, /\.game-shell::-webkit-scrollbar\s*\{[^}]*display:none/);
  const js = fs.readFileSync(path.join(root, 'src/games/chess/chess.js'), 'utf8');
  assert.match(js, /async function respondToUser/);
  assert.match(js, /classList\.add\('pending'\)/);
  assert.doesNotMatch(js, /const fallback = sora\.choose\(/);
});

test('Khung cờ cố định tỉ lệ, vòng menu không đè Sora, trạng thái mạng cập nhật', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root,'src/main/main.js'),'utf8');
  const wheel = fs.readFileSync(path.join(root,'src/wheel/wheel.css'),'utf8');
  const wheelHtml = fs.readFileSync(path.join(root,'src/wheel/index.html'),'utf8');
  const chess = fs.readFileSync(path.join(root,'src/games/chess/chess.js'),'utf8');
  const html = fs.readFileSync(path.join(root,'src/games/chess/index.html'),'utf8');
  const chat = fs.readFileSync(path.join(root,'src/renderer/js/chat.js'),'utf8');
  assert.match(main, /CHESS_BASE_SIZE = \{ width:933, height:600 \}/);
  assert.match(main, /resizable:false, maximizable:false/);
  assert.match(wheel, /\.wheel__slice\s*\{/);
  assert.match(wheel, /--dx: 53px/);
  assert.doesNotMatch(wheelHtml, /CHỌN MỘT MỤC/);
  assert.match(chess, /addEventListener\('online', updateNetworkStatus\)/);
  assert.match(html, /id="network-status"/);
  assert.doesNotMatch(html, /CHƠI OFFLINE/);
  assert.match(chat, /tag: ''/);
  assert.match(main, /'chess:history'/);
  assert.match(main, /'conversation_event'/);
});
