'use strict';

// Eight main vector sectors. Hovering GAME reveals a *second* arc outside the
// existing wheel; only a game-choice click launches a game.
const NS = 'http://www.w3.org/2000/svg';
const ACTIONS = [
  ['chat', 'CHAT'], ['games', 'GAME'], ['rest', 'REST'], ['walk', 'MOVE'],
  ['settings', 'SETUP'], ['custom', 'STYLE'], ['guide', 'GUIDE'], ['actions', 'ACTION'],
];
const stage = document.getElementById('wheel-stage');
const wheel = document.querySelector('.wheel');
const segments = document.getElementById('wheel-segments');
const ticks = document.getElementById('wheel-ticks');
const caption = document.getElementById('wheel-caption');
const iconButtons = Array.from(document.querySelectorAll('button[data-action]'));
const gameMenu = document.getElementById('game-submenu');
const gameSegments = document.getElementById('game-segments');
const gameArc = document.getElementById('game-arc');
const gameButtons = Array.from(document.querySelectorAll('button[data-game]'));
const actionMenu = document.getElementById('action-submenu');
const actionSegments = document.getElementById('action-segments');
const actionArc = document.getElementById('action-arc');
const actionButtons = Array.from(document.querySelectorAll('button[data-character-action]'));
const gameTrigger = iconButtons.find(b => b.dataset.action === 'games');
const actionTrigger = iconButtons.find(b => b.dataset.action === 'actions');
const GAME_COUNT = 8;
if (gameButtons.length !== GAME_COUNT) console.error(`[Sora GAME] Cần ${GAME_COUNT} trò, hiện có ${gameButtons.length}.`);
let gamesOpen = false;
let actionsOpen = false;
let closeTimer = null;
let currentAngle = -45;

function polar(radius, degrees) {
  const angle = degrees * Math.PI / 180;
  return [100 + radius * Math.cos(angle), 100 + radius * Math.sin(angle)]
    .map((v) => v.toFixed(3)).join(' ');
}
function arcSegment(centerAngle) {
  const start = centerAngle - 20.8, end = centerAngle + 20.8;
  return `M ${polar(48, start)} L ${polar(85, start)} ` +
    `A 85 85 0 0 1 ${polar(85, end)} L ${polar(48, end)} ` +
    `A 48 48 0 0 0 ${polar(48, start)} Z`;
}
ACTIONS.forEach(([action], index) => {
  const wedge = document.createElementNS(NS, 'path');
  wedge.setAttribute('class', 'wheel__slice');
  wedge.setAttribute('data-action', action);
  wedge.setAttribute('d', arcSegment(-90 + index * 45));
  segments.append(wedge);
});
for (let i = 0; i < 48; i++) {
  const angle = -90 + i * 7.5;
  const mark = document.createElementNS(NS, 'line');
  if (i % 6 === 0) mark.setAttribute('class', 'major');
  const [x1, y1] = polar(i % 6 === 0 ? 82.5 : 84, angle).split(' ');
  const [x2, y2] = polar(85.5, angle).split(' ');
  mark.setAttribute('x1', x1); mark.setAttribute('y1', y1);
  mark.setAttribute('x2', x2); mark.setAttribute('y2', y2);
  ticks.append(mark);
}

