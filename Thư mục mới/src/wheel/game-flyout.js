'use strict';
// Dedicated renderer for the native game ring. There are no main-wheel
// buttons in this document, and the two screens share no resize events.
const NS='http://www.w3.org/2000/svg';
const params=new URLSearchParams(window.location.search);
const angle=Number(params.get('submenuAngle'));
const selectedAngle=[-45,45,-135,135].includes(angle)?angle:45;
function coord(key, fallback) {
  const value=Number(params.get(key));
  return params.has(key) && Number.isFinite(value) && Math.abs(value)<8192?value:fallback;
}
const stage=document.getElementById('wheel-stage');
stage.style.setProperty('--flyout-canvas-left',coord('canvasLeft',-158)+'px');
stage.style.setProperty('--flyout-canvas-top',coord('canvasTop',-158)+'px');
const buttons=[...document.querySelectorAll('button[data-game]')];
const segments=document.getElementById('game-segments');
const arc=document.getElementById('game-arc');
function polar(radius, degrees){
  const theta=degrees*Math.PI/180;
  return [166+radius*Math.cos(theta),166+radius*Math.sin(theta)].map(n=>n.toFixed(3)).join(' ');
}
function wedge(degrees){
  const a=degrees-19.4,b=degrees+19.4;
  return `M ${polar(104,a)} L ${polar(156,a)} A 156 156 0 0 1 ${polar(156,b)} `+
    `L ${polar(104,b)} A 104 104 0 0 0 ${polar(104,a)} Z`;
}
buttons.forEach((button,index)=>{
  const current=selectedAngle+(index===0?-22:22);
  const path=document.createElementNS(NS,'path');
  path.setAttribute('class','game-submenu__slice');
  path.setAttribute('d',wedge(current));
  segments.append(path);
  const r=current*Math.PI/180;
  button.style.setProperty('--dx',(130*Math.cos(r)).toFixed(2)+'px');
  button.style.setProperty('--dy',(130*Math.sin(r)).toFixed(2)+'px');
  button.addEventListener('click',()=>window.soraWheel?.action('game-'+button.dataset.game));
});
arc.setAttribute('d',`M ${polar(160,selectedAngle-43)} A 160 160 0 0 1 ${polar(160,selectedAngle+43)}`);
document.body.addEventListener('pointerenter',()=>window.soraWheel?.hoverFlyout?.(true));
document.body.addEventListener('pointerleave',()=>window.soraWheel?.hoverFlyout?.(false));
document.addEventListener('keydown',(event)=>{
  if(event.key==='Escape')window.soraWheel?.action('close');
});
document.addEventListener('pointerdown',(event)=>{
  if(!event.target.closest('button[data-game]'))window.soraWheel?.action('close');
});
