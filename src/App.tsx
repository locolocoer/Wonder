import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BootInfo,
  Settings,
  ToolchainInfo,
  ProjectFile,
  FileTab,
  ChatMessage,
  BuildResult,
  BuildLogEntry,
  SsoUser,
} from './types';
import { COURSES, findStage, getCourse } from './lib/curriculum';
import { buildMessages, MODE_LABELS, type AiMode, type ProjectContext } from './lib/ai-prompts';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { EditorPane } from './components/EditorPane';
import { OutputPanel } from './components/OutputPanel';
import { ChatPanel } from './components/ChatPanel';
import { SettingsModal } from './components/SettingsModal';
import { DocModal } from './components/DocModal';
import { LoginScreen } from './components/LoginScreen';

// 按课程隔离的本地存储键
const kStage = (cid: string) => `cc-stage:${cid}`;
const kDone = (cid: string) => `cc-done:${cid}`;
const kPassed = (cid: string) => `cc-passed:${cid}`;

function loadCourseDirs(): Record<string, string> {
  try {
    const d = JSON.parse(localStorage.getItem('cc-course-dirs') || '{}');
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

const initialCourseId = (() => {
  const v = localStorage.getItem('cc-course');
  return v && COURSES.some((c) => c.id === v) ? v : COURSES[0].id;
})();

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toolchain, setToolchain] = useState<ToolchainInfo | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activePath, setActivePath] = useState('');
  const [currentCourseId, setCurrentCourseId] = useState(initialCourseId);
  const [currentStageId, setCurrentStageId] = useState(() => {
    const stages = getCourse(initialCourseId).stages;
    const v = localStorage.getItem(kStage(initialCourseId));
    return v && stages.some((s) => s.id === v) ? v : stages[0]?.id || '';
  });
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
  const [sidebarTab, setSidebarTab] = useState<'course' | 'files' | 'git' | 'basics'>('course');
  const [createPending, setCreatePending] = useState(false);
  const [docName, setDocName] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoggedIn, setSsoLoggedIn] = useState(false);
  const [ssoUser, setSsoUser] = useState<SsoUser | null>(null);
  const [contextPaths, setContextPaths] = useState<string[]>(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('cc-context') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

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

  // 全局界面缩放（字体大小），用 Electron 原生缩放，保证鼠标坐标与布局一致
  useEffect(() => {
    if (!settings) return;
    const scale = Number.isFinite(settings.uiScale) && settings.uiScale > 0 ? settings.uiScale : 1;
    window.api.setZoom(scale);
  }, [settings?.uiScale]);

  // 稳定 style 对象，避免每次渲染新建对象导致 React.memo(ChatPanel) 失效
  const chatStyle = useMemo(() => ({ width: chatWidth }), [chatWidth]);
  const outputStyle = useMemo(() => ({ height: outputHeight }), [outputHeight]);

  const requestIdRef = useRef<string | null>(null);
  const buildRunningRef = useRef(false);
  // 始终反映最新的左右面板宽度，供拖拽时计算「中间编辑区最小宽度」约束
  const sizesRef = useRef({ chat: chatWidth, sidebar: sidebarWidth });
  sizesRef.current = { chat: chatWidth, sidebar: sidebarWidth };

  // 流式输出批量缓冲：把同一帧内到达的 AI chunk / 编译日志合并成一次 setState，避免高频重渲染
  const aiChunkBufRef = useRef<Record<string, { content: string; reasoning: string }>>({});
  const aiChunkRafRef = useRef(0);
  const logBufRef = useRef<BuildLogEntry[]>([]);
  const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 编辑器内容存 ref（非受控 Monaco），击键不触发重渲染；tabs 里 content 是「最近一次提交」的内容
  const contentsRef = useRef<Record<string, string>>({});
  const tabsRef = useRef<FileTab[]>(tabs);
  tabsRef.current = tabs;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revCounterRef = useRef(0);

  const MIN_CENTER_W = 320; // 中间编辑区最小宽度
  const DIVIDERS_W = 10; // 两个竖直分隔条

  const startDrag = (which: 'chat' | 'sidebar' | 'output') => (e: React.MouseEvent) => {
    e.preventDefault();
    dragStateRef.current = {
      which,
      size: which === 'chat' ? chatWidth : which === 'sidebar' ? sidebarWidth : outputHeight,
    };
    const isRow = which === 'output';
    // 用 requestAnimationFrame 把 mousemove 收敛到每帧一次，避免高频重渲染导致卡顿
    let rafId = 0;
    let lastEv: MouseEvent | null = null;
    const computeSize = (d: { which: 'chat' | 'sidebar' | 'output' }, ev: MouseEvent): number => {
      if (d.which === 'chat') {
        const raw = Math.min(900, Math.max(280, window.innerWidth - ev.clientX));
        const maxForCenter = window.innerWidth - DIVIDERS_W - MIN_CENTER_W - sizesRef.current.sidebar;
        return Math.min(raw, Math.max(0, maxForCenter));
      }
      if (d.which === 'sidebar') {
        const raw = Math.min(520, Math.max(200, ev.clientX));
        const maxForCenter = window.innerWidth - DIVIDERS_W - MIN_CENTER_W - sizesRef.current.chat;
        return Math.min(raw, Math.max(0, maxForCenter));
      }
      return Math.min(Math.max(120, window.innerHeight - 220), Math.max(100, window.innerHeight - ev.clientY));
    };
    const applySize = (size: number) => {
      const d = dragStateRef.current;
      if (!d) return;
      dragStateRef.current = { ...d, size };
      if (d.which === 'chat') setChatWidth(size);
      else if (d.which === 'sidebar') setSidebarWidth(size);
      else setOutputHeight(size);
    };
    const apply = () => {
      rafId = 0;
      const d = dragStateRef.current;
      const ev = lastEv;
      lastEv = null;
      if (!d || !ev) return;
      applySize(computeSize(d, ev));
    };
    const onMove = (ev: MouseEvent) => {
      lastEv = ev;
      if (rafId) return;
      rafId = requestAnimationFrame(apply);
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      // 还有未处理的最后一段移动时，立即应用，避免最后一帧位置丢失
      if (lastEv && dragStateRef.current) {
        applySize(computeSize(dragStateRef.current, lastEv));
        lastEv = null;
      }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
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
    window.addEventListener('blur', onUp); // 窗口失焦/鼠标在窗外松开时的兜底清理
    document.body.classList.add('resizing');
    document.body.style.cursor = isRow ? 'row-resize' : 'col-resize';
  };

  // 启动时若持久化的左右面板宽度把中间编辑区挤没了，按比例压缩两侧，保证中间至少 MIN_CENTER_W
  useEffect(() => {
    const budget = window.innerWidth - DIVIDERS_W - MIN_CENTER_W;
    if (budget <= 0) return;
    const total = sidebarWidth + chatWidth;
    if (total > budget) {
      const scale = budget / total;
      setSidebarWidth(Math.max(160, Math.round(sidebarWidth * scale)));
      setChatWidth(Math.max(160, Math.round(chatWidth * scale)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- bootstrap ----------------------------------------------------------
  useEffect(() => {
    (async () => {
      const b: BootInfo = await window.api.getBoot();
      setSettings(b.settings);
      setToolchain(b.toolchain);
      setVersion(b.version);
      setStarterAvailable(b.starterAvailable);
      if (b.sso) {
        setSsoEnabled(b.sso.enabled);
        setSsoLoggedIn(b.sso.loggedIn);
        setSsoUser(b.sso.user);
      }
      const sid = localStorage.getItem(kStage(currentCourseId)) || getCourse(currentCourseId).stages[0]?.id || '';
      let done: string[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem(kDone(currentCourseId)) || '[]');
        if (Array.isArray(parsed)) done = parsed;
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

  // Ctrl+点击 C 函数名 → 打开应用内文档面板
  useEffect(() => {
    const onDocOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.name) setDocName(detail.name);
    };
    window.addEventListener('wonder-doc-open', onDocOpen);
    return () => window.removeEventListener('wonder-doc-open', onDocOpen);
  }, []);

  // ---- chat 历史持久化（防抖保存，重启后恢复） --------------------------
  useEffect(() => {
    if (messages.length === 0) return;
    const t = setTimeout(() => {
      window.api.chatSave(messages.map((m) => ({ ...m, streaming: false })));
    }, 1000);
    return () => clearTimeout(t);
  }, [messages]);

  // （自动保存已改为 onChange 里的 ref 防抖，见 savePath/onChange）

  const clearChat = useCallback(() => {
    setMessages([]);
    window.api.chatClear();
  }, []);

  // ---- IPC events ---------------------------------------------------------
  useEffect(() => {
    const offChunk = window.api.onEvent('ai:chunk', (data) => {
      const buf = aiChunkBufRef.current;
      const entry = buf[data.requestId] || (buf[data.requestId] = { content: '', reasoning: '' });
      if (data.type === 'content') entry.content += data.text || '';
      else if (data.type === 'reasoning') entry.reasoning += data.text || '';
      if (aiChunkRafRef.current) return;
      aiChunkRafRef.current = requestAnimationFrame(() => {
        aiChunkRafRef.current = 0;
        const pending = aiChunkBufRef.current;
        aiChunkBufRef.current = {};
        if (!Object.keys(pending).length) return;
        setMessages((prev) =>
          prev.map((m) => {
            const p = pending[m.id];
            if (!p || !m.streaming) return m;
            if (!p.content && !p.reasoning) return m;
            return {
              ...m,
              content: p.content ? m.content + p.content : m.content,
              reasoning: p.reasoning ? (m.reasoning || '') + p.reasoning : m.reasoning,
            };
          })
        );
      });
    });
    const offLog = window.api.onEvent('build:log', (data) => {
      logBufRef.current.push({ type: data.type, text: data.text, testId: data.testId });
      if (logTimerRef.current) return;
      logTimerRef.current = setTimeout(() => {
        logTimerRef.current = null;
        const pending = logBufRef.current;
        logBufRef.current = [];
        if (!pending.length) return;
        setLogs((prev) => [...prev, ...pending]);
      }, 100);
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
        // 若此前是只读打开的头文件标签，从文件树再次打开时转为可编辑
        if (existing.readOnly) {
          setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, readOnly: false } : t)));
        }
        setActivePath(path);
        return;
      }
      const r = await window.api.projectRead(path);
      if (!r.ok) return;
      const content = r.content || '';
      contentsRef.current[path] = content;
      setTabs((prev) =>
        prev.some((t) => t.path === path) ? prev : [...prev, { path, name: path.split('/').pop() || path, content, dirty: false, rev: ++revCounterRef.current }]
      );
      setActivePath(path);
    },
    [tabs]
  );

  // 始终用 ref 取「当前」标签，避免 Monaco 组件里残留的旧 onChange 闭包把内容写进错误的标签。
  const activePathRef = useRef(activePath);
  activePathRef.current = activePath;

  // 把某路径的最新内容写盘，并提交到 tabs（清 dirty、更新 content 作为下次 defaultValue）
  const savePath = useCallback(async (path: string) => {
    const t = tabsRef.current.find((x) => x.path === path);
    if (!t || t.readOnly || !t.dirty) return;
    const content = contentsRef.current[path] ?? t.content;
    const r = await window.api.projectWrite(path, content);
    if (r.ok) {
      setTabs((prev) => prev.map((x) => (x.path === path && x.dirty ? { ...x, content, dirty: false } : x)));
    }
  }, []);

  const onChange = useCallback((content: string) => {
    const path = activePathRef.current;
    const t = tabsRef.current.find((x) => x.path === path);
    if (!t || t.readOnly) return; // 只读标签（头文件/参考答案）永不落盘、永不标脏
    contentsRef.current[path] = content;
    // 只在 dirty 翻转时更新 state（首次击键），后续击键不再触发整树重渲染
    if (!t.dirty) {
      setTabs((prev) => prev.map((x) => (x.path === path ? { ...x, dirty: true } : x)));
    }
    // 自动保存：ref 内防抖，1.5s 静默写盘，避免每次击键都触发 effect
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      savePath(path);
    }, 1500);
  }, [savePath]);

  const saveAll = useCallback(async () => {
    // 快照当前脏内容（取 ref 里的最新内容），写盘期间若用户继续输入，只清除「内容未再变化」的脏标记
    const snapshot = tabs.filter((t) => t.dirty && !t.readOnly).map((t) => ({ path: t.path, content: contentsRef.current[t.path] ?? t.content }));
    let failed = 0;
    for (const s of snapshot) {
      const r = await window.api.projectWrite(s.path, s.content);
      if (!r.ok) failed++;
    }
    if (failed > 0) {
      await window.api.dialogMessage({ type: 'error', message: `${failed} 个文件保存失败，请检查文件是否被占用或路径是否有效。` });
    } else {
      setTabs((prev) =>
        prev.map((t) => {
          const snap = snapshot.find((s) => s.path === t.path);
          // 写盘期间若用户又输入了（ref 里内容变了），保留 dirty，不提交
          return snap && (contentsRef.current[t.path] ?? t.content) === snap.content ? { ...t, content: snap.content, dirty: false } : t;
        })
      );
    }
  }, [tabs]);

  const saveActive = useCallback(async () => {
    const t = tabsRef.current.find((x) => x.path === activePath);
    if (!t || t.readOnly) return;
    const content = contentsRef.current[t.path] ?? t.content;
    const r = await window.api.projectWrite(t.path, content);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: `保存失败：${r.error || '未知错误'}` });
      return;
    }
    setTabs((prev) => prev.map((x) => (x.path === activePath ? { ...x, content, dirty: false } : x)));
  }, [activePath]);

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
    // 把当前课程映射到新选的工程目录
    const dirs = loadCourseDirs();
    dirs[currentCourseId] = res.projectDir;
    localStorage.setItem('cc-course-dirs', JSON.stringify(dirs));
    setSettings((s) => (s ? { ...s, projectDir: res.projectDir! } : s));
    setTabs([]);
    setActivePath('');
    clearContext(); // 切换工程后清掉旧工程的 AI 上下文选择
    await loadFiles();
  };

  const initStarter = async () => {
    if (!getCourse(currentCourseId).available) {
      await window.api.dialogMessage({ message: '这门课程即将上线，暂无起始模板。可先切回「C 编译器」开始练习。' });
      return;
    }
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
    await window.api.dialogMessage({
      message: '工程已初始化为空文件夹。\n\n从左侧「课程路线」的阶段 1 开始，按「需要创建的文件」自己动手写代码。',
    });
  };

  const openReadOnlyTab = useCallback((path: string, name: string, content: string) => {
    contentsRef.current[path] = content;
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, name, content, dirty: false, readOnly: true, rev: ++revCounterRef.current }];
    });
    setActivePath(path);
  }, []);

  const openReference = async () => {
    if (getCourse(currentCourseId).kind !== 'compiler') {
      await window.api.dialogMessage({ message: '该课程暂无内置参考答案，可参考「基础」栏目的原理说明，或向 AI 导师求助。' });
      return;
    }
    const r = await window.api.readReference();
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '读取失败' });
      return;
    }
    const fname = settings?.language === 'cpp' ? 'mycc.cpp' : 'mycc.c';
    openReadOnlyTab(`[参考答案] ${fname}`, `${fname}（参考答案）`, r.content || '');
  };

  // Ctrl+点击 #include 头文件 → 应用内只读打开头文件
  const openHeader = useCallback(
    async (kind: 'sys' | 'local', name: string) => {
      const r = await window.api.openHeader({ kind, name, basePath: activePath });
      if (!r.ok || !r.path) {
        await window.api.dialogMessage({ type: 'error', message: r.error || '无法打开头文件' });
        return;
      }
      openReadOnlyTab(r.path, `${r.name || name}（头文件）`, r.content || '');
    },
    [activePath, openReadOnlyTab]
  );

  useEffect(() => {
    const onHeaderOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.name) openHeader(detail.kind === 'local' ? 'local' : 'sys', detail.name);
    };
    window.addEventListener('wonder-header-open', onHeaderOpen);
    return () => window.removeEventListener('wonder-header-open', onHeaderOpen);
  }, [openHeader]);

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
    const dirtyUnder = tabs.filter((t) => t.dirty && (t.path === path || t.path.startsWith(path + '/')));
    if (dirtyUnder.length) {
      const ok = await window.api.dialogConfirm({
        message: `要删除的路径下有 ${dirtyUnder.length} 个未保存的文件（${dirtyUnder.slice(0, 5).map((t) => t.path).join('、')}${dirtyUnder.length > 5 ? '…' : ''}），删除将丢失这些修改。确定删除吗？`,
        title: '删除',
        type: 'warning',
      });
      if (!ok) return;
    }
    const r = await window.api.projectDelete(path);
    if (!r.ok) {
      await window.api.dialogMessage({ type: 'error', message: r.error || '操作失败' });
      return;
    }
    setTabs((prev) => prev.filter((t) => t.path !== path && !t.path.startsWith(path + '/')));
    if (activePath === path || activePath.startsWith(path + '/')) setActivePath('');
    await loadFiles();
  };

  // 磁盘内容被外部改动（Git 回滚、重命名等）后：刷新文件树，并重读所有已打开标签。
  // 可传入重映射后的 tabs/activePath（用于重命名场景，避免按旧路径读不到而丢标签）。
  const onProjectChanged = useCallback(async (tabsOverride?: FileTab[], activeOverride?: string) => {
    await loadFiles();
    const src = tabsOverride || tabs;
    const act = activeOverride !== undefined ? activeOverride : activePath;
    const next: FileTab[] = [];
    for (const t of src) {
      // 只读标签（参考答案/头文件）是快照，路径可能不在工程内，直接保留不重读
      if (t.readOnly) {
        next.push(t);
        continue;
      }
      const r = await window.api.projectRead(t.path);
      if (r.ok) {
        const content = r.content || '';
        contentsRef.current[t.path] = content;
        // rev 递增 → Monaco 用新 model 重建，显示外部更新后的内容
        next.push({ ...t, content, dirty: false, rev: ++revCounterRef.current });
      }
    }
    setTabs(next);
    if (act && !next.some((t) => t.path === act)) {
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
    // 重命名后先重映射已打开标签的路径，再交给 onProjectChanged 重读，避免旧路径读不到而丢标签
    const newPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) + newName : newName;
    const remapped = tabs.map((t) => {
      if (t.path === path) return { ...t, path: newPath, name: newName };
      if (t.path.startsWith(path + '/')) return { ...t, path: newPath + t.path.slice(path.length) };
      return t;
    });
    const remappedActive =
      activePath === path ? newPath : activePath.startsWith(path + '/') ? newPath + activePath.slice(path.length) : activePath;
    await onProjectChanged(remapped, remappedActive);
  };

  // ---- course / stage ------------------------------------------------------
  const selectCourse = async (courseId: string) => {
    if (courseId === currentCourseId) return;
    const c = getCourse(courseId);
    // 1) 保存当前课程的工程目录，并切换到新课程的工程目录（每门课独立的目录）
    const dirs = loadCourseDirs();
    dirs[currentCourseId] = settings?.projectDir || '';
    const newDir = dirs[courseId] || '';
    localStorage.setItem('cc-course-dirs', JSON.stringify(dirs));
    if (newDir !== (settings?.projectDir || '')) {
      await window.api.settingsSet({ projectDir: newDir });
      setSettings((s) => (s ? { ...s, projectDir: newDir } : s));
    }
    // 2) 切换课程 + 回到该课程上次的阶段
    setCurrentCourseId(c.id);
    localStorage.setItem('cc-course', c.id);
    const savedStage = localStorage.getItem(kStage(c.id));
    const firstStage = c.stages[0]?.id || '';
    const stage = savedStage && c.stages.some((s) => s.id === savedStage) ? savedStage : firstStage;
    setCurrentStageId(stage);
    // 3) 重置该课程的阶段完成状态、标签页、文件树
    let done: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(kDone(c.id)) || '[]');
      if (Array.isArray(parsed)) done = parsed;
    } catch {
      done = [];
    }
    setCompletedIds(new Set(done));
    setTabs([]);
    setActivePath('');
    clearContext();
    if (newDir) await loadFiles();
    else setFiles([]);
  };

  const selectStage = (id: string) => {
    setCurrentStageId(id);
    localStorage.setItem(kStage(currentCourseId), id);
  };

  const stagePassed = (id: string) => {
    try {
      const map = JSON.parse(localStorage.getItem(kPassed(currentCourseId)) || '{}');
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
      localStorage.setItem(kDone(currentCourseId), JSON.stringify([...next]));
      return next;
    });
  };

  // ---- AI 上下文选择 ------------------------------------------------------
  const toggleContext = useCallback((path: string) => {
    setContextPaths((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      localStorage.setItem('cc-context', JSON.stringify(next));
      return next;
    });
  }, []);

  const clearContext = useCallback(() => {
    setContextPaths([]);
    localStorage.setItem('cc-context', '[]');
  }, []);

  // ---- build / test -------------------------------------------------------
  const recordStagePass = (id: string) => {
    try {
      const map = JSON.parse(localStorage.getItem(kPassed(currentCourseId)) || '{}');
      map[id] = true;
      localStorage.setItem(kPassed(currentCourseId), JSON.stringify(map));
    } catch {
      /* ignore */
    }
  };

  const runBuild = async (scope?: 'stage' | 'all') => {
    if (!settings || !settings.projectDir) return;
    if (buildRunningRef.current) return; // 防止并发编译（Ctrl+B 或连点）
    buildRunningRef.current = true;
    await saveAll();
    const stage = findStage(currentCourseId, currentStageId);
    if (!stage) {
      buildRunningRef.current = false;
      return;
    }
    // 防止 onClick 直接把事件对象当参数传进来：只有显式传 'all' 才是全量，其余一律视为本阶段。
    const effectiveScope = scope === 'all' ? 'all' : 'stage';
    setBuildScope(effectiveScope);
    setBuildRunning(true);
    setLogs([]);
    setBuildResult(null);
    try {
      const testCases = effectiveScope === 'all' ? getCourse(currentCourseId).stages.flatMap((s) => s.testCases) : stage.testCases;
      const res = await window.api.buildRun({ testCases, ccPath: settings.toolchain.ccPath, language: settings.language, kind: getCourse(currentCourseId).kind });
      setBuildResult(res);
      if (res.ok && res.failCount === 0 && res.total > 0 && effectiveScope === 'stage') {
        recordStagePass(currentStageId);
      }
    } finally {
      buildRunningRef.current = false;
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
  const collectProjectContext = useCallback(async (): Promise<ProjectContext> => {
    const tree = files.map((f) => f.path).sort();
    const contents: Record<string, string> = {};
    const isSelected = (f: ProjectFile) =>
      contextPaths.some((p) => f.path === p || f.path.startsWith(p + '/'));
    const includeContent = (f: ProjectFile) => {
      // 手动选择模式：只带入选中的文件/目录
      if (contextPaths.length > 0) return isSelected(f);
      // 自动模式：源码 + 构建脚本 + 文档
      if (f.path.startsWith('reference/') || f.path.startsWith('tests/') || f.path.startsWith('.trainer-tests/')) return false;
      const name = f.name.toLowerCase();
      return /\.(c|h|cpp|cc|cxx|hpp)$/.test(f.name) || name === 'makefile' || /\.(bat|sh)$/.test(f.name) || /\.(md|txt)$/.test(f.name);
    };
    for (const f of files) {
      if (!includeContent(f)) continue;
      const r = await window.api.projectRead(f.path);
      if (r.ok && r.content != null && r.content.length < 200000) contents[f.path] = r.content;
    }
    return { tree, contents };
  }, [files, contextPaths]);

  const sendChat = useCallback(async (mode: AiMode, text?: string) => {
    if (!settings) return;
    if (requestIdRef.current) return; // 上一次请求未结束，防止并发请求互相覆盖
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    const baseId = `ai-${Date.now()}`;
    requestIdRef.current = baseId; // 在任何 await 之前同步占位，防止快速连点触发并发请求
    await saveAll();
    const stage = findStage(currentCourseId, currentStageId);
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
    const msgs = buildMessages(mode, stage, ctx, buildResult, settings.language, text, history);

    const userLabel = text && text.trim() ? text.trim() : MODE_LABELS[mode];
    setMessages((prev) => [...prev, { id: baseId + '-u', role: 'user', content: userLabel }]);
    setMessages((prev) => [
      ...prev,
      { id: baseId, role: 'assistant', content: '', reasoning: '', mode, streaming: true },
    ]);
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
      if (requestIdRef.current === baseId) {
        setStreaming(false);
        requestIdRef.current = null;
      }
    }
  }, [settings, currentStageId, buildResult, messages, saveAll, collectProjectContext]);

  const abortChat = useCallback(() => {
    if (requestIdRef.current) window.api.aiAbort(requestIdRef.current);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);

  // ---- settings -----------------------------------------------------------
  const saveSettings = async (patch: Partial<Settings>) => {
    const s = await window.api.settingsSet(patch);
    setSettings(s);
  };

  const detectToolchain = async () => {
    const tc = await window.api.detectToolchain();
    setToolchain(tc);
  };

  // ---- SSO ----------------------------------------------------------------
  const doSsoLogin = async () => {
    const r = await window.api.ssoLogin();
    if (!r.ok) throw new Error(r.error || '登录失败');
    setSsoLoggedIn(true);
    setSsoUser(r.user || null);
  };

  const doSsoLogout = async () => {
    await window.api.ssoLogout();
    setSsoLoggedIn(false);
    setSsoUser(null);
  };

  if (!settings || !toolchain) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div>正在加载…</div>
      </div>
    );
  }

  const settingsModal = showSettings && (
    <SettingsModal
      settings={settings}
      toolchain={toolchain}
      version={version}
      onClose={() => setShowSettings(false)}
      onSave={saveSettings}
      onDetect={detectToolchain}
      ssoUser={ssoUser}
      onSsoLogin={doSsoLogin}
      onSsoLogout={doSsoLogout}
    />
  );

  // SSO 启动登录门：启用且未登录时显示登录页
  if (ssoEnabled && !ssoLoggedIn) {
    return (
      <div className="app">
        <LoginScreen onLogin={doSsoLogin} onOpenSettings={openSettings} />
        {settingsModal}
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
        language={settings.language}
        onChooseProject={chooseProject}
        onInitStarter={initStarter}
        onOpenReference={openReference}
        onOpenSettings={() => setShowSettings(true)}
        onRunBuild={runBuild}
      />
      <div className="main">
        <Sidebar
          style={{ width: sidebarWidth }}
          projectDir={settings.projectDir}
          stages={getCourse(currentCourseId).stages}
          intro={getCourse(currentCourseId).intro}
          courses={COURSES}
          currentCourseId={currentCourseId}
          onSelectCourse={selectCourse}
          currentStageId={currentStageId}
          completedIds={completedIds}
          files={files}
          activePath={activePath}
          language={settings.language}
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
            style={outputStyle}
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
          style={chatStyle}
          messages={messages}
          streaming={streaming}
          hasApiKey={Boolean(settings.apiKey)}
          files={files}
          contextPaths={contextPaths}
          onToggleContext={toggleContext}
          onClearContext={clearContext}
          onSend={sendChat}
          onAbort={abortChat}
          onOpenSettings={openSettings}
          onClearChat={clearChat}
        />
      </div>
      {settingsModal}
      {docName && <DocModal name={docName} onClose={() => setDocName(null)} />}
    </div>
  );
}