function outerPolar(radius, degrees) {
  const angle = degrees * Math.PI / 180;
  return [166 + radius * Math.cos(angle), 166 + radius * Math.sin(angle)]
    .map((v) => v.toFixed(3)).join(' ');
}
function outerSegment(angle) {
  const start = angle - 7.85, end = angle + 7.85;
  // Slimmer outer arc: 100–142px (formerly 104–156px).
  return `M ${outerPolar(100, start)} L ${outerPolar(142, start)} ` +
    `A 142 142 0 0 1 ${outerPolar(142, end)} L ${outerPolar(100, end)} ` +
    `A 100 100 0 0 0 ${outerPolar(100, start)} Z`;
}
function setGameHighlight(game) {
  if (game) gameMenu.dataset.active = game;
  else delete gameMenu.dataset.active;
  for (const element of gameMenu.querySelectorAll('.game-submenu__slice,.game-submenu__choice')) {
    element.classList.toggle('is-highlighted', Boolean(game) && element.dataset.game === game);
  }
  if (gamesOpen) {
    const name = gameButtons.find(button => button.dataset.game === game)?.querySelector('.game-submenu__label')?.textContent;
    caption.textContent = name || 'GAME';
  }
}
function drawGames(angle) {
  currentAngle = angle;
  gameSegments.replaceChildren();
  gameButtons.forEach((button, index) => {
    const game = button.dataset.game;
    const sectorAngle = currentAngle + (index - (gameButtons.length - 1) / 2) * 17;
    const theta = sectorAngle * Math.PI / 180;
    const d = outerSegment(sectorAngle);
    const liftX = (4.5 * Math.cos(theta)).toFixed(2) + 'px';
    const liftY = (4.5 * Math.sin(theta)).toFixed(2) + 'px';

    // The visible wedge rises on selection while the invisible hit area
    // remains stationary, preventing hover flicker during the transition.
    const wedge = document.createElementNS(NS, 'path');
    wedge.setAttribute('class', 'game-submenu__slice');
    wedge.setAttribute('data-game', game);
    wedge.setAttribute('d', d);
    wedge.style.setProperty('--lift-x', liftX);
    wedge.style.setProperty('--lift-y', liftY);
    gameSegments.append(wedge);

    const hit = document.createElementNS(NS, 'path');
    hit.setAttribute('class', 'game-submenu__hit');
    hit.setAttribute('data-game', game);
    hit.setAttribute('d', d);
    hit.addEventListener('pointerenter', () => {
      cancelClose(); highlight('games'); setGameHighlight(game);
    });
    hit.addEventListener('pointerleave', () => {
      setGameHighlight(''); scheduleClose();
    });
    hit.addEventListener('click', () => window.soraWheel?.action('game-' + game));
    gameSegments.append(hit);

    button.style.setProperty('--dx', (124 * Math.cos(theta)).toFixed(2) + 'px');
    button.style.setProperty('--dy', (124 * Math.sin(theta)).toFixed(2) + 'px');
    button.style.setProperty('--lift-x', liftX);
    button.style.setProperty('--lift-y', liftY);
  });
  gameArc.setAttribute('d', `M ${outerPolar(148, angle - 69)} A 148 148 0 0 1 ${outerPolar(148, angle + 69)}`);
}
function setActionHighlight(action) {
  if (action) actionMenu.dataset.active = action;
  else delete actionMenu.dataset.active;
  for (const element of actionMenu.querySelectorAll('.action-submenu__slice,.action-submenu__choice')) {
    element.classList.toggle('is-highlighted', Boolean(action) && element.dataset.characterAction === action);
  }
  if (actionsOpen) {
    const name=actionButtons.find(b=>b.dataset.characterAction===action)?.querySelector('.action-submenu__label')?.textContent;
    caption.textContent=name||'ACTION';
  }
}
function drawActions(angle) {
  actionSegments.replaceChildren();
  actionButtons.forEach((button,index)=>{
    const action=button.dataset.characterAction;
    const sectorAngle=angle+(index-(actionButtons.length-1)/2)*19;
    const theta=sectorAngle*Math.PI/180;
    const d=outerSegment(sectorAngle);
    const dx=(4.5*Math.cos(theta)).toFixed(2)+'px';
    const dy=(4.5*Math.sin(theta)).toFixed(2)+'px';
    const wedge=document.createElementNS(NS,'path');
    wedge.setAttribute('class','action-submenu__slice');
    wedge.dataset.characterAction=action;
    wedge.setAttribute('d',d);
    wedge.style.setProperty('--lift-x',dx);
    wedge.style.setProperty('--lift-y',dy);
    actionSegments.append(wedge);
    const hit=document.createElementNS(NS,'path');
    hit.setAttribute('class','action-submenu__hit');
    hit.dataset.characterAction=action;
    hit.setAttribute('d',d);
    hit.addEventListener('pointerenter',()=>{cancelClose();highlight('actions');setActionHighlight(action);});
    hit.addEventListener('pointerleave',()=>{setActionHighlight('');scheduleClose();});
    hit.addEventListener('click',()=>window.soraWheel?.action('action-'+action));
    actionSegments.append(hit);
    button.style.setProperty('--dx',(124*Math.cos(theta)).toFixed(2)+'px');
    button.style.setProperty('--dy',(124*Math.sin(theta)).toFixed(2)+'px');
  });
  actionArc.setAttribute('d',`M ${outerPolar(148,angle-69)} A 148 148 0 0 1 ${outerPolar(148,angle+69)}`);
}
drawGames(currentAngle);
drawActions(currentAngle);
// Bố cục đồng bộ với cửa sổ từ URL: không đợi IPC mới hiển thị menu.
// Nếu URL thiếu tham số, CSS mặc định đặt vòng chính ở giữa cửa sổ.
{
  const params = new URLSearchParams(window.location.search);
  const left = Number(params.get('wheelLeft'));
  const top = Number(params.get('wheelTop'));
  const angle = Number(params.get('submenuAngle'));
  if (params.has('wheelLeft') && params.has('wheelTop') &&
      Number.isFinite(left) && Number.isFinite(top) &&
      left >= -1 && top >= -1 && left <= 4096 && top <= 4096) {
    stage.style.setProperty('--wheel-left', left + 'px');
    stage.style.setProperty('--wheel-top', top + 'px');
  }
  if (params.has('submenuAngle') && [45, -45, 135, -135].includes(angle)) { drawGames(angle); drawActions(angle); }
}

