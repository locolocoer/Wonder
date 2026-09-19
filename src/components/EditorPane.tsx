import React, { useRef } from 'react';
import Editor from '@monaco-editor/react';
import type { FileTab } from '../types';

export function EditorPane({
  tabs,
  activePath,
  theme,
  onTabSelect,
  onTabClose,
  onChange,
  onSave,
}: {
  tabs: FileTab[];
  activePath: string;
  theme: string;
  onTabSelect: (path: string) => void;
  onTabClose: (path: string) => void;
  onChange: (content: string) => void;
  onSave: () => void;
}) {
  const active = tabs.find((t) => t.path === activePath);

  // Monaco 的 addCommand 在挂载时只注册一次，闭包会捕获旧的 onSave；
  // 用 ref 保存最新引用，确保 Ctrl+S 永远保存「当前」激活的标签。
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const langFor = (name: string): string => {
    const n = name.toLowerCase();
    if (/\.(c|h)$/.test(n)) return 'c';
    if (/\.(md|markdown)$/.test(n)) return 'markdown';
    if (/\.json$/.test(n)) return 'json';
    if (/\.(bat|cmd)$/.test(n)) return 'bat';
    if (/\.(sh|bash)$/.test(n)) return 'shell';
    if (/\.(js|jsx)$/.test(n)) return 'javascript';
    if (/\.(ts|tsx)$/.test(n)) return 'typescript';
    if (/\.(html|htm)$/.test(n)) return 'html';
    if (/\.css$/.test(n)) return 'css';
    return 'plaintext';
  };

  return (
    <div className="editor-area">
      <div className="tabs">
        {tabs.map((t) => (
          <div key={t.path} className={`tab ${t.path === activePath ? 'active' : ''}`} onClick={() => onTabSelect(t.path)}>
            <span>{t.name}</span>
            {t.dirty && <span className="dirty-dot" />}
            <button
              className="close"
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(t.path);
              }}
            >
              ✕
            </button>
          </div>
        ))}
        {tabs.length === 0 && <div className="tab" style={{ color: 'var(--fg-dim)' }}>未打开文件</div>}
      </div>
      <div className="editor-host">
        {active ? (
          <Editor
            height="100%"
            language={langFor(active.name)}
            theme={theme}
            value={active.content}
            onChange={(v) => onChange(v || '')}
            onMount={(editor, monaco) => {
              editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());
            }}
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              tabSize: 4,
              renderWhitespace: 'none',
              smoothScrolling: true,
              readOnly: Boolean(active.readOnly),
            }}
          />
        ) : (
          <div className="empty-editor">
            <div className="big">开始实现你的 C 编译器</div>
            <div>在左侧「文件」页签打开 src/ 下的源文件，或点顶部「初始化起始模板」生成骨架。</div>
            <div>左侧「课程路线」会一步步引导你从词法分析走到代码生成。</div>
          </div>
        )}
      </div>
    </div>
  );
}
