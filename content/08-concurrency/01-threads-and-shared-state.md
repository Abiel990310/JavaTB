---
title: "Threads, and why shared mutable state is the whole problem"
navTitle: "Threads"
summary: >-
  Four threads incrementing a counter eight hundred thousand times lose five thousand of them. Everything else in this part is a way of not doing that.
objectives:
  - Distinguish start() from run(), and a thread from a task
  - Explain why count++ loses updates and what fixes it
  - Separate atomicity from visibility, and see each fail on its own
  - Recognise check-then-act races and lock-ordering deadlock
status: complete
standard: java21
requires: [java-time]
---

A thread is a call stack with a scheduler behind it. Two threads run
independently, and the operating system may switch between them at any point —
including in the middle of a statement you think of as a single step.

Everything difficult about concurrency follows from that, plus one more fact:
threads share the heap.

## Starting one

```java run title="run() is not start()"
public class Main {
    public static void main(String[] args) throws InterruptedException {
        Runnable task = () -> System.out.println("  running on " + Thread.currentThread().getName());

        System.out.println("calling run() directly:");
        new Thread(task).run();

        System.out.println("calling start():");
        Thread worker = new Thread(task, "worker");
        worker.start();
        worker.join();

        System.out.println("back on " + Thread.currentThread().getName());
    }
}
```

`run()` is an ordinary method call: it runs on the calling thread, and no new
thread exists. `start()` creates the thread and arranges for `run` to happen
there. Confusing them is a classic, and it produces a program that is
completely correct and completely sequential.

`join()` waits for the thread to finish. Without it, `main` can return while
work is still going.

Note the separation worth keeping: a `Runnable` is a **task**, and a `Thread`
is a **worker**. Chapter 8.3 will stop creating workers by hand entirely; for
now, creating them makes the mechanics visible.

## Lost updates

```java run title="Measured: eight hundred thousand increments"
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    static int plain = 0;
    static int guarded = 0;
    static final Object LOCK = new Object();
    static final AtomicInteger atomic = new AtomicInteger();

    public static void main(String[] args) throws InterruptedException {
        int threads = 4;
        int increments = 200_000;

        Thread[] workers = new Thread[threads];
        for (int i = 0; i < threads; i++) {
            workers[i] = new Thread(() -> {
                for (int j = 0; j < increments; j++) {
                    plain++;
                    synchronized (LOCK) {
                        guarded++;
                    }
                    atomic.incrementAndGet();
                }
            });
        }

        for (Thread worker : workers) {
            worker.start();
        }
        for (Thread worker : workers) {
            worker.join();
        }

        int expected = threads * increments;
        System.out.println("expected:              " + expected);
        System.out.println("plain int:             " + plain + "   (lost " + (expected - plain) + ")");
        System.out.println("synchronized:          " + guarded);
        System.out.println("AtomicInteger:         " + atomic.get());
    }
}
```

Typical output: the plain counter lands somewhere between 780,000 and 800,000,
losing a few thousand increments. The other two are exactly 800,000, every run.

Your numbers will differ — that is the point. The plain counter is not slightly
wrong in a predictable way; it is wrong by an amount that depends on the
scheduler, the core count and what else the machine is doing.

The reason is that `plain++` is not one operation:

```java run bytecode title="Three instructions, not one"
public class Main {
    static int count = 0;

    static void increment() {
        count++;
    }

    public static void main(String[] args) {
        increment();
        System.out.println(count);
    }
}
```

Open the **Bytecode** panel and read `increment`. It is `getstatic`, `iconst_1`,
`iadd`, `putstatic` — read, add, write. Two threads can both read `41`, both
compute `42`, and both write `42`. One increment vanishes, and nothing anywhere
detected a problem.

`synchronized` makes the three steps indivisible by ensuring only one thread
holds the lock at a time. `AtomicInteger.incrementAndGet` does it with a
compare-and-set instruction the processor provides. Both are correct here;
chapter 8.2 explains what else `synchronized` guarantees that the phrase
"only one at a time" does not cover.

## Visibility is a different problem

Atomicity is about operations being indivisible. **Visibility** is about
whether one thread ever sees another's writes at all — and losing it does not
require a race in the usual sense:

