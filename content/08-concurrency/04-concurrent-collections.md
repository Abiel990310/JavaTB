---
title: "Concurrent collections"
navTitle: "Concurrent collections"
summary: >-
  A synchronized wrapper makes each call safe and leaves every pair of calls broken. The concurrent collections give you the operation you actually wanted.
objectives:
  - Say why a synchronized wrapper is not enough
  - Use ConcurrentHashMap's atomic compound operations
  - Choose between CopyOnWriteArrayList and a synchronized list by measuring
  - Use a BlockingQueue to hand work between threads
status: complete
standard: java21
requires: [executors]
---

`Collections.synchronizedMap(new HashMap<>())` wraps every method in
`synchronized`. That makes each individual call atomic, and chapter 8.1 already
showed why that is not the same as making your code correct: `containsKey` then
`put` is two calls, and the state can change in between.

The `java.util.concurrent` collections are not "the same thing but faster".
They are a different bargain: **compound operations you can ask for in one
call**, and iteration that does not need a lock.

## Iteration without a lock

```java run title="Two maps, one loop"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        Map<Integer, Integer> concurrent = new ConcurrentHashMap<>();
        Map<Integer, Integer> wrapped = Collections.synchronizedMap(new HashMap<>());
        for (int i = 0; i < 1_000; i++) {
            concurrent.put(i, i);
            wrapped.put(i, i);
        }

        try {
            for (Integer key : concurrent.keySet()) {
                if (key == 500) {
                    concurrent.put(5_000, 1);
                }
            }
            System.out.println("ConcurrentHashMap: iterated while writing, no complaint");
        } catch (ConcurrentModificationException refused) {
            System.out.println("ConcurrentHashMap: ConcurrentModificationException");
        }

        try {
            for (Integer key : wrapped.keySet()) {
                if (key == 500) {
                    wrapped.put(5_000, 1);
                }
            }
            System.out.println("synchronizedMap:   iterated while writing, no complaint");
        } catch (ConcurrentModificationException refused) {
            System.out.println("synchronizedMap:   ConcurrentModificationException");
        }
    }
}
```

The wrapper throws. Its iterator is `HashMap`'s, which is **fail-fast** —
chapter 4.4's `ConcurrentModificationException`, and note that this loop is
single-threaded, so the wrapper's locking never even came into play. Worse: to
iterate a synchronized wrapper safely from several threads you must hold the
wrapper's own monitor for the whole loop, which the documentation says and
almost nobody does.

`ConcurrentHashMap`'s iterators are **weakly consistent**: they never throw,
they reflect the map at some point at or after creation, and they may or may
not show a concurrent change. That is a weaker guarantee than "a snapshot", and
it is the one that lets iteration proceed without locking anything.

## Ask for the whole operation

```java run title="Compound actions, atomically"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        ConcurrentHashMap<String, Integer> counts = new ConcurrentHashMap<>();

        counts.merge("a", 1, Integer::sum);
        counts.merge("a", 1, Integer::sum);
        counts.merge("b", 5, Integer::sum);
        System.out.println("merge:            " + counts);

        System.out.println("putIfAbsent new:  " + counts.putIfAbsent("c", 9));
        System.out.println("putIfAbsent again:" + counts.putIfAbsent("c", 99));

        counts.computeIfAbsent("d", key -> key.length());
        counts.computeIfPresent("d", (key, value) -> value + 100);
        counts.compute("e", (key, value) -> value == null ? 1 : value + 1);
        System.out.println("computed:         " + new TreeMap<>(counts));

        System.out.println("replace if equal: " + counts.replace("b", 5, 50));
        System.out.println("replace if equal: " + counts.replace("b", 5, 500));
        System.out.println("remove if equal:  " + counts.remove("c", 9));
        System.out.println("final:            " + new TreeMap<>(counts));

        System.out.println("getOrDefault:     " + counts.getOrDefault("missing", 0));
    }
}
```

Every one of those is a single atomic operation. `merge` is the counter idiom;
`computeIfAbsent` is the cache idiom; `replace(key, expected, newValue)` and
`remove(key, expected)` are compare-and-set for maps.

