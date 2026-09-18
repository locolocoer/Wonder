#ifndef TOKEN_H
#define TOKEN_H

/* 词法单元类型 */
typedef enum {
  TK_IDENT,   /* 标识符，如 main、x */
  TK_NUM,     /* 整数，如 42 */
  TK_STR,     /* 字符串 */
  TK_KEYWORD, /* 关键字，如 int、return */
  TK_PUNCT,   /* 运算符/标点，如 + - == ; */
  TK_EOF,     /* 输入结束 */
} TokenKind;

/* 词法单元：构成一个单向链表 */
typedef struct Token Token;
struct Token {
  TokenKind kind; /* 类型 */
  Token *next;    /* 下一个 token */
  char *str;      /* 词素文本（malloc 分配） */
  int val;        /* TK_NUM 的整数值 */
};

#endif
