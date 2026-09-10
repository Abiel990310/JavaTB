---
title: "Collectors"
navTitle: "Collectors"
summary: >-
  The terminal operation you will use most, the four functions every collector is made of, and the one-line reduction that is three hundred times slower than the collector for it.
objectives:
  - Use groupingBy, partitioningBy, toMap and joining, including downstream collectors
  - Say why toMap throws on a duplicate key and how to decide the winner
  - Explain the difference between reduce and collect for a mutable result
  - Write a collector with Collector.of
status: complete
standard: java21
requires: [streams]
---

`toList()` is one terminal operation among many, and `collect` is the general
one. A `Collector` describes how to accumulate a stream into a result — and
because it is an object, collectors compose.

We will use one record throughout:

```java run title="The data"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    static final List<Person> PEOPLE = List.of(
        new Person("Ada", "London", 36),
        new Person("Grace", "New York", 45),
        new Person("Alan", "London", 41));

    public static void main(String[] args) {
        System.out.println(PEOPLE.stream().map(Person::name).collect(Collectors.joining(", ", "[", "]")));
        System.out.println(PEOPLE.stream().collect(Collectors.summarizingInt(Person::age)));
    }
}
```

`joining` takes an optional separator, prefix and suffix, and
`summarizingInt` gives count, sum, min, average and max in one pass. Both are
the kind of thing you would otherwise write a loop for and get subtly wrong at
the edges — `joining` on an empty stream gives `[]`, not a stray separator.

## `groupingBy`

```java run title="Grouping, and what to do with each group"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    static final List<Person> PEOPLE = List.of(
        new Person("Ada", "London", 36),
        new Person("Grace", "New York", 45),
        new Person("Alan", "London", 41));

    public static void main(String[] args) {
        System.out.println(PEOPLE.stream()
            .collect(Collectors.groupingBy(Person::city)));

        System.out.println(PEOPLE.stream()
            .collect(Collectors.groupingBy(Person::city, Collectors.counting())));

        TreeMap<String, List<String>> namesByCity = PEOPLE.stream()
            .collect(Collectors.groupingBy(
                Person::city,
                TreeMap::new,
                Collectors.mapping(Person::name, Collectors.toList())));
        System.out.println(namesByCity);

        System.out.println(PEOPLE.stream()
            .collect(Collectors.groupingBy(Person::city,
                Collectors.averagingInt(Person::age))));
    }
}
```

The one-argument form gives `Map<K, List<T>>`. The second argument is a
**downstream collector** — what to do with each group instead of listing it —
and this is where the composition pays off: `counting`, `summingInt`,
`averagingInt`, `mapping`, `filtering`, `toSet`, `minBy`, `joining`, or another
`groupingBy` for a two-level breakdown.

The three-argument form inserts a map factory. Note that it needs a target type
to infer against: assigning to `TreeMap<String, List<String>>` is what makes it
compile, and passing the same expression straight into `println` does not.

Two sharp edges:

```java run expect-throw title="A null grouping key"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> values = new ArrayList<>();
        values.add("a");
        values.add(null);

        System.out.println(values.stream()
            .collect(Collectors.groupingBy(s -> s == null ? null : s.toUpperCase())));
    }
}
```

`groupingBy` throws `NullPointerException` on a null key, even though `HashMap`
accepts one perfectly well. That is a documented restriction, not an accident,
and it catches people who group by a field that is occasionally absent. Map the
key to a sentinel — `Objects.requireNonNullElse(city, "unknown")` — before
grouping.

The map itself is a `HashMap` unless you say otherwise, so the iteration order
means nothing. If the output is going in front of a human, ask for a `TreeMap`
or a `LinkedHashMap`.

## `partitioningBy`

```java run title="Two groups, always"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    static final List<Person> PEOPLE = List.of(
        new Person("Ada", "London", 36),
        new Person("Grace", "New York", 45),
        new Person("Alan", "London", 41));

    public static void main(String[] args) {
        Map<Boolean, List<Person>> byAge = PEOPLE.stream()
            .collect(Collectors.partitioningBy(p -> p.age() > 40));
        System.out.println(byAge.get(true).size() + " over 40, " + byAge.get(false).size() + " not");

        Map<Boolean, Long> partitioned = PEOPLE.stream()
            .collect(Collectors.partitioningBy(p -> p.age() > 100, Collectors.counting()));
        Map<Boolean, Long> grouped = PEOPLE.stream()
            .collect(Collectors.groupingBy(p -> p.age() > 100, Collectors.counting()));
        System.out.println("partitioningBy: " + partitioned + "  get(true) = " + partitioned.get(true));
        System.out.println("groupingBy:     " + grouped + "  get(true) = " + grouped.get(true));

        List<String> withNull = new ArrayList<>();
        withNull.add("a");
        withNull.add(null);
        System.out.println(withNull.stream().collect(Collectors.partitioningBy(Objects::isNull)));
    }
}
```

