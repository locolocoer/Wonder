import React, { useState } from 'react';
import type { ChatMessage } from '../types';
import { MODE_LABELS, type AiMode } from '../lib/ai-prompts';
import { Markdown } from './Markdown';

export function ChatPanel({
  style,
  messages,
  streaming,
  hasApiKey,
  onSend,
  onAbort,
  onOpenSettings,
  onClearChat,
}: {
  style?: React.CSSProperties;
  messages: ChatMessage[];
  streaming: boolean;
  hasApiKey: boolean;
  onSend: (mode: AiMode, text?: string) => void;
  onAbort: () => void;
  onOpenSettings: () => void;
  onClearChat: () => void;
}) {
  const [text, setText] = useState('');
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const submit = () => {
    if (!text.trim()) return;
    onSend('chat', text);
    setText('');
  };

  return (
    <div className="chat" style={style}>
      <div className="panel-title">
        <span>AI 老师</span>
        {messages.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              if (window.confirm('清空与导师的全部对话历史？')) onClearChat();
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
}
