/*
 * mycc —— 一个极简 C 子集编译器（C++ 参考实现）
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
 * 构建：g++ -o mycc mycc.cpp
 * 运行测试：mycc test.c > test.s && gcc test.s -o test.exe && ./test.exe
 *   程序的 `return N;` 即为进程退出码 N。
 */

#include <cctype>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

// ------------------------------------------------------------------
// 错误处理
// ------------------------------------------------------------------
[[noreturn]] static void error(const std::string &msg) {
  std::cerr << msg << "\n";
  exit(1);
}

// ------------------------------------------------------------------
// 词法分析
// ------------------------------------------------------------------
enum class TK { Ident, Num, Str, Keyword, Punct, Eof };

struct Token {
  TK kind;
  std::string str; // 词素文本
  long val = 0;    // TK::Num 的数值
};

static const char *kind_name(TK k) {
  switch (k) {
    case TK::Ident: return "IDENT";
    case TK::Num: return "NUM";
    case TK::Str: return "STR";
    case TK::Keyword: return "KEYWORD";
    case TK::Punct: return "PUNCT";
    case TK::Eof: return "EOF";
  }
  return "?";
}

static bool starts_with(const std::string &s, size_t pos, const std::string &q) {
  return s.compare(pos, q.size(), q) == 0;
}

static bool is_ident1(char c) { return std::isalpha((unsigned char)c) || c == '_'; }
static bool is_ident2(char c) { return std::isalnum((unsigned char)c) || c == '_'; }

static bool is_keyword(const std::string &s) {
  static const std::vector<std::string> kw = {"int", "return", "if", "else", "while", "for"};
  for (const auto &k : kw)
    if (s == k) return true;
  return false;
}

static std::vector<Token> lex(const std::string &src) {
  std::vector<Token> toks;
  size_t i = 0;
  // 跳过 UTF-8 BOM（某些 Windows 编辑器会写入 EF BB BF）
  if (src.size() >= 3 && (unsigned char)src[0] == 0xEF &&
      (unsigned char)src[1] == 0xBB && (unsigned char)src[2] == 0xBF) {
    i = 3;
  }

  while (i < src.size()) {
    char c = src[i];
    if (std::isspace((unsigned char)c)) { i++; continue; }
    if (starts_with(src, i, "//")) {
      i += 2;
      while (i < src.size() && src[i] != '\n') i++;
      continue;
    }
    if (starts_with(src, i, "/*")) {
      size_t j = src.find("*/", i + 2);
      if (j == std::string::npos) error("未闭合的块注释");
      i = j + 2;
      continue;
    }
    if (std::isdigit((unsigned char)c)) {
      size_t start = i;
      while (i < src.size() && std::isdigit((unsigned char)src[i])) i++;
      Token t;
      t.kind = TK::Num;
      t.str = src.substr(start, i - start);
      t.val = std::stol(t.str);
      toks.push_back(t);
      continue;
    }
    if (is_ident1(c)) {
      size_t start = i;
      while (i < src.size() && is_ident2(src[i])) i++;
      std::string s = src.substr(start, i - start);
      Token t;
      t.kind = is_keyword(s) ? TK::Keyword : TK::Ident;
      t.str = s;
      toks.push_back(t);
      continue;
    }
    if (c == '"') {
      size_t start = ++i;
      while (i < src.size() && src[i] != '"') i++;
      if (i >= src.size()) error("未闭合的字符串");
      Token t;
      t.kind = TK::Str;
      t.str = src.substr(start, i - start);
      toks.push_back(t);
      i++; // 跳过右引号
      continue;
    }
    // 多字符运算符，按从长到短尝试
    static const std::vector<std::string> multi_ops = {"==", "!=", "<=", ">=", "&&", "||"};
    bool matched = false;
    for (const auto &op : multi_ops) {
      if (starts_with(src, i, op)) {
        Token t;
        t.kind = TK::Punct;
        t.str = op;
        toks.push_back(t);
        i += op.size();
        matched = true;
        break;
      }
    }
    if (matched) continue;
    if (std::string("+-*/%(){};=<>!,~").find(c) != std::string::npos) {
      Token t;
      t.kind = TK::Punct;
      t.str = std::string(1, c);
      toks.push_back(t);
      i++;
      continue;
    }
    error(std::string("无法识别的字符: '") + c + "'");
  }

  Token eof;
  eof.kind = TK::Eof;
  toks.push_back(eof);
  return toks;
}

