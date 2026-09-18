#include "codegen.h"
#include <stdio.h>

/*
 * TODO（阶段 5：代码生成）
 *
 * 用「栈机」模型把 AST 翻译成 x86-64 AT&T 汇编，输出到 stdout。要点：
 *
 * 1. 函数序言/尾声：
 *        push %rbp
 *        movq %rsp, %rbp
 *        subq $N, %rsp        ; N 为局部变量栈空间（按 16 对齐）
 *        ... 函数体 ...
 *        movq %rbp, %rsp
 *        pop %rbp
 *        ret
 *
 * 2. 局部变量存在 -offset(%rbp)：读 movl -offset(%rbp), %eax，写 movl %eax, -offset(%rbp)。
 *
 * 3. 表达式求值，结果放 %eax；二元运算用 push/pop 保存左操作数：
 *        gen(左) -> push %rax -> gen(右) -> movl %eax, %edi -> pop %rax
 *        然后 addl %edi,%eax / subl / imull / idivl 等。
 *
 * 4. 除法/取模前 cqto 扩展符号，再 idivl %edi（商在 %eax，余数在 %edx）。
 *
 * 5. 比较：cmpl %edi,%eax 后 sete/setne/setl/setle/setg/setge %al，再 movzbl %al,%eax。
 *
 * 6. 逻辑 && / || 要短路：用 je/jne 跳标签跳过右侧。
 *
 * 7. 控制流用标签：if/else、while、for 都是「条件判断 + 跳转 + 回跳」的组合。
 *
 * 8. return：求值后 jmp 到统一的 .L.return 标签（即尾声）。
 */
void codegen(Node *prog) {
  (void)prog;
  /* 临时实现：什么都不输出。完成本阶段后替换为完整代码生成器。 */
}
