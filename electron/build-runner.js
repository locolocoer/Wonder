'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { decodeOutput } = require('./decode');

const MAXBUF = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT = 15000;

function runCmd(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        maxBuffer: MAXBUF,
        timeout: opts.timeout || DEFAULT_TIMEOUT,
        windowsHide: true,
        env: opts.env || process.env,
        encoding: 'buffer',
      },
      (err, stdout, stderr) => {
        const out = decodeOutput(stdout);
        const errOut = decodeOutput(stderr);
        if (err) {
          const timedOut = Boolean(err.killed || err.signal);
          resolve({
            code: typeof err.code === 'number' ? err.code : -1,
            timedOut,
            stdout: out,
            stderr: errOut,
            error: err.message || String(err),
          });
        } else {
          resolve({ code: 0, timedOut: false, stdout: out, stderr: errOut });
        }
      }
    );
  });
}

function walkCFiles(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkCFiles(full, out);
    else if (e.isFile() && /\.c$/i.test(e.name)) out.push(full);
  }
  return out;
}

// Normalize a program dump for comparison: strip \r, right-trim each line,
// drop leading/trailing blank lines.
function normalize(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l, i, arr) => !(i === 0 || i === arr.length - 1) || l.trim() !== '')
    .join('\n');
}

function firstDiffLine(a, b) {
  const la = String(a).split('\n');
  const lb = String(b).split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if ((la[i] || '') !== (lb[i] || '')) return i + 1;
  }
  return -1;
}

function exeName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/**
 * Run the build + test pipeline for a project.
 * payload: { projectDir, ccPath, asmPath, testCases: [], emitLive? }
 * Emits build:log events via `emit(type, text, testId)`.
 */
