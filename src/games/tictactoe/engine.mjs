// Tic Tac Toe 3×3 — luật thuần JavaScript, không phụ thuộc Electron/Ollama.
// Line là X và đi trước; Sora là O. Không thay đổi trò cờ vua hiện tại.
export const WIN_LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]);

export function assess(board) {
  for (const line of WIN_LINES) {
    if (board[line[0]] && line.every((cell) => board[cell] === board[line[0]]))
      return { ended:true, winner:board[line[0]], reason:'line', line:line.slice() };
  }
  if (board.every(Boolean)) return { ended:true, winner:null, reason:'draw', line:[] };
  return { ended:false, winner:null, reason:'playing', line:[] };
}

export class TicTacToeGame {
  constructor() {
    this.board = Array(9).fill(null);
    this.turn = 'X';
    this.history = [];
    this.forced = null;
  }

  status() { return this.forced || assess(this.board); }

  legalMoves() {
    return this.status().ended ? [] : this.board.flatMap((v, i) => v ? [] : [i]);
  }

  play(index) {
    if (!Number.isInteger(index) || index < 0 || index > 8 || this.status().ended || this.board[index]) return null;
    const player = this.turn;
    this.board[index] = player;
    this.history.push({ index, player });
    this.turn = player === 'X' ? 'O' : 'X';
    return { index, player, status:this.status() };
  }

  finishByConversation(winner, reason = 'user-concedes') {
    if (this.status().ended || !['X','O'].includes(winner) ||
        !['user-concedes','sora-yields'].includes(reason)) return false;
    this.forced = { ended:true, winner, reason, line:[] };
    return true;
  }

  snapshot() {
    return { moves:this.history.map((item) => item.index),
      forced:this.forced ? { winner:this.forced.winner, reason:this.forced.reason } : null };
  }

  static restore(saved) {
    const game = new TicTacToeGame();
    if (!saved || !Array.isArray(saved.moves) || saved.moves.length > 9) return game;
    for (const index of saved.moves) {
      // Phát lại từng lượt để không chấp nhận bàn cờ hỏng hoặc nước đi sau khi đã thắng.
      if (!game.play(index)) return new TicTacToeGame();
    }
    if (saved.forced && !game.status().ended)
      game.finishByConversation(saved.forced.winner, saved.forced.reason);
    return game;
  }
}
