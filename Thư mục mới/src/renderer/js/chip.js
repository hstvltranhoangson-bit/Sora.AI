// Her two small forms, each on its own little canvas, drawn on twos and only while on screen.
//
// Mask: asleep a while, her mane and her body come apart and what's left is what she is at
// heart in the show, her green mask with its eyes, floating where she was, eyes shut. Now and
// then she cracks one open (her wink). A pointer coming over it stirs her (app.js wakes her).
//
// Chip: hide (Ctrl+Alt+C/menu). She collapses into a floating sliver of face: the neon
// green mask, blue eyes, red fringe, a detached white mouth and a small green shard. This
// remains clickable for restore and uses the same hand-drawn 12-fps cadence as her RT acts.

import { COLORS, drawMask } from './fx.js';
import { rand, reducedMotion } from './util.js';

const STEP = 1000 / 12;

// Approved original Sora hidden-face artwork. Never redraw or distort its
// eyes, face shape or mouth. The asset is transparent (including the space
// between mask and floating mouth); canvas stays click-through elsewhere.
const HIDDEN_ART_URL = new URL('../../../assets/sora/sora-hidden.png', import.meta.url).href;
const HIDDEN_ART_WIDTH = 78.4;
const HIDDEN_FRAME_NAMES = [];


// Draw the *actual approved PNG*, not an interpreted geometric copy.
// Only the whole asset floats by 1-2 px and its violet glow breathes gently.
export function drawHiddenPortrait(ctx, x, y, k, { image = null, impact = false, glow = 1, jitter = 0 } = {}) {
  if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) return false;
  const w = HIDDEN_ART_WIDTH * k;
  // Preserve the source aspect ratio exactly at every display scale.
  const h = w * (image.naturalHeight / image.naturalWidth);
  ctx.save();
  ctx.translate(x + jitter, y);
  // RT violet glow is drawn outside the original edges; the artwork itself
  // is not recoloured or stretched. Shadows are subtle even on dark desktops.
  ctx.shadowColor = '#7b3dff';
  ctx.shadowBlur = 2.5 * glow;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (impact) ctx.globalAlpha = 0.88;
  ctx.drawImage(image, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

// A small canvas of its own, w x h css px, placed by its top-left corner.
class Small {
  constructor(canvas, w, h) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = w;
    this.h = h;
    this.visible = false;
    this.pointer = null; // set while the pointer is over it
    this.shownAt = 0;
    this.last = 0;
    this.x = 0;
    this.y = 0;
    this.loop = this.loop.bind(this);
  }

  moveTo(x, y) {
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(this.w * dpr)) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = `${this.w}px`;
      this.canvas.style.height = `${this.h}px`;
    }
    this.x = x;
    this.y = y;
    this.canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  contains(x, y, pad = 8) {
    return x >= this.x - pad && x <= this.x + this.w + pad && y >= this.y - pad && y <= this.y + this.h + pad;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.canvas.hidden = false;
    this.shownAt = performance.now();
    requestAnimationFrame(this.loop);
  }

  hide() {
    this.visible = false;
    this.canvas.hidden = true;
    this.pointer = null;
  }

  loop(now) {
    if (!this.visible) return;
    requestAnimationFrame(this.loop);
    if (now - this.last < STEP - 1) return;
    this.last = now;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.draw(now, Math.floor(now / STEP));
  }

  // it lands as a white silhouette, one drawing, like her impact frames
  get landing() {
    return performance.now() - this.shownAt < STEP * 1.5 && !reducedMotion.matches;
  }
}

// ---------- her mask, asleep ----------

export class Mask extends Small {
  constructor(canvas) {
    super(canvas, 140, 170);
    this.k = 0.66;
    this.wokeAt = 0;
    this.nextPeek = 0;
    this.peek = null; // { eye, until }
  }

  // Floating with the middle of her face at (x, y), k = how big (her size on screen).
  place(x, y, k) {
    this.k = k;
    this.cx = 70;
    this.cy = 110;
    this.moveTo(x - this.cx, y - this.cy);
  }

