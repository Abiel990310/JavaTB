---
title: "The memory model — synchronized, volatile, happens-before"
navTitle: "The memory model"
summary: >-
  Two threads, four lines, and an outcome that no interleaving of those lines can produce. The rules that say when it can happen, and how to stop it.
objectives:
  - Show that a program's statements can be reordered across threads
  - State the happens-before edges the language gives you
  - Choose between volatile, synchronized and the atomic classes
  - Explain safe publication and the final-field guarantee
status: complete
standard: java21
requires: [threads]
---

Chapter 8.1 showed a counter losing increments and a flag never being noticed.
Both are explained by one thing: **the Java Memory Model does not promise that
one thread sees another's actions in the order they were written.** It promises
much less, and it tells you exactly how to get more.

## An outcome with no explanation

Two threads, two statements each:

```
Thread A:  x = 1;  r1 = y;
Thread B:  y = 1;  r2 = x;
```

Write out every interleaving of those four statements. In every single one, at
least one of `r1` and `r2` ends up `1` — whichever thread runs second sees the
other's write. `r1 == 0 && r2 == 0` is impossible.

```java run title="Except that it happens"
import java.util.concurrent.CountDownLatch;

public class Main {
    static int x;
    static int y;
    static int r1;
    static int r2;

    public static void main(String[] args) throws InterruptedException {
        int surprising = 0;
        int rounds = 0;
        long deadline = System.nanoTime() + 3_000_000_000L;

        while (System.nanoTime() < deadline) {
            x = 0;
            y = 0;
            r1 = -1;
            r2 = -1;

            CountDownLatch go = new CountDownLatch(1);
            Thread first = new Thread(() -> {
                await(go);
                x = 1;
                r1 = y;
            });
            Thread second = new Thread(() -> {
                await(go);
                y = 1;
                r2 = x;
            });

            first.start();
            second.start();
            go.countDown();
            first.join();
            second.join();

            rounds++;
            if (r1 == 0 && r2 == 0) {
                surprising++;
            }
        }

        System.out.println("rounds:              " + rounds);
        System.out.println("r1 == 0 && r2 == 0:  " + surprising + " times");
    }

    static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
```

On the machine this was written on, three seconds of this produced the
impossible outcome between three and thirteen times.

It may print `0` for you. That does not mean your JVM is different in kind — it
means the reordering did not happen this time, on this hardware, with this
JIT. A concurrency bug that appears three times in ten thousand is still a bug,
and it is a bug you will meet in production and not in testing.

What happened is that `x = 1` and `r1 = y` are independent within thread A, so
the compiler or the processor may execute them in either order. Each thread's
own behaviour is unaffected — that is the only thing the model guarantees about
a single thread — and the other thread sees the consequences.

Make the shared fields `volatile` and the outcome disappears:

```java run title="The same program, with volatile"
import java.util.concurrent.CountDownLatch;

public class Main {
    static volatile int x;
    static volatile int y;
    static int r1;
    static int r2;

    public static void main(String[] args) throws InterruptedException {
        int surprising = 0;
        int rounds = 0;
        long deadline = System.nanoTime() + 3_000_000_000L;

        while (System.nanoTime() < deadline) {
            x = 0;
            y = 0;
            r1 = -1;
            r2 = -1;

            CountDownLatch go = new CountDownLatch(1);
            Thread first = new Thread(() -> {
                await(go);
                x = 1;
                r1 = y;
            });
            Thread second = new Thread(() -> {
                await(go);
                y = 1;
                r2 = x;
            });

            first.start();
            second.start();
            go.countDown();
            first.join();
            second.join();

            rounds++;
            if (r1 == 0 && r2 == 0) {
                surprising++;
            }
        }

        System.out.println("rounds:              " + rounds);
        System.out.println("r1 == 0 && r2 == 0:  " + surprising + " times");
    }

    static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
```

Zero, every run. `volatile` writes and reads may not be reordered with respect
to each other, so the interleaving argument becomes valid again.

## Happens-before

The model is stated as a relation. If action **A** *happens-before* action
**B**, then everything A did is visible to B. If there is no such relation
between two actions in different threads, the model promises nothing at all —
not "probably works", nothing.

You get the relation from exactly these places:

| Edge | Meaning |
|---|---|
| **Program order** | Within one thread, earlier statements happen-before later ones |
| **Monitor** | Releasing a lock happens-before any later acquisition of *that same* lock |
| **Volatile** | A write to a volatile field happens-before every later read of it |
| **Thread start** | Everything before `t.start()` happens-before everything in `t` |
| **Thread join** | Everything in `t` happens-before `t.join()` returning |
| **Final fields** | A `final` field set in a constructor is visible to any thread that sees the object, provided `this` did not escape |
| **Interruption** | `t.interrupt()` happens-before the interrupted thread detecting it |

And it is **transitive**: if A happens-before B and B happens-before C, then A
happens-before C. That transitivity is what makes the rules usable — you rarely
use one edge, you chain them.

```java run title="start and join are edges too"
import java.util.ArrayList;
import java.util.List;

public class Main {
    static List<String> shared;
    static String producedByWorker;

    public static void main(String[] args) throws InterruptedException {
        shared = new ArrayList<>();
        shared.add("written before start");

        Thread worker = new Thread(() -> {
            // Everything main did before start() is visible here, with no
            // synchronization of any kind.
            System.out.println("  worker sees: " + shared);
            producedByWorker = "written by the worker";
        });

        worker.start();
        worker.join();

        // Everything the worker did is visible after join() returns.
        System.out.println("main sees:   " + producedByWorker);
    }
}
```

No `volatile`, no lock, and both fields are correctly visible. `start` and
`join` are full happens-before edges, which is why a great deal of simple
threaded code is accidentally correct — and why the moment you replace `join`
with a shared flag, it stops being.

## The piggyback rule

The volatile edge covers *everything written before the volatile write*, not
just the volatile field:

```java
// Thread A
data = computeExpensiveThing();   // plain field
ready = true;                     // volatile write

// Thread B
if (ready) {                      // volatile read
    use(data);                    // guaranteed to see the computed value
}
```

That is the transitivity doing the work: `data = …` happens-before
`ready = true` by program order, `ready = true` happens-before the read of
`ready` by the volatile rule, so `data = …` happens-before `use(data)`.

`synchronized` gives you the same thing through the monitor edge, plus mutual
exclusion. That is the real answer to "what does `synchronized` do that
`volatile` does not": it makes a block indivisible **and** it publishes
everything the block wrote.

## Safe publication

An object is **safely published** when every thread that can see the reference
is guaranteed to see a fully constructed object. Publishing one unsafely gives
you the strangest bugs in Java: another thread can see a non-null reference to
an object whose fields are still at their defaults.

The safe ways to publish are exactly the happens-before edges:

- store it in a `final` field of a properly constructed object;
- store it in a `volatile` field, or an `AtomicReference`;
- store it in a `static` initialiser (chapter 7.3's class-initialisation lock
  does the work);
- store it into a lock-guarded field and read it under the same lock;
- put it in a thread-safe collection that documents publication —
  `ConcurrentHashMap`, `BlockingQueue`, and the rest.

The `final` case is special enough to have its own name, the **final-field
guarantee**: an object whose fields are all `final` and whose constructor does
not let `this` escape can be shared with any thread by any means at all,
including a plain field, and every reader will see the fully built object.

```java run title="Immutable, therefore shareable"
public class Main {
    record Config(String host, int port) {
    }

    static Config config;              // deliberately plain, not volatile

    public static void main(String[] args) throws InterruptedException {
        config = new Config("example.test", 8080);

        Thread reader = new Thread(() -> System.out.println("  reader sees " + config));
        reader.start();
        reader.join();

        System.out.println("record components are final: " + Config.class.getRecordComponents().length);
    }
}
```

A `record` has final fields and cannot let `this` escape from its canonical
constructor, so it is safely publishable by construction. This is the strongest
practical argument for the immutability Part 2 spent chapters on: an immutable
object needs no synchronisation, no reasoning about edges, and cannot be seen
half-built. Chapter 7.3's rule about not letting `this` escape a constructor is
the same rule, and this is the other reason for it.

## What each one costs