`partitioningBy` is `groupingBy` with a `Predicate`, and its one real advantage
is in the output above: **both keys are always present**. `groupingBy` on the
same predicate produces `{false=3}`, so `get(true)` is `null`;
`partitioningBy` produces `{false=3, true=0}`. When you want both halves, this
is the one to reach for — no `getOrDefault` at every use site.

The last line shows the other difference. `partitioningBy` handles a `null`
element without complaint, because the key is a `boolean` your predicate
computed rather than the element itself.

## `toMap` and the duplicate key

```java run expect-throw title="Two people, one city"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    public static void main(String[] args) {
        List<Person> people = List.of(
            new Person("Ada", "London", 36),
            new Person("Grace", "New York", 45),
            new Person("Alan", "London", 41));

        Map<String, Person> byCity = people.stream()
            .collect(Collectors.toMap(Person::city, p -> p));
        System.out.println(byCity);
    }
}
```

*Duplicate key London (attempted merging values Person[name=Ada, …] and
Person[name=Alan, …]).* This is `toMap` being deliberately unhelpful, and it is
the right call: `Map.put` would have silently kept the last one, and a silent
loss of data is worse than an exception. The message even names both values.

The three-argument form says what to do instead:

```java run title="Deciding the winner"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Person(String name, String city, int age) {}

    public static void main(String[] args) {
        List<Person> people = List.of(
            new Person("Ada", "London", 36),
            new Person("Grace", "New York", 45),
            new Person("Alan", "London", 41));

        System.out.println(people.stream().collect(
            Collectors.toMap(Person::city, Person::name, (a, b) -> a + " & " + b)));

        System.out.println(people.stream().collect(
            Collectors.toMap(Person::city, Person::name, (first, second) -> first)));

        LinkedHashMap<String, Integer> ordered = Stream.of("delta", "alpha", "charlie", "bravo")
            .collect(Collectors.toMap(s -> s, String::length, (a, b) -> a, LinkedHashMap::new));
        System.out.println(ordered);

        Map<String, Integer> unordered = Stream.of("delta", "alpha", "charlie", "bravo")
            .collect(Collectors.toMap(s -> s, String::length));
        System.out.println(unordered);
    }
}
```

The merge function is `(existing, incoming)`, and returning the first argument
is "keep the first one I saw". The four-argument form adds a map factory, which
is the only way to get a `LinkedHashMap` — compare the last two lines: the
`HashMap` prints its four keys in an order that is neither insertion nor
alphabetical, and the `LinkedHashMap` keeps the stream's.

`toUnmodifiableList`, `toUnmodifiableSet` and `toUnmodifiableMap` do what they
say and reject `null` elements, unlike `Stream.toList()`.

## `reduce` versus `collect`

Both fold a stream to one value. The difference is whether the accumulation is
allowed to mutate:

```java run title="Measured: twenty thousand words"
import java.util.*;
import java.util.stream.*;

public class Main {
    public static void main(String[] args) {
        List<String> words = IntStream.range(0, 20_000).mapToObj(i -> "w" + i).toList();

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            String viaReduce = words.stream().reduce("", (a, b) -> a + b);
            long reduceMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            String viaJoining = words.stream().collect(Collectors.joining());
            long joinMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  reduce " + reduceMs + " ms"
                + "   joining " + joinMs + " ms"
                + "   same result: " + viaReduce.equals(viaJoining));
        }
    }
}
```

Warm: **reduce 330–360 ms, joining under 1 ms** — roughly three hundred times.
Same answer, and the `reduce` version is the one that looks elegant.

