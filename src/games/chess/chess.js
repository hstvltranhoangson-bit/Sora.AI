import { ChessGame, sq } from './engine.mjs';
import { ChessCompanion, chooseSoraMove } from './companion.mjs';
import { chessChatIntent, wantsToConcede, moodBasedConcession } from './intent.mjs';
import { learnFromCompletedGame } from './learning.mjs';
import { startGlitchStatus } from '../../shared/glitch-status.mjs';
import { TicTacToeUI } from '../tictactoe/ui.mjs';
import { GameHubUI } from '../hub/ui.mjs';
import { ALL_IDS, HUB_IDS, GAME_NAMES } from '../hub/engines.mjs';

const GLYPHS = { wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟' };
const byId = (id) => document.getElementById(id);
const boardEl = byId('board'), statusEl = byId('status'), messages = byId('messages');
const scores = byId('score'), moveCount = byId('move-count');
const chatForm = byId('chat-form'), chatInput = byId('chat-input');
const networkStatus = byId('network-status');
const ticBoard = byId('tic-board');
const hubBoard = byId('hub-board');
const rail = byId('game-rail');
let activeGame = 'chess';
try {
  const requested = new URLSearchParams(window.location.search).get('game');
  const saved = localStorage.getItem('sora.game.active.v1');
  // Direct menu selection wins over persisted tab; avoids Electron IPC timing issues.
  if (ALL_IDS.includes(requested)) activeGame = requested;
  else if (ALL_IDS.includes(saved)) activeGame = saved;
} catch { /* Giữ mặc định cờ vua */ }
// Distinguishes this eight-game build from stale Chess/Tic Tac Toe windows.
document.body.dataset.gameHub = '6';
console.info('[Sora GameHub 6] ready with', ALL_IDS.length, 'games');

// Viền chạy trọn qua các góc vát; CSS border trên clip-path làm mất nét chéo.
for (const svg of document.querySelectorAll('[data-cut-outline]')) {
  // Khung viền nằm ngoài phần tử bị cắt góc: không bị clip mất nét.
  const box = svg.dataset.cutOutline === 'game' ? document.querySelector('.game-shell') : svg.parentElement;
  const updateOutline = () => {
    const w = box.clientWidth, h = box.clientHeight;
    if (w < 50 || h < 50) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const kind = svg.dataset.cutOutline;
    const shape = kind === 'game'
      ? `M 1 21 L 21 1 L ${w * .62} 1 L ${w * .63} 8 L ${w * .64} 1 L ${w - 29} 1 L ${w - 1} 29 L ${w - 1} ${h - 1} L 21 ${h - 1} L 1 ${h - 21} Z`
      : kind === 'chat'
        ? `M 1 10 L 10 1 L ${w - 1} 1 L ${w - 1} ${h - 10} L ${w - 10} ${h - 1} L 1 ${h - 1} Z`
        : `M 1 12 L 12 1 L ${w - 18} 1 L ${w - 1} 18 L ${w - 1} ${h - 1} L 18 ${h - 1} L 1 ${h - 18} Z`;
    svg.querySelector('path').setAttribute('d', shape);
  };
  new ResizeObserver(updateOutline).observe(box);
  updateOutline();
}
function updateNetworkStatus() {
  if (!networkStatus) return;
  const online = navigator.onLine;
  networkStatus.classList.toggle('is-online', online);
  networkStatus.classList.toggle('is-offline', !online);
  networkStatus.querySelector('span').textContent = online ? 'ONLINE' : 'OFFLINE';
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();
document.querySelectorAll('[data-window-action]').forEach((button) => {
  button.addEventListener('click', () => {
    window.soraChess?.windowControl?.(button.dataset.windowAction);
  });
});
let game = new ChessGame({ variant:'free' }), sora = new ChessCompanion(), selection = null, thinking = false;
let lastMove = null, gameId = 0, messageSeq = 0, endedRecorded = false;
let manualChatBusy = false;
let chatQueue = Promise.resolve();
let personality = {};
let tic = null, hub = null;
const SCORE_KEY = 'sora.chess.score.v1';
const CHAT_KEY = 'sora.chess.dialogue.v2';
const STUDY_KEY = 'sora.chess.learning.v1';
const STYLE_KEY = 'sora.chess.play-style.v1';
function loadStudy() {
  try {
    const data = JSON.parse(localStorage.getItem(STUDY_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}
const storedStudy = loadStudy();
let chessSkill = Number.isFinite(storedStudy.skill) ? Math.max(0.34, Math.min(0.9, storedStudy.skill)) : 0.34;
let learnedPositions = storedStudy.positions && typeof storedStudy.positions === 'object' ? storedStudy.positions : {};
let playStyle = 'natural';
try {
  const savedStyle = localStorage.getItem(STYLE_KEY);
  if (['natural','gentle','serious'].includes(savedStyle)) playStyle = savedStyle;
} catch { /* Có thể chơi mà không cần localStorage */ }
let observedSoraMoves = [];
sora.setPreferences({ chess_skill:chessSkill });
sora.setPlayStyle(playStyle);
function saveStudy() {
  try { localStorage.setItem(STUDY_KEY, JSON.stringify({ skill:chessSkill, positions:learnedPositions })); }
  catch { /* Vẫn chơi được khi không lưu localStorage */ }
}
function storeLocalTurn(user, answer) {
  // Cờ vua và hộp chat ngoài desktop cùng ghi về một SQLite qua Agent Python.
  window.soraChess?.recordTurn?.(user, answer, activeGame)?.catch?.(() => {});
}
const loadDialogue = () => {
  try {
    const data = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item) => item &&
      ['anh','em'].includes(item.who) && typeof item.text === 'string').slice(-100) : [];
  } catch { return []; }
};
const dialogue = loadDialogue();
function clearDialogue() {
  dialogue.length = 0;
  messages.replaceChildren();
  try { localStorage.removeItem(CHAT_KEY); } catch { /* riêng tư */ }
  // Đồng bộ mốc xóa với menu Sora; một lần xóa không được xóa nhầm
  // những lượt trò chuyện mới sau khi người dùng đã xóa lịch sử.
  window.soraChess?.forgetToken?.().then((token) => {
    localStorage.setItem('sora.chess.forget-version.v1', String(token));
  }).catch(() => {});
}
const rememberExperience = (category, detail, winner = '', feedback = '') => {
  // Chỉ nội dung trao đổi/ván cờ, tuyệt đối không lưu ảnh màn hình hay dữ liệu nền.
  window.soraChess?.remember?.({ category, detail:String(detail).slice(0, 280),
    mood:activeGame === 'tictactoe' ? tic?.mood : HUB_IDS.includes(activeGame) ? hub?.mood : sora.mood, winner, feedback })?.then?.((reply) => {
      if (reply?.ok && reply.personality) {
        personality = reply.personality;
        chessSkill = Math.max(chessSkill, Number(personality.chess_skill) || 0);
        sora.setPreferences({ ...personality, chess_skill:chessSkill });
        saveStudy();
      }
    })?.catch?.(() => {});
};
function displayLine(who, line) {
  const div = document.createElement('div');
  div.className = `message ${who === 'anh' ? 'me' : ''}`;
  const label = document.createElement('span'); label.className = 'who';
  label.textContent = who === 'anh' ? 'Line' : 'Sora';
  const body = document.createElement('span');
  body.className = 'message__body';
  body.textContent = line;
  div.append(label, body);
  messages.append(div);
  while (messages.children.length > 70) messages.firstElementChild.remove();
  messages.scrollTop = messages.scrollHeight;
  return div;
}
function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORE_KEY) || '{}');
    return Object.fromEntries(['anh', 'em', 'hoa'].map((key) =>
      [key, Number.isSafeInteger(saved[key]) && saved[key] >= 0 ? saved[key] : 0]));
  } catch { return { anh:0, em:0, hoa:0 }; }
}
const totals = loadScores();
function saveScores() {
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(totals)); } catch { /* Chế độ riêng tư */ }
}

