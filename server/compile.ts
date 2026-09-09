import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LANGUAGE, releaseFor, type Action } from '../build/language.ts';

/**
 * A local compile-and-run backend.
 *
 * SECURITY: this executes reader-supplied Java. The limits below (wall-clock
 * timeouts, a heap cap, file-size rlimits, a scratch directory per request)
 * stop honest mistakes — runaway loops, huge allocations, a file written by
 * accident — but they are NOT a sandbox. Java has not had one since the
 * security manager was removed, so a submitted program can do anything the
 * process user can. Run this behind a container with no network and a
 * throwaway user (see docs/deployment.md), or point the client at a hosted
 * compiler instead.
 */

export type { Action };

export interface CompileRequest {
  source: string;
  /** Front-matter language version, e.g. "java21". */
  standard?: string;
  action?: Action;
  stdin?: string;
  /**
   * Wall-clock budget for the program itself, in milliseconds. Clamped to the
   * server maximum — a judge problem may ask for less than the default so that
   * a solution of the wrong complexity fails the way it would on a real judge,
   * but nothing may ask for more.
   */
  timeLimitMs?: number;
}

export interface CompileResponse {
  compiled: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Compiler diagnostics, separate from the program's own stderr. */
  diagnostics: string;
  /** javap output, when the action asked for it. */
  bytecode?: string;
  timedOut: boolean;
  durationMs: number;
  compiler: string;
}

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 96 * 1024;
/** javac is slower to start than g++ and loads the whole platform module. */
const COMPILE_TIMEOUT_MS = 20_000;
const RUN_TIMEOUT_MS = 6_000;

export const COMPILER = process.env.TB_COMPILER ?? 'javac';
export const RUNTIME = process.env.TB_RUNTIME ?? 'java';
export const DISASSEMBLER = process.env.TB_DISASSEMBLER ?? 'javap';

/**
 * The JVM the reader's program runs on.
 *
 * `-ea` because assertions are a teaching tool and a book that never enables
 * them teaches a language nobody runs. The heap cap replaces the address-space
 * rlimit a native backend would use: `ulimit -v` cannot be used here, because
 * the JVM reserves far more virtual address space than it commits and simply
 * refuses to start under a cap.
 */
const JVM_FLAGS = [
  '-ea',
  '-Xmx512m',
  '-Xss8m',
  '-XX:+ExitOnOutOfMemoryError',
  // A crash log written into the scratch directory helps nobody and can be huge.
  '-XX:-UsePerfData',
];

/** Rewrite scratch paths so diagnostics read as if the file were local. */
function tidyPaths(s: string, dir: string): string {
  return s.split(dir + '/').join('').split(dir).join('');
}

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return `${s.slice(0, MAX_OUTPUT_BYTES)}\n… output truncated at ${MAX_OUTPUT_BYTES} bytes …`;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function run(
  cmd: string,
  args: readonly string[],
  opts: { cwd: string; timeoutMs: number; stdin?: string; env?: Record<string, string> },
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      // Built from nothing rather than inherited. Beyond the usual hygiene,
      // JAVA_TOOL_OPTIONS is set in some environments and the JVM announces it
      // on stderr at every start — which would land in the middle of every
      // sample's output and make the verifier's stderr checks meaningless.
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: opts.cwd,
        TMPDIR: opts.cwd,
        LANG: 'C.UTF-8',
        ...opts.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let size = 0;

    const cap = (chunk: Buffer, sink: 'out' | 'err') => {
      size += chunk.length;
      if (size > MAX_OUTPUT_BYTES * 2) {
        timedOut = false;
        child.kill('SIGKILL');
        return;
      }
      if (sink === 'out') stdout += chunk.toString('utf8');
      else stderr += chunk.toString('utf8');
    };

    child.stdout.on('data', (c: Buffer) => cap(c, 'out'));
    child.stderr.on('data', (c: Buffer) => cap(c, 'err'));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: `${stderr}\n${err.message}`, timedOut });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: truncate(stdout), stderr: truncate(stderr), timedOut });
    });

    if (opts.stdin) child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}

/**
 * Trim javap's output to the part a reader is meant to look at: the constant
 * pool header and the class's own declaration line carry no lesson, and the
 * flags line repeats what the source already said.
 */
