import React, { useMemo, useState } from 'react';
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
  onOpen,
  onCreate,
  onDelete,
  onRefresh,
}: {
  files: ProjectFile[];
  activePath: string;
  onOpen: (path: string) => void;
  onCreate: (path: string, kind: 'file' | 'dir') => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src', 'tests', 'reference']));
  const [creating, setCreating] = useState<false | 'file' | 'dir'>(false);
  const tree = useMemo(() => buildTree(files), [files]);

  const toggle = (p: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const handleCreate = () => {
    const name = window.prompt('输入名称（如 lexer.c 或 tests/）', creating === 'dir' ? 'newdir' : 'newfile.c');
    if (!name) return;
    onCreate(name, creating === 'dir' ? 'dir' : 'file');
    setCreating(false);
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isDir = node.type === 'dir';
    const isOpen = expanded.has(node.path);
    return (
      <React.Fragment key={node.path}>
        <div
          className="file-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          title={node.path}
        >
          <span className="file-toggle" onClick={() => isDir && toggle(node.path)}>
            {isDir ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span
            className={`file-name ${isDir ? 'dir' : ''} ${activePath === node.path ? 'active' : ''}`}
            onClick={() => (isDir ? toggle(node.path) : onOpen(node.path))}
          >
            {isDir ? '📁 ' : '📄 '}
            {node.name}
          </span>
          {!isDir && (
            <span
              className="file-del"
              title="删除"
              onClick={() => {
                if (window.confirm(`删除 ${node.path}？`)) onDelete(node.path);
              }}
            >
              ✕
            </span>
          )}
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
          <span>新建{creating === 'file' ? '文件' : '目录'}:</span>
          <button className="btn" onClick={handleCreate}>
            确认
          </button>
          <button className="btn" onClick={() => setCreating(false)}>
            取消
          </button>
        </div>
      )}
      <div className="file-list">{tree.map((n) => renderNode(n, 0))}</div>
    </div>
  );
}
