import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// 基于 xterm.js 的终端（VS Code 同款渲染），后端为 cmd 命令会话。
// 支持：Ctrl+C 复制（选中时）/ 中断、Ctrl+Shift+C/V 复制粘贴、Ctrl+V 粘贴、↑↓ 历史命令、Ctrl+L 清屏。
export function Terminal({ initialCwd }: { initialCwd: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const cwdRef = useRef(initialCwd || 'C:\\');
  const lineRef = useRef('');
  const busyRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);

  useEffect(() => {
    const host = hostRef.current!;
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: '#141414',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
      },
      scrollback: 8000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    const prompt = () => `${cwdRef.current}>`;
    const redrawLine = () => term.write('\r\x1b[K' + prompt() + lineRef.current);

    const historyUp = () => {
      if (historyRef.current.length === 0) return;
      if (histIdxRef.current === -1) histIdxRef.current = historyRef.current.length - 1;
      else if (histIdxRef.current > 0) histIdxRef.current--;
      lineRef.current = historyRef.current[histIdxRef.current];
      redrawLine();
    };
    const historyDown = () => {
      if (histIdxRef.current === -1) return;
      if (histIdxRef.current < historyRef.current.length - 1) {
        histIdxRef.current++;
        lineRef.current = historyRef.current[histIdxRef.current];
      } else {
        histIdxRef.current = -1;
        lineRef.current = '';
      }
      redrawLine();
    };

    term.writeln('\x1b[90mWonder 终端 — 回车执行；Ctrl+C 中断；Ctrl+L 清屏；选中文字后 Ctrl+C 复制；↑↓ 历史命令。\x1b[0m');
    term.write(prompt());

    // 键盘钩子：处理复制/粘贴/历史，优先级高于 xterm 默认行为
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const key = e.key.toLowerCase();

      if (e.ctrlKey && e.shiftKey && key === 'c') {
        const sel = term.getSelection();
        if (sel) window.api.clipboardWriteText(sel);
        return false;
      }
      if (e.ctrlKey && e.shiftKey && key === 'v') {
        const t = window.api.clipboardReadText();
        if (t) term.paste(t);
        return false;
      }
      if (e.ctrlKey && !e.shiftKey && key === 'c') {
        const sel = term.getSelection();
        if (sel) {
          window.api.clipboardWriteText(sel);
          return false; // 有选中 → 复制
        }
        return true; // 无选中 → 交给 ^C（中断）
      }
      if (e.ctrlKey && !e.shiftKey && key === 'v') {
        const t = window.api.clipboardReadText();
        if (t) term.paste(t);
        return false;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        historyUp();
        return false;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        historyDown();
        return false;
      }
      return true;
    });

    const offData = window.api.onEvent('term:data', (text: string) => term.write(text));
    const offExit = window.api.onEvent('term:exit', (info: { code: number; cwd: string }) => {
      busyRef.current = false;
      if (info && info.cwd) cwdRef.current = info.cwd;
      const code = info ? info.code : -1;
      if (code === 0) term.write('\x1b[90m[退出码 0]\x1b[0m\r\n');
      else term.write(`\x1b[31m[退出码 ${code}]\x1b[0m\r\n`);
      term.write(prompt());
    });

    const sub = term.onData((data) => {
      for (const ch of data) {
        if (busyRef.current) {
          if (ch === '\x03') window.api.termKill();
          continue;
        }
        if (ch === '\r') {
          const line = lineRef.current;
          term.write('\r\n');
          lineRef.current = '';
          if (line.trim()) {
            historyRef.current.push(line);
            histIdxRef.current = -1;
            busyRef.current = true;
            window.api.termRun(line);
          } else {
            term.write(prompt());
          }
        } else if (ch === '\x7f' || ch === '\b') {
          if (lineRef.current.length > 0) {
            lineRef.current = lineRef.current.slice(0, -1);
            term.write('\b \b');
          }
        } else if (ch === '\x03') {
          term.write('^C\r\n');
          lineRef.current = '';
          term.write(prompt());
        } else if (ch === '\x0c') {
          term.clear();
          term.write(prompt());
        } else if (ch >= ' ') {
          lineRef.current += ch;
          term.write(ch);
        }
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* ignore */
      }
    });
    ro.observe(host);

    return () => {
      offData();
      offExit();
      sub.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // 工程目录变化时：重置会话并让终端 cd 到新目录
  const prevCwdRef = useRef(initialCwd);
  useEffect(() => {
    if (!initialCwd || prevCwdRef.current === initialCwd) return;
    prevCwdRef.current = initialCwd;
    cwdRef.current = initialCwd;
    lineRef.current = '';
    busyRef.current = false;
    window.api.termReset();
    if (termRef.current) {
      termRef.current.write(`\r\n\x1b[90m[已切换到 ${initialCwd}]\x1b[0m\r\n${initialCwd}>`);
    }
  }, [initialCwd]);

  return <div className="terminal-xterm" ref={hostRef} />;
}
