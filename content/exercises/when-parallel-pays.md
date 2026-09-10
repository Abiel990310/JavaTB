---
id: when-parallel-pays
title: "Decide whether to go parallel"
difficulty: stretch
chapter: parallel-streams
topics: [parallel-streams, spliterator, measurement, forkjoin]
check: unit
standard: java21
---

Not "make it parallel" — "work out whether it should be". You will inspect the
source, apply the rules, and then measure.

- `record Verdict(boolean recommended, String reason) {}`
- `static Verdict adviseOn(Collection<?> source, long nanosPerElement)` —
  recommends parallel only when **all three** hold: the source's spliterator
  reports `SIZED` and `SUBSIZED`, there are at least 1,000 elements, and the
  estimated total work is at least 100 microseconds. The `reason` must be
  exactly one of `"not splittable"`, `"too few elements"`, `"not enough work"`
  or `"worth trying"`, checked in that order.
- `static boolean splitsWell(Spliterator<?> spliterator)` — `SIZED` and
  `SUBSIZED`
- `static long estimatedSize(Collection<?> source)` — the spliterator's
  estimate, or `-1` when it is `Long.MAX_VALUE` (meaning "unknown")
- `static long timeOn(ForkJoinPool pool, IntSupplier work)` — runs `work` on
  the given pool and returns milliseconds; a `null` pool means the common pool
- `static String compare(int elements, int innerLoop)` — runs the same
  CPU-bound pipeline sequentially and in parallel and returns
  `"parallel"` or `"sequential"`, whichever was faster

## Starter
```java
import java.util.concurrent.*;
import java.util.function.IntSupplier;

record Verdict(boolean recommended, String reason) {}

static boolean splitsWell(Spliterator<?> spliterator) {
    return true;
}

static long estimatedSize(Collection<?> source) {
    return source.size();
}

static Verdict adviseOn(Collection<?> source, long nanosPerElement) {
    return new Verdict(source.size() > 1, "worth trying");
}

static long timeOn(ForkJoinPool pool, IntSupplier work) throws Exception {
    long start = System.nanoTime();
    work.getAsInt();
    return (System.nanoTime() - start) / 1_000_000;
}

static String compare(int elements, int innerLoop) {
    return "parallel";
}
```

## Tests
```java
import java.util.concurrent.*;
import java.util.function.IntSupplier;
import java.util.stream.*;

List<Integer> arrayList = new ArrayList<>();
for (int i = 0; i < 5_000; i++) {
    arrayList.add(i);
}
List<Integer> linkedList = new LinkedList<>(arrayList);
Set<Integer> hashSet = new HashSet<>(arrayList);

check(splitsWell(arrayList.spliterator()));
check(splitsWell(List.of(1, 2, 3).spliterator()));
check(splitsWell(linkedList.spliterator()));
check(!splitsWell(hashSet.spliterator()));
check(!splitsWell(Stream.iterate(0, i -> i + 1).spliterator()));

checkEq(estimatedSize(arrayList), 5_000L);
checkEq(estimatedSize(List.of()), 0L);

// All three conditions met.
checkEq(adviseOn(arrayList, 100L), new Verdict(true, "worth trying"));

// Splittability is checked first.
checkEq(adviseOn(hashSet, 100L), new Verdict(false, "not splittable"));

// Then size.
List<Integer> tiny = new ArrayList<>(List.of(1, 2, 3, 4));
checkEq(adviseOn(tiny, 1_000_000L), new Verdict(false, "too few elements"));

// Then total work: 5,000 elements at 10 ns each is 50 microseconds.
checkEq(adviseOn(arrayList, 10L), new Verdict(false, "not enough work"));
// 5,000 at 20 ns is 100 microseconds exactly, which qualifies.
checkEq(adviseOn(arrayList, 20L), new Verdict(true, "worth trying"));
// Exactly 1,000 elements qualifies on size.
List<Integer> thousand = new ArrayList<>();
for (int i = 0; i < 1_000; i++) {
    thousand.add(i);
}
checkEq(adviseOn(thousand, 200L), new Verdict(true, "worth trying"));
checkEq(adviseOn(new ArrayList<>(), 1_000_000L), new Verdict(false, "too few elements"));

// timeOn runs on whichever pool it is given, and both produce the same answer.
IntSupplier job = () -> IntStream.range(0, 200_000).parallel().map(i -> i % 7).sum();
int expected = IntStream.range(0, 200_000).map(i -> i % 7).sum();
checkEq(job.getAsInt(), expected);

long onCommon = timeOn(null, job);
check(onCommon >= 0);

ForkJoinPool own = new ForkJoinPool(2);
long onOwn = timeOn(own, job);
check(onOwn >= 0);
own.shutdownNow();

// Almost nothing to do: parallel cannot pay for its own setup.
checkEq(compare(20, 1), "sequential");
// A large CPU-bound workload: whichever wins, both pipelines must agree and
// the answer must be one of the two. See the notes for why this does not
// assert "parallel".
check(List.of("parallel", "sequential").contains(compare(100_000, 200)));
```

