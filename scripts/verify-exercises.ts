/**
 * Compiles every problem's starter and worked solution against its own checks.
 *
 * A solution that does not pass, or a starter that already passes, means the
 * problem is broken — so this runs in CI and before any content change lands.
 *
 *   node --experimental-strip-types scripts/verify-exercises.ts
 *   node --experimental-strip-types scripts/verify-exercises.ts trim-whitespace two-sum
 *
 * Naming ids checks only those, which is what you want while writing a chapter;
 * the unfiltered run is what CI does.
 */
import { availableParallelism } from 'node:os';
import { loadBook } from '../build/content.ts';
import { compileAndRun } from '../server/compile.ts';
import { LANGUAGE } from '../build/language.ts';
import {
  buildSubmission,
  parseCheckOutput,
  compareOutput,
  remapPositions,
} from '../src/lib/harness.ts';
import type { Exercise } from '../build/types.ts';

const book = await loadBook(process.cwd());

const only = new Set(process.argv.slice(2));
const selected = only.size ? book.exercises.filter((e) => only.has(e.id)) : book.exercises;

for (const id of only) {
  if (!book.exercises.some((e) => e.id === id)) {
    console.log(`FAIL   no problem with id "${id}"`);
    process.exit(1);
  }
}

interface Attempt {
  ok: boolean;
  why: string;
}

/**
 * A judge problem is run once per case, each with its own stdin, and passes
 * only if every case matches. The first failure is what gets reported — naming
 * the case, because "wrong output" on its own is not actionable.
 */
async function attemptCases(exercise: Exercise, code: string): Promise<Attempt> {
  for (const testCase of exercise.cases) {
    const result = await compileAndRun({
      source: code,
      standard: exercise.standard,
      action: 'run',
      stdin: testCase.stdin,
      timeLimitMs: exercise.timeLimitMs,
    });
    if (!result.compiled)
      return { ok: false, why: `did not compile: ${result.diagnostics.split('\n')[0]}` };
    if (result.timedOut) return { ok: false, why: `timed out on ${testCase.name}` };

    if (LANGUAGE.uncaughtReport.test(result.stderr)) {
      return { ok: false, why: `${testCase.name}: ${result.stderr.trim().split('\n')[0]}` };
    }

    const report = compareOutput(result.stdout, testCase.expected);
    if (!report.allPassed) {
      const got = report.checks[0]?.actual ?? '';
      const want = report.checks[0]?.expected ?? '';
      return {
        ok: false,
        why: `${testCase.name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
      };
    }
  }
  return { ok: true, why: '' };
}

async function attempt(exercise: Exercise, code: string): Promise<Attempt> {
  if (exercise.cases.length) return attemptCases(exercise, code);

  const submission = buildSubmission(code, exercise.tests, exercise.check);
  const result = await compileAndRun({
    source: submission.source,
    standard: exercise.standard,
    action: 'run',
    stdin: exercise.stdin,
    timeLimitMs: exercise.timeLimitMs,
  });
  if (!result.compiled) {
    const first = remapPositions(result.diagnostics, submission).split('\n')[0];
    return { ok: false, why: `did not compile: ${first}` };
  }
  if (result.timedOut) return { ok: false, why: 'timed out' };

  const report =
    exercise.check === 'output'
      ? compareOutput(result.stdout, exercise.tests)
      : parseCheckOutput(result.stdout, submission);

  // An exception nobody caught stops the checks partway, so a run that looks
  // like a pass because only the checks before it ran is still a failure.
  if (LANGUAGE.uncaughtReport.test(result.stderr)) {
    const first = remapPositions(result.stderr, submission).trim().split('\n')[0];
    return { ok: false, why: `threw: ${first}` };
  }

  return {
    ok: report.allPassed,
    why: report.failed
      ? `${report.failed} check(s) failed`
      : report.checks.length === 0
        ? 'produced no checks'
        : '',
  };
}

interface Outcome {
  id: string;
  ok: boolean;
  lines: string[];
}

async function verify(exercise: Exercise): Promise<Outcome> {
  const solution = await attempt(exercise, exercise.solution);
  const starter = await attempt(exercise, exercise.starter);

  // A starter that already passes gives the reader nothing to do.
  if (solution.ok && !starter.ok) {
    const shape = exercise.cases.length ? ` (${exercise.cases.length} judge cases)` : '';
    return { id: exercise.id, ok: true, lines: [`  ok   ${exercise.id}${shape}`] };
  }

  const lines = [`FAIL   ${exercise.id}`];
  if (!solution.ok) lines.push(`         solution should pass but ${solution.why}`);
  if (starter.ok) lines.push('         starter already passes — the problem is a no-op');
  return { id: exercise.id, ok: false, lines };
}

const results = new Array<Outcome>(selected.length);
let next = 0;
const workers = Math.max(1, Math.min(availableParallelism(), 8));

await Promise.all(
  Array.from({ length: workers }, async () => {
    for (let i = next++; i < selected.length; i = next++) {
      results[i] = await verify(selected[i]);
    }
  }),
);

let failures = 0;
for (const outcome of results) {
  if (!outcome.ok) failures += 1;
  for (const line of outcome.lines) console.log(line);
}

console.log(
  failures === 0
    ? `\nAll ${selected.length} problems verified.`
    : `\n${failures} of ${selected.length} problems are broken.`,
);
process.exit(failures === 0 ? 0 : 1);