One rule comes with them, and it is enforced:

```java run expect-throw title="Do not touch the map inside the function"
import java.util.concurrent.ConcurrentHashMap;

public class Main {
    public static void main(String[] args) {
        ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();
        map.computeIfAbsent("a", key -> map.computeIfAbsent("a", inner -> 1));
        System.out.println(map);
    }
}
```

*IllegalStateException: Recursive update.* The mapping function runs while the
key's bin is locked, so modifying the map from inside it can deadlock the map
against itself. `ConcurrentHashMap` detects the cases it can and throws; the
cases it cannot detect simply hang. The function must be short, must not block,
and must not touch the map.

## Why it is faster, and when it is not

```java run title="Measured: four threads, one key and then a thousand"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        int threads = 4;
        int perThread = 300_000;

        for (int round = 1; round <= 3; round++) {
            Map<Integer, Integer> wrappedHot = Collections.synchronizedMap(new HashMap<>());
            long wrappedHotMs = time(threads, perThread, i -> {
                synchronized (wrappedHot) {
                    wrappedHot.merge(0, 1, Integer::sum);
                }
            });

            Map<Integer, Integer> concurrentHot = new ConcurrentHashMap<>();
            long concurrentHotMs = time(threads, perThread, i -> concurrentHot.merge(0, 1, Integer::sum));

            Map<Integer, Integer> wrappedSpread = Collections.synchronizedMap(new HashMap<>());
            long wrappedSpreadMs = time(threads, perThread, i -> {
                synchronized (wrappedSpread) {
                    wrappedSpread.merge(i % 1_000, 1, Integer::sum);
                }
            });

            Map<Integer, Integer> concurrentSpread = new ConcurrentHashMap<>();
            long concurrentSpreadMs = time(threads, perThread, i -> concurrentSpread.merge(i % 1_000, 1, Integer::sum));

            System.out.println("round " + round
                + ":  one key: wrapped " + wrappedHotMs + " ms, concurrent " + concurrentHotMs + " ms"
                + "   |  1000 keys: wrapped " + wrappedSpreadMs + " ms, concurrent " + concurrentSpreadMs + " ms");
        }
    }

    static long time(int threads, int perThread, java.util.function.IntConsumer body) throws InterruptedException {
        Thread[] workers = new Thread[threads];
        for (int i = 0; i < threads; i++) {
            int base = i * perThread;
            workers[i] = new Thread(() -> {
                for (int j = 0; j < perThread; j++) {
                    body.accept(base + j);
                }
            });
        }
        long start = System.nanoTime();
        for (Thread worker : workers) {
            worker.start();
        }
        for (Thread worker : workers) {
            worker.join();
        }
        return (System.nanoTime() - start) / 1_000_000;
    }
}
```

On the machine this was written on: with **one key**, the two are within a
factor of two of each other. With **a thousand keys**, the wrapper takes around
200 ms and `ConcurrentHashMap` around 25 — roughly eight times.

That is the whole explanation of why it is faster, and it is not magic.
`ConcurrentHashMap` locks a single hash bin rather than the whole map, so
threads working on different keys do not contend at all. Threads hammering one
key contend just as much as they would anywhere. If your workload is one hot
key, a concurrent map will not save you; a `LongAdder` or a redesign might.

## Counters under contention

```java run title="Measured: AtomicLong against LongAdder"
import java.util.concurrent.atomic.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        int threads = 4;
        int perThread = 500_000;

        for (int round = 1; round <= 3; round++) {
            AtomicLong atomic = new AtomicLong();
            long atomicMs = time(threads, perThread, atomic::incrementAndGet);

            LongAdder adder = new LongAdder();
            long adderMs = time(threads, perThread, adder::increment);

            System.out.println("round " + round
                + ":  AtomicLong " + atomicMs + " ms   LongAdder " + adderMs + " ms"
                + "   (" + atomic.get() + " / " + adder.sum() + ")");
        }
    }

    static long time(int threads, int perThread, Runnable body) throws InterruptedException {
        Thread[] workers = new Thread[threads];
        for (int i = 0; i < threads; i++) {
            workers[i] = new Thread(() -> {
                for (int j = 0; j < perThread; j++) {
                    body.run();
                }
            });
        }
        long start = System.nanoTime();
        for (Thread worker : workers) {
            worker.start();
        }
        for (Thread worker : workers) {
            worker.join();
        }
        return (System.nanoTime() - start) / 1_000_000;
    }
}
```

