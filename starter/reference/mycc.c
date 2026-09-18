/*
 * mycc —— 一个极简 C 子集编译器（参考实现）
 *
 * 支持的子集：
 *   - 类型：int（仅局部变量）
 *   - 语句：局部变量声明、赋值、return、if/else、while、for、块 {}
 *   - 表达式：+ - * / %、一元 - ! ~、比较 == != < <= > >=、逻辑 && ||（短路）
 *   - 程序结构：单个 main 函数，无参数，无函数调用
 *
 * 命令行接口：
 *   mycc -t <file.c>   输出词法单元
 *   mycc -a <file.c>   输出抽象语法树（S 表达式）
 *   mycc <file.c>      输出 x86-64 AT&T 汇编（到 stdout）
 *   mycc --version     输出 "mycc 0.1.0"
 *
 * 构建：gcc -o mycc mycc.c
 * 运行测试：mycc test.c > test.s && gcc test.s -o test.exe && ./test.exe
 *   程序的 `return N;` 即为进程退出码 N。
 */

#include <ctype.h>
#include <stdarg.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* ------------------------------------------------------------------ */
/* 错误处理                                                            */
/* ------------------------------------------------------------------ */
static void error(char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vfprintf(stderr, fmt, ap);
  fprintf(stderr, "\n");
  va_end(ap);
  exit(1);
}

/* ------------------------------------------------------------------ */
/* 词法分析                                                            */
/* ------------------------------------------------------------------ */
typedef enum {
  TK_IDENT,   /* 标识符 */
  TK_NUM,     /* 整数    */
  TK_STR,     /* 字符串  */
  TK_KEYWORD, /* 关键字  */
  TK_PUNCT,   /* 运算符/标点 */
  TK_EOF,     /* 结束    */
} TokenKind;

typedef struct Token Token;
struct Token {
  TokenKind kind;
  Token *next;
  char *str; /* 词素文本 */
  int val;   /* TK_NUM 的数值 */
};

static const char *kind_name(TokenKind k) {
  switch (k) {
    case TK_IDENT: return "IDENT";
    case TK_NUM: return "NUM";
    case TK_STR: return "STR";
    case TK_KEYWORD: return "KEYWORD";
    case TK_PUNCT: return "PUNCT";
    case TK_EOF: return "EOF";
  }
  return "?";
}

/* 复制 start 的前 len 个字节（自带结尾 '\0'），不依赖 strndup 的 POSIX 扩展 */
static char *copy_n(const char *start, int len) {
  char *s = malloc(len + 1);
  memcpy(s, start, len);
  s[len] = '\0';
  return s;
}

static Token *new_token(TokenKind kind, char *start, int len) {
  Token *tok = calloc(1, sizeof(Token));
  tok->kind = kind;
  tok->str = copy_n(start, len);
  return tok;
}

static bool startswith(char *p, const char *q) {
  return strncmp(p, q, strlen(q)) == 0;
}

static bool is_ident1(char c) { return isalpha((unsigned char)c) || c == '_'; }
static bool is_ident2(char c) { return isalnum((unsigned char)c) || c == '_'; }

static bool is_keyword(const char *s, int len) {
  static const char *kw[] = {"int", "return", "if", "else", "while", "for"};
  for (int i = 0; i < (int)(sizeof(kw) / sizeof(kw[0])); i++) {
    if ((int)strlen(kw[i]) == len && strncmp(s, kw[i], len) == 0) return true;
  }
  return false;
}

/* 多字符运算符，按从长到短尝试 */
static const char *multi_ops[] = {"==", "!=", "<=", ">=", "&&", "||"};

