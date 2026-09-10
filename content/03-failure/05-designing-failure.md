---
title: "Designing failure"
navTitle: "Designing failure"
summary: >-
  Choosing between throwing, returning nothing, and returning a result that names the problem — with the cost of each measured rather than assumed.
objectives:
  - Choose between an exception, an Optional and a result type for a given failure
  - Say what an exception actually costs and where the cost is
  - Explain why a failure that is normal should not be exceptional
status: complete
standard: java21
requires: [null-and-optional]
---

Three chapters have each shown a mechanism. This one is the judgement, and it
settles two questions left open earlier: chapter 2.3 split refusals between
throwing and returning `false` without fully justifying it, and chapter 2.11
built an `Ok`/`Err` type while explicitly deferring the comparison with
exceptions.

There are three ways for a method to report that it could not do the thing.

```java run title="The same operation, three signatures"
import java.util.Optional;

public class Main {
    sealed interface Parsed permits Ok, Err { }
    record Ok(int value) implements Parsed { }
    record Err(String reason) implements Parsed { }

    // 1. Throw: the caller must catch or let it propagate.
    static int byThrowing(String text) {
        return Integer.parseInt(text);
    }

    // 2. Optional: absence is expressible, the reason is not.
    static Optional<Integer> byOptional(String text) {
        try {
            return Optional.of(Integer.parseInt(text));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    // 3. Result: absence and the reason are both in the type.
    static Parsed byResult(String text) {
        try {
            return new Ok(Integer.parseInt(text));
        } catch (NumberFormatException e) {
            return new Err("not a number: " + text);
        }
    }

    public static void main(String[] args) {
        System.out.println("throwing:  " + byThrowing("42"));
        System.out.println("optional:  " + byOptional("nope").orElse(-1));
        System.out.println("result:    " + switch (byResult("nope")) {
            case Ok(int v) -> "got " + v;
            case Err(String reason) -> "failed: " + reason;
        });
    }
}
```

## What each one says

| | The caller is told | Can the caller ignore it? | Carries a reason |
|---|---|---|---|
| Exception | at run time, by unwinding | unchecked: yes, silently | yes, plus a stack trace |
| `Optional` | in the signature | only by calling `get` | no |
| Result type | in the signature | no — the switch must be exhaustive | yes |

The question that decides it is: **can the immediate caller do something useful,
and do they need to know why?**

- **No, and no** — throw. Most callers have nothing to contribute and should not
  be made to write a `catch` that only rethrows. A configuration file that will
  not parse at startup should abort the startup.
- **Yes, but the reason does not change what they do** — `Optional`. A cache
  miss, a lookup with no match. The caller substitutes a default; *why* it was
  absent is not actionable.
- **Yes, and the reason changes what they do** — a result type. Validating a
  form, parsing user input, calling something that fails several distinguishable
  ways.

## What an exception costs

Folklore says exceptions are slow. That is worth measuring, because the useful
part is *where* the cost is.

```java run title="Measured: throwing, throwing without a trace, and returning"
import java.util.function.IntUnaryOperator;

public class Main {
    static long sink;

    /** An exception that does not capture a stack trace. */
    static class Fast extends RuntimeException {
        Fast(String message) {
            super(message, null, false, false);   // no suppression, no writable stack trace
        }
    }

    static int viaException(int i) {
        try {
            if (i % 2 == 0) {
                throw new IllegalStateException("even");
            }
            return i;
        } catch (IllegalStateException e) {
            return -1;
        }
    }

    static int viaFastException(int i) {
        try {
            if (i % 2 == 0) {
                throw new Fast("even");
            }
            return i;
        } catch (Fast e) {
            return -1;
        }
    }

    static int viaReturn(int i) {
        return i % 2 == 0 ? -1 : i;
    }

    static long run(IntUnaryOperator f, int n) {
        long total = 0;
        for (int i = 0; i < n; i++) {
            total += f.applyAsInt(i);
        }
        return total;
    }

    public static void main(String[] args) {
        for (int w = 0; w < 3; w++) {                 // warm up
            sink += run(Main::viaException, 200_000);
            sink += run(Main::viaFastException, 200_000);
            sink += run(Main::viaReturn, 200_000);
        }

        int n = 1_000_000;
        long t0 = System.nanoTime();
        sink += run(Main::viaException, n);
        long t1 = System.nanoTime();
        sink += run(Main::viaFastException, n);
        long t2 = System.nanoTime();
        sink += run(Main::viaReturn, n);
        long t3 = System.nanoTime();

        System.out.printf("exception with trace: %4d ms%n", (t1 - t0) / 1_000_000);
        System.out.printf("exception, no trace:  %4d ms%n", (t2 - t1) / 1_000_000);
        System.out.printf("plain return:         %4d ms%n", (t3 - t2) / 1_000_000);
        System.out.println("(checksum " + sink + ")");
    }
}
```

