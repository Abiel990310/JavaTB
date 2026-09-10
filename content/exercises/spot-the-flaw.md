---
id: spot-the-flaw
title: "Six benchmarks, five of them wrong"
difficulty: stretch
chapter: measuring
topics: [benchmarking, jit, dead-code-elimination, methodology]
check: unit
standard: java21
---

Each method below claims to measure something. Diagnose them in code, then
write one that is right.

- `enum Flaw { NO_WARMUP, RESULT_DISCARDED, CONSTANT_INPUT, TIMER_IN_LOOP, SINGLE_RUN, SETUP_TIMED, NONE }`
- `static Flaw diagnose(String benchmarkName)` — for each of the names below,
  the flaw it has. An unknown name throws `IllegalArgumentException`.
  - `"timesOnce"` — runs the work once and reports it
  - `"discardsResult"` — computes and never uses the answer
  - `"addsAConstant"` — the loop body does not depend on the input
  - `"timesEachIteration"` — calls `System.nanoTime()` twice per element
  - `"timesTheSetup"` — builds the input inside the timed region
  - `"warmedAndConsumed"` — correct
- `static long checksumOf(long[] values)` — the sum, so a benchmark has
  something to consume
- `static long timeWork(int rounds, LongSupplier work)` — runs `work` `rounds`
  times, discarding all but the last timing, accumulating every result into a
  static `SINK`, and returns the last round's nanoseconds. Throws
  `IllegalArgumentException` for `rounds < 1`.
- `static boolean looksEliminated(long nanosDiscarded, long nanosConsumed)` —
  true when the discarded version is at least four times faster, which is the
  signature of a loop the JIT deleted
- `static String verdict(String benchmarkName)` — `"trust it"` for `NONE`,
  otherwise `"do not trust it: " + flaw`

## Starter
```java
import java.util.function.LongSupplier;

enum Flaw { NO_WARMUP, RESULT_DISCARDED, CONSTANT_INPUT, TIMER_IN_LOOP, SINGLE_RUN, SETUP_TIMED, NONE }

static long SINK;

static Flaw diagnose(String benchmarkName) {
    return Flaw.NONE;
}

static long checksumOf(long[] values) {
    return values.length;
}

static long timeWork(int rounds, LongSupplier work) {
    long start = System.nanoTime();
    work.getAsLong();
    return System.nanoTime() - start;
}

static boolean looksEliminated(long nanosDiscarded, long nanosConsumed) {
    return nanosDiscarded < nanosConsumed;
}

static String verdict(String benchmarkName) {
    return "trust it";
}
```

## Tests
```java
import java.util.function.LongSupplier;

checkEq(diagnose("timesOnce"), Flaw.SINGLE_RUN);
checkEq(diagnose("discardsResult"), Flaw.RESULT_DISCARDED);
checkEq(diagnose("addsAConstant"), Flaw.CONSTANT_INPUT);
checkEq(diagnose("timesEachIteration"), Flaw.TIMER_IN_LOOP);
checkEq(diagnose("timesTheSetup"), Flaw.SETUP_TIMED);
checkEq(diagnose("warmedAndConsumed"), Flaw.NONE);
checkThrows(IllegalArgumentException.class, () -> diagnose("somethingElse"));

checkEq(verdict("warmedAndConsumed"), "trust it");
checkEq(verdict("timesOnce"), "do not trust it: SINGLE_RUN");
checkEq(verdict("discardsResult"), "do not trust it: RESULT_DISCARDED");

checkEq(checksumOf(new long[] { 1, 2, 3 }), 6L);
checkEq(checksumOf(new long[0]), 0L);
checkEq(checksumOf(new long[] { -5, 5 }), 0L);

// timeWork runs every round and consumes every result.
int[] calls = { 0 };
long before = SINK;
LongSupplier counted = () -> {
    calls[0]++;
    return 3;
};
long elapsed = timeWork(5, counted);
checkEq(calls[0], 5);
checkEq(SINK - before, 15L);
check(elapsed >= 0);

checkThrows(IllegalArgumentException.class, () -> timeWork(0, counted));
checkThrows(IllegalArgumentException.class, () -> timeWork(-2, counted));

check(looksEliminated(1, 100));
check(looksEliminated(25, 100));
check(!looksEliminated(26, 100));
check(!looksEliminated(100, 100));
check(!looksEliminated(200, 100));
check(!looksEliminated(0, 0));

// And now the real thing: the same loop, discarded and consumed.
long[] data = new long[2_000_000];
for (int i = 0; i < data.length; i++) {
    data[i] = i;
}

long discarded = timeWork(5, () -> {
    long total = 0;
    for (long value : data) {
        total += value * value;
    }
    return 0;                       // the answer is thrown away
});

long consumed = timeWork(5, () -> {
    long total = 0;
    for (long value : data) {
        total += value * value;
    }
    return total;                   // the answer escapes
});

// Both must have run; the consumed one cannot be the faster of the two by a
// wide margin, whatever the machine is doing.
check(consumed > 0);
check(discarded >= 0);
check(!looksEliminated(consumed, discarded));
```

