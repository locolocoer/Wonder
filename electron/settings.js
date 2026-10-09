'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  temperature: 0.6,
  toolchain: { ccPath: '', asmPath: '' },
  projectDir: '',
  theme: 'vs-dark',
  language: 'c', // 实现语言：'c' 或 'cpp'
  sso: {
    enabled: false, // 是否启用启动登录
    issuer: '', // OIDC issuer，如 https://<实例>.account.aliyuncs.com
    clientId: '',
    redirectUri: 'http://127.0.0.1:18317/callback', // 必须与 IDaaS 控制台登记的回调地址一致
    scopes: 'openid profile email',
  },
};

function settingsPath(app) {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(app) {
  try {
    const raw = fs.readFileSync(settingsPath(app), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      toolchain: { ...DEFAULT_SETTINGS.toolchain, ...(parsed.toolchain || {}) },
      sso: { ...DEFAULT_SETTINGS.sso, ...(parsed.sso || {}) },
    };
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      toolchain: { ...DEFAULT_SETTINGS.toolchain },
      sso: { ...DEFAULT_SETTINGS.sso },
    };
  }
}

function saveSettings(app, settings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(app), JSON.stringify(settings, null, 2), 'utf8');
}

module.exports = { DEFAULT_SETTINGS, loadSettings, saveSettings };
