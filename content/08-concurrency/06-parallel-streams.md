---
title: "Parallel streams — and the cases where they lose"
navTitle: "Parallel streams"
summary: >-
  One keyword, three ways to get a wrong answer, and a shared pool you did not know you were borrowing.
objectives:
  - State the associativity and identity rules a parallel reduction requires
  - Explain what ordering a parallel pipeline does and does not preserve
  - Recognise a source that cannot be split usefully
  - Decide when to run a pipeline on a pool of your own
status: complete
standard: java21
requires: [virtual-threads]
---

Chapter 6.5 measured `.parallel()`: forty-five times *worse* on eight elements,
three times better on twenty thousand expensive ones. That chapter was about
whether it pays. This one is about whether it is even correct — because the
failure mode of a parallel stream is usually not slowness. It is a different
answer.

## The reduction rules are not advice

```java run title="Three reductions, three surprises"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> numbers = IntStream.rangeClosed(1, 20).boxed().toList();

        System.out.println("subtraction, sequential: " + numbers.stream().reduce(0, (a, b) -> a - b));
        System.out.println("subtraction, parallel:   " + numbers.parallelStream().reduce(0, (a, b) -> a - b));

        System.out.println("sum with identity 0, seq: " + numbers.stream().reduce(0, Integer::sum));
        System.out.println("sum with identity 0, par: " + numbers.parallelStream().reduce(0, Integer::sum));
        System.out.println("sum with identity 1, seq: " + numbers.stream().reduce(1, Integer::sum));
        System.out.println("sum with identity 1, par: " + numbers.parallelStream().reduce(1, Integer::sum));

        System.out.println("concat, sequential: " + Stream.of("a", "b", "c").reduce("|", (a, b) -> a + b));
        System.out.println("concat, parallel:   " + Stream.of("a", "b", "c").parallel().reduce("|", (a, b) -> a + b));
    }
}
```

Three different failures, and none of them throws.

**Subtraction is not associative.** `((0-1)-2)-3` is not `(0-1) - (2-3)`.
Sequentially the answer is -210; in parallel it is 0, and on a different
machine with a different split it could be something else again. `reduce`
requires an **associative** accumulator, and the specification means it: the
result is undefined otherwise, not merely different.

**The identity must be an identity.** `reduce(1, Integer::sum)` is wrong even
sequentially — it adds one — but sequentially it adds one *once*. In parallel
the identity is used to seed **every split**, so the error is multiplied by the
number of chunks: 211 against 230. The rule is `combine(identity, x)` must
equal `x` for every `x`.

**The concatenation case shows both at once.** `"|"` is not an identity for
string concatenation, so the parallel run prints `|a|b|c` — one separator per
split, laid out where the splits happened.

`Collectors.joining("|")` gets it right, because a collector's *combiner* is a
separate function from its accumulator (chapter 6.4), so the framework knows
how to merge two partial results rather than guessing that the accumulator will
do.

## Ordering: which operations promise it

```java run title="What survives going parallel"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> numbers = IntStream.rangeClosed(1, 20).boxed().toList();

        List<Integer> viaForEach = Collections.synchronizedList(new ArrayList<>());
        numbers.parallelStream().forEach(viaForEach::add);
        System.out.println("forEach kept order:        " + viaForEach.equals(numbers));

        List<Integer> viaForEachOrdered = Collections.synchronizedList(new ArrayList<>());
        numbers.parallelStream().forEachOrdered(viaForEachOrdered::add);
        System.out.println("forEachOrdered kept order: " + viaForEachOrdered.equals(numbers));

        System.out.println("toList kept order:         "
            + numbers.parallelStream().map(value -> value).toList().equals(numbers));

        System.out.println("findFirst: " + numbers.parallelStream().filter(value -> value > 5).findFirst().orElseThrow());
        System.out.println("findAny:   " + numbers.parallelStream().filter(value -> value > 5).findAny().orElseThrow());
    }
}
```

`toList` and `collect` preserve **encounter order** even in parallel — the
framework merges partial results in the right sequence. `forEach` does not: it
is documented to run in whatever order it likes, and the output shows it.
`forEachOrdered` restores the guarantee and gives up most of the parallelism to
do it.

`findFirst` must find the *first*, so it cannot stop as soon as any branch
matches; `findAny` can, and returns whatever it found — 13 rather than 6 in
this run. If any element will do, say `findAny` and let the framework stop
early.

## Stateful lambdas

