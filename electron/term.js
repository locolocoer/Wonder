'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { decodeOutput } = require('./decode');

/**
 * 一个简单的终端会话：维护工作目录、逐条执行命令并把输出回传。
 * 用 xterm.js 渲染，后端走 cmd.exe 管道（无需原生 PTY 模块）。
 */
function createTermSession({ cwd, gccBin, send }) {
  let currentCwd = cwd;
  let currentChild = null;

  function reply(text) {
    send('term:data', text);
  }

  function finish(code) {
    send('term:exit', { code, cwd: currentCwd });
  }

  function run(rawCmd) {
    const cmd = String(rawCmd || '').trim();
    if (!cmd) {
      reply('\r\n');
      finish(0);
      return;
    }

    // cd 本地处理，保持工作目录（跨命令持久）
    const cdMatch = /^cd(?:\s+(.+))?$/i.exec(cmd);
    if (cdMatch) {
      let target = (cdMatch[1] || '').trim();
      if (!target || target === '~') {
        target = process.env.USERPROFILE || process.cwd();
      } else {
        target = path.isAbsolute(target) ? target : path.resolve(currentCwd, target);
      }
      try {
        if (fs.statSync(target).isDirectory()) {
          currentCwd = target;
        } else {
          reply(`\r\n系统找不到指定的路径: ${target}\r\n`);
        }
      } catch {
        reply(`\r\n系统找不到指定的路径: ${target}\r\n`);
      }
      finish(0);
      return;
    }

    const env = { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color', CLICOLOR_FORCE: '1' };
    if (gccBin) env.PATH = [gccBin, env.PATH].filter(Boolean).join(path.delimiter);

    const shell = process.env.ComSpec || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
    let child;
    try {
      child = spawn(shell, ['/c', cmd], { cwd: currentCwd, env, windowsHide: true });
    } catch (e) {
      reply(`\r\n无法启动命令: ${e.message}\r\n`);
      finish(-1);
      return;
    }
    currentChild = child;

    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => chunks.push(d));
    child.on('error', (e) => reply(`\r\n${e.message}\r\n`));
    child.on('close', (code) => {
      if (chunks.length) reply(decodeOutput(Buffer.concat(chunks)));
      currentChild = null;
      finish(code === null ? -1 : code);
    });
  }

  function kill() {
    if (currentChild) {
      try {
        currentChild.kill();
      } catch {
        /* ignore */
      }
      currentChild = null;
    }
  }

  return { run, kill, getCwd: () => currentCwd };
}

module.exports = { createTermSession };
