---
id: rewrite-the-report
title: "Rewrite the report"
difficulty: stretch
chapter: when-a-loop-wins
topics: [streams, loops, performance, parallel]
check: unit
standard: java21
---

One method, written four times. Each version is asked for by name, and the
tests check that all four agree — because the point is not that one style wins
but that you can tell which one a given constraint picks.

The task: given a list of `Reading(String sensor, int value)`, produce a
summary line per sensor, sorted by sensor name:

```
kitchen: 3 readings, min 1, max 9, mean 4.67
```

The mean is rounded to two decimals with `String.format("%.2f", mean)`. A
sensor with no readings does not appear. A `null` sensor name counts as
`"unknown"`.

Write:

- `static List<String> byLoop(List<Reading> readings)` — no `Stream` anywhere
- `static List<String> byPipeline(List<Reading> readings)` — one `collect`,
  no explicit loop
- `static List<String> byHotPath(List<Reading> readings)` — the version you
  would put in code called millions of times: no pipeline, no boxing of the
  running statistics, one pass
- `static List<String> byParallelSafe(List<Reading> readings)` — a pipeline
  that gives the same answer under `.parallel()`, which the tests exercise

Then one question in code:

- `static boolean worthParallelising(int elementCount, int nanosPerElement)` —
  `true` only when the collection has at least 10,000 elements **and** the
  estimated total work is at least 100 microseconds

## Starter
```java
record Reading(String sensor, int value) {}

static String sensorOf(Reading reading) {
    return Objects.requireNonNullElse(reading.sensor(), "unknown");
}

static String describe(String sensor, int count, int min, int max, double mean) {
    return sensor + ": " + count + " readings, min " + min + ", max " + max
        + ", mean " + String.format("%.2f", mean);
}

static List<String> byLoop(List<Reading> readings) {
    return List.of();
}

static List<String> byPipeline(List<Reading> readings) {
    return List.of();
}

static List<String> byHotPath(List<Reading> readings) {
    return List.of();
}

static List<String> byParallelSafe(List<Reading> readings) {
    List<String> lines = new ArrayList<>();
    readings.parallelStream().forEach(r -> lines.add(sensorOf(r)));
    return lines;
}

static boolean worthParallelising(int elementCount, int nanosPerElement) {
    return elementCount > 1;
}
```

## Tests
```java
List<Reading> readings = new ArrayList<>();
Collections.addAll(readings,
    new Reading("kitchen", 1),
    new Reading("attic", 5),
    new Reading("kitchen", 9),
    new Reading(null, 4),
    new Reading("kitchen", 4),
    new Reading("attic", 5));

List<String> expected = List.of(
    "attic: 2 readings, min 5, max 5, mean 5.00",
    "kitchen: 3 readings, min 1, max 9, mean 4.67",
    "unknown: 1 readings, min 4, max 4, mean 4.00");

checkEq(byLoop(readings), expected);
checkEq(byPipeline(readings), expected);
checkEq(byHotPath(readings), expected);
checkEq(byParallelSafe(readings), expected);

checkEq(byLoop(List.of()), List.of());
checkEq(byPipeline(List.of()), List.of());
checkEq(byHotPath(List.of()), List.of());
checkEq(byParallelSafe(List.of()), List.of());

List<Reading> single = List.of(new Reading("a", -3));
List<String> one = List.of("a: 1 readings, min -3, max -3, mean -3.00");
checkEq(byLoop(single), one);
checkEq(byPipeline(single), one);
checkEq(byHotPath(single), one);
checkEq(byParallelSafe(single), one);

// The parallel-safe version has to survive a source big enough to split.
List<Reading> many = new ArrayList<>();
for (int i = 0; i < 5_000; i++) {
    many.add(new Reading(i % 2 == 0 ? "even" : "odd", i));
}
List<String> parallelAnswer = byParallelSafe(many);
checkEq(parallelAnswer, byLoop(many));
checkEq(parallelAnswer.size(), 2);
checkEq(parallelAnswer.get(0), "even: 2500 readings, min 0, max 4998, mean 2499.00");

check(!worthParallelising(8, 20));          // far too few
check(!worthParallelising(50_000, 1));      // 50 microseconds of work
check(!worthParallelising(1_000, 1_000));   // enough work, too few elements
check(worthParallelising(10_000, 20));      // 200 microseconds over 10,000
check(worthParallelising(1_000_000, 1));
```

## Hints
- Every version needs `sensorOf` and `describe`; they are given so the four
  differ only in how they accumulate.
- `byLoop`: a `TreeMap<String, int[]>` where the array holds
  `{count, min, max, sum}` keeps the sort and the statistics in one place.
- `byPipeline`: `Collectors.groupingBy(Main::sensorOf, TreeMap::new,
  Collectors.summarizingInt(Reading::value))` gives an
  `IntSummaryStatistics` per sensor, which has every number you need.
- `byHotPath` must not build an `IntSummaryStatistics` per group either — the
  `int[]` accumulator from `byLoop` is the shape, with `HashMap` plus a sort at
  the end if you prefer.
- `byParallelSafe`: the starter's `forEach` into an `ArrayList` is a data race.
  A `collect` with a proper collector is thread-safe by construction, and
  `groupingBy` merges its groups through the collector's combiner.
- `worthParallelising`: two conditions, both required. Watch the total-work
  arithmetic — `elementCount * nanosPerElement` overflows an `int` at a
  million elements.