```java run title="An ArrayList and a hundred thousand writers"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> unsafe = new ArrayList<>();
        try {
            IntStream.range(0, 100_000).parallel().boxed().forEach(unsafe::add);
        } catch (RuntimeException failure) {
            System.out.println("threw " + failure.getClass().getSimpleName());
        }
        System.out.println("collected " + unsafe.size() + " of 100000, contains null: " + unsafe.contains(null));

        List<Integer> safe = IntStream.range(0, 100_000).parallel().boxed().toList();
        System.out.println("collect gave " + safe.size() + ", in order: "
            + (safe.get(0) == 0 && safe.get(99_999) == 99_999));
    }
}
```

Around fourteen thousand of a hundred thousand elements survive, and the list
contains `null`s — an `ArrayList` mid-resize seen by another thread. This is
chapter 8.1's shared mutable state, reached through a pipeline that looks
declarative.

The rule for a parallel pipeline: **every lambda must be stateless**. It may
read shared immutable data, and it must not write anything outside itself.
Accumulation is the collector's job, and `collect`/`toList` get it right by
construction because each thread accumulates into its own container and the
combiner merges them.

## Sources that cannot be split

Splitting is done by a `Spliterator`, and how well it splits is a property of
the source, not of your pipeline:

```java run title="What the framework knows before it starts"
import java.util.*;
import java.util.stream.*;

public class Main {
    static String describe(Spliterator<?> spliterator) {
        List<String> characteristics = new ArrayList<>();
        if (spliterator.hasCharacteristics(Spliterator.SIZED)) characteristics.add("SIZED");
        if (spliterator.hasCharacteristics(Spliterator.SUBSIZED)) characteristics.add("SUBSIZED");
        if (spliterator.hasCharacteristics(Spliterator.ORDERED)) characteristics.add("ORDERED");
        if (spliterator.hasCharacteristics(Spliterator.IMMUTABLE)) characteristics.add("IMMUTABLE");
        return "estimate=" + spliterator.estimateSize() + "  " + characteristics;
    }

    public static void main(String[] args) {
        List<Integer> sample = List.of(1, 2, 3, 4);
        System.out.println("ArrayList:      " + describe(new ArrayList<>(sample).spliterator()));
        System.out.println("List.of:        " + describe(sample.spliterator()));
        System.out.println("IntStream.range:" + describe(IntStream.range(0, 4).spliterator()));
        System.out.println("HashSet:        " + describe(new HashSet<>(sample).spliterator()));
        System.out.println("Stream.iterate: " + describe(Stream.iterate(0, i -> i + 1).spliterator()));
    }
}
```

`SIZED` means the framework knows how many elements there are; `SUBSIZED` means
it will still know after a split. An array-backed source has both, so splitting
is arithmetic on an index — the ideal case.

`Stream.iterate` reports an estimate of `Long.MAX_VALUE` and is neither
`SIZED` nor `SUBSIZED`, because element *n+1* is only knowable after element
*n*. The framework cannot plan a balanced split, so it guesses in fixed-size
chunks. `LinkedList` is `SIZED` but has to walk half the list to find the
midpoint. `BufferedReader.lines()` and `Files.lines()` are the same shape.

Rule of thumb: parallelise arrays, `ArrayList`, `IntStream.range` and
`HashMap`/`HashSet` views. Copy anything else into an `ArrayList` first, or
leave it sequential.

## The pool you are borrowing

```java run title="Measured: sharing the common pool"
import java.util.concurrent.*;
import java.util.stream.*;

public class Main {
    static long work(int n) {
        long hash = n;
        for (int i = 0; i < 20_000; i++) {
            hash = hash * 31 + i;
        }
        return hash;
    }

    public static void main(String[] args) throws Exception {
        System.out.println("common pool parallelism: " + ForkJoinPool.getCommonPoolParallelism());

        long start = System.nanoTime();
        long alone = IntStream.range(0, 4_000).parallel().mapToLong(Main::work).sum();
        long aloneMs = (System.nanoTime() - start) / 1_000_000;

        Thread blocker = new Thread(() -> IntStream.range(0, 16).parallel().forEach(i -> {
            try {
                Thread.sleep(1_500);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        }));
        blocker.setDaemon(true);
        blocker.start();
        Thread.sleep(300);

        start = System.nanoTime();
        long shared = IntStream.range(0, 4_000).parallel().mapToLong(Main::work).sum();
        long sharedMs = (System.nanoTime() - start) / 1_000_000;

        ForkJoinPool own = new ForkJoinPool(4);
        start = System.nanoTime();
        long isolated = own.submit(() ->
            IntStream.range(0, 4_000).parallel().mapToLong(Main::work).sum()).get();
        long isolatedMs = (System.nanoTime() - start) / 1_000_000;
        own.shutdownNow();

        System.out.println("4000 items alone:                    " + aloneMs + " ms");
        System.out.println("4000 items, common pool blocked:     " + sharedMs + " ms");
        System.out.println("4000 items on a pool of my own:      " + isolatedMs + " ms");
        System.out.println("same answer every time:              " + (alone == shared && shared == isolated));
    }
}
```

