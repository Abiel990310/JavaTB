# JavaTB — working notes for Claude

An interactive Java textbook. Every code sample is compiled by a real compiler
and every practice problem is auto-graded.

**Status: Parts 1, 2 and 3 are complete.** Wave 0 (the engine), Wave A
(1.1–1.7), Wave B (2.1–2.12) and Wave C (3.1–3.5) in `docs/ROADMAP.md` are
done. Wave D is under way: 4.1 is written. As of the
last full run: 128 samples and 50 problems, all verified. The site is live at
https://abiel990310.github.io/JavaTB/ — Pages is enabled, so every push to
`main` republishes it.

This is a sibling of **CppTB** (`Abiel990310/CppTB`), a finished 82-chapter C++
book built on the same engine. CppTB is **paused** — do not write C++ chapters
unless the author says to switch back. The two books are expected to merge into
one multi-language site eventually, which is what the portability rule below is
for.

**Read `docs/AUTHORING.md` before writing any chapter.** It holds the voice, the
chapter template, and the widget syntax. This file is the map; that one is the
method.

## The one rule

Nothing in this book ships unverified. Two scripts enforce it, and both must
pass before any commit:

```bash
npm run verify      # snippets compile, problems grade, types check
```

If a claim cannot be demonstrated by a program that runs, either write the
program or delete the claim. A textbook that is confidently wrong is worse than
one that is short.

## Keep the engine portable

Everything specific to Java lives in exactly two files: **`build/language.ts`**
(fence word, versions, flags, grammars, how an uncaught exception announces
itself) and **`server/compile.ts`** (javac, java, javap). If you find yourself
typing `java` anywhere else in `build/`, `src/` or `scripts/`, it belongs in
`language.ts` instead.

That is not tidiness for its own sake. Merging this book and CppTB into one site
is a file move if the split holds and a rewrite if it does not. The custom
elements are named `tb-runner`, `tb-exercise`, `tb-memviz`, `tb-quiz` for the
same reason, and the env vars are `TB_BASE` and `TB_COMPILER`.

## Layout

| Path | What it is |
|---|---|
| `content/NN-part/NN-chapter.md` | The book. Directory = part, file = chapter; `NN-` sets order only. |
| `content/exercises/*.md` | The problem bank. One file per problem, self-contained. |
| `build/language.ts` | **Everything Java-specific about the engine.** Start here. |
| `build/markdown.ts` | Markdown → HTML, and the custom `:::` syntax. |
| `src/components/` | The four web components: runner, exercise, memviz, quiz. |
| `src/lib/harness.ts` | The Java harness that grades submissions. Change with care. |
| `server/compile.ts` | Local compile-and-run backend: javac, java, javap. |
| `scripts/` | The verifiers. Run them; do not skip them. |
| `docs/ROADMAP.md` | **What to write next.** Start here each session. |

## Commands

```bash
npm run dev        # localhost:5173, live reload on content changes
npm run verify     # everything below, in one go
npm run verify:snippets [chapter-slug]   # compile every runnable sample
npm run verify:problems [problem-id...]  # solutions pass, starters fail
npm run build && npm run serve           # static build + local compiler on :4173
```

Compilation needs a JDK 21 `javac` on PATH. Without it the site still works —
the browser falls back to Compiler Explorer's public API — but the verify
scripts will not run.

## How a session should go

1. Open `docs/ROADMAP.md`; take the top unticked chapter in the earliest
   incomplete wave.
2. Read its neighbours so the voice and the assumed knowledge carry over, and
   read its front-matter — the objectives are fixed and are a contract.
3. Write it against the template in `docs/AUTHORING.md`.
4. Add its problems — two at minimum, at least one `check: unit`.
5. `npm run verify`. Fix what it reports. It is never wrong about compilation —
   when it contradicts the prose, the prose is wrong.
6. Flip `status: draft` to `status: complete` — that is what moves the bar on
   `/progress/`.
7. Commit one chapter per commit, message `content: write "<chapter title>"`.

One chapter per session is a good pace. Do not batch five half-written chapters;
a finished chapter is worth more than five outlines, and the outlines already
exist.

## Scheduling

One Routine is active: **`trig_017zYznE5wwj44ZGRirzmBRL`**, every three hours,
which resumes the *existing* long-running session rather than spawning a new
one — so it keeps its context instead of re-reading everything. It used to point
at CppTB and was retargeted at this book.

- **Do not create a second Routine** for the same job. Check with
  `list_triggers` first and edit the existing one with `update_trigger`.
- A second, hourly Routine (`trig_01SZHxiCeEjK5AB26FfzDjQH`) that spawned a
  fresh session per run is **disabled** and should stay that way: a cold start
  re-reads this file, the authoring guide and two neighbouring chapters before
  writing a line, which cost far more than it produced.
- **Pushing `main` deploys the site.** `.github/workflows/deploy.yml` builds
  with the Pages sub-path base and force-pushes `dist/` to `gh-pages`. GitHub
  Pages has to be enabled on the repository by hand first — nothing in this
  repo can do that. The `gh-pages` branch is generated output; never edit or
  commit to it by hand.

## Invariants that are easy to break

- **Every chapter's front-matter needs `objectives`.** `/reference/` and
  `/progress/` are generated from it, and a chapter with no objectives silently
  becomes a blank row.
- **Titles containing a colon must be quoted** in YAML front-matter.
- **`status: complete` is a claim.** Set it only when the prose is finished, the
  samples run, and the recap is written.
- **Exercise ids are URLs.** Renaming one breaks `/practice/<id>/` and any
  `:::exercise` reference. Grep before renaming.
- **Every runnable sample is `public class Main`.** The backend compiles
  `Main.java` and runs `Main`; a sample declaring any other public class fails
  to compile. Use `// [hidden]` for the scaffolding you do not want shown.
- **A `check: unit` problem's code is members, not a program.** Static methods,
  nested static classes, records, enums — no top-level class, no `main`. The
  harness supplies both.
- **The harness's regions must stay exact.** `buildSubmission` records where the
  reader's code and the checks start, and `remapPositions` uses those to turn
  `Main.java:57` into `your code:3`. Java has no `#line`, so nothing else does
  this. If you touch `src/lib/harness.ts`, re-run `npm run verify:problems` —
  an off-by-one there is invisible until a reader is told the error is on a
  blank line.
- **There is no `expect-ub`.** Java has no undefined behaviour; a sample meant
  to fail uses `expect-throw` or `expect-failure`.
- **Timing samples must warm up.** HotSpot interprets before it compiles, so a
  loop timed on its first run measures the interpreter. See the measuring
  section in `docs/AUTHORING.md` — a number produced without warmup is fiction,
  and this book does not print fiction.
- **`content/` is the only source of truth for structure.** There is no separate
  nav or TOC file to update; adding a `.md` file adds a chapter.
