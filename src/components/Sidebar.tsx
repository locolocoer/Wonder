import React from 'react';
import type { Stage, ProjectFile } from '../types';
import { localizeText, type Course } from '../lib/curriculum';
import { FileTree } from './FileTree';
import { GitPanel } from './GitPanel';
import { BasicsPanel } from './BasicsPanel';

export function Sidebar({
  style,
  projectDir,
  stages,
  intro,
  courses,
  currentCourseId,
  onSelectCourse,
  currentStageId,
  completedIds,
  files,
  activePath,
  language,
  tab,
  onTabChange,
  createPending,
  onCreateConsumed,
  onSelectStage,
  onToggleDone,
  onOpenFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onRefreshFiles,
  onProjectChanged,
}: {
  style?: React.CSSProperties;
  projectDir: string;
  stages: Stage[];
  intro: string[];
  courses: Course[];
  currentCourseId: string;
  onSelectCourse: (id: string) => void;
  currentStageId: string;
  completedIds: Set<string>;
  files: ProjectFile[];
  activePath: string;
  language: 'c' | 'cpp';
  tab: 'course' | 'files' | 'git' | 'basics';
  onTabChange: (tab: 'course' | 'files' | 'git' | 'basics') => void;
  createPending: boolean;
  onCreateConsumed: () => void;
  onSelectStage: (id: string) => void;
  onToggleDone: (id: string) => void;
  onOpenFile: (path: string) => void;
  onCreateFile: (path: string, kind: 'file' | 'dir') => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (path: string, newName: string) => void;
  onRefreshFiles: () => void;
  onProjectChanged: () => void;
}) {
  return (
    <aside className="sidebar" style={style}>
      <div className="course-switcher">
        <span className="course-switcher-label">课程</span>
        <select value={currentCourseId} onChange={(e) => onSelectCourse(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.title}{c.available ? '' : '（即将上线）'}
            </option>
          ))}
        </select>
      </div>
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${tab === 'course' ? 'active' : ''}`} onClick={() => onTabChange('course')}>
          课程路线
        </button>
        <button className={`sidebar-tab ${tab === 'files' ? 'active' : ''}`} onClick={() => onTabChange('files')}>
          文件
        </button>
        <button className={`sidebar-tab ${tab === 'git' ? 'active' : ''}`} onClick={() => onTabChange('git')}>
          版本
        </button>
        <button className={`sidebar-tab ${tab === 'basics' ? 'active' : ''}`} onClick={() => onTabChange('basics')}>
          基础
        </button>
      </div>
      {tab === 'course' ? (
        <div className="roadmap">
          <div className="project-intro">
            <div className="project-intro-title">📖 新手必读</div>
            <ul>
              {intro.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
          {stages.length === 0 && (
            <div className="project-intro">
              <div className="project-intro-title">🚧 即将上线</div>
              <p className="project-intro-hint">这门课程正在筹备中，敬请期待。可先切回「C 编译器」开始练习。</p>
            </div>
          )}
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
                    <p>{localizeText(s.summary, language)}</p>
                    <h4>任务目标</h4>
                    <ul>
                      {s.goals.map((g, i) => (
                        <li key={i}>{localizeText(g, language)}</li>
                      ))}
                    </ul>
                    {s.files && s.files.length > 0 && (
                      <>
                        <h4>需要创建/修改的文件</h4>
                        <ul className="stage-files">
                          {s.files.map((f, i) => (
                            <li key={i}>{localizeText(f, language)}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    {s.background && s.background.length > 0 && (
                      <>
                        <h4>基础知识</h4>
                        {language === 'cpp' && (
                          <div className="cpp-note">
                            C++ 提示：下面以 C 为例讲解概念，用 C++ 实现时对应使用 std::string、new/delete、&lt;iostream&gt;/&lt;fstream&gt; 等。
                          </div>
                        )}
                        <ul className="stage-background">
                          {s.background.map((b, i) => (
                            <li key={i}>{localizeText(b, language)}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    <h4>接口契约</h4>
                    <div className="contract">{localizeText(s.contract, language)}</div>
                    <h4>验收标准</h4>
                    <ul>
                      {s.acceptance.map((a, i) => (
                        <li key={i}>{localizeText(a, language)}</li>
                      ))}
                    </ul>
                    {s.hints && s.hints.length > 0 && (
                      <>
                        <h4>提示</h4>
                        <ul>
                          {s.hints.map((h, i) => (
                            <li key={i}>{localizeText(h, language)}</li>
                          ))}
                        </ul>
                      </>
                    )}
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
          createPending={createPending}
          onCreateConsumed={onCreateConsumed}
          onOpen={onOpenFile}
          onCreate={onCreateFile}
          onDelete={onDeleteFile}
          onRename={onRenameFile}
          onRefresh={onRefreshFiles}
        />
      ) : tab === 'git' ? (
        <GitPanel projectDir={projectDir} onProjectChanged={onProjectChanged} />
      ) : (
        <BasicsPanel courseId={currentCourseId} />
      )}
    </aside>
  );
}
