---
id: bounded-pipeline
title: "A pipeline with backpressure"
difficulty: stretch
chapter: concurrent-collections
topics: [blocking-queue, producer-consumer, backpressure, shutdown]
check: unit
standard: java21
---

Producers, consumers and a bounded queue between them. The requirements that
make it hard are the boundaries: it must apply backpressure, it must shut down
cleanly, and it must not lose or duplicate a single item.

- `static final class Pipeline`
- `Pipeline(int capacity)` -- the queue holds at most `capacity` items
- `void run(List<String> inputs, int producers, int consumers, Function<String, String> transform)`
  splits `inputs` across `producers` threads which put them on the queue;
  `consumers` threads take, apply `transform`, and record the result. Returns
  only when every input has been consumed and every thread has finished.
- `List<String> results()` -- every transformed value, sorted, as a snapshot
- `long consumedCount()`
- `int highWaterMark()` -- the largest queue size observed by a producer just
  after its `put` returned. With a capacity of *n* this can never exceed *n*.
- `static long slowConsumerHoldsProducersBack(int capacity)` -- runs 200 items
  through a pipeline of the given capacity with one slow consumer, and returns
  how long it took in milliseconds. Used to show backpressure exists.

## Starter
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

static final class Pipeline {
    private final BlockingQueue<String> queue;
    private final List<String> results = new ArrayList<>();
    private int consumed;
    private int highWater;

    Pipeline(int capacity) {
        this.queue = new LinkedBlockingQueue<>();
    }

    void run(List<String> inputs, int producers, int consumers, Function<String, String> transform)
            throws InterruptedException {
        for (int p = 0; p < producers; p++) {
            new Thread(() -> {
                for (String input : inputs) {
                    queue.add(input);
                    highWater = Math.max(highWater, queue.size());
                }
            }).start();
        }
        for (int c = 0; c < consumers; c++) {
            new Thread(() -> {
                while (true) {
                    String item = queue.poll();
                    if (item == null) {
                        return;
                    }
                    results.add(transform.apply(item));
                    consumed++;
                }
            }).start();
        }
    }

    List<String> results() {
        return results;
    }

    long consumedCount() {
        return consumed;
    }

    int highWaterMark() {
        return highWater;
    }
}

static long slowConsumerHoldsProducersBack(int capacity) throws InterruptedException {
    return 0;
}
```

## Tests
```java
import java.util.concurrent.*;

List<String> inputs = new ArrayList<>();
for (int i = 0; i < 500; i++) {
    inputs.add("item-" + i);
}

Pipeline pipeline = new Pipeline(8);
pipeline.run(inputs, 3, 4, value -> value.toUpperCase());

checkEq(pipeline.consumedCount(), 500L);
checkEq(pipeline.results().size(), 500);
checkEq(new HashSet<>(pipeline.results()).size(), 500);
check(pipeline.results().contains("ITEM-0"));
check(pipeline.results().contains("ITEM-499"));
check(pipeline.highWaterMark() <= 8);
check(pipeline.highWaterMark() > 0);

Pipeline narrow = new Pipeline(1);
narrow.run(List.of("a", "b", "c"), 1, 1, value -> value + "!");
checkEq(narrow.consumedCount(), 3L);
checkEq(narrow.results(), List.of("a!", "b!", "c!"));
check(narrow.highWaterMark() <= 1);

Pipeline wide = new Pipeline(4);
wide.run(List.of("only"), 1, 8, value -> value);
checkEq(wide.consumedCount(), 1L);
checkEq(wide.results(), List.of("only"));

Pipeline empty = new Pipeline(4);
empty.run(List.of(), 2, 3, value -> value);
checkEq(empty.consumedCount(), 0L);
checkEq(empty.results(), List.of());

