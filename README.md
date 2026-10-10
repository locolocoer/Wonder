# Wonder

AI 陪练式编程训练器：以真实项目为载体（第一个项目是从零实现一个 C 编译器，输出 x86-64 汇编），由大模型担任导师，负责拆分任务、逐步提示、评判实现。

## 功能

- **分阶段课程路线**：内置 6 个阶段（工程骨架 → 词法分析 → 语法分析/AST → 语义分析/符号表 → 代码生成 → 综合扩展），每阶段含任务目标、接口契约、提示与验收标准。
- **编译原理基础教程**：独立「基础」栏目，11 节面向零基础的入门内容（编译器原理、词法/语法/语义/代码生成、x86-64 汇编、工具链等）。
- **代码编辑器**：内置 Monaco 编辑器，C/C++ 语法高亮、多文件页签、文件树、悬停文档、代码补全、Ctrl+点击跳转头文件。
- **AI 导师**：接入 DeepSeek API，支持「拆分当前任务 / 给点提示 / 评判我的代码」三个快捷动作与自由提问，可手动选择要纳入上下文的文件。
- **一键编译测试**：自动编译你写的编译器，再运行当前阶段的测试用例（词法 token / AST / 运行退出码 / 报错检查），实时显示差异。
- **内置工具链**：随应用分发便携版 w64devkit（含 gcc/g++/as/ld/make），无需安装即可「编译并测试」，也可检测系统 gcc/clang 并在设置里切换。
- **起始模板 + 参考实现**：`starter/` 提供 C 与 C++ 双版本工程骨架及参考实现（`mycc.c` / `mycc.cpp`）。
- **终端与版本管理**：内置终端（xterm.js）与 Git 面板（状态、提交、回滚、差异）。
- **SSO 登录**：支持 OIDC 授权码 + PKCE 的启动登录（默认 Auth0），配置写于 `electron/sso-config.js`。
- **自动更新**：主源阿里云 OSS，失败自动回退 GitHub Releases。

## 命名由来

「Wonder」取「好奇」「惊叹」之意，也谐音中文「问道」——向师傅请教、探寻方法。

## 技术栈

- Electron 33 · React 18 · TypeScript · Vite
- Monaco Editor · xterm.js
- DeepSeek API（OpenAI 兼容，流式输出）
- w64devkit 16.2.0（gcc/g++ 便携工具链）

## 快速开始

```bash
npm install
npm run dev        # 启动 Vite + Electron（开发模式）
```

打包分发：

```bash
npm run dist       # electron-builder 生成安装包到 release/
```

> 内置工具链（`vendor/`，约 500MB）不提交进 git，首次构建前先运行
> `./scripts/download-w64devkit.ps1` 下载。

## 编译器（mycc）命令行接口

```
mycc -t <file.c>   输出词法单元
mycc -a <file.c>   输出抽象语法树（S 表达式）
mycc <file.c>      输出 x86-64 AT&T 汇编
mycc --version     输出版本号
```

## 目录结构

```
c-compiler-trainer/
├── electron/              主进程
│   ├── main.js            窗口与 IPC
│   ├── build-runner.js    编译 + 测试流水线
│   ├── term.js            终端会话
│   ├── git.js             git CLI 封装
│   ├── sso.js             OIDC 登录（授权码 + PKCE）
│   └── sso-config.js      SSO 配置（发布前在此填入 Auth0 凭据）
├── src/                   渲染层（React）
│   ├── lib/               curriculum / ai-prompts / c-docs / basics
│   └── components/        UI 组件
├── starter/               复制给用户的起始工程（C/C++ 骨架 + 参考实现）
├── scripts/               构建辅助脚本
└── package.json
```

## 构建与发布

- 推送到 `main` 或发起 PR：`.github/workflows/build.yml` 做类型检查、构建安装包并上传 Artifact。
- 推送 `v*` 标签：`.github/workflows/release.yml` 构建 Windows 安装包、发布 GitHub Release，并同步到阿里云 OSS。

```bash
git tag v0.2.4
git push origin v0.2.4   # 触发 Release
```

### 阿里云 OSS 自动更新

安装包通过 [electron-updater](https://www.electron.build/auto-update) 自动更新，主源为阿里云 OSS（bucket `fryappstore`，目录 `wonder/`），OSS 不可用时回退 GitHub Releases。

需在仓库 `Settings → Secrets and variables → Actions` 配置：

| 名称 | 位置 | 说明 |
|---|---|---|
| `OSS_ACCESS_KEY_ID` | Secrets | 阿里云 AccessKey ID（对 `fryappstore` 桶有写权限） |
| `OSS_ACCESS_KEY_SECRET` | Secrets | 阿里云 AccessKey Secret |
| `OSS_BUCKET` | Variables | 默认 `fryappstore` |
| `OSS_ENDPOINT` | Variables | 默认 `oss-cn-beijing.aliyuncs.com` |

发布后产物结构（OSS 桶内 `wonder/` 目录）：

```
wonder/latest.yml                       # 稳定更新指针
wonder/v0.2.4/Wonder-0.2.4-setup.exe    # 安装包
wonder/v0.2.4/Wonder-0.2.4-setup.exe.blockmap
```

要点：

- 桶内 `wonder/` 目录需允许**匿名读取**（公共读），否则客户端下载 403、只能回退 GitHub。
- 发新版本：改 `package.json` 的 `version` 后打新 tag，`latest.yml` 会指向新版本。
- 客户端更新源可用环境变量 `WONDER_UPDATE_MIRROR` 覆盖。

## 使用流程

1. 若启用了 SSO，启动后先登录。
2. 在 **⚙ 设置** 填入 DeepSeek API Key（`platform.deepseek.com` 获取，仅存本机）。
3. **选择工程目录** → **初始化起始模板**。
4. 在设置里选择实现语言（C 或 C++），跟着 **课程路线** 从阶段 1 开始写 `src/` 下的源码。
5. 随时 **▶ 编译并测试**；卡住时用 **💡 给点提示** 或 **🔍 评判我的代码**。
