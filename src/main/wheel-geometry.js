'use strict';
// Fixed-size single native window: no popups or changes of bounds on hover.
// The game arc occupies the quadrant OUTSIDE the 162-DIP original wheel.
const WHEEL_SIZE = 162;
const WINDOW_SIZE = 260;
const INNER = 84;
const OUTER = 176;
function clamp(v,lo,hi) { return Math.max(lo,Math.min(v,hi)); }
function calculateWheelLayout(anchor, workArea) {
  const a = {...workArea};
  if (![anchor.x,anchor.y,a.x,a.y,a.width,a.height].every(Number.isFinite) || a.width<=0 || a.height<=0)
    throw new TypeError('Invalid wheel position or work area');
  const width=Math.min(WINDOW_SIZE, Math.floor(a.width));
  const height=Math.min(WINDOW_SIZE, Math.floor(a.height));
  // Prefer the side with space, but do not move the cursor when the arc opens.
  const right=(a.x+a.width-anchor.x)>=anchor.x-a.x;
  const up=(anchor.y-a.y)>=(a.y+a.height-anchor.y);
  const centerX=right?INNER:Math.min(OUTER,width-INNER);
  const centerY=up?Math.min(OUTER,height-INNER):INNER;
  const x=Math.round(clamp(anchor.x-centerX,a.x,a.x+a.width-width));
  const y=Math.round(clamp(anchor.y-centerY,a.y,a.y+a.height-height));
  const angle=up?(right?-45:-135):(right?45:135);
  return {
    x,y,width,height,
    wheelLeft:centerX-WHEEL_SIZE/2,
    wheelTop:centerY-WHEEL_SIZE/2,
    submenuAngle:angle,
  };
}
module.exports={WHEEL_SIZE,WINDOW_SIZE,calculateWheelLayout};
