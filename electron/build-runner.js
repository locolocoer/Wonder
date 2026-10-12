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

function walkSources(dir, language, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  const re = language === 'cpp' ? /\.(cpp|cc|cxx)$/i : /\.c$/i;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkSources(full, language, out);
    else if (e.isFile() && re.test(e.name)) out.push(full);
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
  const { projectDir, ccPath, testCases = [], language = 'c', kind = 'compiler' } = payload;
  const cc = ccPath || (language === 'cpp' ? 'g++' : 'gcc');
  const log = (type, text, testId) => emit(type, text, testId);

  const results = [];
  let compileOk = false;

  // 1. Compile the user's sources.
  const srcDir = path.join(projectDir, 'src');
  const sources = walkSources(srcDir, language);
  if (!sources.length) {
    const ext = language === 'cpp' ? '.cpp' : '.c';
    return {
      ok: false,
      compileOk: false,
      error: `未在 src/ 目录下找到任何 ${ext} 源文件。请先创建源码（如 main${ext}）。`,
      results,
    };
  }

  const workDir = path.join(projectDir, '.trainer-tests');
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });

  if (kind === 'httpd') {
    return await runHttpTests({ cc, sources, projectDir, workDir, testCases, log });
  }
  if (kind === 'os') {
    return await runOsTests({ cc, sources, projectDir, workDir, testCases, language, log });
  }

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
    // 用例 id 只用于生成临时文件名，须净化，防止 ../ 越界写文件
    const tid = String(tc.id || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'test';
    log('info', `— 测试 [${tc.mode}] ${tc.name}`, tc.id);
    const srcFile = path.join(workDir, `${tid}.c`);
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
      const asmFile = path.join(workDir, `${tid}.s`);
      const exeFile = path.join(workDir, exeName(tid));
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

// ---- HTTP 服务器课程：编译 server，启动后发起真实请求校验状态码/正文 ----
function httpRequest(port, reqPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const req = http.get({ host: '127.0.0.1', port, path: reqPath, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('请求超时')); });
    req.on('error', reject);
  });
}

function killTree(child) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      const { spawn } = require('child_process');
      const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      tk.on('error', () => {});
      tk.unref();
    } catch {
      /* ignore */
    }
  }
  try {
    child.kill();
  } catch {
    /* ignore */
  }
}

async function runHttpTests({ cc, sources, projectDir, workDir, testCases, log }) {
  const serverBin = path.join(workDir, exeName('server'));
  log('info', `使用编译器: ${cc}`);
  log('info', `编译源文件: ${sources.map((s) => path.basename(s)).join(', ')}`);
  const build = await runCmd(cc, ['-o', serverBin, ...sources], { cwd: projectDir });
  if (build.stderr) log('stderr', build.stderr);
  if (build.code !== 0) {
    return {
      ok: false,
      compileOk: false,
      error: `服务器编译失败（退出码 ${build.code}）。请修复编译错误后重试。`,
      results: [],
      buildLog: { stdout: build.stdout, stderr: build.stderr },
    };
  }
  log('ok', '服务器构建成功 ✓');

  const results = [];
  for (const tc of testCases) {
    log('info', `— 测试 ${tc.name}`, tc.id);
    const docRoot = path.join(workDir, 'www');
    fs.mkdirSync(docRoot, { recursive: true });
    const relFile = (tc.path || '/index.html').replace(/^\/+/, '');
    const filePath = path.join(docRoot, relFile);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, tc.source || '', 'utf8');

    const port = tc.port || (20000 + Math.floor(Math.random() * 20000));
    const { spawn } = require('child_process');
    const child = spawn(serverBin, [String(port), docRoot], { cwd: workDir, windowsHide: true });
    const result = {
      id: tc.id,
      name: tc.name,
      mode: 'http',
      pass: false,
      expected: `status ${tc.expectedStatus ?? 200}` + (tc.expected ? ` 含 "${tc.expected}"` : ''),
      actual: '',
      diffLine: -1,
      note: '',
      description: tc.description || '',
      source: tc.source || '',
      steps: [],
    };
    try {
      await new Promise((r) => setTimeout(r, 400));
      const resp = await httpRequest(port, tc.path || '/', 3000);
      const statusOk = resp.status === (tc.expectedStatus ?? 200);
      const bodyOk = tc.expected ? String(resp.body).includes(tc.expected) : true;
      result.actual = `status ${resp.status}` + (resp.body ? ` body: ${resp.body.slice(0, 200)}` : '');
      result.steps.push({ name: '发起请求', status: statusOk && bodyOk ? 'ok' : 'fail', detail: `GET ${tc.path || '/'} → ${resp.status}` });
      if (!statusOk) result.note = `期望状态 ${tc.expectedStatus ?? 200}，实际 ${resp.status}`;
      else if (!bodyOk) result.note = `响应正文未包含 "${tc.expected}"`;
      result.pass = statusOk && bodyOk;
    } catch (e) {
      result.note = '请求失败：' + (e && e.message ? e.message : String(e));
      result.steps.push({ name: '发起请求', status: 'fail', detail: result.note });
    } finally {
      killTree(child);
    }
    if (result.pass) log('ok', `✓ 通过 ${tc.name}`, tc.id);
    else log('fail', `✗ 未通过 ${tc.name}：${result.note}`, tc.id);
    results.push(result);
  }

  const passCount = results.filter((r) => r.pass).length;
  return { ok: true, compileOk: true, passCount, failCount: results.length - passCount, total: results.length, results };
}