// ------------------------------------------------------------------
// 语法分析 + AST
// ------------------------------------------------------------------
enum class NK {
  Num, Var, Str, Assign, Bin, Unary, Return, Block, Decl, If, While, For, Func
};

struct Node;
using NodePtr = std::unique_ptr<Node>;

struct Node {
  NK kind;
  NodePtr lhs, rhs;      // 二元/赋值
  NodePtr cond, then_, els_, init, inc; // 控制流
  NodePtr body, expr;    // 块/一元/return
  std::vector<NodePtr> stmts; // 块内语句
  std::string name;      // 变量名 / 函数名 / 运算符
  long val = 0;          // 数值
  int offset = 0;        // 局部变量栈偏移
};

static NodePtr new_node(NK k) { return std::make_unique<Node>(Node{k}); }
static NodePtr new_num(long v) { auto n = new_node(NK::Num); n->val = v; return n; }

// ------------------------------------------------------------------
// 符号表（作用域栈）
// ------------------------------------------------------------------
struct Var { std::string name; int offset; };
static std::vector<std::vector<Var>> scopes;
static int lvar_count = 0;

static void enter_scope() { scopes.push_back({}); }
static void leave_scope() { scopes.pop_back(); }

static int find_var(const std::string &name) {
  for (auto it = scopes.rbegin(); it != scopes.rend(); ++it) {
    for (const auto &v : *it) {
      if (v.name == name) return v.offset;
    }
  }
  return -1;
}

static int declare_var(const std::string &name) {
  for (const auto &v : scopes.back()) {
    if (v.name == name) error("error: redeclared variable '" + name + "'");
  }
  int offset = (++lvar_count) * 8;
  scopes.back().push_back({name, offset});
  return offset;
}

// ------------------------------------------------------------------
// 解析器
// ------------------------------------------------------------------
struct Parser {
  const std::vector<Token> &toks;
  size_t pos = 0;

  const Token &cur() const { return toks[pos]; }
  bool at_eof() const { return cur().kind == TK::Eof; }

  bool equal(const std::string &op) const { return cur().str == op; }

  bool consume(const std::string &op) {
    if (equal(op)) { pos++; return true; }
    return false;
  }

  void expect(const std::string &op) {
    if (!equal(op)) error("期望 '" + op + "'，但得到 '" + cur().str + "'");
    pos++;
  }

  std::string expect_ident() {
    if (cur().kind != TK::Ident) error("期望标识符");
    std::string s = cur().str;
    pos++;
    return s;
  }

  NodePtr program();
  NodePtr block();
  NodePtr stmt();
  NodePtr expr();
  NodePtr assign();
  NodePtr logor();
  NodePtr logand();
  NodePtr eq();
  NodePtr rel();
  NodePtr add();
  NodePtr mul();
  NodePtr unary();
  NodePtr primary();
};

static NodePtr new_bin(const std::string &op, NodePtr lhs, NodePtr rhs) {
  auto n = new_node(NK::Bin);
  n->name = op;
  n->lhs = std::move(lhs);
  n->rhs = std::move(rhs);
  return n;
}

static NodePtr new_unary(const std::string &op, NodePtr e) {
  auto n = new_node(NK::Unary);
  n->name = op;
  n->expr = std::move(e);
  return n;
}

