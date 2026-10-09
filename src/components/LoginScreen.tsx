import React, { useState } from 'react';

export function LoginScreen({
  onLogin,
  onOpenSettings,
}: {
  onLogin: () => Promise<void>;
  onOpenSettings: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const login = async () => {
    setBusy(true);
    setError('');
    try {
      await onLogin();
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🛠️</div>
        <div className="login-title">Wonder</div>
        <div className="login-sub">AI 编程训练 · 从零写一个编译器</div>
        <button className="btn primary login-btn" onClick={login} disabled={busy}>
          {busy ? '登录中…' : '使用阿里云账号登录'}
        </button>
        {error && <div className="login-error">{error}</div>}
        <button className="login-settings" onClick={onOpenSettings}>
          配置 SSO 参数
        </button>
      </div>
    </div>
  );
}