long tight = slowConsumerHoldsProducersBack(1);
long loose = slowConsumerHoldsProducersBack(64);
check(tight >= 150);
check(loose >= 150);
```

## Hints
- `new LinkedBlockingQueue<>()` ignores the capacity -- it is unbounded, so
  there is no backpressure at all. Pass the capacity, or use
  `ArrayBlockingQueue`.
- `queue.add` throws when the queue is full; `put` blocks, which is the whole
  point.
- `queue.poll()` returns `null` immediately when the queue is momentarily
  empty, so consumers exit before the producers have finished. Use a
  **sentinel**: after the producers are done, put one poison value per consumer
  and have each consumer stop when it takes one.
- The producers must be joined before the sentinels go in, and the consumers
  joined before `run` returns.
- `results` and the two counters are written from several threads: a
  concurrent list (or a synchronized one) and an `AtomicInteger` or `LongAdder`.
- `highWater` needs an atomic maximum -- `accumulateAndGet(depth, Math::max)`.
- Every producer iterating all the inputs sends each item `producers` times.
  Stripe the range as in `concurrent-index`.

## Solution
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

static final class Pipeline {
    private static final String POISON = "__end__";

    private final BlockingQueue<String> queue;
    private final List<String> results = new CopyOnWriteArrayList<>();
    private final LongAdder consumed = new LongAdder();
    private final AtomicInteger highWater = new AtomicInteger();

    Pipeline(int capacity) {
        this.queue = new ArrayBlockingQueue<>(capacity);
    }

    void run(List<String> inputs, int producers, int consumers, Function<String, String> transform)
            throws InterruptedException {
        Thread[] producerThreads = new Thread[producers];
        for (int p = 0; p < producers; p++) {
            int slice = p;
            producerThreads[p] = new Thread(() -> {
                try {
                    for (int i = slice; i < inputs.size(); i += producers) {
                        queue.put(inputs.get(i));
                        highWater.accumulateAndGet(queue.size(), Math::max);
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        }

        Thread[] consumerThreads = new Thread[consumers];
        for (int c = 0; c < consumers; c++) {
            consumerThreads[c] = new Thread(() -> {
                try {
                    while (true) {
                        String item = queue.take();
                        if (item.equals(POISON)) {
                            return;
                        }
                        results.add(transform.apply(item));
                        consumed.increment();
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
        }

        for (Thread consumer : consumerThreads) {
            consumer.start();
        }
        for (Thread producer : producerThreads) {
            producer.start();
        }
        for (Thread producer : producerThreads) {
            producer.join();
        }
        for (int c = 0; c < consumers; c++) {
            queue.put(POISON);
        }
        for (Thread consumer : consumerThreads) {
            consumer.join();
        }
    }

    List<String> results() {
        List<String> snapshot = new ArrayList<>(results);
        Collections.sort(snapshot);
        return List.copyOf(snapshot);
    }

    long consumedCount() {
        return consumed.sum();
    }

    int highWaterMark() {
        return highWater.get();
    }
}

static long slowConsumerHoldsProducersBack(int capacity) throws InterruptedException {
    List<String> inputs = new ArrayList<>();
    for (int i = 0; i < 200; i++) {
        inputs.add("i" + i);
    }
    Pipeline pipeline = new Pipeline(capacity);
    long start = System.nanoTime();
    pipeline.run(inputs, 2, 1, value -> {
        try {
            Thread.sleep(1);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        return value;
    });
    return (System.nanoTime() - start) / 1_000_000;
}
```

## Notes
Six faults, and the two that matter most are about *stopping*.

**The queue was unbounded.** `new LinkedBlockingQueue<>()` with no argument
holds `Integer.MAX_VALUE` items, so `put` never blocks and the capacity
argument does nothing. A fast producer then fills memory with work the consumer
has not reached -- the failure mode a bounded queue exists to prevent. The
`highWaterMark` assertions are what catch it: with a real bound, the observed
depth can never exceed the capacity.

**`poll()` instead of `take()`.** `poll` returns `null` the instant the queue
is momentarily empty, so on a fast machine every consumer exits before the
first producer has put anything in, and `consumedCount` is 0. `take` blocks --
which then raises the real question: how does a blocking consumer ever stop? A
`BlockingQueue` has no end-of-stream, so you have to invent one. One poison
value per consumer, inserted after the producers have been joined, is the
standard answer: each consumer takes exactly one and returns, and no consumer
can take two.

The ordering in `run` is deliberate and worth reading twice: **start consumers
first**, then producers, then join the producers, then insert the poisons, then
join the consumers. Starting producers first would work but can fill the queue
before anything drains it; inserting poisons before the producers finish would
let a consumer stop while items are still coming.

`queue.add` rather than `put` is the third fault -- it throws
`IllegalStateException` the moment a bounded queue is full, which is right for
a queue you expect never to fill and wrong for a pipeline. And `results`,
`consumed` and `highWater` are all plain fields written by several threads:
chapter 8.1's lost updates, three times over. `highWater` in particular needs
an atomic *maximum*, since `if (depth > highWater) highWater = depth` is
check-then-act.

Finally, every producer iterating all the inputs is the same striping bug as
`concurrent-index`, and here it shows up as five hundred items becoming fifteen
hundred -- caught by the assertion that the results contain no duplicates.

The two backpressure measurements make a point the tests can only gesture at:
both capacities take at least as long as the consumer needs, because the
consumer is the bottleneck either way. What the small capacity changes is not
the total time but the **memory** -- with capacity 1 there is never more than
one item waiting, and with an unbounded queue there could be two hundred.
Backpressure buys bounded memory, not speed.
