/**
 * Everything about this book that is specific to one programming language.
 *
 * The rest of the engine — the markdown pipeline, the four web components, the
 * page templates, the search index — reads from here rather than hard-coding a
 * language. When these books are eventually merged into a single site covering
 * several languages, this is the file that gets one copy per language, and the
 * merge is a file move rather than a rewrite. Keep it that way: if you find
 * yourself typing "java" anywhere else in build/, src/ or scripts/, it belongs
 * here instead.
 */

/** The second thing a runner can show, beside running the program. */
export type Action = 'run' | 'bytecode';

export const LANGUAGE = {
  /** Slug used in URLs and data attributes. */
  id: 'java',
  name: 'Java',

  /** The markdown fence info word: ```java run */
  fence: 'java',
  /** Extra grammars the highlighter must load for this book's samples. */
  grammars: ['java', 'bash', 'xml', 'properties', 'json', 'yaml', 'diff', 'text'],

  /** Source file name the backend compiles. Java requires it to match the class. */
  sourceFile: 'Main.java',
  mainClass: 'Main',

  /**
   * Language versions a chapter may declare in its front-matter, mapped to the
   * `--release` value javac is given. The book is written against Java 21 —
   * the LTS with records, sealed types, pattern matching for switch, text
   * blocks and virtual threads all final.
   */
  standards: { java17: '17', java21: '21' } as Record<string, string>,
  defaultStandard: 'java21',

  /**
   * What the reader can ask a runner to show instead of output. C++ has
   * assembly; Java has bytecode, which is far more readable and is where a
   * surprising number of this book's claims get settled.
   */
  disassembly: { action: 'bytecode' as const, label: 'Bytecode', tool: 'javap' },

  /**
   * Sample flags the snippet verifier understands. A sample with none of the
   * behavioural flags is an illustrative fragment and is not compiled.
   *
   * There is deliberately no `expect-ub` here: Java has no undefined
   * behaviour to catch, so the mistakes this book demonstrates announce
   * themselves as exceptions instead.
   */
  flags: {
    run: 'run',
    disassemble: 'bytecode',
    expectError: 'expect-error',
    /** Dies with an uncaught exception, on purpose. */
    expectThrow: 'expect-throw',
    /** Runs to completion but reports failure through a non-zero exit status. */
    expectFailure: 'expect-failure',
  },

  /** How the JVM announces an uncaught exception, as opposed to ordinary stderr. */
  uncaughtReport: /^(Exception in thread |Caused by: )/m,

  /** Prefix on the grading harness's machine-readable output lines. */
  marker: '[tb]',
} as const;

/** Resolve a front-matter `standard` to the release javac is given. */
export function releaseFor(standard: string | undefined): string {
  return LANGUAGE.standards[standard ?? ''] ?? LANGUAGE.standards[LANGUAGE.defaultStandard];
}
