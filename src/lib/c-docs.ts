import * as monaco from 'monaco-editor';

// C 标准库常用函数的内置说明：悬浮显示用法，Ctrl+点击跳转到 cppreference 文档。
// 说明文字面向初学者，避免一上来就查英文手册。

export interface CDocEntry {
  sig: string;
  desc: string;
  url: string;
}

const DOCS: Record<string, CDocEntry> = {
  // ---- 文件操作 ----
  fopen: {
    sig: 'FILE *fopen(const char *filename, const char *mode);',
    desc: '打开文件，返回 FILE* 指针（后续读写都用它）。mode："r" 读、"w" 写（覆盖）、"a" 追加、"rb"/"wb" 二进制。失败返回 NULL。',
    url: 'https://zh.cppreference.com/w/c/io/fopen',
  },
  fclose: {
    sig: 'int fclose(FILE *stream);',
    desc: '关闭文件并释放缓冲。用完文件后记得调用。成功返回 0，失败返回 EOF。',
    url: 'https://zh.cppreference.com/w/c/io/fclose',
  },
  fread: {
    sig: 'size_t fread(void *buffer, size_t size, size_t count, FILE *stream);',
    desc: '从文件读入 count 个「size 字节」的数据块到 buffer，返回实际读到的块数。',
    url: 'https://zh.cppreference.com/w/c/io/fread',
  },
  fwrite: {
    sig: 'size_t fwrite(const void *buffer, size_t size, size_t count, FILE *stream);',
    desc: '把 buffer 里的 count 个数据块写入文件，返回实际写入的块数。',
    url: 'https://zh.cppreference.com/w/c/io/fwrite',
  },
  fseek: {
    sig: 'int fseek(FILE *stream, long offset, int origin);',
    desc: '移动文件读写位置。origin：SEEK_SET 从开头、SEEK_CUR 从当前位置、SEEK_END 从末尾。',
    url: 'https://zh.cppreference.com/w/c/io/fseek',
  },
  ftell: {
    sig: 'long ftell(FILE *stream);',
    desc: '返回当前文件读写位置（从文件开头算起的字节数）。常配合 fseek 获取文件大小。',
    url: 'https://zh.cppreference.com/w/c/io/ftell',
  },
  fgets: {
    sig: 'char *fgets(char *str, int count, FILE *stream);',
    desc: '从文件读入一行（最多 count-1 个字符）到 str，读到换行或文件结尾停止。失败返回 NULL。',
    url: 'https://zh.cppreference.com/w/c/io/fgets',
  },
  fputs: {
    sig: 'int fputs(const char *str, FILE *stream);',
    desc: '把字符串 str 写入文件（不含自动换行）。',
    url: 'https://zh.cppreference.com/w/c/io/fputs',
  },
  fgetc: {
    sig: 'int fgetc(FILE *stream);',
    desc: '从文件读取一个字符（返回 unsigned char 或 EOF）。',
    url: 'https://zh.cppreference.com/w/c/io/fgetc',
  },
  fputc: {
    sig: 'int fputc(int ch, FILE *stream);',
    desc: '把一个字符写入文件。',
    url: 'https://zh.cppreference.com/w/c/io/fputc',
  },
  feof: {
    sig: 'int feof(FILE *stream);',
    desc: '判断是否已读到文件末尾。到达末尾返回非 0，否则返回 0。',
    url: 'https://zh.cppreference.com/w/c/io/feof',
  },
  fflush: {
    sig: 'int fflush(FILE *stream);',
    desc: '把缓冲区里的数据立刻写到文件/屏幕。传 NULL 则刷新所有输出流。',
    url: 'https://zh.cppreference.com/w/c/io/fflush',
  },

  // ---- 输入输出 ----
  printf: {
    sig: 'int printf(const char *format, ...);',
    desc: '格式化输出到标准输出（屏幕）。占位符：%d 整数、%s 字符串、%c 字符、%f 浮点、%p 指针、%% 百分号。',
    url: 'https://zh.cppreference.com/w/c/io/fprintf',
  },
  fprintf: {
    sig: 'int fprintf(FILE *stream, const char *format, ...);',
    desc: '和 printf 一样，但输出到指定文件。报错信息常用 fprintf(stderr, "...")。',
    url: 'https://zh.cppreference.com/w/c/io/fprintf',
  },
  sprintf: {
    sig: 'int sprintf(char *buffer, const char *format, ...);',
    desc: '和 printf 一样，但输出到字符串 buffer（注意 buffer 要足够大）。',
    url: 'https://zh.cppreference.com/w/c/io/fprintf',
  },
  scanf: {
    sig: 'int scanf(const char *format, ...);',
    desc: '从标准输入按格式读入数据（如 scanf("%d", &x)）。',
    url: 'https://zh.cppreference.com/w/c/io/fscanf',
  },

  // ---- 动态内存 ----
  malloc: {
    sig: 'void *malloc(size_t size);',
    desc: '分配 size 字节的内存，返回首地址（未初始化）。失败返回 NULL。用完后要 free。',
    url: 'https://zh.cppreference.com/w/c/memory/malloc',
  },
  calloc: {
    sig: 'void *calloc(size_t num, size_t size);',
    desc: '分配 num 个 size 字节的内存，并全部清零。失败返回 NULL。',
    url: 'https://zh.cppreference.com/w/c/memory/calloc',
  },
  realloc: {
    sig: 'void *realloc(void *ptr, size_t new_size);',
    desc: '调整已分配内存的大小（可扩大或缩小），可能返回新地址。失败返回 NULL。',
    url: 'https://zh.cppreference.com/w/c/memory/realloc',
  },
  free: {
    sig: 'void free(void *ptr);',
    desc: '释放 malloc/calloc/realloc 分配的内存。释放后不要再使用该指针。',
    url: 'https://zh.cppreference.com/w/c/memory/free',
  },

  // ---- 字符串 ----
  strcmp: {
    sig: 'int strcmp(const char *lhs, const char *rhs);',
    desc: '比较两个字符串。相等返回 0，lhs 小返回负数，lhs 大返回正数。比较命令行参数常用它。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strcmp',
  },
  strncmp: {
    sig: 'int strncmp(const char *lhs, const char *rhs, size_t count);',
    desc: '比较两个字符串的前 count 个字符。判断多字符运算符（如 ==）时常用。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strncmp',
  },
  strlen: {
    sig: 'size_t strlen(const char *str);',
    desc: '返回字符串长度（不含结尾的 \\0）。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strlen',
  },
  strcpy: {
    sig: 'char *strcpy(char *dest, const char *src);',
    desc: '把 src 复制到 dest（含 \\0）。dest 要足够大，否则溢出。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strcpy',
  },
  strncpy: {
    sig: 'char *strncpy(char *dest, const char *src, size_t count);',
    desc: '复制最多 count 个字符到 dest。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strncpy',
  },
  strdup: {
    sig: 'char *strdup(const char *src);',
    desc: '复制一份字符串到新分配的内存（POSIX，常见于 GCC）。token 的文本拷贝常用它。用完要 free。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strdup',
  },
  strndup: {
    sig: 'char *strndup(const char *src, size_t size);',
    desc: '复制最多 size 个字符到新分配的内存（POSIX）。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strndup',
  },
  strchr: {
    sig: 'char *strchr(const char *str, int ch);',
    desc: '在字符串里找字符 ch 第一次出现的位置，返回指针（找不到返回 NULL）。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strchr',
  },
  strtok: {
    sig: 'char *strtok(char *str, const char *delim);',
    desc: '按分隔符切割字符串。第一次传 str，之后传 NULL 继续切同一串。会修改原字符串。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strtok',
  },
  memcpy: {
    sig: 'void *memcpy(void *dest, const void *src, size_t count);',
    desc: '复制 count 字节（内存区域不能重叠，重叠用 memmove）。',
    url: 'https://zh.cppreference.com/w/c/string/byte/memcpy',
  },
  memmove: {
    sig: 'void *memmove(void *dest, const void *src, size_t count);',
    desc: '复制 count 字节，允许内存区域重叠。',
    url: 'https://zh.cppreference.com/w/c/string/byte/memmove',
  },
  memset: {
    sig: 'void *memset(void *dest, int ch, size_t count);',
    desc: '把 dest 的前 count 字节都设为 ch。常用 memset(p, 0, n) 清零。',
    url: 'https://zh.cppreference.com/w/c/string/byte/memset',
  },
  atoi: {
    sig: 'int atoi(const char *str);',
    desc: '把字符串转成 int（如 "42" → 42）。不检查错误，需要更严谨可用 strtol。',
    url: 'https://zh.cppreference.com/w/c/string/byte/atoi',
  },
  strtol: {
    sig: 'long strtol(const char *str, char **str_end, int base);',
    desc: '把字符串转成 long，支持指定进制 base（10 十进制、16 十六进制）。词法分析解析数字常用。',
    url: 'https://zh.cppreference.com/w/c/string/byte/strtol',
  },

  // ---- 字符判断 ----
  isdigit: {
    sig: 'int isdigit(int ch);',
    desc: '判断字符是不是数字 0-9，是返回非 0，否则返回 0。',
    url: 'https://zh.cppreference.com/w/c/string/byte/isdigit',
  },
  isalpha: {
    sig: 'int isalpha(int ch);',
    desc: '判断字符是不是英文字母 a-z/A-Z。',
    url: 'https://zh.cppreference.com/w/c/string/byte/isalpha',
  },
  isalnum: {
    sig: 'int isalnum(int ch);',
    desc: '判断字符是不是字母或数字。标识符判断常用。',
    url: 'https://zh.cppreference.com/w/c/string/byte/isalnum',
  },
  isspace: {
    sig: 'int isspace(int ch);',
    desc: '判断字符是不是空白（空格、制表符、换行等）。跳过空白常用。',
    url: 'https://zh.cppreference.com/w/c/string/byte/isspace',
  },
  toupper: {
    sig: 'int toupper(int ch);',
    desc: '把小写字母转成大写，其它字符原样返回。',
    url: 'https://zh.cppreference.com/w/c/string/byte/toupper',
  },
  tolower: {
    sig: 'int tolower(int ch);',
    desc: '把大写字母转成小写，其它字符原样返回。',
    url: 'https://zh.cppreference.com/w/c/string/byte/tolower',
  },

  // ---- 其它 ----
  exit: {
    sig: 'void exit(int exit_code);',
    desc: '立即结束程序，exit_code 就是进程退出码。0 表示成功，非 0 表示出错。',
    url: 'https://zh.cppreference.com/w/c/program/exit',
  },
  qsort: {
    sig: 'void qsort(void *ptr, size_t count, size_t size, int (*comp)(const void *, const void *));',
    desc: '对数组快速排序，需要提供一个比较函数。',
    url: 'https://zh.cppreference.com/w/c/algorithm/qsort',
  },
};

