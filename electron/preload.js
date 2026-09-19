'use strict';
const { contextBridge, ipcRenderer, clipboard } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getBoot: () => ipcRenderer.invoke('app:get-boot'),

  clipboardWriteText: (text) => clipboard.writeText(String(text ?? '')),
  clipboardReadText: () => clipboard.readText(),

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
  projectRename: (rel, newName) => ipcRenderer.invoke('project:rename', rel, newName),

  buildRun: (payload) => ipcRenderer.invoke('build:run', payload),
  shellRun: (cmd) => ipcRenderer.invoke('shell:run', cmd),
  termRun: (cmd) => ipcRenderer.invoke('term:run', cmd),
  termKill: () => ipcRenderer.invoke('term:kill'),
  termReset: () => ipcRenderer.invoke('term:reset'),

  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),

  chatLoad: () => ipcRenderer.invoke('chat:load'),
  chatSave: (messages) => ipcRenderer.invoke('chat:save', messages),
  chatClear: () => ipcRenderer.invoke('chat:clear'),

  gitIsRepo: () => ipcRenderer.invoke('git:is-repo'),
  gitInit: () => ipcRenderer.invoke('git:init'),
  gitStatus: () => ipcRenderer.invoke('git:status'),
  gitLog: (n) => ipcRenderer.invoke('git:log', n),
  gitCommit: (message) => ipcRenderer.invoke('git:commit', message),
  gitRollback: (hash) => ipcRenderer.invoke('git:rollback', hash),
  gitDiff: (rel) => ipcRenderer.invoke('git:diff', rel),
  gitUncommit: () => ipcRenderer.invoke('git:uncommit'),

  dialogConfirm: (opts) => ipcRenderer.invoke('dialog:confirm', opts),
  dialogMessage: (opts) => ipcRenderer.invoke('dialog:message', opts),
  dialogChoice: (opts) => ipcRenderer.invoke('dialog:choice', opts),

  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winToggleMaximize: () => ipcRenderer.invoke('win:toggle-maximize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  winIsMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  closeNow: () => ipcRenderer.invoke('app:close-now'),

  aiChat: (payload) => ipcRenderer.invoke('ai:chat', payload),
  aiAbort: (id) => ipcRenderer.invoke('ai:abort', id),

  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  revealPath: (rel) => ipcRenderer.invoke('app:reveal-path', rel),
  readReference: () => ipcRenderer.invoke('app:read-reference'),

  onEvent: (channel, cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
