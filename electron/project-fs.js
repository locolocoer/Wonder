'use strict';
const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.trainer-tests', 'build', 'release', '.vscode', '.wonder-backup']);

// 写文件前自动备份：保留上一次内容，防止误覆盖后无法找回。
const BACKUP_DIR = '.wonder-backup';
function backupBeforeWrite(projectDir, target) {
  try {
    if (!fs.existsSync(target)) return;
    const backupDir = path.join(path.resolve(projectDir), BACKUP_DIR);
    fs.mkdirSync(backupDir, { recursive: true });
    const rel = path.relative(path.resolve(projectDir), target).split(path.sep).join('__');
    fs.copyFileSync(target, path.join(backupDir, rel + '.bak'));
  } catch {
    /* 备份失败不影响写入 */
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function resolveSafe(projectDir, rel) {
  const root = path.resolve(projectDir);
  const target = path.resolve(root, rel || '.');
  if (!isInside(root, target)) {
    throw new Error(`路径越界：${rel}`);
  }
  return target;
}

function walkDir(dir, root, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) {
    if (e.isDirectory()) {
      // 隐藏点目录与常见排除目录（.git、node_modules 等）
      if (e.name.startsWith('.') || EXCLUDED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      out.push({ path: path.relative(root, full).split(path.sep).join('/'), name: e.name, type: 'dir' });
      walkDir(full, root, out);
    } else if (e.isFile()) {
      // 显示点文件（如 .gitignore、.editorconfig）
      const full = path.join(dir, e.name);
      out.push({ path: path.relative(root, full).split(path.sep).join('/'), name: e.name, type: 'file' });
    }
  }
}

function listProject(projectDir) {
  const root = path.resolve(projectDir);
  if (!fs.existsSync(root)) return { ok: false, error: '工程目录不存在' };
  const files = [];
  walkDir(root, root, files);
  return { ok: true, root, files };
}

function readProjectFile(projectDir, rel) {
  const target = resolveSafe(projectDir, rel);
  const stat = fs.statSync(target);
  if (stat.size > 2 * 1024 * 1024) {
    return { ok: false, error: '文件过大 (>2MB)' };
  }
  return { ok: true, path: rel, content: fs.readFileSync(target, 'utf8') };
}

function writeProjectFile(projectDir, rel, content) {
  const target = resolveSafe(projectDir, rel);
  backupBeforeWrite(projectDir, target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return { ok: true };
}

function createProjectEntry(projectDir, rel, kind) {
  const target = resolveSafe(projectDir, rel);
  if (fs.existsSync(target)) return { ok: false, error: '目标已存在' };
  if (kind === 'dir') {
    fs.mkdirSync(target, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '', 'utf8');
  }
  return { ok: true };
}

function deleteProjectEntry(projectDir, rel) {
  const root = path.resolve(projectDir);
  const target = resolveSafe(projectDir, rel);
  if (target === root) return { ok: false, error: '不能删除工程根目录' };
  fs.rmSync(target, { recursive: true, force: true });
  return { ok: true };
}

function renameProjectEntry(projectDir, rel, newName) {
  const target = resolveSafe(projectDir, rel);
  if (target === path.resolve(projectDir)) return { ok: false, error: '不能重命名工程根目录' };
  const base = newName.replace(/[/\\]/g, '').trim();
  if (!base) return { ok: false, error: '名称不能为空' };
  if (base === '.' || base === '..') return { ok: false, error: '非法名称' };
  const dest = path.join(path.dirname(target), base);
  if (dest === target) return { ok: true };
  if (fs.existsSync(dest)) return { ok: false, error: '目标名称已存在' };
  fs.renameSync(target, dest);
  return { ok: true };
}

module.exports = {
  listProject,
  readProjectFile,
  writeProjectFile,
  createProjectEntry,
  deleteProjectEntry,
  renameProjectEntry,
  resolveSafe,
};
