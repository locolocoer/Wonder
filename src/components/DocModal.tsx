import React from 'react';
import { getCDoc } from '../lib/c-docs';

// 应用内 API 文档面板：Ctrl+点击 C 标准库函数名时弹出，替代跳转系统浏览器。
export function DocModal({ name, onClose }: { name: string; onClose: () => void }) {
  const entry = getCDoc(name);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal doc-modal" onClick={(e) => e.stopPropagation()}>
        <h2>📚 API 文档</h2>
        {entry ? (
          <>
            <div className="doc-fn-name">{name}</div>
            <pre className="doc-sig">{entry.sig}</pre>
            <div className="doc-desc">{entry.desc}</div>
            <div className="doc-actions">
              <button className="btn" onClick={() => window.api.openExternal(entry.url)}>
                在浏览器打开完整文档
              </button>
              <button className="btn primary" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="log-line warn">未找到「{name}」的说明。</div>
            <div className="doc-actions">
              <button className="btn primary" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
