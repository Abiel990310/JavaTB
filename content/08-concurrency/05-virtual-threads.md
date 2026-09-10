---
title: "Virtual threads"
navTitle: "Virtual threads"
summary: >-
  Ten thousand blocking tasks in 135 milliseconds instead of two and a half seconds — because a virtual thread that blocks costs nothing, and the pool-sizing advice from the last two chapters stops applying.
objectives:
  - Create virtual threads and say how they differ from platform threads
  - Explain why thread-per-task becomes viable again
  - Recognise pinning, and what causes it in Java 21
  - Know what structured concurrency will add, and what to use meanwhile
status: complete
standard: java21
requires: [concurrent-collections]
---

Chapter 8.3 said not to create a thread per task, and gave a sizing formula for
pools. Java 21 makes that advice conditional: a **virtual thread** is not an
operating-system thread, costs a few hundred bytes rather than a megabyte, and
can be created by the million.

```java run title="A thread that is not a thread"
public class Main {
    public static void main(String[] args) throws InterruptedException {
        Thread virtual = Thread.ofVirtual().name("worker").start(() ->
            System.out.println("  inside:  isVirtual=" + Thread.currentThread().isVirtual()
                + ", name=" + Thread.currentThread().getName()));
        virtual.join();

        Thread platform = Thread.ofPlatform().name("classic").start(() ->
            System.out.println("  inside:  isVirtual=" + Thread.currentThread().isVirtual()
                + ", name=" + Thread.currentThread().getName()));
        platform.join();

        System.out.println("main:      isVirtual=" + Thread.currentThread().isVirtual());
        System.out.println("finished:  " + virtual);
    }
}
```

A virtual thread is an ordinary `java.lang.Thread` — same class, same API, same
`ThreadLocal`s, same stack traces. What differs is where it runs. The JVM keeps
a small pool of **carrier** threads (real OS threads, one per core by default),
and a virtual thread runs on one of them until it blocks. At that point the JVM
**unmounts** it: the stack is copied to the heap, the carrier picks up another
virtual thread, and when the blocking call completes the stack is copied back.

Blocking, in other words, stops costing an operating-system thread. That single
change is what the rest of this chapter follows from.

## Thread-per-task, at last

```java run title="Measured: ten thousand blocking tasks"
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        int tasks = 10_000;

        AtomicLong viaVirtual = new AtomicLong();
        long start = System.nanoTime();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < tasks; i++) {
                pool.submit(() -> {
                    Thread.sleep(50);
                    viaVirtual.incrementAndGet();
                    return null;
                });
            }
        }
        long virtualMs = (System.nanoTime() - start) / 1_000_000;

        AtomicLong viaPlatform = new AtomicLong();
        start = System.nanoTime();
        try (ExecutorService pool = Executors.newFixedThreadPool(200)) {
            for (int i = 0; i < tasks; i++) {
                pool.submit(() -> {
                    Thread.sleep(50);
                    viaPlatform.incrementAndGet();
                    return null;
                });
            }
        }
        long platformMs = (System.nanoTime() - start) / 1_000_000;

        System.out.println(tasks + " tasks, each sleeping 50 ms:");
        System.out.println("  virtual thread per task: " + virtualMs + " ms  (" + viaVirtual.get() + " done)");
        System.out.println("  200 platform threads:    " + platformMs + " ms  (" + viaPlatform.get() + " done)");
    }
}
```

Measured: **135 ms with virtual threads, 2545 ms with two hundred platform
threads.** Ten thousand tasks that each block for 50 milliseconds; with virtual
threads the whole batch finishes in roughly the time of one sleep, and with two
hundred platform threads it takes fifty rounds of fifty milliseconds, because
two hundred is how many can be blocked at once.

The pool of 200 is not a straw man — it is exactly what chapter 8.3's sizing
advice produces for blocking work. The advice was right; virtual threads change
the premise it rests on.

`Executors.newVirtualThreadPerTaskExecutor()` creates a **new virtual thread
per task** and never pools anything. Pooling virtual threads is pointless and
harmful: the reason to pool an expensive resource is to avoid creating it, and
this one is cheap. Do not put virtual threads in a fixed-size pool; you would
be reintroducing the limit you just removed.

## What they are for, and what they are not

Virtual threads make **blocking** cheap. They do not make **computing** faster.

Ten thousand virtual threads doing arithmetic will run on the same handful of
carriers as ten thousand tasks in a fixed pool, and finish in the same time —
minus a little for the extra bookkeeping. There is no more processor.

