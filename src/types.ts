// Shared types for the renderer.

export interface ToolInfo {
  found: boolean;
  path: string;
  name: string;
  version: string;
  builtin?: boolean;
}

export interface ToolchainInfo {
  cc: ToolInfo;
  asm: ToolInfo;
  available: boolean;
  missing: string[];
}

export interface Settings {
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  toolchain: { ccPath: string; asmPath: string };
  projectDir: string;
  theme: 'vs-dark' | 'vs' | 'hc-black';
}

export interface BootInfo {
  version: string;
  platform: string;
  settings: Settings;
  toolchain: ToolchainInfo;
  starterAvailable: boolean;
}

export interface ProjectFile {
  path: string;
  name: string;
  type: 'file' | 'dir';
}

export type TestMode = 'tokens' | 'ast' | 'stdout' | 'run' | 'error';

export interface TestCase {
  id: string;
  name: string;
  mode: TestMode;
  source: string;
  expected?: string;
  expectedExit?: number;
  flags?: string;
  description?: string;
  /** 若为 true，则调用编译器时不追加源文件参数（用于 --version/--help 等）。 */
  noSource?: boolean;
}

export interface Stage {
  id: string;
  num: number;
  title: string;
  summary: string;
  /** 面向小白的基础知识补充（本阶段需要用到的概念，逐条解释） */
  background?: string[];
  /** 本阶段需要修改/创建的文件 */
  files?: string[];
  goals: string[];
  hints: string[];
  contract: string;
  testCases: TestCase[];
  acceptance: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  mode?: string;
  streaming?: boolean;
}

export interface TestStep {
  name: string;
  status: 'ok' | 'fail' | 'skip' | 'info';
  detail?: string;
}

export interface TestResult {
  id: string;
  name: string;
  mode: string;
  pass: boolean;
  expected: string;
  actual: string;
  diffLine: number;
  note: string;
  description?: string;
  source?: string;
  expectedExit?: number;
  actualExit?: number;
  steps?: TestStep[];
}

export interface BuildResult {
  ok: boolean;
  compileOk: boolean;
  error?: string;
  passCount: number;
  failCount: number;
  total: number;
  results: TestResult[];
  buildLog?: { stdout: string; stderr: string };
}

export interface BuildLogEntry {
  type: string;
  text: string;
  testId?: string;
}

export interface UpdateStatus {
  state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev';
  version?: string;
  percent?: number;
  message?: string;
}

export interface GitFile {
  code: string;
  path: string;
  kind: 'modified' | 'added' | 'deleted' | 'untracked';
}

export interface GitCommit {
  hash: string;
  subject: string;
  date: string;
}

export interface FileTab {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
  /** 只读标签（如「参考答案」），不参与保存 */
  readOnly?: boolean;
}

declare global {
  interface Window {
    api: {
      getBoot(): Promise<BootInfo>;
      clipboardWriteText(text: string): void;
      clipboardReadText(): string;
      settingsGet(): Promise<Settings>;
      settingsSet(patch: Partial<Settings>): Promise<Settings>;
      detectToolchain(): Promise<ToolchainInfo>;
      chooseProject(): Promise<{ canceled: boolean; projectDir?: string; ok?: boolean; error?: string; files?: ProjectFile[] }>;
      initStarter(): Promise<{ ok: boolean; error?: string; files?: ProjectFile[] }>;
      projectList(): Promise<{ ok: boolean; error?: string; files?: ProjectFile[] }>;
      projectRead(rel: string): Promise<{ ok: boolean; error?: string; content?: string }>;
      projectWrite(rel: string, content: string): Promise<{ ok: boolean; error?: string }>;
      projectCreate(rel: string, kind: 'file' | 'dir'): Promise<{ ok: boolean; error?: string }>;
      projectDelete(rel: string): Promise<{ ok: boolean; error?: string }>;
      projectRename(rel: string, newName: string): Promise<{ ok: boolean; error?: string }>;
      buildRun(payload: { testCases: TestCase[]; ccPath?: string }): Promise<BuildResult>;
      shellRun(cmd: string): Promise<{ ok: boolean; code?: number; stdout?: string; stderr?: string; timedOut?: boolean; error?: string }>;
      termRun(cmd: string): Promise<{ ok: boolean }>;
      termKill(): Promise<{ ok: boolean }>;
      termReset(): Promise<{ ok: boolean }>;
      updateCheck(): Promise<{ ok: boolean }>;
      updateInstall(): Promise<{ ok: boolean }>;
      chatLoad(): Promise<ChatMessage[]>;
      chatSave(messages: ChatMessage[]): Promise<{ ok: boolean; error?: string }>;
      chatClear(): Promise<{ ok: boolean }>;
      gitIsRepo(): Promise<{ ok: boolean; isRepo: boolean; notFound?: boolean }>;
      gitInit(): Promise<{ ok: boolean; error?: string; output?: string }>;
      gitStatus(): Promise<{ ok: boolean; error?: string; files: GitFile[] }>;
      gitLog(n?: number): Promise<{ ok: boolean; error?: string; commits: GitCommit[] }>;
      gitCommit(message: string): Promise<{ ok: boolean; error?: string; output?: string }>;
      gitRollback(hash: string): Promise<{ ok: boolean; error?: string; output?: string }>;
      gitDiff(rel: string | null): Promise<{ ok: boolean; diff?: string; error?: string }>;
      gitUncommit(): Promise<{ ok: boolean; error?: string; output?: string }>;
      dialogConfirm(opts: { message: string; title?: string; type?: string; buttons?: string[]; defaultId?: number; cancelId?: number }): Promise<boolean>;
      dialogMessage(opts: { message: string; title?: string; type?: string; buttons?: string[] }): Promise<{ ok: boolean }>;
      dialogChoice(opts: { message: string; detail?: string; title?: string; type?: string; buttons?: string[]; defaultId?: number; cancelId?: number }): Promise<{ response: number }>;
      winMinimize(): Promise<{ ok: boolean }>;
      winToggleMaximize(): Promise<{ ok: boolean }>;
      winClose(): Promise<{ ok: boolean }>;
      winIsMaximized(): Promise<boolean>;
      closeNow(): Promise<{ ok: boolean }>;
      aiChat(payload: { requestId: string; apiKey: string; baseUrl: string; model: string; temperature: number; messages: any[] }): Promise<{ ok: boolean; content?: string; reasoning?: string; error?: string; aborted?: boolean }>;
      aiAbort(id: string): Promise<{ ok: boolean }>;
      openExternal(url: string): Promise<{ ok: boolean }>;
      revealPath(rel: string): Promise<{ ok: boolean }>;
      readReference(): Promise<{ ok: boolean; content?: string; error?: string }>;
      onEvent(channel: string, cb: (data: any) => void): () => void;
    };
  }
}

export {};
