import type { Stage } from '../types';

// 内置课程：一个 C 子集编译器（C → x86-64 汇编）的完整实现路径。
// 约定：你写的编译器可执行文件叫 mycc，支持以下命令行接口：
//   mycc -t <file.c>   输出词法单元（token dump）
//   mycc -a <file.c>   输出抽象语法树（AST dump）
//   mycc <file.c>      输出 x86-64 AT&T 汇编
//   mycc --version     输出 "mycc 0.1.0"
//   mycc --help        输出用法说明

// 新手总览：课程页顶部展示，帮助小白建立整体认知。
export const PROJECT_INTRO: string[] = [
  '项目目标：用 C 语言从零写一个「C 语言子集」编译器——它读入 .c 源码，先词法分析、再语法分析、再语义分析，最后输出 x86-64 汇编，交给 gcc 汇编链接成能运行的程序。',
  '编译器四段流水线（本课程按这个顺序拆成 6 个阶段）：① 词法分析（切 token）→ ② 语法分析（建 AST）→ ③ 语义分析（符号表）→ ④ 代码生成（出汇编）。',
  '你需要会一点 C 语言基础：指针、结构体、malloc/free、字符串（strcmp/strdup）、链表、文件读写（fopen/fread）。以及会用命令行。',
  '怎么用：左侧「课程路线」按阶段推进，每阶段先看「需要修改的文件」和「基础知识」，再动手写代码；写完点底部「▶ 编译并测试」看结果，绿了再进下一阶段。',
  '卡住了怎么办：先用右上角「💡 给点提示 / 🧩 拆分当前任务」问 AI 导师；实在过不去，可点顶部「📖 参考答案」只读查看完整实现对照。',
  '每个阶段的测试只测「当前阶段」，最后可用「🧪 全量回归」一键跑全部阶段，防止前面学过的功能被改坏。',
];

