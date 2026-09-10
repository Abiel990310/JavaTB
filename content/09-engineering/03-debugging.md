---
title: "Debugging and reading a stack trace properly"
navTitle: "Debugging"
summary: >-
  The first line is not the problem, the last `Caused by` usually is, and after a hundred thousand throws the JVM stops giving you a trace at all.
objectives:
  - Read a chained stack trace and find the real failure
  - Explain suppressed exceptions and truncated async traces
  - Measure what a thrown exception costs
  - Recognise the traces the JVM stops producing
status: complete
standard: java21
requires: [build-tools]
---

Most debugging is reading. A stack trace contains the answer far more often
than people expect, and the reason it seems not to is that it is usually read
in the wrong order.

## The shape of a trace

```java run expect-throw title="Three layers, one problem"
public class Main {
    static void parseField() {
        throw new IllegalArgumentException("expected a number, found 'abc'");
    }

    static void loadRecord() {
        try {
            parseField();
        } catch (RuntimeException failure) {
            throw new IllegalStateException("could not load record 42", failure);
        }
    }

    static void handleRequest() {
        try {
            loadRecord();
        } catch (RuntimeException failure) {
            throw new RuntimeException("request failed", failure);
        }
    }

    public static void main(String[] args) {
        handleRequest();
    }
}
```

The output has three sections and reads bottom-up in two different senses at
once:

```
Exception in thread "main" java.lang.RuntimeException: request failed
	at Main.handleRequest(Main.java:18)
	at Main.main(Main.java:23)
Caused by: java.lang.IllegalStateException: could not load record 42
	at Main.loadRecord(Main.java:10)
	at Main.handleRequest(Main.java:16)
	... 1 more
Caused by: java.lang.IllegalArgumentException: expected a number, found 'abc'
	at Main.parseField(Main.java:3)
	at Main.loadRecord(Main.java:8)
	... 2 more
```

**Within one section**, the top frame is where the exception was created and
the bottom is the entry point. So `parseField` threw and `main` was the caller —
read down to find how you got there.

**Between sections**, the order is outermost first. The first line is the
exception your code caught last, which is usually the least informative one
(*request failed* tells you nothing). The **last `Caused by` is normally the
real failure**, and it is the one people scroll past because it is at the
bottom.

`... 2 more` means "the remaining frames are identical to the section above".
It is not truncation and nothing is hidden: the last section shows the two
frames unique to it — where the exception was created, and where the call came
from — and elides `handleRequest` and `main`, which you have already read
twice. Count the numbers if you like; each section's own frames plus its
`... N more` always add up to the same total.

## Suppressed exceptions

```java run title="When closing fails too"
import java.io.IOException;

public class Main {
    record Resource(String name) implements AutoCloseable {
        @Override
        public void close() {
            throw new IllegalStateException("close failed: " + name);
        }
    }

    public static void main(String[] args) {
        try (Resource first = new Resource("first");
             Resource second = new Resource("second")) {
            throw new IOException("the body failed");
        } catch (Exception failure) {
            System.out.println("primary:    " + failure);
            for (Throwable suppressed : failure.getSuppressed()) {
                System.out.println("suppressed: " + suppressed);
            }
        }
    }
}
```

`try`-with-resources closes in reverse order, and a failure in `close()`
cannot replace the failure in the body — it would hide the real problem
(chapter 3.5). So it is attached to the primary exception as a **suppressed**
exception, and `printStackTrace` shows it as a `Suppressed:` section.

Two consequences. `getSuppressed()` is where the resource failures live, so a
handler that logs only `failure.getMessage()` loses them. And if the body
succeeds and only `close` fails, the close failure becomes the primary
exception with nothing suppressed — which is why a silent `close` failure is
the one you should worry about, not the loud one.

## The trace that stops at the pool

