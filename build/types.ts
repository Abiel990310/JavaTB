/** Shared content-model types used by the build pipeline and the client. */

export type Difficulty = 'intro' | 'core' | 'stretch' | 'deep';

/**
 * How a submission is judged.
 * - `unit`   the reader writes declarations; the Tests section is a body of
 *            check/checkEq calls that runs inside a generated main().
 * - `output` the reader writes a whole program. With a `## Cases` section it is
 *            judged like a contest judge — every case run separately, each with
 *            its own stdin and expected stdout. Without one, the Tests section
 *            is the exact stdout it must produce for the single `stdin`.
 */
export type CheckMode = 'unit' | 'output';

/**
 * One input/output pair for a judge-style problem. Cases run independently;
 * a submission passes only if every one of them matches.
 */
export interface JudgeCase {
  /** Shown to the reader when the case is a sample, and in failure reports. */
  readonly name: string;
  readonly stdin: string;
  readonly expected: string;
  /** Sample cases are shown in the prompt; the rest are hidden until failure. */
  readonly sample: boolean;
}

/** One heading extracted from a chapter, used to build the "on this page" rail. */
export interface Heading {
  readonly id: string;
  readonly text: string;
  readonly level: 2 | 3;
}

/** A single chapter: one Markdown file under content/. */
export interface Chapter {
  readonly slug: string;
  readonly partSlug: string;
  readonly title: string;
  /** Short label for the sidebar, when the full title is too long. */
  readonly navTitle: string;
  /** One-sentence description shown on part landing pages and in search. */
  readonly summary: string;
  /** What the reader should be able to do after this chapter. */
  readonly objectives: readonly string[];
  /** Chapter slugs a reader is assumed to have read. */
  readonly requires: readonly string[];
  /** Language version the chapter's code assumes, e.g. "java21". */
  readonly standard: string;
  readonly status: 'draft' | 'complete';
  readonly order: number;
  readonly headings: readonly Heading[];
  /** Exercise ids referenced by this chapter, in order of appearance. */
  readonly exercises: readonly string[];
  readonly words: number;
  readonly html: string;
  /** Plain text, for the search index. */
  readonly text: string;
}

/** A part: one directory under content/, holding chapters. */
export interface Part {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly order: number;
  readonly chapters: readonly Chapter[];
}

/** A practice problem from content/exercises/. */
export interface Exercise {
  readonly id: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  /** Chapter slug this problem belongs to, if any. */
  readonly chapter: string;
  readonly topics: readonly string[];
  readonly standard: string;
  readonly check: CheckMode;
  /** Text piped to the program's stdin, for `output` problems that read input. */
  readonly stdin: string;
  /**
   * Judge cases, for `output` problems that declare a `## Cases` section.
   * Empty for every other problem, in which case `stdin`/`tests` are used.
   */
  readonly cases: readonly JudgeCase[];
  /** Wall-clock budget per case, in milliseconds. 0 means the server default. */
  readonly timeLimitMs: number;
  /** Prompt, rendered from Markdown. */
  readonly promptHtml: string;
  readonly starter: string;
  /** Appended to the reader's submission; should assert on behaviour. */
  readonly tests: string;
  /** Progressive hints, rendered from Markdown. */
  readonly hints: readonly string[];
  readonly solution: string;
  readonly solutionNotesHtml: string;
}

export interface Book {
  readonly title: string;
  readonly parts: readonly Part[];
  readonly exercises: readonly Exercise[];
}

/** Flat entry used by the client-side router, search, and prev/next links. */
export interface NavEntry {
  readonly slug: string;
  readonly title: string;
  readonly part: string;
  readonly url: string;
}
