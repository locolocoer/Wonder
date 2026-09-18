#ifndef PARSER_H
#define PARSER_H

#include "token.h"

/* AST 节点类型 */
typedef enum {
  ND_NUM,     /* 整数        */
  ND_VAR,     /* 变量        */
  ND_STR,     /* 字符串      */
  ND_ASSIGN,  /* 赋值        */
  ND_BIN,     /* 二元运算    */
  ND_UNARY,   /* 一元运算    */
  ND_RETURN,  /* return      */
  ND_BLOCK,   /* 块 {}       */
  ND_DECL,    /* 局部变量声明 */
  ND_IF,      /* if          */
  ND_WHILE,   /* while       */
  ND_FOR,     /* for         */
  ND_FUNC,    /* 函数        */
} NodeKind;

typedef struct Node Node;
struct Node {
  NodeKind kind;
  Node *next; /* 语句链表 / 函数体 */
  Node *lhs, *rhs;
  Node *cond, *then, *els, *init, *inc;
  Node *body, *expr;
  char *name; /* 变量名 / 函数名 / 运算符 */
  int val;    /* 数值 */
  int offset; /* 局部变量的栈偏移 */
};

/* 把 token 链表解析成 AST，返回根节点（ND_FUNC）。 */
Node *parse(Token *tok);

/* 打印 AST 的 S 表达式（供 -a 使用）。 */
void dump_ast(Node *n);

#endif