NodePtr Parser::primary() {
  if (consume("(")) {
    auto n = expr();
    expect(")");
    return n;
  }
  if (cur().kind == TK::Num) {
    auto n = new_num(cur().val);
    pos++;
    return n;
  }
  if (cur().kind == TK::Str) {
    auto n = new_node(NK::Str);
    n->name = cur().str;
    pos++;
    return n;
  }
  if (cur().kind == TK::Ident) {
    std::string name = cur().str;
    int off = find_var(name);
    if (off < 0) error("error: undefined variable '" + name + "'");
    auto n = new_node(NK::Var);
    n->name = name;
    n->offset = off;
    pos++;
    return n;
  }
  error("期望表达式，但得到 '" + cur().str + "'");
}

NodePtr Parser::unary() {
  if (equal("-") || equal("!") || equal("~")) {
    std::string op = cur().str;
    pos++;
    return new_unary(op, unary());
  }
  return primary();
}

NodePtr Parser::mul() {
  auto n = unary();
  for (;;) {
    if (equal("*") || equal("/") || equal("%")) {
      std::string op = cur().str;
      pos++;
      n = new_bin(op, std::move(n), unary());
    } else {
      return n;
    }
  }
}

NodePtr Parser::add() {
  auto n = mul();
  for (;;) {
    if (equal("+") || equal("-")) {
      std::string op = cur().str;
      pos++;
      n = new_bin(op, std::move(n), mul());
    } else {
      return n;
    }
  }
}

NodePtr Parser::rel() {
  auto n = add();
  for (;;) {
    if (equal("<") || equal("<=") || equal(">") || equal(">=")) {
      std::string op = cur().str;
      pos++;
      n = new_bin(op, std::move(n), add());
    } else {
      return n;
    }
  }
}

NodePtr Parser::eq() {
  auto n = rel();
  for (;;) {
    if (equal("==") || equal("!=")) {
      std::string op = cur().str;
      pos++;
      n = new_bin(op, std::move(n), rel());
    } else {
      return n;
    }
  }
}

NodePtr Parser::logand() {
  auto n = eq();
  for (;;) {
    if (equal("&&")) {
      pos++;
      n = new_bin("&&", std::move(n), eq());
    } else {
      return n;
    }
  }
}

NodePtr Parser::logor() {
  auto n = logand();
  for (;;) {
    if (equal("||")) {
      pos++;
      n = new_bin("||", std::move(n), logand());
    } else {
      return n;
    }
  }
}

NodePtr Parser::assign() {
  auto n = logor();
  if (equal("=")) {
    pos++;
    if (n->kind != NK::Var) error("赋值目标必须是变量");
    auto a = new_node(NK::Assign);
    a->name = n->name;
    a->offset = n->offset;
    a->lhs = std::move(n);
    a->rhs = assign();
    return a;
  }
  return n;
}

NodePtr Parser::expr() { return assign(); }

static NodePtr decl_stmt(Parser &p) {
  // 已消费关键字 "int"
  std::string name = p.expect_ident();
  int off = declare_var(name);
  auto n = new_node(NK::Decl);
  n->name = name;
  n->offset = off;
  if (p.consume("=")) n->rhs = p.expr();
  p.expect(";");
  return n;
}

NodePtr Parser::stmt() {
  if (consume("return")) {
    auto n = new_node(NK::Return);
    if (!equal(";")) n->expr = expr();
    expect(";");
    return n;
  }
  if (consume("if")) {
    auto n = new_node(NK::If);
    expect("(");
    n->cond = expr();
    expect(")");
    n->then_ = stmt();
    if (consume("else")) n->els_ = stmt();
    return n;
  }
  if (consume("while")) {
    auto n = new_node(NK::While);
    expect("(");
    n->cond = expr();
    expect(")");
    n->body = stmt();
    return n;
  }
  if (consume("for")) {
    auto n = new_node(NK::For);
    expect("(");
    if (!equal(";")) n->init = expr();
    expect(";");
    if (!equal(";")) n->cond = expr();
    expect(";");
    if (!equal(")")) n->inc = expr();
    expect(")");
    n->body = stmt();
    return n;
  }
  if (consume("int")) return decl_stmt(*this);
  if (consume("{")) return block();
  // 表达式语句
  auto e = expr();
  expect(";");
  return e;
}