## Solution
```java
record Reading(String sensor, int value) {}

static String sensorOf(Reading reading) {
    return Objects.requireNonNullElse(reading.sensor(), "unknown");
}

static String describe(String sensor, int count, int min, int max, double mean) {
    return sensor + ": " + count + " readings, min " + min + ", max " + max
        + ", mean " + String.format("%.2f", mean);
}

static List<String> byLoop(List<Reading> readings) {
    TreeMap<String, int[]> stats = new TreeMap<>();
    for (Reading reading : readings) {
        int[] cell = stats.computeIfAbsent(sensorOf(reading),
            key -> new int[] { 0, Integer.MAX_VALUE, Integer.MIN_VALUE, 0 });
        cell[0]++;
        cell[1] = Math.min(cell[1], reading.value());
        cell[2] = Math.max(cell[2], reading.value());
        cell[3] += reading.value();
    }

    List<String> lines = new ArrayList<>(stats.size());
    for (Map.Entry<String, int[]> entry : stats.entrySet()) {
        int[] cell = entry.getValue();
        lines.add(describe(entry.getKey(), cell[0], cell[1], cell[2],
            (double) cell[3] / cell[0]));
    }
    return List.copyOf(lines);
}

static List<String> byPipeline(List<Reading> readings) {
    TreeMap<String, IntSummaryStatistics> stats = readings.stream()
        .collect(Collectors.groupingBy(Main::sensorOf, TreeMap::new,
            Collectors.summarizingInt(Reading::value)));

    return stats.entrySet().stream()
        .map(entry -> describe(entry.getKey(),
            (int) entry.getValue().getCount(),
            entry.getValue().getMin(),
            entry.getValue().getMax(),
            entry.getValue().getAverage()))
        .toList();
}

static List<String> byHotPath(List<Reading> readings) {
    Map<String, int[]> stats = new HashMap<>();
    for (int i = 0; i < readings.size(); i++) {
        Reading reading = readings.get(i);
        String sensor = sensorOf(reading);
        int value = reading.value();
        int[] cell = stats.get(sensor);
        if (cell == null) {
            cell = new int[] { 0, value, value, 0 };
            stats.put(sensor, cell);
        }
        cell[0]++;
        if (value < cell[1]) cell[1] = value;
        if (value > cell[2]) cell[2] = value;
        cell[3] += value;
    }

    List<String> sensors = new ArrayList<>(stats.keySet());
    Collections.sort(sensors);

    List<String> lines = new ArrayList<>(sensors.size());
    for (String sensor : sensors) {
        int[] cell = stats.get(sensor);
        lines.add(describe(sensor, cell[0], cell[1], cell[2], (double) cell[3] / cell[0]));
    }
    return List.copyOf(lines);
}

static List<String> byParallelSafe(List<Reading> readings) {
    TreeMap<String, IntSummaryStatistics> stats = readings.parallelStream()
        .collect(Collectors.groupingBy(Main::sensorOf, TreeMap::new,
            Collectors.summarizingInt(Reading::value)));

    return stats.entrySet().stream()
        .map(entry -> describe(entry.getKey(),
            (int) entry.getValue().getCount(),
            entry.getValue().getMin(),
            entry.getValue().getMax(),
            entry.getValue().getAverage()))
        .toList();
}

static boolean worthParallelising(int elementCount, int nanosPerElement) {
    long totalNanos = (long) elementCount * nanosPerElement;
    return elementCount >= 10_000 && totalNanos >= 100_000;
}
```

## Notes
Four versions, one answer, and the interesting part is what changed between
them.

`byLoop` and `byPipeline` are about the same length, and the pipeline is
clearly better: `summarizingInt` already knows how to compute count, min, max
and mean, so the loop version's four-slot `int[]` and its
`Integer.MAX_VALUE` seeding are work the library would have done. This is the
shape streams are for — group, summarise, format — and a loop here is a loop
written out of habit.

`byHotPath` differs from `byLoop` in three small ways, each of which is only
worth doing when you have measured that it matters: `HashMap` rather than
`TreeMap` because hashing beats comparing and the sort happens once at the end
over a handful of keys rather than on every insertion; an indexed `for` over
the list rather than an iterator, saving an `Iterator` allocation per call; and
`if (value < cell[1])` instead of `Math.min`, which the JIT usually compiles
identically but which avoids the call in the interpreter. None of that is worth
doing to code that runs once. All of it is worth knowing exists, and none of it
is available to you inside a pipeline.

`byParallelSafe` is where the starter is actively dangerous.
`parallelStream().forEach(r -> lines.add(...))` mutates an `ArrayList` from
several threads at once: no exception, no warning, and an answer that is wrong
in a way that depends on timing — across two hundred trials of the same code it
produced a short list, a list containing `null`, an
`ArrayIndexOutOfBoundsException` from inside `ArrayList.add`, and — worst of
the four — the correct answer. The five-thousand-element test exists to give it enough to
split. The fix is not a synchronised list; it is `collect`, which never shares
a container between threads — each thread accumulates into its own and the
combiner merges them. That is what the combiner in `write-a-collector` was for.

Note that `byParallelSafe` and `byPipeline` are the same code but for one word,
which is the honest summary of parallel streams: if the pipeline is built
properly, `.parallel()` is free to add and free to remove. If adding it changes
the answer, the pipeline was already wrong — it just had not been caught.

`worthParallelising` encodes the chapter's rule of thumb, and the overflow in
its arithmetic is not decoration: `1_000_000 * 1` fits, but raise either
argument and `int` multiplication wraps to a negative number, so the method
would answer `false` for the largest workloads — precisely the ones it exists
to approve. Widening one operand with `(long)` before the multiply is the fix,
as in chapter 1.2.