function speak(line) {
  if (!byId('voice-toggle').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(line);
  utterance.lang = 'vi-VN'; utterance.rate = 1.03; utterance.pitch = 1.13;
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((v) => v.lang.toLowerCase().startsWith('vi')) || null;
  speechSynthesis.speak(utterance);
}

function say(who, text, { audio = true, record = 'event' } = {}) {
  const line = String(text || '').trim().slice(0, 2000);
  if (!line) return;
  displayLine(who, line);
  dialogue.push({ who, text:line, when:Date.now() });
  while (dialogue.length > 100) dialogue.shift();
  try { localStorage.setItem(CHAT_KEY, JSON.stringify(dialogue)); } catch { /* LocalStorage tắt */ }
  // Lời game là sự kiện, không phải lệnh người dùng. Lời chat thật được
  // Agent Python ghi trực tiếp vào cùng SQLite cho cả hai cửa sổ.
  if (record === 'event' && who === 'em')
    window.soraChess?.logEvent?.(line, activeGame)?.catch?.(() => {});
  if (who === 'em' && audio) speak(line);
}

async function syncSharedHistory() {
  if (!window.soraChess?.history) return;
  let result;
  try { result = await window.soraChess.history(); } catch { return; }
  if (!result?.ok || !Array.isArray(result.messages)) return;
  const shared = result.messages.filter((item) => item &&
    ['user','assistant'].includes(item.role) && typeof item.content === 'string')
    .map((item) => ({
      who:item.role === 'user' ? 'anh' : 'em', text:item.content,
      when:Date.parse(`${item.created || ''}Z`) || Date.now(),
      source:item.source || 'desktop',
    }));
  const key = (item) => `${item.who}\u0000${item.text}`;
  const seen = new Map();
  shared.forEach((entry) => seen.set(key(entry), (seen.get(key(entry)) || 0) + 1));
  // Chỉ giữ các lời cũ chưa được nhập vào SQLite: bản vá không xóa ký ức
  // cờ vua đã nằm trong localStorage của các phiên trước.
  const legacy = dialogue.filter((item) => {
    const remaining = seen.get(key(item)) || 0;
    if (remaining > 0) { seen.set(key(item), remaining - 1); return false; }
    return true;
  });
  const joined = [...legacy, ...shared].slice(-100);
  dialogue.splice(0, dialogue.length, ...joined);
  messages.replaceChildren();
  joined.slice(-70).forEach(({ who, text }) => displayLine(who, text));
}

function draw() {
  if (activeGame !== 'chess') return;
  const possibilities = !thinking && selection ? game.legalMoves().filter((m) => m.from[0] === selection[0] && m.from[1] === selection[1]) : [];
  const legal = new Set(possibilities.map((m) => sq(...m.to)));
  const active = selection ? sq(...selection) : null;
  const prior = lastMove ? [sq(...lastMove.from), sq(...lastMove.to)] : [];
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const square = document.createElement('button');
    square.className = `square ${(r + c) % 2 ? 'dark' : 'light'}`;
    square.type = 'button'; square.dataset.r = r; square.dataset.c = c;
    square.setAttribute('role', 'gridcell');
    square.setAttribute('aria-label', `${sq(r,c)} ${game.board[r][c] || 'trống'}`);
    const name = sq(r, c);
    if (legal.has(name)) square.classList.add('legal');
    if (name === active) square.classList.add('selected');
    if (prior.includes(name)) square.classList.add('last');
    const piece = game.board[r][c];
    if (piece) {
      const element = document.createElement('span');
      element.className = `piece ${piece[0] === 'w' ? 'white' : 'black'}`;
      element.textContent = GLYPHS[piece];
      square.append(element);
    }
    if (c === 0) {
      const rank = document.createElement('small'); rank.className = 'coord rank'; rank.textContent = 8-r;
      square.append(rank);
    }
    if (r === 7) {
      const file = document.createElement('small'); file.className = 'coord file'; file.textContent = 'abcdefgh'[c];
      square.append(file);
    }
    cells.push(square);
  }
  boardEl.replaceChildren(...cells);
  const status = game.status();
  statusEl.querySelector('b').textContent = status.ended ?
    (status.winner === 'w' ? 'Line THẮNG!' : status.winner === 'b' ? 'Sora THẮNG!' : 'HÒA RỒI!') :
    thinking ? 'Sora ĐANG NGHĨ…' : game.turn === 'w' ? 'ĐẾN LƯỢT Line' : 'ĐẾN LƯỢT Sora';
  statusEl.querySelector('small').textContent = status.ended ? '' : game.turn === 'w' ? '(Trắng)' : '(Đỏ)';
  statusEl.style.borderLeftColor = status.check ? '#ff285e' : '#24f5a0';
  moveCount.textContent = `LƯỢT ${String(game.fullmove).padStart(2,'0')}`;
  scores.textContent = `Line ${totals.anh} thắng · Sora ${totals.em} thắng · ${totals.hoa} hòa`;
}