```java run title="A flag that is never noticed"
public class Main {
    static boolean plainStop = false;
    static volatile boolean volatileStop = false;

    public static void main(String[] args) throws InterruptedException {
        Thread plainWorker = new Thread(() -> {
            while (!plainStop) {
                // spin
            }
            System.out.println("  plain worker noticed");
        });
        plainWorker.setDaemon(true);
        plainWorker.start();

        Thread.sleep(300);
        plainStop = true;
        plainWorker.join(1500);
        System.out.println("non-volatile flag: still running? " + plainWorker.isAlive());

        Thread volatileWorker = new Thread(() -> {
            while (!volatileStop) {
                // spin
            }
            System.out.println("  volatile worker noticed");
        });
        volatileWorker.setDaemon(true);
        volatileWorker.start();

        Thread.sleep(300);
        volatileStop = true;
        volatileWorker.join(1500);
        System.out.println("volatile flag:     still running? " + volatileWorker.isAlive());
    }
}
```

The non-volatile worker **never stops**. Not "usually stops late" — it spins
forever, and the program only ends because the thread is a daemon.

There is exactly one write and one read, so there is no interleaving to blame.
What happened is that the JIT, seeing a loop that reads a field nothing in the
loop modifies, hoisted the read out and turned `while (!plainStop)` into
`if (!plainStop) while (true)`. That is a legal transformation, because without
`volatile` nothing in the program says another thread might change the field.

`volatile` says exactly that: every read goes to memory, and a write is
visible to every subsequent read. It gives visibility and nothing else — a
`volatile int` counter still loses increments, because `++` is still three
operations.

## Check, then act

```java run title="Two safe calls, one unsafe pair"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        Map<String, Integer> counts = new HashMap<>();
        int total = 20_000;

        ExecutorService pool = Executors.newFixedThreadPool(4);
        for (int i = 0; i < total; i++) {
            pool.submit(() -> {
                if (!counts.containsKey("k")) {
                    counts.put("k", 0);
                }
                counts.put("k", counts.get("k") + 1);
            });
        }
        pool.shutdown();
        pool.awaitTermination(20, TimeUnit.SECONDS);

        System.out.println("counted " + counts.get("k") + " of " + total);

        Map<String, Integer> safe = new ConcurrentHashMap<>();
        ExecutorService second = Executors.newFixedThreadPool(4);
        for (int i = 0; i < total; i++) {
            second.submit(() -> safe.merge("k", 1, Integer::sum));
        }
        second.shutdown();
        second.awaitTermination(20, TimeUnit.SECONDS);

        System.out.println("merge counted " + safe.get("k") + " of " + total);
    }
}
```

The first loop loses several hundred. Every individual call is a normal method
call; the problem is that `containsKey` then `put`, or `get` then `put`, is a
**compound action** — the state can change between the two, and it does.

Making the map thread-safe would not fix it. A `ConcurrentHashMap` would make
each call atomic and the *pair* would still race. What fixes it is asking for
the whole operation at once: `merge`, `compute`, `computeIfAbsent`,
`putIfAbsent` exist precisely because check-then-act is the default mistake.
Chapter 8.4 is about that.

Worse, a plain `HashMap` under concurrent modification is not merely
inaccurate — it can corrupt its internal structure and produce lost entries or
an infinite loop on lookup. The lost counts above are the polite failure.

## Deadlock

```java run title="Two locks, two orders"
import java.util.concurrent.*;

public class Main {
    static final Object FIRST = new Object();
    static final Object SECOND = new Object();

    public static void main(String[] args) throws InterruptedException {
        CountDownLatch bothHoldOne = new CountDownLatch(2);

        Thread ascending = new Thread(() -> {
            synchronized (FIRST) {
                bothHoldOne.countDown();
                pause();
                synchronized (SECOND) {
                    System.out.println("ascending finished");
                }
            }
        }, "ascending");

        Thread descending = new Thread(() -> {
            synchronized (SECOND) {
                bothHoldOne.countDown();
                pause();
                synchronized (FIRST) {
                    System.out.println("descending finished");
                }
            }
        }, "descending");

        ascending.setDaemon(true);
        descending.setDaemon(true);
        ascending.start();
        descending.start();

        bothHoldOne.await();
        ascending.join(1000);
        descending.join(1000);

        System.out.println("ascending:  alive=" + ascending.isAlive() + ", state=" + ascending.getState());
        System.out.println("descending: alive=" + descending.isAlive() + ", state=" + descending.getState());
    }

    static void pause() {
        try {
            Thread.sleep(200);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
```