static Token *lex(char *input) {
  char *p = input;
  /* 跳过 UTF-8 BOM（某些 Windows 编辑器会写入 EF BB BF） */
  if ((unsigned char)p[0] == 0xEF && (unsigned char)p[1] == 0xBB && (unsigned char)p[2] == 0xBF) {
    p += 3;
  }
  Token head = {0};
  Token *cur = &head;

  while (*p) {
    /* 空白 */
    if (isspace((unsigned char)*p)) {
      p++;
      continue;
    }
    /* 行注释 */
    if (startswith(p, "//")) {
      p += 2;
      while (*p && *p != '\n') p++;
      continue;
    }
    /* 块注释 */
    if (startswith(p, "/*")) {
      char *q = strstr(p + 2, "*/");
      if (!q) error("未闭合的块注释");
      p = q + 2;
      continue;
    }
    /* 数字 */
    if (isdigit((unsigned char)*p)) {
      char *start = p;
      cur = cur->next = new_token(TK_NUM, start, 0);
      cur->val = (int)strtol(p, &p, 10);
      cur->str = copy_n(start, p - start);
      continue;
    }
    /* 标识符 / 关键字 */
    if (is_ident1(*p)) {
      char *start = p;
      while (is_ident2(*p)) p++;
      TokenKind k = is_keyword(start, p - start) ? TK_KEYWORD : TK_IDENT;
      cur = cur->next = new_token(k, start, p - start);
      continue;
    }
    /* 字符串字面量 */
    if (*p == '"') {
      char *start = ++p;
      while (*p && *p != '"') p++;
      if (!*p) error("未闭合的字符串");
      cur = cur->next = new_token(TK_STR, start, p - start);
      p++; /* 跳过右引号 */
      continue;
    }
    /* 多字符运算符 */
    bool matched = false;
    for (int i = 0; i < (int)(sizeof(multi_ops) / sizeof(multi_ops[0])); i++) {
      if (startswith(p, multi_ops[i])) {
        cur = cur->next = new_token(TK_PUNCT, p, (int)strlen(multi_ops[i]));
        p += strlen(multi_ops[i]);
        matched = true;
        break;
      }
    }
    if (matched) continue;
    /* 单字符标点 */
    if (strchr("+-*/%(){};=<>!,~", *p)) {
      cur = cur->next = new_token(TK_PUNCT, p, 1);
      p++;
      continue;
    }
    error("无法识别的字符: '%c'", *p);
  }
  cur = cur->next = new_token(TK_EOF, p, 0);
  return head.next;
}

/* ------------------------------------------------------------------ */
/* 语法分析 + AST                                                      */
/* ------------------------------------------------------------------ */
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

static Node *new_node(NodeKind kind) {
  Node *n = calloc(1, sizeof(Node));
  n->kind = kind;
  return n;
}

static Node *new_num(int val) {
  Node *n = new_node(ND_NUM);
  n->val = val;
  return n;
}

static Node *new_bin(char *op, Node *lhs, Node *rhs) {
  Node *n = new_node(ND_BIN);
  n->name = op;
  n->lhs = lhs;
  n->rhs = rhs;
  return n;
}

static Node *new_unary(char *op, Node *expr) {
  Node *n = new_node(ND_UNARY);
  n->name = op;
  n->expr = expr;
  return n;
}

/* ------------------------------------------------------------------ */
/* 符号表（作用域栈）                                                  */
/* ------------------------------------------------------------------ */
typedef struct Var Var;
struct Var {
  char *name;
  int offset;
  Var *next;
};

typedef struct Scope Scope;
struct Scope {
  Var *vars;
  Scope *prev;
};

static Scope *scope = NULL;
static int lvar_count = 0;

static void enter_scope(void) {
  Scope *s = calloc(1, sizeof(Scope));
  s->prev = scope;
  scope = s;
}

static void leave_scope(void) { scope = scope->prev; }

static Var *find_var(char *name) {
  for (Scope *s = scope; s; s = s->prev) {
    for (Var *v = s->vars; v; v = v->next) {
      if (strcmp(v->name, name) == 0) return v;
    }
  }
  return NULL;
}

static Var *declare_var(char *name) {
  for (Var *v = scope->vars; v; v = v->next) {
    if (strcmp(v->name, name) == 0) error("error: redeclared variable '%s'", name);
  }
  Var *v = calloc(1, sizeof(Var));
  v->name = name;
  v->offset = (++lvar_count) * 8;
  v->next = scope->vars;
  scope->vars = v;
  return v;
}

/* ------------------------------------------------------------------ */
/* 解析器                                                              */
/* ------------------------------------------------------------------ */
static Token *token; /* 当前 token */

static bool equal(Token *tok, const char *op) {
  return tok && strcmp(tok->str, op) == 0;
}

static bool consume(const char *op) {
  if (equal(token, op)) {
    token = token->next;
    return true;
  }
  return false;
}

static Token *expect(const char *op) {
  if (!equal(token, op)) error("期望 '%s'，但得到 '%s'", op, token ? token->str : "(null)");
  return token = token->next;
}

static Token *expect_ident(void) {
  if (!token || token->kind != TK_IDENT) error("期望标识符");
  Token *t = token;
  token = token->next;
  return t;
}

static bool at_eof(void) { return token && token->kind == TK_EOF; }

/* 前向声明 */
static Node *stmt(void);
static Node *expr(void);
static Node *assign(void);
static Node *block(void);

