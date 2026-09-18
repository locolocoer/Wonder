'use strict';
const { exec } = require('child_process');
const { decodeOutput } = require('./decode');

/**
 * 在指定目录用系统 shell 运行一条命令（Windows 用 cmd.exe，支持 &&、>、.bat 等）。
 * 返回 { code, stdout, stderr, timedOut }。输出按 UTF-8/GBK 自适应解码，避免中文乱码。
 */
function runCommand(cmd, opts = {}) {
  return new Promise((resolve) => {
    exec(
      cmd,
      {
        cwd: opts.cwd,
        env: opts.env || process.env,
        timeout: opts.timeout || 30000,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        encoding: 'buffer',
      },
      (err, stdout, stderr) => {
        const out = decodeOutput(stdout);
        const errOut = decodeOutput(stderr);
        if (err) {
          resolve({
            code: typeof err.code === 'number' ? err.code : -1,
            stdout: out,
            stderr: errOut,
            timedOut: Boolean(err.killed),
          });
        } else {
          resolve({ code: 0, stdout: out, stderr: errOut });
        }
      }
    );
  });
}

module.exports = { runCommand };

