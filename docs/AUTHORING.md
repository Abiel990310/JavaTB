# How to write a chapter

The book has one job: a reader finishes a chapter able to do something they
could not do before, and believes it because they watched it happen.

## Voice

Write like a good teacher who respects the reader's time.

- **Second person, present tense.** "You get a reference", not "the user will
  receive a reference".
- **Claim, then demonstrate.** Never assert a behaviour without a runnable
  sample the reader can press Run on. If it cannot be demonstrated, say why.
- **Explain the mechanism, not just the rule.** "Prefer `StringBuilder` in a
  loop" is a rule; showing that the `+=` version allocates a new `String` every
  iteration, and timing both, is the reason. Rules without reasons do not
  survive contact with real code.
- **Name the failure mode.** Most Java features have a way to hurt you, and
  they are quieter than C++'s: a `NullPointerException` three frames away, a
  mutable key whose `hashCode` changed, an `equals` without a `hashCode`. Say
  what it is, in a `:::pitfall` or `:::warning`, at the point where the reader
  is most likely to reach for it.
- **No hedging, no cheerleading.** Not "this is a really powerful feature!" —
  say what it does and what it costs.
- **British spelling in prose** (`behaviour`, `optimise`), and the API's own
  spelling in technical terms (`Color`, `Serializable`, `synchronized`).

Assume the reader has read the previous chapters and nothing else. If you need
something from three parts later, either explain it in one sentence or leave it
out.

## Chapter template

```markdown
---
title: "Chapter title"
navTitle: "Short title"          # optional, for the sidebar
summary: >-
  One sentence, shown on part pages and in search results.
objectives:                       # 2-4, each a thing the reader can DO
  - Explain what happens when you compare two Strings with ==
  - Write an equals and hashCode pair that a HashMap can rely on
status: draft                     # flip to `complete` when finished
standard: java21
requires: [previous-chapter-slug] # optional
---

Two or three paragraphs that say why this chapter exists — what problem the
reader has that this solves. No preamble about what you are about to cover.

```java run title="A first demonstration"
// Something that runs and shows the idea in under 20 lines.
```

## A section per idea

Sections are `##`. Aim for four to seven per chapter. Each one earns its place
by teaching a distinct thing.

:::memviz
{ "title": "...", "steps": [...] }
:::

## Check yourself

:::quiz
{ "question": "...", "options": [...] }
:::

## Practice

:::exercise problem-id

:::recap
- Four to six bullets, each one a claim the reader can now defend.
:::
```

A finished chapter runs 1,500–3,000 words, has at least two runnable samples,
one diagram or quiz, and two problems. Longer is not better; the outline exists
so that a topic that needs more room gets its own chapter instead.

## Widget syntax

### Runnable code

````markdown
```java run                     Adds a Run button
```java run bytecode            Adds a Bytecode button too (javap -c)
```java run expect-error        Asserts it must NOT compile
```java run expect-throw        Asserts it dies with an uncaught exception
```java run expect-failure      Asserts it finishes but exits non-zero
```java run std=java17          Sets the language version for this sample
```java run title="Label"       Caption above the block
````

Every runnable sample is a complete program with a `public class Main` and a
`main` method — the backend compiles `Main.java` and runs `Main`. A line ending
in `// [hidden]` is compiled but not shown, which is how a fragment gets its
imports and its `class Main` scaffolding without cluttering the point.

:::note
Write `public class Main` and nothing else. The name is fixed because the local
backend compiles `Main.java`, and the `public` is stripped automatically before
a sample is sent to the hosted fallback, which writes the source to a file it
names itself — javac rejects a public class whose file name does not match, and
that is what readers saw on the live site before `forHostedCompiler` existed.
A sample that names its top-level class anything else will not run for anyone.
:::

All of these assertions are verified. `npm run verify:snippets` fails if an
`expect-error` sample compiles by accident, and equally if an `expect-throw`
sample runs clean — a demonstration of a failure that no longer fails is worse
than none, because the prose still claims it does.