  show() {
    this.wokeAt = 0;
    this.nextPeek = performance.now() + rand(5000, 9000);
    super.show();
  }

  // eyes snap open: she's coming back
  wake() {
    this.wokeAt = performance.now();
  }

  draw(now, frame) {
    const { ctx } = this;
    const calm = reducedMotion.matches;
    const bob = calm ? 0 : [0, -1.5, -3, -1.5][Math.floor(frame / 6) % 4]; // a slow float, on twos
    if (this.landing) {
      drawMask(ctx, this.cx, this.cy, this.k, { flat: COLORS.paper });
      return;
    }
    let eyes = [0, 0], look = null;
    if (now > this.nextPeek && !this.peek) {
      this.peek = { eye: Math.random() < 0.5 ? 0 : 1, until: now + rand(700, 1100) };
      this.nextPeek = now + rand(7000, 14000);
    }
    if (this.peek) {
      if (now > this.peek.until) this.peek = null;
      else eyes[this.peek.eye] = 0.45; // one eye cracked open, the wink
    }
    if (this.pointer) {
      eyes = [0.35, 0.35]; // stirring
      look = { x: this.pointer.x - this.x, y: this.pointer.y - this.y };
    }
    if (this.wokeAt) {
      eyes = [1, 1];
      look = null;
    }
    const shake = this.wokeAt && !calm ? rand(-2, 2) : 0;
    drawMask(ctx, this.cx + shake, this.cy + bob, this.k, { eyes, look });
  }
}

// ---------- hiding: approved original face artwork, separate from DIALOG ----------

const MARGIN = { left: 16, bottom: 12 };


export class Chip extends Mask {
  constructor(canvas) {
    super(canvas);
    this.w = 110;
    this.h = 86;
    this.cx = 55;
    this.cy = 43;
    this.k = 1;
    this.mode = 'idle';
    this.art = null;
    this.eyes = Object.create(null);

    if (typeof Image === 'function') {
      const load = name => {
        const image = new Image();
        image.src = name === 'center'
          ? HIDDEN_ART_URL
          : new URL(
              `../../../assets/sora/sora-hidden-${name}.png`,
              import.meta.url
            ).href;
        this.eyes[name] = image;
        return image;
      };
      this.art = load('center');
      for (const name of HIDDEN_FRAME_NAMES) load(name);
    }
  }

  place(w, h) {
    const left = Math.max(
      0, Math.min(MARGIN.left, w - this.w)
    );
    const top = Math.max(
      0, h - MARGIN.bottom - this.h
    );
    this.moveTo(left, top);
    this.face = {
      x: left + this.cx,
      y: top + this.cy
    };
  }

  center() {
    return { ...this.face };
  }

  contains(x, y, pad = 8) {
    if (!this.face) return false;

    const rx = x - this.face.x;
    const ry = y - this.face.y;

    // Vung nhap mat na Sora 78.4px.
    const mask =
      rx >= -44 - pad && rx <= 44 + pad &&
      ry >= -30 - pad && ry <= 17 + pad;

    // Vung nhap mieng trang roi phia duoi.
    const mouth =
      rx >= -25 - pad && rx <= 25 + pad &&
      ry >= 13 - pad && ry <= 33 + pad;

    return mask || mouth;
  }

  show() {
    super.show();
  }

  setMode(mode) {
    this.mode = mode;
  }

  eyeFrame(now) { return 'center'; }

  draw(now, frame) {
    const calm = reducedMotion.matches;
    const bob = calm ? 0 : 5.5 * Math.sin(now / 520); // SORA-ALL-FIX: clear, gentle floating

    const state = this.eyeFrame(now);
    const item = this.eyes[state];
    const image = item?.complete && item.naturalWidth
      ? item : this.art;

    drawHiddenPortrait(
      this.ctx,
      this.cx,
      this.cy + bob,
      this.k,
      {
        image,
        impact: this.landing && !calm,
        glow: calm ? 1 : 0.9 + 0.1*Math.sin(now/650),
        jitter: this.mode === 'alert' &&
          !calm && frame%17 === 0 ? 0.15 : 0
      }
    );
  }
}