## Hints
- `diagnose` is a lookup table plus an `IllegalArgumentException` for anything
  missing. A `Map<String, Flaw>` in a `static final` field is the tidy shape.
- `Flaw` values print as their name, so `"do not trust it: " + flaw` needs no
  formatting.
- `checksumOf` returning `values.length` is the joke version of a checksum: it
  does not depend on the values, so a benchmark using it can still have its
  work eliminated. Sum them.
- `timeWork` must loop, accumulate **every** round's result into `SINK`, and
  return only the last round's duration. That is warmup and consumption in one
  method.
- `looksEliminated` is `nanosConsumed >= 4 * nanosDiscarded`, guarded so that
  two zeroes are not "eliminated".
- The last block is a real measurement, so it must not assert *which* way round
  the times come out — only that the consumed version was not absurdly slower
  than an eliminated loop would make it look.

## Solution
```java
import java.util.function.LongSupplier;

enum Flaw { NO_WARMUP, RESULT_DISCARDED, CONSTANT_INPUT, TIMER_IN_LOOP, SINGLE_RUN, SETUP_TIMED, NONE }

static long SINK;

static final Map<String, Flaw> FLAWS = Map.of(
    "timesOnce", Flaw.SINGLE_RUN,
    "discardsResult", Flaw.RESULT_DISCARDED,
    "addsAConstant", Flaw.CONSTANT_INPUT,
    "timesEachIteration", Flaw.TIMER_IN_LOOP,
    "timesTheSetup", Flaw.SETUP_TIMED,
    "warmedAndConsumed", Flaw.NONE);

static Flaw diagnose(String benchmarkName) {
    Flaw flaw = FLAWS.get(benchmarkName);
    if (flaw == null) {
        throw new IllegalArgumentException("unknown benchmark: " + benchmarkName);
    }
    return flaw;
}

static long checksumOf(long[] values) {
    long total = 0;
    for (long value : values) {
        total += value;
    }
    return total;
}

static long timeWork(int rounds, LongSupplier work) {
    if (rounds < 1) {
        throw new IllegalArgumentException("rounds must be at least 1: " + rounds);
    }
    long lastDuration = 0;
    for (int round = 0; round < rounds; round++) {
        long start = System.nanoTime();
        long produced = work.getAsLong();
        lastDuration = System.nanoTime() - start;
        SINK += produced;
    }
    return lastDuration;
}

static boolean looksEliminated(long nanosDiscarded, long nanosConsumed) {
    return nanosDiscarded > 0 && nanosConsumed >= 4 * nanosDiscarded;
}

static String verdict(String benchmarkName) {
    Flaw flaw = diagnose(benchmarkName);
    return flaw == Flaw.NONE ? "trust it" : "do not trust it: " + flaw;
}
```

## Notes
The six names are the six ways a hand-written benchmark goes wrong, and it is
worth being able to name them rather than only recognising them.

**`SINGLE_RUN`** and **`NO_WARMUP`** are almost the same fault seen from two
angles: a single timing is necessarily the cold one, and even several timings
averaged together include the cold ones. The chapter measured a factor of
seven between the first run and the tenth.

**`RESULT_DISCARDED`** is the one that produces a *fast* wrong answer rather
than a slow one, which is why it survives review. The chapter's measurement —
0 ms discarded against 24 ms consumed — is reproduced at the bottom of the
tests, and the assertion is deliberately weak: it checks only that the consumed
version is not four times *slower* than the discarded one, because asserting
which is faster would be a timing assertion and chapter 9.1 lists those among
the tests that lie.

**`CONSTANT_INPUT`** is subtler than either. The loop runs, the result is used,
and the compiler still beats you because the answer does not depend on the
input. The fix is to feed real data the compiler cannot predict, which is why
the last block builds a two-million element array rather than looping over a
literal.

**`TIMER_IN_LOOP`** is the one people are proudest of, because per-iteration
timings look rigorous. Two `nanoTime` calls cost about eighty nanoseconds
together, so any iteration cheaper than a microsecond is now mostly clock.

**`SETUP_TIMED`** is the reason JMH has `@Setup` as a separate annotation. A
benchmark that builds its input inside the timed region reports the cost of
building the input, which is usually larger than the thing being measured and
always irrelevant to it.

Two details in the solution repay attention. `checksumOf` summing rather than
counting is the difference between a checksum and a decoration: a value derived
from `length` alone tells the JIT nothing about whether the elements were read,
so the loop that read them can still go. And `looksEliminated` guarding
`nanosDiscarded > 0` matters because a fully eliminated loop very often reports
*zero* nanoseconds, and `x >= 4 * 0` is true for everything — the guard is what
stops the detector from reporting elimination on every pair it sees.
