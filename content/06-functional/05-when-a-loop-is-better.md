---
title: "When a loop is the better answer"
navTitle: "When a loop wins"
summary: >-
  Streams are not a replacement for loops. Four situations where the loop is clearer, faster, or the only thing that works — and what parallel actually costs.
objectives:
  - Name the cases where a loop reads better than a pipeline
  - Account for per-pipeline overhead on small collections
  - Explain why checked exceptions and index-dependent logic resist streams
  - State the conditions under which parallel streams help, and measure one that does not
status: complete
standard: java21
requires: [collectors]
---

Part 6 has spent four chapters on streams, so this one is the correction.
Streams are a tool with a shape, and code that does not have that shape is
worse when forced into it. Here is when to write the loop.

## The pipeline has a fixed cost

Chapter 6.3 measured `IntStream` matching a hand-written loop over ten million
elements. That is the good case. Turn it round — many pipelines over few
elements — and the picture inverts:

```java run title="Measured: two million pipelines over eight elements"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> small = IntStream.range(0, 8).boxed().toList();
        int reps = 2_000_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long viaLoop = 0;
            for (int r = 0; r < reps; r++) {
                for (int value : small) viaLoop += value;
            }
            long loopMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long viaStream = 0;
            for (int r = 0; r < reps; r++) {
                viaStream += small.stream().mapToInt(Integer::intValue).sum();
            }
            long streamMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round + ":  loop " + loopMs + " ms"
                + "   stream " + streamMs + " ms   (" + viaLoop + " / " + viaStream + ")");
        }
    }
}
```

Warm: **loop 15 ms, stream 143 ms** — around 70 nanoseconds of setup per
pipeline. On one call that is invisible. Inside a method called two million
times it is the whole cost.

The rule is not "streams are slow". It is that a stream's cost has a fixed part
and a per-element part, and when the element count is small the fixed part is
all there is. A pipeline in the body of a hot loop is the shape to look for.

## The stack trace is nine frames longer

```java run expect-throw title="Where did that come from?"
import java.util.*;
import java.util.stream.*;

public class Main {
    static int parse(String value) {
        return Integer.parseInt(value);
    }

    public static void main(String[] args) {
        List<String> values = List.of("1", "two", "3");
        System.out.println(values.stream().map(Main::parse).toList());
    }
}
```

Look at the trace. Between `Main.parse` and `Main.main` sit nine frames of
`ReferencePipeline`, `AbstractPipeline` and `RandomAccessSpliterator` — the
machinery, not your program. The same failure in a loop gives five frames, four
of which are `Integer.parseInt` doing its job.

Neither version tells you that `"two"` was the culprit; you get that from the
exception message either way. What the loop gives you is a trace you can read
at a glance, and a line number that points at a statement rather than at a
terminal operation several stages downstream of the mistake. For a pipeline you
are actively debugging, that difference is worth something.

## Checked exceptions do not pass through

Chapter 6.1 showed that a lambda may not throw a checked exception its
interface does not declare, and no interface in `java.util.function` declares
any. So this cannot be written as a pipeline without a decision:

```java run title="The wrapping tax"
import java.io.*;
import java.util.*;
import java.util.stream.*;

public class Main {
    static String load(String name) throws IOException {
        if (name.isEmpty()) {
            throw new IOException("no such resource");
        }
        return name.toUpperCase();
    }

    static List<String> loadAllByLoop(List<String> names) throws IOException {
        List<String> loaded = new ArrayList<>();
        for (String name : names) {
            loaded.add(load(name));
        }
        return loaded;
    }

    static List<String> loadAllByStream(List<String> names) throws IOException {
        try {
            return names.stream()
                .map(name -> {
                    try {
                        return load(name);
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                })
                .toList();
        } catch (UncheckedIOException e) {
            throw e.getCause();
        }
    }

    public static void main(String[] args) throws IOException {
        List<String> names = List.of("a", "b");
        System.out.println(loadAllByLoop(names));
        System.out.println(loadAllByStream(names));
    }
}
```

Both methods have the same signature and the same behaviour. One is four lines
and one is fifteen, and the fifteen include a wrap and an unwrap that exist
only to get an `IOException` past a `Function`. `UncheckedIOException` is in
the JDK precisely because this problem is common — but "the JDK has a class for
my workaround" is not the same as "this is a good place for a pipeline".

When the body of the loop can fail in a checked way, write the loop.

## Position, and looking at two elements at once

