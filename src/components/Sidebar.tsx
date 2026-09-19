import React, { useState } from 'react';
import type { Stage, ProjectFile } from '../types';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';

export function Sidebar({
  style,
  projectDir,
  stages,
  currentStageId,
  completedIds,
  files,
  activePath,
  onSelectStage,
  onToggleDone,
  onOpenFile,
  onCreateFile,
  onDeleteFile,
  onRefreshFiles,
}: {
  style?: React.CSSProperties;
  projectDir: string;
  stages: Stage[];
  currentStageId: string;
  completedIds: Set<string>;
  files: ProjectFile[];
  activePath: string;
  onSelectStage: (id: string) => void;
  onToggleDone: (id: string) => void;
  onOpenFile: (path: string) => void;
  onCreateFile: (path: string, kind: 'file' | 'dir') => void;
  onDeleteFile: (path: string) => void;
  onRefreshFiles: () => void;
}) {
  const [tab, setTab] = useState<'course' | 'files' | 'git'>('course');

  return (
    <aside className="sidebar" style={style}>
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${tab === 'course' ? 'active' : ''}`} onClick={() => setTab('course')}>
          课程路线
        </button>
        <button className={`sidebar-tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>
          文件
        </button>
        <button className={`sidebar-tab ${tab === 'git' ? 'active' : ''}`} onClick={() => setTab('git')}>
          版本
        </button>
      </div>
      {tab === 'course' ? (
        <div className="roadmap">
          {stages.map((s) => {
            const done = completedIds.has(s.id);
            const active = s.id === currentStageId;
            return (
              <div key={s.id} className={`stage ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                <button className="stage-head" onClick={() => onSelectStage(s.id)}>
                  <span className="stage-num">{done ? '✓' : s.num}</span>
                  <span className="stage-title">{s.title}</span>
                  <span
                    className="stage-check"
                    title={done ? '标记为未完成' : '标记为完成'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDone(s.id);
                    }}
                  >
                    {done ? '✅' : '⬜'}
                  </span>
                </button>
                {active && (
                  <div className="stage-body">
                    <p>{s.summary}</p>
                    <h4>任务目标</h4>
                    <ul>
                      {s.goals.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                    <h4>接口契约</h4>
                    <div className="contract">{s.contract}</div>
                    <h4>验收标准</h4>
                    <ul>
                      {s.acceptance.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : tab === 'files' ? (
        <FileTree
          files={files}
          activePath={activePath}
          onOpen={onOpenFile}
          onCreate={onCreateFile}
          onDelete={onDeleteFile}
          onRefresh={onRefreshFiles}
        />
      ) : (
        <GitPanel projectDir={projectDir} />
      )}
    </aside>
  );
}
