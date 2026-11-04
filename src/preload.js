'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const listener = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('host', {
  reportStartupError: (message) => ipcRenderer.send('sora:startup-error', String(message || '').slice(0, 1200)),
  onClaudeEvent: on('claude:event'),
  onSoraEvent: on('sora:event'),
  onCommand: on('sora:command'),
  onConfig: on('sora:config'),
  onResize: on('overlay:resize'),
  onWindows: on('windows:update'),
  setInteractive: (on) => ipcRenderer.send('overlay:interactive', Boolean(on)),
  rearm: () => ipcRenderer.send('overlay:rearm'),
  cursor: () => ipcRenderer.invoke('overlay:cursor'),
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (patch) => ipcRenderer.invoke('config:set', patch),
  listSounds: () => ipcRenderer.invoke('sounds:list'),
  hooksStatus: () => ipcRenderer.invoke('hooks:status'),
  demoWindow: (open) => ipcRenderer.invoke('demo:window', Boolean(open)),
  openMenu: (location) => ipcRenderer.send('menu:open', location || null),
  closeMenu: () => ipcRenderer.send('menu:close'), // SORA-ALL-FIX
  installHooks: () => ipcRenderer.invoke('hooks:install'),
  claudeFound: () => ipcRenderer.invoke('claude:found'),
  openClaudeHelp: () => ipcRenderer.send('claude:help'),
  windowsNow: () => ipcRenderer.invoke('windows:get'),
  trayPlace: () => ipcRenderer.invoke('guide:tray'),
  openClaudeFolder: () => ipcRenderer.invoke('guide:claudeFolder'),
  copyImage: (rect) => ipcRenderer.invoke('panel:copy', rect),
  chatStatus: () => ipcRenderer.invoke('chat:status'),
  chatSend: (request) => ipcRenderer.invoke('chat:send', request),
  chatStop: (id) => ipcRenderer.send('chat:stop', id),
  chatMemory: () => ipcRenderer.invoke('chat:memory'),
  chatRemember: (history) => ipcRenderer.send('chat:remember', history),
  onChatDelta: on('chat:delta'),
  onChatHistoryChanged: on('chat:history-changed'),
  openOllama: () => ipcRenderer.send('chat:ollama'),
  fusionMusic: () => ipcRenderer.invoke('sora-fusion:media'), // SORA-FUSION
  setupInfo: () => ipcRenderer.invoke('setup:info'),
  ollamaState: () => ipcRenderer.invoke('setup:ollama'),
  installOllama: () => ipcRenderer.invoke('setup:install'),
  startOllama: () => ipcRenderer.invoke('setup:start'),
  pullModel: (name) => ipcRenderer.invoke('setup:pull', name),
  cancelSetup: () => ipcRenderer.send('setup:cancel'),
  useProvider: (choice) => ipcRenderer.invoke('setup:use', choice),
  keyPage: (provider) => ipcRenderer.send('setup:keyPage', provider),
  launchThroughOllama: (integration) => ipcRenderer.invoke('setup:launch', integration),
  onSetupProgress: on('setup:progress'),
  openApps: () => ipcRenderer.invoke('apps:list'),
  findApp: (wanted) => ipcRenderer.invoke('apps:find', wanted),
  closeApp: (name, force) => ipcRenderer.invoke('apps:close', { name, force: Boolean(force) }),
  findLaunch: (text) => ipcRenderer.invoke('apps:findLaunch', text),
  launch: (item) => ipcRenderer.invoke('apps:launch', item),
  media: (action) => ipcRenderer.invoke('apps:media', action),
  music: (query) => ipcRenderer.invoke('apps:music', query),
  openSite: (address) => ipcRenderer.invoke('apps:site', address),
  focusOverlay: (on) => ipcRenderer.send('overlay:focus', Boolean(on)),
});
