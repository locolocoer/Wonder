import React, { useCallback, useEffect, useState } from 'react';
import type { GitFile, GitCommit } from '../types';

const KIND_LABEL: Record<GitFile['kind'], string> = {
  modified: '修改',
  added: '新增',
  deleted: '删除',
  untracked: '未跟踪',
};

export function GitPanel({ projectDir }: { projectDir: string }) {
  const [isRepo, setIsRepo] = useState(false);
  const [gitMissing, setGitMissing] = useState(false);
  const [files, setFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');

  const refresh = useCallback(async () => {
    if (!projectDir) return;
    const repo = await window.api.gitIsRepo();
    if (repo.notFound) {
      setGitMissing(true);
      return;
    }
    setGitMissing(false);
    setIsRepo(repo.isRepo);
    if (repo.isRepo) {
      const [st, lg] = await Promise.all([window.api.gitStatus(), window.api.gitLog(50)]);
      if (st.ok) setFiles(st.files);
      if (lg.ok) setCommits(lg.commits);
    }
  }, [projectDir]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const doInit = async () => {
    setBusy(true);
    const r = await window.api.gitInit();
    setBusy(false);
    setTip(r.ok ? '已初始化 git 仓库' : `初始化失败：${r.error}`);
    refresh();
  };

  const doCommit = async () => {
    if (!msg.trim()) {
      setTip('请先填写提交说明');
      return;
    }
    setBusy(true);
    const r = await window.api.gitCommit(msg.trim());
    setBusy(false);
    if (r.ok) {
      setMsg('');
      setTip('提交成功 ✓');
    } else {
      setTip(`提交失败：${r.error || '未知错误'}`);
    }
    refresh();
  };

  const doRollback = async (hash: string) => {
    if (!window.confirm(`回滚到 ${hash}？\n\n这将丢弃当前未提交的改动，以及该版本之后的所有提交。`)) return;
    setBusy(true);
    const r = await window.api.gitRollback(hash);
    setBusy(false);
    setTip(r.ok ? `已回滚到 ${hash}` : `回滚失败：${r.error}`);
    refresh();
  };

  if (gitMissing) {
    return (
      <div className="git-panel">
        <div className="log-line warn">未检测到 git，请先安装 Git 并加入 PATH。</div>
      </div>
    );
  }

  if (!projectDir) {
    return (
      <div className="git-panel">
        <div className="log-line info">请先选择工程目录。</div>
      </div>
    );
  }

  if (!isRepo) {
    return (
      <div className="git-panel">
        <div className="log-line info">当前工程还不是 git 仓库。</div>
        <button className="btn" onClick={doInit} disabled={busy}>
          初始化 git 仓库
        </button>
        {tip && <div className="log-line info">{tip}</div>}
      </div>
    );
  }

  const countByKind = (k: GitFile['kind']) => files.filter((f) => f.kind === k).length;

  return (
    <div className="git-panel">
      <div className="git-section">
        <div className="git-section-title">
          <span>未提交的更改</span>
          <span className="git-badge">
            {files.length ? `${countByKind('modified')} 修改 · ${countByKind('untracked')} 未跟踪` : '工作区干净'}
          </span>
        </div>
        <div className="git-files">
          {files.map((f) => (
            <div key={f.path} className={`git-file ${f.kind}`} title={f.path}>
              <span className="git-file-kind">{KIND_LABEL[f.kind]}</span>
              <span className="git-file-path">{f.path}</span>
            </div>
          ))}
          {!files.length && <div className="log-line info">没有变更。</div>}
        </div>
        <div className="git-commit-row">
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="提交说明（如：完成词法分析）"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') doCommit();
            }}
          />
          <button className="btn primary" onClick={doCommit} disabled={busy || !msg.trim()}>
            {busy ? '处理中…' : '提交全部更改'}
          </button>
        </div>
      </div>

      <div className="git-section">
        <div className="git-section-title">
          <span>提交历史</span>
          <button className="btn" onClick={refresh}>
            ⟳ 刷新
          </button>
        </div>
        <div className="git-commits">
          {commits.map((c, i) => (
            <div key={c.hash} className="git-commit">
              <span className="git-commit-hash" title={c.hash}>
                {c.hash}
              </span>
              <span className="git-commit-subject" title={c.subject}>
                {c.subject}
              </span>
              {i === 0 && <span className="git-tag">HEAD</span>}
              <button className="git-rollback" onClick={() => doRollback(c.hash)} title={`回滚到 ${c.hash}`}>
                回滚
              </button>
            </div>
          ))}
          {!commits.length && <div className="log-line info">还没有提交记录。</div>}
        </div>
      </div>

      {tip && <div className="log-line info">{tip}</div>}
    </div>
  );
}
