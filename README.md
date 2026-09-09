# JavaTB

An interactive Java textbook. Every code sample compiles and runs; every
practice problem is graded by actually compiling and running your submission.

Built on the same engine as [CppTB](https://github.com/Abiel990310/CppTB), with
everything language-specific isolated into `build/language.ts` and
`server/compile.ts`.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Compiling and grading need a JDK 21 on your PATH. Without one the site still
works — the browser falls back to Compiler Explorer's public API.

## Verifying

```bash
npm run verify
```

Compiles every runnable sample, asserts that the ones marked `expect-error`
really do fail, grades every problem's worked solution (must pass) and starter
(must fail), and typechecks the site. This is what CI runs, and nothing is
committed without it.

## Writing

`docs/ROADMAP.md` is the queue and `docs/AUTHORING.md` is the method.
