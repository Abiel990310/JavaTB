---
id: parallel-correctness
title: "Make it safe to parallelise"
difficulty: core
chapter: parallel-streams
topics: [parallel-streams, reduction, associativity, side-effects]
check: unit
standard: java21
---

Six pipelines. Each must give the **same answer sequentially and in parallel**,
and the tests check both.

- `static long sumOfSquares(List<Integer> values, boolean parallel)`
- `static String concatenate(List<String> parts, boolean parallel)` — the parts
  joined with no separator
- `static String joinWithDashes(List<String> parts, boolean parallel)` — joined
  with `"-"` between them, nothing at the ends
- `static List<String> upperCased(List<String> values, boolean parallel)` — in
  input order
- `static Map<String, Long> countByFirstLetter(List<String> values, boolean parallel)`
- `static int maxLength(List<String> values, boolean parallel)` — 0 for an
  empty list

A helper is given:

```java
static <T> Stream<T> streamOf(List<T> values, boolean parallel)
```

## Starter
```java
static <T> Stream<T> streamOf(List<T> values, boolean parallel) {
    return parallel ? values.parallelStream() : values.stream();
}

static long sumOfSquares(List<Integer> values, boolean parallel) {
    long[] total = { 0 };
    streamOf(values, parallel).forEach(value -> total[0] += (long) value * value);
    return total[0];
}

static String concatenate(List<String> parts, boolean parallel) {
    return streamOf(parts, parallel).reduce("", (a, b) -> a + b);
}

static String joinWithDashes(List<String> parts, boolean parallel) {
    return streamOf(parts, parallel).reduce("-", (a, b) -> a + "-" + b);
}

static List<String> upperCased(List<String> values, boolean parallel) {
    List<String> result = new ArrayList<>();
    streamOf(values, parallel).map(String::toUpperCase).forEach(result::add);
    return result;
}

static Map<String, Long> countByFirstLetter(List<String> values, boolean parallel) {
    Map<String, Long> counts = new HashMap<>();
    streamOf(values, parallel).forEach(value ->
        counts.merge(value.substring(0, 1), 1L, Long::sum));
    return counts;
}

static int maxLength(List<String> values, boolean parallel) {
    return streamOf(values, parallel).mapToInt(String::length).reduce(1, Math::max);
}
```

## Tests
```java
List<Integer> numbers = new ArrayList<>();
for (int i = 1; i <= 20_000; i++) {
    numbers.add(i);
}
long expectedSquares = 0;
for (int value : numbers) {
    expectedSquares += (long) value * value;
}

checkEq(sumOfSquares(numbers, false), expectedSquares);
checkEq(sumOfSquares(numbers, true), expectedSquares);
checkEq(sumOfSquares(List.of(), true), 0L);

List<String> parts = new ArrayList<>();
StringBuilder expectedConcat = new StringBuilder();
for (int i = 0; i < 2_000; i++) {
    parts.add("p" + i);
    expectedConcat.append("p").append(i);
}

checkEq(concatenate(parts, false), expectedConcat.toString());
checkEq(concatenate(parts, true), expectedConcat.toString());
checkEq(concatenate(List.of(), true), "");

checkEq(joinWithDashes(List.of("a", "b", "c"), false), "a-b-c");
checkEq(joinWithDashes(List.of("a", "b", "c"), true), "a-b-c");
checkEq(joinWithDashes(List.of("solo"), true), "solo");
checkEq(joinWithDashes(List.of(), true), "");
checkEq(joinWithDashes(parts, true), joinWithDashes(parts, false));

List<String> words = new ArrayList<>();
for (int i = 0; i < 5_000; i++) {
    words.add("w" + i);
}
checkEq(upperCased(words, false), upperCased(words, true));
checkEq(upperCased(List.of("a", "b"), true), List.of("A", "B"));
checkEq(upperCased(words, true).size(), 5_000);
checkEq(upperCased(words, true).get(0), "W0");

List<String> mixed = new ArrayList<>();
for (int i = 0; i < 6_000; i++) {
    mixed.add((i % 3 == 0 ? "a" : i % 3 == 1 ? "b" : "c") + i);
}
checkEq(countByFirstLetter(mixed, false), countByFirstLetter(mixed, true));
checkEq(countByFirstLetter(mixed, true), Map.of("a", 2_000L, "b", 2_000L, "c", 2_000L));
checkEq(countByFirstLetter(List.of(), true), Map.of());

checkEq(maxLength(List.of("a", "abc", "ab"), false), 3);
checkEq(maxLength(List.of("a", "abc", "ab"), true), 3);
checkEq(maxLength(List.of(), true), 0);
checkEq(maxLength(List.of(""), true), 0);
```

