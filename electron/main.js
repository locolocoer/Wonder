'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const settingsStore = require('./settings');
const toolchain = require('./toolchain');
const projectFs = require('./project-fs');
const buildRunner = require('./build-runner');
const ai = require('./ai');
const shellRunner = require('./shell');
const term = require('./term');
const updater = require('./updater');

const SCHEME = 'app';
let mainWindow = null;
let settings = null;
let buildAbort = null;
let termSession = null;
const aiAborts = new Map();

// ---------------------------------------------------------------------------
// Custom scheme for the packaged renderer (same-origin so workers/fetch work).
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerScheme(distDir) {
  protocol.handle(SCHEME, (request) => {
    try {
      const u = new URL(request.url);
      let rel = decodeURIComponent(u.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      let filePath = path.join(distDir, rel);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch (e) {
      return new Response('Not found: ' + String(e), { status: 404 });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: 'Dojo',
    backgroundColor: '#1e1e1e',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    frame: false, // 无边框，标题栏由应用自绘
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximize-changed', true);
  });
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('win:maximize-changed', false);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadURL(`${SCHEME}://app/index.html`);
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
function registerIpc() {
  ipcMain.handle('win:minimize', () => {
    if (mainWindow) mainWindow.minimize();
    return { ok: true };
  });
  ipcMain.handle('win:toggle-maximize', () => {
    if (!mainWindow) return { ok: true };
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return { ok: true };
  });
  ipcMain.handle('win:close', () => {
    if (mainWindow) mainWindow.close();
    return { ok: true };
  });
  ipcMain.handle('win:is-maximized', () => (mainWindow ? mainWindow.isMaximized() : false));

  ipcMain.handle('update:check', () => {
    updater.check();
    return { ok: true };
  });
  ipcMain.handle('update:install', () => {
    updater.install();
    return { ok: true };
  });

  ipcMain.handle('app:get-boot', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      settings,
      toolchain: toolchain.detectToolchain(settings, app.getAppPath()),
      starterAvailable: fs.existsSync(path.join(app.getAppPath(), 'starter')),
    };
  });

  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, patch) => {
    settings = { ...settings, ...patch, toolchain: { ...settings.toolchain, ...(patch.toolchain || {}) } };
    settingsStore.saveSettings(app, settings);
    return settings;
  });

  ipcMain.handle('toolchain:detect', () => toolchain.detectToolchain(settings, app.getAppPath()));

  ipcMain.handle('project:choose', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: '选择工程目录（存放你的编译器源码）',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    settings = { ...settings, projectDir: res.filePaths[0] };
    settingsStore.saveSettings(app, settings);
    return { canceled: false, projectDir: settings.projectDir, ...projectFs.listProject(settings.projectDir) };
  });

  ipcMain.handle('project:init-starter', () => {
    const projectDir = settings.projectDir;
    if (!projectDir) return { ok: false, error: '请先选择工程目录' };
    const starter = path.join(app.getAppPath(), 'starter');
    if (!fs.existsSync(starter)) return { ok: false, error: '起始模板不存在' };
    fs.cpSync(starter, projectDir, { recursive: true, force: false, errorOnExist: false });
    return { ok: true, ...projectFs.listProject(projectDir) };
  });

  ipcMain.handle('project:list', () => {
    if (!settings.projectDir) return { ok: false, error: '未选择工程目录' };
    return projectFs.listProject(settings.projectDir);
  });
  ipcMain.handle('project:read', (_e, rel) => {
    try {
      return projectFs.readProjectFile(settings.projectDir, rel);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('project:write', (_e, rel, content) => {
    try {
      return projectFs.writeProjectFile(settings.projectDir, rel, content);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('project:create', (_e, rel, kind) => {
    try {
      return projectFs.createProjectEntry(settings.projectDir, rel, kind);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('project:delete', (_e, rel) => {
    try {
      return projectFs.deleteProjectEntry(settings.projectDir, rel);
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('build:run', async (_e, payload) => {
    buildAbort = null;
    const send = (type, text, testId) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('build:log', { type, text, testId });
      }
    };
    try {
      const effectiveCc =
        payload.ccPath && payload.ccPath.trim()
          ? payload.ccPath.trim()
          : toolchain.detectToolchain(settings, app.getAppPath()).cc.path;
      return await buildRunner.runBuild({ ...payload, projectDir: settings.projectDir, ccPath: effectiveCc }, send);
    } catch (e) {
      return { ok: false, error: e.message, results: [] };
    }
  });

  ipcMain.handle('shell:run', async (_e, cmd) => {
    if (!settings.projectDir) return { ok: false, error: '请先选择工程目录' };
    if (typeof cmd !== 'string' || !cmd.trim()) return { ok: false, error: '命令为空' };
    const gccBin = toolchain.bundledGccBin(app.getAppPath()) || path.join(app.getAppPath(), 'vendor', 'w64devkit', 'bin');
    const env = { ...process.env };
    const pathParts = [gccBin, settings.projectDir, env.PATH].filter(Boolean);
    env.PATH = pathParts.join(path.delimiter);
    try {
      const r = await shellRunner.runCommand(cmd, { cwd: settings.projectDir, env });
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('term:run', (_e, cmd) => {
    if (!termSession) {
      const gccBin = toolchain.bundledGccBin(app.getAppPath()) || path.join(app.getAppPath(), 'vendor', 'w64devkit', 'bin');
      termSession = term.createTermSession({
        cwd: settings.projectDir || os.homedir(),
        gccBin,
        send: (ch, data) => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data);
        },
      });
    }
    termSession.run(cmd);
    return { ok: true };
  });

  ipcMain.handle('term:kill', () => {
    if (termSession) termSession.kill();
    return { ok: true };
  });

  ipcMain.handle('ai:chat', async (_e, payload) => {
    const id = payload.requestId || String(Date.now());
    const controller = new AbortController();
    aiAborts.set(id, controller);
    const send = (chunk) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:chunk', { requestId: id, ...chunk });
      }
    };
    try {
      const { content, reasoning } = await ai.streamChat(payload, send, controller.signal);
      return { ok: true, content, reasoning };
    } catch (e) {
      if (controller.signal.aborted) return { ok: false, aborted: true, error: '已取消' };
      return { ok: false, error: e.message };
    } finally {
      aiAborts.delete(id);
    }
  });
  ipcMain.handle('ai:abort', (_e, id) => {
    const c = aiAborts.get(id);
    if (c) c.abort();
    return { ok: true };
  });

  ipcMain.handle('app:open-external', (_e, url) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { ok: true };
  });
  ipcMain.handle('app:reveal-path', (_e, rel) => {
    if (!settings.projectDir) return { ok: false };
    const target = projectFs.resolveSafe(settings.projectDir, rel || '.');
    shell.showItemInFolder(target);
    return { ok: true };
  });
}

app.whenReady().then(() => {
  settings = settingsStore.loadSettings(app);
  Menu.setApplicationMenu(null); // 去掉默认菜单栏（File/Edit/View…）
  registerScheme(path.join(app.getAppPath(), 'dist-renderer'));
  registerIpc();
  createWindow();
  updater.setWindow(mainWindow);
  updater.setup();
  setTimeout(() => updater.check(), 6000); // 启动后延迟检查更新
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
