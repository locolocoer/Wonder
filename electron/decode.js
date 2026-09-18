'use strict';

// 把子进程输出的原始字节解码为字符串。
// 中文 Windows 的控制台程序常按 GBK/GB2312 输出；Node 默认按 UTF-8 解码会乱码。
// 策略：先按 UTF-8 解码；若出现替换字符 U+FFFD，说明原始不是 UTF-8，改用 GBK 解码。
function decodeOutput(buf) {
  if (!buf || !buf.length) return '';
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gbk').decode(buf);
  } catch {
    return utf8;
  }
}

module.exports = { decodeOutput };
