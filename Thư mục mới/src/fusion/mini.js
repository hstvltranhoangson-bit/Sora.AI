'use strict';
// This window is ONLY a music panel. The existing Sora RT overlay remains the
// sole renderer/actor for the character and can perch on the real HWND edge.
const $ = id => document.getElementById(id);
const ui = {
  song: $('song'), artist: $('artist'), state: $('stateText'),
  elapsed: $('elapsed'), duration: $('duration'), seek: $('seek'),
  seekNode: $('seekNode'), timeline: $('timeline'),
  playIcon: $('playIcon'), hint: $('hint'), toast: $('toast'),
  extra: $('extra'), menu: $('menu'),
};
const MEDIA = window.fusion || null;
let status = { available:false, playing:false, title:'', artist:'' };
let observed = 0, refreshing = false, toastTimer = 0;
const PLAY = '<path d="M8 5v14l12-7L8 5Z"/>';
const PAUSE = '<path d="M8 5v14M16 5v14"/>';
function formatTime(seconds){
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const s = Math.floor(seconds);
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function textOr(value, fallback){
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function setStatus(){
  const title = textOr(status.title,status.available?'Chưa có nhạc đang phát':'Đang tìm phiên nhạc Windows...');
  const artist = textOr(status.artist,status.available?'WINDOWS MEDIA':'SORA // LOCAL PLAYER');
  ui.song.textContent=title; ui.song.title=title;
  ui.artist.textContent=artist; ui.artist.title=artist;
  ui.state.textContent=!status.available?'CHƯA KẾT NỐI':(status.playing?'ĐANG PHÁT':'TẠM DỪNG');
  document.body.classList.toggle('is-playing',Boolean(status.playing&&status.available));
  document.body.classList.toggle('is-paused',!status.playing);
  ui.playIcon.innerHTML=status.playing?PAUSE:PLAY;
  $('play').setAttribute('aria-label',status.playing?'Tạm dừng':'Phát');
  ui.hint.textContent=status.available
    ? `Nguồn: ${textOr(status.app,'Windows Media')}. Các nút điều khiển dùng phím media Windows.`
    : 'Không có phiên nhạc hỗ trợ. Các nút vẫn gửi phím media Windows.';
}
function setTimeline(){
  const duration=Number(status.durationSeconds);
  const start=Number(status.positionSeconds);
  const has=Number.isFinite(duration)&&duration>0&&Number.isFinite(start)&&start>=0;
  if (!has){
    ui.duration.textContent='--:--';ui.elapsed.textContent='--:--';
    ui.seek.style.width='0%';ui.seekNode.style.left='0%';
    ui.timeline.classList.remove('has-progress');ui.timeline.setAttribute('aria-valuenow','0');
    return;
  }
  const elapsed=status.playing&&observed?Math.min(2,Math.max(0,(performance.now()-observed)/1000)):0;
  const current=Math.min(duration,start+elapsed);
  const pct=Math.min(100,Math.max(0,current/duration*100));
  ui.elapsed.textContent=formatTime(current); ui.duration.textContent=formatTime(duration);
  ui.seek.style.width=`${pct}%`; ui.seekNode.style.left=`${pct}%`;
  ui.timeline.classList.add('has-progress');ui.timeline.setAttribute('aria-valuenow',String(Math.round(pct)));
}
async function refresh(){
  if (refreshing||!MEDIA||typeof MEDIA.media!=='function')return;
  refreshing=true;
  try{
    const next=await MEDIA.media();
    if(next&&typeof next==='object'){status=next;observed=performance.now();setStatus();setTimeline();}
  }catch(err){
    status={available:false,playing:false,title:'',artist:''};setStatus();setTimeline();
    ui.hint.textContent='Không thể đọc nhạc: '+(err?.message||'lỗi kết nối');
  }finally{refreshing=false;}
}
function toast(message){
  ui.toast.textContent=message;ui.toast.classList.add('visible');
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ui.toast.classList.remove('visible');toastTimer=0;},1800);
}
for(const [id,action,label] of [
  ['back','previous','Bài trước'],['play','playpause','Phát / Tạm dừng'],
  ['next','next','Bài tiếp'],['mute','mute','Bật / tắt tiếng'],
]){
  $(id).addEventListener('click',async()=>{
    if(!MEDIA||typeof MEDIA.mediaKey!=='function'){toast('Chưa kết nối Sora Fusion');return;}
    try{
      const r=await MEDIA.mediaKey(action);
      toast(r&&r.ok===false?'Không điều khiển được nhạc':label);
      setTimeout(refresh,400);
    }catch(_){toast('Lỗi điều khiển nhạc');}
  });
}
$('close').addEventListener('click',async()=>{
  if(MEDIA&&typeof MEDIA.mini==='function'){
    try{await MEDIA.mini();}catch(_){toast('Không đóng được cửa sổ');}
  }else toast('Hãy đóng bằng menu Sora');
});
function showExtra(open){
  ui.extra.toggleAttribute('hidden',!open);
  ui.menu.setAttribute('aria-expanded',String(open));
}
ui.menu.addEventListener('click',()=>showExtra(ui.extra.hasAttribute('hidden')));
$('closeExtra').addEventListener('click',()=>showExtra(false));
renderStart();
function renderStart(){setStatus();setTimeline();refresh();setInterval(refresh,1500);setInterval(setTimeline,800);}
