'use strict';
// The Fusion panel is a NORMAL Electron window, not a second character or AI.
// All model/file/voice tasks go through the existing private Python SoraBackend.
const path = require('node:path');
const fs = require('node:fs');
const { execFile } = require('node:child_process');

function createSoraFusion({app, BrowserWindow, ipcMain, backend, overlay, media}) {
  let panel = null;
  let mini = null;
  let perchEnabled = true;
  let demoMusic = false;
  const icon = path.join(__dirname,'../../assets/icons/sora.png');
  const common = {
    icon: fs.existsSync(icon) ? icon : undefined,
    backgroundColor: '#100d19', show: false, autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration:false, contextIsolation:true, sandbox:true,
      preload:path.join(__dirname,'../fusion/preload.js'),
    },
  };
  const dashboardFile = path.join(__dirname,'../fusion/control.html');
  const miniFile = path.join(__dirname,'../fusion/mini.html');
  function openDashboard() {
    if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); return panel; }
    panel = new BrowserWindow({ ...common, width: 600, height: 760, minWidth: 460,
      minHeight: 600, title: 'Sora — Điều khiển nâng cao' });
    panel.removeMenu();
    panel.loadFile(dashboardFile);
    panel.once('ready-to-show', () => panel?.show());
    panel.on('closed',() => { panel=null; });
    return panel;
  }
  // The wheel's MEDIA command only opens/focuses the existing player; it must
  // not accidentally close it on a second click (the tray retains toggleMini).
  function openMini() {
    if (mini && !mini.isDestroyed()) {
      mini.show();
      mini.focus();
      return mini;
    }
    // SORA-MINI-OVERLAY-ONLY-V2: Only one actor: the existing RT Sora.
    // Tight window bounds let Sora perch on its actual top edge.
    mini = new BrowserWindow({ ...common, title: 'Sora — Nhạc',
      width: 460, height: 214, resizable: false, alwaysOnTop: true,
      frame: false, transparent: true, hasShadow: false,
      backgroundColor: '#00000000',
      x: undefined, y: undefined, skipTaskbar: false });
    mini.removeMenu();
    mini.loadFile(miniFile);
    mini.once('ready-to-show', () => mini?.show());
    mini.on('closed',()=>{mini=null;});
    return mini;
  }
  function toggleMini() {
    if (mini && !mini.isDestroyed()) { mini.close(); return false; }
    openMini();
    return true;
  }
  // SORA-SIT-THREE-MODES-V3: identify the real Windows HWND of the ONE mini-player.
  // Window watcher provides native handles, never titles or song names.
  function miniWindowId() {
    if (process.platform !== 'win32' || !mini || mini.isDestroyed()) return null;
    try {
      const buf=mini.getNativeWindowHandle();
      return buf.length >= 8 ? String(buf.readBigUInt64LE(0)) : String(buf.readUInt32LE(0));
    } catch (_) {return null;}
  }
  function mediaStatus() {
    const binary = process.env.SORA_MEDIA_HELPER || path.join(__dirname,'../../tools/SoraMedia/SoraMedia.exe');
    return new Promise(resolve => {
      if (process.platform !== 'win32' || !fs.existsSync(binary)) {
        return resolve({ok:true, playing:demoMusic, demo:demoMusic,
          title:'', artist:'', available:false, perchEnabled, miniWindowId:miniWindowId()});
      }
      execFile(binary,['status'],{timeout:2200,windowsHide:true},(error,stdout)=>{
        if (error) return resolve({ok:true,playing:demoMusic,available:false,perchEnabled,miniWindowId:miniWindowId()});
        try {const data=JSON.parse(stdout);resolve({ok:true,...data,perchEnabled,miniWindowId:miniWindowId()});}
        catch (_) {resolve({ok:true,playing:demoMusic,available:false,perchEnabled,miniWindowId:miniWindowId()});}
      });
    });
  }
  async function action(_event, operation, data={}) {
    const whitelist = new Set(['status','models','model_select','file_find','plan_create',
      'plans','plan','plan_approve','step_finish','plan_report','cancel',
      'voice_start','voice_end','hotword_on','hotword_off','speak','tts_auto_on','tts_auto_off']);
    if (!whitelist.has(operation)) return {ok:false,error:'Thao tác không được cấp quyền.'};
    try {
      const result = await backend()?.request('fusion',{action,data},{timeoutMs:
        ['voice_end','file_find'].includes(operation)?120000:15000});
      return result.ok && result.data && typeof result.data === 'object' ? result.data :
        {ok:false,error:result.error||'Không có phản hồi từ Python Sora'};
    } catch (error) {return {ok:false,error:error.message};}
  }
  ipcMain.handle('sora-fusion:request',action);
  ipcMain.handle('sora-fusion:media',()=>mediaStatus());
  ipcMain.handle('sora-fusion:media-key',(_event,key)=> {
    if (!['playpause','play','pause','next','previous','volumeup','volumedown','mute'].includes(key))
      return {ok:false,error:'Nút nhạc không hợp lệ.'};
    const map={playpause:'pause',volumeup:'volup',volumedown:'voldown'};
    try {return Promise.resolve(media(map[key]||key)).then(ok=>({ok:Boolean(ok)}),e=>({ok:false,error:e.message}));}
    catch (e) {return {ok:false,error:e.message};}
  });
  ipcMain.handle('sora-fusion:perch',(_event,enabled)=> {
    perchEnabled = Boolean(enabled);
    return {ok:true,enabled:perchEnabled};
  });
  ipcMain.handle('sora-fusion:music-demo',(_event,enabled)=> {
    demoMusic = Boolean(enabled);
    return {ok:true,demo:demoMusic};
  });
  ipcMain.handle('sora-fusion:mini',()=>({ok:true,open:toggleMini()}));
  ipcMain.handle('sora-fusion:chat',(_event,text)=>{
    if(typeof text!=='string' || !text.trim() || text.length>1200)
      return {ok:false,error:'Văn bản không hợp lệ.'};
    const win=overlay();
    if(!win || win.isDestroyed())return {ok:false,error:'Sora chưa mở giao diện.'};
    win.webContents.send('sora:event',{event:'fusion_text',text:text.trim()});
    return {ok:true};
  });
  ipcMain.handle('sora-fusion:open-folder',(_event,filename)=> {
    // This opens ONLY an Explorer selection, not the target itself (never executes scripts).
    if(typeof filename!=='string'||filename.length>1000)return {ok:false};
    let file;
    try {file=fs.realpathSync(path.resolve(filename));}
    catch (_) {return {ok:false,error:'Đường dẫn không tồn tại.'};}
    const home=app.getPath('home');
    const allowed=['Desktop','Documents','Downloads','Pictures']
      .map(p=>path.resolve(home,p)).filter(p=>fs.existsSync(p))
      .map(p=>fs.realpathSync(p)+path.sep);
    if(!allowed.some(p=>file.startsWith(p)))return {ok:false,error:'Thư mục ngoài vùng cho phép.'};
    if(!fs.existsSync(file))return {ok:false,error:'Không tìm thấy mục đã chọn.'};
    require('electron').shell.showItemInFolder(file);
    return {ok:true};
  });
  return { openDashboard, openMini, toggleMini, mediaStatus };
}
module.exports={createSoraFusion};