// C++ 标准库常用组件（键用不带 std:: 的名字，方便悬浮/跳转命中 std::cout 中的 cout）
const CXX_DOCS: Record<string, CDocEntry> = {
  cout: {
    sig: 'std::ostream cout;',
    desc: '标准输出流对象，配合 << 输出到屏幕，如 std::cout << "hi" << std::endl;。',
    url: 'https://zh.cppreference.com/w/cpp/io/cout',
  },
  cin: {
    sig: 'std::istream cin;',
    desc: '标准输入流对象，配合 >> 从键盘读取，如 std::cin >> x;。',
    url: 'https://zh.cppreference.com/w/cpp/io/cin',
  },
  cerr: {
    sig: 'std::ostream cerr;',
    desc: '标准错误输出流（无缓冲），常用于报错：std::cerr << "错误" << std::endl;。',
    url: 'https://zh.cppreference.com/w/cpp/io/cerr',
  },
  endl: {
    sig: 'std::ostream& endl(std::ostream& os);',
    desc: '输出换行并刷新缓冲区：std::cout << x << std::endl;。',
    url: 'https://zh.cppreference.com/w/cpp/io/manip/endl',
  },
  string: {
    sig: 'std::string;',
    desc: 'C++ 字符串类，自动管理内存。常用：size()、substr()、find()、c_str()、+= 拼接、== 比较。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string',
  },
  getline: {
    sig: 'std::istream& getline(std::istream& is, std::string& str);',
    desc: '从输入流读取一整行到 string（可含空格）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/getline',
  },
  stoi: {
    sig: 'int stoi(const std::string& str, size_t* pos = 0, int base = 10);',
    desc: '把字符串转成 int（如 "42" → 42）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/stol',
  },
  to_string: {
    sig: 'std::string to_string(int value);',
    desc: '把数值转成字符串。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/to_string',
  },
  vector: {
    sig: 'std::vector<T>;',
    desc: '动态数组容器。常用：push_back()、size()、back()、pop_back()、下标 [] 访问。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector',
  },
  push_back: {
    sig: 'void push_back(const T& value);',
    desc: '向 vector/string 等容器末尾追加一个元素。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector/push_back',
  },
  size: {
    sig: 'size_type size() const;',
    desc: '返回容器/字符串的元素个数。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector/size',
  },
  back: {
    sig: 'T& back();',
    desc: '返回容器最后一个元素的引用。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector/back',
  },
  pop_back: {
    sig: 'void pop_back();',
    desc: '移除容器末尾的一个元素。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector/pop_back',
  },
  ifstream: {
    sig: 'std::ifstream;',
    desc: '文件输入流（读文件）。用 .open(path) 打开、.is_open() 判断是否成功、.close() 关闭。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ifstream',
  },
  ofstream: {
    sig: 'std::ofstream;',
    desc: '文件输出流（写文件）。用 .open(path) 打开、<< 写入、.close() 关闭。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ofstream',
  },
  ostringstream: {
    sig: 'std::ostringstream;',
    desc: '字符串输出流，用 << 拼接，.str() 取出结果字符串（读文件常用它累积内容）。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ostringstream',
  },
  istringstream: {
    sig: 'std::istringstream;',
    desc: '字符串输入流，从字符串里用 >> 读取数据。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_istringstream',
  },
  sort: {
    sig: 'void sort(RandomIt first, RandomIt last);',
    desc: '对 [first, last) 区间排序：std::sort(v.begin(), v.end());。',
    url: 'https://zh.cppreference.com/w/cpp/algorithm/sort',
  },
  unique_ptr: {
    sig: 'std::unique_ptr<T>;',
    desc: '独占所有权的智能指针，自动 delete。用 std::make_unique<T>(...) 创建。',
    url: 'https://zh.cppreference.com/w/cpp/memory/unique_ptr',
  },
  make_unique: {
    sig: 'std::make_unique<T>(args...);',
    desc: '创建并返回 std::unique_ptr<T>。',
    url: 'https://zh.cppreference.com/w/cpp/memory/unique_ptr/make_unique',
  },
  shared_ptr: {
    sig: 'std::shared_ptr<T>;',
    desc: '共享所有权的智能指针，引用计数归零时自动释放。',
    url: 'https://zh.cppreference.com/w/cpp/memory/shared_ptr',
  },
  make_shared: {
    sig: 'std::make_shared<T>(args...);',
    desc: '创建并返回 std::shared_ptr<T>。',
    url: 'https://zh.cppreference.com/w/cpp/memory/shared_ptr/make_shared',
  },
  move: {
    sig: 'std::move(t);',
    desc: '把对象转换为右值引用，用于移动语义。',
    url: 'https://zh.cppreference.com/w/cpp/utility/move',
  },
  length: {
    sig: 'size_type length() const;',
    desc: '返回字符串长度（同 size()）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/size',
  },
  substr: {
    sig: 'std::string substr(size_type pos = 0, size_type count = npos) const;',
    desc: '返回从 pos 开始的子串。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/substr',
  },
  find: {
    sig: 'size_type find(const std::string& str, size_type pos = 0) const;',
    desc: '在字符串中查找子串，返回首次出现位置（找不到返回 std::string::npos）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/find',
  },
  c_str: {
    sig: 'const char* c_str() const;',
    desc: '返回 C 风格字符串（const char*），供需要 C 接口的地方使用。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/c_str',
  },
  assign: {
    sig: 'std::string& assign(const std::string& str);  // 另有 assign(迭代器区间)/assign(n, ch)/assign(位置, 长度) 重载',
    desc: '把内容赋给 string：可整体赋值、按区间（如 assign(istreambuf_iterator, {}) 读整个文件）、按 n 个字符、按子串位置等。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/assign',
  },
  append: {
    sig: 'std::string& append(const std::string& str);',
    desc: '在字符串末尾追加内容（等价于 +=）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/append',
  },
  insert: {
    sig: 'std::string& insert(size_type pos, const std::string& str);',
    desc: '在指定位置插入内容（string/vector 都支持）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/insert',
  },
  erase: {
    sig: 'std::string& erase(size_type pos = 0, size_type count = npos);',
    desc: '删除指定区间的内容（string/vector 都支持）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/erase',
  },
  replace: {
    sig: 'std::string& replace(size_type pos, size_type count, const std::string& str);',
    desc: '用新内容替换 [pos, pos+count) 区间。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/replace',
  },
  rfind: {
    sig: 'size_type rfind(const std::string& str, size_type pos = npos) const;',
    desc: '从后往前查找子串，返回最后一次出现位置。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/rfind',
  },
  compare: {
    sig: 'int compare(const std::string& str) const;',
    desc: '比较两个字符串，相等返回 0，小于返回负数，大于返回正数。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/compare',
  },
  empty: {
    sig: 'bool empty() const;',
    desc: '判断字符串/容器是否为空。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/empty',
  },
  clear: {
    sig: 'void clear();',
    desc: '清空字符串/容器的所有内容。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/clear',
  },
  resize: {
    sig: 'void resize(size_type count);',
    desc: '调整字符串/容器的大小（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/resize',
  },
  reserve: {
    sig: 'void reserve(size_type new_cap);',
    desc: '预留容量，避免反复重新分配（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/reserve',
  },
  at: {
    sig: 'CharT& at(size_type pos);',
    desc: '按下标访问元素并做边界检查（越界抛异常）（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/at',
  },
  front: {
    sig: 'CharT& front();',
    desc: '返回第一个元素的引用（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/front',
  },
  begin: {
    sig: 'iterator begin();',
    desc: '返回指向首元素的迭代器（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/begin',
  },
  end: {
    sig: 'iterator end();',
    desc: '返回指向末尾（最后一个元素之后）的迭代器。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/end',
  },
  data: {
    sig: 'CharT* data();',
    desc: '返回底层字符数组指针（string/vector）。',
    url: 'https://zh.cppreference.com/w/cpp/string/basic_string/data',
  },
  emplace_back: {
    sig: 'void emplace_back(Args&&... args);',
    desc: '在 vector 末尾就地构造一个元素（比 push_back 少一次拷贝）。',
    url: 'https://zh.cppreference.com/w/cpp/container/vector/emplace_back',
  },
  fstream: {
    sig: 'std::fstream;',
    desc: '文件流，可同时读写。用 .open(path, mode) 打开。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_fstream',
  },
  stringstream: {
    sig: 'std::stringstream;',
    desc: '字符串流，可读写字符串。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_stringstream',
  },
  istreambuf_iterator: {
    sig: 'std::istreambuf_iterator<CharT>(istream& s);',
    desc: '流缓冲区输入迭代器，配合 assign 可一次读入整个文件：out.assign(std::istreambuf_iterator<char>(in), {});',
    url: 'https://zh.cppreference.com/w/cpp/iterator/istreambuf_iterator',
  },
  ostreambuf_iterator: {
    sig: 'std::ostreambuf_iterator<CharT>(ostream& s);',
    desc: '流缓冲区输出迭代器，用于把内容写入输出流。',
    url: 'https://zh.cppreference.com/w/cpp/iterator/ostreambuf_iterator',
  },
  open: {
    sig: 'void open(const std::string& path, ios_base::openmode mode);',
    desc: '打开文件流（ifstream/ofstream/fstream）。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ifstream/open',
  },
  is_open: {
    sig: 'bool is_open() const;',
    desc: '判断文件流是否已成功打开。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ifstream/is_open',
  },
  close: {
    sig: 'void close();',
    desc: '关闭文件流。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ifstream/close',
  },
  good: {
    sig: 'bool good() const;',
    desc: '判断流是否处于正常状态。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ios/good',
  },
  eof: {
    sig: 'bool eof() const;',
    desc: '判断是否读到文件末尾。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ios/eof',
  },
  fail: {
    sig: 'bool fail() const;',
    desc: '判断流是否发生错误。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ios/fail',
  },
  read: {
    sig: 'istream& read(char* s, streamsize count);',
    desc: '从流读取 count 个字符到缓冲区。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_istream/read',
  },
  write: {
    sig: 'ostream& write(const char* s, streamsize count);',
    desc: '把 count 个字符写入流。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_ostream/write',
  },
  get: {
    sig: 'int get();  // 或 istream& get(char& c);',
    desc: '从流读取一个字符。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_istream/get',
  },
  ignore: {
    sig: 'istream& ignore(streamsize count = 1, int delim = EOF);',
    desc: '跳过流中最多 count 个字符或直到分隔符。',
    url: 'https://zh.cppreference.com/w/cpp/io/basic_istream/ignore',
  },
  reverse: {
    sig: 'void reverse(BidirectionalIt first, BidirectionalIt last);',
    desc: '反转 [first, last) 区间：std::reverse(s.begin(), s.end());',
    url: 'https://zh.cppreference.com/w/cpp/algorithm/reverse',
  },
};

