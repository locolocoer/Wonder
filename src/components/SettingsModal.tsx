import React, { useEffect, useState } from 'react';
import type { Settings, ToolchainInfo, UpdateStatus } from '../types';

export function SettingsModal({
  settings,
  toolchain,
  version,
  onClose,
  onSave,
  onDetect,
}: {
  settings: Settings;
  toolchain: ToolchainInfo;
  version: string;
  onClose: () => void;
  onSave: (patch: Partial<Settings>) => void;
  onDetect: () => void;
}) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [temperature, setTemperature] = useState(String(settings.temperature));
  const [ccPath, setCcPath] = useState(settings.toolchain.ccPath);
  const [asmPath, setAsmPath] = useState(settings.toolchain.asmPath);
  const [theme, setTheme] = useState(settings.theme);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const off = window.api.onEvent('update:status', (s: UpdateStatus) => setUpdateStatus(s));
    return off;
  }, []);

  const updateLabel = () => {
    if (!updateStatus) return null;
    switch (updateStatus.state) {
      case 'checking':
        return '正在检查更新…';
      case 'available':
        return `发现新版本 v${updateStatus.version}，正在下载…`;
      case 'downloading':
        return `正在下载更新 ${updateStatus.percent ?? 0}%`;
      case 'downloaded':
        return `已下载 v${updateStatus.version}，重启应用后自动安装。`;
      case 'not-available':
        return '已是最新版本。';
      case 'dev':
        return '开发模式，不检查更新。';
      case 'error':
        return `更新检查失败：${updateStatus.message || ''}`;
      default:
        return null;
    }
  };

  const save = () => {
    onSave({
      apiKey: apiKey.trim(),
      model,
      baseUrl: baseUrl.trim(),
      temperature: Number(temperature) || 0.6,
      toolchain: { ccPath: ccPath.trim(), asmPath: asmPath.trim() },
      theme,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>⚙ 设置</h2>

        <div className="field">
          <label>DeepSeek API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
          <div className="hint">
            在{' '}
            <a href="#" onClick={(e) => { e.preventDefault(); window.api.openExternal('https://platform.deepseek.com/api_keys'); }}>
              platform.deepseek.com
            </a>{' '}
            获取。Key 仅保存在本机，不会上传到其它地方。
          </div>
        </div>

        <div className="field">
          <label>模型</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="deepseek-chat">deepseek-chat（快，适合日常教学）</option>
            <option value="deepseek-reasoner">deepseek-reasoner（推理更强，较慢）</option>
          </select>
        </div>

        <div className="field">
          <label>API 地址</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>

        <div className="field">
          <label>温度（0-2，越高越发散）</label>
          <input value={temperature} onChange={(e) => setTemperature(e.target.value)} />
        </div>

        <div className="field">
          <label>编辑器主题</label>
          <select value={theme} onChange={(e) => setTheme(e.target.value as Settings['theme'])}>
            <option value="vs-dark">深色（vs-dark）</option>
            <option value="vs">浅色（vs）</option>
            <option value="hc-black">高对比度（hc-black）</option>
          </select>
        </div>

        <div className="field">
          <label>C 编译器路径（留空则用内置 gcc，或自动检测系统 gcc/clang）</label>
          <div className="toolchain-row">
            <input value={ccPath} onChange={(e) => setCcPath(e.target.value)} placeholder="例如 C:\msys64\mingw64\bin\gcc.exe" />
            <button className="btn" onClick={onDetect}>
              检测
            </button>
          </div>
          <div className="hint">
            {toolchain.available
              ? `✅ 当前使用：${toolchain.cc.builtin ? '内置 gcc（w64devkit 便携版，随应用分发）' : toolchain.cc.name} @ ${toolchain.cc.path}`
              : '⚠ 未检测到。应用已内置便携 gcc 兜底；如需系统 gcc 可安装 MinGW-w64 或 LLVM。'}
          </div>
        </div>

        <div className="field">
          <label>汇编器路径（可选，运行测试时通常用 gcc 即可）</label>
          <input value={asmPath} onChange={(e) => setAsmPath(e.target.value)} placeholder="例如 C:\...\nasm.exe" />
        </div>

        <div className="field">
          <label>自动更新</label>
          <div className="toolchain-row">
            <button className="btn" onClick={() => window.api.updateCheck()}>
              检查更新
            </button>
            {updateStatus?.state === 'downloaded' && (
              <button className="btn primary" onClick={() => window.api.updateInstall()}>
                重启并安装
              </button>
            )}
          </div>
          {updateLabel() && <div className="hint">{updateLabel()}</div>}
        </div>

        <div className="field about">
          <label>关于</label>
          <div className="about-brand">
            <span className="about-name">Wonder</span>
            {version && <span className="about-version">v{version}</span>}
          </div>
          <div className="hint">
            Wonder —— AI 陪练式项目编程训练器。名字取「好奇（wonder）、问道、惊叹」三重含义：带着好奇出发、一路问道、亲手做出让自己惊叹的作品。
          </div>
          <div className="hint">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.api.openExternal('https://github.com/locolocoer/Wonder');
              }}
            >
              GitHub 仓库
            </a>
            {' · '}
            <span>快捷键：Ctrl+B 编译测试 · Ctrl+, 设置 · Ctrl+S 保存</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
