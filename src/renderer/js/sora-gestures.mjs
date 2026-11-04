// SORA-ALL-FIX: one right click = wheel, rapid double right click = DIALOG.
// Delay opening the wheel to allow the second click to reach the avatar.
export function createSoraRightClick({ single, double, delay = 285,
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  let pending = null;
  let started = -Infinity;
  return {
    press() {
      const t = now();
      if (pending !== null && t - started <= delay) {
        cancel(pending);
        pending = null;
        started = -Infinity;
        double?.();
        return 'double';
      }
      if (pending !== null) { cancel(pending); pending = null; single?.(); }
      started = t;
      pending = schedule(() => {
        pending = null;
        started = -Infinity;
        single?.();
      }, delay);
      return 'waiting';
    },
    cancel() {
      if (pending !== null) cancel(pending);
      pending = null;
      started = -Infinity;
    },
  };
}
