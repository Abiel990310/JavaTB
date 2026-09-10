---
id: count-safely
title: "Four ways to count"
difficulty: core
chapter: threads
topics: [concurrency, atomicity, visibility, synchronized]
check: unit
standard: java21
---

Same job, four implementations, and the tests hammer each with four threads.

Implement a `Counter` interface — `void increment()`, `int value()` — four
ways:

- `PlainCounter` — deliberately unsafe, a plain `int`. It exists so the tests
  can show that the others are not solving an imaginary problem, so it must
  compile and run; it need not be correct.
- `SynchronizedCounter` — a plain `int` guarded by `synchronized` on both
  methods
- `AtomicCounter` — an `AtomicInteger`
- `LockedCounter` — a `java.util.concurrent.locks.ReentrantLock`, released in a
  `finally`

Then two more:

- `static int runConcurrently(Counter counter, int threads, int each)` — starts
  `threads` threads, each calling `increment()` `each` times, joins them all,
  and returns `counter.value()`
- `static boolean stopsPromptly(boolean useVolatile)` — starts a worker
  spinning on a flag, sets the flag from the main thread after a moment, and
  reports whether the worker noticed within a second. The two flags are given.

## Starter
```java
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

interface Counter {
    void increment();
    int value();
}

static final class PlainCounter implements Counter {
    private int count;

    public void increment() {
        count++;
    }

    public int value() {
        return count;
    }
}

static final class SynchronizedCounter implements Counter {
    private int count;

    public void increment() {
        count++;
    }

    public int value() {
        return count;
    }
}

static final class AtomicCounter implements Counter {
    private final AtomicInteger count = new AtomicInteger();

    public void increment() {
        count.set(count.get() + 1);
    }

    public int value() {
        return count.get();
    }
}

static final class LockedCounter implements Counter {
    private final ReentrantLock lock = new ReentrantLock();
    private int count;

    public void increment() {
        lock.lock();
        count++;
        lock.unlock();
    }

    public int value() {
        return count;
    }
}

static boolean plainFlag = false;
static boolean volatileFlag = false;

static int runConcurrently(Counter counter, int threads, int each) throws InterruptedException {
    for (int i = 0; i < threads; i++) {
        new Thread(() -> {
            for (int j = 0; j < each; j++) {
                counter.increment();
            }
        }).run();
    }
    return counter.value();
}

static boolean stopsPromptly(boolean useVolatile) throws InterruptedException {
    return true;
}
```

## Tests
```java
int threads = 4;
int each = 50_000;
int expected = threads * each;

checkEq(runConcurrently(new SynchronizedCounter(), threads, each), expected);
checkEq(runConcurrently(new AtomicCounter(), threads, each), expected);
checkEq(runConcurrently(new LockedCounter(), threads, each), expected);

// Single-threaded, even the unsafe one is right.
checkEq(runConcurrently(new PlainCounter(), 1, each), each);

// Every counter starts at zero and counts one at a time.
for (Counter counter : List.of(new SynchronizedCounter(), new AtomicCounter(), new LockedCounter())) {
    checkEq(counter.value(), 0);
    counter.increment();
    checkEq(counter.value(), 1);
    counter.increment();
    counter.increment();
    checkEq(counter.value(), 3);
}

// The lock must be released even when value() is read from another thread.
Counter locked = new LockedCounter();
checkEq(runConcurrently(locked, threads, each), expected);
checkEq(runConcurrently(locked, threads, each), expected * 2);

check(stopsPromptly(true));
check(!stopsPromptly(false));
```

## Hints
- `runConcurrently` calls `.run()`, which runs the task on the current thread —
  so nothing is concurrent and even `PlainCounter` passes. `start()`, then
  `join()` every thread.
- Collect the threads into an array: you must start them all before joining
  any, or they run one after another.
- `AtomicCounter.increment` is `get` then `set` — check-then-act, in two calls.
  `incrementAndGet()` is the single atomic operation.
- `LockedCounter.increment` leaks the lock if `count++` ever throws. It cannot
  here, but the `try`/`finally` is not optional in code anyone will copy.