```java run title="An exception in a worker thread"
import java.util.Arrays;
import java.util.concurrent.*;

public class Main {
    static void deepInside() {
        throw new IllegalStateException("something broke in the worker");
    }

    public static void main(String[] args) throws Exception {
        try (ExecutorService pool = Executors.newFixedThreadPool(1)) {
            Future<?> future = pool.submit(() -> {
                deepInside();
                return null;
            });

            try {
                future.get();
            } catch (ExecutionException wrapped) {
                Throwable cause = wrapped.getCause();
                System.out.println("cause:            " + cause);
                System.out.println("frames in cause:  " + cause.getStackTrace().length);
                System.out.println("mentions main():  " + Arrays.stream(cause.getStackTrace())
                    .anyMatch(frame -> frame.getMethodName().equals("main")));
                System.out.println("frames in wrapper:" + wrapped.getStackTrace().length);
                System.out.println("wrapper mentions main(): " + Arrays.stream(wrapped.getStackTrace())
                    .anyMatch(frame -> frame.getMethodName().equals("main")));
            }
        }
    }
}
```

The cause's trace runs from `deepInside` down to the worker thread's `run` and
**stops**. It never mentions `main`, because the stack it recorded is the
worker's, and the worker has no memory of who submitted the task.

That is why asynchronous stack traces are so much less useful, and why the
`ExecutionException` wrapper matters: *its* trace is the calling thread's, so
between the two you can reconstruct both halves. Log the wrapper, not just the
cause, and you keep both.

## What an exception costs

```java run title="Measured: a hundred thousand throws"
public class Main {
    static final class Lightweight extends RuntimeException {
        Lightweight(String message) {
            super(message, null, false, false);   // no suppression, no stack trace
        }
    }

    static long sink;

    static int throwing(int depth) {
        if (depth == 0) {
            throw new IllegalStateException("failed");
        }
        return throwing(depth - 1) + 1;
    }

    static int throwingLight(int depth) {
        if (depth == 0) {
            throw new Lightweight("failed");
        }
        return throwingLight(depth - 1) + 1;
    }

    static int returning(int depth) {
        return depth == 0 ? 0 : returning(depth - 1) + 1;
    }

    public static void main(String[] args) {
        int iterations = 100_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            for (int i = 0; i < iterations; i++) {
                try {
                    throwing(40);
                } catch (RuntimeException failure) {
                    sink += failure.getMessage().length();
                }
            }
            long withTrace = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            for (int i = 0; i < iterations; i++) {
                try {
                    throwingLight(40);
                } catch (RuntimeException failure) {
                    sink += failure.getMessage().length();
                }
            }
            long withoutTrace = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long total = 0;
            for (int i = 0; i < iterations; i++) {
                total += returning(40);
            }
            long noException = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  with a stack trace " + withTrace + " ms"
                + "   without one " + withoutTrace + " ms"
                + "   no exception at all " + noException + " ms"
                + "   (" + (sink > 0 && total > 0) + ")");
        }
    }
}
```

Warm, over a forty-frame stack: **273 ms with a trace, 115 ms without, and
under 3 ms for the same work returning normally** — a hundred times the cost of
a plain return.

Two readings. **Capturing the stack is most of the cost** — the four-argument
`RuntimeException` constructor turning it off roughly halves it. And an
exception is *hundreds of times* more expensive than a return, which is why
chapter 3.1's rule about exceptions being for exceptional cases is a
performance argument as well as a design one.

The `super(message, null, false, false)` constructor is worth knowing. It is
right for a control-flow exception in a hot path — a parser's "not this rule"
signal — and wrong for anything a human will ever have to diagnose, because
you have thrown away the only evidence.

## The trace that disappears

```java run title="After enough throws, no trace at all"
public class Main {
    static final int[] SMALL = new int[1];

    public static void main(String[] args) {
        int withTrace = 0;
        int withoutTrace = 0;

        for (int i = 0; i < 100_000; i++) {
            try {
                int ignored = SMALL[5];
            } catch (ArrayIndexOutOfBoundsException failure) {
                if (failure.getStackTrace().length == 0) {
                    withoutTrace++;
                } else {
                    withTrace++;
                }
            }
        }

        System.out.println("of 100,000 throws: " + withTrace + " had a stack trace, "
            + withoutTrace + " had none");
    }
}
```

Around ninety-nine thousand of them carry a trace, and then several hundred do
not. Once the JIT has compiled a method that keeps throwing the same built-in
exception at the same place, it replaces the throw with a **preallocated,
shared exception object** that has no stack trace and, on older releases, no
message either. This optimisation is called *fast throw*, and it is the reason
for one of the most disorienting production reports there is: "the same
exception appears in the log, and after a while it has no stack trace."

