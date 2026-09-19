import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 完整的 GitHub 风格 Markdown 渲染：表格、任务列表、删除线、代码块、链接等。
// 链接点击后通过 Electron 主进程在系统浏览器中打开。
// 用 React.memo 避免父组件（如编辑器输入）频繁重渲染时反复重新解析 Markdown，导致卡顿。
export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href && /^https?:/i.test(href)) window.api.openExternal(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
