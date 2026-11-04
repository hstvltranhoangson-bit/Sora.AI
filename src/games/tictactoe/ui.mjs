import { TicTacToeGame, WIN_LINES } from './engine.mjs';
import { chooseTicTacToeMove } from './companion.mjs';

const GAME_KEY = 'sora.tictactoe.board.v1';
const SCORE_KEY = 'sora.tictactoe.score.v1';
const STUDY_KEY = 'sora.tictactoe.learning.v1';
const pick = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (number, a, b) => Math.max(a, Math.min(b, number));
const read = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
};
const save = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* Lưu offline không bắt buộc */ }
};

// Bộ điều khiển trò chơi dùng chung DIALOG/VOICE/Agent của cờ vua; không tạo
// một hộp chat, SQLite hay luồng AI thứ hai.
export class TicTacToeUI {
  constructor({board, status, scores, counter, say, remember, expand, style, isActive, onMood}) {
    this.boardEl = board;
    this.statusEl = status;
    this.scoresEl = scores;
    this.counterEl = counter;
    this.say = say;
    this.remember = remember;
    this.expand = expand;
    this.style = style;
    this.onMood = onMood || (()=>{});
    this.isActive = isActive;
    this.game = TicTacToeGame.restore(read(GAME_KEY, null));
    const score = read(SCORE_KEY, {});
    this.scores = Object.fromEntries(['anh','em','hoa'].map(k => [k, Number.isSafeInteger(score[k]) && score[k] >= 0 ? score[k] : 0]));
    const study = read(STUDY_KEY, {});
    this.skill = Number.isFinite(study.skill) ? clamp(study.skill, 0.25, 0.92) : 0.40;
    this.mood = 'playful';
    this.confidence = 0.50;
    this.round = 0;
    this.timer = null;
    this.finishedRecorded = this.game.status().ended;
    board.addEventListener('click', (event) => {
      const cell = event.target.closest('[data-index]');
      if (!cell || !this.isActive() || this.game.turn !== 'X' || this.game.status().ended) return;
      this.playUser(Number(cell.dataset.index));
    });
    this.draw();
  }

  getContext() {
    const status = this.game.status();
    return {
      board:this.game.board.map(mark => mark || '-'),
      toMove:status.ended ? 'none' : this.game.turn,
      moveCount:this.game.history.length,
      winner:status.winner || 'draw/none',
      reason:status.reason,
      lastMove:this.game.history.at(-1)?.index ?? null,
      mood:this.mood, skill:this.skill, style:this.style(),
    };
  }

  setMood(lastMove) {
    const state = this.game.status();
    if (state.ended) {
      this.mood = state.winner === 'O' ? 'excited' : state.winner === 'X' ? 'sad' : 'calm';
      this.confidence = state.winner === 'O' ? 0.95 : state.winner === 'X' ? 0.10 : 0.5;
      this.onMood(this.mood);
      return;
    }
    const open = WIN_LINES.filter(line => line.every(i => this.game.board[i] !== 'X'));
    const danger = WIN_LINES.some(line => line.filter(i => this.game.board[i] === 'X').length === 2 &&
      line.some(i => !this.game.board[i]));
    this.confidence = clamp(0.50 + (open.length - 4) * 0.04 - (danger ? 0.19 : 0) + (this.skill - 0.4) * 0.1, 0.12, 0.88);
    this.mood = danger ? 'worried' : this.confidence > 0.65 ? 'excited' : 'playful';
    if (lastMove?.player === 'X' && this.game.history.length <= 1) this.mood = 'curious';
    this.onMood(this.mood);
  }

  reaction(move) {
    const state = this.game.status();
    const pos = move ? `hàng ${Math.floor(move.index / 3) + 1}, cột ${move.index % 3 + 1}` : '';
    if (state.ended) {
      if (state.winner === 'O') return pick([
        `Em đã nối đủ ba ô rồi, anh nhìn đường thắng của em đi! ♡`,
        `Hihi, em thắng ở ${pos}! Anh có muốn phục thù không?`,
      ]);
      if (state.winner === 'X') return pick([
        `Anh nối được ba dấu X rồi! Em thua ván này, nhưng em nhớ đấy nhé.`,
        `Ơ kìa, anh thắng thật rồi… Em đòi tái đấu!`,
      ]);
      return pick(['Không còn ô trống rồi, mình hòa nhau nhé anh.', 'Hòa rồi! Hai đứa đều không chịu nhường nhỉ.']);
    }
    if (move?.player === 'X') return pick([
      `Anh đánh X vào ${pos} à? Em đang tìm cách đáp lại đây.`,
      `Em thấy dấu X ở ${pos} rồi. Để xem nước kế tiếp thế nào nhé!`,
    ]);
    return pick([
      `Em đặt O ở ${pos}. Đến lượt anh rồi đấy!`,
      `Ô ${pos} em chọn rồi nhé. Anh tính chặn em hay tấn công đây?`,
    ]);
  }