Every parallel stream in the JVM runs on the **common** `ForkJoinPool`, which
has `availableProcessors() - 1` threads. Sixteen tasks sleeping for a second
and a half take all of them, and the measurement shows the effect: about 40 ms
alone against about 70 ms while the pool is occupied.

Two things about that number are worth noticing. It is a real slowdown, so
"keep blocking work off the common pool" is sound advice. And it is only about
1.7 times, not sixteen — because the thread that *submits* a parallel stream
also works on it, so a pipeline is never completely starved. Received wisdom
often states this much more dramatically than it measures.

Submitting to a `ForkJoinPool` of your own is the standard workaround, and the
last measurement shows it works. It is also not a documented feature: the
stream runs on the submitting pool because that is how `ForkJoinTask` resolves
its pool, not because the streams API promises anything. Treat it as a
pragmatic fix, and prefer an `ExecutorService` and explicit tasks when the
work is important enough to need its own pool.

Note also what virtual threads do *not* change here: parallel streams use the
fork-join pool, not virtual threads, and chapter 8.5's advice does not apply.

## When to use one

The honest checklist, all of which must hold:

1. The source splits well — an array, an `ArrayList`, a range.
2. There are enough elements, and enough work per element, to pay for the
   splitting. Chapter 6.5 measured the threshold as thousands, not tens.
3. Every lambda is stateless and side-effect-free.
4. The reduction is associative with a true identity, or you are using a
   collector.
5. Encounter order either does not matter or is preserved by the operations
   you use.
6. You have measured it, on the machine that will run it.

Miss any of the first five and the answer may be wrong. Miss the sixth and you
will not know whether it helped.

:::quiz
{
  "question": "`Stream.of(\"a\", \"b\", \"c\").parallel().reduce(\"|\", (a, b) -> a + b)` returns `\"|a|b|c\"` where the sequential version returns `\"|abc\"`. What is wrong?",
  "options": [
    { "text": "`\"|\"` is not an identity for concatenation, and in parallel the identity seeds every split rather than just the start", "correct": true, "why": "Right. `combine(identity, x)` must equal `x`; here it prepends a separator, so each chunk gets one." },
    { "text": "String concatenation is not associative", "correct": false, "why": "It is associative — `(a+b)+c` equals `a+(b+c)`. The identity is the broken half." },
    { "text": "Strings are immutable, so the accumulator cannot merge partial results", "correct": false, "why": "Immutability is exactly what makes the accumulator safe here; the framework merges by calling it again." },
    { "text": "`parallel()` on a three-element stream is undefined behaviour", "correct": false, "why": "It is perfectly defined and would give `\"|abc\"` with a correct identity — try `reduce(\"\", (a, b) -> a + b)`." }
  ]
}
:::

## Practice

:::exercise parallel-correctness

:::exercise when-parallel-pays

:::recap
- A parallel `reduce` needs an **associative** accumulator and a true
  **identity**: `combine(identity, x) == x`. Break either and you get a wrong
  answer with no exception — subtraction gave -210 sequentially and 0 in
  parallel.
- The identity seeds every split, so an incorrect one is wrong once
  sequentially and once per chunk in parallel.
- `collect`/`toList` preserve encounter order; `forEach` does not, and
  `forEachOrdered` gives up parallelism to restore it. `findAny` can stop
  early, `findFirst` cannot.
- Every lambda in a parallel pipeline must be stateless. Writing to a shared
  `ArrayList` lost 86% of a hundred thousand elements and produced `null`s.
- Splitting is the source's property: `SIZED`+`SUBSIZED` (arrays, `ArrayList`,
  ranges) split for free; `Stream.iterate` reports `Long.MAX_VALUE` and cannot
  be planned.
- Every parallel stream shares the common pool of `availableProcessors() - 1`
  threads. Blocking it measurably slowed a CPU-bound pipeline — by about 1.7
  times, not the catastrophe usually described, because the submitting thread
  participates.
- Running on your own `ForkJoinPool` works and is not a documented guarantee.
