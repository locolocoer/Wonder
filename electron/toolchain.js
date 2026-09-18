'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Candidate C compilers, ordered by preference.
const CC_CANDIDATES = ['gcc', 'cc', 'clang', 'tcc', 'cl'];
const ASM_CANDIDATES = ['nasm', 'as'];

const WIN_COMMON_DIRS = [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LLVM', 'bin'),
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'mingw64', 'bin'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'mingw64', 'bin'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'LLVM', 'bin'),
  'C:\\msys64\\mingw64\\bin',
  'C:\\msys64\\ucrt64\\bin',
  'C:\\msys64\\clang64\\bin',
  'C:\\TDM-GCC-64\\bin',
  'C:\\MinGW\\bin',
  'C:\\w64devkit\\bin',
];

function existsExec(p) {
  if (!p) return false;
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function withExe(name) {
  return process.platform === 'win32' && !/\.exe$/i.test(name) ? `${name}.exe` : name;
}

function findOnPath(cmd) {
  try {
    const exe = withExe(cmd);
    const tool = process.platform === 'win32' ? 'where' : 'which';
    const out = execFileSync(tool, [exe], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const lines = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length) return lines[0];
  } catch {
    /* not found on PATH */
  }
  // Manual PATH scan as a fallback (some tools are not on PATH but in common dirs).
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const p = path.join(dir, withExe(cmd));
    if (existsExec(p)) return p;
  }
  return null;
}

function findInCommonDirs(cmd) {
  if (process.platform !== 'win32') return null;
  for (const dir of WIN_COMMON_DIRS) {
    const p = path.join(dir, withExe(cmd));
    if (existsExec(p)) return p;
  }
  return null;
}

function probeVersion(exePath) {
  try {
    const out = execFileSync(exePath, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
      timeout: 5000,
    });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first ? first.slice(0, 160) : '';
  } catch {
    return '';
  }
}

function locate(name, override) {
  if (override && existsExec(override)) {
    return { found: true, path: override, name, version: probeVersion(override) };
  }
  const onPath = findOnPath(name);
  if (onPath) {
    return { found: true, path: onPath, name, version: probeVersion(onPath) };
  }
  const common = findInCommonDirs(name);
  if (common) {
    return { found: true, path: common, name, version: probeVersion(common) };
  }
  if (override) {
    return { found: false, path: override, name, version: '' };
  }
  return { found: false, path: '', name, version: '' };
}

function locateFirst(names, override) {
  if (override) {
    // A single explicit override maps to the first candidate's "slot".
    const r = locate(names[0], override);
    return r;
  }
  for (const n of names) {
    const r = locate(n, null);
    if (r.found) return r;
  }
  return { found: false, path: '', name: names.join('/'), version: '' };
}

/** 随应用分发的便携 gcc（w64devkit）的 bin 目录，内含 gcc/as/ld/make 等。 */
function bundledGccBin(appPath) {
  if (!appPath) return null;
  const p = path.join(appPath, 'vendor', 'w64devkit', 'bin');
  return fs.existsSync(p) ? p : null;
}

/** 内置 gcc 可执行文件路径。 */
function bundledGcc(appPath) {
  const bin = bundledGccBin(appPath);
  if (!bin) return null;
  const gcc = path.join(bin, 'gcc.exe');
  return existsExec(gcc) ? gcc : null;
}

/**
 * Detect the C toolchain. `settings` may contain { toolchain: { ccPath, asmPath } }.
 * Priority for the effective compiler:
 *   1) user-configured ccPath (if it exists on disk)
 *   2) bundled gcc (w64devkit, ships with the app, no install needed)
 *   3) system gcc/clang/cc on PATH or common dirs
 */
function detectToolchain(settings, appPath) {
  const tc = (settings && settings.toolchain) || {};
  let cc;

  if (tc.ccPath && existsExec(tc.ccPath)) {
    cc = {
      found: true,
      path: tc.ccPath,
      name: path.basename(tc.ccPath).replace(/\.exe$/i, ''),
      version: probeVersion(tc.ccPath),
      builtin: false,
    };
  } else {
    const bundled = bundledGcc(appPath);
    if (bundled) {
      cc = { found: true, path: bundled, name: 'gcc', version: probeVersion(bundled), builtin: true };
    } else {
      cc = locateFirst(CC_CANDIDATES, null);
      if (cc.found) cc.builtin = false;
    }
  }

  const asm = locateFirst(ASM_CANDIDATES, tc.asmPath);
  const available = cc.found;
  const missing = [];
  if (!cc.found) missing.push('C 编译器');
  if (!asm.found) missing.push('汇编器 (nasm/as)');
  return { cc, asm, available, missing };
}

module.exports = { detectToolchain, bundledGcc, bundledGccBin, CC_CANDIDATES, ASM_CANDIDATES };
