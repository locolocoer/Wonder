/*
 * mycc —— C 子集编译器（你的实现）
 *
 * 这是编译器的入口。这里已经帮你搭好了命令行参数解析、文件读取与分发，
 * 你只需依次完成 lexer.c（词法）、parser.c（语法/符号表）、codegen.c（代码生成）。
 *
 * 命令行接口：
 *   mycc -t <file.c>   输出词法单元
 *   mycc -a <file.c>   输出抽象语法树
 *   mycc <file.c>      输出 x86-64 AT&T 汇编
 *   mycc --version     输出 "mycc 0.1.0"
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "lexer.h"
#include "parser.h"
#include "codegen.h"

static char *read_file(const char *path) {
  FILE *fp = fopen(path, "rb");
  if (!fp) {
    fprintf(stderr, "无法打开文件: %s\n", path);
    exit(1);
  }
  fseek(fp, 0, SEEK_END);
  long size = ftell(fp);
  fseek(fp, 0, SEEK_SET);
  char *buf = malloc(size + 2);
  if (fread(buf, 1, size, fp) != (size_t)size) {
    fprintf(stderr, "读取文件失败: %s\n", path);
    exit(1);
  }
  buf[size] = '\0';
  buf[size + 1] = '\0';
  fclose(fp);
  return buf;
}

int main(int argc, char **argv) {
  if (argc >= 2 && (strcmp(argv[1], "--version") == 0 || strcmp(argv[1], "-v") == 0)) {
    printf("mycc 0.1.0\n");
    return 0;
  }
  if (argc >= 2 && (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0)) {
    printf("用法: mycc [-t|-a] <file.c>\n");
    return 0;
  }

  int mode = 0; /* 0=汇编 1=词法 2=AST */
  const char *srcfile = NULL;
  for (int i = 1; i < argc; i++) {
    if (strcmp(argv[i], "-t") == 0) mode = 1;
    else if (strcmp(argv[i], "-a") == 0) mode = 2;
    else if (argv[i][0] == '-') {
      fprintf(stderr, "未知选项: %s\n", argv[i]);
      return 1;
    } else {
      srcfile = argv[i];
    }
  }
  if (!srcfile) {
    fprintf(stderr, "用法: mycc [-t|-a] <file.c>\n");
    return 1;
  }

  char *src = read_file(srcfile);
  Token *tok = lex(src);

  if (mode == 1) {
    for (Token *t = tok; t; t = t->next) {
      if (t->kind == TK_EOF) printf("EOF\n");
      else printf("%s '%s'\n", token_kind_name(t->kind), t->str);
    }
    return 0;
  }

  Node *prog = parse(tok);
  if (mode == 2) {
    dump_ast(prog);
    printf("\n");
    return 0;
  }

  codegen(prog);
  return 0;
}