static Node *primary(void) {
  if (consume("(")) {
    Node *n = expr();
    expect(")");
    return n;
  }
  if (token && token->kind == TK_NUM) {
    Node *n = new_num(token->val);
    token = token->next;
    return n;
  }
  if (token && token->kind == TK_STR) {
    Node *n = new_node(ND_STR);
    n->name = token->str;
    token = token->next;
    return n;
  }
  if (token && token->kind == TK_IDENT) {
    Var *v = find_var(token->str);
    if (!v) error("error: undefined variable '%s'", token->str);
    Node *n = new_node(ND_VAR);
    n->name = token->str;
    n->offset = v->offset;
    token = token->next;
    return n;
  }
  error("期望表达式，但得到 '%s'", token ? token->str : "(null)");
  return NULL;
}

static Node *unary(void) {
  if (equal(token, "-") || equal(token, "!") || equal(token, "~")) {
    char *op = token->str;
    token = token->next;
    return new_unary(op, unary());
  }
  return primary();
}

static Node *mul(void) {
  Node *n = unary();
  for (;;) {
    if (equal(token, "*") || equal(token, "/") || equal(token, "%")) {
      char *op = token->str;
      token = token->next;
      n = new_bin(op, n, unary());
    } else {
      return n;
    }
  }
}

static Node *add(void) {
  Node *n = mul();
  for (;;) {
    if (equal(token, "+") || equal(token, "-")) {
      char *op = token->str;
      token = token->next;
      n = new_bin(op, n, mul());
    } else {
      return n;
    }
  }
}

static Node *rel(void) {
  Node *n = add();
  for (;;) {
    if (equal(token, "<") || equal(token, "<=") || equal(token, ">") || equal(token, ">=")) {
      char *op = token->str;
      token = token->next;
      n = new_bin(op, n, add());
    } else {
      return n;
    }
  }
}

static Node *eq(void) {
  Node *n = rel();
  for (;;) {
    if (equal(token, "==") || equal(token, "!=")) {
      char *op = token->str;
      token = token->next;
      n = new_bin(op, n, rel());
    } else {
      return n;
    }
  }
}

static Node *logand(void) {
  Node *n = eq();
  for (;;) {
    if (equal(token, "&&")) {
      token = token->next;
      n = new_bin("&&", n, eq());
    } else {
      return n;
    }
  }
}

static Node *logor(void) {
  Node *n = logand();
  for (;;) {
    if (equal(token, "||")) {
      token = token->next;
      n = new_bin("||", n, logand());
    } else {
      return n;
    }
  }
}

static Node *assign(void) {
  Node *n = logor();
  if (equal(token, "=")) {
    token = token->next;
    if (n->kind != ND_VAR) error("赋值目标必须是变量");
    Node *a = new_node(ND_ASSIGN);
    a->name = n->name;
    a->offset = n->offset;
    a->lhs = n;
    a->rhs = assign();
    return a;
  }
  return n;
}

static Node *expr(void) { return assign(); }

static Node *decl(void) {
  /* 已消费关键字 "int" */
  Token *t = expect_ident();
  Var *v = declare_var(t->str);
  Node *n = new_node(ND_DECL);
  n->name = t->str;
  n->offset = v->offset;
  if (consume("=")) n->rhs = expr();
  expect(";");
  return n;
}

static Node *stmt(void) {
  if (consume("return")) {
    Node *n = new_node(ND_RETURN);
    if (!equal(token, ";")) n->expr = expr();
    expect(";");
    return n;
  }
  if (consume("if")) {
    Node *n = new_node(ND_IF);
    expect("(");
    n->cond = expr();
    expect(")");
    n->then = stmt();
    if (consume("else")) n->els = stmt();
    return n;
  }
  if (consume("while")) {
    Node *n = new_node(ND_WHILE);
    expect("(");
    n->cond = expr();
    expect(")");
    n->body = stmt();
    return n;
  }
  if (consume("for")) {
    Node *n = new_node(ND_FOR);
    expect("(");
    if (!equal(token, ";")) n->init = expr();
    expect(";");
    if (!equal(token, ";")) n->cond = expr();
    expect(";");
    if (!equal(token, ")")) n->inc = expr();
    expect(")");
    n->body = stmt();
    return n;
  }
  if (consume("int")) return decl();
  if (consume("{")) return block();
  /* 表达式语句 */
  Node *e = expr();
  expect(";");
  return e;
}

static Node *block(void) {
  Node head = {0};
  Node *cur = &head;
  enter_scope();
  while (!equal(token, "}") && !at_eof()) {
    cur = cur->next = stmt();
  }
  expect("}");
  leave_scope();
  Node *n = new_node(ND_BLOCK);
  n->body = head.next;
  return n;
}

