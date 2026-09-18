# Dojo —— AI 陪练式项目编程训练器

一个 **AI 陪练式**桌面软件：陪你从零实现一个个真实软件项目（首个项目：用 C 写一个编译器，输出 x86-64 汇编），
由大模型（DeepSeek）充当老师，帮你**拆分任务、逐步给提示、评判你的实现**。

## 功能

- **课程路线**：内置 6 个阶段（工程骨架 → 词法分析 → 语法分析/AST → 语义分析/符号表 → 代码生成 → 综合扩展），每阶段含任务目标、接口契约、由浅入深的提示与验收标准。
- **代码编辑器**：内置 VS Code 同款 Monaco 编辑器（C 语法高亮），多文件页签、文件树管理。
- **AI 老师**：接入 DeepSeek API，三个快捷动作 + 自由提问：
  - 🧩 拆分当前任务
  - 💡 给点提示
  - 🔍 评判我的代码
- **一键编译测试**：自动编译你写的编译器，再运行当前阶段的测试用例（token 比对 / AST 比对 / 运行退出码 / 报错检查），实时显示差异。
- **内置 gcc 工具链**：随应用分发便携版 MinGW-w64（w64devkit，含 gcc/as/ld/make），无需安装即可「编译并测试」；也可检测系统 gcc/clang 并在设置里切换。
- **起始模板 + 参考实现**：`starter/` 提供 C 工程骨架与完整参考实现 `mycc.c`（卡住时可对照）。

## 技术栈

- Electron + React + TypeScript + Vite
- Monaco Editor（离线打包，无 CDN 依赖）
- DeepSeek API（OpenAI 兼容，流式输出）

## 开发运行

```bash
npm install
npm run dev        # 启动 Vite + Electron（开发模式）
```

打包分发（可选）：

```bash
npm run dist       # 用 electron-builder 生成安装包到 release/
```

> 注意：内置 gcc 工具链（`vendor/`，约 500MB）不提交进 git，本地或 CI 首次构建前先运行
> `./scripts/download-w64devkit.ps1` 下载它。

## CI 打包与发布（GitHub Actions）

- 推送到 `main` 或发起 PR：`.github/workflows/build.yml` 会自动做类型检查、构建安装包，并把产物上传为 Artifact。
- 推送 `v*` 标签（如 `git tag v0.1.0 && git push origin v0.1.0`）或手动触发 workflow：`.github/workflows/release.yml` 会构建 Windows 安装包并**自动发布 GitHub Release**。

```bash
git tag v0.1.0
git push origin v0.1.0   # 触发 Release
```

## 使用步骤

1. 启动后点 **⚙ 设置** 填入 DeepSeek API Key（`platform.deepseek.com` 获取，仅存本机）。
2. 点 **选择工程目录**，再点 **初始化起始模板**（把 `starter/` 骨架复制进去）。
3. 应用已内置 gcc 工具链，开箱即可「编译并测试」；若想用系统 gcc 可在设置里指定路径。
4. 跟着左侧 **课程路线** 从阶段 1 开始，在编辑器中写 `src/lexer.c`、`src/parser.c`、`src/codegen.c`。
5. 随时点 **▶ 编译并测试** 看测试结果；卡住时点 **💡 给点提示** 或 **🔍 评判我的代码**。

## 你的编译器（mycc）命令行接口

```
mycc -t <file.c>   输出词法单元
mycc -a <file.c>   输出抽象语法树（S 表达式）
mycc <file.c>      输出 x86-64 AT&T 汇编
mycc --version     输出 "mycc 0.1.0"
```

## 目录结构

```
c-compiler-trainer/
├── electron/          主进程（工具链检测、文件管理、编译测试、AI 流式调用）
├── src/               渲染层（React UI + 课程数据 + AI 提示词）
│   ├── lib/curriculum.ts   内置课程与测试用例
│   ├── lib/ai-prompts.ts   AI 老师提示词
│   └── components/         UI 组件
├── starter/           复制给用户的起始工程（C 骨架 + 参考实现）
└── package.json
```
