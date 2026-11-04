// Sora nhớ những nước cờ đã dẫn đến thắng/thua ở các ván trước.
// Ký ức chiến thuật nhỏ, KHÔNG phải huấn luyện lại trọng số LLM.
const MAX_SAMPLES = 420;

export function positionKey(fen) {
  return String(fen || '').trim().split(/\s+/).slice(0, 4).join(' ');
}

export function moveKey(move) {
  if (!move || !Array.isArray(move.from) || !Array.isArray(move.to)) return '';
  return [...move.from, ...move.to, move.promotion || ''].join(':');
}

function keyOf(fen, move) {
  return `${positionKey(fen)}|${moveKey(move)}`;
}

export function experienceBias(memory = {}, fen, move) {
  const record = memory[keyOf(fen, move)];
  if (!record || !Number.isFinite(record.wins) || !Number.isFinite(record.losses)) return 0;
  const total = record.wins + record.losses + (record.draws || 0);
  return Math.max(-35, Math.min(35, 30 * (record.wins - record.losses) / (total + 2)));
}

export function learnFromCompletedGame(memory = {}, played = [], winner = '') {
  if (!['w', 'b', 'draw'].includes(winner) || !Array.isArray(played)) return memory;
  const updated = { ...memory };
  for (const sample of played.slice(0, 24)) {
    if (!sample?.fen || !sample?.move) continue;
    const key = keyOf(sample.fen, sample.move);
    if (!moveKey(sample.move)) continue;
    const before = updated[key] || { wins:0, losses:0, draws:0 };
    const record = {
      wins:Math.min(100, Number(before.wins || 0) + (winner === 'b' ? 1 : 0)),
      losses:Math.min(100, Number(before.losses || 0) + (winner === 'w' ? 1 : 0)),
      draws:Math.min(100, Number(before.draws || 0) + (winner === 'draw' ? 1 : 0)),
    };
    // Cập nhật thứ tự để giữ các thế cờ dùng gần đây khi phải giới hạn bộ nhớ.
    delete updated[key];
    updated[key] = record;
  }
  const keys = Object.keys(updated);
  if (keys.length <= MAX_SAMPLES) return updated;
  return Object.fromEntries(keys.slice(-MAX_SAMPLES).map((key) => [key, updated[key]]));
}
