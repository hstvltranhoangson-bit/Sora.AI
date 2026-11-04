import { PIECES } from './engine.mjs';
import { experienceBias } from './learning.mjs';

const LINES = {
  greeting: [
    'Anh cầm quân trắng nhé. Em không nhường đâu… chắc thế. ♡',
    'Được rồi anh, trận này em sẽ chơi thật nghiêm túc! Một chút thôi~',
  ],
  neutral: [
    'Ừm… để em nghĩ nước này một chút.',
    'Anh đi như vậy à? Em nhớ rồi đó.',
    'Em đang nhìn cả bàn cờ đấy nhé.',
  ],
  winning: [
    'Hihi, hình như thế trận đang nghiêng về phía em rồi!',
    'Anh cẩn thận nha, em bắt đầu thấy cơ hội rồi đấy.',
    'Đừng nhìn em kiểu đó, quân cờ tự tìm đường đến thôi! ♡',
  ],
  worried: [
    'Ơ kìa… sao anh lại nhìn ra nước đó được chứ? Em hơi lo rồi.',
    'Hừm, em không thích thế này lắm. Cho em nghĩ đã!',
    'Anh giỏi thật đó… nhưng em vẫn chưa chịu thua đâu.',
  ],
  capture: [
    'A! Em lấy được quân đó rồi! Anh có định đòi lại không?',
    'Xin lỗi quân cờ của anh nha… nhiệm vụ của em mà!',
  ],
  lostPiece: [
    'Khoan đã, quân đó của em mà! Anh xấu tính ghê…',
    'Á á! Em vừa mất quân đó sao? Để em gỡ lại!',
  ],
  check: [
    'Chiếu tướng nhé anh! Anh tìm đường thoát đi nào.',
    'Nè anh, vua của anh đang hơi nguy hiểm đó!',
  ],
  checked: [
    'Oái! Anh chiếu em rồi à? Được, em sẽ bình tĩnh…',
    'Không công bằng! À không, em chỉ đùa thôi. Để em cứu vua đã.',
  ],
  win: ['Em thắng rồi! Nhưng anh chơi với em thêm một ván nữa được không? ♡'],
  lose: ['Em thua mất rồi… Hừ, anh giỏi thật. Cho em phục thù nhé?'],
  draw: ['Hòa rồi! Hay là mình thử một ván khác, anh?'],
  gentle: [
    'Anh muốn em nhường một chút hả? Được thôi, nhưng đừng chủ quan đấy nhé~',
    'Ừm, em sẽ đi nhẹ tay hơn. Anh cứ thử ý tưởng của mình đi!',
    'Vậy em cho anh thêm chút khoảng trống nhé. Nhưng bắt được quân ngon thì em vẫn vui đó!',
  ],
  serious: [
    'Hừm, anh đã nói thế thì em không nương tay nữa đâu nha!',
    'Được, em sẽ chơi hết sức mình. Anh đừng hối hận đó~',
    'Anh khích em đấy à? Được thôi, mình xem ai đọc được bàn cờ tốt hơn nhé!',
  ],
  rematch: [
    'Lại một ván nữa à? Được, em đã xếp bàn cờ xong rồi đây!',
    'Có ngay! Bàn cờ mới, chiến thuật mới. Em chờ nước đầu tiên của anh nhé.',
    'Hihi, tái đấu! Em vẫn nhớ những nước cờ đáng chú ý ở ván trước đấy.',
  ],
};

export class ChessCompanion {
  constructor(random = Math.random, preferences = {}) {
    this.random = random;
    this.playStyle = 'natural';
    this.setPreferences(preferences);
    this.mood = 'playful';
    this.confidence = 0.5;
    this.last = '';
  }

  setPreferences(preferences = {}) {
    const clamp = (value, fallback) => Number.isFinite(value) ?
      Math.max(0.1, Math.min(0.9, value)) : fallback;
    this.playfulness = clamp(preferences.playfulness, 0.55);
    this.courage = clamp(preferences.chess_courage, 0.5);
    this.chessSkill = Math.max(this.chessSkill || 0, clamp(preferences.chess_skill, 0.34));
  }

  setPlayStyle(style) {
    if (!['natural', 'gentle', 'serious'].includes(style)) return false;
    this.playStyle = style;
    return true;
  }