**An ordinary `run` sample must exit 0 and must not throw.** The verifier
checks the exit status and watches stderr for `Exception in thread`. When a
sample is *meant* to die, say which way: `expect-throw` for an uncaught
exception, `expect-failure` for a program that finishes and reports failure
through its exit code, the way a test runner does.

There is deliberately no `expect-ub`. Java has no undefined behaviour to catch,
and inventing a flag for "surprising but specified" would blur the one thing
this book can promise: that the sample does what the prose says it does.

### Measuring anything

Java measurements are wrong by default, and a book that reports them without
saying so is worse than one that reports nothing. Two rules:

- **Warm up, or you are timing the interpreter.** HotSpot runs bytecode
  interpreted until a method is hot, then compiles it. A loop timed on its
  first execution can be ten times slower than the same loop timed after a few
  thousand iterations. Every timing sample must run the work several times and
  report a later run.
- **Consume the result, or it may not happen.** The JIT will delete a
  computation whose result is never used. Accumulate into a field or print a
  checksum derived from the answer.

A sample that ignores either of these will produce a number, and the number
will be fiction. If a claim needs a rigorous benchmark rather than a
demonstration, say in the prose that the figure is indicative and what would be
needed to measure it properly.

**Watch the runner's six-second limit.** That budget is for the program alone —
compilation is separate — but a JVM start costs a good fraction of a second
before `main` runs. Size the work so the whole thing finishes in about a
second.

**A program may not create a file larger than 4 MB.** `server/compile.ts` runs
the JVM under `ulimit -f 8192`, so a sample that writes more than that dies
with `java.io.IOException: File too large` rather than anything readable. Size
file-writing samples well under it, and say in the prose that the figure was
measured at that size — 7.6 is the precedent.

### Callouts

`:::note` `:::tip` `:::pitfall` `:::warning` `:::standards` `:::history`
`:::recap`, closed by `:::`. Use `:::warning` for the errors that are silent
until production — a broken `equals`/`hashCode` contract, a mutated map key, a
shared mutable field with no synchronisation.

### Memory diagrams

A `:::memviz` block holding JSON:

```json
{
  "title": "What a reference assignment copies",
  "code": "optional source shown beside the diagram",
  "steps": [
    {
      "caption": "What happens at this step.",
      "line": 3,
      "note": "optional aside",
      "stack": [
        { "id": "a", "name": "a", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "a.ref" }] }
      ],
      "heap": [ { "id": "h1", "value": "[1, 2, 3]" } ],
      "arrows": [ { "from": "a.ref", "to": "h1" } ]
    }
  ]
}
```

- `anchor` on a field is where an arrow starts; `id` on a box is where it ends.
- `state` on a box: `new` (green), `moved` (faded), `freed` (struck through),
  `danger` (red). On an arrow: `dangling` (red, dashed).
- Steps should change **one** thing each. Four to six steps is the sweet spot.

The diagram earns its place in this book more often than it did in the C++ one:
almost every Java bug that confuses a beginner is a picture of two variables
pointing at one object. Draw that picture.

### Quizzes

Every option needs a `why`, including the correct one. The explanation of the
tempting wrong answer is the part that teaches — write it as carefully as the
prose.

## Writing a problem

One file in `content/exercises/`, front-matter plus five sections:

```markdown
---
id: trim-whitespace              # becomes /practice/trim-whitespace/
title: "Trim without allocating twice"
difficulty: intro | core | stretch | deep
chapter: strings                 # chapter slug this belongs to
topics: [strings, api]           # drives the filters on /practice/
check: unit                      # or `output`
standard: java21
---

The prompt. Say what to write and what counts as correct. State any constraint
that the checks enforce, so failing is informative rather than mysterious.

## Starter
```java
static String trim(String s) {
    return s;   // must compile, and must NOT already pass
}
```

## Tests
```java
checkEq(trim("  hi  "), "hi");
check(trim("").isEmpty());
```

## Hints
- Progressive. The first nudges, the last nearly gives it away.

## Solution
```java
static String trim(String s) { … }
```

## Notes
Why the solution is written this way, and what the interesting check was really
testing.
```

