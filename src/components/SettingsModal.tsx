import React, { useState } from 'react';
import type { Settings, ToolchainInfo } from '../types';

export function SettingsModal({
  settings,
  toolchain,
  onClose,
  onSave,
  onDetect,
}: {
  settings: Settings;
  toolchain: ToolchainInfo;
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
