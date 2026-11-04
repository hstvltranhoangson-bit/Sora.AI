// SORA SIT-V3: visual substates of the EXISTING `stance === 'sit'`.
// Do not change Sora's posture state machine or add a second character.
export const SIT_MODES = Object.freeze(['sitClassic', 'perchWindow', 'perchMusic']);
export const PERCH_ART = Object.freeze({width: 196, height: 384, hipX: 0.46, hipY: 0.645});

export function selectSitMode(perch, miniWindowId, sheetReady = true) {
  if (!perch || perch.id === 'taskbar' || !sheetReady) return 'sitClassic';
  return miniWindowId != null && String(perch.id) === String(miniWindowId)
    ? 'perchMusic' : 'perchWindow';
}

// Keep the hip ON the ledge, irrespective of art dimensions or facing.
// CSS scaleX rotates around the same hip pivot so left-facing does not slide.
export function perchArtworkBox({atX, ledgeY, scale, bob = 0, art = PERCH_ART}) {
  const height = 420 * scale;
  const width = height * art.width / art.height;
  return {
    x: atX - width * art.hipX,
    y: ledgeY + 3 - height * art.hipY + bob,
    width,
    height,
    pivotX: art.hipX,
    pivotY: art.hipY,
  };
}