```java run title="Measured: twenty million increments, one thread"
import java.util.concurrent.atomic.AtomicInteger;

public class Main {
    static int plain;
    static volatile int volatileCount;
    static final AtomicInteger atomic = new AtomicInteger();
    static final Object LOCK = new Object();
    static int guarded;

    public static void main(String[] args) {
        int n = 20_000_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            for (int i = 0; i < n; i++) {
                plain++;
            }
            long plainMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            for (int i = 0; i < n; i++) {
                volatileCount++;
            }
            long volatileMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            for (int i = 0; i < n; i++) {
                atomic.incrementAndGet();
            }
            long atomicMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            for (int i = 0; i < n; i++) {
                synchronized (LOCK) {
                    guarded++;
                }
            }
            long syncMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  plain " + plainMs + " ms"
                + "   volatile " + volatileMs + " ms"
                + "   AtomicInteger " + atomicMs + " ms"
                + "   synchronized " + syncMs + " ms"
                + "   (" + (plain + volatileCount + atomic.get() + guarded) + ")");
        }
    }
}
```

Warm, with no contention at all: **plain 0 ms, volatile 167 ms, AtomicInteger
108 ms, synchronized 109 ms.**

Two things in there are worth explaining. The plain counter is free because the
JIT collapses the whole loop — nothing else can observe the intermediate
values. And `volatile++` is the *slowest*, which surprises people: it is a
volatile read plus a volatile write, so two memory barriers per iteration,
while the `synchronized` block takes an uncontended lock and does an ordinary
increment inside it.

The lesson is not a ranking. It is that these numbers are for the uncontended
case, and under contention the ordering changes completely: `synchronized`
degrades sharply when threads actually queue, while `AtomicInteger` spins.
Measure your own case; do not carry these figures into a design.

And note again that `volatile++` is not atomic no matter how much it costs.
Paying for a barrier does not buy you an indivisible read-modify-write.

## Choosing

- **Nothing shared** — no synchronisation needed. First choice, always.
- **Immutable, or `final` fields** — safe publication for free.
- **One writer, one flag, no compound action** — `volatile`.
- **A single counter or reference updated by many threads** — `AtomicInteger`,
  `AtomicLong`, `AtomicReference`, `LongAdder` under heavy contention.
- **An invariant across more than one field** — `synchronized` or a
  `ReentrantLock`, holding it for every read *and* every write of the
  invariant's fields.
- **Double-checked locking** — the field must be `volatile`, and even then
  prefer chapter 7.3's holder idiom, which needs no keyword at all.

:::quiz
{
  "question": "Thread A does `data = compute(); ready = true;` where `ready` is volatile and `data` is not. Thread B does `if (ready) use(data);`. Is B guaranteed to see the computed data?",
  "options": [
    { "text": "Yes — the write to `data` happens-before the volatile write, which happens-before the volatile read, and happens-before is transitive", "correct": true, "why": "Right. The volatile write publishes everything written before it, which is why a single volatile flag can guard a whole block of plain fields." },
    { "text": "No — only `ready` is volatile, so only `ready` is visible", "correct": false, "why": "That is the common misreading. A volatile write acts as a release of everything the thread wrote before it." },
    { "text": "Only if `data` is also final", "correct": false, "why": "Final fields give a separate guarantee for construction; this ordering comes from the volatile edge and needs nothing else." },
    { "text": "Only on x86; the guarantee is hardware-dependent", "correct": false, "why": "It is a language guarantee. The JVM emits whatever barriers the hardware needs to provide it." }
  ]
}
:::

## Practice

:::exercise publish-safely

:::exercise happens-before-quiz

:::recap
- Statements with no dependency between them may be reordered, and another
  thread can observe the result. A three-second run produced an outcome no
  interleaving allows.
- **Happens-before** is the only guarantee. Its sources are program order,
  monitor release/acquire, volatile write/read, `Thread.start`, `Thread.join`,
  final fields and interruption — and it is transitive.
- A volatile write publishes **everything written before it**, which is why one
  flag can guard many plain fields.
- `synchronized` gives mutual exclusion *and* the monitor happens-before edge;
  `volatile` gives the edge without the exclusion.
- Safe publication means every reader sees a fully built object: final fields,
  volatile fields, static initialisers, lock-guarded fields, or a concurrent
  collection. An immutable object is safely published by construction.
- Uncontended costs measured over twenty million increments: plain 0 ms,
  volatile 167 ms, `AtomicInteger` 108 ms, `synchronized` 109 ms — and the
  order reverses under contention, so measure your own case.
- `volatile++` is still not atomic.
