import React, { useMemo, useState } from 'react';
import type { ChatMessage, ProjectFile } from '../types';
import { MODE_LABELS, type AiMode } from '../lib/ai-prompts';
import { Markdown } from './Markdown';

export const ChatPanel = React.memo(function ChatPanel({
  style,
  messages,
  streaming,
  hasApiKey,
  files,
  contextPaths,
  onToggleContext,
  onClearContext,
  onSend,
  onAbort,
  onOpenSettings,
  onClearChat,
}: {
  style?: React.CSSProperties;
  messages: ChatMessage[];
  streaming: boolean;
  hasApiKey: boolean;
  files: ProjectFile[];
  contextPaths: string[];
  onToggleContext: (path: string) => void;
  onClearContext: () => void;
  onSend: (mode: AiMode, text?: string) => void;
  onAbort: () => void;
  onOpenSettings: () => void;
  onClearChat: () => void;
}) {
  const [text, setText] = useState('');
  const [showContext, setShowContext] = useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }, [files]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    if (!text.trim()) return;
    onSend('chat', text);
    setText('');
  };

  const depth = (p: string) => p.split('/').length - 1;

  return (
    <div className="chat" style={style}>
      <div className="panel-title">
        <span>AI 老师</span>
        <button
          className={`btn ${contextPaths.length > 0 ? 'primary' : ''}`}
          onClick={() => setShowContext((v) => !v)}
          title="选择哪些文件/目录作为 AI 上下文"
        >
          📌 上下文{contextPaths.length > 0 ? `（${contextPaths.length}）` : ''}
        </button>
        {messages.length > 0 && (
          <button
            className="btn"
            onClick={async () => {
              if (await window.api.dialogConfirm({ message: '清空与导师的全部对话历史？' })) onClearChat();
            }}
          >
            清空对话
          </button>
        )}
        {!hasApiKey && (
          <button className="btn" onClick={onOpenSettings}>
            配置 API Key
          </button>
        )}
      </div>

      {showContext && (
        <div className="context-panel">
          <div className="context-panel-head">
            <span>选择 AI 上下文（未选=自动带全部源码）</span>
            {contextPaths.length > 0 && (
              <button className="btn" onClick={onClearContext} title="恢复自动模式">
                清除选择
              </button>
            )}
          </div>
          <div className="context-panel-list">
            {sortedFiles.map((f) => {
              const checked = contextPaths.includes(f.path);
              return (
                <label
                  key={f.path}
                  className={`context-item ${f.type === 'dir' ? 'dir' : ''}`}
                  style={{ paddingLeft: 6 + depth(f.path) * 12 }}
                  title={f.path}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleContext(f.path)}
                  />
                  <span>{f.type === 'dir' ? '📁' : '📄'} {f.name}</span>
                </label>
              );
            })}
            {sortedFiles.length === 0 && <div className="log-line info">工程里还没有文件。</div>}
          </div>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="msg assistant">
            <div className="msg-mode">👋 你好，我是你的项目导师</div>
            我会陪你从零实现一个个真实软件项目（当前第一个：用 C 写一个编译器），拆任务、给提示、评代码，一步步带你做出来。
            <br />
            <br />
            你可以用下面的快捷按钮，或者直接问我问题。开始前请先在右上角「⚙ 设置」里填入 DeepSeek API Key。
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === 'assistant' && m.mode && <div className="msg-mode">{MODE_LABELS[m.mode as AiMode] || m.mode}</div>}
            {m.role === 'assistant' && m.reasoning && (
              <details>
                <summary style={{ cursor: 'pointer', color: 'var(--fg-dim)', fontSize: 12 }}>思考过程</summary>
                <div className="reasoning">{m.reasoning}</div>
              </details>
            )}
            {m.role === 'assistant' ? <Markdown text={m.content} /> : m.content}
            {m.streaming && <span className="cursor" />}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-area">
        <div className="quick-actions">
          <button className="btn" disabled={streaming} onClick={() => onSend('breakdown')}>
            🧩 拆分当前任务
          </button>
          <button className="btn" disabled={streaming} onClick={() => onSend('hint')}>
            💡 给点提示
          </button>
          <button className="btn" disabled={streaming} onClick={() => onSend('judge')}>
            🔍 评判我的代码
          </button>
        </div>
        <div className="chat-input-row">
          <textarea
            placeholder={hasApiKey ? '向 AI 老师提问…（Enter 发送，Shift+Enter 换行）' : '请先在设置里配置 DeepSeek API Key'}
            value={text}
            disabled={!hasApiKey}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {streaming ? (
            <button className="btn danger" onClick={onAbort}>
              停止
            </button>
          ) : (
            <button className="btn primary" onClick={submit} disabled={!hasApiKey || !text.trim()}>
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