- `LockedCounter.value()` reads an unguarded `int` — take the lock there too,
  or the read has no visibility guarantee.
- `stopsPromptly` needs the worker to be a daemon and the join to have a
  timeout, or the false case hangs the test forever.
- The two flags must differ only in `volatile`. Make `volatileFlag` volatile
  and leave `plainFlag` alone.

## Solution
```java
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.ReentrantLock;

interface Counter {
    void increment();
    int value();
}

static final class PlainCounter implements Counter {
    private int count;

    public void increment() {
        count++;
    }

    public int value() {
        return count;
    }
}

static final class SynchronizedCounter implements Counter {
    private int count;

    public synchronized void increment() {
        count++;
    }

    public synchronized int value() {
        return count;
    }
}

static final class AtomicCounter implements Counter {
    private final AtomicInteger count = new AtomicInteger();

    public void increment() {
        count.incrementAndGet();
    }

    public int value() {
        return count.get();
    }
}

static final class LockedCounter implements Counter {
    private final ReentrantLock lock = new ReentrantLock();
    private int count;

    public void increment() {
        lock.lock();
        try {
            count++;
        } finally {
            lock.unlock();
        }
    }

    public int value() {
        lock.lock();
        try {
            return count;
        } finally {
            lock.unlock();
        }
    }
}

static boolean plainFlag = false;
static volatile boolean volatileFlag = false;

static int runConcurrently(Counter counter, int threads, int each) throws InterruptedException {
    Thread[] workers = new Thread[threads];
    for (int i = 0; i < threads; i++) {
        workers[i] = new Thread(() -> {
            for (int j = 0; j < each; j++) {
                counter.increment();
            }
        });
    }
    for (Thread worker : workers) {
        worker.start();
    }
    for (Thread worker : workers) {
        worker.join();
    }
    return counter.value();
}

static boolean stopsPromptly(boolean useVolatile) throws InterruptedException {
    plainFlag = false;
    volatileFlag = false;

    Thread worker = new Thread(() -> {
        if (useVolatile) {
            while (!volatileFlag) {
                // spin
            }
        } else {
            while (!plainFlag) {
                // spin
            }
        }
    });
    worker.setDaemon(true);
    worker.start();

    Thread.sleep(200);
    if (useVolatile) {
        volatileFlag = true;
    } else {
        plainFlag = true;
    }
    worker.join(1000);
    return !worker.isAlive();
}
```

## Notes
`runConcurrently` calling `.run()` is the bug that makes every other bug
invisible. Everything runs on the calling thread, in order, and all four
counters agree — which is exactly what a concurrency test looks like when it
is testing nothing. Note the second part of the fix: starting each thread and
joining it before starting the next would also produce perfect results and no
concurrency. Start them all, then join them all.

`AtomicCounter`'s `count.set(count.get() + 1)` is worth dwelling on, because it
uses an atomic class and is still wrong. `get` is atomic and `set` is atomic,
and the pair is check-then-act — the same shape as `containsKey` then `put` in
the chapter. `incrementAndGet` is one compare-and-set operation, and the
difference is not "more atomic calls" but "one call instead of two".

`LockedCounter` has two faults. Unlocking outside a `finally` means an
exception anywhere inside leaves the lock held forever and every other thread
blocked permanently — which is why the `lock(); try { } finally { unlock(); }`
shape is written that way in every codebase you will read. And `value()`
reading `count` without the lock is the visibility problem: the read may see a
stale value with no guarantee about when, if ever, it catches up. That the
tests pass without it on most machines is not evidence; it is the whole
difficulty of the subject.

`stopsPromptly` is the visibility demonstration turned into an assertion, and
the two details that make it safe to run are the daemon thread and the
`join(1000)` timeout. Without either, `stopsPromptly(false)` never returns and
the grader hangs rather than failing — a thing worth remembering whenever you
write a test that expects something *not* to happen.

Finally, notice what is missing from `SynchronizedCounter`: nothing. Two
keywords, and it is correct for both atomicity and visibility — chapter 8.2
explains why `synchronized` gives you the second one as well. It is also the
slowest of the three under contention, which is a trade the next chapters
unpack.