Half a million exceptions in each run. The ordinary exception takes roughly
seventy times as long as the plain return — and the version that skips the
stack trace is close to the plain return.

So the expense is **capturing the stack trace**, not throwing or catching.
`fillInStackTrace` walks every frame and records it, which is exactly what
makes an exception useful for diagnosis and exactly what you are paying for.

Two conclusions follow, and they point in opposite directions:

- **Do not fear exceptions for exceptional things.** A failure that happens once
  per request, or once per program run, costs a microsecond. That is never your
  bottleneck.
- **Do not use them for control flow.** A "failure" that happens on half of all
  calls — an expected parse failure, a validation miss, an end-of-input marker
  — is not exceptional, and paying for a stack trace to describe something
  routine is exactly the wrong trade. That is where `Optional` and result types
  earn their place.

The `super(message, null, false, false)` constructor exists for the narrow case
where you genuinely want a control-flow exception, and it is worth knowing
about mostly so you recognise it in a library. Reaching for it in your own code
usually means the design should not have been an exception at all.

:::pitfall
The worst version of this is an exception used for a routine outcome *and*
caught immediately by the caller. You pay for a stack trace nobody reads,
obscure the ordinary path in `try` blocks, and lose the compiler's help,
because an unchecked exception in a signature is invisible.
:::

## Answering chapter 2.3

That chapter's `Account` threw for a negative deposit and returned `false` for
an overdrawn withdrawal, and called the split deliberate. Now it can be
justified properly:

A negative deposit means the *calling code* is wrong. There is no runtime
condition that produces it, no user action that justifies it, and no sensible
recovery — so it should be loud, unchecked, and carry a stack trace pointing at
the line responsible. That is precisely what an exception is for.

Withdrawing more than the balance is not a bug anywhere. It is a normal
outcome of a normal request, it happens constantly, and the caller has an
obvious next step. Making it exceptional would mean a `try`/`catch` around
routine banking and a stack trace for every declined transaction.

The rule generalises: **exceptions are for the cases that should not happen;
return values are for the cases that should.**

## Answering chapter 2.11

`result-or-error` built `sealed interface Parsed permits Ok, Err` and left the
comparison open. The honest summary:

A result type is better than an exception when the caller must decide, and its
advantage is that the compiler enforces the decision — an exhaustive switch has
no path that ignores the failure, whereas an unchecked exception can be dropped
silently and a checked one can be swallowed by an empty catch.

It is worse when failures must travel a long way. An exception unwinds through
ten frames by itself; a result type must be returned, inspected and re-wrapped
at every level, and the code between becomes a pipeline of matching. That is
why languages built around result types provide operators to propagate them
automatically, and Java has none.

So: result types near the boundary, where a caller is standing right there and
must choose. Exceptions for depth, where the handler is far from the failure
and everything in between has nothing to say.

:::quiz
{
  "question": "A parser is called once per line on a ten-million-line file, and roughly a third of the lines are malformed and skipped. How should the parse failure be reported?",
  "options": [
    { "text": "A result type or Optional — three million stack traces cost real time and describe nothing", "correct": true, "why": "Right. At that rate the failure is a normal outcome rather than an exceptional one, and the measurement in this chapter puts the cost of a captured stack trace at roughly seventy times a plain return." },
    { "text": "An unchecked exception, caught in the loop", "correct": false, "why": "This is the pitfall exactly: an exception thrown and caught immediately, three million times, paying for stack traces nobody reads to describe something routine." },
    { "text": "A checked exception, so the caller cannot forget to handle it", "correct": false, "why": "The compiler's help is real, but it does not change the cost, and it forces a try/catch around the ordinary path. A result type gives the same guarantee without either problem." },
    { "text": "An exception with the stack trace disabled", "correct": false, "why": "That does remove the cost, and it is the sign that an exception was the wrong shape. If the trace is worthless, the failure is not exceptional." }
  ]
}
:::

## Practice

:::exercise choose-the-signature

:::exercise validate-a-form

:::recap
- Three ways to report failure: throw, return `Optional`, return a result type
  that names the reason.
- Decide by asking whether the immediate caller can act, and whether the reason
  changes what they do.
- An exception costs roughly seventy times a plain return, and almost all of
  that is capturing the stack trace — which is the part that makes it useful.
- Exceptions are for what should not happen; return values are for what should.
- Result types near a boundary where a caller must choose; exceptions for
  depth, where the handler is far away and the frames between have nothing to
  contribute.
:::