/** 供应用内文档面板查询函数说明。 */
export function getCDoc(name: string): CDocEntry | undefined {
  return DOCS[name] || CXX_DOCS[name];
}

// C 关键字（用于代码补全）
const C_KEYWORDS: string[] = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'inline',
  'int', 'long', 'register', 'restrict', 'return', 'short', 'signed', 'sizeof',
  'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while',
];

// C++ 关键字（代码补全用）
const CXX_KEYWORDS: string[] = [
  'class', 'namespace', 'using', 'template', 'typename', 'public', 'private',
  'protected', 'virtual', 'override', 'constexpr', 'auto', 'new', 'delete',
  'nullptr', 'true', 'false', 'this', 'try', 'catch', 'throw', 'friend', 'operator',
];

let registered = false;

export function registerCDocs(): void {
  if (registered) return;
  registered = true;

  const makeHover = (docs: Record<string, CDocEntry>): monaco.languages.HoverProvider => ({
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const d = docs[word.word];
      if (!d) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `\`\`\`c\n${d.sig}\n\`\`\`\n\n${d.desc}\n\n*按住 Ctrl 点击可在应用内查看文档*` },
        ],
      };
    },
  });

  const makeDefinition = (docs: Record<string, CDocEntry>): monaco.languages.DefinitionProvider => ({
    provideDefinition(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      if (!docs[word.word]) return null;
      return {
        uri: monaco.Uri.from({ scheme: 'wonder-doc', path: '/' + word.word }),
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      };
    },
  });

  // #include 行内 Ctrl+点击 → 打开头文件
  const headerProvider: monaco.languages.DefinitionProvider = {
    provideDefinition(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const m = /^\s*#\s*include\s*([<"])([^>"]+)[>"]/.exec(line);
      if (!m) return null;
      const delim = m[1];
      const name = m[2];
      const matchStart = m.index ?? 0;
      const startCol = matchStart + m[0].indexOf(delim) + 1; // 头文件名起始列（0 基）
      const endCol = startCol + name.length;
      const col = position.column - 1;
      if (col < startCol || col > endCol) return null;
      return {
        uri: monaco.Uri.from({ scheme: 'wonder-header', authority: delim === '<' ? 'sys' : 'local', path: '/' + name }),
        range: new monaco.Range(position.lineNumber, startCol + 1, position.lineNumber, endCol + 1),
      };
    },
  };

  // 代码补全：关键字 + 标准库函数（带签名与说明）
  const makeCompletion = (keywords: string[], docs: Record<string, CDocEntry>): monaco.languages.CompletionItemProvider => ({
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
      const prefix = word.word.toLowerCase();
      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const kw of keywords) {
        if (kw.startsWith(prefix)) {
          suggestions.push({ label: kw, kind: monaco.languages.CompletionItemKind.Keyword, insertText: kw, range });
        }
      }
      for (const [name, d] of Object.entries(docs)) {
        if (name.startsWith(prefix)) {
          suggestions.push({
            label: name,
            kind: monaco.languages.CompletionItemKind.Function,
            insertText: name,
            detail: d.sig,
            documentation: { value: '```c\n' + d.sig + '\n```\n\n' + d.desc },
            range,
          });
        }
      }
      return { suggestions };
    },
  });

  const cDocs = DOCS;
  const cppDocs = { ...DOCS, ...CXX_DOCS };
  const cKeywords = C_KEYWORDS;
  const cppKeywords = [...C_KEYWORDS, ...CXX_KEYWORDS];

  monaco.languages.registerHoverProvider('c', makeHover(cDocs));
  monaco.languages.registerHoverProvider('cpp', makeHover(cppDocs));
  monaco.languages.registerDefinitionProvider('c', makeDefinition(cDocs));
  monaco.languages.registerDefinitionProvider('cpp', makeDefinition(cppDocs));
  monaco.languages.registerDefinitionProvider('c', headerProvider);
  monaco.languages.registerDefinitionProvider('cpp', headerProvider);
  monaco.languages.registerCompletionItemProvider('c', makeCompletion(cKeywords, cDocs));
  monaco.languages.registerCompletionItemProvider('cpp', makeCompletion(cppKeywords, cppDocs));

  // Ctrl+点击（跳转到定义）时，拦截自定义的 wonder-doc / wonder-header 地址，
  // 通过事件通知 React 打开应用内文档面板或头文件（不再跳系统浏览器）。
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource) {
      if (!resource) return false;
      if (resource.scheme === 'wonder-doc') {
        const name = decodeURIComponent(resource.path.replace(/^\//, ''));
        window.dispatchEvent(new CustomEvent('wonder-doc-open', { detail: { name } }));
        return true;
      }
      if (resource.scheme === 'wonder-header') {
        const kind = resource.authority; // 'sys' | 'local'
        const name = decodeURIComponent(resource.path.replace(/^\//, ''));
        window.dispatchEvent(new CustomEvent('wonder-header-open', { detail: { kind, name } }));
        return true;
      }
      return false;
    },
  });
}