  draw() {
    if (!this.isActive()) return;
    const state = this.game.status();
    const cells = this.game.board.map((mark, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tic-cell ' + (mark ? '' : 'is-empty');
      button.dataset.index = String(index);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `Hàng ${Math.floor(index / 3) + 1}, cột ${index % 3 + 1}: ${mark || 'trống'}`);
      button.disabled = Boolean(mark || state.ended || this.game.turn !== 'X');
      if (state.line.includes(index)) button.classList.add('is-winning');
      if (mark) {
        const symbol = document.createElement('span');
        symbol.className = `tic-symbol is-${mark.toLowerCase()}`;
        symbol.textContent = mark;
        button.append(symbol);
      }
      return button;
    });
    this.boardEl.replaceChildren(...cells);
    this.boardEl.setAttribute('aria-busy', String(this.game.turn === 'O' && !state.ended));
    this.statusEl.querySelector('b').textContent = state.ended ?
      state.winner === 'X' ? 'Line THẮNG!' : state.winner === 'O' ? 'Sora THẮNG!' : 'HÒA RỒI!' :
      this.game.turn === 'X' ? 'ĐẾN LƯỢT Line' : 'Sora ĐANG NGHĨ…';
    this.statusEl.querySelector('small').textContent = state.ended ? '' : this.game.turn === 'X' ? '(X)' : '(O)';
    this.statusEl.style.borderLeftColor = state.winner === 'X' ? '#24f5a0' : state.winner === 'O' ? '#ff285e' : '#24f5a0';
    this.counterEl.textContent = `LƯỢT ${String(this.game.history.length + 1).padStart(2, '0')}`;
    this.scoresEl.textContent = `Line ${this.scores.anh} thắng · Sora ${this.scores.em} thắng · ${this.scores.hoa} hòa`;
  }

  persist() { save(GAME_KEY, this.game.snapshot()); }

  afterMove(move) {
    this.setMood(move);
    this.persist();
    this.draw();
    if (this.finishIfEnded()) return;
    const phrase = this.reaction(move);
    this.say('em', phrase);
    if (move.player === 'X') this.scheduleSora();
    else this.expand(phrase, `Sora vừa đặt O ở hàng ${Math.floor(move.index/3)+1}, cột ${move.index%3+1}.`, true, 'tictactoe');
  }

  playUser(index) {
    if (this.game.turn !== 'X' || !this.isActive()) return false;
    const move = this.game.play(index);
    if (!move) return false;
    this.afterMove(move);
    return true;
  }

  scheduleSora() {
    if (!this.isActive() || this.timer || this.game.turn !== 'O' || this.game.status().ended) return;
    const round = this.round;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (round !== this.round || !this.isActive() || this.game.status().ended || this.game.turn !== 'O') return;
      const index = chooseTicTacToeMove(this.game, { style:this.style(), skill:this.skill, mood:this.mood });
      if (index === null) return;
      const move = this.game.play(index);
      if (move) this.afterMove(move);
    }, 430 + Math.random() * 350);
  }

  finishIfEnded() {
    const state = this.game.status();
    if (!state.ended) return false;
    if (this.finishedRecorded) return true;
    this.finishedRecorded = true;
    this.cancelTimer();
    const winner = state.winner === 'X' ? 'anh' : state.winner === 'O' ? 'em' : 'hoa';
    this.scores[winner]++;
    this.skill = clamp(this.skill + 0.025, 0.25, 0.92);
    save(STUDY_KEY, { skill:this.skill });
    save(SCORE_KEY, this.scores);
    const name = state.winner === 'X' ? 'Line thắng' : state.winner === 'O' ? 'Sora thắng' : 'hai bên hòa';
    this.remember('tictactoe_result', `Tic Tac Toe: ${name} sau ${this.game.history.length} lượt; lý do ${state.reason}.`,
      state.winner || 'draw');
    if (!['sora-yields','user-concedes'].includes(state.reason)) this.say('em', this.reaction(this.game.history.at(-1)));
    this.draw();
    return true;
  }

  concede(winner, reason) {
    if (!this.game.finishByConversation(winner, reason)) return false;
    this.setMood(null);
    this.persist();
    this.finishIfEnded();
    return true;
  }

  cancelTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  activate() { this.draw(); this.scheduleSora(); }
  deactivate() { this.cancelTimer(); this.round++; }

  newGame() {
    this.deactivate();
    this.game = new TicTacToeGame();
    this.mood = 'playful'; this.confidence = 0.5;
    this.finishedRecorded = false;
    this.persist(); this.draw();
    return pick([
      'Tic Tac Toe ván mới rồi! Anh cầm X, em cầm O. Anh đi trước nhé.',
      'Em đã dọn bàn 3×3 sạch sẽ rồi. Anh muốn đặt X vào ô nào trước? ♡',
      'Đổi chiến trường thôi anh! Lần này em sẽ canh ba ô thẳng hàng thật kỹ.',
    ]);
  }
}