So the rule is a clean split:

- **I/O-bound work** — a request handler, a database call, an HTTP client, a
  file read: virtual threads, one per task, written in plain blocking style.
- **CPU-bound work** — parsing, compression, image processing, anything that
  keeps a core busy: a fixed pool sized near `availableProcessors()`, exactly
  as before.

The style change matters as much as the numbers. Chapter 8.3's
`CompletableFuture` chains exist because blocking a platform thread was
unaffordable; if blocking is affordable, the straight-line version comes back:

```java run title="Blocking code, one thread per task"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    static String fetch(String id) throws InterruptedException {
        Thread.sleep(20);                       // pretend this is a network call
        return "user:" + id;
    }

    static String enrich(String user) throws InterruptedException {
        Thread.sleep(20);
        return user.toUpperCase();
    }

    public static void main(String[] args) throws Exception {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            ids.add(String.valueOf(i));
        }

        long start = System.nanoTime();
        List<Future<String>> futures = new ArrayList<>();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (String id : ids) {
                futures.add(pool.submit(() -> enrich(fetch(id))));
            }
        }

        List<String> results = new ArrayList<>();
        for (Future<String> future : futures) {
            results.add(future.get());
        }

        System.out.println(results.size() + " results in "
            + (System.nanoTime() - start) / 1_000_000 + " ms");
        System.out.println("first: " + results.get(0) + ", last: " + results.get(results.size() - 1));
    }
}
```

Five hundred tasks, each blocking twice in sequence, all finishing in about the
time of one task. The body is two ordinary blocking calls — no `thenCompose`,
no callback, and a stack trace that names `fetch` and `enrich` when something
goes wrong.

## Pinning

A virtual thread can only unmount at certain points. In Java 21 the important
exception is `synchronized`: a virtual thread that blocks while holding a
monitor is **pinned** to its carrier and cannot yield it.

```java run title="Measured: synchronized against ReentrantLock"
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

public class Main {
    static final Object[] MONITORS = new Object[16];
    static final ReentrantLock[] LOCKS = new ReentrantLock[16];

    static {
        for (int i = 0; i < 16; i++) {
            MONITORS[i] = new Object();
            LOCKS[i] = new ReentrantLock();
        }
    }

    public static void main(String[] args) {
        int tasks = 128;
        System.out.println("carrier threads: " + Runtime.getRuntime().availableProcessors());

        long start = System.nanoTime();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < tasks; i++) {
                int slot = i % 16;
                pool.submit(() -> {
                    synchronized (MONITORS[slot]) {
                        Thread.sleep(50);
                    }
                    return null;
                });
            }
        }
        System.out.println("blocking inside synchronized:  " + (System.nanoTime() - start) / 1_000_000 + " ms");

        start = System.nanoTime();
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < tasks; i++) {
                int slot = i % 16;
                pool.submit(() -> {
                    LOCKS[slot].lock();
                    try {
                        Thread.sleep(50);
                    } finally {
                        LOCKS[slot].unlock();
                    }
                    return null;
                });
            }
        }
        System.out.println("blocking inside ReentrantLock: " + (System.nanoTime() - start) / 1_000_000 + " ms");
    }
}
```

Same work, same sixteen independent locks: **1617 ms with `synchronized`
against 404 ms with `ReentrantLock`.** The lock version is limited by the
sixteen locks, as it should be — 128 tasks over 16 locks is 8 rounds of 50 ms.
The `synchronized` version is limited by the **four carriers**, because each
pinned virtual thread holds one for the whole sleep.

The rule for Java 21: where a virtual thread may block while holding a lock,
use `ReentrantLock` rather than `synchronized`. Short, non-blocking
`synchronized` blocks are fine — pinning only matters if you block while
pinned.

This is a limitation of the implementation rather than the design, and later
releases remove it. Until you are on one, `-Djdk.tracePinnedThreads=full`
prints a stack trace whenever a virtual thread blocks while pinned, which is
the fastest way to find these in an existing codebase.

Two other things not to do with virtual threads:

- **Do not pool them.** Covered above, and worth repeating because
  `newFixedThreadPool` is muscle memory.
- **Be careful with `ThreadLocal`.** It still works, but a million virtual
  threads mean a million copies of whatever you put in one. `ThreadLocal` as a
  per-request cache was cheap when threads were few and expensive; it is the
  other way round now.

## Structured concurrency, and what to do until it arrives

