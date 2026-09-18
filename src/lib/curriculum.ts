import type { Stage } from '../types';

// 内置课程：一个 C 子集编译器（C → x86-64 汇编）的完整实现路径。
// 约定：你写的编译器可执行文件叫 mycc，支持以下命令行接口：
//   mycc -t <file.c>   输出词法单元（token dump）
//   mycc -a <file.c>   输出抽象语法树（AST dump）
//   mycc <file.c>      输出 x86-64 AT&T 汇编
//   mycc --version     输出 "mycc 0.1.0"
//   mycc --help        输出用法说明

export const CURRICULUM: Stage[] = [
  {
    id: 'stage1',
    num: 1,
    title: '工程骨架与命令行',
    summary: '搭建项目结构、解析命令行参数、读取源文件。这是编译器的入口，后面所有阶段都在此之上累加。',
    goals: [
      '建立 src/ 目录：main.c（入口）、token.h/lexer、parser、codegen 等模块',
      '解析命令行参数：-t（词法）、-a（语法树）、--version、--help，以及默认的汇编输出',
      '读取输入的 .c 文件内容，为下一阶段（词法分析）做好准备',
      '编写构建脚本（build.bat / Makefile），能一键把源码编译成 mycc',
    ],
    hints: [
      '先用 argc/argv 遍历参数；`mycc --version` 时直接打印 "mycc 0.1.0" 并返回 0。',
      '读取文件可用 fopen + fread + fclose，把整个文件读进一个动态分配的 char 缓冲区。',
      '把“读取文件”封装成一个 read_file(path) 函数，返回 malloc 出的字符串，方便后续模块复用。',
      '先搭一个能跑的最小框架：main 里读文件、打印一行“读到了 N 个字节”，验证构建脚本可用。',
    ],
    contract:
      'mycc --version  →  stdout 输出 "mycc 0.1.0"，退出码 0\n' +
      'mycc --help     →  stdout 输出 "用法: mycc [-t|-a] <file.c>"\n' +
      'mycc <file.c>   →  读取文件（本阶段可先只打印读取到的字节数）',
    testCases: [
      {
        id: 's1-version',
        name: '版本号输出',
        mode: 'stdout',
        flags: '--version',
        source: 'int main() { return 0; }',
        expected: 'mycc 0.1.0',
        description: '运行 mycc --version 应输出固定版本字符串。',
      },
    ],
    acceptance: ['mycc --version 输出 "mycc 0.1.0"', '构建脚本能成功编译出 mycc 可执行文件'],
  },
  {
    id: 'stage2',
    num: 2,
    title: '词法分析 Lexer',
    summary: '把字符流切分成 token（标识符、关键字、数字、运算符、标点），并支持 -t 打印 token 序列。',
    goals: [
      '定义 Token 结构与 TokenKind 枚举：IDENT / NUM / STR / KEYWORD / PUNCT / EOF',
      '实现 lex()：跳过空白与注释，识别多字符运算符（== != <= >= && ||）',
      '识别关键字（int return if else while for）与标识符、十进制整数',
      '实现 mycc -t <file.c>，按契约格式逐行打印 token',
    ],
    hints: [
      '先写一个 skip_whitespace 循环跳过空格/制表符/换行，注释（// 和 /* */）作为加分项。',
      '用 strncmp 判断多字符运算符：先试两位的 ==、<= 等，再回退到单字符运算符。',
      '关键字可以先当作普通标识符切出来，再查一张关键字表把它标记为 KEYWORD。',
      '打印格式：普通 token 用 `KIND \'text\'`，末尾单独一行 `EOF`。注意引号内是原始文本。',
    ],
    contract:
      'mycc -t <file.c> 每行一个 token，格式：\n' +
      "  IDENT 'name'   标识符\n" +
      "  NUM '42'       整数\n" +
      "  KEYWORD 'int'  关键字\n" +
      "  PUNCT '+'      运算符/标点（含多字符 == != <= >= && ||）\n" +
      "  EOF            结束标记（最后一行，无引号）\n" +
      '示例：`return 42;` 输出 KEYWORD \'return\'、NUM \'42\'、PUNCT \';\'、EOF',
    testCases: [
      {
        id: 's2-1',
        name: '基础 token（关键字/数字/标点）',
        mode: 'tokens',
        source: 'int main() {\n    return 42;\n}',
        expected:
          "KEYWORD 'int'\n" +
          "IDENT 'main'\n" +
          "PUNCT '('\n" +
          "PUNCT ')'\n" +
          "PUNCT '{'\n" +
          "KEYWORD 'return'\n" +
          "NUM '42'\n" +
          "PUNCT ';'\n" +
          "PUNCT '}'\n" +
          'EOF',
      },
      {
        id: 's2-2',
        name: '多字符运算符',
        mode: 'tokens',
        source: 'int main() {\n    return 1 + 2 * 3 == 7;\n}',
        expected:
          "KEYWORD 'int'\n" +
          "IDENT 'main'\n" +
          "PUNCT '('\n" +
          "PUNCT ')'\n" +
          "PUNCT '{'\n" +
          "KEYWORD 'return'\n" +
          "NUM '1'\n" +
          "PUNCT '+'\n" +
          "NUM '2'\n" +
          "PUNCT '*'\n" +
          "NUM '3'\n" +
          "PUNCT '=='\n" +
          "NUM '7'\n" +
          "PUNCT ';'\n" +
          "PUNCT '}'\n" +
          'EOF',
      },
      {
        id: 's2-3',
        name: '变量、循环与比较',
        mode: 'tokens',
        source: 'int main() {\n    int x = 10;\n    while (x <= 20 && x != 15) {\n        x = x + 1;\n    }\n    return x;\n}',
        expected:
          "KEYWORD 'int'\n" +
          "IDENT 'main'\n" +
          "PUNCT '('\n" +
          "PUNCT ')'\n" +
          "PUNCT '{'\n" +
          "KEYWORD 'int'\n" +
          "IDENT 'x'\n" +
          "PUNCT '='\n" +
          "NUM '10'\n" +
          "PUNCT ';'\n" +
          "KEYWORD 'while'\n" +
          "PUNCT '('\n" +
          "IDENT 'x'\n" +
          "PUNCT '<='\n" +
          "NUM '20'\n" +
          "PUNCT '&&'\n" +
          "IDENT 'x'\n" +
          "PUNCT '!='\n" +
          "NUM '15'\n" +
          "PUNCT ')'\n" +
          "PUNCT '{'\n" +
          "IDENT 'x'\n" +
          "PUNCT '='\n" +
          "IDENT 'x'\n" +
          "PUNCT '+'\n" +
          "NUM '1'\n" +
          "PUNCT ';'\n" +
          "PUNCT '}'\n" +
          "KEYWORD 'return'\n" +
          "IDENT 'x'\n" +
          "PUNCT ';'\n" +
          "PUNCT '}'\n" +
          'EOF',
      },
    ],
    acceptance: ['mycc -t 对上述三个程序输出与期望完全一致的 token 序列'],
  },
  {
    id: 'stage3',
    num: 3,
    title: '语法分析 Parser + AST',
    summary: '递归下降解析，把 token 流构建成抽象语法树（AST），并支持 -a 打印 S 表达式。',
    goals: [
      '定义 AST 节点（数字、变量、二元/一元运算、赋值、return、块、if/while/for、函数）',
      '实现表达式解析并正确处理运算符优先级（* / % 高于 + -，比较与逻辑最低）',
      '实现语句解析：return、if/else、while、for、块、局部变量声明',
      '实现 mycc -a <file.c>，按契约格式输出 S 表达式',
    ],
    hints: [
      '用一张“运算符优先级 + 结合性”的表，写一个通用的 expr() 递归下降解析器，比一堆 if 更清晰。',
      'if/while/for 都形如 `关键字 (条件) 语句`，for 多两个表达式，可以先解析 if 和 while。',
      '局部变量声明 `int x;` 或 `int x = expr;` 是一个语句节点，存变量名和可选的初始化表达式。',
      'AST 打印用递归：num 打印 (num N)，二元打印 (bin OP 左 右)，函数打印 (func 名 块)。',
    ],
    contract:
      'mycc -a <file.c> 输出一行 S 表达式（空白不敏感，测试会去掉所有空白再比较）：\n' +
      '  (num 42)            整数\n' +
      '  (var x)             变量\n' +
      '  (bin + l r)         二元运算（OP 为 + - * / % == != < <= > >= && ||）\n' +
      '  (unary - e)         一元运算\n' +
      '  (assign x e)        赋值\n' +
      '  (return e) / (return)  返回\n' +
      '  (block s1 s2 ...)   语句块\n' +
      '  (decl int x) / (decl int x e)  局部变量声明\n' +
      '  (if c t) / (if c t e)   条件\n' +
      '  (while c body)      循环\n' +
      '  (for init cond step body)  for 循环\n' +
      '  (func name body)    函数（body 为 block）',
    testCases: [
      {
        id: 's3-1',
        name: '常量返回',
        mode: 'ast',
        source: 'int main() {\n    return 42;\n}',
        expected: '(func main (block (return (num 42))))',
      },
      {
        id: 's3-2',
        name: '运算符优先级',
        mode: 'ast',
        source: 'int main() {\n    return 1 + 2 * 3;\n}',
        expected: '(func main (block (return (bin + (num 1) (bin * (num 2) (num 3))))))',
      },
      {
        id: 's3-3',
        name: '赋值与 if/else',
        mode: 'ast',
        source: 'int main() {\n    int x;\n    x = 3;\n    if (x > 2) return 1; else return 0;\n}',
        expected: '(func main (block (decl int x) (assign x (num 3)) (if (bin > (var x) (num 2)) (return (num 1)) (return (num 0)))))',
      },
    ],
    acceptance: ['mycc -a 对上述程序输出与期望结构一致的 S 表达式（空白不敏感）'],
  },
  {
    id: 'stage4',
    num: 4,
    title: '语义分析与符号表',
    summary: '为变量建立符号表（作用域 + 类型），检测未定义变量、重复声明等语义错误。',
    goals: [
      '实现符号表：变量名 → 类型（本子集只有 int）与栈偏移',
      '解析时维护作用域：进入 {} 压入新作用域，离开弹出',
      '使用未定义变量时报告错误并以非零码退出',
      '同一作用域重复声明变量时报告错误',
    ],
    hints: [
      '可以用一个链表或动态数组当符号表，每个作用域一层；查变量时从内向外逐层查找。',
      '把“查变量”做成 find_var(name)，找不到就报错：error: undefined variable \'x\'。',
      '局部变量要分配栈槽位（offset），供第 5 阶段代码生成用，现在可以先分配一个序号。',
      '重复声明：在同一作用域再次出现同名变量时，报 error: redeclared。',
    ],
    contract:
      '语义错误时打印错误信息（含 "undefined variable" 或 "redeclared" 字样）到 stderr，并以非零退出码结束。\n' +
      '合法程序仍需支持 -a 输出 AST。',
    testCases: [
      {
        id: 's4-1',
        name: '未定义变量报错',
        mode: 'error',
        source: 'int main() {\n    return x;\n}',
        expected: 'undefined variable',
        description: '使用未定义的变量 x 应报错并以非零码退出。',
      },
      {
        id: 's4-2',
        name: '重复声明报错',
        mode: 'error',
        source: 'int main() {\n    int a;\n    int a;\n    return 0;\n}',
        expected: 'redeclared',
        description: '同一作用域重复声明 a 应报错并以非零码退出。',
      },
      {
        id: 's4-3',
        name: '作用域内的合法使用',
        mode: 'ast',
        source: 'int main() {\n    int x;\n    x = 5;\n    return x;\n}',
        expected: '(func main (block (decl int x) (assign x (num 5)) (return (var x))))',
      },
    ],
    acceptance: ['未定义变量与重复声明均报错退出', '合法变量使用仍能正确解析'],
  },
  {
    id: 'stage5',
    num: 5,
    title: '代码生成 Codegen',
    summary: '把 AST 翻译成 x86-64 AT&T 汇编，用系统 gcc 汇编链接后运行，通过退出码验证结果。',
    goals: [
      '生成 main 的序言/尾声（push %rbp; mov %rsp,%rbp; ... leave/ret）',
      '局部变量分配到栈上（rbp 负偏移），支持声明与赋值',
      '表达式求值：把结果放到 %rax，用 push/pop 保存中间值',
      '控制流：if/else、while、for 用标签 + 跳转实现，比较用 setXX 指令',
      '除法/取模前用 cqto 扩展符号，然后 idiv',
    ],
    hints: [
      '从最简单的 `return 42;` 开始：movl $42, %eax; ret，先跑通“编译→汇编→运行→退出码”全链路。',
      '表达式用栈机模型：求值左操作数 → push → 求值右操作数 → pop 到 %rdi → 运算结果留在 %rax。',
      '比较：cmp 后 setXX %al（如 sete、setl），再 movzbq %al, %rax 得到 0/1。',
      '&& 和 || 要短路：用标签跳过右侧；while/for 就是“条件标签 + 循环体 + 回跳”的组合。',
      '局部变量用 -8(%rbp)、-16(%rbp)… 存取值：movl -8(%rbp), %eax 读，movl %eax, -8(%rbp) 写。',
    ],
    contract:
      'mycc <file.c> 向 stdout 输出 AT&T 语法汇编，含 .globl main 与 main: 标签。\n' +
      '测试流程：mycc 生成汇编 → gcc 汇编链接 → 运行 → 比对退出码。\n' +
      '程序通过 `return N;` 返回整数，退出码即 N（0–255）。',
    testCases: [
      { id: 's5-1', name: '返回常量', mode: 'run', source: 'int main() {\n    return 42;\n}', expectedExit: 42 },
      { id: 's5-2', name: '四则运算', mode: 'run', source: 'int main() {\n    return 2 + 3 * 4;\n}', expectedExit: 14 },
      { id: 's5-3', name: '括号优先级', mode: 'run', source: 'int main() {\n    return (2 + 3) * 4;\n}', expectedExit: 20 },
      { id: 's5-4', name: '除法与取模', mode: 'run', source: 'int main() {\n    return 17 / 5 + 17 % 5;\n}', expectedExit: 5 },
      { id: 's5-5', name: '比较运算', mode: 'run', source: 'int main() {\n    return (3 < 5) + (3 > 5);\n}', expectedExit: 1 },
      { id: 's5-6', name: 'if/else', mode: 'run', source: 'int main() {\n    if (1) return 10; else return 20;\n}', expectedExit: 10 },
      { id: 's5-7', name: '局部变量赋值', mode: 'run', source: 'int main() {\n    int a;\n    a = 5;\n    a = a + 3;\n    return a;\n}', expectedExit: 8 },
      { id: 's5-8', name: 'while 循环', mode: 'run', source: 'int main() {\n    int i;\n    i = 0;\n    while (i < 5) i = i + 1;\n    return i;\n}', expectedExit: 5 },
      { id: 's5-9', name: 'for 循环求和', mode: 'run', source: 'int main() {\n    int s;\n    int i;\n    s = 0;\n    for (i = 1; i <= 10; i = i + 1) s = s + i;\n    return s;\n}', expectedExit: 55 },
    ],
    acceptance: ['上述 9 个程序的运行退出码全部与期望一致'],
  },
  {
    id: 'stage6',
    num: 6,
    title: '综合练习与扩展',
    summary: '把各阶段能力组合起来解决更复杂的程序，并可选扩展（一元运算符、逻辑短路、更多类型等）。',
    goals: [
      '综合运用表达式、控制流、局部变量，完成更复杂的退出码程序',
      '正确实现逻辑与/或（&& ||）的短路求值',
      '正确处理一元负号（-x）与嵌套表达式',
      '（自选扩展）数组、指针、函数调用、char 类型等，向真正的 C 靠拢',
    ],
    hints: [
      '短路求值：`a && b` 若 a 为 0 就跳过 b；`a || b` 若 a 非 0 就跳过 b，用标签实现。',
      '一元负号：neg 指令，或 0 减操作数。',
      '想扩展函数调用时，注意 x86-64 调用约定（参数放 rdi/rsi/rdx/rcx/r8/r9，返回值在 rax）。',
      '扩展前先把当前子集的所有测试跑绿，保持一个可回归的基线。',
    ],
    contract: '继续沿用第 5 阶段的运行测试方式，通过退出码验证。',
    testCases: [
      { id: 's6-1', name: '逻辑与短路', mode: 'run', source: 'int main() {\n    int x;\n    x = 10;\n    if (x > 5 && x < 20) return 1;\n    return 0;\n}', expectedExit: 1 },
      { id: 's6-2', name: '逻辑或短路', mode: 'run', source: 'int main() {\n    int x;\n    x = 3;\n    if (x == 0 || x == 3) return 7;\n    return 0;\n}', expectedExit: 7 },
      { id: 's6-3', name: '循环求阶乘', mode: 'run', source: 'int main() {\n    int n;\n    int r;\n    n = 5;\n    r = 1;\n    while (n > 1) {\n        r = r * n;\n        n = n - 1;\n    }\n    return r;\n}', expectedExit: 120 },
      { id: 's6-4', name: '一元负号', mode: 'run', source: 'int main() {\n    return -5 + 10;\n}', expectedExit: 5 },
    ],
    acceptance: ['综合测试全部通过', '（可选）完成至少一项自选扩展并运行验证'],
  },
];

export function findStage(id: string): Stage | undefined {
  return CURRICULUM.find((s) => s.id === id);
}