static Node *program(void) {
  expect("int");
  Token *name = expect_ident();
  expect("(");
  expect(")");
  expect("{"); /* 消费函数体的左花括号，block() 内部不再消费 */
  Node *body = block();
  Node *fn = new_node(ND_FUNC);
  fn->name = name->str;
  fn->body = body;
  return fn;
}

static Node *parse(Token *tok) {
  token = tok;
  return program();
}

/* ------------------------------------------------------------------ */
/* AST 打印                                                            */
/* ------------------------------------------------------------------ */
static void dump_ast(Node *n) {
  if (!n) {
    printf("nil");
    return;
  }
  switch (n->kind) {
    case ND_NUM:
      printf("(num %d)", n->val);
      return;
    case ND_VAR:
      printf("(var %s)", n->name);
      return;
    case ND_STR:
      printf("(str %s)", n->name);
      return;
    case ND_ASSIGN:
      printf("(assign %s ", n->name);
      dump_ast(n->rhs);
      printf(")");
      return;
    case ND_BIN:
      printf("(bin %s ", n->name);
      dump_ast(n->lhs);
      printf(" ");
      dump_ast(n->rhs);
      printf(")");
      return;
    case ND_UNARY:
      printf("(unary %s ", n->name);
      dump_ast(n->expr);
      printf(")");
      return;
    case ND_RETURN:
      printf("(return");
      if (n->expr) {
        printf(" ");
        dump_ast(n->expr);
      }
      printf(")");
      return;
    case ND_BLOCK:
      printf("(block");
      for (Node *c = n->body; c; c = c->next) {
        printf(" ");
        dump_ast(c);
      }
      printf(")");
      return;
    case ND_DECL:
      printf("(decl int %s", n->name);
      if (n->rhs) {
        printf(" ");
        dump_ast(n->rhs);
      }
      printf(")");
      return;
    case ND_IF:
      printf("(if ");
      dump_ast(n->cond);
      printf(" ");
      dump_ast(n->then);
      if (n->els) {
        printf(" ");
        dump_ast(n->els);
      }
      printf(")");
      return;
    case ND_WHILE:
      printf("(while ");
      dump_ast(n->cond);
      printf(" ");
      dump_ast(n->body);
      printf(")");
      return;
    case ND_FOR:
      printf("(for ");
      dump_ast(n->init);
      printf(" ");
      dump_ast(n->cond);
      printf(" ");
      dump_ast(n->inc);
      printf(" ");
      dump_ast(n->body);
      printf(")");
      return;
    case ND_FUNC:
      printf("(func %s ", n->name);
      dump_ast(n->body);
      printf(")");
      return;
  }
}

/* ------------------------------------------------------------------ */
/* 代码生成（x86-64 AT&T 汇编）                                        */
/* ------------------------------------------------------------------ */
static int label_counter = 0;

static int new_label(void) { return label_counter++; }

static void gen(Node *n);

