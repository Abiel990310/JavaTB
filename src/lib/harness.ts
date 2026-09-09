import type { CheckMode } from '../../build/types.ts';
import { LANGUAGE } from '../../build/language.ts';

/**
 * Assembles what actually goes to the compiler when a reader submits a
 * solution, and reads the results back out.
 *
 * The harness prints machine-readable lines prefixed with `[tb]` so the UI can
 * show a checklist instead of a wall of text. Those lines are filtered out of
 * the output the reader sees.
 *
 * Two things Java forces on us that a C++ version of this file gets for free:
 *
 *  - There is no preprocessor, so `CHECK(x == y)` cannot stringify its own
 *    argument. The harness recovers the text of a check by reading its own
 *    source file back at run time, at the line the stack trace names. If the
 *    file is not readable the checks still run; they are just labelled by line.
 *  - There is no `#line`, so javac and every stack trace report positions in
 *    the generated file. `remapPositions` translates them back to `your code`
 *    and `checks`, which is why every region below is built to a known,
 *    stable line count.
 */

const M = LANGUAGE.marker;

const PRELUDE = String.raw`// ---- checking harness (added automatically) ----
public class Main {
  static int tbPassed = 0;
  static int tbFailed = 0;
  static String[] tbSource = null;

  /** The text of a check, recovered from this file so it can be shown verbatim. */
  static String tbTextAt(int line) {
    if (tbSource == null) {
      try {
        tbSource = new String(
            java.nio.file.Files.readAllBytes(java.nio.file.Path.of("Main.java")),
            java.nio.charset.StandardCharsets.UTF_8).split("\n", -1);
      } catch (Exception e) {
        tbSource = new String[0];
      }
    }
    if (line < 1 || line > tbSource.length) return "check";
    String text = tbSource[line - 1].trim();
    if (text.endsWith(";")) text = text.substring(0, text.length() - 1);
    return text;
  }

  static String tbShow(Object v) {
    if (v == null) return "null";
    if (v instanceof Object[]) return java.util.Arrays.deepToString((Object[]) v);
    if (v instanceof int[]) return java.util.Arrays.toString((int[]) v);
    if (v instanceof long[]) return java.util.Arrays.toString((long[]) v);
    if (v instanceof double[]) return java.util.Arrays.toString((double[]) v);
    if (v instanceof char[]) return java.util.Arrays.toString((char[]) v);
    if (v instanceof boolean[]) return java.util.Arrays.toString((boolean[]) v);
    if (v instanceof byte[]) return java.util.Arrays.toString((byte[]) v);
    if (v instanceof short[]) return java.util.Arrays.toString((short[]) v);
    if (v instanceof float[]) return java.util.Arrays.toString((float[]) v);
    if (v instanceof String) return "\"" + v + "\"";
    return String.valueOf(v);
  }

  static void tbReport(boolean ok, int line, String got, String want) {
    String expr = tbTextAt(line);
    if (ok) {
      tbPassed++;
      System.out.println("MARKER PASS " + line + " " + expr);
      return;
    }
    tbFailed++;
    System.out.println("MARKER FAIL " + line + " " + expr);
    if (want != null) {
      System.out.println("MARKER   expected " + want);
      System.out.println("MARKER   actual   " + got);
    }
  }

  static int tbLine() {
    StackTraceElement[] frames = new Throwable().getStackTrace();
    // 0 is tbLine, 1 is the check method, 2 is whoever called it.
    return frames.length > 2 ? frames[2].getLineNumber() : 0;
  }

  /** Assert that a condition holds. */
  static void check(boolean cond) {
    tbReport(cond, tbLine(), String.valueOf(cond), null);
  }

  /**
   * Assert equality. Overloaded on the primitive types rather than taking two
   * Objects, so that a check on numbers is not quietly defeated by boxing:
   * Integer.valueOf(3).equals(Long.valueOf(3)) is false, which is true to Java
   * and useless in a grader.
   */
  static void checkEq(long a, long b) {
    tbReport(a == b, tbLine(), String.valueOf(a), String.valueOf(b));
  }

  static void checkEq(double a, double b) {
    tbReport(a == b, tbLine(), String.valueOf(a), String.valueOf(b));
  }

  static void checkEq(boolean a, boolean b) {
    tbReport(a == b, tbLine(), String.valueOf(a), String.valueOf(b));
  }

  static void checkEq(char a, char b) {
    tbReport(a == b, tbLine(), "'" + a + "'", "'" + b + "'");
  }

  /** Deep equality, so arrays and nested collections compare by value. */
  static void checkEq(Object a, Object b) {
    tbReport(java.util.Objects.deepEquals(a, b), tbLine(), tbShow(a), tbShow(b));
  }

  static void checkNear(double a, double b, double eps) {
    tbReport(Math.abs(a - b) <= eps, tbLine(), String.valueOf(a), String.valueOf(b));
  }

  /** Assert that running the body throws, and that the exception is of this type. */
  static void checkThrows(Class<? extends Throwable> expected, Runnable body) {
    int line = tbLine();
    try {
      body.run();
      tbReport(false, line, "nothing thrown", expected.getSimpleName());
    } catch (Throwable actual) {
      tbReport(expected.isInstance(actual), line,
               actual.getClass().getSimpleName(), expected.getSimpleName());
    }
  }

  static int tbFinish() {
    System.out.println("MARKER SUMMARY " + tbPassed + " " + tbFailed);
    return tbFailed == 0 ? 0 : 1;
  }
// ---- end harness ----
`.replace(/MARKER/g, M);

/**
 * Java requires imports above the class, but a reader writes them where they
 * are needed. Lift them out and leave a blank line behind, so every later line
 * keeps the number the reader sees in their editor.
 */
