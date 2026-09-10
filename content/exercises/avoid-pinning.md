---
id: avoid-pinning
title: "Unpin the carriers"
difficulty: stretch
chapter: virtual-threads
topics: [virtual-threads, pinning, locks, thread-local]
check: unit
standard: java21
---

A small cache and a rate limiter, both written the way you would write them for
platform threads, and both of which throttle a virtual-thread workload to the
number of carriers. Fix them without changing what they guarantee.

- `static final class SlowCache` — `String get(String key)` returns a cached
  value or computes one by calling the given loader, which blocks for 20 ms.
  Each key is computed **at most once**, concurrent callers for the same key
  share the result, and callers for *different* keys must not wait for each
  other.
- `static final class Gate` — `Gate(int permits)`, `void run(Runnable body)`
  which admits at most `permits` callers at a time and blocks the rest. Must
  not pin.
- `static long timeCache(int threads, int keys)` — runs `threads` virtual
  threads each fetching one of `keys` distinct keys, returns milliseconds
- `static long timeGate(int permits, int tasks)` — runs `tasks` virtual threads
  through a `Gate` of `permits`, each holding it for 20 ms, returns milliseconds

The loader is given and always sleeps for 20 ms.

## Starter
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.*;

static String load(String key) throws InterruptedException {
    Thread.sleep(20);
    return "loaded:" + key;
}

static final class SlowCache {
    private final Map<String, String> values = new HashMap<>();
    final AtomicInteger loads = new AtomicInteger();

    synchronized String get(String key) throws InterruptedException {
        String cached = values.get(key);
        if (cached == null) {
            loads.incrementAndGet();
            cached = load(key);
            values.put(key, cached);
        }
        return cached;
    }
}

static final class Gate {
    private final int permits;
    private int inUse;

    Gate(int permits) {
        this.permits = permits;
    }

    synchronized void run(Runnable body) throws InterruptedException {
        while (inUse == permits) {
            wait();
        }
        inUse++;
        body.run();
        inUse--;
        notifyAll();
    }
}

static long timeCache(int threads, int keys) throws Exception {
    return 0;
}

static long timeGate(int permits, int tasks) throws Exception {
    return 0;
}
```

## Tests
```java
import java.util.concurrent.*;

SlowCache cache = new SlowCache();
checkEq(cache.get("a"), "loaded:a");
checkEq(cache.get("a"), "loaded:a");
checkEq(cache.loads.get(), 1);
checkEq(cache.get("b"), "loaded:b");
checkEq(cache.loads.get(), 2);

// Many virtual threads, one key: exactly one load.
SlowCache shared = new SlowCache();
try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 200; i++) {
        pool.submit(() -> shared.get("hot"));
    }
}
checkEq(shared.loads.get(), 1);

// Many virtual threads, many distinct keys: one load each, and they must not
// queue behind one another. 64 keys of 20 ms is 1.28 s if serialised.
SlowCache spread = new SlowCache();
long start = System.nanoTime();
try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 64; i++) {
        int key = i;
        pool.submit(() -> spread.get("key" + key));
    }
}
long spreadMs = (System.nanoTime() - start) / 1_000_000;
checkEq(spread.loads.get(), 64);
check(spreadMs < 400);

Gate gate = new Gate(4);
java.util.concurrent.atomic.AtomicInteger concurrent = new java.util.concurrent.atomic.AtomicInteger();
java.util.concurrent.atomic.AtomicInteger peak = new java.util.concurrent.atomic.AtomicInteger();
java.util.concurrent.atomic.AtomicInteger completed = new java.util.concurrent.atomic.AtomicInteger();

try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 40; i++) {
        pool.submit(() -> {
            gate.run(() -> {
                int now = concurrent.incrementAndGet();
                peak.accumulateAndGet(now, Math::max);
                try {
                    Thread.sleep(10);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                concurrent.decrementAndGet();
                completed.incrementAndGet();
            });
            return null;
        });
    }
}
checkEq(completed.get(), 40);
check(peak.get() <= 4);
check(peak.get() >= 2);

// 40 tasks of 20 ms through 8 permits is 5 rounds: about 100 ms, and it must
// not degrade to the carrier count.
long gateMs = timeGate(8, 40);
check(gateMs >= 90);
check(gateMs < 600);