function gameContext(mode = activeGame, event = '', message = '', turnId = 0) {
  const recent = dialogue.slice(-8).map(({ who, text }) => ({ who, text:text.slice(0,160) }));
  if (mode === 'tictactoe') return {
    gameType:'tictactoe', tic:tic.getContext(), mood:tic.mood, event, message, turnId, recent,
  };
  if (HUB_IDS.includes(mode)) return {
    gameType:mode, gameContext:hub.getContext(), mood:hub.mood,
    event, message, turnId, recent,
  };
  return {
    gameType:'chess', fen:game.toFEN(), evaluation:game.evaluation(), mood:sora.mood,
    event, message, turnId, recent,
  };
}

async function expandSoraSpeech(localLine, context, fromGame, mode = activeGame) {
  // Lời bình bằng cùng Agent Ollama; phiên cũ không chen vào game đang mở.
  if (manualChatBusy || !window.soraChess?.talk) return;
  const token = ++messageSeq;
  try {
    const result = await window.soraChess.talk(gameContext(mode,
      String(context || '').slice(0,180), fromGame ? '' : String(context || '').slice(0,240)));
    if (token !== messageSeq || mode !== activeGame || result?.ok !== true || !result.text?.trim()) return;
    const sentence = result.text.trim().replace(/^(Sora|Em)\s*:\s*/i, '').slice(0,1800);
    if (sentence !== localLine) say('em', sentence, { record:'chat' });
  } catch { /* Mất kết nối không ngăn trò chơi offline. */ }
}

