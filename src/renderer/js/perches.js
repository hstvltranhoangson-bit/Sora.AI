// Các phép tính vị trí nghỉ thuần JavaScript để có thể kiểm thử không cần GPU.
export const USER_PLACEMENT_PAUSE_MS = 10_000;

export function placementHoldUntil(now) {
  return now + USER_PLACEMENT_PAUSE_MS;
}

// Chuyển tư thế êm: nguồn cũ mờ dần trước khi tư thế mới hiện rõ.
// Chỉ chồng nét trong một khoảng rất ngắn nên tránh cảm giác dán 2 sprite lên nhau.
export function poseCrossfade(from, to, elapsed, duration = 320) {
  const kinds = ['stand', 'sit', 'lie'];
  const opacity = { stand: 0, sit: 0, lie: 0 };
  if (!kinds.includes(from) || !kinds.includes(to)) return { stand: 1, sit: 0, lie: 0 };
  if (from === to || elapsed >= duration) { opacity[to] = 1; return opacity; }
  const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)));
  const ease = (v) => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
  opacity[from] = 1 - ease(progress / 0.58);
  opacity[to] = ease((progress - 0.42) / 0.58);
  return opacity;
}

// Khớp gối xoay nguyên đoạn cẳng chân khi bề mặt ngồi thấp. Góc xoay giữ
// nguyên chiều dài của chân trong ảnh RT, thay vì ép chân ngắn lại hoặc nâng hông.
export function taskbarKneeBend(taskbarHeight, scale, {
  hip = 232, knee = 305, feet = 418, thighScale = 0.3, margin = 9,
} = {}) {
  const thighOnScreen = (knee - hip) * thighScale;
  const shin = feet - knee;
  const available = Math.max(0, taskbarHeight - margin) / Math.max(0.01, scale);
  const cosine = Math.max(0, Math.min(1, (available - thighOnScreen) / shin));
  return Math.acos(cosine); // 0 = thõng chân; pi/2 = gập chân ngang
}

export function isRecentlyDisplaced(point, zones, now = performance.now()) {
  return zones.some((z) => now < z.until && Math.hypot(point.x - z.x, point.y - z.y) < z.radius);
}

export function chooseHorizontalPerch({ windows = [], bar, previous = null, mode = 'surfaces',
  canSit = () => true, covered = () => false, avoid = () => false,
  recentIds = [], random = Math.random } = {}) {
  const between = (a, b) => a + (b - a) * random();
  const options = [];
  for (const win of windows) {
    if (!canSit(win)) continue;
    const start = Math.max(65, win.w * 0.16);
    const end = Math.min(win.w - 65, win.w * 0.82);
    if (end <= start) continue;
    const dx = between(start, end);
    const possible = [dx, start, end, (start + end) / 2];
    const safe = possible.find((p) => !covered(win, win.x + p) && !avoid(win.x + p, win.y));
    if (safe !== undefined) options.push({ win, dx: safe });
  }
  if (bar?.w > 240 && bar.h > 30) {
    const start = Math.max(75, bar.w * 0.13);
    const end = Math.min(bar.w - 75, bar.w * 0.87);
    if (end > start) {
      const dx = between(start, end);
      const safe = [dx, start, end, (start + end) / 2]
        .find((p) => !avoid(bar.x + p, bar.y));
      if (safe !== undefined) options.push({ win: bar, dx: safe });
    }
  }
  const fresh = options.filter((candidate) =>
    candidate.win.id !== previous?.id || Math.abs(candidate.dx - previous.dx) > 130);
  const choices = fresh.length ? fresh : options;
  if (!choices.length) return null;
  // Cửa sổ/mép ngang vừa xuất hiện tạo sự tò mò: Sora thường muốn thử đến đó
  // ngồi hoặc nằm, nhưng không nhất thiết lần nào cũng làm vậy.
  const discovered = choices.filter((candidate) => recentIds.includes(candidate.win.id));
  if (mode === 'surfaces' && discovered.length && random() < 0.84) {
    return discovered[Math.min(discovered.length - 1, Math.floor(random() * discovered.length))];
  }
  const taskbar = choices.find((candidate) => candidate.win.id === 'taskbar');
  if (taskbar && random() < (mode === 'taskbar' ? 0.65 : 0.23)) return taskbar;
  const other = choices.filter((candidate) => candidate.win.id !== 'taskbar');
  const pool = other.length ? other : choices;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