async function runBuild(payload, emit) {
  const { projectDir, ccPath, testCases = [] } = payload;
  const cc = ccPath || 'gcc';
  const log = (type, text, testId) => emit(type, text, testId);

  const results = [];
  let compileOk = false;

  // 1. Compile the user's compiler.
  const srcDir = path.join(projectDir, 'src');
  const sources = walkCFiles(srcDir);
  if (!sources.length) {
    return {
      ok: false,
      compileOk: false,
      error: '未在 src/ 目录下找到任何 .c 源文件。请先创建你的编译器源码（如 main.c、lexer.c）。',
      results,
    };
  }

  const workDir = path.join(projectDir, '.trainer-tests');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  const compilerBin = path.join(workDir, exeName('mycc'));
  log('info', `使用编译器: ${cc}`);
  log('info', `编译源文件: ${sources.map((s) => path.basename(s)).join(', ')}`);
  const build = await runCmd(cc, ['-o', compilerBin, ...sources], { cwd: projectDir });
  if (build.stderr) log('stderr', build.stderr);
  if (build.stdout) log('stdout', build.stdout);
  if (build.code !== 0) {
    return {
      ok: false,
      compileOk: false,
      error: `你的编译器编译失败（退出码 ${build.code}）。请修复编译错误后重试。`,
      results,
      buildLog: { stdout: build.stdout, stderr: build.stderr },
    };
  }
  compileOk = true;
  log('ok', '编译器构建成功 ✓');

  // 2. Run each test case.
  for (const tc of testCases) {
    log('info', `— 测试 [${tc.mode}] ${tc.name}`, tc.id);
    const srcFile = path.join(workDir, `${tc.id}.c`);
    fs.writeFileSync(srcFile, tc.source || '', 'utf8');
    const steps = [];
    const result = {
      id: tc.id,
      name: tc.name,
      mode: tc.mode,
      pass: false,
      expected: tc.expected ?? '',
      actual: '',
      diffLine: -1,
      note: '',
      description: tc.description || '',
      source: tc.source || '',
      expectedExit: tc.expectedExit,
      actualExit: undefined,
      steps,
    };

    if (tc.mode === 'run') {
      // Compile C -> asm, assemble+link -> exe, run -> compare exit code.
      const asmFile = path.join(workDir, `${tc.id}.s`);
      const exeFile = path.join(workDir, exeName(tc.id));
      const c2s = await runCmd(compilerBin, [srcFile], { cwd: workDir });
      steps.push({ name: '用你的编译器生成汇编', status: c2s.code === 0 ? 'ok' : 'fail', detail: `mycc ${tc.id}.c → ${tc.id}.s` });
      if (c2s.code !== 0) {
        result.note = `你的编译器处理该程序失败（退出码 ${c2s.code}）`;
        result.actual = (c2s.stderr || c2s.stdout || '').slice(0, 2000);
        result.diffLine = -1;
      } else {
        fs.writeFileSync(asmFile, c2s.stdout, 'utf8');
        const link = await runCmd(cc, [asmFile, '-o', exeFile], { cwd: workDir });
        steps.push({ name: 'gcc 汇编 + 链接', status: link.code === 0 ? 'ok' : 'fail', detail: `gcc ${tc.id}.s -o ${tc.id}.exe` });
        if (link.code !== 0) {
          result.note = '生成的汇编无法汇编/链接：' + (link.stderr || '').slice(0, 1500);
          result.actual = c2s.stdout.slice(0, 2000);
        } else {
          const run = await runCmd(exeFile, [], { cwd: workDir });
          result.actualExit = run.code;
          if (run.timedOut) {
            steps.push({ name: '运行程序', status: 'fail', detail: '运行超时（可能死循环）' });
            result.note = '程序运行超时（可能死循环）。';
          } else {
            steps.push({ name: '运行程序', status: 'ok', detail: `退出码 ${run.code}` });
            const exp = tc.expectedExit ?? 0;
            steps.push({ name: '对比退出码', status: run.code === exp ? 'ok' : 'fail', detail: `期望 ${exp}，实际 ${run.code}` });
            if (run.code !== exp) {
              result.note = `期望退出码 ${exp}，实际 ${run.code}`;
              result.actual = `exit=${run.code}` + (run.stdout ? `\nstdout:\n${run.stdout}` : '');
            } else {
              result.pass = true;
              result.actual = `exit=${run.code}` + (run.stdout ? `\nstdout:\n${run.stdout}` : '');
            }
          }
        }
      }
    } else if (tc.mode === 'error') {
      // error: the compiler must exit non-zero; optionally its output contains a substring.
      const flags = (tc.flags || '').split(/\s+/).filter(Boolean);
      const run = await runCmd(compilerBin, [...flags, srcFile], { cwd: workDir });
      const combined = `${run.stdout}\n${run.stderr}`;
      result.actual = combined.slice(0, 2000);
      result.actualExit = run.code;
      steps.push({ name: '用你的编译器处理（期望报错退出）', status: run.code !== 0 ? 'ok' : 'fail', detail: `退出码 ${run.code}` });
      const needle = (tc.expected || '').trim();
      const hasNeedle = !needle || combined.includes(needle);
      steps.push({ name: '检查报错信息', status: hasNeedle ? 'ok' : 'fail', detail: needle ? `报错信息含关键词 "${needle}"` : '仅要求非零退出码' });
      if (run.code === 0) {
        result.note = '期望编译器报错退出（非零退出码），但它正常退出了。';
      } else if (!hasNeedle) {
        result.note = `报错信息中未找到期望的关键词 "${needle}"。`;
      } else {
        result.pass = true;
        result.note = `正确报错退出（退出码 ${run.code}）。`;
      }
    } else {
      // tokens / ast / stdout: compare the compiler's stdout against expected.
      const flags = tc.mode === 'tokens' ? ['-t'] : tc.mode === 'ast' ? ['-a'] : (tc.flags || '').split(/\s+/).filter(Boolean);
      const args = tc.noSource ? flags : [...flags, srcFile];
      const run = await runCmd(compilerBin, args, { cwd: workDir });
      result.actualExit = run.code;
      steps.push({ name: '运行编译器', status: run.code === 0 ? 'ok' : 'fail', detail: `mycc ${args.join(' ')}` });
      if (run.code !== 0) {
        result.note = `编译器退出码 ${run.code}：${(run.stderr || run.stdout || '').slice(0, 1500)}`;
        result.actual = run.stdout;
      } else {
        const stripWs = (s) => String(s ?? '').replace(/\s+/g, '');
        const expectedNorm = tc.mode === 'ast' ? stripWs(tc.expected) : normalize(tc.expected ?? '');
        const actualNorm = tc.mode === 'ast' ? stripWs(run.stdout) : normalize(run.stdout);
        result.actual = run.stdout;
        const matches = expectedNorm === actualNorm;
        steps.push({ name: '对比输出', status: matches ? 'ok' : 'fail', detail: matches ? '输出一致' : '输出不一致' });
        if (matches) {
          result.pass = true;
        } else {
          result.diffLine = firstDiffLine(normalize(tc.expected ?? ''), normalize(run.stdout));
          result.note = '输出与期望不一致（见差异）。';
        }
      }
    }
    if (result.pass) log('ok', `✓ 通过 ${tc.name}`, tc.id);
    else log('fail', `✗ 未通过 ${tc.name}：${result.note}`, tc.id);
    results.push(result);
  }

  const passCount = results.filter((r) => r.pass).length;
  return {
    ok: true,
    compileOk,
    passCount,
    failCount: results.length - passCount,
    total: results.length,
    results,
  };
}

module.exports = { runBuild, runCmd, normalize, firstDiffLine };
