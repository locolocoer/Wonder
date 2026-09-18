# Dojo —— AI 陪练式项目编程训练器

一个 **AI 陪练式**桌面软件：陪你从零实现一个个真实软件项目（首个项目：用 C 写一个编译器，输出 x86-64 汇编），
由大模型（DeepSeek）充当老师，帮你**拆分任务、逐步给提示、评判你的实现**。

## 为什么叫 Dojo

「Dojo（道场）」源自日语，指练武、修行、传授技艺的道馆——一个**师徒相传、以练代学**的场域：

- **有师傅**：道场里有师傅（Sensei）指点徒弟，正如这里由大模型当老师，只给提示、不下场代打；
- **靠练习**：武术不是听会的，是练会的。编程也一样——代码得你自己写，编译器得你自己实现，AI 只负责拆任务、给反馈；
- **重道**：中文的「道」也有「方法、路径」之意（如「求道」「得道」），呼应我们追求的是掌握一套**可迁移的工程方法论**，而不是背会某个具体项目。

所以「Dojo」= 一个由 AI 当师傅、你亲手练、练出真本事的地方。编译器只是道场里的第一课，后面还会有更多项目。

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
- 推送 `v*` 标签（如 `git tag v0.1.0 && git push origin v0.1.0`）或手动触发 workflow：`.github/workflows/release.yml` 会构建 Windows 安装包、发布 GitHub Release，并同步到阿里云 OSS。

```bash
git tag v0.1.0
git push origin v0.1.0   # 触发 Release
```

## 阿里云 OSS 发布 + 自动更新

安装包通过 [electron-updater](https://www.electron.build/auto-update) 自动更新，主源为阿里云 OSS（bucket `fryappstore`，目录 `dojo/`），OSS 不可用时自动回退 GitHub Releases。

需要在仓库 `Settings → Secrets and variables → Actions` 配置：

| 名称 | 位置 | 说明 |
|---|---|---|
| `OSS_ACCESS_KEY_ID` | Secrets | 阿里云 AccessKey ID（对 `fryappstore` 桶有写权限） |
| `OSS_ACCESS_KEY_SECRET` | Secrets | 阿里云 AccessKey Secret |
| `OSS_BUCKET` | Variables | 默认 `fryappstore` |
| `OSS_ENDPOINT` | Variables | 默认 `oss-cn-beijing.aliyuncs.com`（按桶所在区域改） |

发布后产物结构（OSS 桶内 `dojo/` 目录）：

```
dojo/latest.yml                      # 稳定更新指针
dojo/v0.1.0/Dojo-0.1.0-setup.exe     # 安装包
dojo/v0.1.0/Dojo-0.1.0-setup.exe.blockmap
```

要点：
- 桶内 `dojo/` 目录需允许**匿名读取**（公共读），否则客户端下载 403、只能回退 GitHub。
- 发新版本：改 `package.json` 的 `version` 后打新 tag，`latest.yml` 会指向新版本。
- 客户端更新源可用环境变量 `DOJO_UPDATE_MIRROR` 覆盖（完整 URL）。

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
