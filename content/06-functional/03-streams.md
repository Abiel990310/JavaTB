---
title: "Streams — the pipeline, and laziness"
navTitle: "Streams"
summary: >-
  A stream is not a collection. It is a plan that does nothing until you ask it for an answer, and then runs one element all the way through at a time.
objectives:
  - Describe a pipeline as source, intermediate operations, and terminal operation
  - Predict the order in which stage code runs, and why
  - Explain why a stream may be consumed only once
  - Choose a primitive stream where the elements are primitives
status: complete
standard: java21
requires: [method-references]
---

Every stream pipeline has three parts: a **source**, some number of
**intermediate operations**, and exactly one **terminal operation**.

```java run title="The shape of it"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("alpha", "bee", "cormorant", "dodo");

        List<String> shouted = words.stream()      // source
            .filter(w -> w.length() > 3)           // intermediate
            .map(String::toUpperCase)              // intermediate
            .toList();                             // terminal

        System.out.println(shouted);
    }
}
```

The intermediate operations return another stream, which is how they chain. The
terminal operation returns something that is not a stream — a list, a number,
an `Optional`, or nothing at all — and it is the only part that does any work.

## Nothing runs until the terminal operation

This is the fact everything else follows from, so it is worth watching happen:

```java run title="Who runs, and when"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("alpha", "bee", "cormorant", "dodo");

        System.out.println("-- building --");
        Stream<String> pipeline = words.stream()
            .filter(w -> {
                System.out.println("  filter " + w);
                return w.length() > 3;
            })
            .map(w -> {
                System.out.println("  map " + w);
                return w.toUpperCase();
            });
        System.out.println("-- built; nothing has printed --");

        System.out.println(pipeline.toList());
    }
}
```

Two things in that output are worth more than the rest of this chapter.

First, building the pipeline printed nothing. `filter` and `map` recorded what
you asked for and returned.

Second, look at the order once `toList()` runs:

```
filter alpha
map alpha
filter bee
filter cormorant
map cormorant
```

Not *all the filtering, then all the mapping*. Each element is pushed the whole
way down the pipeline before the next one starts — and `bee` never reaches
`map` at all, because `filter` rejected it. A stream is not a sequence of
passes over a collection; it is one pass, with the stages composed into a
single loop body.

That is what makes this cheap. Chaining ten operations does not build ten
intermediate lists; it builds one loop that does ten things per element.

## Laziness buys short-circuiting

Because the terminal operation pulls elements one at a time, it can stop:

```java run title="Stopping early"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("alpha", "bee", "cormorant", "dodo");

        Optional<String> first = words.stream()
            .filter(w -> {
                System.out.println("  filter " + w);
                return w.length() > 3;
            })
            .findFirst();

        System.out.println(first);
        System.out.println("anyMatch: " + words.stream().anyMatch(w -> w.startsWith("b")));
    }
}
```

`filter` runs exactly once. `findFirst`, `anyMatch`, `allMatch`, `noneMatch`
and `limit` are all **short-circuiting**: they stop as soon as the answer is
determined. A loop with a `break` does the same thing; the difference is that
the stream version keeps the `break` and the condition in the same expression.

Short-circuiting is also what makes an infinite source legal:

```java run title="Infinite, but only as far as you look"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.iterate(1, i -> i * 2).limit(8).toList());
        System.out.println(Stream.generate(() -> "x").limit(3).toList());
        System.out.println(IntStream.iterate(1, i -> i <= 100, i -> i * 3).boxed().toList());
        System.out.println(IntStream.range(0, 5).boxed().toList());
    }
}
```

`Stream.iterate(1, i -> i * 2)` describes an endless sequence and costs
nothing to describe. The three-argument `iterate` — seed, condition, next — is
the stream spelling of a `for` loop and usually the clearer choice, since the
end condition sits next to the start.

## A stream may be used once

```java run expect-throw title="Only once"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        Stream<String> words = Stream.of("a", "b", "c");

        System.out.println(words.count());
        System.out.println(words.count());
    }
}
```

