---
id: loop-or-pipeline
title: "Five that resist a pipeline"
difficulty: core
chapter: when-a-loop-wins
topics: [streams, loops, checked-exceptions]
check: unit
standard: java21
---

Each of these has been written as a stream and each is worse for it. Rewrite
the ones that should be loops; leave alone the one that is already right.

- `static int firstGap(int[] sorted)` — the first value missing from an
  ascending run starting at `sorted[0]`, or `-1` if there is no gap. Must stop
  at the first gap.
- `static List<String> runLengths(List<String> values)` — consecutive equal
  values collapsed to `"value×count"`, e.g. `["a","a","b"]` becomes
  `["a×2", "b×1"]`
- `static Map<String, Integer> parseAll(List<String> pairs) throws ParseFailure`
  — each entry is `key=number`; the first malformed entry throws
  `ParseFailure` naming it. `ParseFailure` is a checked exception, given below.
- `static List<String> upperNonBlank(List<String> values)` — trims, drops
  blanks, uppercases
- `static int countUntilNegative(int[] values)` — how many values precede the
  first negative one

## Starter
```java
static final class ParseFailure extends Exception {
    ParseFailure(String message) {
        super(message);
    }
}

static int firstGap(int[] sorted) {
    return IntStream.range(0, sorted.length)
        .filter(i -> sorted[i] != sorted[0] + i)
        .map(i -> sorted[0] + i)
        .boxed()
        .toList()
        .stream()
        .findFirst()
        .orElse(-1);
}

static List<String> runLengths(List<String> values) {
    return values.stream()
        .distinct()
        .map(v -> v + "×" + values.stream().filter(v::equals).count())
        .toList();
}

static Map<String, Integer> parseAll(List<String> pairs) throws ParseFailure {
    return pairs.stream()
        .map(pair -> pair.split("=", 2))
        .collect(Collectors.toMap(parts -> parts[0], parts -> Integer.parseInt(parts[1])));
}

static List<String> upperNonBlank(List<String> values) {
    return values.stream()
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .map(String::toUpperCase)
        .toList();
}

static int countUntilNegative(int[] values) {
    return (int) IntStream.of(values).takeWhile(v -> v >= 0).count();
}
```

## Tests
```java
checkEq(firstGap(new int[] { 3, 4, 5, 7, 8 }), 6);
checkEq(firstGap(new int[] { 0, 1, 2 }), -1);
checkEq(firstGap(new int[] { 5 }), -1);
checkEq(firstGap(new int[0]), -1);
checkEq(firstGap(new int[] { 1, 3, 5 }), 2);

checkEq(runLengths(List.of("a", "a", "b")), List.of("a×2", "b×1"));
checkEq(runLengths(List.of("a", "b", "a")), List.of("a×1", "b×1", "a×1"));
checkEq(runLengths(List.of()), List.of());
checkEq(runLengths(List.of("x")), List.of("x×1"));

checkEq(parseAll(List.of("a=1", "b=2")), Map.of("a", 1, "b", 2));
checkEq(parseAll(List.of()), Map.of());
checkThrows(ParseFailure.class, () -> parseAll(List.of("a=1", "b=two")));
checkThrows(ParseFailure.class, () -> parseAll(List.of("nokey")));
try {
    parseAll(List.of("a=1", "b=two"));
    check(false);
} catch (ParseFailure expected) {
    check(expected.getMessage().contains("b=two"));
}

checkEq(upperNonBlank(List.of(" a ", "", "  ", "b")), List.of("A", "B"));
checkEq(upperNonBlank(List.of()), List.of());

checkEq(countUntilNegative(new int[] { 3, 1, -2, 9 }), 2);
checkEq(countUntilNegative(new int[] { -1 }), 0);
checkEq(countUntilNegative(new int[] { 1, 2, 3 }), 3);
checkEq(countUntilNegative(new int[0]), 0);
```

## Hints
- `firstGap` collects every gap before taking the first. A loop that returns
  the moment it finds one does less work and reads as what it is.
