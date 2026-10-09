'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createStreamDecoder } = require('./decode');

/**
 * 一个简单的终端会话：维护工作目录、逐条执行命令并把输出回传。
 * 用 xterm.js 渲染，后端走 cmd.exe 管道（无需原生 PTY 模块）。
 */
function createTermSession({ cwd, gccBin, send }) {
  let currentCwd = cwd;
  let currentChild = null;
  const sessionEnv = {}; // 用户在终端里 set 的环境变量，跨命令持久
  const clearedVars = new Set(); // 被 `set VAR=` 清空过的变量（不能回落到 process.env）
  const dirStack = []; // pushd/popd 目录栈

  function reply(text) {
    send('term:data', text);
  }

  function finish(code) {
    send('term:exit', { code, cwd: currentCwd });
  }

  function resolveDir(target) {
    if (!target || target === '~') return process.env.USERPROFILE || currentCwd;
    // 绝对路径或盘符（如 C:\ 或 D:foo）
    if (path.isAbsolute(target) || /^[a-zA-Z]:/.test(target)) return target;
    return path.resolve(currentCwd, target);
  }

  function tryCd(target) {
    const resolved = resolveDir(target);
    try {
      if (fs.statSync(resolved).isDirectory()) {
        currentCwd = resolved;
        return '';
      }
      return `\r\n系统找不到指定的路径: ${resolved}\r\n`;
    } catch {
      return `\r\n系统找不到指定的路径: ${resolved}\r\n`;
    }
  }

  function run(rawCmd) {
    const cmd = String(rawCmd || '').trim();
    if (!cmd) {
      reply('\r\n');
      finish(0);
      return;
    }

    // ---- 本地模拟的命令（跨命令持久化状态）----

    // cd / chdir（支持 cd /d 跨盘、~、相对路径）
    const cdMatch = /^(?:cd|chdir)(?:\s+(.*))?$/i.exec(cmd);
    if (cdMatch) {
      let target = (cdMatch[1] || '').trim();
      if (/^\/d\b/i.test(target)) target = target.replace(/^\/d\s*/i, '').trim();
      reply(tryCd(target || '~'));
      finish(0);
      return;
    }

    // pushd / popd
    const pushdMatch = /^pushd(?:\s+(.*))?$/i.exec(cmd);
    if (pushdMatch) {
      let target = (pushdMatch[1] || '').trim();
      if (/^\/d\b/i.test(target)) target = target.replace(/^\/d\s*/i, '').trim();
      dirStack.push(currentCwd);
      reply(tryCd(target || '~'));
      finish(0);
      return;
    }
    if (/^popd\s*$/i.test(cmd)) {
      if (dirStack.length) {
        currentCwd = dirStack.pop();
      } else {
        reply('\r\n目录栈为空\r\n');
      }
      finish(0);
      return;
    }

    // set：持久化环境变量（set VAR=value / set "VAR=value" / set VAR / set）
    const setMatch = /^set(?:\s+(.*))?$/i.exec(cmd);
    if (setMatch) {
      const arg = (setMatch[1] || '').trim();
      if (!arg) {
        const all = { ...process.env, ...sessionEnv };
        const list = Object.keys(all)
          .sort()
          .map((k) => `${k}=${all[k]}`)
          .join('\r\n');
        reply('\r\n' + list + '\r\n');
        finish(0);
        return;
      }
      const eq = arg.indexOf('=');
      if (eq < 0) {
        const name = arg.replace(/^"|"$/g, '');
        const val = clearedVars.has(name) ? '' : (sessionEnv[name] !== undefined ? sessionEnv[name] : process.env[name]);
        reply(val === undefined || val === null || val === '' ? '\r\n' : `\r\n${val}\r\n`);
        finish(0);
        return;
      }
      let name = arg.slice(0, eq).trim().replace(/^"|"$/g, '');
      let value = arg.slice(eq + 1).replace(/^"|"$/g, '');
      if (name) {
        if (value === '') {
          delete sessionEnv[name];
          clearedVars.add(name);
        } else {
          sessionEnv[name] = value;
          clearedVars.delete(name);
        }
      }
      finish(0);
      return;
    }

    const env = { ...process.env, ...sessionEnv, FORCE_COLOR: '1', TERM: 'xterm-256color', CLICOLOR_FORCE: '1' };
    for (const k of clearedVars) delete env[k];
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

    // 流式解码 + 50ms 防抖：流式解码器跨 chunk 保持多字节字符状态，防抖保证接近实时。
    const streamDecoder = createStreamDecoder();
    let pending = Buffer.alloc(0);
    let timer = null;
    const flush = () => {
      if (!pending.length) return;
      reply(streamDecoder.push(pending));
      pending = Buffer.alloc(0);
    };
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 50);
    };
    child.stdout.on('data', (d) => {
      pending = Buffer.concat([pending, d]);
      schedule();
    });
    child.stderr.on('data', (d) => {
      pending = Buffer.concat([pending, d]);
      schedule();
    });
    child.on('error', (e) => reply(`\r\n${e.message}\r\n`));
    child.on('close', (code) => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
      currentChild = null;
      finish(code === null ? -1 : code);
    });
  }

  function kill() {
    if (!currentChild) return;
    const child = currentChild;
    // Windows 下 cmd.exe /c <cmd> 的子进程是孙进程，child.kill() 杀不掉；用 taskkill /T 杀整棵树
    if (process.platform === 'win32' && child.pid) {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      } catch {
        /* ignore */
      }
    }
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    // currentChild 由 'close' 事件置空
  }

  return { run, kill, getCwd: () => currentCwd };
}

module.exports = { createTermSession };