function finishIfEnded() {
  const state = game.status();
  if (!state.ended) return false;
  if (endedRecorded) return true;
  endedRecorded = true;
  if (game.history.length >= 2) {
    chessSkill = Math.min(0.9, chessSkill + 0.022);
    learnedPositions = learnFromCompletedGame(learnedPositions, observedSoraMoves, state.winner || 'draw');
    saveStudy();
    sora.setPreferences({ ...personality, chess_skill:chessSkill });
  }
  if (state.winner === 'w') totals.anh++;
  else if (state.winner === 'b') totals.em++;
  else totals.hoa++;
  saveScores();
  if (!['sora-yields', 'user-concedes'].includes(state.reason)) {
    const phrase = sora.react(game, lastMove, state.winner || 'w');
    say('em', phrase);
  }
  const label = state.winner === 'w' ? 'Line thắng' : state.winner === 'b' ? 'Sora thắng' : 'hòa';
  window.soraChess?.emotion?.(state.winner==='b'?'happy':state.winner==='w'?'surprised':'curious','chess',label);
  if (game.history.length >= 2)
    rememberExperience('chess_result', `Ván ${gameId + 1}: ${label}; lý do ${state.reason}; ` +
      `${game.history.length} nửa nước đã đi.`, state.winner || 'draw');
  draw();
  return true;
}

