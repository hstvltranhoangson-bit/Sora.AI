'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// A single Electron window owns both the main wheel and the game arc.
contextBridge.exposeInMainWorld('soraWheel', {
  action: (action) => ipcRenderer.send('wheel:action', String(action).slice(0, 32)),
  passThrough: (ignore) => ipcRenderer.send('wheel:passthrough', ignore === true),
  ready: () => ipcRenderer.send('wheel:ready'),
  onLayout: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, layout) => callback(layout);
    ipcRenderer.on('wheel:layout', listener);
    return () => ipcRenderer.removeListener('wheel:layout', listener);
  },
});