*stream has already been operated upon or closed.* A stream holds a position in
its source, not a copy of it, so there is nothing to rewind. If you need two
answers, either take two streams from the source, or collect once and ask the
collection twice.

The practical consequence is that a `Stream` is a bad type for a field or a
return value that anyone might use twice. Return the collection, or return a
`Supplier<Stream<T>>` if the caller really does need a fresh one each time.

## `peek` is not a debugging guarantee

Since laziness means "run only what the answer needs", an operation the answer
does not need may not run at all:

```java run title="An operation that never happens"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = List.of("alpha", "bee", "cormorant", "dodo");

        long counted = words.stream()
            .peek(w -> System.out.println("  peek " + w))
            .count();

        System.out.println("count = " + counted);

        long filtered = words.stream()
            .filter(w -> w.length() > 3)
            .peek(w -> System.out.println("  peek " + w))
            .count();

        System.out.println("count = " + filtered);
    }
}
```

The first `peek` never prints. `count()` on a pipeline with no filtering asks
the source how many elements it has and skips the pipeline entirely — the
answer cannot depend on running it, so it does not. Add a `filter` and the
shortcut disappears, because now the count does depend on the elements.

`peek` is documented for debugging, and this is why: an operation whose only
purpose is a side effect is at the mercy of optimisations that assume you did
not want one. Use it to look at a pipeline you are working on; do not use it to
do anything.

## Primitive streams

`Stream<Integer>` boxes. `IntStream`, `LongStream` and `DoubleStream` do not,
and they carry extra methods (`sum`, `average`, `max`, `summaryStatistics`)
that only make sense for numbers.

```java run title="Measured: ten million elements, three ways"
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        int n = 10_000_000;

        for (int round = 1; round <= 4; round++) {
            long start = System.nanoTime();
            long loopTotal = 0;
            for (int i = 0; i < n; i++) {
                if (i % 3 == 0) loopTotal += i;
            }
            long loopMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long intTotal = IntStream.range(0, n)
                .filter(i -> i % 3 == 0)
                .asLongStream()
                .sum();
            long intMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long boxedTotal = Stream.iterate(0, i -> i + 1)
                .limit(n)
                .filter(i -> i % 3 == 0)
                .mapToLong(Integer::longValue)
                .sum();
            long boxedMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  loop " + loopMs + " ms"
                + "   IntStream " + intMs + " ms"
                + "   Stream<Integer> " + boxedMs + " ms"
                + "   (" + loopTotal + " / " + intTotal + " / " + boxedTotal + ")");
        }
    }
}
```

Warm, on the machine this was written on: the loop takes 13 ms, `IntStream`
takes 10 ms, and `Stream<Integer>` takes 87–107 ms. Read that twice. **The
stream is not the cost.** `IntStream` matched a hand-written loop, and the
eight-to-ten-fold slowdown in the third column is boxing — ten million `Integer`
allocations — not the pipeline.

So the rule is not "avoid streams in hot code". It is: when the elements are
primitives, use the primitive stream. `mapToInt`, `mapToLong`, `mapToObj` and
`boxed` move between the two worlds.

One trap comes with the territory:

```java run title="sum() returns int"
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("int sum:  " + IntStream.rangeClosed(1, 100_000).map(i -> i * 1000).sum());
        System.out.println("long sum: " + IntStream.rangeClosed(1, 100_000).mapToLong(i -> i * 1000L).sum());
    }
}
```

`IntStream.sum()` returns an `int`, and five billion does not fit in one — the
first line prints `708067456` with no warning of any kind. Chapter 1.2's
overflow, arriving through an API that reads as though it could not have it.
Either `mapToLong` before summing, or `asLongStream()`, or use
`summaryStatistics()`, whose `getSum()` is a `long`.

## `toList()` and `collect(toList())` are different

