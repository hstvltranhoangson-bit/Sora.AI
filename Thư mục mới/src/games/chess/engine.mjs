// Cờ vua cục bộ: không lệ thuộc mạng, không cần tải thư viện từ CDN.
// Tọa độ nội bộ: hàng 0 là hàng 8, cột 0 là cột a.
export const FILES = 'abcdefgh';
export const PIECES = { P: 100, N: 320, B: 335, R: 500, Q: 900, K: 20_000 };
const KNIGHT = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const STRAIGHTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const sq = (r, c) => `${FILES[c]}${8 - r}`;
export const parseSq = (str) => {
  if (!/^[a-h][1-8]$/.test(str)) return null;
  return [8 - Number(str[1]), FILES.indexOf(str[0])];
};

export class ChessGame {
  constructor({ empty = false, variant = 'standard' } = {}) {
    this.variant = variant === 'free' ? 'free' : 'standard';
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    this.turn = 'w';
    this.castling = 'KQkq';
    this.enPassant = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.resultOverride = null;
    if (!empty) this.reset();
  }

  reset() {
    const major = 'RNBQKBNR';
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      this.board[0][c] = `b${major[c]}`;
      this.board[1][c] = 'bP';
      this.board[6][c] = 'wP';
      this.board[7][c] = `w${major[c]}`;
    }
    this.turn = 'w'; this.castling = 'KQkq'; this.enPassant = null;
    this.halfmove = 0; this.fullmove = 1; this.history = [];
    this.resultOverride = null;
  }

  clone() {
    const next = new ChessGame({ empty: true, variant: this.variant });
    next.board = this.board.map((row) => row.slice());
    next.turn = this.turn; next.castling = this.castling;
    next.enPassant = this.enPassant ? [...this.enPassant] : null;
    next.halfmove = this.halfmove; next.fullmove = this.fullmove;
    next.history = this.history.slice();
    next.resultOverride = this.resultOverride ? { ...this.resultOverride } : null;
    return next;
  }

  piece(pos) { return this.board[pos[0]][pos[1]]; }
  king(color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (this.board[r][c] === `${color}K`) return [r, c];
    }
    return null;
  }

  attacked(r, c, by) {
    // Các ô bị quân đối phương khống chế, kể cả quân đang bị ghim.
    const pawnRow = r + (by === 'w' ? 1 : -1);
    for (const dc of [-1, 1]) if (inside(pawnRow, c + dc)
      && this.board[pawnRow][c + dc] === `${by}P`) return true;
    for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc)
      && this.board[r + dr][c + dc] === `${by}N`) return true;
    for (const [dr, dc] of [...DIAGONALS, ...STRAIGHTS]) {
      let nr = r + dr, nc = c + dc, distance = 1;
      while (inside(nr, nc)) {
        const p = this.board[nr][nc];
        if (p) {
          if (p[0] === by) {
            const type = p[1];
            const diagonal = dr !== 0 && dc !== 0;
            if (type === 'Q' || (diagonal ? type === 'B' : type === 'R')
              || (type === 'K' && distance === 1)) return true;
          }
          break;
        }
        nr += dr; nc += dc; distance++;
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    const at = this.king(color);
    return !at || this.attacked(at[0], at[1], color === 'w' ? 'b' : 'w');
  }

  pseudo(color = this.turn) {
    const moves = [];
    const push = (from, to, options = {}) => {
      if (!inside(...to)) return;
      const target = this.piece(to);
      if (target?.[0] === color || (this.variant !== 'free' && target?.[1] === 'K')) return;
      moves.push({ from, to, piece: this.piece(from), capture: target, ...options });
    };
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const piece = this.board[r][c];
      if (!piece || piece[0] !== color) continue;
      const type = piece[1], from = [r, c];
      if (type === 'P') {
        const step = color === 'w' ? -1 : 1;
        const promote = r + step === (color === 'w' ? 0 : 7);
        const pawnPush = (to, options = {}) => {
          if (promote) for (const promotion of 'QRBN') push(from, to, { ...options, promotion });
          else push(from, to, options);
        };
        if (inside(r + step, c) && !this.board[r + step][c]) {
          pawnPush([r + step, c]);
          if (r === (color === 'w' ? 6 : 1) && !this.board[r + step * 2][c])
            pawnPush([r + step * 2, c], { double: true });
        }
        for (const dc of [-1, 1]) {
          const to = [r + step, c + dc];
          if (!inside(...to)) continue;
          const target = this.piece(to);
          if (target?.[0] === (color === 'w' ? 'b' : 'w')) pawnPush(to);
          if (this.enPassant && to[0] === this.enPassant[0] && to[1] === this.enPassant[1])
            push(from, to, { enPassant: true, capture: `${color === 'w' ? 'b' : 'w'}P` });
        }
      } else if (type === 'N') {
        for (const [dr, dc] of KNIGHT) push(from, [r + dr, c + dc]);
      } else if (type === 'K') {
        for (const [dr, dc] of [...DIAGONALS, ...STRAIGHTS]) push(from, [r + dr, c + dc]);
        const home = color === 'w' ? 7 : 0;
        const enemy = color === 'w' ? 'b' : 'w';
        if (r === home && c === 4 && (this.variant === 'free' || !this.inCheck(color))) {
          const kingSide = color === 'w' ? 'K' : 'k';
          const queenSide = color === 'w' ? 'Q' : 'q';
          if (this.castling.includes(kingSide) && this.board[home][7] === `${color}R`
            && !this.board[home][5] && !this.board[home][6]
            && (this.variant === 'free' || (!this.attacked(home, 5, enemy) && !this.attacked(home, 6, enemy))))
            push(from, [home, 6], { castle: 'king' });
          if (this.castling.includes(queenSide) && this.board[home][0] === `${color}R`
            && !this.board[home][1] && !this.board[home][2] && !this.board[home][3]
            && (this.variant === 'free' || (!this.attacked(home, 3, enemy) && !this.attacked(home, 2, enemy))))
            push(from, [home, 2], { castle: 'queen' });
        }
      } else {
        const dirs = type === 'B' ? DIAGONALS : type === 'R' ? STRAIGHTS : [...DIAGONALS, ...STRAIGHTS];
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inside(nr, nc)) {
            const occupant = this.board[nr][nc];
            if (occupant?.[0] === color) break;
            push(from, [nr, nc]);
            if (occupant) break;
            nr += dr; nc += dc;
          }
        }
      }
    }
    return moves;
  }

  apply(move, { record = true } = {}) {
    const { from, to, piece, promotion, castle, enPassant } = move;
    const color = piece[0];
    const dest = this.piece(to);
    const taken = enPassant ? `${color === 'w' ? 'b' : 'w'}P` : dest;
    this.board[to[0]][to[1]] = promotion ? `${color}${promotion}` : piece;
    this.board[from[0]][from[1]] = null;
    if (enPassant) this.board[from[0]][to[1]] = null;
    if (castle) {
      const rank = from[0], rookCol = castle === 'king' ? 7 : 0, rookTo = castle === 'king' ? 5 : 3;
      this.board[rank][rookCol] = null;
      this.board[rank][rookTo] = `${color}R`;
    }
    if (piece[1] === 'K') this.castling = this.castling.replace(color === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (piece[1] === 'R') {
      if (from[0] === 7 && from[1] === 0) this.castling = this.castling.replace('Q', '');
      if (from[0] === 7 && from[1] === 7) this.castling = this.castling.replace('K', '');
      if (from[0] === 0 && from[1] === 0) this.castling = this.castling.replace('q', '');
      if (from[0] === 0 && from[1] === 7) this.castling = this.castling.replace('k', '');
    }
    if (taken?.[1] === 'R') {
      if (to[0] === 7 && to[1] === 0) this.castling = this.castling.replace('Q', '');
      if (to[0] === 7 && to[1] === 7) this.castling = this.castling.replace('K', '');
      if (to[0] === 0 && to[1] === 0) this.castling = this.castling.replace('q', '');
      if (to[0] === 0 && to[1] === 7) this.castling = this.castling.replace('k', '');
    }
    this.enPassant = move.double ? [(from[0] + to[0]) / 2, from[1]] : null;
    this.halfmove = piece[1] === 'P' || taken ? 0 : this.halfmove + 1;
    if (color === 'b') this.fullmove++;
    this.turn = color === 'w' ? 'b' : 'w';
    if (record) this.history.push({ notation: `${sq(...from)}${sq(...to)}${promotion?.toLowerCase() || ''}`, piece, captured: taken, color });
    return { ...move, capture: taken };
  }

  legalMoves(color = this.turn) {
    // Cờ tự do: giữ quy tắc đi của từng quân, nhưng không khóa quân/vua do bị chiếu.
    if (this.variant === 'free') return this.pseudo(color);
    return this.pseudo(color).filter((move) => {
      const next = this.clone();
      next.apply(move, { record: false });
      return !next.inCheck(color);
    });
  }

  play(from, to, promotion = 'Q') {
    if (typeof from === 'string') from = parseSq(from);
    if (typeof to === 'string') to = parseSq(to);
    if (!from || !to) return null;
    const move = this.legalMoves().find((m) => m.from[0] === from[0] && m.from[1] === from[1]
      && m.to[0] === to[0] && m.to[1] === to[1] && (!m.promotion || m.promotion === promotion));
    return move ? this.apply(move) : null;
  }

  status() {
    if (this.resultOverride) return { ...this.resultOverride };
    if (this.variant === 'free') {
      if (!this.king('w')) return { ended:true, reason:'king-captured', winner:'b', check:false };
      if (!this.king('b')) return { ended:true, reason:'king-captured', winner:'w', check:false };
      const legal = this.legalMoves();
      if (!legal.length) return { ended:true, reason:'no-moves', winner:null, check:this.inCheck() };
      if (this.halfmove >= 100) return { ended:true, reason:'fifty-move', winner:null, check:this.inCheck() };
      return { ended:false, reason:null, winner:null, check:this.inCheck() };
    }
    const legal = this.legalMoves();
    const check = this.inCheck();
    if (!legal.length) return { ended: true, reason: check ? 'checkmate' : 'stalemate',
      winner: check ? (this.turn === 'w' ? 'b' : 'w') : null, check };
    if (this.halfmove >= 100) return { ended: true, reason: 'fifty-move', winner: null, check };
    return { ended: false, reason: null, winner: null, check };
  }

  finishByConversation(winner, reason = 'concession') {
    if (this.status().ended || !['w', 'b', null].includes(winner)) return false;
    this.resultOverride = { ended:true, winner, reason, check:false };
    return true;
  }

  evaluation() {
    let score = 0; // số dương: Sora (đen) có lợi thế
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const piece = this.board[r][c];
      if (!piece) continue;
      const central = 3.5 - (Math.abs(c - 3.5) + Math.abs(r - 3.5)) * 0.5;
      const advance = piece[0] === 'b' ? r - 1 : 6 - r;
      let bonus = piece[1] === 'P' ? advance * 6 + central * 3 :
        piece[1] === 'N' || piece[1] === 'B' ? central * 8 : 0;
      if (piece[1] === 'K') bonus = 0;
      score += (piece[0] === 'b' ? 1 : -1) * (PIECES[piece[1]] + bonus);
    }
    return score;
  }

  toFEN() {
    const rows = this.board.map((row) => {
      let text = '', spaces = 0;
      for (const p of row) {
        if (!p) { spaces++; continue; }
        if (spaces) { text += spaces; spaces = 0; }
        text += p[0] === 'w' ? p[1] : p[1].toLowerCase();
      }
      return text + (spaces || '');
    });
    return `${rows.join('/')} ${this.turn} ${this.castling || '-'} ${this.enPassant ? sq(...this.enPassant) : '-'} ${this.halfmove} ${this.fullmove}`;
  }
}
