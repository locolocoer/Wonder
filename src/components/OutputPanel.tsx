import React, { useState } from 'react';
import type { BuildResult, BuildLogEntry, ToolchainInfo } from '../types';
import { Terminal } from './Terminal';

export function OutputPanel({
  style,
  buildResult,
  logs,
  buildRunning,
  toolchain,
  onRunBuild,
  onRevealProject,
  initialCwd,
  currentStageDone,
  onMarkStageDone,
}: {
  style?: React.CSSProperties;
  buildResult: BuildResult | null;
  logs: BuildLogEntry[];
  buildRunning: boolean;
  toolchain: ToolchainInfo;
  onRunBuild: () => void;
  onRevealProject: () => void;
  initialCwd: string;
  currentStageDone: boolean;
  onMarkStageDone: () => void;
}) {
  const [tab, setTab] = useState<'tests' | 'terminal'>('tests');

  return (
    <div className="output-panel" style={style}>
      <div className="output-head">
        <div className="output-tabs">
          <button className={`output-tab ${tab === 'tests' ? 'active' : ''}`} onClick={() => setTab('tests')}>
            测试结果
          </button>
          <button className={`output-tab ${tab === 'terminal' ? 'active' : ''}`} onClick={() => setTab('terminal')}>
            终端
          </button>
        </div>
        <span className="spacer" style={{ flex: 1 }} />
        {tab === 'tests' ? (
          <>
            {buildResult && buildResult.ok && (
              <span className={`badge ${buildResult.failCount === 0 ? 'ok' : 'warn'}`}>
                通过 {buildResult.passCount}/{buildResult.total}
              </span>
            )}
            {!toolchain.available && (
              <span className="badge warn" title="在「设置」里指定编译器路径">
                ⚠ 未检测到 C 编译器
              </span>
            )}
            <button className="btn" onClick={onRunBuild} disabled={buildRunning || !toolchain.available}>
              {buildRunning ? '运行中…' : '▶ 编译并测试'}
            </button>
            <button className="btn" onClick={onRevealProject} title="在资源管理器中打开工程目录">
              📂 打开目录
            </button>
          </>
        ) : null}
      </div>

      <div className="output-body" style={{ display: tab === 'tests' ? undefined : 'none' }}>
        {!toolchain.available && (
          <div className="log-line warn">
            未检测到 C 编译器（应用内置的 gcc 也缺失）。请在「设置 → 工具链」中指定编译器路径，或重新安装应用。
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} className={`log-line ${l.type}`}>
            {l.text}
          </div>
        ))}
        {buildResult && buildResult.ok && !logs.length && (
          <div className="log-line info">点击「编译并测试」运行当前阶段的测试用例。</div>
        )}
        {buildResult && buildResult.ok && buildResult.results.length === 0 && (
          <div className="log-line info">当前阶段没有自动化测试用例，可参考左侧「验收标准」手动验证。</div>
        )}
        {buildResult && buildResult.ok && buildResult.total > 0 && buildResult.failCount === 0 && (
          <div className="stage-pass-banner">
            <span>🎉 本阶段测试全部通过（{buildResult.passCount}/{buildResult.total}）</span>
            {currentStageDone ? (
              <span className="badge ok">本阶段已完成</span>
            ) : (
              <button className="btn primary" onClick={onMarkStageDone}>
                标记阶段完成
              </button>
            )}
          </div>
        )}
        {buildResult &&
          buildResult.ok &&
          buildResult.results.map((r) => (
            <div key={r.id} className={`test-card ${r.pass ? 'pass' : 'fail'}`}>
              <div className="test-head">
                <span>{r.pass ? '✅' : '❌'}</span>
                <span>[{r.mode}]</span>
                <span>{r.name}</span>
                {r.description && <span className="test-desc">{r.description}</span>}
                {r.note && <span className="test-note">{r.note}</span>}
              </div>
              <div className="test-body">
                {r.steps && r.steps.length > 0 && (
                  <div className="test-steps">
                    {r.steps.map((s, i) => (
                      <div key={i} className={`test-step ${s.status}`}>
                        <span className="step-icon">{s.status === 'ok' ? '✓' : s.status === 'fail' ? '✗' : '·'}</span>
                        <span className="step-name">{s.name}</span>
                        {s.detail && <span className="step-detail">{s.detail}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {r.source && (
                  <details className="test-source">
                    <summary>测试源码（输入的 C 程序）</summary>
                    <pre>{r.source}</pre>
                  </details>
                )}
                {r.mode === 'run' ? (
                  <div className="diff-col" style={{ gridColumn: '1 / -1' }}>
                    <h5>运行结果</h5>
                    <pre>
                      期望退出码 {r.expectedExit ?? 0}，实际 {r.actualExit ?? '?'}
                      {r.actual ? `\n${r.actual}` : ''}
                    </pre>
                  </div>
                ) : r.mode === 'error' ? (
                  <div className="diff-col" style={{ gridColumn: '1 / -1' }}>
                    <h5>编译器输出（应报错退出）</h5>
                    <pre>{r.actual || '(空)'}</pre>
                  </div>
                ) : (
                  <>
                    <div className="diff-col">
                      <h5>期望输出</h5>
                      <pre>{r.expected || '(空)'}</pre>
                    </div>
                    <div className="diff-col">
                      <h5>实际输出</h5>
                      <pre>{r.actual || '(空)'}</pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        {buildResult && !buildResult.ok && buildResult.error && (
          <div className="test-card fail">
            <div className="test-head">
              <span>❌</span>
              <span>编译失败</span>
            </div>
            <div className="test-body">
              <div className="diff-col" style={{ gridColumn: '1 / -1' }}>
                <pre>{buildResult.error}</pre>
                {buildResult.buildLog?.stderr && <pre>{buildResult.buildLog.stderr}</pre>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="terminal-host" style={{ display: tab === 'terminal' ? 'flex' : 'none' }}>
        <Terminal initialCwd={initialCwd} />
      </div>
    </div>
  );
}
