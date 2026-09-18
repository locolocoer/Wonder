'use strict';
const fs = require('fs');
const path = require('path');

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.trainer-tests', 'build', 'release', '.vscode']);

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
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) {
      if (EXCLUDED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      out.push({ path: path.relative(root, full).split(path.sep).join('/'), name: e.name, type: 'dir' });
      walkDir(full, root, out);
    } else if (e.isFile()) {
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

module.exports = {
  listProject,
  readProjectFile,
  writeProjectFile,
  createProjectEntry,
  deleteProjectEntry,
  resolveSafe,
};
