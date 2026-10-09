'use strict';

// 把子进程输出的原始字节解码为字符串。
// 中文 Windows 的控制台程序常按 GBK/GB2312 输出；Node 默认按 UTF-8 解码会乱码。
// 用「严格 UTF-8（fatal）失败则回退 GBK」代替旧的「出现 U+FFFD 就回退」启发式，
// 避免两个方向的误判（GBK 恰好形成合法 UTF-8 / UTF-8 恰好含 U+FFFD）。
function decodeOutput(buf) {
  if (!buf || !buf.length) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf8');
    }
  }
}

// 流式解码器：跨 chunk 保持状态，避免多字节字符被 50ms 防抖边界切断；
// 一旦发现非法 UTF-8，整体回退到 GBK 并只补发此前未输出的部分。
function createStreamDecoder() {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  let gbk = null;
  let buf = Buffer.alloc(0);
  let emitted = 0;

  function push(chunk) {
    if (!chunk || !chunk.length) return '';
    buf = Buffer.concat([buf, chunk]);
    if (!gbk) {
      try {
        const text = utf8.decode(chunk, { stream: true });
        emitted += text.length;
        return text;
      } catch {
        gbk = new TextDecoder('gbk');
        const full = gbk.decode(buf, { stream: true });
        const tail = full.slice(emitted);
        emitted = full.length;
        return tail;
      }
    }
    const text = gbk.decode(chunk, { stream: true });
    emitted += text.length;
    return text;
  }

  return { push };
}

module.exports = { decodeOutput, createStreamDecoder };
