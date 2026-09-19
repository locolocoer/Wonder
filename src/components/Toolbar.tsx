import React, { useEffect, useState } from 'react';
import type { ToolchainInfo } from '../types';

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
      <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function Toolbar({
  projectDir,
  toolchain,
  buildRunning,
  starterAvailable,
  language,
  onChooseProject,
  onInitStarter,
  onOpenReference,
  onOpenSettings,
  onRunBuild,
}: {
  projectDir: string;
  toolchain: ToolchainInfo;
  buildRunning: boolean;
  starterAvailable: boolean;
  language: 'c' | 'cpp';
  onChooseProject: () => void;
  onInitStarter: () => void;
  onOpenReference: () => void;
  onOpenSettings: () => void;
  onRunBuild: () => void;
}) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.api.winIsMaximized().then(setMaximized);
    const off = window.api.onEvent('win:maximize-changed', (v: boolean) => setMaximized(v));
    return off;
  }, []);

  return (
    <header className="toolbar">
      <span className="brand">Wonder</span>
      <span className="brand-sub">项目编程训练器</span>
      <span className="toolbar-sep" />
      <button className="btn" onClick={onChooseProject}>
        {projectDir ? '更换工程' : '选择工程目录'}
      </button>
      <button className="btn" onClick={onInitStarter} title="把当前工程初始化为空文件夹（不复制任何代码，全部自己写）">
        初始化空工程
      </button>
      <button
        className="btn"
        onClick={onOpenReference}
        disabled={!starterAvailable}
        title={starterAvailable ? '只读查看完整参考答案（mycc.c）' : '参考答案不可用（应用资源缺失）'}
      >
        📖 参考答案
      </button>
      <span className="project-path" title={projectDir}>
        {projectDir || '（未选择工程）'}
      </span>
      <span className="spacer" />
      <span className={`badge ${toolchain.available ? 'ok' : 'warn'}`}>
        {toolchain.available
          ? (language === 'cpp' ? toolchain.cxx : toolchain.cc).builtin
            ? `🛠 内置 ${language === 'cpp' ? 'g++' : 'gcc'} 可用`
            : `🛠 ${language === 'cpp' ? 'g++' : 'gcc'} 可用`
          : language === 'cpp'
            ? '⚠ 未检测到 C++ 编译器'
            : '⚠ 未检测到 C 编译器'}
      </span>
      <button className="btn primary" onClick={() => onRunBuild()} disabled={buildRunning || !projectDir}>
        {buildRunning ? '运行中…' : '▶ 编译并测试'}
      </button>
      <button className="btn" onClick={onOpenSettings}>
        ⚙ 设置
      </button>
      <div className="win-controls">
        <button className="win-btn" onClick={() => window.api.winMinimize()} title="最小化">
          <MinimizeIcon />
        </button>
        <button className="win-btn" onClick={() => window.api.winToggleMaximize()} title={maximized ? '还原' : '最大化'}>
          {maximized ? <RestoreIcon /> : <MaximizeIcon />}
        </button>
        <button className="win-btn close" onClick={() => window.api.winClose()} title="关闭">
          <CloseIcon />
        </button>
      </div>
    </header>
  );
}