const IMPORT = /^[ \t]*import[ \t]+(?:static[ \t]+)?[\w.]+(?:\.\*)?[ \t]*;[ \t]*$/;

function hoistImports(code: string): { imports: string[]; body: string } {
  const imports: string[] = [];
  const body = code
    .split('\n')
    .map((line) => {
      if (!IMPORT.test(line)) return line;
      imports.push(line.trim());
      return '';
    })
    .join('\n');
  return { imports, body };
}

/**
 * Imports every problem gets whether it asks or not. A grader that makes the
 * reader remember `import java.util.List;` is testing the wrong thing.
 */
const STANDARD_IMPORTS = [
  'import java.util.*;',
  'import java.util.function.*;',
  'import java.util.stream.*;',
];

export interface Submission {
  source: string;
  /** Lines added above the reader's code, to translate compiler line numbers. */
  offset: number;
  /** Where each region of the generated file starts, 1-based, and how long it is. */
  regions: readonly { label: string; start: number; lines: number }[];
}

export function buildSubmission(
  userCode: string,
  tests: string,
  mode: CheckMode,
): Submission {
  if (mode === 'output') {
    return {
      source: userCode,
      offset: 0,
      regions: [{ label: 'your code', start: 1, lines: userCode.split('\n').length }],
    };
  }

  const user = hoistImports(userCode);
  const check = hoistImports(tests);
  const imports = [...new Set([...STANDARD_IMPORTS, ...user.imports, ...check.imports])];

  // Assembled as an array of lines rather than by counting newlines in a
  // template: the regions have to be exact, and a trailing newline in what the
  // author wrote is otherwise enough to shift every reported position by one.
  const trimTrailingBlank = (code: string): string[] => {
    const lines = code.split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines;
  };

  const userLines = trimTrailingBlank(user.body);
  const checkLines = trimTrailingBlank(check.body);

  const lines: string[] = [...imports, ...PRELUDE.split('\n').slice(0, -1)];
  const userStart = lines.length + 1;
  lines.push(...userLines);
  lines.push('', '  public static void main(String[] args) throws Exception {');
  const testStart = lines.length + 1;
  lines.push(...checkLines);
  lines.push('    System.exit(tbFinish());', '  }', '}', '');

  return {
    source: lines.join('\n'),
    offset: userStart - 1,
    regions: [
      { label: 'your code', start: userStart, lines: userLines.length },
      { label: 'checks', start: testStart, lines: checkLines.length },
    ],
  };
}

/**
 * Translate positions in the generated file back to what the reader wrote.
 *
 * Applies to compiler diagnostics and to stack traces alike — both name
 * `Main.java:N`, and neither means anything to someone looking at a fifteen-line
 * exercise.
 */
export function remapPositions(text: string, submission: Submission): string {
  if (!submission.regions.length) return text;
  return text.replace(/Main\.java:(\d+)/g, (whole, digits: string) => {
    const line = Number(digits);
    for (const region of submission.regions) {
      if (line >= region.start && line < region.start + region.lines) {
        return `${region.label}:${line - region.start + 1}`;
      }
    }
    return whole;
  });
}

export interface CheckLine {
  ok: boolean;
  line: number;
  expr: string;
  expected?: string;
  actual?: string;
}

export interface CheckReport {
  checks: CheckLine[];
  passed: number;
  failed: number;
  /** Program output with the harness chatter removed. */
  output: string;
  /** True when the harness ran to completion with nothing failing. */
  allPassed: boolean;
}

export function parseCheckOutput(stdout: string, submission?: Submission): CheckReport {
  const checks: CheckLine[] = [];
  const plain: string[] = [];
  let passed = 0;
  let failed = 0;
  let sawSummary = false;

  const toReaderLine = (line: number): number => {
    const region = submission?.regions.find(
      (r) => line >= r.start && line < r.start + r.lines,
    );
    return region ? line - region.start + 1 : line;
  };

  for (const raw of stdout.split('\n')) {
    if (!raw.startsWith(M)) {
      plain.push(raw);
      continue;
    }
    const body = raw.slice(M.length).trim();

    const summary = /^SUMMARY (\d+) (\d+)$/.exec(body);
    if (summary) {
      passed = Number(summary[1]);
      failed = Number(summary[2]);
      sawSummary = true;
      continue;
    }

    const result = /^(PASS|FAIL) (\d+) (.*)$/.exec(body);
    if (result) {
      checks.push({
        ok: result[1] === 'PASS',
        line: toReaderLine(Number(result[2])),
        expr: result[3],
      });
      continue;
    }

    const expected = /^expected (.*)$/.exec(body);
    if (expected && checks.length) {
      checks[checks.length - 1].expected = expected[1];
      continue;
    }
    const actual = /^actual\s+(.*)$/.exec(body);
    if (actual && checks.length) {
      checks[checks.length - 1].actual = actual[1];
    }
  }

  return {
    checks,
    passed,
    failed,
    output: plain.join('\n').replace(/\n+$/, ''),
    allPassed: sawSummary && failed === 0 && passed > 0,
  };
}

/** Compare program output against the expected text, ignoring trailing space. */
export function compareOutput(actual: string, expected: string): CheckReport {
  const norm = (s: string) =>
    s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n+$/, '');
  const ok = norm(actual) === norm(expected);
  return {
    checks: [
      {
        ok,
        line: 0,
        expr: 'program output matches expected output',
        expected: norm(expected),
        actual: norm(actual),
      },
    ],
    passed: ok ? 1 : 0,
    failed: ok ? 0 : 1,
    output: actual,
    allPassed: ok,
  };
}
