---
id: fan-out-blocking
title: "Five hundred blocking calls at once"
difficulty: core
chapter: virtual-threads
topics: [virtual-threads, executors, blocking]
check: unit
standard: java21
---

A fan-out over a slow fake service. The tests check both correctness and that
the work actually happened concurrently — a serial solution takes far too long
and fails.

`call(String id)` is given and sleeps for 20 ms.

- `static List<String> fetchAll(List<String> ids)` — every `call(id)` in input
  order, run concurrently on virtual threads, one per id
- `static Map<String, String> fetchAllByKey(List<String> ids)` — the same as a
  map from id to result, iterating in the input order
- `static List<String> fetchAllTolerant(List<String> ids)` — the same as
  `fetchAll`, except that an id that makes `call` throw contributes
  `"error:" + message` rather than aborting the batch
- `static String firstNonEmpty(List<String> ids)` — the result of the first id
  whose result is non-empty, or `null`; ids are tried **concurrently** and the
  answer is the one with the lowest index among those that succeed
- `static long timedFetch(List<String> ids)` — how many milliseconds
  `fetchAll(ids)` took

None of these may create a fixed-size pool, and none may block the calling
thread for longer than roughly one call.

## Starter
```java
import java.util.concurrent.*;

static String call(String id) throws InterruptedException {
    Thread.sleep(20);
    if (id.startsWith("bad")) {
        throw new IllegalStateException("refused " + id);
    }
    return id.equals("empty") ? "" : "value:" + id;
}

static List<String> fetchAll(List<String> ids) throws Exception {
    List<String> results = new ArrayList<>();
    for (String id : ids) {
        results.add(call(id));
    }
    return results;
}

static Map<String, String> fetchAllByKey(List<String> ids) throws Exception {
    Map<String, String> byKey = new HashMap<>();
    for (String id : ids) {
        byKey.put(id, call(id));
    }
    return byKey;
}

static List<String> fetchAllTolerant(List<String> ids) throws Exception {
    return fetchAll(ids);
}

static String firstNonEmpty(List<String> ids) throws Exception {
    for (String id : ids) {
        String value = call(id);
        if (!value.isEmpty()) {
            return value;
        }
    }
    return null;
}

static long timedFetch(List<String> ids) throws Exception {
    return 0;
}
```

## Tests
```java
import java.util.concurrent.*;

List<String> ids = new ArrayList<>();
for (int i = 0; i < 500; i++) {
    ids.add("id" + i);
}

List<String> results = fetchAll(ids);
checkEq(results.size(), 500);
checkEq(results.get(0), "value:id0");
checkEq(results.get(499), "value:id499");
checkEq(fetchAll(List.of()), List.of());

Map<String, String> byKey = fetchAllByKey(List.of("a", "b", "c"));
checkEq(byKey.size(), 3);
checkEq(byKey.get("b"), "value:b");
checkEq(new ArrayList<>(byKey.keySet()), List.of("a", "b", "c"));

checkEq(fetchAllTolerant(List.of("a", "bad1", "c")),
        List.of("value:a", "error:refused bad1", "value:c"));
checkEq(fetchAllTolerant(List.of("bad1", "bad2")),
        List.of("error:refused bad1", "error:refused bad2"));

checkEq(firstNonEmpty(List.of("empty", "empty", "x")), "value:x");
checkEq(firstNonEmpty(List.of("a", "b")), "value:a");
checkEq(firstNonEmpty(List.of("empty")), null);
checkEq(firstNonEmpty(List.of()), null);

// 500 calls of 20 ms each: serially that is 10 seconds. Concurrently it is
// about one call.
long elapsed = timedFetch(ids);
check(elapsed < 2_000);
check(elapsed >= 20);
```

## Hints
- `Executors.newVirtualThreadPerTaskExecutor()` in a `try`-with-resources
  creates a virtual thread per submitted task and joins them all on `close()`.
- Submit everything first, collecting the `Future`s in input order, then read
  them. Reading each future as you submit it serialises the whole thing.