function afterPlayerMove(move) {
  lastMove = move; selection = null;
  if (game.status().ended) { finishIfEnded(); return; }
  say('em', sora.react(game, move, 'w'));
  draw();
  thinking = true; draw();
  const current = gameId;
  setTimeout(() => {
    if (gameId !== current || game.turn !== 'b') return;
    try {
      const choice = chooseSoraMove(game, sora.strategy(learnedPositions));
      if (!choice) { thinking = false; draw(); finishIfEnded(); return; }
      const previousPosition = game.toFEN();
      lastMove = game.apply(choice);
      if (lastMove) observedSoraMoves.push({ fen:previousPosition, move:choice });
      thinking = false;
      if (game.status().ended) { finishIfEnded(); return; }
      const response = sora.react(game, lastMove, 'b');
      say('em', response);
      draw();
      if (game.history.length % 4 === 0 || Boolean(lastMove.capture))
        expandSoraSpeech(response, `Em vừa đi ${game.history.at(-1)?.notation}; ${response}`, true);
    } catch (error) {
      console.error('[Sora chess]', error);
      thinking = false; draw();
      say('em', 'Em bị rối một chút… Anh bấm Ván mới để mình thử lại nhé.');
    }
  }, 450 + Math.random() * 500);
}

boardEl.addEventListener('click', (event) => {
  const square = event.target.closest('.square');
  if (!square || thinking || game.turn !== 'w' || game.status().ended) return;
  const to = [Number(square.dataset.r), Number(square.dataset.c)];
  const piece = game.piece(to);
  if (selection && selection[0] === to[0] && selection[1] === to[1]) { selection = null; draw(); return; }
  if (selection && (!piece || piece[0] === 'b')) {
    const move = game.play(selection, to);
    if (move) { afterPlayerMove(move); return; }
  }
  selection = piece?.[0] === 'w' ? to : null;
  draw();
});

function startNewGame() {
  gameId++; messageSeq++;
  window.speechSynthesis?.cancel();
  game = new ChessGame({ variant:'free' });
  sora = new ChessCompanion(Math.random, { ...personality, chess_skill:chessSkill });
  sora.setPlayStyle(playStyle);
  selection = null; thinking = false; lastMove = null; endedRecorded = false;
  observedSoraMoves = [];
  // KHÔNG xóa hội thoại: mỗi ván chỉ đặt lại bàn cờ.
  draw();
  return sora.choose('rematch');
}
function restartActiveGame() {
  if (activeGame === 'tictactoe') { messageSeq++; return tic.newGame(); }
  if (HUB_IDS.includes(activeGame)) { messageSeq++; return hub.newGame(); }
  return startNewGame();
}
byId('new-game').addEventListener('click', () => say('em', restartActiveGame()));

const LABELS = {
  chess:['QUÂN TRẮNG','QUÂN ĐỎ','CHỌN QUÂN → CHỌN Ô ĐẾN'],
  tictactoe:['DẤU X','DẤU O','CHỌN Ô TRỐNG ĐỂ ĐẶT X'],
  connect4:['QUÂN X','QUÂN O','CHỌN CỘT ĐỂ THẢ QUÂN'],
  gomoku:['DẤU X','DẤU O','NỐI NĂM DẤU LIÊN TIẾP'],
  reversi:['QUÂN SÁNG','QUÂN ĐỎ','KẸP HAI ĐẦU ĐỂ LẬT QUÂN'],
  word:['NGƯỜI ĐOÁN','NGƯỜI RA ĐỀ','ĐOÁN TỪ TRONG SÁU LẦN'],
  battleship:['HẠM ĐỘI LINE','HẠM ĐỘI SORA','CHỌN TỌA ĐỘ TRÊN RADAR'],
  detective:['THÁM TỬ LINE','CỘNG SỰ SORA','TÌM MANH MỐI → KẾT LUẬN'],
};
function switchGame(mode, { announce = false } = {}) {
  if (!ALL_IDS.includes(mode) || !tic || !hub || mode === activeGame) return false;
  if (activeGame === 'tictactoe') tic.deactivate();
  if (HUB_IDS.includes(activeGame)) hub.deactivate();
  messageSeq++;
  activeGame = mode;
  try { localStorage.setItem('sora.game.active.v1', mode); } catch { /* offline available */ }
  for (const tab of document.querySelectorAll('[data-game]')) {
    const selected = tab.dataset.game === mode;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-pressed', String(selected));
    if (selected && tab.closest('#game-rail')) tab.scrollIntoView({block:'nearest',inline:'nearest'});
  }
  boardEl.hidden = mode !== 'chess';
  ticBoard.hidden = mode !== 'tictactoe';
  hubBoard.hidden = !HUB_IDS.includes(mode);
  byId('board-area').setAttribute('aria-label', 'Bàn ' + GAME_NAMES[mode]);
  const labels = LABELS[mode];
  byId('player-piece').textContent = labels[0];
  byId('sora-piece').textContent = labels[1];
  byId('board-instructions').textContent = labels[2];
  if (mode === 'chess') draw();
  else if (mode === 'tictactoe') tic.activate();
  else hub.activate(mode);
  if (announce) say('em', `Mình chuyển sang ${GAME_NAMES[mode]} nhé anh! Em giữ nguyên tất cả các ván đang chơi và DIALOG.`);
  return true;
}