export const CURRICULUM: Stage[] = [
  {
    id: 'stage1',
    num: 1,
    title: '工程骨架与命令行',
    summary: '搭建项目结构、解析命令行参数、读取源文件。这是编译器的入口，后面所有阶段都在此之上累加。',
    files: [
      '新建 src 目录，再新建 src/main.c —— 编译器入口：解析命令行参数、读文件、分发到 lex/parse/codegen',
      '新建 build.bat 或 Makefile —— 把源码一键编译成 mycc 的构建脚本',
      '本阶段先不建 lexer.c / parser.c / codegen.c，后续阶段再补',
    ],
    background: [
      '编译器是什么：把「人读的源代码」翻译成「机器能执行的代码」的程序。本项目翻译成 x86-64 汇编，再交给 gcc 汇编+链接成可执行文件。',
      '命令行参数：程序从 main 开始；argc 是参数个数，argv 是字符串数组（argv[0] 是程序名）。mycc --version 时 argv[1] 就是 "--version"。',
      '退出码：main 里 return 0 表示成功，return 非 0 表示出错。自动化测试就是靠「退出码」和「输出文字」判断对错。',
      '读文件套路：fopen 打开 → fseek/ftell 取文件大小 → malloc 分配缓冲区 → fread 读入 → fclose 关闭（记得最后 free）。',
      '字符串比较：判断参数用 strcmp(argv[1], "--version") == 0，不要用 ==（那是比较指针地址）。',
      '构建：gcc 把多个 .c 一起编译链接成可执行文件，例如 gcc -o mycc src/*.c（Windows 会得到 mycc.exe）。',
      '建议：本阶段先把「读文件 → 打印字节数 → 构建成功」这条链路跑通，不追求功能。',
    ],
    goals: [
      '建立 src/ 目录：main.c（入口）、token.h/lexer、parser、codegen 等模块',
      '解析命令行参数：-t（词法）、-a（语法树）、--version、--help，以及默认的汇编输出',
      '读取输入的 .c 文件内容，为下一阶段（词法分析）做好准备',
      '编写构建脚本（build.bat / Makefile），能一键把源码编译成 mycc',
    ],
    hints: [
      '先用 argc/argv 遍历参数；mycc --version 时直接打印 "mycc 0.1.0" 并返回 0。',
      '读取文件可用 fopen + fread + fclose，把整个文件读进一个动态分配的 char 缓冲区。',
      '把「读取文件」封装成一个 read_file(path) 函数，返回 malloc 出的字符串，方便后续模块复用。',
      '先搭一个能跑的最小框架：main 里读文件、打印一行「读到了 N 个字节」，验证构建脚本可用。',
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
        noSource: true,
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
    files: [
      '新建 src/token.h —— 定义 TokenKind 枚举（IDENT/NUM/STR/KEYWORD/PUNCT/EOF）与 Token 结构（含 next 指针、str、val）',
      '新建 src/lexer.c —— 实现 lex()：把字符流切成 token 链表（本阶段核心）',
      '新建 src/lexer.h —— 声明 lex() 与 token_kind_name()',
      '改动 src/main.c —— 加 -t 分支：遍历 token 链表逐行打印',
    ],
    background: [
      '什么是 token：源代码里不可再分的最小单元。例如 return、42、+、; 各是一个 token。',
      'token 种类：关键字(KEYWORD)、标识符(IDENT)、数字(NUM)、字符串(STR)、运算符/标点(PUNCT)、结束标记(EOF)。',
      '为什么需要词法分析：把一堆字符变成有意义的「单词」，后面的语法分析就不用再关心空格和注释。',
      '链表：每个 token 是一个节点，用 next 指针串起来。lex() 返回链表头，最后补一个 TK_EOF 节点。',
      '关键字识别：先按「标识符」规则切出来，再查一张关键字表（int return if else while for）决定是 KEYWORD 还是 IDENT。',
      '多字符运算符：先试两位的（== != <= >= && ||），再退回单字符（= ! < > & |）。这叫「最长匹配」。',
      '注释：跳过 // 到行尾、/* ... */ 到结束（跨行）。建议做掉，否则后面测试里的注释会干扰结果。',
      '内存：token 的文本用 strdup/malloc 拷贝一份，不要直接指向 input 缓冲区的指针。',
    ],
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
      '打印格式：普通 token 用 KIND \'text\'，末尾单独一行 EOF。注意引号内是原始文本。',
    ],
    contract:
      'mycc -t <file.c> 每行一个 token，格式：\n' +
      "  IDENT 'name'   标识符\n" +
      "  NUM '42'       整数\n" +
      "  KEYWORD 'int'  关键字\n" +
      "  PUNCT '+'      运算符/标点（含多字符 == != <= >= && ||）\n" +
      "  EOF            结束标记（最后一行，无引号）\n" +
      '示例：return 42; 输出 KEYWORD \'return\'、NUM \'42\'、PUNCT \';\'、EOF',
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
    files: [
      '新建 src/parser.h —— 定义 AST 节点结构（Node：num/var/bin/unary/assign/return/block/if/while/for/decl/func）与 parse()/dump_ast() 声明',
      '新建 src/parser.c —— 实现 parse()（递归下降解析）与 dump_ast()（打印 S 表达式）',
      '改动 src/main.c —— 加 -a 分支：调用 parse() 后 dump_ast()',
    ],
    background: [
      '什么是语法分析：检查 token 的顺序是否符合语法规则，并把它组织成一棵树（AST，抽象语法树）。',
      'AST 节点：数字(num)、变量(var)、二元运算(bin)、一元(unary)、赋值(assign)、return、块(block)、if/while/for、声明(decl)、函数(func)。',
      '递归下降：为每种语法结构写一个函数，函数之间互相调用。核心难点是「表达式」的解析。',
      '运算符优先级用「分层」实现：每层只管一种优先级，高层调用低层。从低到高：赋值 → || → && → ==/!= → < <= > >= → + - → * / % → 一元 - ! ~ → 括号/数字/变量。',
      '语法规则写法（BNF）：mul -> unary ("*" unary | "/" unary | "%" unary)* ，其中 * 表示重复 0 次以上，| 表示或。',
      '语句：return 表达式? ;  /  if (expr) 语句 (else 语句)?  /  while (expr) 语句  /  for (...) 语句  /  int 标识符 (= 表达式)? ;  /  { 语句* }  /  表达式语句。',
      '打印 AST：递归遍历。num 打印 (num N)，二元打印 (bin OP 左 右)，函数打印 (func 名 块)。测试会「去掉所有空白再比较」，所以空格换行不影响。',
    ],
    goals: [
      '定义 AST 节点（数字、变量、二元/一元运算、赋值、return、块、if/while/for、函数）',
      '实现表达式解析并正确处理运算符优先级（* / % 高于 + -，比较与逻辑最低）',
      '实现语句解析：return、if/else、while、for、块、局部变量声明',
      '实现 mycc -a <file.c>，按契约格式输出 S 表达式',
    ],
    hints: [
      '用一张「运算符优先级 + 结合性」的表，写一个通用的 expr() 递归下降解析器，比一堆 if 更清晰。',
      'if/while/for 都形如 关键字 (条件) 语句，for 多两个表达式，可以先解析 if 和 while。',
      '局部变量声明 int x; 或 int x = expr; 是一个语句节点，存变量名和可选的初始化表达式。',
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
    files: [
      '改动 src/parser.c —— 在 parse() 里维护作用域栈 + 符号表，并报语义错误（本阶段核心）',
      '（可选）新建 src/symbol.c / src/symbol.h —— 把符号表单独拆出来，结构更清晰',
      '不改：src/lexer.c',
    ],
    background: [
      '什么是语义分析：语法正确之后再做「意义」检查——变量声明过没有、类型对不对。本项目主要做符号表。',
      '符号表：记录「变量名 → 类型 + 栈偏移」的映射。本子集只有 int 类型；栈偏移是给第 5 阶段代码生成用的。',
      '作用域：每进入一个 { 就开一层新作用域，离开就关闭。查变量时从内向外逐层查找。',
      '未定义变量：用到的变量在所有作用域都找不到 → 报错 error: undefined variable 并非零退出。',
      '重复声明：同一作用域里再次声明同名变量 → 报错 error: redeclared。',
      '实现：符号表可用「链表或动态数组」，每个作用域一层；声明时登记并分配 offset（如 (++count) * 8）。',
    ],
    goals: [
      '实现符号表：变量名 → 类型（本子集只有 int）与栈偏移',
      '解析时维护作用域：进入 {} 压入新作用域，离开弹出',
      '使用未定义变量时报告错误并以非零码退出',
      '同一作用域重复声明变量时报告错误',
    ],
    hints: [
      '可以用一个链表或动态数组当符号表，每个作用域一层；查变量时从内向外逐层查找。',
      '把「查变量」做成 find_var(name)，找不到就报错：error: undefined variable。',
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
    files: [
      '新建 src/codegen.h —— 声明 codegen()',
      '新建 src/codegen.c —— 实现 codegen()：遍历 AST 输出汇编到 stdout（本阶段核心）',
      '改动 src/main.c —— 默认模式（无 -t/-a）调用 codegen() 输出汇编',
      '不改：src/lexer.c、src/parser.c',
    ],
    background: [
      'x86-64 汇编（AT&T 语法）：movl $42, %eax 把常量 42 放进寄存器 eax；ret 返回。结果放 %eax，程序退出码就是 %eax 的低 8 位。',
      '重要寄存器：%rax 返回值、%rsp 栈顶、%rbp 栈帧基址。局部变量放在 rbp 的负偏移（-8(%rbp)、-16(%rbp)…）。',
      '函数序言/尾声：push %rbp → movq %rsp, %rbp → ... 函数体 ... → leave → ret。',
      '栈机求值：二元运算 = 先算左操作数 → push 保存 → 算右操作数 → pop 到另一寄存器 → 运算，结果留在 %rax。',
      '比较：cmp 之后用 setXX %al（sete 相等、setl 小于、setg 大于…），再 movzbl %al, %eax 得到 0/1。',
      '控制流：if/else、while、for 用「标签 + 跳转」实现：先判断条件，满足就 jmp 到对应标签。',
      '除法：先 cqto 符号扩展，再 idivl 除数；商在 %eax、余数在 %edx。',
      '测试方式：mycc 输出汇编 → gcc 汇编+链接成 exe → 运行 → 比对退出码。',
    ],
    goals: [
      '生成 main 的序言/尾声（push %rbp; mov %rsp,%rbp; ... leave/ret）',
      '局部变量分配到栈上（rbp 负偏移），支持声明与赋值',
      '表达式求值：把结果放到 %rax，用 push/pop 保存中间值',
      '控制流：if/else、while、for 用标签 + 跳转实现，比较用 setXX 指令',
      '除法/取模前用 cqto 扩展符号，然后 idiv',
    ],
    hints: [
      '从最简单的 return 42; 开始：movl $42, %eax; ret，先跑通「编译→汇编→运行→退出码」全链路。',
      '表达式用栈机模型：求值左操作数 → push → 求值右操作数 → pop 到 %rdi → 运算结果留在 %rax。',
      '比较：cmp 后 setXX %al（如 sete、setl），再 movzbq %al, %rax 得到 0/1。',
      '&& 和 || 要短路：用标签跳过右侧；while/for 就是「条件标签 + 循环体 + 回跳」的组合。',
      '局部变量用 -8(%rbp)、-16(%rbp)… 存取值：movl -8(%rbp), %eax 读，movl %eax, -8(%rbp) 写。',
    ],
    contract:
      'mycc <file.c> 向 stdout 输出 AT&T 语法汇编，含 .globl main 与 main: 标签。\n' +
      '测试流程：mycc 生成汇编 → gcc 汇编链接 → 运行 → 比对退出码。\n' +
      '程序通过 return N; 返回整数，退出码即 N（0–255）。',
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
    files: [
      'src/codegen.c —— 补充短路求值、一元负号等',
      'src/parser.c —— 若扩展新语法（如函数调用），需要在这里加解析',
      'src/token.h —— 若新增运算符/关键字，需要扩展枚举与关键字表',
    ],
    background: [
      '短路求值：a && b 若 a 为 0 就不算 b；a || b 若 a 非 0 就不算 b。用标签跳过右侧实现。',
      '一元负号：-x 用 neg 指令，或 0 减 x。',
      '可选扩展（向真 C 靠拢）：函数调用（参数放 rdi/rsi/rdx/rcx/r8/r9，返回值在 rax）、数组、指针、char 类型。',
      '工程习惯：每次加新功能前先跑一遍全部测试，保持一个可回归的绿色基线，避免改坏前面的功能。',
    ],
    goals: [
      '综合运用表达式、控制流、局部变量，完成更复杂的退出码程序',
      '正确实现逻辑与/或（&& ||）的短路求值',
      '正确处理一元负号（-x）与嵌套表达式',
      '（自选扩展）数组、指针、函数调用、char 类型等，向真正的 C 靠拢',
    ],
    hints: [
      '短路求值：a && b 若 a 为 0 就跳过 b；a || b 若 a 非 0 就跳过 b，用标签实现。',
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