A pipeline sees one element at a time and does not know where it is. Anything
that needs an index, a neighbour, or a running window fights that:

```java run title="Differences between neighbours"
import java.util.*;
import java.util.stream.*;

public class Main {
    static List<Integer> gapsByLoop(List<Integer> values) {
        List<Integer> gaps = new ArrayList<>();
        for (int i = 1; i < values.size(); i++) {
            gaps.add(values.get(i) - values.get(i - 1));
        }
        return gaps;
    }

    static List<Integer> gapsByStream(List<Integer> values) {
        return IntStream.range(1, values.size())
            .mapToObj(i -> values.get(i) - values.get(i - 1))
            .toList();
    }

    public static void main(String[] args) {
        List<Integer> readings = List.of(3, 7, 7, 12, 4);
        System.out.println(gapsByLoop(readings));
        System.out.println(gapsByStream(readings));
    }
}
```

The stream version works, and notice what it had to do: stream the *indices*
rather than the elements, then index back into the list. That is a loop wearing
a costume. It is also silently O(n²) if `values` is a `LinkedList`, because
`get(i)` is not free there — a trap the plain loop over the list would have
had too, but which `for (int value : values)` would not.

The same applies to early exit that needs to remember something.
`findFirst` handles "the first element matching a predicate"; "the first
element that is larger than the running total so far" has nowhere to keep the
running total, and the stream answer involves an `AtomicInteger` captured from
outside — which is to say, a loop with extra ceremony.

## Side effects belong in a loop

```java run title="forEach is not a for loop"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> names = List.of("ada", "grace", "alan");

        // Works, and is the wrong shape.
        List<String> collected = new ArrayList<>();
        names.stream().map(String::toUpperCase).forEach(collected::add);
        System.out.println(collected);

        // Say what you mean.
        System.out.println(names.stream().map(String::toUpperCase).toList());

        // And when the point really is a side effect, the loop is honest.
        for (String name : names) {
            System.out.println("hello " + name);
        }
    }
}
```

`forEach(collected::add)` is a pipeline whose purpose is to mutate something
outside itself. It works sequentially and it is a data race the moment anyone
adds `.parallel()`, because `ArrayList` is not thread-safe and nothing in the
code says it must not be shared. Here is what that looks like:

```java run title="Two hundred trials of the same race"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Set<String> outcomes = new LinkedHashSet<>();

        for (int trial = 0; trial < 200; trial++) {
            List<Integer> source = new ArrayList<>();
            for (int i = 0; i < 5_000; i++) {
                source.add(i);
            }

            List<Integer> sink = new ArrayList<>();
            try {
                source.parallelStream().forEach(sink::add);
                outcomes.add(sink.size() == 5_000 ? "right size" : "wrong size");
                if (sink.contains(null)) {
                    outcomes.add("contains null");
                }
            } catch (Throwable failure) {
                outcomes.add("threw " + failure.getClass().getSimpleName());
            }
        }

        System.out.println(outcomes);
    }
}
```

Two hundred identical runs, and the machine this was written on saw all four
outcomes: a short list, a list containing `null`, an
`ArrayIndexOutOfBoundsException` thrown from inside `ArrayList.add`, and the
right answer. Your run may show a different subset, which is exactly the
complaint — the last outcome is the dangerous one, because it is what a test
will show you. `collect` exists so that the accumulation is
the collector's problem instead of yours.

The rule: if a pipeline's terminal operation is `forEach` and the lambda
mutates a captured variable, the loop was the right answer.

## Parallel: measured

`.parallel()` is one word and looks free. It is not:

```java run title="Measured: where parallel helps and where it wrecks you"
import java.util.*;
import java.util.stream.*;

public class Main {
    static long expensive(int n) {
        long h = n;
        for (int i = 0; i < 2000; i++) {
            h = h * 31 + i;
        }
        return h;
    }

    public static void main(String[] args) {
        System.out.println("cores: " + Runtime.getRuntime().availableProcessors());

        List<Integer> eight = List.of(1, 2, 3, 4, 5, 6, 7, 8);
        int reps = 30_000;

        long start = System.nanoTime();
        long sequentialTotal = 0;
        for (int i = 0; i < reps; i++) {
            sequentialTotal += eight.stream().mapToInt(Integer::intValue).sum();
        }
        long tinySeq = (System.nanoTime() - start) / 1_000_000;

        start = System.nanoTime();
        long parallelTotal = 0;
        for (int i = 0; i < reps; i++) {
            parallelTotal += eight.parallelStream().mapToInt(Integer::intValue).sum();
        }
        long tinyPar = (System.nanoTime() - start) / 1_000_000;

        System.out.println("30,000 pipelines over 8 elements:  sequential " + tinySeq
            + " ms   parallel " + tinyPar + " ms   same answer: "
            + (sequentialTotal == parallelTotal));

        for (int round = 1; round <= 2; round++) {
            start = System.nanoTime();
            long seq = IntStream.range(0, 20_000).mapToLong(Main::expensive).sum();
            long dearSeq = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long par = IntStream.range(0, 20_000).parallel().mapToLong(Main::expensive).sum();
            long dearPar = (System.nanoTime() - start) / 1_000_000;

            System.out.println("20,000 expensive elements, round " + round
                + ":  sequential " + dearSeq + " ms   parallel " + dearPar
                + " ms   same answer: " + (seq == par));
        }
    }
}
```

On the four-core machine this was written on: the eight-element case went from
**30 ms to 1342 ms** — forty-five times *worse* — while the expensive case went
from 37 ms to 11 ms, a genuine three-and-a-bit speedup. Same keyword, opposite
result.

The cost is submitting work to the common fork-join pool and joining it back.
That is a fixed price per pipeline, and it dwarfs eight additions. Parallel
pays only when four things hold:

1. **Enough elements** — thousands, not eight, and the threshold rises as the
   per-element work falls.
2. **Enough work per element** — the expensive case above is doing two thousand
   multiplications per element. A `sum` is not.
3. **A splittable source.** `ArrayList` and `int[]` split by index, in constant
   time. `LinkedList` and `Stream.iterate` must be walked to be split, so
   parallel buys little and can lose.
4. **No shared mutable state, and no order dependence.** A parallel `forEach`
   visits elements in an unspecified order on unspecified threads.

There is a fifth, easy to overlook: the common pool is shared by the whole JVM.
A long parallel stream in one request delays every other parallel stream in the
process. In a server, that is usually reason enough not to.

Measure before and after. `.parallel()` is the one stream operation that is
never obviously right.

## So: which?

Write the **pipeline** when the code is a transformation — map, filter,
group, join, summarise — and each element is independent. It will be shorter
and it will say what it does.

Write the **loop** when any of these is true:

- the body can throw a checked exception;
- the logic depends on position, neighbours, or accumulated state;
- the purpose is a side effect rather than a value;
- the collection is small and the code is hot;
- you need to `break` out with more than a predicate's worth of reason.

And write whichever one your reader will understand faster, which is usually
the one that needs no explanation. Both compile to a loop in the end.

:::quiz
{
  "question": "`list.parallelStream().mapToInt(Integer::intValue).sum()` on an eight-element list, called 30,000 times, measured 45× slower than the sequential version. What is the cost?",
  "options": [
    { "text": "Splitting the work into fork-join tasks and joining the results, paid once per pipeline regardless of size", "correct": true, "why": "Right. The overhead is a fixed per-pipeline cost, so with eight elements there is nothing for it to amortise against." },
    { "text": "Contention on the `List`, since several threads read it at once", "correct": false, "why": "Concurrent reads of an immutable list are free. Nothing is being written." },
    { "text": "Boxing, which only happens on the parallel path", "correct": false, "why": "`Integer::intValue` unboxes identically in both versions; the sequential one pays the same boxing cost and is still 45× faster." },
    { "text": "The parallel version has to sort the results back into order", "correct": false, "why": "`sum` is order-independent and does no reordering. The cost is in setting the parallel machinery up at all." }
  ]
}
:::

## Practice

:::exercise loop-or-pipeline

:::exercise rewrite-the-report

:::recap
- A pipeline costs about 70 ns to build. Over eight elements, two million
  times, that was 143 ms against a loop's 15 ms.
- A stream stack trace carries nine frames of pipeline machinery between your
  code and your code.
- Checked exceptions cannot cross `java.util.function`, so a failing body means
  a wrap-and-unwrap or a loop.
- Position, neighbours and running state have no natural home in a pipeline;
  streaming the indices is a loop in disguise.
- `forEach` mutating a captured variable is a loop that has lost its safety.
  Use `collect`.
- `.parallel()` measured 45× *worse* on eight elements and 3× better on twenty
  thousand expensive ones. It needs volume, per-element work, a splittable
  source, and no shared state — and it borrows a JVM-wide pool.
