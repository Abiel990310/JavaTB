---
id: pool-the-work
title: "Run it on a pool, and lose nothing"
difficulty: core
chapter: executors
topics: [executors, futures, exceptions]
check: unit
standard: java21
---

A small batch runner. The interesting requirement is the last one: a task that
throws must be *reported*, not silently absorbed.

- `record Outcome(int index, String value, String failure) {}` — exactly one of
  `value` and `failure` is non-null
- `static List<Outcome> runAll(List<Callable<String>> tasks, int threads)` —
  runs every task on a pool of `threads` threads and returns one `Outcome` per
  task **in input order**. A task that throws contributes an `Outcome` whose
  `failure` is the exception's message (not the wrapper's). The pool must be
  shut down before the method returns.
- `static long successCount(List<Outcome> outcomes)`
- `static String firstFailure(List<Outcome> outcomes)` — the failure message of
  the earliest failed task, or `null`
- `static List<String> valuesOrThrow(List<Outcome> outcomes)` — every value in
  order, or `IllegalStateException` naming the first failure if any task failed
- `static int totalOf(List<Callable<Integer>> tasks, int threads)` — the sum of
  every task's result; a task that throws contributes 0

Nothing may leak a thread pool, and nothing may block forever.

## Starter
```java
import java.util.concurrent.*;

record Outcome(int index, String value, String failure) {}

static List<Outcome> runAll(List<Callable<String>> tasks, int threads) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    List<Outcome> outcomes = new ArrayList<>();
    for (int i = 0; i < tasks.size(); i++) {
        int index = i;
        pool.submit(() -> outcomes.add(new Outcome(index, tasks.get(index).call(), null)));
    }
    return outcomes;
}

static long successCount(List<Outcome> outcomes) {
    return outcomes.size();
}

static String firstFailure(List<Outcome> outcomes) {
    return null;
}

static List<String> valuesOrThrow(List<Outcome> outcomes) {
    return outcomes.stream().map(Outcome::value).toList();
}

static int totalOf(List<Callable<Integer>> tasks, int threads) throws Exception {
    return 0;
}
```

## Tests
```java
import java.util.concurrent.*;

List<Callable<String>> mixed = List.of(
    () -> "a",
    () -> { throw new IllegalStateException("second failed"); },
    () -> "c",
    () -> { throw new IllegalArgumentException("fourth failed"); });

List<Outcome> outcomes = runAll(mixed, 3);
checkEq(outcomes.size(), 4);
checkEq(outcomes.get(0), new Outcome(0, "a", null));
checkEq(outcomes.get(1), new Outcome(1, null, "second failed"));
checkEq(outcomes.get(2), new Outcome(2, "c", null));
checkEq(outcomes.get(3), new Outcome(3, null, "fourth failed"));

checkEq(successCount(outcomes), 2L);
checkEq(firstFailure(outcomes), "second failed");
checkThrows(IllegalStateException.class, () -> valuesOrThrow(outcomes));

List<Callable<String>> allFine = List.of(() -> "x", () -> "y", () -> "z");
List<Outcome> good = runAll(allFine, 2);
checkEq(successCount(good), 3L);
checkEq(firstFailure(good), null);
checkEq(valuesOrThrow(good), List.of("x", "y", "z"));

checkEq(runAll(List.of(), 2), List.of());
checkEq(successCount(List.of()), 0L);
checkEq(firstFailure(List.of()), null);
checkEq(valuesOrThrow(List.of()), List.of());

// Order is the input's, whatever order the tasks finish in.
List<Callable<String>> staggered = new ArrayList<>();
for (int i = 0; i < 12; i++) {
    int delay = (12 - i) * 5;
    String label = "t" + i;
    staggered.add(() -> {
        Thread.sleep(delay);
        return label;
    });
}
List<Outcome> ordered = runAll(staggered, 4);
checkEq(ordered.stream().map(Outcome::value).toList(),
        List.of("t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11"));

List<Callable<Integer>> numbers = List.of(
    () -> 1,
    () -> { throw new IllegalStateException("skipped"); },
    () -> 40,
    () -> 1);
checkEq(totalOf(numbers, 3), 42);
checkEq(totalOf(List.of(), 2), 0);
```

