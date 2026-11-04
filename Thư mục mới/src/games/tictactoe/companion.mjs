import { assess } from './engine.mjs';

// Minimax đủ 9 ô, có memo để chạy nhanh cả khi không có mạng/Ollama.
// Điểm dương có lợi cho Sora (O). Ưu tiên thắng sớm, kéo dài khi đang thua.
function minimax(board, turn, depth, cache) {
  const result = assess(board);
  if (result.ended) return result.winner === 'O' ? 10-depth : result.winner === 'X' ? depth-10 : 0;
  const key = board.map((v) => v || '-').join('') + turn + depth;
  if (cache.has(key)) return cache.get(key);
  let best = turn === 'O' ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue;
    board[i] = turn;
    const value = minimax(board, turn === 'O' ? 'X' : 'O', depth + 1, cache);
    board[i] = null;
    best = turn === 'O' ? Math.max(best, value) : Math.min(best, value);
  }
  cache.set(key, best);
  return best;
}

export function rankTicTacToeMoves(game) {
  if (game.turn !== 'O' || game.status().ended) return [];
  const cache = new Map(), entries = [];
  for (const index of game.legalMoves()) {
    const board = game.board.slice();
    board[index] = 'O';
    entries.push({ index, score:minimax(board, 'X', game.history.length + 1, cache) });
  }
  return entries.sort((a, b) => b.score - a.score);
}

export function chooseTicTacToeMove(game, { style='natural', skill=0.45, mood='playful' } = {}, random=Math.random) {
  const ranked = rankTicTacToeMoves(game);
  if (!ranked.length) return null;
  const best = ranked[0].score;
  const optimal = ranked.filter((entry) => entry.score === best);
  const pick = (items) => items[Math.min(items.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * items.length))].index;
  if (style === 'serious') return pick(optimal);

  // Lối chơi của Sora khác nhau theo chỉ đạo của anh và kinh nghiệm tích lũy;
  // chế độ nghiêm túc luôn chọn nước tối ưu, nhẹ tay vẫn có khả năng thắng.
  const learned = Math.max(0.2, Math.min(0.95, Number.isFinite(skill) ? skill : 0.45));
  const precision = style === 'gentle' ? 0.30 :
    Math.min(0.96, 0.54 + learned * 0.42 + (mood === 'worried' ? 0.06 : 0));
  if (random() < precision || ranked.length === optimal.length) return pick(optimal);
  const acceptable = ranked.filter((move) => move.score < best);
  // Nhường có kiểm soát; nếu không còn lựa chọn khác, đi nước hợp lệ.
  return pick(acceptable.length ? acceptable : optimal);
}
