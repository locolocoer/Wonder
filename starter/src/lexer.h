#ifndef LEXER_H
#define LEXER_H

#include "token.h"

/* 把源码字符串切分成 token 链表，返回链表头。 */
Token *lex(char *input);

/* 返回 token 类型名（用于 -t 打印）。 */
const char *token_kind_name(TokenKind k);

#endif