The fix when you meet it is a flag: `-XX:-OmitStackTraceInFastThrow`. The
better fix is that a code path throwing a `NullPointerException` a hundred
thousand times is a bug you should be fixing anyway.

## Reading a `NullPointerException`

```java run expect-throw title="Which thing was null?"
import java.util.*;

public class Main {
    record Address(String city) {}
    record Person(String name, Address address) {}

    public static void main(String[] args) {
        Map<String, Person> directory = new HashMap<>();
        directory.put("ada", new Person("Ada", null));

        System.out.println(directory.get("ada").address().city().length());
    }
}
```

The message names the exact expression: *Cannot invoke "String.length()"
because the return value of "Main$Address.city()" is null*. Java 14 added these
**helpful NullPointerException** messages and Java 15 turned them on by
default, and they turn the worst line in Java debugging — one line, four calls,
which was null? — into a sentence.

Two things to know about them. They need local variable names to describe
locals, which come from `javac -g`; Maven and Gradle both pass it, and a build
that does not gives you `<local3>` instead of a name (chapter 1.1). And the
message is computed when it is *printed*, not when it is thrown, so it costs
nothing until something asks.

## Habits

**Log the exception, not its message.** `log.error("failed: " + e.getMessage())`
throws away the trace, the cause chain and the suppressed exceptions —
everything except the least informative line. `log.error("failed", e)` keeps
all of it.

**Never swallow.** An empty `catch` block converts a failure into wrong
behaviour later, somewhere else. If you genuinely mean to ignore it, say so in
a comment and name the variable `ignored`.

**Wrap with context, keep the cause.** `new IllegalStateException("loading
record " + id, failure)` adds the one thing the original could not know. Drop
the second argument and you have destroyed the evidence — which is what makes
the three-layer trace above readable rather than a mystery.

**Reach for the debugger sooner.** A conditional breakpoint on `id == 42` finds
in one run what twenty printed lines find in five. Set one, run to it, and
inspect the whole frame rather than the fields you thought to print.

**When it is stuck rather than broken**, take a thread dump — `jstack <pid>`,
or `jcmd <pid> Thread.print`. Chapter 8.1's deadlock shows up in one as two
threads `BLOCKED` on monitors each other holds, and the JVM will even name the
cycle for you.

:::quiz
{
  "question": "A log shows `java.lang.NullPointerException` with no message and an empty stack trace, from a line that has thrown thousands of times. What happened?",
  "options": [
    { "text": "The JIT replaced the throw with a shared preallocated exception — the fast-throw optimisation — which carries no trace", "correct": true, "why": "Right. It kicks in after a method has been compiled and keeps throwing the same built-in exception; `-XX:-OmitStackTraceInFastThrow` disables it." },
    { "text": "The logging framework truncated the trace to save space", "correct": false, "why": "A truncating logger would still show some frames and usually says so; here `getStackTrace()` genuinely returns an empty array." },
    { "text": "The exception was created with `super(message, null, false, false)`", "correct": false, "why": "That would explain a custom exception, but `NullPointerException` is the JDK's and is not constructed that way by your code." },
    { "text": "The exception crossed a thread boundary and lost its frames", "correct": false, "why": "Crossing threads truncates the trace at the worker's entry point; it does not empty it." }
  ]
}
:::

## Practice

:::exercise read-the-trace

:::exercise diagnose-and-wrap

:::recap
- Within a section, the top frame threw and the bottom frame started it.
  Between sections, the **last `Caused by` is usually the real failure**.
- `... N more` elides frames identical to the section above; nothing is hidden.
- `try`-with-resources attaches close failures to the primary exception as
  **suppressed** — `getSuppressed()`, and lost by any handler that logs only
  the message.
- An exception thrown in a worker thread records the worker's stack and never
  mentions the submitter; the `ExecutionException` wrapper holds the other half.
- Measured over a forty-frame stack: 273 ms with a trace, 115 ms without, under
  3 ms for a plain return. Capturing the stack is most of the cost.
- After enough throws the JIT uses a shared preallocated exception with **no
  stack trace** — `-XX:-OmitStackTraceInFastThrow` turns it off.
- Helpful `NullPointerException` messages name the expression; local variable
  names need `-g`.
- Log the exception, never just its message; always keep the cause.
