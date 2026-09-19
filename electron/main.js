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
const git = require('./git');

const SCHEME = 'app';
let mainWindow = null;
let settings = null;
let buildAbort = null;
let termSession = null;
let allowClose = false;
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
  allowClose = false;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: 'Wonder',
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
  mainWindow.on('close', (e) => {
    if (!allowClose) {
      e.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app:close-requested');
    }
  });
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
  ipcMain.handle('app:close-now', () => {
    allowClose = true;
    if (mainWindow) mainWindow.close();
    return { ok: true };
  });

  ipcMain.handle('update:check', () => {
    updater.check();
    return { ok: true };
  });
  ipcMain.handle('update:install', () => {
    updater.install();
    return { ok: true };
  });

  ipcMain.handle('chat:load', () => {
    try {
      const arr = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'chat.json'), 'utf8'));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });
  ipcMain.handle('chat:save', (_e, messages) => {
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'chat.json'), JSON.stringify(messages), 'utf8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('chat:clear', () => {
    try {
      fs.rmSync(path.join(app.getPath('userData'), 'chat.json'), { force: true });
      return { ok: true };
    } catch {
      return { ok: true };
    }
  });

  ipcMain.handle('git:is-repo', () => (settings.projectDir ? git.isRepo(settings.projectDir) : { ok: true, isRepo: false }));
  ipcMain.handle('git:init', () => (settings.projectDir ? git.init(settings.projectDir) : { ok: false, error: '请先选择工程目录' }));
  ipcMain.handle('git:status', () => (settings.projectDir ? git.status(settings.projectDir) : { ok: false, error: '请先选择工程目录', files: [] }));
  ipcMain.handle('git:log', (_e, n) => (settings.projectDir ? git.log(settings.projectDir, n || 50) : { ok: false, error: '请先选择工程目录', commits: [] }));
  ipcMain.handle('git:commit', (_e, message) => (settings.projectDir ? git.commit(settings.projectDir, String(message || '')) : { ok: false, error: '请先选择工程目录' }));
  ipcMain.handle('git:rollback', (_e, hash) => (settings.projectDir ? git.rollback(settings.projectDir, String(hash || '')) : { ok: false, error: '请先选择工程目录' }));
  ipcMain.handle('git:diff', (_e, rel) => (settings.projectDir ? git.diff(settings.projectDir, rel || null) : { ok: false, error: '请先选择工程目录' }));
  ipcMain.handle('git:uncommit', () => (settings.projectDir ? git.uncommit(settings.projectDir) : { ok: false, error: '请先选择工程目录' }));

  ipcMain.handle('dialog:confirm', async (_e, opts = {}) => {
    const res = await dialog.showMessageBox(mainWindow, {
      type: opts.type || 'question',
      title: opts.title || '确认',
      message: String(opts.message || ''),
      buttons: opts.buttons || ['取消', '确定'],
      defaultId: opts.defaultId ?? 1,
      cancelId: opts.cancelId ?? 0,
      noLink: true,
    });
    return res.response === (opts.defaultId ?? 1);
  });

  ipcMain.handle('dialog:message', async (_e, opts = {}) => {
    await dialog.showMessageBox(mainWindow, {
      type: opts.type || 'info',
      title: opts.title || '提示',
      message: String(opts.message || ''),
      buttons: opts.buttons || ['确定'],
      defaultId: 0,
      noLink: true,
    });
    return { ok: true };
  });

  ipcMain.handle('dialog:choice', async (_e, opts = {}) => {
    const buttons = Array.isArray(opts.buttons) && opts.buttons.length ? opts.buttons : ['确定'];
    const res = await dialog.showMessageBox(mainWindow, {
      type: opts.type || 'question',
      title: opts.title || '提示',
      message: String(opts.message || ''),
      detail: opts.detail ? String(opts.detail) : undefined,
      buttons,
      defaultId: opts.defaultId ?? 0,
      cancelId: opts.cancelId ?? buttons.length - 1,
      noLink: true,
    });
    return { response: res.response };
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
    try {
      // 初始化为「空工程」：只确保目录存在，不复制任何代码，全部由学生自己写。
      fs.mkdirSync(projectDir, { recursive: true });
    } catch (e) {
      return { ok: false, error: e.message };
    }
    return { ok: true, ...projectFs.listProject(projectDir) };
  });

  ipcMain.handle('app:read-reference', () => {
    const ref = path.join(app.getAppPath(), 'starter', 'reference', 'mycc.c');
    try {
      return { ok: true, content: fs.readFileSync(ref, 'utf8') };
    } catch {
      return { ok: false, error: '参考答案文件不存在' };
    }
  });

  // Ctrl+点击 #include 头文件：解析并读取头文件内容（系统头文件从内置 gcc 里找，本地头文件按当前文件目录找）
  ipcMain.handle('app:open-header', (_e, payload = {}) => {
    const kind = payload.kind === 'local' ? 'local' : 'sys';
    const name = String(payload.name || '').replace(/\\/g, '/');
    if (!name) return { ok: false, error: '无效的头文件名' };

    let full = null;
    if (kind === 'sys') {
      const incDirs = [];
      const gccBin = toolchain.bundledGccBin(app.getAppPath());
      if (gccBin) incDirs.push(path.join(path.dirname(gccBin), '..', 'include'));
      if (app.getAppPath()) incDirs.push(path.join(app.getAppPath(), 'vendor', 'w64devkit', 'include'));
      for (const d of incDirs) {
        const p = path.join(d, name);
        if (fs.existsSync(p)) {
          full = p;
          break;
        }
      }
    } else if (settings.projectDir) {
      const base = payload.basePath
        ? path.dirname(path.resolve(settings.projectDir, String(payload.basePath)))
        : settings.projectDir;
      const p = path.resolve(base, name);
      if (fs.existsSync(p)) full = p;
    }

    if (!full) return { ok: false, error: `找不到头文件 ${name}` };
    try {
      const stat = fs.statSync(full);
      if (stat.size > 2 * 1024 * 1024) return { ok: false, error: '头文件过大' };
      return { ok: true, path: full, name: path.basename(full), content: fs.readFileSync(full, 'utf8') };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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
  ipcMain.handle('project:rename', (_e, rel, newName) => {
    try {
      return projectFs.renameProjectEntry(settings.projectDir, rel, String(newName || ''));
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

  ipcMain.handle('term:reset', () => {
    if (termSession) termSession.kill();
    termSession = null;
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

app.on('before-quit', () => {
  // 应用整体退出（含自动更新安装）时放行，避免被未保存提示拦截。
  allowClose = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