Both threads end in state `BLOCKED` and neither ever finishes. Each holds one
lock and waits for the other, and nothing will ever break the cycle — there is
no timeout on `synchronized`, no detection, and no recovery. The program would
hang forever if the threads were not daemons.

The fix is a rule, not a mechanism: **acquire locks in a consistent global
order**. If every thread takes `FIRST` before `SECOND`, this cannot happen. When
the locks are objects with no natural order — two accounts in a transfer — order
them by something stable, such as an account id, or use a single lock for the
whole operation.

Note also that `Thread.sleep` does **not** release a lock. A thread sleeping
inside `synchronized` keeps everyone else out for the duration; only
`Object.wait` releases the monitor.

## What actually works

The techniques, in the order you should try them:

1. **Do not share.** A task that owns its data needs no synchronisation at all.
   Give each thread its own state and combine results at the end — which is
   what a collector's combiner did in chapter 6.4.
2. **Share immutable data.** A `record` with `final` fields, a `List.copyOf`,
   a `String` — none of these can race, because nothing can change. Part 2's
   argument for immutability is a concurrency argument as much as a design one.
3. **Confine mutable data to one thread.** The classic is a UI toolkit where
   all widget state belongs to one thread and everything else posts messages.
4. **Use a class that has already solved it.** `AtomicInteger`,
   `ConcurrentHashMap`, `BlockingQueue`, an `ExecutorService`. These are
   written by people who read the memory model, and you get their work for the
   price of an import.
5. **Only then, synchronise yourself** — and when you do, keep the critical
   section small, take locks in a fixed order, and never call unknown code
   while holding one.

The order matters. Most concurrency bugs come from starting at step 5.

:::quiz
{
  "question": "A worker thread spins on `while (!stopped) {}` where `stopped` is a plain `boolean` static field. Another thread sets it to `true`. The worker never stops. Why?",
  "options": [
    { "text": "Without `volatile`, nothing tells the compiler the field can change elsewhere, so the JIT may hoist the read out of the loop", "correct": true, "why": "Right — the loop becomes `if (!stopped) while (true)`, which is a legal transformation for a field with no memory-model guarantees attached." },
    { "text": "The write is not atomic, so the worker sees a half-written boolean", "correct": false, "why": "A boolean write is atomic; there is no torn value. The problem is visibility, not atomicity." },
    { "text": "The worker thread has a stale CPU cache line that is never invalidated", "correct": false, "why": "Cache coherence is real hardware behaviour, but here the read was removed from the loop entirely — the worker is not re-reading anything to be stale about." },
    { "text": "`main` finished before the write took effect", "correct": false, "why": "The write happens before the join, and the worker keeps spinning while main waits on it." }
  ]
}
:::

## Practice

:::exercise count-safely

:::exercise fix-the-transfer

:::recap
- `start()` creates a thread; `run()` is a plain call on the current one.
  A `Runnable` is a task, a `Thread` is a worker.
- `count++` is read-add-write. Four threads doing it 200,000 times each lose
  thousands of increments, by an amount that varies every run.
- `synchronized` and `AtomicInteger` both make it indivisible and both give the
  exact answer.
- **Atomicity and visibility are different.** A non-volatile flag is never seen
  at all, because the JIT may hoist the read out of the loop. `volatile` fixes
  visibility and does nothing for atomicity.
- Check-then-act is a compound action: making each call thread-safe does not
  make the pair safe. Use `merge`, `compute`, `putIfAbsent`.
- Two locks taken in opposite orders deadlock permanently — `BLOCKED`, no
  timeout, no recovery. Acquire locks in a consistent global order.
- Prefer not sharing, then immutable sharing, then confinement, then a
  ready-made concurrent class, and only then your own locks.
