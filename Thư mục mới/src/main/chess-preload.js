'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('soraChess', {
  windowControl: (action) => {
    if (['minimize','maximize','close'].includes(action)) ipcRenderer.send('chess:window-control', action);
  },
  talk: (payload) => ipcRenderer.invoke('chess:talk', payload),
  emotion: (mood,game,detail) => ipcRenderer.send('chess:emotion',{mood,game,detail}),
  history: () => ipcRenderer.invoke('chess:history'),
  logEvent: (text, gameSource='chess') => ipcRenderer.invoke('chess:log-event', text, gameSource),
  recordTurn: (user, assistant, gameSource='chess') => ipcRenderer.invoke('chess:record-turn', { user, assistant, source:gameSource }),
  onSelectGame: (callback) => {
    const handler = (_event, game) => {
      if (['chess','tictactoe','connect4','gomoku','word','reversi','battleship','detective'].includes(game)) callback(game);
    };
    ipcRenderer.on('chess:select-game', handler);
    return () => ipcRenderer.removeListener('chess:select-game', handler);
  },
  onHistoryChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('chess:history-changed', handler);
    return () => ipcRenderer.removeListener('chess:history-changed', handler);
  },
  onDelta: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('chess:delta', handler);
    return () => ipcRenderer.removeListener('chess:delta', handler);
  },
  remember: (payload) => ipcRenderer.invoke('chess:remember', payload),
  personality: () => ipcRenderer.invoke('chess:personality'),
  forgetToken: () => ipcRenderer.invoke('chess:forget-token'),
  onForget: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('chess:forget', handler);
    return () => ipcRenderer.removeListener('chess:forget', handler);
  },
});