Warm: **AtomicLong around 79 ms, LongAdder around 6 ms** — an order of
magnitude, for the same two million increments.

`AtomicLong` has one memory location, so four threads compare-and-set the same
cache line and most attempts fail and retry. `LongAdder` keeps several cells,
each thread updating whichever it lands on, and adds them up when you call
`sum()`. The trade: `sum()` is not a consistent snapshot if writes are still
happening, and there is no atomic read-modify-write of the total. For a
statistics counter — the overwhelmingly common case — that is exactly the right
bargain.

## Lists: copy-on-write, and what it costs

```java run title="Measured: cheap reads, expensive writes"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        for (int round = 1; round <= 3; round++) {
            int size = 20_000;

            List<Integer> copyOnWrite = new CopyOnWriteArrayList<>();
            long start = System.nanoTime();
            for (int i = 0; i < size; i++) {
                copyOnWrite.add(i);
            }
            long copyOnWriteAdds = (System.nanoTime() - start) / 1_000_000;

            List<Integer> wrapped = Collections.synchronizedList(new ArrayList<>());
            start = System.nanoTime();
            for (int i = 0; i < size; i++) {
                wrapped.add(i);
            }
            long wrappedAdds = (System.nanoTime() - start) / 1_000_000;

            long checksum = 0;
            start = System.nanoTime();
            for (int i = 0; i < 2_000_000; i++) {
                checksum += copyOnWrite.get(i % size);
            }
            long copyOnWriteReads = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            for (int i = 0; i < 2_000_000; i++) {
                checksum += wrapped.get(i % size);
            }
            long wrappedReads = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  " + size + " adds: copy-on-write " + copyOnWriteAdds + " ms, wrapped " + wrappedAdds + " ms"
                + "   |  2M reads: copy-on-write " + copyOnWriteReads + " ms, wrapped " + wrappedReads + " ms"
                + "   (" + (checksum > 0) + ")");
        }
    }
}
```

Twenty thousand adds: **107 ms copy-on-write against 1 ms wrapped.** Two
million reads: **4 ms copy-on-write against 44 ms wrapped.**

`CopyOnWriteArrayList` copies the whole backing array on every write, so *n*
appends cost O(n²) — and reads take no lock at all, because the array they are
reading is never modified. It is the right choice for a listener list: written
rarely, read constantly, iterated from many threads.

Its iterator is a true snapshot of the moment it was created:

```java run title="A snapshot, not a view"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) {
        List<String> listeners = new CopyOnWriteArrayList<>(List.of("a", "b", "c"));

        Iterator<String> iterator = listeners.iterator();
        listeners.add("d");
        listeners.remove("a");

        List<String> seen = new ArrayList<>();
        while (iterator.hasNext()) {
            seen.add(iterator.next());
        }
        System.out.println("iterator saw: " + seen);
        System.out.println("list is now:  " + listeners);

        try {
            Iterator<String> another = listeners.iterator();
            another.next();
            another.remove();
        } catch (UnsupportedOperationException refused) {
            System.out.println("iterator.remove(): unsupported, because the array is immutable");
        }
    }
}
```

This is what makes chapter 8.1's "publish while iterating" problem disappear: a
listener that removes itself during notification cannot break the loop, because
the loop is walking an array nobody can touch.

## Handing work between threads

