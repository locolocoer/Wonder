import type { Stage, BuildResult } from '../types';

export type AiMode = 'breakdown' | 'hint' | 'judge' | 'chat';

export const MODE_LABELS: Record<AiMode, string> = {
  breakdown: '拆分当前任务',
  hint: '给点提示',
  judge: '评判我的代码',
  chat: '自由提问',
};

const BASE_SYSTEM = `你是一位资深的编译器专家与编程导师，正在指导一名学生用 C 语言从零实现一个「C 子集编译器」（目标输出 x86-64 汇编）。
教学原则：
1. 循序渐进、启发式引导，鼓励学生自己思考；
2. 优先用提问和提示引导学生，不要一上来就给出完整代码；
3. 代码与编译术语保留英文，解释用中文；
4. 回答结构清晰，多用列表与短段落。`;

const MODE_INSTRUCTION: Record<AiMode, string> = {
  breakdown: `【任务：拆分当前任务】
把学生当前所处的阶段拆解成 3~6 个更小、可独立验证的子步骤，并用 Markdown 表格呈现，列为：
| 子步骤 | 内容 | 当前状态 |
其中「内容」写清该子步骤要做什么（涉及哪些函数/数据结构、如何自测）；「当前状态」必须根据学生源码的真实完成度标注：✅ 已具备 / 🟡 部分完成 / ❌ 待做，不要凭空臆断。
表格之后用一段简短的「下一步建议」指出最该先做的一步。输出 Markdown。`,

  hint: `【任务：给点提示】
先审视学生当前源码卡在哪一步，然后给出「由浅入深」的分级提示：
1. 先给一条最轻的提示（只点方向，不透露实现）；
2. 再给一条中等提示（提示关键思路/伪代码片段，不超过 3 行）。
不要直接给出完整可运行的实现，让学生先尝试。如果学生代码里已有明显 bug，可以针对性指出并给最小修复提示。输出 Markdown。`,

  judge: `【任务：评判代码】
对学生当前源码做代码评审：
1. 正确性：对照当前阶段的接口契约与验收标准，指出错误与隐患（含潜在崩溃/内存问题）；
2. 结构与风格：模块划分、命名、可读性；
3. 边界情况：是否处理了注释、EOF、除零、作用域等边界；
4. 给出分项评价（可用 ✅/⚠️/❌ 标记）与 2~4 条具体改进建议。
如果提供了测试结果，请结合通过/失败情况点评。指出问题时给出定位（文件名/函数/行号级别即可），但不要直接替学生重写整个文件。输出 Markdown。`,

  chat: `【任务：自由答疑】
回答学生关于编译器实现、C 语言、x86-64 汇编、调试方法等问题。尽量结合他当前的代码上下文给出针对性建议。输出 Markdown。`,
};

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n... (已截断，共 ${text.length} 字符)`;
}

function stageBlock(stage: Stage | undefined): string {
  if (!stage) return '（当前无选中阶段）';
  return [
    `阶段 ${stage.num}：${stage.title}`,
    `简介：${stage.summary}`,
    `目标：\n${stage.goals.map((g) => `- ${g}`).join('\n')}`,
    `接口契约：\n${stage.contract}`,
    `验收标准：\n${stage.acceptance.map((a) => `- ${a}`).join('\n')}`,
  ].join('\n');
}

export interface ProjectContext {
  /** 工程内全部文件的相对路径（用于让 AI 了解项目结构） */
  tree: string[];
  /** 需要给 AI 看内容的文本文件：源码 + 构建脚本 + 文档 */
  contents: Record<string, string>;
}

function treeBlock(tree: string[]): string {
  if (!tree.length) return '（工程目录为空，尚未初始化起始模板）';
  return '```\n' + tree.join('\n') + '\n```';
}

function langFor(path: string): string {
  const lower = path.toLowerCase();
  if (/\.(c|h)$/.test(path)) return 'c';
  if (lower === 'makefile' || lower.endsWith('makefile')) return 'makefile';
  if (/\.(bat|sh)$/.test(path)) return 'bash';
  if (/\.md$/.test(path)) return 'markdown';
  return '';
}

function filesBlock(contents: Record<string, string>): string {
  const entries = Object.entries(contents);
  if (!entries.length) return '（学生尚未编写任何源码文件）';
  const totalBudget = 14000;
  const per = Math.max(600, Math.floor(totalBudget / entries.length));
  return entries
    .map(([path, content]) => {
      const lang = langFor(path);
      return `### 文件 ${path}\n\`\`\`${lang}\n${truncate(content, per)}\n\`\`\``;
    })
    .join('\n\n');
}

function buildBlock(build: BuildResult | null): string {
  if (!build) return '（尚无最近一次编译/测试结果）';
  if (!build.ok) return `最近一次编译失败：${build.error || '未知错误'}`;
  const lines = [
    `最近一次测试：共 ${build.total} 项，通过 ${build.passCount}，失败 ${build.failCount}`,
  ];
  for (const r of build.results) {
    lines.push(`- [${r.pass ? '通过' : '失败'}] ${r.name}${r.note ? '：' + r.note : ''}`);
  }
  return lines.join('\n');
}

export function buildContext(
  stage: Stage | undefined,
  ctx: ProjectContext,
  build: BuildResult | null
): string {
  return [
    '## 当前阶段',
    stageBlock(stage),
    '',
    '## 工程文件树',
    treeBlock(ctx.tree),
    '',
    '## 文件内容',
    filesBlock(ctx.contents),
    '',
    '## 测试结果',
    buildBlock(build),
  ].join('\n');
}

export function buildMessages(
  mode: AiMode,
  stage: Stage | undefined,
  ctx: ProjectContext,
  build: BuildResult | null,
  userText?: string
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const system = `${BASE_SYSTEM}\n\n${MODE_INSTRUCTION[mode]}`;
  const user = `${buildContext(stage, ctx, build)}${userText && userText.trim() ? '\n\n## 学生补充\n' + userText.trim() : ''}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
