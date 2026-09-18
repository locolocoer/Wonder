#include "lexer.h"
#include <ctype.h>
#include <stdlib.h>
#include <string.h>

const char *token_kind_name(TokenKind k) {
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

/*
 * TODO（阶段 2：词法分析）
 *
 * 实现 lex()，把 input 里的字符流切分成 token 链表。要点：
 *   1. 跳过空白（空格/制表/换行）。
 *   2. 跳过注释：// 到行尾；/* ... * / 到结束（加分项）。
 *   3. 数字：isdigit 开头，用 strtol 解析成 TK_NUM，str 存原文。
 *   4. 标识符/关键字：字母或下划线开头，随后是字母/数字/下划线；
 *      查关键字表（int return if else while for）区分 TK_KEYWORD / TK_IDENT。
 *   5. 多字符运算符要先于单字符判断：== != <= >= && ||。
 *   6. 单字符标点：+ - * / % ( ) { } ; = < > ! , ~
 *   7. 字符串字面量（加分项）："..." 存 TK_STR，str 为引号内文本。
 *   8. 末尾追加一个 TK_EOF。
 *
 * 打印格式（-t）：每行 KIND 'text'，最后一行 EOF，例如：
 *     KEYWORD 'int'
 *     IDENT 'main'
 *     PUNCT '('
 *     ...
 *     EOF
 *
 * 每个 token 的 str 用 strndup/malloc 分配，val 只对 TK_NUM 有效。
 */
Token *lex(char *input) {
  (void)input;
  /* 临时实现：只返回一个 EOF，让工程能先编译通过。
     完成本阶段后替换为完整实现。 */
  Token *t = calloc(1, sizeof(Token));
  t->kind = TK_EOF;
  t->str = strdup("");
  return t;
}
