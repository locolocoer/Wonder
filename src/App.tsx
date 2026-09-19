import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BootInfo,
  Settings,
  ToolchainInfo,
  ProjectFile,
  FileTab,
  ChatMessage,
  BuildResult,
  BuildLogEntry,
} from './types';
import { CURRICULUM, findStage } from './lib/curriculum';
import { buildMessages, MODE_LABELS, type AiMode, type ProjectContext } from './lib/ai-prompts';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { EditorPane } from './components/EditorPane';
import { OutputPanel } from './components/OutputPanel';
import { ChatPanel } from './components/ChatPanel';
import { SettingsModal } from './components/SettingsModal';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toolchain, setToolchain] = useState<ToolchainInfo | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState('');
  const [currentStageId, setCurrentStageId] = useState('stage1');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [logs, setLogs] = useState<BuildLogEntry[]>([]);
  const [buildRunning, setBuildRunning] = useState(false);
  const [buildScope, setBuildScope] = useState<'stage' | 'all'>('stage');
  const [showSettings, setShowSettings] = useState(false);
  const [version, setVersion] = useState('');
  const [starterAvailable, setStarterAvailable] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'course' | 'files' | 'git'>('course');
  const [createPending, setCreatePending] = useState(false);

  // 面板尺寸（可拖拽调节，并持久化）
  const [chatWidth, setChatWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('cc-chat-w'));
    return v && v > 200 ? v : 460;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('cc-sidebar-w'));
    return v && v > 150 ? v : 300;
  });
  const [outputHeight, setOutputHeight] = useState<number>(() => {
    const v = Number(localStorage.getItem('cc-output-h'));
    return v && v > 80 ? v : 240;
  });
  const dragStateRef = useRef<{ which: 'chat' | 'sidebar' | 'output'; size: number } | null>(null);

  const requestIdRef = useRef<string | null>(null);

  const startDrag = (which: 'chat' | 'sidebar' | 'output') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = {
      which,
      size: which === 'chat' ? chatWidth : which === 'sidebar' ? sidebarWidth : outputHeight,
    };
    const isRow = which === 'output';
    const onMove = (ev: MouseEvent) => {
      const d = dragStateRef.current;
      if (!d) return;
      let size: number;
      if (d.which === 'chat') size = Math.min(900, Math.max(280, window.innerWidth - ev.clientX));
      else if (d.which === 'sidebar') size = Math.min(520, Math.max(200, ev.clientX));
      else size = Math.min(Math.max(120, window.innerHeight - 220), Math.max(100, window.innerHeight - ev.clientY));
      dragStateRef.current = { ...d, size };
      if (d.which === 'chat') setChatWidth(size);
      else if (d.which === 'sidebar') setSidebarWidth(size);
      else setOutputHeight(size);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing');
      document.body.style.cursor = '';
      const d = dragStateRef.current;
      if (d) {
        const key = d.which === 'chat' ? 'cc-chat-w' : d.which === 'sidebar' ? 'cc-sidebar-w' : 'cc-output-h';
        localStorage.setItem(key, String(Math.round(d.size)));
      }
      dragStateRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.classList.add('resizing');
    document.body.style.cursor = isRow ? 'row-resize' : 'col-resize';
  };

  // ---- bootstrap ----------------------------------------------------------
  useEffect(() => {
    (async () => {
      const b: BootInfo = await window.api.getBoot();
      setSettings(b.settings);
      setToolchain(b.toolchain);
      setVersion(b.version);
      setStarterAvailable(b.starterAvailable);
      const sid = localStorage.getItem('cc-stage') || 'stage1';
      let done: string[] = [];
      try {
        done = JSON.parse(localStorage.getItem('cc-done') || '[]');
      } catch {
        done = [];
      }
      setCurrentStageId(sid);
      setCompletedIds(new Set(done));
      if (b.settings.projectDir) await loadFiles();
      try {
        const msgs = await window.api.chatLoad();
        if (Array.isArray(msgs) && msgs.length) setMessages(msgs.map((m) => ({ ...m, streaming: false })));
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题作用于整个应用外壳（不只是 Monaco 编辑器）
  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme === 'vs' ? 'light' : 'dark';
  }, [settings?.theme, settings]);

  // ---- chat 历史持久化（防抖保存，重启后恢复） --------------------------
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      window.api.chatSave(messages.map((m) => ({ ...m, streaming: false })));
    }, 1000);
    return () => clearTimeout(t);
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    window.api.chatClear();
  };

  // ---- IPC events ---------------------------------------------------------
  useEffect(() => {
    const offChunk = window.api.onEvent('ai:chunk', (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== data.requestId || !m.streaming) return m;
          if (data.type === 'content') return { ...m, content: m.content + (data.text || '') };
          if (data.type === 'reasoning') return { ...m, reasoning: (m.reasoning || '') + (data.text || '') };
          return m;
        })
      );
    });
    const offLog = window.api.onEvent('build:log', (data) => {
      setLogs((prev) => [...prev, { type: data.type, text: data.text, testId: data.testId }]);
    });
    return () => {
      offChunk();
      offLog();
    };
  }, []);

  // ---- project / files ----------------------------------------------------
  const loadFiles = useCallback(async () => {
    const list = await window.api.projectList();
    if (list.ok && list.files) setFiles(list.files);
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      const existing = tabs.find((t) => t.path === path);
      if (existing) {
        setActivePath(path);
        return;
      }
      const r = await window.api.projectRead(path);
      if (!r.ok) return;
      setTabs((prev) => [...prev, { path, name: path.split('/').pop() || path, content: r.content || '', dirty: false }]);
      setActivePath(path);
    },
    [tabs]
  );

  const onChange = useCallback(
    (content: string) => {
      setTabs((prev) => prev.map((t) => (t.path === activePath ? { ...t, content, dirty: true } : t)));
    },
    [activePath]
  );

  const saveAll = useCallback(async () => {
    let failed = 0;
    for (const t of tabs) {
      if (!t.dirty) continue;
      const r = await window.api.projectWrite(t.path, t.content);
      if (!r.ok) failed++;
    }
    if (failed > 0) {
      await window.api.dialogMessage({ type: 'error', message: `${failed} 个文件保存失败，请检查文件是否被占用或路径是否有效。` });
    } else {
      setTabs((prev) => prev.map((t) => ({ ...t, dirty: false })));
    }
  }, [tabs]);

  const saveActive = useCallback(async () => {
    const t = tabs.find((x) => x.path === activePath);
    if (!t) return;
    const r = await window.api.projectWrite(t.path, t.content);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: `保存失败：${r.error || '未知错误'}` });
      return;
    }
    setTabs((prev) => prev.map((x) => (x.path === activePath ? { ...x, dirty: false } : x)));
  }, [tabs, activePath]);

  const closeTab = useCallback(
    async (path: string) => {
      const t = tabs.find((x) => x.path === path);
      if (t && t.dirty && !(await window.api.dialogConfirm({ message: `文件 ${path} 有未保存的修改，确定关闭？` }))) return;
      const remaining = tabs.filter((x) => x.path !== path);
      setTabs(remaining);
      if (activePath === path) {
        setActivePath(remaining.length ? remaining[remaining.length - 1].path : '');
      }
    },
    [tabs, activePath]
  );

  // ---- 关窗前检查未保存修改（主进程拦截 close 后发来请求） -----------------
  const requestClose = useCallback(async () => {
    const dirtyTabs = tabs.filter((t) => t.dirty);
    if (!dirtyTabs.length) {
      window.api.closeNow();
      return;
    }
    const names = dirtyTabs.slice(0, 5).map((t) => t.path).join('\n');
    const res = await window.api.dialogChoice({
      type: 'warning',
      title: '有未保存的修改',
      message: `${dirtyTabs.length} 个文件尚未保存`,
      detail: names + (dirtyTabs.length > 5 ? '\n…' : ''),
      buttons: ['保存并关闭', '不保存关闭', '取消'],
      defaultId: 0,
      cancelId: 2,
    });
    if (res.response === 0) {
      await saveAll();
      window.api.closeNow();
    } else if (res.response === 1) {
      window.api.closeNow();
    }
  }, [tabs, saveAll]);

  useEffect(() => {
    const off = window.api.onEvent('app:close-requested', () => {
      requestClose();
    });
    return off;
  }, [requestClose]);

  const chooseProject = async () => {
    if (tabs.some((t) => t.dirty)) {
      const ok = await window.api.dialogConfirm({
        message: '有未保存的修改，更换工程目录将丢失这些修改。确定继续吗？',
        title: '更换工程目录',
        type: 'warning',
      });
      if (!ok) return;
    }
    const res = await window.api.chooseProject();
    if (res.canceled || !res.projectDir) return;
    setSettings((s) => (s ? { ...s, projectDir: res.projectDir! } : s));
    setTabs([]);
    setActivePath('');
    await loadFiles();
  };

  const initStarter = async () => {
    if (!settings?.projectDir) {
      const res = await window.api.chooseProject();
      if (res.canceled || !res.projectDir) return;
      setSettings((s) => (s ? { ...s, projectDir: res.projectDir! } : s));
    }
    const r = await window.api.initStarter();
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '初始化失败' });
      return;
    }
    await loadFiles();
    // 打开 main.c
    await openFile('src/main.c');
  };

  const createFile = async (path: string, kind: 'file' | 'dir') => {
    const r = await window.api.projectCreate(path, kind);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '操作失败' });
      return;
    }
    await loadFiles();
    if (kind === 'file') await openFile(path);
  };

  const deleteFile = async (path: string) => {
    const r = await window.api.projectDelete(path);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '操作失败' });
      return;
    }
    setTabs((prev) => prev.filter((t) => t.path !== path && !t.path.startsWith(path + '/')));
    if (activePath === path) setActivePath('');
    await loadFiles();
  };

  // 磁盘内容被外部改动（Git 回滚、重命名等）后：刷新文件树，并重读所有已打开标签。
  const onProjectChanged = useCallback(async () => {
    await loadFiles();
    const next: FileTab[] = [];
    for (const t of tabs) {
      const r = await window.api.projectRead(t.path);
      if (r.ok) next.push({ ...t, content: r.content || '', dirty: false });
    }
    setTabs(next);
    if (activePath && !next.some((t) => t.path === activePath)) {
      setActivePath(next.length ? next[next.length - 1].path : '');
    }
  }, [tabs, loadFiles, activePath]);

  const renameFile = async (path: string, newName: string) => {
    await saveAll();
    const r = await window.api.projectRename(path, newName);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '重命名失败' });
      return;
    }
    await onProjectChanged();
  };

  // ---- stage progress -----------------------------------------------------
  const selectStage = (id: string) => {
    setCurrentStageId(id);
    localStorage.setItem('cc-stage', id);
  };

  const stagePassed = (id: string) => {
    try {
      const map = JSON.parse(localStorage.getItem('cc-passed') || '{}');
      return Boolean(map[id]);
    } catch {
      return false;
    }
  };

  const toggleDone = async (id: string) => {
    if (!completedIds.has(id) && !stagePassed(id)) {
      const ok = await window.api.dialogConfirm({
        message: '该阶段测试尚未全部通过，仍要标记为完成吗？',
        title: '标记阶段完成',
      });
      if (!ok) return;
    }
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('cc-done', JSON.stringify([...next]));
      return next;
    });
  };

  // ---- build / test -------------------------------------------------------
  const recordStagePass = (id: string) => {
    try {
      const map = JSON.parse(localStorage.getItem('cc-passed') || '{}');
      map[id] = true;
      localStorage.setItem('cc-passed', JSON.stringify(map));
    } catch {
      /* ignore */
    }
  };

  const runBuild = async (scope: 'stage' | 'all' = 'stage') => {
    if (!settings || !settings.projectDir) return;
    await saveAll();
    const stage = findStage(currentStageId);
    if (!stage) return;
    setBuildScope(scope);
    setBuildRunning(true);
    setLogs([]);
    setBuildResult(null);
    try {
      const testCases = scope === 'all' ? CURRICULUM.flatMap((s) => s.testCases) : stage.testCases;
      const res = await window.api.buildRun({ testCases, ccPath: settings.toolchain.ccPath });
      setBuildResult(res);
      if (res.ok && res.failCount === 0 && res.total > 0 && scope === 'stage') {
        recordStagePass(currentStageId);
      }
    } finally {
      setBuildRunning(false);
    }
  };

  const runAllBuild = () => runBuild('all');

  // ---- 全局快捷键（Ctrl+B 编译 / Ctrl+, 设置 / Ctrl+W 关标签 / Ctrl+Tab 切换 / Ctrl+N 新建文件）----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (!e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        runBuild();
      } else if (!e.shiftKey && key === ',') {
        e.preventDefault();
        setShowSettings(true);
      } else if (!e.shiftKey && key === 'w') {
        e.preventDefault();
        if (activePath) closeTab(activePath);
      } else if (!e.shiftKey && key === 'n') {
        e.preventDefault();
        setSidebarTab('files');
        setCreatePending(true);
      } else if (key === 'tab') {
        e.preventDefault();
        const idx = tabs.findIndex((x) => x.path === activePath);
        if (tabs.length) {
          const next = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length;
          setActivePath(tabs[next].path);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runBuild, activePath, closeTab, tabs]);

  // ---- AI -----------------------------------------------------------------
  const collectProjectContext = async (): Promise<ProjectContext> => {
    const tree = files.map((f) => f.path).sort();
    const contents: Record<string, string> = {};
    const includeContent = (f: ProjectFile) => {
      if (f.path.startsWith('reference/') || f.path.startsWith('tests/') || f.path.startsWith('.trainer-tests/')) return false;
      const name = f.name.toLowerCase();
      return /\.(c|h)$/.test(f.name) || name === 'makefile' || /\.(bat|sh)$/.test(f.name) || /\.(md|txt)$/.test(f.name);
    };
    for (const f of files) {
      if (!includeContent(f)) continue;
      const r = await window.api.projectRead(f.path);
      if (r.ok && r.content != null && r.content.length < 200000) contents[f.path] = r.content;
    }
    return { tree, contents };
  };

  const sendChat = async (mode: AiMode, text?: string) => {
    if (!settings) return;
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    await saveAll();
    const stage = findStage(currentStageId);
    const ctx = await collectProjectContext();
    // 携带最近几轮对话历史，让 AI 有上下文记忆（限制总长度，避免超出上下文）。
    let budget = 30000;
    const history: { role: 'user' | 'assistant'; content: string }[] = [];
    for (let i = messages.length - 1; i >= 0 && budget > 0; i--) {
      const m = messages[i];
      if (m.streaming || !m.content || !m.content.trim()) continue;
      if (m.content.includes('[错误]') || m.content.includes('[已停止]')) continue;
      const c = m.content.slice(0, Math.min(budget, 4000));
      history.unshift({ role: m.role, content: c });
      budget -= c.length;
    }
    const msgs = buildMessages(mode, stage, ctx, buildResult, text, history);

    const baseId = `ai-${Date.now()}`;
    const userLabel = text && text.trim() ? text.trim() : MODE_LABELS[mode];
    setMessages((prev) => [...prev, { id: baseId + '-u', role: 'user', content: userLabel }]);
    setMessages((prev) => [
      ...prev,
      { id: baseId, role: 'assistant', content: '', reasoning: '', mode, streaming: true },
    ]);
    requestIdRef.current = baseId;
    setStreaming(true);

    try {
      const res = await window.api.aiChat({
        requestId: baseId,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        messages: msgs,
      });
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== baseId) return m;
          if (res.ok) return { ...m, streaming: false, content: res.content || m.content || '(无响应)' };
          if (res.aborted) return { ...m, streaming: false, content: m.content + '\n\n[已停止]' };
          return { ...m, streaming: false, content: (m.content || '') + `\n\n[错误] ${res.error || '未知错误'}` };
        })
      );
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === baseId ? { ...m, streaming: false, content: m.content + `\n\n[错误] ${String(e)}` } : m
        )
      );
    } finally {
      setStreaming(false);
      requestIdRef.current = null;
    }
  };

  const abortChat = () => {
    if (requestIdRef.current) window.api.aiAbort(requestIdRef.current);
  };

  // ---- settings -----------------------------------------------------------
  const saveSettings = async (patch: Partial<Settings>) => {
    const s = await window.api.settingsSet(patch);
    setSettings(s);
  };

  const detectToolchain = async () => {
    const tc = await window.api.detectToolchain();
    setToolchain(tc);
  };

  if (!settings || !toolchain) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div>正在加载…</div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar
        projectDir={settings.projectDir}
        toolchain={toolchain}
        buildRunning={buildRunning}
        starterAvailable={starterAvailable}
        onChooseProject={chooseProject}
        onInitStarter={initStarter}
        onOpenSettings={() => setShowSettings(true)}
        onRunBuild={runBuild}
      />
      <div className="main">
        <Sidebar
          style={{ width: sidebarWidth }}
          projectDir={settings.projectDir}
          stages={CURRICULUM}
          currentStageId={currentStageId}
          completedIds={completedIds}
          files={files}
          activePath={activePath}
          tab={sidebarTab}
          onTabChange={setSidebarTab}
          createPending={createPending}
          onCreateConsumed={() => setCreatePending(false)}
          onSelectStage={selectStage}
          onToggleDone={toggleDone}
          onOpenFile={openFile}
          onCreateFile={createFile}
          onDeleteFile={deleteFile}
          onRenameFile={renameFile}
          onRefreshFiles={loadFiles}
          onProjectChanged={onProjectChanged}
        />
        <div className="divider-v" onMouseDown={startDrag('sidebar')} title="拖动调整宽度" />
        <div className="center">
          <EditorPane
            tabs={tabs}
            activePath={activePath}
            theme={settings.theme}
            onTabSelect={setActivePath}
            onTabClose={closeTab}
            onChange={onChange}
            onSave={saveActive}
          />
          <div className="divider-h" onMouseDown={startDrag('output')} title="拖动调整高度" />
          <OutputPanel
            style={{ height: outputHeight }}
            buildResult={buildResult}
            logs={logs}
            buildRunning={buildRunning}
            toolchain={toolchain}
            buildScope={buildScope}
            onRunBuild={runBuild}
            onRunAllBuild={runAllBuild}
            onRevealProject={() => window.api.revealPath('.')}
            initialCwd={settings.projectDir}
            currentStageDone={completedIds.has(currentStageId)}
            onMarkStageDone={() => toggleDone(currentStageId)}
          />
        </div>
        <div className="divider-v" onMouseDown={startDrag('chat')} title="拖动调整宽度" />
        <ChatPanel
          style={{ width: chatWidth }}
          messages={messages}
          streaming={streaming}
          hasApiKey={Boolean(settings.apiKey)}
          onSend={sendChat}
          onAbort={abortChat}
          onOpenSettings={() => setShowSettings(true)}
          onClearChat={clearChat}
        />
      </div>
      {showSettings && (
        <SettingsModal
          settings={settings}
          toolchain={toolchain}
          version={version}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
          onDetect={detectToolchain}
        />
      )}
    </div>
  );
}
