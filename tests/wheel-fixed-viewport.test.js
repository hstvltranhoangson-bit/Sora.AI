'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const text=file=>fs.readFileSync(path.join(root,file),'utf8');
const {WHEEL_SIZE,WINDOW_SIZE,calculateWheelLayout}=require('../src/main/wheel-geometry');

test('the main wheel remains 162 DIP and the containing HWND never resizes on hover',()=>{
 assert.equal(WHEEL_SIZE,162);
 assert.equal(WINDOW_SIZE,260);
 const main=text('src/main/main.js');
 const css=text('src/wheel/wheel.css');
 const open=main.slice(main.indexOf('function openWheel('),main.indexOf('function requestToolApproval'));
 assert.match(open,/const layout = calculateWheelLayout\(point, area\)/);
 assert.doesNotMatch(open,/setSize\(|setBounds\(|showGameFlyout\(|game-flyout\.html/);
 assert.match(css,/width:162px; height:162px;/);
 assert.doesNotMatch(css,/\.game-submenu \{ display:none !important; \}/);
 assert.match(main,/win\.webContents\.once\('did-finish-load', reveal\)/);
});

test('arc geometry fits inside a stable 260 DIP rectangle on each screen corner',()=>{
 const areas=[{x:0,y:0,width:1920,height:1040},{x:-1600,y:-80,width:1600,height:980}];
 for (const area of areas) for(const [dx,dy] of [[0,0],[area.width-1,0],[0,area.height-1],[area.width-1,area.height-1],[area.width/2,area.height/2]]){
  const layout=calculateWheelLayout({x:area.x+dx,y:area.y+dy},area);
  assert.equal(layout.width,260);assert.equal(layout.height,260);
  assert.ok(layout.x>=area.x && layout.y>=area.y);
  assert.ok(layout.x+260<=area.x+area.width);
  assert.ok(layout.y+260<=area.y+area.height);
  assert.ok([-45,45,-135,135].includes(layout.submenuAngle));
  const cx=layout.wheelLeft+81, cy=layout.wheelTop+81;
  assert.ok(cx>=81 && cx<=179 && cy>=81 && cy<=179);
  const right=Math.abs(layout.submenuAngle)===45;
  const up=layout.submenuAngle<0;
  assert.ok((right?cx+160<=260:cx-160>=0));
  assert.ok((up?cy-160>=0:cy+160<=260));
 }
});

test('invalid or degenerate coordinates cannot create a menu window',()=>{
 const area={x:0,y:0,width:1920,height:1040};
 assert.throws(()=>calculateWheelLayout({x:NaN,y:2},area));
 assert.throws(()=>calculateWheelLayout({x:20,y:30},{...area,width:0}));
});