// ---- 操作系统课程：把学生 src 与测试程序（含 main）一起编译运行，校验退出码/输出 ----
async function runOsTests({ cc, sources, projectDir, workDir, testCases, language, log }) {
  const results = [];
  let compileOk = true;
  for (const tc of testCases) {
    log('info', `— 测试 ${tc.name}`, tc.id);
    const testSrc = path.join(workDir, `${tc.id}_test.c`);
    fs.writeFileSync(testSrc, tc.source || '', 'utf8');
    const testBin = path.join(workDir, exeName(tc.id + '_test'));
    const incDir = path.join(projectDir, 'src');
    const build = await runCmd(cc, ['-I', incDir, '-o', testBin, ...sources, testSrc], { cwd: projectDir, timeout: 20000 });
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
      expectedExit: tc.expectedExit ?? 0,
      actualExit: undefined,
      steps: [],
    };
    if (build.code !== 0) {
      compileOk = false;
      result.note = `编译测试程序失败：${(build.stderr || build.stdout || '').slice(0, 1500)}`;
      result.steps.push({ name: '编译测试程序', status: 'fail', detail: '退出码 ' + build.code });
    } else {
      result.steps.push({ name: '编译测试程序', status: 'ok', detail: 'ok' });
      const run = await runCmd(testBin, [], { cwd: workDir, timeout: 5000 });
      result.actualExit = run.code;
      if (tc.mode === 'stdout') {
        const exp = normalize(tc.expected ?? '');
        const act = normalize(run.stdout);
        result.actual = run.stdout;
        result.steps.push({ name: '运行并对比输出', status: exp === act ? 'ok' : 'fail', detail: exp === act ? '输出一致' : '输出不一致' });
        if (exp === act) result.pass = true;
        else { result.diffLine = firstDiffLine(normalize(tc.expected ?? ''), normalize(run.stdout)); result.note = '输出与期望不一致'; }
      } else {
        const exp = tc.expectedExit ?? 0;
        result.steps.push({ name: '运行并对比退出码', status: run.code === exp ? 'ok' : 'fail', detail: `期望 ${exp}，实际 ${run.code}` });
        if (run.code !== exp) result.note = `期望退出码 ${exp}，实际 ${run.code}`;
        else result.pass = true;
      }
    }
    if (result.pass) log('ok', `✓ 通过 ${tc.name}`, tc.id);
    else log('fail', `✗ 未通过 ${tc.name}：${result.note}`, tc.id);
    results.push(result);
  }
  const passCount = results.filter((r) => r.pass).length;
  return { ok: true, compileOk, passCount, failCount: results.length - passCount, total: results.length, results };
}

module.exports = { runBuild, runCmd, normalize, firstDiffLine };