**`check: unit`** — the reader writes *members*, not a program. The harness
wraps them in a `class Main`, puts the Tests section inside a generated `main`,
and runs it. So a starter and a solution consist of `static` methods, and may
also declare nested `static` classes, `record`s, `enum`s and interfaces. What
they must **not** contain is a top-level `class` of their own, or a `main`.

These are available in the Tests section:

| Call | What it does |
|---|---|
| `check(cond)` | Asserts a boolean |
| `checkEq(a, b)` | Equality, by value. Numbers compare numerically, arrays by contents |
| `checkNear(a, b, eps)` | Floating-point comparison with a tolerance |
| `checkThrows(SomeException.class, () -> …)` | Asserts the body throws that type. The body may throw a *checked* exception, so this works on methods declaring `throws`. To assert on the message, catch it yourself — the checks run inside a `main` that declares `throws Exception`. |

`checkEq` takes two `Object`s and compares them by value. Two numbers compare
numerically, so `checkEq(count(xs), 3)` works whether `count` returns `int` or
`long` and whether the value arrives boxed — `Integer.valueOf(3)` and
`Long.valueOf(3)` are the same number here even though `equals` says otherwise.
Everything else goes through `Objects.deepEquals`, so arrays and nested
collections compare by contents: `checkEq(sorted(xs), new int[]{1, 2, 3})` is
what you want.

It is deliberately *not* overloaded on the primitive types. Overloads read
better but make any call mixing a boxed and an unboxed value ambiguous —
`checkEq(map.get(key), 2)` matches both a `(long, long)` and an
`(Object, Object)` candidate, neither is more specific, and the author gets a
compile error in the middle of writing a problem. One method, no ambiguity.

There is no preprocessor, so the harness cannot stringify its own arguments the
way a C++ `CHECK` macro would. Instead it reads its own source back at run time
and reports the line as the reader wrote it. Two consequences: **put one check
per line**, and do not expect a multi-line check to display well.

The harness imports `java.util.*`, `java.util.function.*` and
`java.util.stream.*` before the reader's code. Any other `import` written in a
starter, solution or Tests section is lifted to the top of the generated file
automatically and a blank line left in its place, so line numbers in errors
still match what the reader sees.

**`check: output`** — the reader writes a whole program, `public class Main`
and all, and the Tests section is the exact stdout it must produce. Use
`stdin:` in the front-matter to feed it input.

### Errors point at the reader's code, not the generated file

javac and every stack trace name `Main.java`, which the reader has never seen.
The harness translates those positions back to `your code:N` and `checks:N`
before anything is displayed. If you change the shape of the generated file in
`src/lib/harness.ts`, re-run `npm run verify:problems` — every problem depends
on those regions being exact, and an off-by-one there is invisible until a
reader is told the error is on a line that has nothing on it.

## A refactoring problem needs a stub, not a working starter

`verify:problems` rejects a problem whose starter already passes, and it is
right to: a starter that produces correct answers gives the reader nothing to
check against, and no way to tell whether their rewrite worked.

This bites every time a problem is framed as "rewrite this correct-but-verbose
code". The fix that keeps the teaching intact:

- make the **starter a stub** (`return null;`, `return 0;`), so the checks fail
  until the reader writes something
- move the verbose-but-correct version into the **Notes**, framed as "written
  by hand, it looks like this"

The alternative — introducing a bug into the starter — turns a design lesson
into a debugging exercise, which is usually not what the chapter wanted.

**A stub must not hang.** The harness runs every check, so a starter that loops
forever burns the whole time limit instead of failing fast. Prefer a wrong
answer to an infinite loop.

## Before you commit

```bash
npm run verify
```

While writing, the targeted forms are much faster and check exactly what you
changed:

```bash
npm run verify:snippets 02-objects/03-equality    # one chapter's samples
npm run verify:problems trim-whitespace two-sum   # named problems only
```

Run the full `npm run verify` before committing regardless — it is what CI runs.

This compiles every runnable sample, asserts the `expect-error` ones fail,
compiles each problem's solution (must pass) and starter (must fail), and
typechecks the site. A JVM start costs about a second, so the verifiers compile
in parallel; expect the full sweep to take minutes on a finished book. That is
the point.

## Judge-style problems

The problem-solving part's problems come in two shapes. The function-style ones
are ordinary `check: unit` problems, exactly as everywhere else in the book. The
drill problems are `check: output` with a `## Cases` section, and are judged the
way a contest judge judges: the program is run once per case, each with its own
stdin, and passes only if **every** case matches.

````markdown
---
id: sum-of-n
check: output
timeLimitMs: 1000        # optional; per case, clamped to the server's 6 s
---

Read `n`, then `n` integers, and print their sum.

## Starter
```java
import java.io.*;
public class Main {
    public static void main(String[] args) throws IOException { … }
}
```

## Cases

### Sample
```in
3
1 2 3
```
```out
6
```

### large n
```in
100000
…
```
```out
4999950000
```
````

Rules the parser follows:

- A case is an `in` fence followed by its `out` fence. A `###` heading above a
  pair names it; the name appears in failure reports and is worth making
  descriptive (`negatives`, `single element`, `n = 0`).
- A case whose name contains **sample** is shown to the reader. If nothing is
  named as a sample, the **first** case is shown anyway — a judge problem with
  no visible case is a guessing game about the input format.
- Everything else is hidden until it fails, at which point its input, the
  expected output and the reader's output are shown side by side.
- Output comparison ignores trailing whitespace on each line and at the end.

`timeLimitMs` is per case and is clamped to the server's own limit, so it can
only ever make a problem stricter. Use it when the point of the problem is the
complexity class — set it so the intended solution passes comfortably and the
naive one does not, and **verify both**: write the slow version, confirm it
times out, then write the fast one.

### Reading input is part of the problem

`Scanner` is roughly an order of magnitude slower than a `BufferedReader` with
a `StreamTokenizer` or a hand-rolled splitter, and on a large case it can be
the difference between passing and timing out on its own — with a correct
algorithm. That is a real lesson and worth teaching once, in the chapter that
introduces judge problems. After that, either size cases so `Scanner` is not
the bottleneck, or say in the prompt that fast input is required.

Watch the silent failure mode: `Scanner.nextInt` on a value too large for an
`int` throws `InputMismatchException`, while `BufferedReader` plus
`Integer.parseInt` throws `NumberFormatException`, and a starter that does
neither may quietly read a wrong value. When a case is meant to exercise the
range of a `long`, verify the starter actually fails on it rather than assuming.

### What a judge problem can and cannot enforce

Cases live inline in the problem's Markdown, so an input is at most a few
hundred values before the file becomes unreadable. That has a consequence worth
planning around: **a time limit can only enforce a complexity class when the
input is compact.**

- A problem whose input is a *bound* — `n ≤ 10^18`, "the n-th Fibonacci number"
  — can carry a case that a quadratic or exponential solution cannot finish.
- A problem whose input is a *list* cannot. Timing out a quadratic solution over
  a list needs tens of thousands of values, which is tens of kilobytes of digits
  in the file.

So: use compact-input problems to enforce complexity, and list-input problems to
enforce correctness — edge cases, off-by-ones, the wrong bound. Say so in the
problem's notes when the statement's constraints are stricter than its cases
can check; claiming a limit you do not enforce is the kind of quiet dishonesty
this book exists to avoid.

### Sizing a judge problem

The whole submission is recompiled for **every** case, and each case pays a JVM
start on top. Six cases of a second each is a slow, annoying problem. Keep the
total under a few seconds: prefer four to six cases sized so each runs in well
under a second, and make the largest case big enough to separate the complexity
classes but no bigger.
