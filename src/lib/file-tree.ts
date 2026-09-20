import type { ProjectFile } from '../types';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[];
}

/** 由扁平的 ProjectFile[] 构建目录树（目录在前、按名排序由调用方决定）。 */
export function buildTree(files: ProjectFile[]): TreeNode[] {
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

/** 判断 path 是否被选中，或位于某个选中的目录之下。 */
export function isPathSelected(path: string, contextPaths: string[]): boolean {
  return contextPaths.some((p) => path === p || path.startsWith(p + '/'));
}
