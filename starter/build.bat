@echo off
rem 一键构建脚本（使用 gcc）
where gcc >nul 2>nul || (
  echo [错误] 未找到 gcc。请在应用内「终端」页签运行（内置 gcc 已加入 PATH），
  echo        或安装 MinGW-w64 / MSYS2 并把 gcc 加入 PATH。
  exit /b 1
)
gcc -Wall -o mycc.exe src\main.c src\lexer.c src\parser.c src\codegen.c
if %errorlevel% neq 0 exit /b %errorlevel%
echo [OK] 构建成功: mycc.exe