The reason is that `reduce`'s accumulator must be *pure*: it takes the running
value and the next element and returns a **new** value. `a + b` on strings
allocates a new `String` and copies both sides, so accumulating *n* strings
copies about *n*²/2 characters. `Collectors.joining` accumulates into a
`StringBuilder` — one buffer, appended to — and the collector contract is built
around exactly that: a *mutable* container.

This is what the four parts of a collector are for. Whenever the result is
built up (a list, a map, a builder), you want `collect`. Reserve `reduce` for
values that genuinely are values: `reduce(0, Integer::sum)`,
`reduce(Integer::max)`.

## Writing one

`Collector.of` takes the four functions directly:

```java run title="A collector of initials"
import java.util.*;
import java.util.stream.*;

public class Main {
    static Collector<String, ?, String> initials() {
        return Collector.of(
            StringBuilder::new,                                        // supplier
            (buffer, s) -> buffer.append(s.isEmpty() ? '?' : s.charAt(0)),   // accumulator
            StringBuilder::append,                                     // combiner
            StringBuilder::toString);                                  // finisher
    }

    public static void main(String[] args) {
        System.out.println(Stream.of("Ada", "Grace", "", "Alan").collect(initials()));
    }
}
```

- **supplier** — make an empty container.
- **accumulator** — fold one element into a container.
- **combiner** — merge two containers into one. Sequential streams never call
  it; parallel ones do, which is why it must exist even when it feels
  pointless.
- **finisher** — turn the container into the result. Omit it and the container
  *is* the result.

The wildcard in `Collector<String, ?, String>` is the container type, and it is
hidden on purpose: callers should not be able to see that a `StringBuilder` is
involved, because that is an implementation detail the collector may change.

Before writing one, check `Collectors` — there are around forty, and
`teeing` covers the case people most often reach for a custom collector to
solve:

```java run title="Two collectors, one pass"
import java.util.*;
import java.util.stream.*;

public class Main {
    record Range(int min, int max) {}

    public static void main(String[] args) {
        Range range = Stream.of(4, 9, 2, 7).collect(Collectors.teeing(
            Collectors.minBy(Comparator.<Integer>naturalOrder()),
            Collectors.maxBy(Comparator.<Integer>naturalOrder()),
            (min, max) -> new Range(min.orElseThrow(), max.orElseThrow())));

        System.out.println(range);
    }
}
```

`teeing` feeds every element to two collectors and merges their results — one
pass over a stream that can only be traversed once. The explicit
`Comparator.<Integer>naturalOrder()` is needed because the inference has too
little to go on otherwise; that awkwardness is the usual sign you are near the
edges of what generic inference can do.

:::quiz
{
  "question": "Why is `stream.reduce(\"\", (a, b) -> a + b)` hundreds of times slower than `stream.collect(Collectors.joining())`?",
  "options": [
    { "text": "`reduce`'s accumulator must return a new value, so each step allocates and copies the whole string so far", "correct": true, "why": "Right. That makes the total work quadratic in the number of characters, while `joining` appends into one `StringBuilder`." },
    { "text": "`reduce` runs the pipeline twice — once to count and once to accumulate", "correct": false, "why": "`reduce` is a single-pass terminal operation like any other. The cost is in what each step does, not how many passes there are." },
    { "text": "`joining` is implemented natively in the JVM", "correct": false, "why": "It is ordinary Java — a `StringJoiner` wrapped in a collector. You could write it yourself with `Collector.of`." },
    { "text": "`reduce` cannot short-circuit, and `joining` can", "correct": false, "why": "Neither short-circuits; both must see every element to produce the answer." }
  ]
}
:::

## Practice

:::exercise group-the-orders

:::exercise write-a-collector

:::recap
- `collect` is the general terminal operation; a `Collector` is supplier,
  accumulator, combiner and finisher.
- `groupingBy` takes a **downstream collector**, so grouping and summarising
  are one expression. Its key may not be `null`, and its map is a `HashMap`
  unless you pass a factory.
- `partitioningBy` always has both `true` and `false` keys; `groupingBy` only
  has the keys that occurred.
- `toMap` throws on a duplicate key rather than silently keeping the last. The
  three-argument form takes `(existing, incoming)`; the four-argument form is
  the only way to choose the map type.
- Use `collect` when the result is built up and `reduce` when it is a value:
  measured here at three hundred times for string concatenation.
- Write a collector with `Collector.of`, hiding the container behind `?`. Check
  `teeing` first — it covers most of the reasons to write one.
