---
id: honest-benchmark
title: "A benchmark harness that does not lie"
difficulty: core
chapter: measuring
topics: [benchmarking, warmup, statistics, jit]
check: unit
standard: java21
---

Build the harness this book has been using by hand in every chapter, and make
it report a distribution.

- `record Timings(long minNanos, long medianNanos, long maxNanos, int rounds, long checksum) {}`
- `static Timings measure(int warmupRounds, int measuredRounds, LongSupplier work)`
  — runs `work` `warmupRounds` times discarding the timings, then
  `measuredRounds` times keeping them. The value each run returns is added into
  the checksum so it can never be optimised away. Throws
  `IllegalArgumentException` when `measuredRounds` is less than 1.
- `static double spread(Timings timings)` — max divided by min as a `double`;
  1.0 when min is 0
- `static String report(String name, Timings timings)` — exactly
  `"<name>: median <median>ns (min <min>, max <max>, n=<rounds>)"` using
  nanoseconds
- `static Timings faster(Timings a, Timings b)` — the one with the smaller
  median; `a` on a tie
- `static boolean isConclusive(Timings a, Timings b)` — true only when the
  slower median is at least 1.2 times the faster one **and** neither spread
  exceeds 2.0. A difference smaller than the noise is not a result.

## Starter
```java
import java.util.function.LongSupplier;

record Timings(long minNanos, long medianNanos, long maxNanos, int rounds, long checksum) {}

static Timings measure(int warmupRounds, int measuredRounds, LongSupplier work) {
    long start = System.nanoTime();
    work.getAsLong();
    long elapsed = System.nanoTime() - start;
    return new Timings(elapsed, elapsed, elapsed, 1, 0);
}

static double spread(Timings timings) {
    return timings.maxNanos() / timings.minNanos();
}

static String report(String name, Timings timings) {
    return name + ": " + timings.medianNanos() + "ns";
}

static Timings faster(Timings a, Timings b) {
    return a;
}

static boolean isConclusive(Timings a, Timings b) {
    return a.medianNanos() != b.medianNanos();
}
```

## Tests
```java
import java.util.function.LongSupplier;

int[] calls = { 0 };
LongSupplier counted = () -> {
    calls[0]++;
    return 1;
};

Timings timings = measure(5, 9, counted);
checkEq(calls[0], 14);                        // warmup runs are still runs
checkEq(timings.rounds(), 9);
checkEq(timings.checksum(), 9L);              // only the measured rounds count
check(timings.minNanos() <= timings.medianNanos());
check(timings.medianNanos() <= timings.maxNanos());

calls[0] = 0;
Timings noWarmup = measure(0, 3, counted);
checkEq(calls[0], 3);
checkEq(noWarmup.rounds(), 3);
checkEq(noWarmup.checksum(), 3L);

checkThrows(IllegalArgumentException.class, () -> measure(1, 0, counted));
checkThrows(IllegalArgumentException.class, () -> measure(1, -1, counted));

// The checksum must reflect what the work returned.
Timings summing = measure(0, 4, () -> 10);
checkEq(summing.checksum(), 40L);

// Hand-built timings, so the statistics can be checked exactly.
Timings even = new Timings(100, 200, 300, 5, 1);
checkEq(spread(even), 3.0);
checkEq(report("parse", even), "parse: median 200ns (min 100, max 300, n=5)");

Timings zeroMin = new Timings(0, 5, 10, 3, 1);
checkEq(spread(zeroMin), 1.0);

Timings quick = new Timings(90, 100, 150, 5, 1);
Timings slow = new Timings(200, 250, 300, 5, 1);
check(faster(quick, slow) == quick);
check(faster(slow, quick) == quick);
Timings tied = new Timings(1, 100, 200, 5, 1);
check(faster(tied, quick) == tied);

// 250 against 100 is 2.5x, and both spreads are under 2.
check(isConclusive(quick, slow));
check(isConclusive(slow, quick));

// 110 against 100 is only 1.1x.
check(!isConclusive(quick, new Timings(100, 110, 150, 5, 1)));

// Exactly 1.2x counts.
check(isConclusive(new Timings(90, 100, 150, 5, 1), new Timings(110, 120, 170, 5, 1)));

// A wide spread makes any comparison inconclusive.
Timings noisy = new Timings(100, 300, 900, 5, 1);
check(!isConclusive(quick, noisy));
check(!isConclusive(noisy, quick));
```

