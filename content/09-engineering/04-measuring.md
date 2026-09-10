---
title: "Measuring performance without lying to yourself"
navTitle: "Measuring"
summary: >-
  The same loop is seven times slower on its first run, disappears entirely if you ignore the result, and varies fivefold from one run to the next. Every number in this book was produced against those three facts.
objectives:
  - Warm up a measurement, and see how much it matters
  - Recognise a benchmark the JIT has deleted
  - Choose a timer, and know what it costs and resolves to
  - Report a distribution rather than a number
status: complete
standard: java21
requires: [debugging]
---

Every chapter of this book has quoted timings, and each one came with the same
two rules attached: warm up, and consume the result. This chapter is why.

Java is the hardest mainstream language to benchmark, for a good reason: the
thing that runs your code is not the thing you compiled. `javac` produces
bytecode, the interpreter runs it, and somewhere along the way the JIT compiles
the hot parts, inlines across method boundaries, deletes what nothing observes,
and recompiles when its assumptions change. A naive measurement times some
arbitrary point in that process.

## Warm up, or you are timing the interpreter

```java run title="The same work, twelve times"
import java.util.*;

public class Main {
    static long sink;

    static int score(String text) {
        int hash = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isDigit(c)) {
                hash += c - '0';
            } else if (Character.isUpperCase(c)) {
                hash += 2;
            } else {
                hash ^= c;
            }
        }
        return hash;
    }

    public static void main(String[] args) {
        List<String> words = new ArrayList<>();
        for (int i = 0; i < 20_000; i++) {
            words.add("Word" + i + "-Value" + (i * 7));
        }

        System.out.println("run     time");
        for (int round = 1; round <= 12; round++) {
            long start = System.nanoTime();
            long total = 0;
            for (String word : words) {
                total += score(word);
            }
            long micros = (System.nanoTime() - start) / 1_000;
            sink += total;
            System.out.printf("%3d   %6d us%n", round, micros);
        }
        System.out.println("checksum used: " + (sink != 0));
    }
}
```

Identical work every time. On the machine this was written on the first run
took **6599 microseconds** and the tenth took **904** — a factor of seven — and
the curve settles after about five runs.

Nothing changed except how the code was being executed. HotSpot starts
interpreting, compiles at tier 1 when a method gets warm, and recompiles at
tier 4 with full optimisation when it gets hot. A benchmark that reports the
first run is reporting the interpreter, and a benchmark that averages all
twelve is reporting a number that describes no state the program is ever in for
long.

The rule: **run the work many times and report a later run**, or report the
distribution of the later runs. Every measurement in this book runs at least
three rounds and quotes the last.

## Consume the result, or it may not happen

```java run title="A benchmark that measures nothing"
public class Main {
    static long sink;

    public static void main(String[] args) {
        int n = 50_000_000;

        System.out.println("computed and discarded:");
        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long hash = 0;
            for (int i = 0; i < n; i++) {
                hash += (long) i * i;
            }
            System.out.println("  " + (System.nanoTime() - start) / 1_000_000 + " ms");
        }

        System.out.println("computed and consumed:");
        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long hash = 0;
            for (int i = 0; i < n; i++) {
                hash += (long) i * i;
            }
            sink += hash;
            System.out.println("  " + (System.nanoTime() - start) / 1_000_000 + " ms");
        }

        System.out.println("adding a constant instead:");
        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long hash = 0;
            for (int i = 0; i < n; i++) {
                hash += 7;
            }
            sink += hash;
            System.out.println("  " + (System.nanoTime() - start) / 1_000_000 + " ms");
        }

        System.out.println("checksum used: " + (sink != 0));
    }
}
```

Fifty million multiplications take **0 to 6 milliseconds** when the result is
discarded and **20 to 28** when it is used. The first version is not fast; it
does not exist. The JIT proved nothing observes `hash` and deleted the loop.

The third block is the same trap in a subtler form. Adding a constant fifty
million times is arithmetic the compiler can reason about, so it runs several
times faster than the version it was supposed to be compared against. A
benchmark whose input the compiler can predict is measuring the compiler.

