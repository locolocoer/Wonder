'use strict';
const { execFile } = require('child_process');
const { decodeOutput } = require('./decode');

// 在工程目录执行 git 命令，输出按 UTF-8/GBK 自适应解码。
function runGit(projectDir, args) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd: projectDir, maxBuffer: 32 * 1024 * 1024, windowsHide: true, encoding: 'buffer' },
      (err, stdout, stderr) => {
        resolve({
          code: err ? (typeof err.code === 'number' ? err.code : -1) : 0,
          stdout: decodeOutput(stdout),
          stderr: decodeOutput(stderr),
          notFound: Boolean(err && err.code === 'ENOENT'),
        });
      }
    );
  });
}

async function isRepo(projectDir) {
  const r = await runGit(projectDir, ['rev-parse', '--is-inside-work-tree']);
  return { ok: true, isRepo: r.code === 0, notFound: r.notFound };
}

async function init(projectDir) {
  const r = await runGit(projectDir, ['init']);
  if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout };
  return { ok: true, output: r.stdout };
}

async function status(projectDir) {
  const r = await runGit(projectDir, ['status', '--porcelain']);
  if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout, files: [] };
  const files = r.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2);
      const path = line.slice(3).trim();
      const kind = code.includes('?') ? 'untracked' : code.trim() === 'A' ? 'added' : code.includes('D') ? 'deleted' : 'modified';
      return { code, path, kind };
    });
  return { ok: true, files };
}

async function log(projectDir, n = 50) {
  const r = await runGit(projectDir, ['log', '--pretty=format:%h%x09%s%x09%ci', `-n${n}`]);
  if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout, commits: [] };
  const commits = r.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, date] = line.split('\t');
      return { hash: hash || '', subject: subject || '', date: date || '' };
    });
  return { ok: true, commits };
}

async function commit(projectDir, message) {
  const add = await runGit(projectDir, ['add', '-A']);
  if (add.code !== 0) return { ok: false, error: add.stderr || add.stdout };
  const c = await runGit(projectDir, ['commit', '-m', message]);
  if (c.code !== 0) return { ok: false, error: c.stderr || c.stdout };
  return { ok: true, output: c.stdout };
}

async function rollback(projectDir, hash) {
  const r = await runGit(projectDir, ['reset', '--hard', hash]);
  if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout };
  return { ok: true, output: r.stdout };
}

async function diff(projectDir, rel) {
  const args = ['diff', '--no-color'];
  if (rel) args.push('--', rel);
  const r = await runGit(projectDir, args);
  // git diff 对无差异返回 code 0 且输出为空；code 非 0 通常表示有差异（git 用 1 表示存在差异）
  return { ok: true, diff: r.stdout, notFound: r.notFound };
}

async function uncommit(projectDir) {
  const r = await runGit(projectDir, ['reset', '--soft', 'HEAD~1']);
  if (r.code !== 0) return { ok: false, error: r.stderr || r.stdout };
  return { ok: true, output: r.stdout };
}

module.exports = { runGit, isRepo, init, status, log, commit, rollback, diff, uncommit };
