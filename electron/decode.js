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

// 流式解码器：跨 chunk 保持状态，避免多字节字符被 50ms 防抖边界切断。
// 纯 ASCII 直接透传（UTF-8 与 GBK 下一致）；一旦出现非 ASCII 字节，用严格 UTF-8 判定编码，
// 之后用持久 TextDecoder 流式解码，无回溯重解、无无限缓冲。
function createStreamDecoder() {
  let decoder = null;

  function push(chunk) {
    if (!chunk || !chunk.length) return '';
    if (!decoder) {
      let ascii = true;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] > 0x7f) {
          ascii = false;
          break;
        }
      }
      if (ascii) return chunk.toString('utf8');
      let enc = 'utf-8';
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(chunk, { stream: true });
      } catch {
        enc = 'gbk';
      }
      decoder = new TextDecoder(enc);
      return decoder.decode(chunk, { stream: true });
    }
    return decoder.decode(chunk, { stream: true });
  }

  return { push };
}

module.exports = { decodeOutput, createStreamDecoder };
