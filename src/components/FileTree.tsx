import React, { useEffect, useMemo, useState } from 'react';
import type { ProjectFile } from '../types';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  for (const f of files) {
    const segs = f.path.split('/');
    let node = root;
    let acc = '';
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      acc = acc ? `${acc}/${seg}` : seg;
      const isLast = i === segs.length - 1;
      const type = isLast ? f.type : 'dir';
      let child = node.children.find((c) => c.name === seg);
      if (!child) {
        child = { name: seg, path: acc, type: type as 'file' | 'dir', children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  return root.children;
}

export function FileTree({
  files,
  activePath,
  createPending,
  onCreateConsumed,
  onOpen,
  onCreate,
  onDelete,
  onRename,
  onRefresh,
}: {
  files: ProjectFile[];
  activePath: string;
  createPending: boolean;
  onCreateConsumed: () => void;
  onOpen: (path: string) => void;
  onCreate: (path: string, kind: 'file' | 'dir') => void;
  onDelete: (path: string) => void;
  onRename: (path: string, newName: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src', 'tests', 'reference']));
  const [creating, setCreating] = useState<false | 'file' | 'dir'>(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(files), [files]);

  // 外部（快捷键 Ctrl+N）请求新建文件时，打开新建输入框
  useEffect(() => {
    if (createPending) {
      setCreating('file');
      onCreateConsumed();
    }
  }, [createPending, onCreateConsumed]);

  const toggle = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  // 新建的基准目录：选中的目录 → 该目录；选中的文件 → 其父目录；未选中 → 工程根目录
  const createBase = () => {
    if (!selectedPath) return '';
    const f = files.find((x) => x.path === selectedPath);
    if (!f) return '';
    if (f.type === 'dir') return f.path;
    const idx = f.path.lastIndexOf('/');
    return idx >= 0 ? f.path.slice(0, idx) : '';
  };

  const confirmCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const base = createBase();
    const path = base ? `${base}/${name}` : name;
    onCreate(path, creating === 'dir' ? 'dir' : 'file');
    if (base) setExpanded((prev) => new Set(prev).add(base));
    setCreating(false);
    setNewName('');
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName('');
  };

  const confirmRename = () => {
    if (!renaming) return;
    const name = renameValue.trim();
    if (name && name !== renaming.split('/').pop()) onRename(renaming, name);
    setRenaming(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue('');
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isDir = node.type === 'dir';
    const isOpen = expanded.has(node.path);
    const isRenaming = renaming === node.path;
    return (
      <React.Fragment key={node.path}>
        <div
          className={`file-row ${selectedPath === node.path ? 'selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          title={node.path}
          onClick={() => setSelectedPath(node.path)}
        >
          <span
            className="file-toggle"
            onClick={(e) => {
              e.stopPropagation();
              if (isDir) toggle(node.path);
              setSelectedPath(node.path);
            }}
          >
            {isDir ? (isOpen ? '▾' : '▸') : ''}
          </span>
          {isRenaming ? (
            <input
              className="file-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                else if (e.key === 'Escape') cancelRename();
              }}
              onBlur={confirmRename}
            />
          ) : (
            <span
              className={`file-name ${isDir ? 'dir' : ''} ${activePath === node.path ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPath(node.path);
                if (isDir) toggle(node.path);
                else onOpen(node.path);
              }}
            >
              {isDir ? '📁 ' : '📄 '}
              {node.name}
            </span>
          )}
          <span className="file-row-actions">
            <span
              className="file-op"
              title="重命名"
              onClick={() => {
                setRenaming(node.path);
                setRenameValue(node.name);
              }}
            >
              ✎
            </span>
            <span
              className="file-del"
              title="删除"
              onClick={async () => {
                const msg = isDir
                  ? `删除目录 ${node.path}？\n\n目录下的所有文件都会被删除。`
                  : `删除 ${node.path}？`;
                if (await window.api.dialogConfirm({ message: msg })) onDelete(node.path);
              }}
            >
              ✕
            </span>
          </span>
        </div>
        {isDir && isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-actions">
        <button className="btn" onClick={() => setCreating(creating === 'file' ? false : 'file')}>
          ＋文件
        </button>
        <button className="btn" onClick={() => setCreating(creating === 'dir' ? false : 'dir')}>
          ＋目录
        </button>
        <button className="btn" onClick={onRefresh} title="刷新">
          ⟳
        </button>
      </div>
      {creating && (
        <div className="create-row">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={creating === 'file' ? '文件名，如 lexer.c' : '目录名，如 tests'}
            autoFocus
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmCreate();
              else if (e.key === 'Escape') cancelCreate();
            }}
          />
          <button className="btn" onClick={confirmCreate}>
            确认
          </button>
          <button className="btn" onClick={cancelCreate}>
            取消
          </button>
        </div>
      )}
      {creating && (
        <div className="create-hint">
          将创建到：<span className="create-base">{createBase() || '工程根目录'}</span>（也可直接输入 src/lexer.c 建到子目录）
        </div>
      )}
      <div className="file-list">{tree.map((n) => renderNode(n, 0))}</div>
    </div>
  );
}