tic = new TicTacToeUI({
  board:ticBoard, status:statusEl, scores, counter:moveCount,
  say, remember:rememberExperience, expand:expandSoraSpeech,
  style:() => playStyle, isActive:() => activeGame === 'tictactoe',
  onMood:(mood)=>window.soraChess?.emotion?.(mood==='excited'?'happy':mood==='worried'?'surprised':mood==='sad'?'sad':'curious','tictactoe','Diễn biến Tic Tac Toe'),
});
hub = new GameHubUI({
  board:hubBoard, status:statusEl, scores, counter:moveCount,
  say, remember:rememberExperience, expand:expandSoraSpeech,
  style:() => playStyle, isActive:() => HUB_IDS.includes(activeGame),
  onMood:(mood,gameType,detail) => window.soraChess?.emotion?.(mood,gameType,detail),
});
// Horizontal rail: mouse wheel, touchpad, pointer drag and arrow buttons.
byId('game-rail-left').addEventListener('click',()=>rail.scrollBy({left:-225,behavior:'smooth'}));
byId('game-rail-right').addEventListener('click',()=>rail.scrollBy({left:225,behavior:'smooth'}));
rail.addEventListener('wheel',event=>{
  if(Math.abs(event.deltaY)>Math.abs(event.deltaX)){
    event.preventDefault();rail.scrollLeft+=event.deltaY;
  }
},{passive:false});
let railStart=null,railDragged=false;
rail.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  railStart={x:event.clientX,left:rail.scrollLeft};railDragged=false;
});
rail.addEventListener('pointermove',event=>{
  if(!railStart||!(event.buttons&1))return;
  const dx=event.clientX-railStart.x;
  if(Math.abs(dx)>6){railDragged=true;rail.classList.add('is-dragging');rail.scrollLeft=railStart.left-dx;}
});
window.addEventListener('pointerup',()=>{railStart=null;rail.classList.remove('is-dragging');});
rail.addEventListener('click',event=>{
  if(railDragged){event.preventDefault();event.stopPropagation();railDragged=false;}
},true);
document.querySelectorAll('#game-rail [data-game]').forEach(tab =>
  tab.addEventListener('click', () => switchGame(tab.dataset.game, { announce:true })));
window.soraChess?.onSelectGame?.((mode) => switchGame(mode));
if (activeGame !== 'chess') {
  const initial = activeGame;activeGame='chess';switchGame(initial);
}
// Gentle invitations only when game window itself has been idle; no forced launch.
let lastActivity = Date.now();let lastChallenge = 0;
for(const name of ['pointerdown','keydown'])window.addEventListener(name,()=>{lastActivity=Date.now();},{passive:true});
setInterval(()=>{
  const now=Date.now();
  if(document.hidden||manualChatBusy||now-lastActivity<10*60_000||now-lastChallenge<30*60_000)return;
  lastChallenge=now;
  const suggestion=HUB_IDS.slice().sort((a,b)=>(hub.preferences[a]||0)-(hub.preferences[b]||0))[0];
  say('em',`Anh ơi, mình chơi thử ${GAME_NAMES[suggestion]} nhé? Em muốn xem anh xử lý trò này thế nào. Anh có thể chuyển bằng thanh trò chơi phía trên.`);
  window.soraChess?.emotion?.('curious',suggestion,'Lời mời chơi mini-game');
},60_000);