long cacheMs = timeCache(32, 32);
check(cacheMs < 400);
```

## Hints
- `synchronized String get(...)` locks the whole cache for the whole 20 ms
  load, so every key waits for every other — and because a virtual thread that
  blocks inside `synchronized` is pinned, it also burns a carrier while doing
  it.
- `ConcurrentHashMap.computeIfAbsent` gives you at-most-once per key with
  per-bin locking — but the chapter warned that the mapping function runs under
  that lock, so a 20 ms blocking load inside it pins too.
- The shape that works: a `ConcurrentHashMap<String, CompletableFuture<String>>`
  or a map of `FutureTask`. Insert a not-yet-computed future with
  `putIfAbsent`, and let whichever caller installed it do the loading while the
  others wait on the future.
- Waiting on a `Future` does **not** pin: it is a normal blocking operation
  that a virtual thread can unmount from.
- `Gate` is a semaphore written by hand, and `wait()` inside `synchronized`
  pins. `java.util.concurrent.Semaphore` does the same job without a monitor.
- `Semaphore.acquire()` throws `InterruptedException`; release in a `finally`.

## Solution
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.concurrent.locks.*;

static String load(String key) throws InterruptedException {
    Thread.sleep(20);
    return "loaded:" + key;
}

static final class SlowCache {
    private final ConcurrentMap<String, CompletableFuture<String>> values = new ConcurrentHashMap<>();
    final AtomicInteger loads = new AtomicInteger();

    String get(String key) throws InterruptedException {
        CompletableFuture<String> mine = new CompletableFuture<>();
        CompletableFuture<String> existing = values.putIfAbsent(key, mine);
        if (existing != null) {
            try {
                return existing.get();
            } catch (ExecutionException wrapped) {
                throw new IllegalStateException(wrapped.getCause());
            }
        }
        try {
            loads.incrementAndGet();
            String value = load(key);
            mine.complete(value);
            return value;
        } catch (RuntimeException | InterruptedException failure) {
            values.remove(key, mine);
            mine.completeExceptionally(failure);
            throw failure;
        }
    }
}

static final class Gate {
    private final Semaphore permits;

    Gate(int permits) {
        this.permits = new Semaphore(permits);
    }

    void run(Runnable body) throws InterruptedException {
        permits.acquire();
        try {
            body.run();
        } finally {
            permits.release();
        }
    }
}

static long timeCache(int threads, int keys) throws Exception {
    SlowCache cache = new SlowCache();
    long start = System.nanoTime();
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        for (int i = 0; i < threads; i++) {
            int key = i % keys;
            pool.submit(() -> cache.get("key" + key));
        }
    }
    return (System.nanoTime() - start) / 1_000_000;
}

static long timeGate(int permits, int tasks) throws Exception {
    Gate gate = new Gate(permits);
    long start = System.nanoTime();
    try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
        for (int i = 0; i < tasks; i++) {
            pool.submit(() -> {
                gate.run(() -> {
                    try {
                        Thread.sleep(20);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
                return null;
            });
        }
    }
    return (System.nanoTime() - start) / 1_000_000;
}
```

## Notes
Both starters are correct and both are slow, in the same two ways at once.

`SlowCache` holds one monitor for the whole load, so sixty-four distinct keys
take sixty-four times twenty milliseconds — correctness at the price of all
concurrency. That much would be true with platform threads too. What virtual
threads add is the second problem: the blocking `load` happens *inside*
`synchronized`, so the caller is pinned and its carrier is unavailable to
anything else in the JVM for the whole twenty milliseconds. A cache designed
for a handful of platform threads becomes a global throughput limit.

The fix is the **promise-in-the-map** pattern, and it is worth knowing outside
this exercise. Insert an incomplete `CompletableFuture` with `putIfAbsent`: the
caller who wins the race does the loading and completes it, and everyone else
gets the loser's branch and waits on the future. Exactly one load per key, no
lock held while loading, and the waiters block in a way a virtual thread can
unmount from.

Note what happens on failure: the entry is **removed** before the future is
completed exceptionally, so a transient failure does not poison the key
forever. A cache that memoises an exception is a cache that never recovers, and
that line is the difference.

`computeIfAbsent` is the tempting one-liner and is wrong here for the reason
chapter 8.4 gave: the mapping function runs while the bin is locked. It would
give at-most-once per key and it would block a bin — and pin a carrier — for
the whole load. `computeIfAbsent` is for cheap, non-blocking computations.

`Gate` is a hand-written semaphore, and `wait()` inside `synchronized` is the
single clearest case of pinning there is: the thread blocks *by definition*,
while holding a monitor, *by definition*. `java.util.concurrent.Semaphore` does
the same job with the same guarantee and no monitor, so a waiting virtual
thread unmounts and the carrier goes off to run something else. The peak-
concurrency assertions in the tests are what keep the fix honest — a `Gate`
that simply ran everything would be fast and wrong.

The rule to take away is narrow and worth stating precisely: `synchronized` is
not banned, and short non-blocking critical sections are fine. What costs you a
carrier is **blocking while holding a monitor** — I/O, `sleep`, `wait`, or a
lock acquisition. Where that can happen, use `ReentrantLock`, `Semaphore`, or a
future.