NodePtr Parser::block() {
  auto n = new_node(NK::Block);
  enter_scope();
  while (!equal("}") && !at_eof()) {
    n->stmts.push_back(stmt());
  }
  expect("}");
  leave_scope();
  return n;
}

NodePtr Parser::program() {
  expect("int");
  std::string name = expect_ident();
  expect("(");
  expect(")");
  expect("{"); // 消费函数体的左花括号，block() 内部不再消费
  auto body = block();
  auto fn = new_node(NK::Func);
  fn->name = name;
  fn->body = std::move(body);
  return fn;
}

// ------------------------------------------------------------------
// AST 打印
// ------------------------------------------------------------------
static void dump_ast(const Node *n) {
  if (!n) { std::cout << "nil"; return; }
  switch (n->kind) {
    case NK::Num: std::cout << "(num " << n->val << ")"; return;
    case NK::Var: std::cout << "(var " << n->name << ")"; return;
    case NK::Str: std::cout << "(str " << n->name << ")"; return;
    case NK::Assign:
      std::cout << "(assign " << n->name << " ";
      dump_ast(n->rhs.get());
      std::cout << ")";
      return;
    case NK::Bin:
      std::cout << "(bin " << n->name << " ";
      dump_ast(n->lhs.get());
      std::cout << " ";
      dump_ast(n->rhs.get());
      std::cout << ")";
      return;
    case NK::Unary:
      std::cout << "(unary " << n->name << " ";
      dump_ast(n->expr.get());
      std::cout << ")";
      return;
    case NK::Return:
      std::cout << "(return";
      if (n->expr) { std::cout << " "; dump_ast(n->expr.get()); }
      std::cout << ")";
      return;
    case NK::Block:
      std::cout << "(block";
      for (const auto &c : n->stmts) { std::cout << " "; dump_ast(c.get()); }
      std::cout << ")";
      return;
    case NK::Decl:
      std::cout << "(decl int " << n->name;
      if (n->rhs) { std::cout << " "; dump_ast(n->rhs.get()); }
      std::cout << ")";
      return;
    case NK::If:
      std::cout << "(if ";
      dump_ast(n->cond.get());
      std::cout << " ";
      dump_ast(n->then_.get());
      if (n->els_) { std::cout << " "; dump_ast(n->els_.get()); }
      std::cout << ")";
      return;
    case NK::While:
      std::cout << "(while ";
      dump_ast(n->cond.get());
      std::cout << " ";
      dump_ast(n->body.get());
      std::cout << ")";
      return;
    case NK::For:
      std::cout << "(for ";
      dump_ast(n->init.get());
      std::cout << " ";
      dump_ast(n->cond.get());
      std::cout << " ";
      dump_ast(n->inc.get());
      std::cout << " ";
      dump_ast(n->body.get());
      std::cout << ")";
      return;
    case NK::Func:
      std::cout << "(func " << n->name << " ";
      dump_ast(n->body.get());
      std::cout << ")";
      return;
  }
}

// ------------------------------------------------------------------
// 代码生成（x86-64 AT&T 汇编）
// ------------------------------------------------------------------
static int label_counter = 0;
static int new_label() { return label_counter++; }

static void gen_expr(const Node *n);

