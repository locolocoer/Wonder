import React, { useCallback, useEffect, useState } from 'react';
import type { GitFile, GitCommit } from '../types';

const KIND_LABEL: Record<GitFile['kind'], string> = {
  modified: '修改',
  added: '新增',
  deleted: '删除',
  untracked: '未跟踪',
};

function identityHint(err: string): string | null {
  if (/user\.name|user\.email|tell me who you are|identity/i.test(err)) {
    return '提交前需要配置 git 身份。可在终端执行：\ngit config --global user.name "你的名字"\ngit config --global user.email "you@example.com"';
  }
  return null;
}

export function GitPanel({
  projectDir,
  onProjectChanged,
}: {
  projectDir: string;
  onProjectChanged: () => void;
}) {
  const [isRepo, setIsRepo] = useState(false);
  const [gitMissing, setGitMissing] = useState(false);
  const [files, setFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('');
  const [diffPath, setDiffPath] = useState<string | null>(null);
  const [diffText, setDiffText] = useState('');

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
      const hint = identityHint(r.error || '');
      setTip(`提交失败：${r.error || '未知错误'}${hint ? '\n\n' + hint : ''}`);
    }
    refresh();
  };

  const doRollback = async (hash: string) => {
    if (!(await window.api.dialogConfirm({ message: `回滚到 ${hash}？\n\n这将丢弃当前未提交的改动，以及该版本之后的所有提交。` }))) return;
    setBusy(true);
    const r = await window.api.gitRollback(hash);
    setBusy(false);
    setTip(r.ok ? `已回滚到 ${hash}` : `回滚失败：${r.error}`);
    setDiffPath(null);
    setDiffText('');
    if (r.ok) await onProjectChanged();
    refresh();
  };

  const doUncommit = async () => {
    if (!(await window.api.dialogConfirm({ message: '撤销最近一次提交？\n\n改动会回到「未提交」状态，但不会丢失。' }))) return;
    setBusy(true);
    const r = await window.api.gitUncommit();
    setBusy(false);
    setTip(r.ok ? '已撤销最近一次提交（soft reset）' : `撤销失败：${r.error}`);
    refresh();
  };

  const viewDiff = async (path: string) => {
    if (diffPath === path) {
      setDiffPath(null);
      setDiffText('');
      return;
    }
    const r = await window.api.gitDiff(path);
    setDiffPath(path);
    setDiffText(r.ok && r.diff ? r.diff : '(无差异)');
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
              <span className="git-file-path" onClick={() => viewDiff(f.path)} title="点击查看差异">
                {f.path}
              </span>
            </div>
          ))}
          {!files.length && <div className="log-line info">没有变更。</div>}
        </div>
        {diffPath && (
          <div className="git-diff">
            <div className="git-diff-head">
              <span>差异：{diffPath}</span>
              <button className="btn" onClick={() => viewDiff(diffPath)}>
                关闭
              </button>
            </div>
            <pre>{diffText}</pre>
          </div>
        )}
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
          <span className="git-history-actions">
            {commits.length > 0 && (
              <button className="btn" onClick={doUncommit} disabled={busy} title="撤销最近一次提交（soft reset，改动保留）">
                撤销上次提交
              </button>
            )}
            <button className="btn" onClick={refresh}>
              ⟳ 刷新
            </button>
          </span>
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

      {tip && <div className="log-line info" style={{ whiteSpace: 'pre-wrap' }}>{tip}</div>}
    </div>
  );
}
