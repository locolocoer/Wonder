# Wonder —— 起始工程（C 编译器）

欢迎！你将在这里用 C 语言从零实现一个 **C 子集编译器**（输出 x86-64 AT&T 汇编）。
AI 老师会帮你拆分任务、给提示、评判你的实现。

## 目录结构

```
starter/
├── src/
│   ├── main.c       入口（已完成：参数解析、文件读取、分发）
│   ├── token.h      词法单元定义（已完成）
│   ├── lexer.h/c    词法分析（待实现）
│   ├── parser.h/c   语法分析 + AST + 符号表（待实现）
│   └── codegen.h/c  代码生成（待实现）
├── reference/
│   └── mycc.c       完整参考实现（卡住时可对照，但先自己动手！）
├── tests/           一些可手动运行的示例程序
├── build.bat        Windows 一键构建
└── Makefile         MinGW make 构建
```

## 你的编译器（mycc）命令行接口

```
mycc -t <file.c>   输出词法单元（token dump）
mycc -a <file.c>   输出抽象语法树（S 表达式）
mycc <file.c>      输出 x86-64 AT&T 汇编（到 stdout）
mycc --version     输出 "mycc 0.1.0"
```

## 构建与运行（命令行手动操作）

```bat
:: Windows（MinGW-w64）
build.bat

:: 查看词法
mycc -t tests\hello.c

:: 生成汇编并运行（验证退出码）
mycc tests\hello.c > out.s
gcc out.s -o out.exe
out.exe
echo 退出码: %errorlevel%
```

## 环境要求

- **无需自行安装编译器**：Wonder 应用已内置便携版 gcc（w64devkit，含 gcc/as/ld/make），开箱即可「编译并测试」。
- （可选）若想用系统 gcc/clang，可在应用「设置 → 工具链」里指定路径；命令行手动构建时则需 gcc（应用内置的即可）。

## 学习路径（课程路线）

1. 工程骨架与命令行 → `mycc --version` 输出 `mycc 0.1.0`
2. 词法分析 → `mycc -t` 输出 token 序列
3. 语法分析 + AST → `mycc -a` 输出 S 表达式
4. 语义分析与符号表 → 未定义变量/重复声明报错
5. 代码生成 → 输出汇编，程序 `return N;` 即退出码 N
6. 综合练习与扩展

> 提示：`reference/mycc.c` 是完整参考实现，建议先自己思考、实现、跑测试，卡住时再对照。
