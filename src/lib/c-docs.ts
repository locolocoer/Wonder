import * as monaco from 'monaco-editor';

// C 标准库常用函数的内置说明：悬浮显示用法，Ctrl+点击跳转到 cppreference 文档。
// 说明文字面向初学者，避免一上来就查英文手册。

interface CDocEntry {
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

let registered = false;

export function registerCDocs(): void {
  if (registered) return;
  registered = true;

  const hoverProvider: monaco.languages.HoverProvider = {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const d = DOCS[word.word];
      if (!d) return null;
      return {
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
        contents: [
          { value: `\`\`\`c\n${d.sig}\n\`\`\`\n\n${d.desc}\n\n*按住 Ctrl 点击可跳转到完整文档*` },
        ],
      };
    },
  };

  const definitionProvider: monaco.languages.DefinitionProvider = {
    provideDefinition(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const d = DOCS[word.word];
      if (!d) return null;
      return {
        uri: monaco.Uri.parse(d.url),
        range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
      };
    },
  };

  for (const lang of ['c', 'cpp']) {
    monaco.languages.registerHoverProvider(lang, hoverProvider);
    monaco.languages.registerDefinitionProvider(lang, definitionProvider);
  }

  // Ctrl+点击（跳转到定义）时，拦截 https 文档地址，改用系统浏览器打开。
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource) {
      if (resource && /^https?:/i.test(resource.toString())) {
        window.api.openExternal(resource.toString());
        return true;
      }
      return false;
    },
  });
}