The remaining awkwardness is that a set of related tasks has no owner. If one
of five parallel calls fails, the other four keep running; if the caller is
cancelled, nothing tells the tasks. **Structured concurrency** fixes this by
giving a group of tasks a scope with a lifetime, so that they are all joined or
all cancelled together — the same discipline `try`-with-resources brought to
resources.

In Java 21 it is a preview API, which means it does not compile without
`--enable-preview` and its shape is still changing. Nothing in this book is
shown running unless it runs, so here is the sketch, clearly marked as not
compiled:

```java
// Preview in Java 21 — requires --enable-preview, and the API may change.
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<String> user = scope.fork(() -> fetchUser(id));
    Subtask<Integer> credit = scope.fork(() -> fetchCredit(id));

    scope.join();                 // wait for both
    scope.throwIfFailed();        // if either failed, the other was cancelled

    return new Profile(user.get(), credit.get());
}
```

Until that is final, the working equivalent is an executor scoped to a
`try`-with-resources block, which chapter 8.3 already used:

```java run title="Scoped today: close() joins everything"
import java.util.concurrent.*;

public class Main {
    record Profile(String user, int credit) {}

    static String fetchUser(String id) throws InterruptedException {
        Thread.sleep(30);
        return "user:" + id;
    }

    static int fetchCredit(String id) throws InterruptedException {
        Thread.sleep(30);
        return id.length() * 10;
    }

    static Profile profileOf(String id) throws Exception {
        try (ExecutorService scope = Executors.newVirtualThreadPerTaskExecutor()) {
            Future<String> user = scope.submit(() -> fetchUser(id));
            Future<Integer> credit = scope.submit(() -> fetchCredit(id));
            return new Profile(user.get(), credit.get());
        }
    }

    public static void main(String[] args) throws Exception {
        long start = System.nanoTime();
        System.out.println(profileOf("abc"));
        System.out.println("took " + (System.nanoTime() - start) / 1_000_000 + " ms (two 30 ms calls)");
    }
}
```

Both calls run concurrently, `close()` guarantees neither outlives the block,
and the total is about thirty milliseconds rather than sixty. What it does not
give you is automatic cancellation of the sibling when one fails — that is
precisely the gap structured concurrency closes.

:::quiz
{
  "question": "Ten thousand tasks each `Thread.sleep(50)`. Virtual threads finished in about 135 ms; a 200-thread pool took about 2.5 seconds. What would change if each task did 50 ms of arithmetic instead?",
  "options": [
    { "text": "The two would take about the same time, because virtual threads make blocking cheap, not computing faster", "correct": true, "why": "Right. Both would be limited by the number of cores; the advantage is entirely about threads that are waiting rather than running." },
    { "text": "Virtual threads would still be much faster, since there are more of them", "correct": false, "why": "There is no more processor. Ten thousand virtual threads run on the same handful of carriers." },
    { "text": "The platform pool would win, because virtual threads cannot run CPU-bound code", "correct": false, "why": "They run it perfectly well, on carrier threads; they simply have no advantage there." },
    { "text": "Virtual threads would deadlock, since a computing task never unmounts", "correct": false, "why": "Not unmounting is not a deadlock — the task finishes and frees its carrier. Only blocking-while-pinned causes trouble, and that is a throughput problem." }
  ]
}
:::

## Practice

:::exercise fan-out-blocking

:::exercise avoid-pinning

:::recap
- A virtual thread is a real `Thread` that the JVM unmounts from its carrier
  when it blocks. Creation costs hundreds of bytes rather than a megabyte.
- Measured: ten thousand tasks sleeping 50 ms took 135 ms with virtual threads
  and 2545 ms with a 200-thread pool — the time of one sleep against fifty
  rounds of it.
- Use `Executors.newVirtualThreadPerTaskExecutor()`, and **never pool** virtual
  threads — pooling exists to ration something expensive.
- They make blocking cheap, not computing fast. CPU-bound work still wants a
  fixed pool near `availableProcessors()`.
- In Java 21, blocking inside `synchronized` **pins** the carrier: measured
  1617 ms against 404 ms for the same work under `ReentrantLock`. Use a lock
  where you may block while holding it; `-Djdk.tracePinnedThreads=full` finds
  the cases.
- `ThreadLocal` still works and is now the expensive one — a million threads is
  a million copies.
- Structured concurrency is preview in Java 21. Until it is final, an
  `ExecutorService` in a `try`-with-resources gives the scoped lifetime without
  the automatic sibling cancellation.