async function respondToUser(text, pending, mode = activeGame) {
  manualChatBusy = true;
  const turnId = ++messageSeq;
  let streaming = '';
  const removeListener = window.soraChess?.onDelta?.((update) => {
    if (update?.turnId !== turnId || !pending.isConnected) return;
    streaming += String(update.text || '');
    if (streaming) pending.stopGlitch?.();
    if (streaming) pending.lastChild.textContent = streaming;
    messages.scrollTop = messages.scrollHeight;
  });
  try {
    if (!window.soraChess?.talk) throw new Error('Cửa sổ cờ vua chưa kết nối bộ não Sora.');
    const eventContext = `Anh đang trò chuyện cùng Sora trong lúc chơi ${GAME_NAMES[mode] || 'cờ vua'}.`;
    const result = await window.soraChess.talk(gameContext(mode, eventContext, text, turnId));
    pending.remove();
    if (!result?.ok || !String(result.text || '').trim()) {
      displayLine('em', 'Em chưa trả lời được: ' + (result?.error || 'Bộ não AI chưa phản hồi.'));
      return;
    }
    const reply = result.text.trim().replace(/^(Sora|Em)\s*:\s*/i, '');
    say('em', reply, { record:'chat' });
    rememberExperience(`${mode}_chat`,
      `Anh: ${text.slice(0,100)}; Sora: ${reply.slice(0,160)}`);
  } catch (error) {
    pending.remove();
    displayLine('em', 'Em chưa kết nối được: ' + error.message);
  } finally {
    pending.stopGlitch?.();
    removeListener?.();
    manualChatBusy = false;
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim().slice(0, 3000);
  if (!text) return;
  chatInput.value = ''; say('anh', text, { record:'chat' });
  const reaction = /^\/phanhoi\s+(tot|can-sua)\s+(.+)$/i.exec(text);
  if (reaction) {
    rememberExperience('feedback', reaction[2], '', reaction[1].toLowerCase() === 'tot' ? 'good' : 'improve');
    say('em', 'Em ghi nhận góp ý của anh. Những lần sau em sẽ điều chỉnh từ từ nhé!');
    return;
  }
  if (wantsToConcede(text)) {
    if (activeGame === 'tictactoe' && !tic.game.status().ended) {
      const decision = moodBasedConcession(tic.mood, tic.confidence);
      const winner = decision.winner === 'w' ? 'X' : 'O';
      if (tic.concede(winner, decision.reason)) {
        messageSeq++;
        say('em', decision.line);
        rememberExperience('tictactoe_chat', `Anh: ${text}; Sora: ${decision.line}`);
        storeLocalTurn(text, decision.line);
        return;
      }
    } else if (activeGame === 'chess' && !game.status().ended) {
      const decision = moodBasedConcession(sora.mood, sora.confidence);
      if (game.finishByConversation(decision.winner, decision.reason)) {
        messageSeq++; thinking = false;
        say('em', decision.line);
        rememberExperience('chess_chat', `Anh: ${text}; Sora: ${decision.line}`);
        finishIfEnded();
        gameId++;
        return;
      }
    }
  }
  // Chuyển trò qua câu nói nhưng không tạo bàn cờ hay lịch sử hội thoại mới.
  const simplified = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
  const wantsSwitch = /\b(choi|chuyen|sang|mo|doi|thu)\b/.test(simplified);
  const gameAliases = [
    ['tictactoe',/\b(tic\s*tac\s*toe|co\s*ca\s*ro\s*3\s*x\s*3)\b/],
    ['chess',/\bco\s*vua\b/],
    ['connect4',/\b(noi\s*4|connect\s*four|co\s*noi\s*4)\b/],
    ['gomoku',/\b(caro|co\s*caro|gomoku|noi\s*5)\b/],
    ['word',/\b(doan\s*tu|tu\s*bi\s*mat)\b/],
    ['reversi',/\b(co\s*lat|reversi|othello)\b/],
    ['battleship',/\b(ban\s*tau|battleship)\b/],
    ['detective',/\b(tham\s*tu|pha\s*an)\b/],
  ];
  const target=wantsSwitch&&gameAliases.find(([id,re])=>re.test(simplified));
  if (target) {
    const mode=target[0],changed=switchGame(mode);
    const answer=changed?`Em mở ${GAME_NAMES[mode]} rồi! Các ván khác vẫn được giữ nguyên.`:'Mình đang ở đúng trò này rồi anh.';
    say('em',answer,{record:'chat'});storeLocalTurn(text,answer);return;
  }
  if (/\b(goi y|giup anh|manh moi)\b/.test(simplified)&&HUB_IDS.includes(activeGame)) {
    const answer=hub.hint();say('em',answer,{record:'chat'});storeLocalTurn(text,answer);return;
  }
  const boardIntent = chessChatIntent(text);
  if (boardIntent === 'rematch') {
    const answer = restartActiveGame();
    say('em', answer, { record:'chat' });
    storeLocalTurn(text, answer);
    return;
  }
  if (boardIntent === 'gentle' || boardIntent === 'serious') {
    playStyle = boardIntent;
    sora.setPlayStyle(playStyle);
    try { localStorage.setItem(STYLE_KEY, playStyle); } catch { /* Chỉ lưu nếu được phép */ }
    hub.setStyle(playStyle);
    const answer = HUB_IDS.includes(activeGame)
      ? (playStyle==='gentle' ? 'Em sẽ đánh nhẹ tay hơn một chút nhé anh, nhưng vẫn chơi đúng luật.' : 'Em sẽ tập trung và chơi hết sức trong trò này!')
      : sora.choose(boardIntent);
    say('em', answer, { record:'chat' });
    storeLocalTurn(text, answer);
    return;
  }
  // KHÔNG giả làm hội thoại AI bằng một câu có sẵn. Khi anh nhắn, gửi đúng
  // lời anh cho cùng Agent Python/SQLite mà Sora RT đang sử dụng.
  const pending = displayLine('em', '');
  pending.classList.add('pending');
  pending.stopGlitch = startGlitchStatus(pending.querySelector('.message__body'));
  const modeAtSubmit = activeGame;
  chatQueue = chatQueue.then(() => respondToUser(text, pending, modeAtSubmit),
    () => respondToUser(text, pending, modeAtSubmit));
});