function cleanBytecode(text: string, dir: string): string {
  return tidyPaths(text, dir)
    .split('\n')
    .filter((line) => !/^\s*(Compiled from|SourceFile:|MethodParameters|\s*flags:)/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function compileAndRun(req: CompileRequest): Promise<CompileResponse> {
  const started = Date.now();
  const source = req.source ?? '';

  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw Object.assign(new Error('Source exceeds 64 KB'), { status: 413 });
  }

  const release = releaseFor(req.standard);
  const action: Action = req.action === 'bytecode' ? 'bytecode' : 'run';

  // A problem may ask for a shorter budget than the default; never a longer one.
  const requested = Number(req.timeLimitMs ?? 0);
  const runTimeout = requested > 0 ? Math.min(requested, RUN_TIMEOUT_MS) : RUN_TIMEOUT_MS;

  const dir = await mkdtemp(join(tmpdir(), 'javatb-'));
  try {
    const src = join(dir, LANGUAGE.sourceFile);
    await writeFile(src, source, 'utf8');

    const compile = await run(
      COMPILER,
      [
        '--release', release,
        // The warnings a learner benefits from. `-Xlint:all` minus the two that
        // fire on perfectly ordinary teaching code: serial on every small class
        // that happens to be Serializable, and this-escape on constructors that
        // call an overridable method to illustrate exactly that hazard.
        '-Xlint:all,-serial,-this-escape',
        '-encoding', 'UTF-8',
        '-d', dir,
        src,
      ],
      { cwd: dir, timeoutMs: COMPILE_TIMEOUT_MS },
    );

    if (compile.code !== 0) {
      return {
        compiled: false,
        exitCode: compile.code,
        stdout: '',
        stderr: '',
        diagnostics: compile.timedOut ? 'Compilation timed out.' : tidyPaths(compile.stderr, dir),
        timedOut: compile.timedOut,
        durationMs: Date.now() - started,
        compiler: COMPILER,
      };
    }

    if (action === 'bytecode') {
      const dis = await run(
        DISASSEMBLER,
        ['-c', '-p', '-constants', '-cp', dir, LANGUAGE.mainClass],
        { cwd: dir, timeoutMs: COMPILE_TIMEOUT_MS },
      );
      return {
        compiled: true,
        exitCode: dis.code,
        stdout: '',
        stderr: '',
        diagnostics: tidyPaths(compile.stderr, dir),
        bytecode: dis.code === 0 ? cleanBytecode(dis.stdout, dir) : '',
        timedOut: dis.timedOut,
        durationMs: Date.now() - started,
        compiler: `${COMPILER} + ${DISASSEMBLER}`,
      };
    }

    // rlimits: 8 MB files, no core dumps. The heap is capped by -Xmx instead
    // of `ulimit -v`, which the JVM will not start under.
    const exec = await run(
      '/bin/sh',
      [
        '-c',
        `ulimit -f 8192; ulimit -c 0; exec "${RUNTIME}" ${JVM_FLAGS.join(' ')} -cp "${dir}" ${LANGUAGE.mainClass}`,
      ],
      { cwd: dir, timeoutMs: runTimeout, stdin: req.stdin },
    );

    return {
      compiled: true,
      exitCode: exec.code,
      stdout: exec.stdout,
      stderr: tidyPaths(exec.stderr, dir),
      diagnostics: tidyPaths(compile.stderr, dir),
      timedOut: exec.timedOut,
      durationMs: Date.now() - started,
      compiler: COMPILER,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Crude per-client budget so one tab cannot occupy the machine. */
const budgets = new Map<string, { tokens: number; last: number }>();
const RATE_CAPACITY = 12;
const RATE_REFILL_PER_MS = 12 / 60_000;

export function takeToken(client: string): boolean {
  const now = Date.now();
  const entry = budgets.get(client) ?? { tokens: RATE_CAPACITY, last: now };
  entry.tokens = Math.min(RATE_CAPACITY, entry.tokens + (now - entry.last) * RATE_REFILL_PER_MS);
  entry.last = now;
  if (entry.tokens < 1) {
    budgets.set(client, entry);
    return false;
  }
  entry.tokens -= 1;
  budgets.set(client, entry);
  return true;
}
