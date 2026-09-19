'use strict';

/** 把 HTTP 错误码与返回体翻译成更友好的提示。 */
function friendlyApiError(status, body) {
  const snippet = (body || '').slice(0, 400);
  let hint = '';
  try {
    const j = JSON.parse(body || '{}');
    if (j.error && j.error.message) hint = j.error.message;
  } catch {
    /* keep snippet */
  }
  switch (status) {
    case 401:
      return '鉴权失败：API Key 无效或已过期，请在「设置」里检查并更新。';
    case 402:
      return '余额不足：DeepSeek 账户余额已用完，请前往官网充值。';
    case 403:
      return '无权限访问该模型或接口，请检查 API Key 权限。';
    case 429:
      return '请求过于频繁或超出速率限制，请稍后再试。';
    case 500:
    case 502:
    case 503:
      return `DeepSeek 服务端错误（${status}），请稍后重试。`;
    default:
      return `DeepSeek API 错误（${status}）${hint ? '：' + hint : '：' + snippet}`;
  }
}

/**
 * Stream a DeepSeek chat completion. `emit` receives { type: 'content'|'reasoning'|'error', text }.
 * Returns the concatenated content text.
 */
async function streamChat(payload, emit, signal) {
  const baseUrl = (payload.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;
  const body = {
    model: payload.model || 'deepseek-chat',
    messages: payload.messages || [],
    stream: true,
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.6,
    max_tokens: 8192,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payload.apiKey || ''}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(friendlyApiError(res.status, text));
  }
  if (!res.body) throw new Error('DeepSeek API 无响应流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let content = '';
  let reasoning = '';

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const choice = json.choices && json.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      emit({ type: 'reasoning', text: delta.reasoning_content });
    }
    if (delta.content) {
      content += delta.content;
      emit({ type: 'content', text: delta.content });
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      handleLine(line);
    }
  }
  if (buf.trim()) handleLine(buf);

  return { content, reasoning };
}

module.exports = { streamChat };