static void gen(const Node *n) {
  switch (n->kind) {
    case NK::Num:
    case NK::Var:
    case NK::Assign:
    case NK::Unary:
    case NK::Bin:
      gen_expr(n);
      return;
    case NK::Return:
      if (n->expr) gen_expr(n->expr.get());
      else std::cout << "  movl $0, %eax\n";
      std::cout << "  jmp .L.return\n";
      return;
    case NK::Block:
      for (const auto &c : n->stmts) gen(c.get());
      return;
    case NK::Decl:
      if (n->rhs) {
        gen_expr(n->rhs.get());
        std::cout << "  movl %eax, -" << n->offset << "(%rbp)\n";
      }
      return;
    case NK::If: {
      int l = new_label();
      gen_expr(n->cond.get());
      std::cout << "  cmpl $0, %eax\n  je .L.else." << l << "\n";
      gen(n->then_.get());
      std::cout << "  jmp .L.end." << l << "\n";
      std::cout << ".L.else." << l << ":\n";
      if (n->els_) gen(n->els_.get());
      std::cout << ".L.end." << l << ":\n";
      return;
    }
    case NK::While: {
      int l = new_label();
      std::cout << ".L.begin." << l << ":\n";
      gen_expr(n->cond.get());
      std::cout << "  cmpl $0, %eax\n  je .L.end." << l << "\n";
      gen(n->body.get());
      std::cout << "  jmp .L.begin." << l << "\n";
      std::cout << ".L.end." << l << ":\n";
      return;
    }
    case NK::For: {
      int l = new_label();
      if (n->init) gen_expr(n->init.get());
      std::cout << ".L.begin." << l << ":\n";
      if (n->cond) {
        gen_expr(n->cond.get());
        std::cout << "  cmpl $0, %eax\n  je .L.end." << l << "\n";
      }
      gen(n->body.get());
      std::cout << ".L.inc." << l << ":\n";
      if (n->inc) gen_expr(n->inc.get());
      std::cout << "  jmp .L.begin." << l << "\n";
      std::cout << ".L.end." << l << ":\n";
      return;
    }
    case NK::Func: {
      int frame = (lvar_count * 8 + 15) & ~15;
      std::cout << ".text\n.globl main\nmain:\n";
      std::cout << "  push %rbp\n  movq %rsp, %rbp\n";
      if (frame > 0) std::cout << "  subq $" << frame << ", %rsp\n";
      gen(n->body.get());
      std::cout << ".L.return:\n";
      std::cout << "  movq %rbp, %rsp\n  pop %rbp\n  ret\n";
      return;
    }
    default:
      error("不支持的语句节点类型 " + std::to_string((int)n->kind));
  }
}

