/**
 * Talks to whichever compiler is available.
 *
 * Preference order:
 *   1. `/api/compile` on this origin — present when the site is served by
 *      `npm run dev` or `npm run serve`. Assertions are enabled and the heap is
 *      capped, so a runaway program comes back as a real diagnostic.
 *   2. Compiler Explorer's public API — needs no server, so the statically
 *      hosted book still runs code. It is someone else's free service, so we
 *      keep requests small and infrequent.
 */

export type Action = 'run' | 'bytecode';

export interface CompileRequest {
  source: string;
  standard?: string;
  action?: Action;
  optimization?: string;
  stdin?: string;
  /** Per-run wall-clock budget in ms; the server clamps it to its own maximum. */
  timeLimitMs?: number;
}

export interface CompileResult {
  compiled: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  diagnostics: string;
  bytecode?: string;
  timedOut: boolean;
  durationMs: number;
  compiler: string;
  backend: 'local' | 'hosted';
}

/** The local compile endpoint, if this deployment has one. */
const LOCAL_ENDPOINT = `${import.meta.env.BASE_URL}api/compile`;

const GODBOLT = 'https://godbolt.org/api';

/**
 * Which JDK Compiler Explorer should use, discovered at run time rather than
 * pinned to an id.
 *
 * A hardcoded id is a constant that rots silently: when Compiler Explorer
 * retires a compiler the book stops running code and nothing in this
 * repository fails to tell us. Asking for the list and taking the newest JDK
 * costs one extra request per session and cannot go stale.
 */
let hostedCompiler: Promise<string> | null = null;

function resolveHostedCompiler(): Promise<string> {
  hostedCompiler ??= (async () => {
    const res = await fetch(`${GODBOLT}/compilers/java?fields=id,semver`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(`could not list Compiler Explorer's JDKs (HTTP ${res.status})`);
    }
    const list = (await res.json()) as { id: string; semver?: string }[];
    const version = (semver: string | undefined): number =>
      Number.parseFloat(semver?.replace(/[^\d.]/g, '') || '0') || 0;
    const newest = list
      .filter((c) => c.id)
      .sort((a, b) => version(b.semver) - version(a.semver))[0];
    if (!newest) throw new Error('Compiler Explorer listed no Java compilers');
    return newest.id;
  })().catch((error) => {
    hostedCompiler = null;
    throw error;
  });
  return hostedCompiler;
}

let localAvailable: boolean | null = null;

async function probeLocal(): Promise<boolean> {
  if (localAvailable !== null) return localAvailable;
  try {
    const res = await fetch(LOCAL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'public class Main { public static void main(String[] a) {} }', action: 'run' }),
      signal: AbortSignal.timeout(20_000),
    });
    localAvailable = res.ok;
  } catch {
    localAvailable = false;
  }
  return localAvailable;
}

async function compileLocal(req: CompileRequest): Promise<CompileResult> {
  const res = await fetch(LOCAL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Compile server returned ${res.status}`);
  }
  return { ...((await res.json()) as Omit<CompileResult, 'backend'>), backend: 'local' };
}

const joinText = (parts: unknown): string =>
  Array.isArray(parts)
    ? parts.map((p) => (p as { text?: string }).text ?? '').join('\n')
    : '';

/**
 * Compiler Explorer writes the source to a file whose name it chooses, not
 * ours. javac requires a *public* class to live in a file matching its name,
 * so `public class Main` fails there with "class Main is public, should be
 * declared in a file named Main.java" — which is exactly what readers hit on
 * the statically hosted site. A non-public class carries no such constraint,
 * still compiles to Main.class, and still runs, so dropping the modifier makes
 * one source work under both backends.
 *
 * Only the class declaration is rewritten. A blanket rename of the identifier
 * would corrupt string literals — one problem's expected output contains the
 * word "Main.class" — and would change what the reader's program prints.
 */
export function forHostedCompiler(source: string): string {
  return source.replace(
    /^([ \t]*)public\s+((?:(?:final|abstract|sealed|non-sealed)\s+)*)class\s/m,
    '$1$2class ',
  );
}

async function compileHosted(req: CompileRequest): Promise<CompileResult> {
  const started = performance.now();
  const bytecodeMode = req.action === 'bytecode';
  const compilerId = await resolveHostedCompiler();

  const body = {
    source: forHostedCompiler(req.source),
    lang: 'java',
    allowStoreCodeDebug: false,
    options: {
      userArguments: '-Xlint:all',
      executeParameters: { args: [], stdin: req.stdin ?? '' },
      compilerOptions: { executorRequest: !bytecodeMode, skipAsm: !bytecodeMode },
      // Compiler Explorer serves Java "assembly" as javap output, so the
      // disassembly view needs no filters beyond dropping the noise.
      filters: bytecodeMode
        ? { commentOnly: true, directives: true, labels: true, trim: true, execute: false }
        : { execute: true },
    },
  };

  const res = await fetch(`${GODBOLT}/compiler/${compilerId}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });
  if (!res.ok) throw new Error(`Compiler Explorer returned ${res.status}`);

  const data = (await res.json()) as {
    code?: number;
    stdout?: unknown;
    stderr?: unknown;
    asm?: unknown;
    buildResult?: { code?: number; stderr?: unknown };
    didExecute?: boolean;
  };

  const buildCode = data.buildResult?.code ?? (bytecodeMode ? data.code : 0) ?? 0;
  const diagnostics =
    joinText(data.buildResult?.stderr) || (bytecodeMode ? joinText(data.stderr) : '');

  return {
    compiled: buildCode === 0,
    exitCode: data.code ?? null,
    stdout: joinText(data.stdout),
    stderr: bytecodeMode ? '' : joinText(data.stderr),
    diagnostics,
    bytecode: bytecodeMode ? joinText(data.asm) : undefined,
    timedOut: false,
    durationMs: Math.round(performance.now() - started),
    compiler: `${compilerId} (Compiler Explorer)`,
    backend: 'hosted',
  };
}

export async function compile(req: CompileRequest): Promise<CompileResult> {
  if (await probeLocal()) {
    try {
      return await compileLocal(req);
    } catch (error) {
      // A local server that is up but failing should not strand the reader.
      if (error instanceof Error && /429/.test(error.message)) throw error;
      return compileHosted(req);
    }
  }
  return compileHosted(req);
}

/** Which backend the next request will use, for the UI to label output. */
export async function currentBackend(): Promise<'local' | 'hosted'> {
  return (await probeLocal()) ? 'local' : 'hosted';
}
