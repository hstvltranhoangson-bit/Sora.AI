'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('fusion',Object.freeze({
  request:(operation,data={})=>ipcRenderer.invoke('sora-fusion:request',operation,data),
  media:()=>ipcRenderer.invoke('sora-fusion:media'),
  mediaKey:(key)=>ipcRenderer.invoke('sora-fusion:media-key',key),
  musicDemo:(on)=>ipcRenderer.invoke('sora-fusion:music-demo',on),
  mini:()=>ipcRenderer.invoke('sora-fusion:mini'),
  perch:(on)=>ipcRenderer.invoke('sora-fusion:perch',on),
  chat:(text)=>ipcRenderer.invoke('sora-fusion:chat',text),
  locate:(file)=>ipcRenderer.invoke('sora-fusion:open-folder',file),
}));