## Hints
- `Spliterator.SIZED` and `Spliterator.SUBSIZED` are the two bits;
  `hasCharacteristics` tests them. A `HashSet` is `SIZED` but not `SUBSIZED`,
  which is why splitting it cannot promise balanced halves.
- `estimateSize()` on an unbounded source returns `Long.MAX_VALUE`; that is the
  case to report as `-1`.
- `adviseOn` must test in the stated order, so an unsplittable *and* tiny
  source reports `"not splittable"`.
- Watch the arithmetic: `size * nanosPerElement` can overflow an `int` but the
  parameters are already `long`. 100 microseconds is 100,000 nanoseconds.
- `timeOn` with a pool: `pool.submit(work::getAsInt).get()` runs the pipeline
  inside that pool. With `null`, just call it.
- `compare` must warm up before timing, or it measures the interpreter — run
  each version a few times and take the last.

## Solution
```java
import java.util.concurrent.*;
import java.util.function.IntSupplier;
import java.util.stream.*;

record Verdict(boolean recommended, String reason) {}

static boolean splitsWell(Spliterator<?> spliterator) {
    return spliterator.hasCharacteristics(Spliterator.SIZED)
        && spliterator.hasCharacteristics(Spliterator.SUBSIZED);
}

static long estimatedSize(Collection<?> source) {
    long estimate = source.spliterator().estimateSize();
    return estimate == Long.MAX_VALUE ? -1 : estimate;
}

static Verdict adviseOn(Collection<?> source, long nanosPerElement) {
    if (!splitsWell(source.spliterator())) {
        return new Verdict(false, "not splittable");
    }
    long size = source.size();
    if (size < 1_000) {
        return new Verdict(false, "too few elements");
    }
    if (size * nanosPerElement < 100_000L) {
        return new Verdict(false, "not enough work");
    }
    return new Verdict(true, "worth trying");
}

static long timeOn(ForkJoinPool pool, IntSupplier work) throws Exception {
    long start = System.nanoTime();
    if (pool == null) {
        work.getAsInt();
    } else {
        pool.submit(work::getAsInt).get();
    }
    return (System.nanoTime() - start) / 1_000_000;
}

static int burn(int seed, int innerLoop) {
    int hash = seed;
    for (int i = 0; i < innerLoop; i++) {
        hash = hash * 31 + i;
    }
    return hash;
}

static String compare(int elements, int innerLoop) {
    long sequential = 0;
    long parallel = 0;
    for (int round = 0; round < 3; round++) {
        long start = System.nanoTime();
        int a = IntStream.range(0, elements).map(i -> burn(i, innerLoop)).sum();
        sequential = System.nanoTime() - start;

        start = System.nanoTime();
        int b = IntStream.range(0, elements).parallel().map(i -> burn(i, innerLoop)).sum();
        parallel = System.nanoTime() - start;

        if (a != b) {
            throw new IllegalStateException("the two pipelines disagreed");
        }
    }
    return parallel < sequential ? "parallel" : "sequential";
}
```

## Notes
`splitsWell` is where most of the judgement lives, and the `HashSet` case is
the one that teaches something. A `HashSet` *is* `SIZED` — it knows how many
elements it holds — and it is not `SUBSIZED`, because splitting a hash table
divides it by bucket range and the halves need not be equal. The framework can
still parallelise it, and it cannot plan a balanced split, which is exactly the
distinction the two bits encode. `LinkedList`, interestingly, reports both: it
knows the size and a split leaves two known sizes. What it does not do is split
*cheaply* — it walks. The characteristics tell you what is knowable, not what
is fast, and that is a limit of this kind of static advice worth being honest
about.

The ordering requirement in `adviseOn` is not pedantry either. A rule engine
that reports the first failing condition gives a stable, explainable answer; one
that reports whichever check happens to run first gives different reasons on
different days. When you write a checklist in code, fix its order.

`estimatedSize` returning `-1` for `Long.MAX_VALUE` is the same idea as the
chapter's `Stream.iterate` measurement: an unbounded source reports the largest
possible estimate, which means "no idea" rather than "very many". Code that
treats it as a number will size buffers of nine quintillion.

`timeOn`'s pool argument works because `ForkJoinTask` resolves the pool from
the thread that runs it, so a parallel stream submitted into a
`ForkJoinPool` uses that pool. As the chapter said, this is not a documented
guarantee of the streams API — it is worth knowing, worth using when you need
to isolate a workload, and not worth building an architecture on.

`compare` is the part that matters most and is easiest to get wrong. Timing
either version once measures the interpreter, so the loop runs three rounds and
keeps the last — chapter 6.5's rule, applied to a decision rather than to a
claim. And it checks that the two pipelines agree, because a comparison between
a fast wrong answer and a slow right one is not a comparison at all.

Notice what the tests do **not** assert: that `compare(100_000, 200)` returns
`"parallel"`. It usually does, and on a machine whose cores are already busy —
a loaded build agent, or a grader running other exercises — it does not, because
the common pool has nothing spare to give. An assertion on which side wins is a
timing assertion, and chapter 9.1 lists those among the tests that lie. What is
worth asserting is that the tiny case never pays, that both pipelines agree,
and that the comparison produces an answer at all. The chapter's rules exist
precisely because the measurement is a property of the machine, not of the
code.