static void gen_expr(const Node *n) {
  switch (n->kind) {
    case NK::Num:
      std::cout << "  movl $" << n->val << ", %eax\n";
      return;
    case NK::Var:
      std::cout << "  movl -" << n->offset << "(%rbp), %eax\n";
      return;
    case NK::Assign:
      gen_expr(n->rhs.get());
      std::cout << "  movl %eax, -" << n->offset << "(%rbp)\n";
      return;
    case NK::Unary:
      gen_expr(n->expr.get());
      if (n->name == "-") {
        std::cout << "  negl %eax\n";
      } else if (n->name == "!") {
        std::cout << "  cmpl $0, %eax\n  setne %al\n  movzbl %al, %eax\n";
      } else if (n->name == "~") {
        std::cout << "  notl %eax\n";
      }
      return;
    case NK::Bin: {
      if (n->name == "&&") {
        int l = new_label();
        gen_expr(n->lhs.get());
        std::cout << "  cmpl $0, %eax\n  je .L.false." << l << "\n";
        gen_expr(n->rhs.get());
        std::cout << "  cmpl $0, %eax\n  je .L.false." << l << "\n  movl $1, %eax\n  jmp .L.end." << l << "\n";
        std::cout << ".L.false." << l << ":\n  movl $0, %eax\n.L.end." << l << ":\n";
        return;
      }
      if (n->name == "||") {
        int l = new_label();
        gen_expr(n->lhs.get());
        std::cout << "  cmpl $0, %eax\n  jne .L.true." << l << "\n";
        gen_expr(n->rhs.get());
        std::cout << "  cmpl $0, %eax\n  jne .L.true." << l << "\n  movl $0, %eax\n  jmp .L.end." << l << "\n";
        std::cout << ".L.true." << l << ":\n  movl $1, %eax\n.L.end." << l << ":\n";
        return;
      }
      gen_expr(n->lhs.get());
      std::cout << "  push %rax\n";
      gen_expr(n->rhs.get());
      std::cout << "  movl %eax, %edi\n";
      std::cout << "  pop %rax\n";
      if (n->name == "+") {
        std::cout << "  addl %edi, %eax\n";
      } else if (n->name == "-") {
        std::cout << "  subl %edi, %eax\n";
      } else if (n->name == "*") {
        std::cout << "  imull %edi, %eax\n";
      } else if (n->name == "/") {
        std::cout << "  cqto\n  idivl %edi\n";
      } else if (n->name == "%") {
        std::cout << "  cqto\n  idivl %edi\n  movl %edx, %eax\n";
      } else if (n->name == "==") {
        std::cout << "  cmpl %edi, %eax\n  sete %al\n  movzbl %al, %eax\n";
      } else if (n->name == "!=") {
        std::cout << "  cmpl %edi, %eax\n  setne %al\n  movzbl %al, %eax\n";
      } else if (n->name == "<") {
        std::cout << "  cmpl %edi, %eax\n  setl %al\n  movzbl %al, %eax\n";
      } else if (n->name == "<=") {
        std::cout << "  cmpl %edi, %eax\n  setle %al\n  movzbl %al, %eax\n";
      } else if (n->name == ">") {
        std::cout << "  cmpl %edi, %eax\n  setg %al\n  movzbl %al, %eax\n";
      } else if (n->name == ">=") {
        std::cout << "  cmpl %edi, %eax\n  setge %al\n  movzbl %al, %eax\n";
      }
      return;
    }
    default:
      error("不支持的表达式节点类型 " + std::to_string((int)n->kind));
  }
}

// ------------------------------------------------------------------
// 入口
// ------------------------------------------------------------------
static std::string read_file(const std::string &path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    std::cerr << "无法打开文件: " << path << "\n";
    exit(1);
  }
  std::ostringstream ss;
  ss << in.rdbuf();
  return ss.str();
}

int main(int argc, char **argv) {
  if (argc >= 2 && (std::string(argv[1]) == "--version" || std::string(argv[1]) == "-v")) {
    std::cout << "mycc 0.1.0\n";
    return 0;
  }
  if (argc >= 2 && (std::string(argv[1]) == "--help" || std::string(argv[1]) == "-h")) {
    std::cout << "用法: mycc [-t|-a] <file.c>\n";
    return 0;
  }

  int mode = 0; // 0=汇编 1=词法 2=AST
  std::string srcfile;
  for (int i = 1; i < argc; i++) {
    std::string a = argv[i];
    if (a == "-t") mode = 1;
    else if (a == "-a") mode = 2;
    else if (!a.empty() && a[0] == '-') {
      std::cerr << "未知选项: " << a << "\n";
      return 1;
    } else {
      srcfile = a;
    }
  }
  if (srcfile.empty()) {
    std::cerr << "用法: mycc [-t|-a] <file.c>\n";
    return 1;
  }

  std::string src = read_file(srcfile);
  std::vector<Token> toks = lex(src);

  if (mode == 1) {
    for (const auto &t : toks) {
      if (t.kind == TK::Eof) std::cout << "EOF\n";
      else std::cout << kind_name(t.kind) << " '" << t.str << "'\n";
    }
    return 0;
  }

  Parser p{toks};
  NodePtr prog = p.program();

  if (mode == 2) {
    dump_ast(prog.get());
    std::cout << "\n";
    return 0;
  }

  gen(prog.get());
  return 0;
}