## Hints
- The starter never collects results, mutates an `ArrayList` from several
  threads, and returns before any task has run. Collect the `Future`s first,
  then read them.
- `invokeAll` does most of it: it submits everything, blocks until all are
  finished, and returns futures **in input order**.
- A task that threw makes `future.get()` throw `ExecutionException`. The
  message you want is `wrapped.getCause().getMessage()`.
- `try (ExecutorService pool = ...)` closes and waits, so the pool cannot leak
  even if a `get()` throws.
- `valuesOrThrow` should check for a failure before building anything, so the
  exception message can name the first one.
- `totalOf` can reuse the same shape; a failed task contributes 0 rather than
  aborting the sum.

## Solution
```java
import java.util.concurrent.*;

record Outcome(int index, String value, String failure) {}

static List<Outcome> runAll(List<Callable<String>> tasks, int threads) throws Exception {
    if (tasks.isEmpty()) {
        return List.of();
    }
    try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
        List<Future<String>> futures = pool.invokeAll(tasks);
        List<Outcome> outcomes = new ArrayList<>(futures.size());
        for (int i = 0; i < futures.size(); i++) {
            try {
                outcomes.add(new Outcome(i, futures.get(i).get(), null));
            } catch (ExecutionException wrapped) {
                outcomes.add(new Outcome(i, null, wrapped.getCause().getMessage()));
            }
        }
        return List.copyOf(outcomes);
    }
}

static long successCount(List<Outcome> outcomes) {
    return outcomes.stream().filter(outcome -> outcome.failure() == null).count();
}

static String firstFailure(List<Outcome> outcomes) {
    for (Outcome outcome : outcomes) {
        if (outcome.failure() != null) {
            return outcome.failure();
        }
    }
    return null;
}

static List<String> valuesOrThrow(List<Outcome> outcomes) {
    String failure = firstFailure(outcomes);
    if (failure != null) {
        throw new IllegalStateException("task failed: " + failure);
    }
    return outcomes.stream().map(Outcome::value).toList();
}

static int totalOf(List<Callable<Integer>> tasks, int threads) throws Exception {
    if (tasks.isEmpty()) {
        return 0;
    }
    try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
        int total = 0;
        for (Future<Integer> future : pool.invokeAll(tasks)) {
            try {
                total += future.get();
            } catch (ExecutionException ignored) {
                // a failed task contributes nothing
            }
        }
        return total;
    }
}
```

## Notes
The starter has four faults and each is a separate lesson.

It **never collects a result**. `pool.submit(...)` returns a `Future` that goes
straight in the bin, so a task that throws vanishes exactly as the chapter
described — and here the throwing tasks are half the input.

It **mutates an `ArrayList` from several threads**, which is chapter 8.1's
unsafe collection: lost entries, or a corrupted internal array, with no
exception. Building the list on the calling thread after everything has
finished removes the problem rather than synchronising it away.

It **returns before the tasks have run**, so the list is usually empty. `join`
was the fix in chapter 8.1; here it is `invokeAll`, which blocks until every
task is finished and hands back the futures in input order — which is the
third fault fixed too, since even a correct concurrent collection would have
recorded results in completion order. The staggered test exists to catch
exactly that: the tasks finish in reverse, and the output must still be
`t0 … t11`.

And it **leaks the pool**. A `newFixedThreadPool` whose `shutdown` is never
called keeps non-daemon threads alive forever, so the JVM does not exit. In a
long-running service it is a slow leak of a megabyte of stack per pool. Since
Java 19 `try`-with-resources handles it, including on the exceptional path,
which is the whole reason `ExecutorService` was made `AutoCloseable`.

One detail in the solution worth copying: the `catch` is around a single
`future.get()`, not around the loop. A `catch` outside would abandon every
remaining result the moment one task failed — which is precisely the behaviour
the `Outcome` record exists to avoid. Where partial failure is expected, catch
it per item and report it as data.