Both failures produce a *plausible* number, which is what makes them
dangerous. A loop that reports 0 ms is obviously wrong; one that reports 3 ms
when the truth is 24 just looks like good news.

## Timers

```java run title="What nanoTime resolves to, and what it costs"
public class Main {
    public static void main(String[] args) {
        long smallestStep = Long.MAX_VALUE;
        long start = System.nanoTime();
        for (int i = 0; i < 1_000_000; i++) {
            long before = System.nanoTime();
            long after = System.nanoTime();
            if (after > before) {
                smallestStep = Math.min(smallestStep, after - before);
            }
        }
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;

        System.out.println("smallest observed nanoTime step: " + smallestStep + " ns");
        System.out.println("2,000,000 nanoTime calls took:   " + elapsedMs + " ms");
        System.out.println("so one call is roughly:          " + (elapsedMs * 1_000_000 / 2_000_000) + " ns");

        long firstMillis = System.currentTimeMillis();
        long nextMillis;
        do {
            nextMillis = System.currentTimeMillis();
        } while (nextMillis == firstMillis);
        System.out.println("currentTimeMillis step:          " + (nextMillis - firstMillis) + " ms");
    }
}
```

`System.nanoTime()` resolves to about **19 nanoseconds** here and costs about
**40** to call. `System.currentTimeMillis()` moves in steps of a whole
millisecond.

Three consequences:

- **Never time with `currentTimeMillis`.** Anything under a few milliseconds is
  rounding noise, and the wall clock can jump backwards when NTP adjusts it.
  `nanoTime` is monotonic and has no meaning as a date, which is exactly what
  you want.
- **Never time a single fast operation.** If the thing you are measuring takes
  less than a microsecond, the timer is a significant part of the measurement.
  Time a million of them and divide.
- **Do not put `nanoTime` inside the loop.** Two calls per iteration at forty
  nanoseconds each will dominate anything cheap, and you will have measured the
  clock.

## One number is not a measurement

```java run title="The same code, twenty-five times"
import java.util.*;

public class Main {
    static long sink;

    public static void main(String[] args) {
        long[] times = new long[25];
        List<byte[]> retained = new ArrayList<>();

        for (int round = 0; round < times.length; round++) {
            long start = System.nanoTime();
            long hash = 0;
            for (int i = 0; i < 2_000_000; i++) {
                hash += i;
                if ((i & 1023) == 0) {
                    retained.add(new byte[512]);
                }
            }
            if (retained.size() > 4_000) {
                retained.clear();
            }
            sink += hash;
            times[round] = (System.nanoTime() - start) / 1_000;
        }

        long[] sorted = times.clone();
        Arrays.sort(sorted);
        System.out.println("min:    " + sorted[0] + " us");
        System.out.println("median: " + sorted[times.length / 2] + " us");
        System.out.println("max:    " + sorted[times.length - 1] + " us");
        System.out.println("spread: " + (sorted[times.length - 1] / Math.max(1, sorted[0])) + "x");
        System.out.println("checksum used: " + (sink != 0));
    }
}
```

Min 1324 microseconds, median 2099, max 7607 — a **fivefold spread** from
identical code, because this loop allocates and the garbage collector runs when
it chooses.

An average would hide it, and a single run would report whichever of those you
happened to get. Report the **median and the spread**, and when the spread is
large, say so: a benchmark whose maximum is five times its minimum is telling
you that something other than your code is deciding the answer.

This is also the honest reason so many measurements in this book are quoted as
a range rather than a figure.

## What JMH does for you

Doing all of this by hand, correctly, every time, is not realistic. **JMH** —
the Java Microbenchmark Harness, from the JDK team — exists because the people
who wrote the JIT know how hard it is to measure around.

