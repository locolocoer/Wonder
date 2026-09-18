#include "parser.h"
#include <stdio.h>
#include <stdlib.h>

/*
 * TODO（阶段 3：语法分析，阶段 4：符号表）
 *
 * 用「递归下降」把 token 流解析成 AST。建议的分层（优先级从低到高）：
 *   expr    -> assign
 *   assign  -> logor ("=" assign)?
 *   logor   -> logand ("||" logand)*
 *   logand  -> eq ("&&" eq)*
 *   eq      -> rel ("==" rel | "!=" rel)*
 *   rel     -> add ("<" add | "<=" add | ">" add | ">=" add)*
 *   add     -> mul ("+" mul | "-" mul)*
 *   mul     -> unary ("*" unary | "/" unary | "%" unary)*
 *   unary   -> ("-" | "!" | "~") unary | primary
 *   primary -> "(" expr ")" | 数字 | 标识符 | 字符串
 *
 * 语句：
 *   stmt -> "return" expr? ";"
 *         | "if" "(" expr ")" stmt ("else" stmt)?
 *         | "while" "(" expr ")" stmt
 *         | "for" "(" expr? ";" expr? ";" expr? ")" stmt
 *         | "int" 标识符 ("=" expr)? ";"      // 局部变量声明
 *         | "{" stmt* "}"
 *         | expr ";"                          // 表达式语句（如 x = 3;）
 *
 * 符号表（阶段 4）：
 *   - 维护作用域栈，进入 {} push、离开 pop；
 *   - declare_var 在「当前作用域」查重，重复则报错 "redeclared"；
 *   - 用标识符时逐层向外 find_var，找不到报错 "undefined variable"；
 *   - 为每个局部变量分配栈偏移 offset（如 (++count) * 8）。
 *
 * dump_ast 打印 S 表达式（-a），格式见课程契约，例如：
 *   (func main (block (return (num 42))))
 */
Node *parse(Token *tok) {
  (void)tok;
  /* 临时实现：返回 NULL。完成本阶段后替换为完整递归下降解析器。 */
  return NULL;
}

void dump_ast(Node *n) {
  if (!n) {
    printf("(nil)");
    return;
  }
  /* TODO：按节点类型递归打印 S 表达式，见参考实现或课程契约。 */
  printf("(nil)");
}
