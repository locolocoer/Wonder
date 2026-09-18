#ifndef CODEGEN_H
#define CODEGEN_H

#include "parser.h"

/* 把 AST 翻译成 x86-64 AT&T 汇编，输出到 stdout。 */
void codegen(Node *prog);

#endif