## Hints
- `total[0] +=` from a parallel stream is a lost-update race, and `forEach` into
  an `ArrayList` is worse. Neither is fixed by a lock — use a reduction or a
  collector.
- `sumOfSquares` is `mapToLong(...).sum()`.
- `reduce("", (a, b) -> a + b)` is correct but quadratic (chapter 6.4).
  `Collectors.joining()` is linear and parallel-safe.
- `joinWithDashes` has a broken identity: `"-"` is not an identity for
  `a + "-" + b`. `Collectors.joining("-")` handles the separator and the empty
  case together.
- `countByFirstLetter` wants `Collectors.groupingBy(..., Collectors.counting())`,
  which gives each thread its own map and merges them.
- `maxLength`'s identity `1` is wrong for an empty list *and* is applied per
  split. The identity for `max` over lengths is `0`.

## Solution
```java
static <T> Stream<T> streamOf(List<T> values, boolean parallel) {
    return parallel ? values.parallelStream() : values.stream();
}

static long sumOfSquares(List<Integer> values, boolean parallel) {
    return streamOf(values, parallel).mapToLong(value -> (long) value * value).sum();
}

static String concatenate(List<String> parts, boolean parallel) {
    return streamOf(parts, parallel).collect(Collectors.joining());
}

static String joinWithDashes(List<String> parts, boolean parallel) {
    return streamOf(parts, parallel).collect(Collectors.joining("-"));
}

static List<String> upperCased(List<String> values, boolean parallel) {
    return streamOf(values, parallel).map(String::toUpperCase).toList();
}

static Map<String, Long> countByFirstLetter(List<String> values, boolean parallel) {
    return streamOf(values, parallel)
        .collect(Collectors.groupingBy(value -> value.substring(0, 1), Collectors.counting()));
}

static int maxLength(List<String> values, boolean parallel) {
    return streamOf(values, parallel).mapToInt(String::length).reduce(0, Math::max);
}
```

## Notes
Six pipelines, three distinct failures, and every one of them is silent.

**Two are side effects.** `total[0] +=` and `result.add(...)` write shared
state from a parallel `forEach`, which is chapter 8.1's lost update with a
declarative face on it. The fix is never a lock — a lock would make them
correct and slower than sequential. It is to stop accumulating by hand:
`sum()` and `toList()` give each thread its own accumulator and merge at the
end, which is what `collect`'s combiner exists for.

`upperCased` has a second fault the `forEach` hides: even with a thread-safe
list, results arrive in completion order. `toList()` on a parallel stream
preserves **encounter order**, and the test comparing the sequential and
parallel outputs element by element is what catches it.

**Two are identities.** `joinWithDashes` uses `"-"` as the identity for
`a + "-" + b`, so sequentially you get a leading dash and in parallel you get
one per split. `maxLength` uses `1`, which is not an identity for `max` — it is
wrong for an empty list even sequentially, and in parallel it is wrong for
every chunk whose maximum is 0. Both are caught by the rule from the chapter:
`combine(identity, x)` must equal `x` for every `x`. Test that on paper before
you write the reduce.

**One is a performance trap rather than a correctness one.**
`reduce("", (a, b) -> a + b)` gives the right answer, and it copies the whole
accumulated string at every step — chapter 6.4 measured that at three hundred
times slower than `joining`. In parallel it is worse, because each split builds
its own quadratic chain before they are concatenated.

`countByFirstLetter` is the one that looks safe and is not.
`ConcurrentHashMap.merge` would be atomic, but the starter uses a plain
`HashMap`, so several threads mutate it at once. `groupingBy` is correct for a
different reason worth understanding: it is not that the map is thread-safe, it
is that **there is no shared map** — each thread builds its own and the
collector's combiner merges them. That is the general shape of a correct
parallel accumulation, and it is why "use a concurrent collection" is the
second-best answer here rather than the first.