  strategy(memory = {}) {
    let mercy = 0;
    if (this.playStyle === 'gentle') mercy = 0.76;
    else if (this.playStyle === 'natural' && this.confidence > 0.73)
      mercy = this.mood === 'playful' ? 0.18 : 0.07;
    return { skill:this.chessSkill, mercy, memory };
  }

  choose(key) {
    const options = LINES[key] || LINES.neutral;
    const choices = options.filter((line) => line !== this.last);
    const bag = choices.length ? choices : options;
    this.last = bag[Math.floor(this.random() * bag.length)] || bag[0];
    return this.last;
  }

  greet() { return this.choose('greeting'); }

  react(game, lastMove, actor) {
    const state = game.status();
    if (state.ended) {
      this.mood = state.winner === 'b' ? 'proud' : state.winner === 'w' ? 'sad' : 'calm';
      return this.choose(state.winner === 'b' ? 'win' : state.winner === 'w' ? 'lose' : 'draw');
    }
    const score = game.evaluation();
    this.confidence = Math.max(0.04, Math.min(0.96, 0.5 + score / 2800 + (this.courage - 0.5) * 0.14));
    this.mood = this.confidence < 0.36 ? 'worried' : this.confidence > 0.68 ? 'excited' :
      this.playfulness >= 0.43 ? 'playful' : 'calm';
    if (state.check) return this.choose(actor === 'b' ? 'check' : 'checked');
    if (lastMove?.capture && PIECES[lastMove.capture[1]] >= 300)
      return this.choose(actor === 'b' ? 'capture' : 'lostPiece');
    return this.choose(this.confidence < 0.32 ? 'worried' : this.confidence > 0.7 ? 'winning' : 'neutral');
  }
}

function search(game, depth, alpha, beta) {
  const state = game.status();
  if (state.ended) return state.winner === 'b' ? 100000 + depth :
    state.winner === 'w' ? -100000 - depth : 0;
  const legal = game.legalMoves();
  if (!legal.length) return game.inCheck() ? (game.turn === 'b' ? -100000 - depth : 100000 + depth) : 0;
  if (depth <= 0 || game.halfmove >= 100) return game.evaluation();
  legal.sort((a, b) => (PIECES[b.capture?.[1]] || 0) - (PIECES[a.capture?.[1]] || 0));
  const max = game.turn === 'b';
  let best = max ? -Infinity : Infinity;
  for (const move of legal) {
    const child = game.clone();
    child.apply(move, { record: false });
    const result = search(child, depth - 1, alpha, beta);
    best = max ? Math.max(best, result) : Math.min(best, result);
    if (max) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseSoraMove(game, { skill = 0.34, mercy = 0, memory = {} } = {}, random = Math.random) {
  if (game.turn !== 'b') return null;
  const legal = game.legalMoves();
  if (!legal.length) return null;
  // Kinh nghiệm tăng sau mỗi ván: giảm nhiễu lựa chọn, rồi đọc sâu thêm
  // một lượt khi đủ kinh nghiệm. Giới hạn 3 để phù hợp laptop CPU yếu.
  const learned = Math.max(0.1, Math.min(0.9, Number.isFinite(skill) ? skill : 0.34));
  const kindness = Math.max(0, Math.min(1, Number.isFinite(mercy) ? mercy : 0));
  const depth = learned >= 0.53 ? 3 : 2;
  const noise = 88 - learned * 84;
  const currentFen = game.toFEN();
  const ratings = [];
  legal.sort((a, b) => (PIECES[b.capture?.[1]] || 0) - (PIECES[a.capture?.[1]] || 0));
  for (const move of legal) {
    const next = game.clone();
    next.apply(move, { record: false });
    const score = search(next, depth - 1, -Infinity, Infinity)
      + experienceBias(memory, currentFen, move)
      + (random() - 0.5) * noise;
    ratings.push({ move, score });
  }
  ratings.sort((a, b) => b.score - a.score);
  const best = ratings[0];
  if (kindness <= 0.01 || random() >= kindness * 0.8) return best.move;
  // "Nhường một chút" chọn nước kém tối ưu nhưng vẫn gần điểm tốt nhất,
  // tuyệt đối không tự chọn nước cực tệ để giả vờ thua.
  const close = ratings.filter((item) => item !== best &&
    item.score >= best.score - (30 + kindness * 170) && item.score <= best.score - 8);
  if (!close.length || best.score > 99000) return best.move;
  return close[Math.floor(random() * close.length)].move;
}
