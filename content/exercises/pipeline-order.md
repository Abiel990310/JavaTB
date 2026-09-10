---
id: pipeline-order
title: "What runs, and how often"
difficulty: core
chapter: streams
topics: [streams, laziness, short-circuit]
check: unit
standard: java21
---

Laziness is only useful if you can predict it. Each method below must produce
the right answer *and* touch the right number of elements — the tests count
calls, not just results.

- `static <T> Optional<T> firstMatching(List<T> values, Predicate<T> test)` —
  the first element passing `test`, testing no more elements than it must
- `static <T> List<T> firstMatching(List<T> values, Predicate<T> test, int max)`
  — up to `max` matches, again testing no more than necessary
- `static List<String> normalise(List<String> raw)` — trims each entry, drops
  the ones that are empty after trimming, uppercases the rest, removes
  duplicates, and returns them sorted. Trimming must happen once per element
  and uppercasing must not happen for entries that were dropped.
- `static long distinctWordCount(List<String> lines)` — the number of distinct
  whitespace-separated words across all lines, compared case-insensitively
- `static int[] squaresOfEvens(int limit)` — the squares of every even number
  in `0 .. limit - 1`, as an `int[]`, with no boxing in the pipeline

## Starter
```java
static <T> Optional<T> firstMatching(List<T> values, Predicate<T> test) {
    return values.stream().filter(test).toList().stream().findFirst();
}

static <T> List<T> firstMatching(List<T> values, Predicate<T> test, int max) {
    return values.stream().filter(test).toList().subList(0, max);
}

static List<String> normalise(List<String> raw) {
    return raw.stream()
        .map(String::toUpperCase)
        .filter(s -> !s.trim().isEmpty())
        .map(String::trim)
        .distinct()
        .sorted()
        .toList();
}

static long distinctWordCount(List<String> lines) {
    return lines.stream().map(line -> line.split("\\s+")).count();
}

static int[] squaresOfEvens(int limit) {
    return new int[0];
}
```

## Tests
```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6);

int[] tested = { 0 };
Predicate<Integer> even = n -> { tested[0]++; return n % 2 == 0; };

checkEq(firstMatching(numbers, even), Optional.of(2));
checkEq(tested[0], 2);                    // 1 rejected, 2 accepted — then stop

tested[0] = 0;
checkEq(firstMatching(numbers, n -> { tested[0]++; return n > 99; }), Optional.empty());
checkEq(tested[0], 6);

tested[0] = 0;
checkEq(firstMatching(numbers, even, 2), List.of(2, 4));
checkEq(tested[0], 4);                    // stops as soon as the second match lands

tested[0] = 0;
checkEq(firstMatching(numbers, even, 99), List.of(2, 4, 6));
checkEq(tested[0], 6);
checkEq(firstMatching(numbers, even, 0), List.of());

checkEq(normalise(List.of(" b ", "a", "", "   ", "A", "c")),
        List.of("A", "B", "C"));
checkEq(normalise(List.of()), List.of());

checkEq(distinctWordCount(List.of("the cat sat", "The mat")), 4L);
checkEq(distinctWordCount(List.of()), 0L);
checkEq(distinctWordCount(List.of("one")), 1L);

checkEq(Arrays.toString(squaresOfEvens(10)), "[0, 4, 16, 36, 64]");
checkEq(Arrays.toString(squaresOfEvens(1)), "[0]");
checkEq(Arrays.toString(squaresOfEvens(0)), "[]");
```

## Hints
- `.toList().stream().findFirst()` collects everything first, which defeats the
  point. `findFirst()` straight after `filter` short-circuits.
- For the `max` version, `limit(max)` before the terminal operation stops the
  source as soon as it has enough — and handles `max` larger than the number of
  matches without a `subList` bounds error.
- In `normalise`, the order of `map` and `filter` decides how much work is
  wasted. Trim once, then filter on the trimmed value, then uppercase.
- `flatMap` turns each line into its words: `Arrays.stream(line.split("\\s+"))`.
  Empty lines produce an empty first token, so filter those out.
- Case-insensitive distinctness needs a common form — map to lower case before
  `distinct()`.
- `IntStream.range(0, limit).filter(...).map(...).toArray()` never boxes.
  `.toArray()` on an `IntStream` gives an `int[]` directly.

## Solution
```java
static <T> Optional<T> firstMatching(List<T> values, Predicate<T> test) {
    return values.stream().filter(test).findFirst();
}

static <T> List<T> firstMatching(List<T> values, Predicate<T> test, int max) {
    return values.stream().filter(test).limit(max).toList();
}

static List<String> normalise(List<String> raw) {
    return raw.stream()
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .map(String::toUpperCase)
        .distinct()
        .sorted()
        .toList();
}

static long distinctWordCount(List<String> lines) {
    return lines.stream()
        .flatMap(line -> Arrays.stream(line.split("\\s+")))
        .filter(word -> !word.isEmpty())
        .map(word -> word.toLowerCase())
        .distinct()
        .count();
}

static int[] squaresOfEvens(int limit) {
    return IntStream.range(0, limit)
        .filter(n -> n % 2 == 0)
        .map(n -> n * n)
        .toArray();
}
```

## Notes
`.toList().stream().findFirst()` is the mistake this problem is built around,
and it is common because it *works*. The answer is right; only the amount of
work is wrong. Every element is tested and a whole list is built so that one
element can be taken from it. Written as `filter(test).findFirst()`, the
pipeline stops the first time the predicate says yes — which the test proves by
counting two calls where the collecting version would make six.

The `max` version has a second problem hiding in it: `subList(0, max)` throws
`IndexOutOfBoundsException` when there are fewer matches than `max`, so the
starter fails the `max = 99` case outright. `limit` has no such edge — asking
for more than exists gives what exists, and asking for zero gives nothing
without touching the source at all.

`normalise` is about ordering the stages. The starter uppercases every element
before finding out whether it will be kept, and then trims twice — once inside
the filter, once in a later `map`. Since each element runs through the whole
pipeline in turn, work placed before a `filter` is work done on elements that
are about to be discarded. Cheap filters go first; expensive maps go after. It
also has a correctness bug: uppercasing before trimming means `" b "` and `"b"`
stay distinct through `distinct()`, because they are still different strings.

`flatMap` is the operation that changes the element count. Each `line` becomes
a `Stream<String>` of its words, and `flatMap` splices those streams into one.
The starter used `map`, which produces a `Stream<String[]>` — four lines in,
four arrays out — so `count()` counted lines. Whenever the answer is "more
elements than I started with", `flatMap` is the operation.

`squaresOfEvens` stays in `IntStream` from `range` to `toArray`, so nothing is
boxed and nothing is copied. The `Stream<Integer>` spelling would allocate an
`Integer` per element and then need `mapToInt(Integer::intValue).toArray()` at
the end to get back to an `int[]` — the same answer, several times the garbage,
as chapter 6.3 measured.
