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
};

function settingsPath(app) {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings(app) {
  try {
    const raw = fs.readFileSync(settingsPath(app), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, toolchain: { ...DEFAULT_SETTINGS.toolchain, ...(parsed.toolchain || {}) } };
  } catch {
    return { ...DEFAULT_SETTINGS, toolchain: { ...DEFAULT_SETTINGS.toolchain } };
  }
}

function saveSettings(app, settings) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(app), JSON.stringify(settings, null, 2), 'utf8');
}

module.exports = { DEFAULT_SETTINGS, loadSettings, saveSettings };