```java run title="Two lists"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> fromToList = Stream.of(3, 1, 2).toList();
        List<Integer> fromCollect = Stream.of(3, 1, 2).collect(Collectors.toList());

        System.out.println(fromToList.getClass().getSimpleName()
            + " / " + fromCollect.getClass().getSimpleName());

        fromCollect.add(9);
        System.out.println("collect: " + fromCollect);

        try {
            fromToList.add(9);
        } catch (UnsupportedOperationException e) {
            System.out.println("toList() gave an unmodifiable list");
        }
    }
}
```

`Stream.toList()`, added in Java 16, returns an **unmodifiable** list.
`collect(Collectors.toList())` returns a mutable `ArrayList` — and the
documentation does not promise even that, only "some `List`". Prefer
`toList()`; reach for `collect(Collectors.toCollection(ArrayList::new))` when
you genuinely need to keep adding.

`toList()` differs from `List.of` and `List.copyOf` in one way: it permits
`null` elements. That is deliberate — a stream that produced nulls should not
throw at the very end — but it means an unmodifiable list from a stream is not
quite the same animal as one from `List.copyOf`.

## Stateful operations have to see everything

`filter` and `map` decide each element on its own. `sorted` and `distinct`
cannot:

```java run title="Where the buffering is"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        System.out.println(Stream.of(5, 3, 5, 1).distinct().sorted().toList());

        List<Integer> peeked = new ArrayList<>();
        List<Integer> firstTwo = Stream.of(4, 1, 3, 2)
            .peek(peeked::add)
            .sorted()
            .limit(2)
            .toList();

        System.out.println(firstTwo + "  saw " + peeked);
    }
}
```

`limit(2)` after `sorted()` still visits every element, because you cannot know
the two smallest without looking at all four. `sorted` is a **stateful**
operation: it buffers the stream, sorts, and only then feeds anything onwards.
`distinct` keeps a set as it goes; `limit` and `skip` keep a counter.

Two consequences. Putting `filter` before `sorted` is faster than the other way
round, because there is less to buffer — and unlike a hand-written loop, the
stream will not reorder them for you. And `sorted()` on an infinite stream
hangs forever, since it is waiting for an end that never comes.

:::quiz
{
  "question": "`words.stream().peek(System.out::println).count()` prints nothing for a `List` source. Why?",
  "options": [
    { "text": "`count()` can answer from the source's size without running the pipeline, and nothing in it changes the count", "correct": true, "why": "Right. With no size-changing operation in the pipeline, the count is known up front, so the stages — including the side effect in `peek` — never run." },
    { "text": "`peek` is only enabled when assertions are on", "correct": false, "why": "`peek` is an ordinary operation with no debug flag. Add a `filter` before it and it prints." },
    { "text": "`count()` is not a terminal operation, so the pipeline never executes", "correct": false, "why": "`count()` is terminal — it returns a `long`, not a stream. The pipeline is skipped for a different reason." },
    { "text": "`System.out::println` captured a stale stream", "correct": false, "why": "That is chapter 6.2's trap, and it would still have printed — to the original stream. Here nothing is printed at all." }
  ]
}
:::

## Practice

:::exercise pipeline-order

:::exercise stream-the-log

:::recap
- A pipeline is **source → intermediate operations → one terminal operation**,
  and only the terminal operation does any work.
- Elements go through **one at a time**, all the way down, so ten chained
  operations build one loop rather than ten lists.
- Laziness gives short-circuiting (`findFirst`, `anyMatch`, `limit`) and makes
  infinite sources such as `Stream.iterate` usable.
- A stream is consumed once; a second terminal operation throws
  `IllegalStateException`. Do not store one.
- `peek` may not run at all — `count()` skips a pipeline whose length it
  already knows. Never rely on it for side effects.
- Use `IntStream`/`LongStream`/`DoubleStream` for primitives: measured here at
  loop speed, against eight to ten times slower for `Stream<Integer>`.
  `IntStream.sum()` returns an `int` and will overflow.
- `Stream.toList()` is unmodifiable (but allows `null`);
  `collect(Collectors.toList())` is not.
- `sorted` and `distinct` are stateful and buffer, so filter first, and never
  sort an infinite stream.