```java
// JMH. Not compiled here — this book's runner has no third-party classpath.
@BenchmarkMode(Mode.AverageTime)
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@Warmup(iterations = 5, time = 1)
@Measurement(iterations = 10, time = 1)
@Fork(3)
@State(Scope.Benchmark)
public class ScoreBenchmark {

    private List<String> words;

    @Setup
    public void setUp() {
        words = IntStream.range(0, 20_000)
            .mapToObj(i -> "Word" + i + "-Value" + (i * 7))
            .toList();
    }

    @Benchmark
    public long scoreAll() {
        long total = 0;
        for (String word : words) {
            total += score(word);
        }
        return total;            // returned, so it cannot be optimised away
    }

    @Benchmark
    public void scoreAllIntoBlackhole(Blackhole blackhole) {
        for (String word : words) {
            blackhole.consume(score(word));
        }
    }
}
```

Every annotation there maps onto something in this chapter:

- **`@Warmup`** runs the measured code until the JIT has settled, and throws
  those results away.
- **`@Measurement`** collects the runs that count, and reports mean, standard
  deviation and percentiles rather than one number.
- **`@Fork(3)`** runs the whole thing in three fresh JVMs, because profile
  pollution from an earlier benchmark can change how a later one is compiled.
  This is the one that is genuinely impossible to do by hand.
- **`@State`** separates building the input from measuring the work, so setup
  is not timed.
- **A returned value or `Blackhole.consume`** is the "consume the result" rule,
  enforced. `Blackhole` is deliberately opaque to the JIT.

Run it with `mvn archetype:generate -DarchetypeArtifactId=jmh-java-benchmark-archetype`
and read the output's error bars, not just its means.

## Before you measure anything

**Measure the right thing.** A microbenchmark tells you about a method. It
tells you nothing about whether that method is why your service is slow. Profile
first — `async-profiler`, or JFR with `java -XX:StartFlightRecording` — and
benchmark the thing the profile named.

**Have a question.** "Is `HashMap` faster than `TreeMap`" has no answer. "For
50,000 `String` keys with lookups ten times more frequent than inserts, on
this JDK, does switching cost more than it saves" does.

**Change one thing.** Two differences and a difference in the result tell you
nothing about which mattered.

**Measure on the machine that matters.** A laptop with four idle cores and a
container limited to half a core do not agree, and neither does a machine that
is thermally throttling. Every figure in this book says "on the machine this
was written on" for that reason.

**Keep the checksum.** Every measurement here ends by printing something
derived from the result. It is not decoration — it is the only thing standing
between you and a benchmark of an empty loop.

:::quiz
{
  "question": "A loop of fifty million multiplications reports 0 ms when its result is unused and 24 ms when the result is added to a static field. Which number is the measurement?",
  "options": [
    { "text": "24 ms — with the result unused the JIT proved nothing observes it and deleted the loop", "correct": true, "why": "Right. Dead-code elimination is why every benchmark must consume its result, by returning it or handing it to a Blackhole." },
    { "text": "0 ms — the static field write is the cost, so 24 ms measures the assignment", "correct": false, "why": "One `long` add to a static field per round cannot cost 24 ms; the loop is what is being timed once it is allowed to exist." },
    { "text": "Neither — both are invalid without a warmup", "correct": false, "why": "Warmup matters and both figures here are warm; the difference between them is elimination, not compilation state." },
    { "text": "Both — they measure different optimisation levels of the same code", "correct": false, "why": "There is no optimisation level at which the work happens in zero time; the work simply did not happen." }
  ]
}
:::

## Practice

:::exercise honest-benchmark

:::exercise spot-the-flaw

:::recap
- The first run of a method can be many times slower than a warm one —
  measured at **seven times**, settling after about five rounds. Warm up and
  report a later run.
- A result nothing consumes may be deleted: fifty million multiplications
  measured **0 ms discarded against 24 ms consumed**. Return it, accumulate it,
  or print a checksum.
- A loop over constants measures the compiler, not the code.
- `nanoTime` resolves to tens of nanoseconds and costs about the same to call;
  `currentTimeMillis` steps in whole milliseconds and can go backwards. Never
  time with the second, and never call the first inside a tight loop.
- Identical code varied **fivefold** across twenty-five runs because it
  allocates. Report median and spread, not a single number or a mean.
- JMH exists because doing this correctly by hand is not realistic;
  `@Fork` in particular cannot be reproduced without it.
- Profile before you benchmark, ask a specific question, change one thing, and
  measure on the machine that matters.
