---
id: stream-the-log
title: "Reading a log with streams"
difficulty: stretch
chapter: streams
topics: [streams, flatmap, optional, primitive-streams]
check: unit
standard: java21
---

A realistic pipeline, over lines that look like this:

```
2026-03-01T09:15:00 INFO  auth    login ok user=ada
2026-03-01T09:15:04 ERROR billing charge failed code=402
```

Four fields separated by runs of whitespace — timestamp, level, component, and
a message that may itself contain spaces — then any number of `key=value`
pairs at the end of the message.

Write these, all as stream pipelines:

- `static List<String> levels(List<String> lines)` — the distinct levels, in
  first-seen order
- `static Optional<String> firstError(List<String> lines)` — the message of the
  first `ERROR` line, or empty. It must not examine lines after the first
  `ERROR`.
- `static Map<String, Long> countsByComponent(List<String> lines)` — how many
  lines each component produced
- `static IntSummaryStatistics messageLengths(List<String> lines)` — statistics
  over the length of each line's message, with no boxing
- `static List<String> valuesOf(List<String> lines, String key)` — every value
  appearing as `key=value` anywhere in the file, in order, with duplicates kept

Blank lines and lines with fewer than four fields are ignored everywhere.

## Starter
```java
static String[] fieldsOf(String line) {
    return line.trim().split("\\s+", 4);
}

static List<String> levels(List<String> lines) {
    return List.of();
}

static Optional<String> firstError(List<String> lines) {
    return Optional.empty();
}

static Map<String, Long> countsByComponent(List<String> lines) {
    return Map.of();
}

static IntSummaryStatistics messageLengths(List<String> lines) {
    return new IntSummaryStatistics();
}

static List<String> valuesOf(List<String> lines, String key) {
    return List.of();
}
```

## Tests
```java
List<String> log = List.of(
    "2026-03-01T09:15:00 INFO  auth    login ok user=ada",
    "",
    "2026-03-01T09:15:04 ERROR billing charge failed code=402 user=ada",
    "   ",
    "2026-03-01T09:15:09 WARN  auth    slow response user=grace",
    "not a log",
    "2026-03-01T09:15:12 ERROR auth    token expired user=grace",
    "2026-03-01T09:15:20 INFO  billing invoice sent");

checkEq(levels(log), List.of("INFO", "ERROR", "WARN"));
checkEq(levels(List.of()), List.of());
checkEq(levels(List.of("", "  ", "too short")), List.of());
// Four whitespace-separated fields is all this parser asks for, so a
// four-word sentence passes. Rejecting that needs a real format check.
checkEq(levels(List.of("any four words here")), List.of("four"));

checkEq(firstError(log), Optional.of("charge failed code=402 user=ada"));
checkEq(firstError(List.of("2026-01-01T00:00:00 INFO a nothing here")), Optional.empty());

checkEq(countsByComponent(log), Map.of("auth", 3L, "billing", 2L));
checkEq(countsByComponent(List.of()), Map.of());

IntSummaryStatistics stats = messageLengths(log);
checkEq(stats.getCount(), 5L);
checkEq(stats.getMin(), "invoice sent".length());
checkEq(stats.getMax(), "charge failed code=402 user=ada".length());

checkEq(valuesOf(log, "user"), List.of("ada", "ada", "grace", "grace"));
checkEq(valuesOf(log, "code"), List.of("402"));
checkEq(valuesOf(log, "missing"), List.of());
```

## Hints
- Start every pipeline the same way:
  `lines.stream().map(Main::fieldsOf).filter(f -> f.length == 4)`. Factoring
  that into its own helper returning a `Stream<String[]>` saves repeating it
  five times.
- `levels` is `map(f -> f[1]).distinct().toList()` — `distinct` keeps
  first-seen order for an ordered stream.
- `firstError` is `filter(...).map(f -> f[3]).findFirst()`. Because it
  short-circuits, nothing after the match is parsed.
- `countsByComponent` is
  `collect(Collectors.groupingBy(f -> f[2], Collectors.counting()))`.
- `messageLengths` wants `mapToInt(f -> f[3].length()).summaryStatistics()`.
- `valuesOf` needs `flatMap`: split the message on whitespace, keep the tokens
  starting with `key + "="`, and take the part after the `=`.

## Solution
```java
static String[] fieldsOf(String line) {
    return line.trim().split("\\s+", 4);
}

static Stream<String[]> entries(List<String> lines) {
    return lines.stream().map(Main::fieldsOf).filter(fields -> fields.length == 4);
}

static List<String> levels(List<String> lines) {
    return entries(lines).map(fields -> fields[1]).distinct().toList();
}

static Optional<String> firstError(List<String> lines) {
    return entries(lines)
        .filter(fields -> fields[1].equals("ERROR"))
        .map(fields -> fields[3])
        .findFirst();
}

static Map<String, Long> countsByComponent(List<String> lines) {
    return entries(lines)
        .collect(Collectors.groupingBy(fields -> fields[2], Collectors.counting()));
}

static IntSummaryStatistics messageLengths(List<String> lines) {
    return entries(lines)
        .mapToInt(fields -> fields[3].length())
        .summaryStatistics();
}

static List<String> valuesOf(List<String> lines, String key) {
    String prefix = key + "=";
    return entries(lines)
        .flatMap(fields -> Arrays.stream(fields[3].split("\\s+")))
        .filter(token -> token.startsWith(prefix))
        .map(token -> token.substring(prefix.length()))
        .toList();
}
```

## Notes
The shared prefix is the whole design. `entries` returns a `Stream<String[]>`,
not a `List<String[]>`, and that is deliberate: returning a stream keeps the
laziness, so `firstError` can still stop at the first match. Had `entries`
collected to a list, every caller would parse all eight lines whether or not it
needed them — the same mistake as `pipeline-order`'s
`.toList().stream().findFirst()`, promoted to a helper method where it is
harder to see.

The one thing to be careful about is that `entries` returns a *fresh* stream on
each call, because it starts from `lines.stream()`. A method returning a stored
`Stream` field would fail the second time it was called with
`IllegalStateException`. When you want a reusable pipeline, return something
that can build one — a `Supplier<Stream<T>>`, or just the source list, as here.

`split("\\s+", 4)` does the work that would otherwise need an index-hunting
loop. The limit of 4 stops splitting after three separators, so the message
keeps its internal spaces; without it, `"charge failed code=402"` would arrive
as three separate fields. The `filter(fields -> fields.length == 4)` after it
handles blank lines and short lines in one place, which is why none of the five
methods has to think about them.

The `filter` is a heuristic, and the tests say so: `"any four words here"` has
four whitespace-separated fields and is accepted as a log line, with `four` as
its level. That is not a bug in the pipeline, it is the limit of the check you
were asked to write — and it is worth seeing, because "it parsed" is not the
same as "it was a log line". A real reader would validate the timestamp, or
match the level against a known set. The pipeline shape would not change; only
the predicate would.

`mapToInt(...).summaryStatistics()` gets the count, min, max, sum and average
in a single pass with no boxing anywhere — the primitive-stream point from the
chapter. The `Stream<Integer>` version would need either four passes or a
hand-written reduction, and would allocate an `Integer` per line.

`valuesOf` shows `flatMap` doing what `map` cannot: the result has more
elements than the input, because one line contributes two `user=` values in
this log and zero in another. Note it keeps duplicates — `"ada"` appears twice —
because the specification asked for values, not distinct values. Adding
`.distinct()` would be a one-word change, which is the argument for pipelines:
the shape of the answer is visible in the shape of the code.
