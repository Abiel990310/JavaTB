/**
 * Compiles every runnable code sample in the book.
 *
 * A sample marked `run` or `bytecode` must compile, run, and exit cleanly; one
 * marked `expect-error` must not compile; one marked `expect-throw` must die
 * with an uncaught exception; one marked `expect-failure` runs to completion
 * but reports failure through a non-zero exit status, the way a test runner
 * does. Samples with none of those flags are illustrative fragments and are
 * skipped.
 *
 *   node --experimental-strip-types scripts/verify-snippets.ts [chapter-slug]
 *
 * Samples are compiled concurrently: a JVM start costs roughly a second, which
 * is an order of magnitude more than g++ spends on a comparable C++ sample, and
 * a serial sweep of a finished book would take long enough that nobody would
 * run it before committing.
 */
import { readdir, readFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { compileAndRun } from '../server/compile.ts';
import { LANGUAGE } from '../build/language.ts';

const F = LANGUAGE.flags;

interface Snippet {
  file: string;
  index: number;
  flags: Set<string>;
  standard: string;
  source: string;
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md') && !path.includes('exercises')) files.push(path);
  }
  return files;
}

function extract(file: string, text: string): Snippet[] {
  const snippets: Snippet[] = [];
  const fence = new RegExp(`^\`\`\`${LANGUAGE.fence}([^\\n]*)\\n([\\s\\S]*?)^\`\`\``, 'gm');
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = fence.exec(text)) !== null) {
    index += 1;
    const info = match[1].trim();
    const flags = new Set(info.split(/\s+/).filter(Boolean));
    if (!flags.has(F.run) && !flags.has(F.disassemble)) continue;

    const std = /std=(\S+)/.exec(info)?.[1] ?? LANGUAGE.defaultStandard;
    // `// [hidden]` lines are compiled but not shown to the reader.
    const source = match[2].replace(/\s*\/\/\s*\[hidden\]\s*$/gm, '');
    snippets.push({ file, index, flags, standard: std, source });
  }
  return snippets;
}

interface Outcome {
  label: string;
  ok: boolean;
  note: string;
}

async function check(snippet: Snippet): Promise<Outcome> {
  const label = `${snippet.file} #${snippet.index}`;
  const expectError = snippet.flags.has(F.expectError);
  const expectThrow = snippet.flags.has(F.expectThrow);
  const expectFailure = snippet.flags.has(F.expectFailure);

  const result = await compileAndRun({
    source: snippet.source,
    standard: snippet.standard,
    action: snippet.flags.has(F.disassemble) && !snippet.flags.has(F.run) ? 'bytecode' : 'run',
  });

  if (expectError) {
    return result.compiled
      ? { label, ok: false, note: 'marked expect-error but it compiled' }
      : { label, ok: true, note: 'fails to compile, as intended' };
  }

  if (!result.compiled) {
    return {
      label,
      ok: false,
      note: result.diagnostics.split('\n').slice(0, 3).join('\n         '),
    };
  }

  if (result.timedOut) {
    return { label, ok: false, note: 'timed out' };
  }

  // A test-runner demonstration signals failure the way a real one does.
  if (expectFailure) {
    return result.exitCode !== 0
      ? { label, ok: true, note: `exits ${result.exitCode}, as intended` }
      : { label, ok: false, note: 'marked expect-failure but it exited 0' };
  }

  // A sample marked expect-throw exists to show a program dying on purpose.
  // If it starts exiting cleanly, the prose around it has become a lie.
  if (expectThrow) {
    return result.exitCode !== 0 && LANGUAGE.uncaughtReport.test(result.stderr)
      ? { label, ok: true, note: 'throws on purpose, as intended' }
      : { label, ok: false, note: 'marked expect-throw but nothing was thrown' };
  }

  // A sample may write to stderr deliberately — the logging chapter does.
  // Only an exception nobody caught means the sample is not what it claims.
  if (LANGUAGE.uncaughtReport.test(result.stderr)) {
    return { label, ok: false, note: `threw: ${result.stderr.split('\n')[0]}` };
  }
  if (result.exitCode !== 0) {
    const why = result.stderr.trim().split('\n')[0] || `exit code ${result.exitCode}`;
    return { label, ok: false, note: `exited with ${result.exitCode}: ${why}` };
  }
  return {
    label,
    ok: true,
    note: result.diagnostics.trim() ? `warns: ${result.diagnostics.split('\n')[0]}` : '',
  };
}

const only = process.argv[2];
const files = (await markdownFiles('content')).filter((f) => !only || f.includes(only));

const queue: Snippet[] = [];
for (const file of files.sort()) {
  queue.push(...extract(file, await readFile(file, 'utf8')));
}

const results = new Array<Outcome>(queue.length);
let next = 0;
const workers = Math.max(1, Math.min(availableParallelism(), 8));

await Promise.all(
  Array.from({ length: workers }, async () => {
    for (let i = next++; i < queue.length; i = next++) {
      results[i] = await check(queue[i]);
    }
  }),
);

let failures = 0;
for (const outcome of results) {
  if (outcome.ok) {
    console.log(`  ok   ${outcome.label}${outcome.note ? ` (${outcome.note})` : ''}`);
  } else {
    failures += 1;
    console.log(`FAIL   ${outcome.label}: ${outcome.note}`);
  }
}

console.log(
  failures === 0
    ? `\nAll ${queue.length} runnable samples behave as documented.`
    : `\n${failures} of ${queue.length} samples are wrong.`,
);
process.exit(failures === 0 ? 0 : 1);
