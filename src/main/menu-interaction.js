'use strict';

// The avatar is a full-screen, click-through, non-focusable topmost window.
// Windows native menus cannot reliably take keyboard/mouse focus above that
// window. Make it a regular, focusable (still click-through) window only while
// the native menu is open, then restore the avatar overlay's original behavior.
function showInteractiveMenu(menu, overlay, onClosed = () => {}) {
  if (!menu || !overlay || overlay.isDestroyed()) return false;
  let closed = false;
  const restore = () => {
    if (closed) return;
    closed = true;
    try {
      if (!overlay.isDestroyed()) {
        overlay.setIgnoreMouseEvents(true, { forward: true });
        overlay.setFocusable(false);
        overlay.setAlwaysOnTop(true, 'screen-saver');
      }
    } finally {
      onClosed();
    }
  };
  try {
    overlay.setIgnoreMouseEvents(true, { forward: true });
    overlay.setAlwaysOnTop(false);
    overlay.setFocusable(true);
    overlay.focus();
    menu.popup({ window: overlay, callback: restore });
    return true;
  } catch (error) {
    restore();
    throw error;
  }
}

module.exports = { showInteractiveMenu };
