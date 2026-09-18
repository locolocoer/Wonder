import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

// 基于 xterm.js 的终端（VS Code 同款渲染），后端为 cmd 命令会话。
export function Terminal({ initialCwd }: { initialCwd: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const cwdRef = useRef(initialCwd || 'C:\\');
  const lineRef = useRef('');
  const busyRef = useRef(false);

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
    fitRef.current = fit;

    const prompt = () => `${cwdRef.current}>`;

    term.writeln('\x1b[90mWonder 终端 — 输入命令后回车执行；Ctrl+C 中断；Ctrl+L 清屏。\x1b[0m');
    term.write(prompt());

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
      fitRef.current = null;
    };
  }, []);

  return <div className="terminal-xterm" ref={hostRef} />;
}