```java run title="A bounded queue"
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<String> queue = new ArrayBlockingQueue<>(4);

        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 8; i++) {
                    queue.put("item " + i);        // blocks when full
                }
                queue.put("DONE");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        });

        List<String> consumed = Collections.synchronizedList(new ArrayList<>());
        Thread consumer = new Thread(() -> {
            try {
                while (true) {
                    String item = queue.take();    // blocks when empty
                    if (item.equals("DONE")) {
                        return;
                    }
                    consumed.add(item);
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
        });

        producer.start();
        consumer.start();
        producer.join();
        consumer.join();

        System.out.println("consumed " + consumed.size() + ": " + consumed);
        System.out.println("queue left with " + queue.size() + " items");

        BlockingQueue<String> small = new ArrayBlockingQueue<>(1);
        small.put("only");
        System.out.println("offer when full:  " + small.offer("second", 100, TimeUnit.MILLISECONDS));
        System.out.println("take:             " + small.take());
        System.out.println("poll when empty:  " + small.poll(100, TimeUnit.MILLISECONDS));
    }
}
```

A `BlockingQueue` is the producer-consumer pattern with the hard parts already
written: `put` blocks when full, `take` blocks when empty, and neither needs
`wait`/`notify` from you. The **bound** is the important part — it applies
backpressure, so a fast producer cannot fill memory with work a slow consumer
has not reached.

`offer` and `poll` are the timed, non-blocking versions, returning `false` and
`null` rather than waiting forever. The sentinel `"DONE"` above is the standard
way to shut a consumer down, because there is no "end of queue".

## Which one

| Need | Use |
|---|---|
| A map many threads read and write | `ConcurrentHashMap` |
| A counter under contention | `LongAdder` (or `AtomicLong` if you need the exact atomic value) |
| A list read constantly, written rarely | `CopyOnWriteArrayList` |
| A list written often | a `synchronized` block around an `ArrayList`, or redesign |
| Handing work between threads | `ArrayBlockingQueue` / `LinkedBlockingQueue` |
| A set with concurrent access | `ConcurrentHashMap.newKeySet()` |
| A sorted map or set | `ConcurrentSkipListMap` / `ConcurrentSkipListSet` |
| A queue with no blocking | `ConcurrentLinkedQueue` |

And the one that is almost never the answer: `Collections.synchronizedX`. It
exists for retrofitting an old API, it makes each call atomic and no pair of
calls atomic, and its iterators still throw.

:::quiz
{
  "question": "Four threads call `map.merge(key, 1, Integer::sum)` 300,000 times each. Against a synchronized HashMap, `ConcurrentHashMap` was about eight times faster with 1,000 distinct keys and roughly even with one key. Why?",
  "options": [
    { "text": "ConcurrentHashMap locks a single hash bin, so threads on different keys never contend — with one key they all contend on the same bin", "correct": true, "why": "Right. Its advantage is proportional to how well the keys spread; a single hot key removes it entirely." },
    { "text": "ConcurrentHashMap is lock-free, so it never blocks regardless of the key distribution", "correct": false, "why": "Reads are lock-free; writes lock the bin. That is exactly why the one-key case shows no advantage." },
    { "text": "The synchronized wrapper copies the map on every write", "correct": false, "why": "That is CopyOnWriteArrayList's strategy. The wrapper just holds one lock around each call." },
    { "text": "merge is implemented more efficiently on ConcurrentHashMap regardless of concurrency", "correct": false, "why": "Single-threaded, the two are close; the gap in the measurement comes from contention, not from the operation." }
  ]
}
:::

## Practice

:::exercise concurrent-index

:::exercise bounded-pipeline

:::recap
- A synchronized wrapper makes each call atomic and every *pair* of calls
  racy; its iterators are still fail-fast and need external locking.
- `ConcurrentHashMap` gives atomic compound operations — `merge`,
  `computeIfAbsent`, `putIfAbsent`, `replace(k, expected, new)` — and weakly
  consistent iterators that never throw.
- The function passed to `compute*`/`merge` runs while a bin is locked: keep it
  short, do not block in it, and never touch the map from inside it.
- Its speed comes from per-bin locking, so it scales with key spread: measured
  eight times faster over a thousand keys and roughly even over one.
- `LongAdder` beat `AtomicLong` by about ten times on four threads, by trading
  a consistent atomic total for per-thread cells.
- `CopyOnWriteArrayList` measured 100× slower to append and 10× faster to read,
  with true snapshot iterators. Listener lists, not working data.
- A bounded `BlockingQueue` is producer-consumer with backpressure built in;
  `put`/`take` block, `offer`/`poll` time out.
