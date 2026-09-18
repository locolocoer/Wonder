'use strict';
const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

// 更新源：默认阿里云 OSS（fryappstore 桶下的 wonder 目录），
// 可用 WONDER_UPDATE_MIRROR 覆盖；OSS 失败时自动回退到 GitHub Releases。
const UPDATE_MIRROR_DEFAULT = 'https://fryappstore.oss-cn-beijing.aliyuncs.com/wonder/';
const UPDATE_MIRROR = (process.env.WONDER_UPDATE_MIRROR || UPDATE_MIRROR_DEFAULT).trim();
const GH_OWNER = 'locolocoer';
const GH_REPO = 'Wonder';

let mainWindow = null;
let currentFeed = 'mirror';

function setWindow(win) {
  mainWindow = win;
}

function send(status) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', status);
}

function useMirror() {
  currentFeed = 'mirror';
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_MIRROR });
}

function useGithub() {
  currentFeed = 'github';
  autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO });
}

function setup() {
  if (!app.isPackaged) return; // 开发模式不检查更新
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  useMirror();

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => send({ state: 'not-available' }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => send({ state: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => {
    const msg = (err && err.message) || String(err);
    if (currentFeed === 'mirror') {
      // OSS 源失败 → 回退 GitHub Releases
      useGithub();
      autoUpdater.checkForUpdates().catch(() => send({ state: 'error', message: msg }));
      return;
    }
    send({ state: 'error', message: msg });
  });
}

function check() {
  if (!app.isPackaged) {
    send({ state: 'dev' });
    return;
  }
  useMirror();
  autoUpdater.checkForUpdates().catch((e) => send({ state: 'error', message: String((e && e.message) || e) }));
}

function install() {
  if (!app.isPackaged) return;
  setImmediate(() => autoUpdater.quitAndInstall());
}

module.exports = { setup, check, install, setWindow };