function highlight(action) {
  if (!action) {
    delete wheel.dataset.active;
    caption.textContent = 'COMMAND';
    return;
  }
  wheel.dataset.active = action;
  caption.textContent = ACTIONS.find((entry) => entry[0] === action)?.[1] || 'COMMAND';
}
function cancelClose() {
  if (closeTimer !== null) clearTimeout(closeTimer);
  closeTimer = null;
}
function setGamesOpen(open) {
  cancelClose();
  if (open) setActionsOpen(false);
  gamesOpen=open;
  if (!open) setGameHighlight('');
  else caption.textContent='GAME';
  if (open) stage.dataset.submenu='games';
  else if (stage.dataset.submenu==='games') delete stage.dataset.submenu;
  gameMenu.setAttribute('aria-hidden',open?'false':'true');
  gameTrigger.setAttribute('aria-expanded',String(open));
  gameButtons.forEach(b=>{b.tabIndex=open?0:-1;});
}
function setActionsOpen(open) {
  cancelClose();
  if (open && gamesOpen) setGamesOpen(false);
  actionsOpen=open;
  if (!open) setActionHighlight('');
  else caption.textContent='ACTION';
  if (open) stage.dataset.submenu='actions';
  else if (stage.dataset.submenu==='actions') delete stage.dataset.submenu;
  actionMenu.setAttribute('aria-hidden',open?'false':'true');
  actionTrigger.setAttribute('aria-expanded',String(open));
  actionButtons.forEach(b=>{b.tabIndex=open?0:-1;});
}
function scheduleClose() {
  cancelClose();
  if (!gamesOpen && !actionsOpen) return;
  closeTimer=setTimeout(()=>{
    closeTimer=null;
    const overGame=gameMenu.matches(':hover')||gameTrigger.matches(':hover');
    const overAction=actionMenu.matches(':hover')||actionTrigger.matches(':hover');
    if ((gamesOpen&&!overGame)||(actionsOpen&&!overAction)) {
      setGamesOpen(false);setActionsOpen(false);highlight('');
    }
  },900);
}

