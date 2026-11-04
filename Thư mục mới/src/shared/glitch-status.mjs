/**
 * Sora — per-glyph glitch while an AI response is pending.
 * Shared by the desktop DIALOG and chess DIALOG.
 *
 * The public API intentionally matches the existing project:
 *   const stop = startGlitchStatus(element);
 *   stop();
 *
 * Each displayed glyph changes on every frame, differs from every other
 * glyph on the same frame, and never repeats its immediately previous value.
 * One timer per active element; no timer per glyph and no unsafe HTML.
 */

const ALPHABET = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+=?<>[]{}|/\\~^');
const COLORS = ['green', 'red', 'white'];
const CELLS = 18;
const sessions = new WeakMap();

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function chooseGlyph(used, previous) {
  // There are many more possible glyphs than visible cells, so finding a
  // character unused this frame and different from the previous one is safe.
  const offset = randomInt(ALPHABET.length);
  for (let k = 0; k < ALPHABET.length; k += 1) {
    const next = ALPHABET[(offset + k) % ALPHABET.length];
    if (!used.has(next) && next !== previous) return next;
  }
  return 'X'; // Defensive fallback; unreachable for the default cell count.
}

export function startGlitchStatus(element, { intervalMs = 32, cells = CELLS } = {}) {
  if (!element) return () => {};
  // One active animation per element; old callbacks become inert.
  sessions.get(element)?.stop();
  const count = Math.max(4, Math.min(24, Math.floor(Number(cells) || CELLS)));
  const reduced = document.documentElement?.dataset?.motion === 'reduced' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  // Text still changes when Windows disables animations, but less often.
  const delay = reduced ? Math.max(240, intervalMs) : Math.max(24, Math.min(200, intervalMs));
  const oldAttrs = {
    label: element.getAttribute('aria-label'),
    live: element.getAttribute('aria-live'),
    role: element.getAttribute('role'),
  };
  element.classList.add('sora-glitch-wait', 'sora-glitch-v4');
  element.setAttribute('aria-label', 'Sora đang suy nghĩ');
  element.setAttribute('aria-live', 'off');
  element.setAttribute('role', 'status');

  const previous = Array(count).fill('');
  const previousTone = Array(count).fill(-1);
  const nodes = Array.from({ length: count }, () => {
    const span = document.createElement('span');
    span.className = 'sora-glitch-cell';
    span.setAttribute('aria-hidden', 'true');
    return span;
  });
  element.replaceChildren(...nodes);
  let stopped = false;
  let timer = null;
  let tick = 0;

  function renderFrame() {
    if (stopped) return;
    if (!element.isConnected) { stop(); return; }
    const used = new Set();
    tick += 1;
    for (let i = 0; i < nodes.length; i += 1) {
      const glyph = chooseGlyph(used, previous[i]);
      used.add(glyph);
      previous[i] = glyph;
      const span = nodes[i];
      span.textContent = glyph;
      // Independent tone and masking per cell; background masks give the
      // appearance of live censor bars without moving character positions.
      const toneIndex = previousTone[i] === -1
        ? randomInt(COLORS.length)
        : (previousTone[i] + 1 + randomInt(COLORS.length - 1)) % COLORS.length;
      previousTone[i] = toneIndex;
      const tone = COLORS[toneIndex];
      const maskRoll = Math.random();
      const mask = maskRoll < .24 ? 'sora-mask-full' :
                   maskRoll < .43 ? 'sora-mask-slice' : '';
      span.className = `sora-glitch-cell sora-tone-${tone}${mask ? ' ' + mask : ''}`;
      // No transforms or changing width: every character remains in one row.
    }
    element.dataset.soraGlitchTick = String(tick);
  }

  function restoreAttr(name, value) {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    if (sessions.get(element)?.stop === stop) sessions.delete(element);
    element.classList.remove('sora-glitch-wait', 'sora-glitch-v4');
    delete element.dataset.soraGlitchTick;
    restoreAttr('aria-label', oldAttrs.label);
    restoreAttr('aria-live', oldAttrs.live);
    restoreAttr('role', oldAttrs.role);
    // Do not erase an answer written by streaming code after animation began.
    if (element.firstChild === nodes[0]) element.replaceChildren();
  }

  sessions.set(element, { stop });
  renderFrame();
  timer = window.setInterval(renderFrame, delay);
  return stop;
}