## Hints
- The starter runs the work **once** and ignores warmup entirely — the first
  of the chapter's two rules, missing.
- Keep every measured duration in a `long[]`, sort a copy, and read index 0,
  `length / 2` and `length - 1`.
- The checksum must accumulate what `work.getAsLong()` returned during the
  **measured** rounds only. Discarding it is how a harness lets the JIT delete
  the thing it is timing.
- `spread` dividing two `long`s does integer division: `300 / 100` is 3 but
  `150 / 100` is 1. Cast to `double`.
- `isConclusive` needs `slower / faster >= 1.2` in floating point, and both
  spreads at most 2.0.
- Validate `measuredRounds` before running anything.

## Solution
```java
import java.util.function.LongSupplier;

record Timings(long minNanos, long medianNanos, long maxNanos, int rounds, long checksum) {}

static Timings measure(int warmupRounds, int measuredRounds, LongSupplier work) {
    if (measuredRounds < 1) {
        throw new IllegalArgumentException("measuredRounds must be at least 1: " + measuredRounds);
    }

    long discarded = 0;
    for (int i = 0; i < warmupRounds; i++) {
        discarded += work.getAsLong();
    }
    if (discarded == Long.MIN_VALUE) {
        throw new IllegalStateException("unreachable, and keeps the warmup from being elided");
    }

    long[] durations = new long[measuredRounds];
    long checksum = 0;
    for (int i = 0; i < measuredRounds; i++) {
        long start = System.nanoTime();
        long produced = work.getAsLong();
        durations[i] = System.nanoTime() - start;
        checksum += produced;
    }

    long[] sorted = durations.clone();
    Arrays.sort(sorted);
    return new Timings(sorted[0], sorted[sorted.length / 2], sorted[sorted.length - 1],
        measuredRounds, checksum);
}

static double spread(Timings timings) {
    return timings.minNanos() == 0 ? 1.0 : (double) timings.maxNanos() / timings.minNanos();
}

static String report(String name, Timings timings) {
    return name + ": median " + timings.medianNanos() + "ns"
        + " (min " + timings.minNanos()
        + ", max " + timings.maxNanos()
        + ", n=" + timings.rounds() + ")";
}

static Timings faster(Timings a, Timings b) {
    return b.medianNanos() < a.medianNanos() ? b : a;
}

static boolean isConclusive(Timings a, Timings b) {
    if (spread(a) > 2.0 || spread(b) > 2.0) {
        return false;
    }
    double quick = Math.min(a.medianNanos(), b.medianNanos());
    double slow = Math.max(a.medianNanos(), b.medianNanos());
    return quick > 0 && slow / quick >= 1.2;
}
```

## Notes
The starter is what almost every hand-written benchmark looks like on its first
draft: time it once, report the number. Both of the chapter's rules are missing
and so is any notion of variance, so it reports the interpreter's speed with
one significant figure of confidence.

The **checksum** is the part that looks like bookkeeping and is not. A
`LongSupplier` whose result is dropped can be inlined and deleted; accumulating
it into a field the caller can read makes that impossible. The test asserting
`checksum() == 40` for four rounds returning 10 is checking that the harness
really did run the work four times and really did keep what it produced. Note
that warmup results are deliberately *not* in the checksum — they are not part
of the measurement — but they still have to be consumed, which is why the
solution accumulates them into `discarded` and puts an impossible test on it.
Assigning to a variable nothing ever reads would not have been enough.

`spread` returning `1.0` when the minimum is zero is a real case, not a
defensive flourish: work that finishes inside the timer's resolution reports a
duration of zero, and dividing by it gives infinity or an exception depending
on the types. A harness that crashes on the fastest possible result is not
useful. The integer-division trap in the starter is the same bug seen earlier:
`150 / 100` is `1`, so a fifty-percent spread reports as none at all.

`isConclusive` is the most opinionated method here and the one worth arguing
about. A 10% difference between two medians whose own runs vary by 50% is not
a finding — it is the noise floor, and reporting it as a result is exactly the
lie the chapter's title refers to. The thresholds are arbitrary; having
*some* threshold is not. JMH does this properly with confidence intervals; this
is the same instinct with two numbers instead of a distribution.

`faster` returning `a` on a tie is a one-line detail with a purpose: a
comparison function that flips its answer on equal input makes a benchmark
report a "winner" from run to run when there is none.
