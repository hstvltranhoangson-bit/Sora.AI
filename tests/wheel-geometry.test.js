'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {WHEEL_SIZE,WINDOW_SIZE,calculateWheelLayout}=require('../src/main/wheel-geometry');
const area={x:0,y:0,width:1920,height:1040};
test('the Sora wheel remains 162 DIP inside one fixed window',()=>{
 assert.equal(WHEEL_SIZE,162);
 assert.equal(WINDOW_SIZE,260);
 const v=calculateWheelLayout({x:500,y:440},area);
 assert.equal(v.width,260);assert.equal(v.height,260);
 assert.ok(v.wheelLeft>=0 && v.wheelLeft+162<=260);
 assert.ok(v.wheelTop>=0 && v.wheelTop+162<=260);
});
test('game ring chooses the quadrant with room around the pointer',()=>{
 assert.equal(calculateWheelLayout({x:300,y:300},area).submenuAngle,45);
 assert.equal(calculateWheelLayout({x:1820,y:300},area).submenuAngle,135);
 assert.equal(calculateWheelLayout({x:300,y:900},area).submenuAngle,-45);
 assert.equal(calculateWheelLayout({x:1820,y:900},area).submenuAngle,-135);
});
test('window fits on every display even with negative monitor coordinates',()=>{
 for(const a of [area,{x:-1600,y:-100,width:1600,height:900}])
  for(const dx of [0,20,a.width/2,a.width-20,a.width-1])
   for(const dy of [0,20,a.height/2,a.height-20,a.height-1]) {
    const v=calculateWheelLayout({x:a.x+dx,y:a.y+dy},a);
    assert.ok(v.x>=a.x && v.x+v.width<=a.x+a.width);
    assert.ok(v.y>=a.y && v.y+v.height<=a.y+a.height);
   }
});
test('invalid coordinates are rejected',()=>{
 assert.throws(()=>calculateWheelLayout({x:NaN,y:2},area));
 assert.throws(()=>calculateWheelLayout({x:3,y:5},{...area,height:0}));
});