- `close()` blocks until every task is done, so collect the futures inside the
  block and read them outside it — or read them inside, after the loop.
- `fetchAllByKey` wants insertion order, so a `LinkedHashMap` built from the
  futures in input order.
- `fetchAllTolerant` catches `ExecutionException` per future and uses
  `getCause().getMessage()`.
- `firstNonEmpty` must run everything concurrently and then scan the futures in
  order — the *lowest index* that succeeded, not the first to finish.
- `timedFetch` is `System.nanoTime()` around `fetchAll`.

## Solution
```java
import java.util.concurrent.*;

static String call(String id) throws InterruptedException {
    Thread.sleep(20);
    if (id.startsWith("bad")) {
        throw new IllegalStateException("refused " + id);
    }
    return id.equals("empty") ? "" : "value:" + id;
}

static List<Future<String>> submitAll(ExecutorService pool, List<String> ids) {
    List<Future<String>> futures = new ArrayList<>(ids.size());
    for (String id : ids) {
        futures.add(pool.submit(() -> call(id)));
    }
    return futures;
}

static List<String> fetchAll(List<String> ids) throws Exception {
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        List<String> results = new ArrayList<>(ids.size());
        for (Future<String> future : submitAll(pool, ids)) {
            results.add(future.get());
        }
        return List.copyOf(results);
    }
}

static Map<String, String> fetchAllByKey(List<String> ids) throws Exception {
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        List<Future<String>> futures = submitAll(pool, ids);
        Map<String, String> byKey = new LinkedHashMap<>();
        for (int i = 0; i < ids.size(); i++) {
            byKey.put(ids.get(i), futures.get(i).get());
        }
        return byKey;
    }
}

static List<String> fetchAllTolerant(List<String> ids) throws Exception {
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        List<String> results = new ArrayList<>(ids.size());
        for (Future<String> future : submitAll(pool, ids)) {
            try {
                results.add(future.get());
            } catch (ExecutionException wrapped) {
                results.add("error:" + wrapped.getCause().getMessage());
            }
        }
        return List.copyOf(results);
    }
}

static String firstNonEmpty(List<String> ids) throws Exception {
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        for (Future<String> future : submitAll(pool, ids)) {
            try {
                String value = future.get();
                if (!value.isEmpty()) {
                    return value;
                }
            } catch (ExecutionException ignored) {
                // this id failed; try the next
            }
        }
        return null;
    }
}

static long timedFetch(List<String> ids) throws Exception {
    long start = System.nanoTime();
    fetchAll(ids);
    return (System.nanoTime() - start) / 1_000_000;
}
```

## Notes
The starter is not wrong — it is *serial*. Five hundred calls of twenty
milliseconds each take ten seconds, which is why the timing assertion is the
real test here.

The pattern to internalise is **submit everything, then read**. Writing
`results.add(pool.submit(() -> call(id)).get())` inside the loop submits one
task, waits for it, and submits the next: a thread pool used as a very
expensive way of calling a method. `submitAll` returns the futures precisely so
that the submitting loop cannot accidentally block.

Note what the futures buy that a concurrent collection would not: **order**.
The results come back in whatever order the calls finish, but reading
`futures.get(i)` in index order reassembles the input's order for free. That is
the same argument as `pool-the-work` in chapter 8.3, and it is why the
`fetchAllByKey` test pins `keySet()` to `["a", "b", "c"]`.

`firstNonEmpty` is the one worth thinking about. It runs everything
concurrently and then scans the futures **in index order**, returning the
lowest-indexed success — which is not the same as the first to complete.
`invokeAny` and `CompletableFuture.anyOf` would give you the first to finish,
which for equal-latency calls is effectively random. When the specification
says "the first one that works", ask which order it means; here it is the
input's.

The reason all of this is reasonable is that these are virtual threads. Five
hundred platform threads would be half a gigabyte of stack, and chapter 8.3
would have told you to use a pool of about twenty and wait. With one virtual
thread per call, the natural code is also the fast code — which is the whole
argument of the chapter.