- `runLengths` must respect *consecutive* runs. `distinct()` throws away the
  ordering information the answer depends on, so `["a","b","a"]` comes out
  wrong. This needs a loop with a running count.
- `parseAll` cannot throw a checked exception from inside `map`. Write the
  loop; `Integer.parseInt` and the split both need guarding.
- Two of the five are fine as they stand. Run them in your head against the
  tests before rewriting anything.
- To assert on the message, catch it yourself: the checks run inside a
  `main` that declares `throws Exception`, so an ordinary `try`/`catch` is
  available.

## Solution
```java
static final class ParseFailure extends Exception {
    ParseFailure(String message) {
        super(message);
    }
}

static int firstGap(int[] sorted) {
    for (int i = 0; i < sorted.length; i++) {
        if (sorted[i] != sorted[0] + i) {
            return sorted[0] + i;
        }
    }
    return -1;
}

static List<String> runLengths(List<String> values) {
    List<String> runs = new ArrayList<>();
    int index = 0;
    while (index < values.size()) {
        String value = values.get(index);
        int count = 0;
        while (index < values.size() && values.get(index).equals(value)) {
            count++;
            index++;
        }
        runs.add(value + "×" + count);
    }
    return List.copyOf(runs);
}

static Map<String, Integer> parseAll(List<String> pairs) throws ParseFailure {
    Map<String, Integer> parsed = new LinkedHashMap<>();
    for (String pair : pairs) {
        String[] parts = pair.split("=", 2);
        if (parts.length != 2) {
            throw new ParseFailure("malformed entry: " + pair);
        }
        try {
            parsed.put(parts[0], Integer.parseInt(parts[1]));
        } catch (NumberFormatException e) {
            throw new ParseFailure("malformed entry: " + pair);
        }
    }
    return parsed;
}

static List<String> upperNonBlank(List<String> values) {
    return values.stream()
        .map(String::trim)
        .filter(s -> !s.isEmpty())
        .map(String::toUpperCase)
        .toList();
}

static int countUntilNegative(int[] values) {
    return (int) IntStream.of(values).takeWhile(v -> v >= 0).count();
}
```

## Notes
`upperNonBlank` and `countUntilNegative` were already right, and noticing that
is half the exercise. A transformation of independent elements is exactly the
shape a pipeline fits, and `takeWhile` is a real short-circuit — it stops at
the first negative rather than testing the rest. Rewriting either as a loop
would be longer and would say less.

`firstGap` is the pipeline that computes the whole answer and then throws most
of it away. It gets the right number, but it visits every element and allocates
a boxed list of every gap in order to return the first — the same
`.toList().stream().findFirst()` shape from `pipeline-order`, made worse by the
`boxed()`. Even fixed to `.findFirst()` on the `IntStream` it would still be a
loop over indices reaching back into the array, which is chapter 6.5's "loop
wearing a costume". The plain loop is shorter than either.

`runLengths` is the one that is simply *wrong*, and the tests catch it with
`["a","b","a"]`: `distinct()` produces `[a, b]`, so the two separate runs of
`a` are merged into a single count of 2 and the third run vanishes. The
starter also does a full scan of `values` per distinct element, making it
quadratic. Run-length encoding depends on what came immediately before, and a
pipeline has no way to look back. The loop keeps the position and the run
length in plain sight.

`parseAll` will not compile as a stream once the exception is checked, which is
the point. Every way of forcing it — wrapping in a `RuntimeException` and
unwrapping outside, `Optional`-returning helpers, a sneaky-throws trick — is
more code than the loop and buries the error handling one level further from
the failure. The loop also gives the exception a useful message, because the
offending entry is right there in scope.

One detail in the solution worth copying: `LinkedHashMap`, not `HashMap`. The
tests do not check iteration order here, but a parsed configuration that comes
back in a scrambled order is unpleasant to debug, and the cost of the better
default is one word.