dialogue.forEach(({ who, text }) => displayLine(who, text));
syncSharedHistory();
window.soraChess?.onHistoryChanged?.(() => {
  if (!manualChatBusy) syncSharedHistory();
});
window.soraChess?.onForget?.(clearDialogue);
window.soraChess?.forgetToken?.().then((token) => {
  const key = 'sora.chess.forget-version.v1';
  const stored = localStorage.getItem(key);
  if (stored !== null && String(token) !== stored) clearDialogue();
  localStorage.setItem(key, String(token));
}).catch(() => {});
window.soraChess?.personality?.().then((result) => {
  if (result?.ok && result.personality) {
    personality = result.personality;
    chessSkill = Math.max(chessSkill, Number(personality.chess_skill) || 0);
    sora.setPreferences({ ...personality, chess_skill:chessSkill });
    saveStudy();
  }
}).catch(() => {});
if (activeGame === 'chess') draw();
else if (activeGame === 'tictactoe') tic.activate();
else hub.activate(activeGame);
// Chỉ chào lần đầu mở cửa sổ; chuyển tab/ván mới không được xóa DIALOG.
say('em', activeGame === 'chess' ? sora.greet() : activeGame === 'tictactoe'
  ? 'Tic Tac Toe đang sẵn sàng rồi anh! Anh cầm X, em cầm O nhé.'
  : `${GAME_NAMES[activeGame]} sẵn sàng rồi! Mình cùng chơi nhé anh.`);