static void gen_expr(Node *n) {
  switch (n->kind) {
    case ND_NUM:
      printf("  movl $%d, %%eax\n", n->val);
      return;
    case ND_VAR:
      printf("  movl -%d(%%rbp), %%eax\n", n->offset);
      return;
    case ND_ASSIGN:
      gen_expr(n->rhs);
      printf("  movl %%eax, -%d(%%rbp)\n", n->offset);
      return;
    case ND_UNARY:
      gen_expr(n->expr);
      if (strcmp(n->name, "-") == 0) {
        printf("  negl %%eax\n");
      } else if (strcmp(n->name, "!") == 0) {
        printf("  cmpl $0, %%eax\n  setne %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, "~") == 0) {
        printf("  notl %%eax\n");
      }
      return;
    case ND_BIN: {
      if (strcmp(n->name, "&&") == 0) {
        int l = new_label();
        gen_expr(n->lhs);
        printf("  cmpl $0, %%eax\n  je .L.false.%d\n", l);
        gen_expr(n->rhs);
        printf("  cmpl $0, %%eax\n  je .L.false.%d\n  movl $1, %%eax\n  jmp .L.end.%d\n", l, l);
        printf(".L.false.%d:\n  movl $0, %%eax\n.L.end.%d:\n", l, l);
        return;
      }
      if (strcmp(n->name, "||") == 0) {
        int l = new_label();
        gen_expr(n->lhs);
        printf("  cmpl $0, %%eax\n  jne .L.true.%d\n", l);
        gen_expr(n->rhs);
        printf("  cmpl $0, %%eax\n  jne .L.true.%d\n  movl $0, %%eax\n  jmp .L.end.%d\n", l, l);
        printf(".L.true.%d:\n  movl $1, %%eax\n.L.end.%d:\n", l, l);
        return;
      }
      gen_expr(n->lhs);
      printf("  push %%rax\n");
      gen_expr(n->rhs);
      printf("  movl %%eax, %%edi\n");
      printf("  pop %%rax\n");
      if (strcmp(n->name, "+") == 0) {
        printf("  addl %%edi, %%eax\n");
      } else if (strcmp(n->name, "-") == 0) {
        printf("  subl %%edi, %%eax\n");
      } else if (strcmp(n->name, "*") == 0) {
        printf("  imull %%edi, %%eax\n");
      } else if (strcmp(n->name, "/") == 0) {
        printf("  cqto\n  idivl %%edi\n");
      } else if (strcmp(n->name, "%") == 0) {
        printf("  cqto\n  idivl %%edi\n  movl %%edx, %%eax\n");
      } else if (strcmp(n->name, "==") == 0) {
        printf("  cmpl %%edi, %%eax\n  sete %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, "!=") == 0) {
        printf("  cmpl %%edi, %%eax\n  setne %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, "<") == 0) {
        printf("  cmpl %%edi, %%eax\n  setl %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, "<=") == 0) {
        printf("  cmpl %%edi, %%eax\n  setle %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, ">") == 0) {
        printf("  cmpl %%edi, %%eax\n  setg %%al\n  movzbl %%al, %%eax\n");
      } else if (strcmp(n->name, ">=") == 0) {
        printf("  cmpl %%edi, %%eax\n  setge %%al\n  movzbl %%al, %%eax\n");
      }
      return;
    }
    default:
      error("不支持的表达式节点类型 %d", n->kind);
  }
}

static void gen(Node *n) {
  switch (n->kind) {
    case ND_NUM:
    case ND_VAR:
    case ND_ASSIGN:
    case ND_UNARY:
    case ND_BIN:
      gen_expr(n);
      return;
    case ND_RETURN:
      if (n->expr) gen_expr(n->expr);
      else printf("  movl $0, %%eax\n");
      printf("  jmp .L.return\n");
      return;
    case ND_BLOCK:
      for (Node *c = n->body; c; c = c->next) gen(c);
      return;
    case ND_DECL:
      if (n->rhs) {
        gen_expr(n->rhs);
        printf("  movl %%eax, -%d(%%rbp)\n", n->offset);
      }
      return;
    case ND_IF: {
      int l = new_label();
      gen_expr(n->cond);
      printf("  cmpl $0, %%eax\n  je .L.else.%d\n", l);
      gen(n->then);
      printf("  jmp .L.end.%d\n", l);
      printf(".L.else.%d:\n", l);
      if (n->els) gen(n->els);
      printf(".L.end.%d:\n", l);
      return;
    }
    case ND_WHILE: {
      int l = new_label();
      printf(".L.begin.%d:\n", l);
      gen_expr(n->cond);
      printf("  cmpl $0, %%eax\n  je .L.end.%d\n", l);
      gen(n->body);
      printf("  jmp .L.begin.%d\n", l);
      printf(".L.end.%d:\n", l);
      return;
    }
    case ND_FOR: {
      int l = new_label();
      if (n->init) gen_expr(n->init);
      printf(".L.begin.%d:\n", l);
      if (n->cond) {
        gen_expr(n->cond);
        printf("  cmpl $0, %%eax\n  je .L.end.%d\n", l);
      }
      gen(n->body);
      printf(".L.inc.%d:\n", l);
      if (n->inc) gen_expr(n->inc);
      printf("  jmp .L.begin.%d\n", l);
      printf(".L.end.%d:\n", l);
      return;
    }
    case ND_FUNC: {
      int frame = (lvar_count * 8 + 15) & ~15;
      printf(".text\n.globl main\nmain:\n");
      printf("  push %%rbp\n  movq %%rsp, %%rbp\n");
      if (frame > 0) printf("  subq $%d, %%rsp\n", frame);
      gen(n->body);
      printf(".L.return:\n");
      printf("  movq %%rbp, %%rsp\n  pop %%rbp\n  ret\n");
      return;
    }
    default:
      error("不支持的语句节点类型 %d", n->kind);
  }
}

static void codegen(Node *prog) { gen(prog); }

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */
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
      else printf("%s '%s'\n", kind_name(t->kind), t->str);
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
