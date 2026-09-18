'use strict';

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
    throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 600)}`);
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