iconButtons.forEach((button) => {
  const action=button.dataset.action;
  function enter() {
    highlight(action);
    if (action === 'games') setGamesOpen(true);
    else if (action==='actions') setActionsOpen(true);
    else if (gamesOpen||actionsOpen) scheduleClose();
  }
  button.addEventListener('pointerenter',enter);
  button.addEventListener('focus',enter);
  button.addEventListener('pointerleave',()=>{
    if (action==='games'||action==='actions') scheduleClose();
    if (!gamesOpen&&!actionsOpen) highlight('');
  });
  button.addEventListener('blur',()=>{
    if (action==='games'||action==='actions') scheduleClose();
    if (!gamesOpen&&!actionsOpen) highlight('');
  });
  button.addEventListener('click',()=>{
    if (action === 'games') setGamesOpen(true);
    else if (action==='actions') setActionsOpen(true);
    else {setGamesOpen(false);setActionsOpen(false);window.soraWheel?.action(action);}
  });
});
// The transparent flyout rectangle is also a pointer bridge between the
// 81px main wheel and the 104px inner edge of the outer game ring.
gameMenu.addEventListener('pointerenter', cancelClose);
gameMenu.addEventListener('pointerleave', scheduleClose);
actionMenu.addEventListener('pointerenter',cancelClose);
actionMenu.addEventListener('pointerleave',scheduleClose);

actionButtons.forEach((button)=>{
  const action=button.dataset.characterAction;
  const enter=()=>{cancelClose();highlight('actions');setActionHighlight(action);};
  button.addEventListener('pointerenter',enter);
  button.addEventListener('focus',enter);
  button.addEventListener('pointerleave',()=>{setActionHighlight('');scheduleClose();});
  button.addEventListener('blur',()=>{setActionHighlight('');scheduleClose();});
  button.addEventListener('click',()=>window.soraWheel?.action('action-'+action));
});

gameButtons.forEach((button) => {
  button.addEventListener('pointerenter', () => {
    cancelClose(); highlight('games'); setGameHighlight(button.dataset.game);
  });
  button.addEventListener('pointerleave', () => {
    setGameHighlight(''); scheduleClose();
  });
  button.addEventListener('focus', () => {
    cancelClose(); highlight('games'); setGameHighlight(button.dataset.game);
  });
  button.addEventListener('blur', () => {
    setGameHighlight(''); scheduleClose();
  });
  button.addEventListener('click', () => window.soraWheel?.action('game-' + button.dataset.game));
});

window.soraWheel?.onLayout((layout) => {
  if (!layout || !Number.isFinite(layout.wheelLeft) || !Number.isFinite(layout.wheelTop)) return;
  stage.style.setProperty('--wheel-left', layout.wheelLeft + 'px');
  stage.style.setProperty('--wheel-top', layout.wheelTop + 'px');
  if (Number.isFinite(layout.submenuAngle)) { drawGames(layout.submenuAngle); drawActions(layout.submenuAngle); }
  stage.dataset.layoutReady = 'true';
});
// Đăng ký listener TRƯỚC khi yêu cầu layout lần đầu.
window.soraWheel?.ready?.();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    window.soraWheel?.action('close');
    return;
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const choices = gamesOpen ? [...iconButtons, ...gameButtons] : actionsOpen ? [...iconButtons, ...actionButtons] : iconButtons;
  const index = choices.indexOf(document.activeElement);
  const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length;
  choices[next].focus();
});

// Do not close a game choice because it is outside the *inner* 162px wheel.
document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button[data-action],button[data-game],button[data-character-action],.game-submenu__hit,.action-submenu__hit')) return;
  const rect = wheel.getBoundingClientRect();
  const distance = Math.hypot(event.clientX - rect.left - rect.width / 2,
    event.clientY - rect.top - rect.height / 2);
  if (distance > rect.width / 2 - 2) window.soraWheel?.action('close');
});
document.addEventListener('pointerleave', scheduleClose);
