'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getBoot: () => ipcRenderer.invoke('app:get-boot'),

  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  detectToolchain: () => ipcRenderer.invoke('toolchain:detect'),

  chooseProject: () => ipcRenderer.invoke('project:choose'),
  initStarter: () => ipcRenderer.invoke('project:init-starter'),
  projectList: () => ipcRenderer.invoke('project:list'),
  projectRead: (rel) => ipcRenderer.invoke('project:read', rel),
  projectWrite: (rel, content) => ipcRenderer.invoke('project:write', rel, content),
  projectCreate: (rel, kind) => ipcRenderer.invoke('project:create', rel, kind),
  projectDelete: (rel) => ipcRenderer.invoke('project:delete', rel),

  buildRun: (payload) => ipcRenderer.invoke('build:run', payload),
  shellRun: (cmd) => ipcRenderer.invoke('shell:run', cmd),
  termRun: (cmd) => ipcRenderer.invoke('term:run', cmd),
  termKill: () => ipcRenderer.invoke('term:kill'),

  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('win:toggle-maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winIsMaximized: () => ipcRenderer.invoke('win:is-maximized'),

  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiAbort: (id) => ipcRenderer.invoke('ai:abort', id),

  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  revealPath: (rel) => ipcRenderer.invoke('app:reveal-path', rel),

  onEvent: (channel, cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
