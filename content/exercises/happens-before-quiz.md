---
id: happens-before-quiz
title: "Which edge is doing the work?"
difficulty: core
chapter: the-memory-model
topics: [memory-model, happens-before, volatile, synchronized]
check: unit
standard: java21
---

Not a quiz you answer in prose — one you answer in code, so the answers can be
checked.

Implement `static String edgeFor(String scenario)`, returning the name of the
happens-before edge that makes each scenario safe, or `"none"` when nothing
guarantees it. The permitted answers are exactly:

`"program order"`, `"monitor"`, `"volatile"`, `"thread start"`,
`"thread join"`, `"final field"`, `"none"`.

The scenarios, by name:

- `"same thread"` — one thread writes a field then reads it
- `"before start"` — main writes a plain field, then calls `t.start()`; `t`
  reads it
- `"after join"` — `t` writes a plain field; main calls `t.join()` then reads it
- `"plain flag"` — one thread writes a plain `boolean`; another spins on it
- `"volatile flag"` — the same, with `volatile`
- `"data behind volatile flag"` — a plain field written before a volatile write,
  read after the volatile read
- `"synchronized both"` — both threads read and write inside `synchronized` on
  the same lock
- `"synchronized writer only"` — the writer synchronizes, the reader does not
- `"different locks"` — both synchronize, on different objects
- `"immutable record"` — a record published through a plain field

Then two working pieces:

- `static int startJoinRoundTrip(int seed)` — writes `seed` to a plain static
  field, starts a thread that reads it and writes `seed * 2` to another plain
  static field, joins, and returns the second field. No `volatile`, no locks.
- `static boolean flagIsRespected(boolean useVolatile)` — as in chapter 8.1:
  true when a spinning worker notices the flag within a second.

## Starter
```java
static int handedToWorker;
static int producedByWorker;

static boolean plainFlag;
static boolean volatileFlag;

static String edgeFor(String scenario) {
    return "volatile";
}

static int startJoinRoundTrip(int seed) throws InterruptedException {
    handedToWorker = seed;
    Thread worker = new Thread(() -> producedByWorker = handedToWorker * 2);
    worker.start();
    return producedByWorker;
}

static boolean flagIsRespected(boolean useVolatile) throws InterruptedException {
    return true;
}
```

## Tests
```java
checkEq(edgeFor("same thread"), "program order");
checkEq(edgeFor("before start"), "thread start");
checkEq(edgeFor("after join"), "thread join");
checkEq(edgeFor("plain flag"), "none");
checkEq(edgeFor("volatile flag"), "volatile");
checkEq(edgeFor("data behind volatile flag"), "volatile");
checkEq(edgeFor("synchronized both"), "monitor");
checkEq(edgeFor("synchronized writer only"), "none");
checkEq(edgeFor("different locks"), "none");
checkEq(edgeFor("immutable record"), "final field");

checkThrows(IllegalArgumentException.class, () -> edgeFor("something else"));

checkEq(startJoinRoundTrip(21), 42);
checkEq(startJoinRoundTrip(0), 0);
checkEq(startJoinRoundTrip(-5), -10);

check(flagIsRespected(true));
check(!flagIsRespected(false));
```

## Hints
- Three of the ten scenarios are `"none"`. Two of those involve `synchronized`,
  which is the point: the keyword is not a spell — both sides must use the
  **same** lock.
- "data behind volatile flag" is the transitivity case from the chapter: the
  plain write is ordered by the volatile edge, so the answer is `"volatile"`.
- A `Map<String, String>` of scenario to answer is the natural shape, with an
  `IllegalArgumentException` for anything not in it.
- `startJoinRoundTrip` is missing its `join()`. Without it the read races the
  worker and usually returns 0.
- `flagIsRespected` needs a daemon worker and a `join(1000)`, or the false case
  never returns.

## Solution
```java
static int handedToWorker;
static int producedByWorker;

static boolean plainFlag;
static volatile boolean volatileFlag;

static final Map<String, String> EDGES = Map.ofEntries(
    Map.entry("same thread", "program order"),
    Map.entry("before start", "thread start"),
    Map.entry("after join", "thread join"),
    Map.entry("plain flag", "none"),
    Map.entry("volatile flag", "volatile"),
    Map.entry("data behind volatile flag", "volatile"),
    Map.entry("synchronized both", "monitor"),
    Map.entry("synchronized writer only", "none"),
    Map.entry("different locks", "none"),
    Map.entry("immutable record", "final field"));

static String edgeFor(String scenario) {
    String edge = EDGES.get(scenario);
    if (edge == null) {
        throw new IllegalArgumentException("unknown scenario: " + scenario);
    }
    return edge;
}

static int startJoinRoundTrip(int seed) throws InterruptedException {
    handedToWorker = seed;
    Thread worker = new Thread(() -> producedByWorker = handedToWorker * 2);
    worker.start();
    worker.join();
    return producedByWorker;
}

static boolean flagIsRespected(boolean useVolatile) throws InterruptedException {
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
The three `"none"` answers are the ones worth arguing about.

**`"plain flag"`** is chapter 8.1's spinning worker. There is a write and a
read of the same field and no edge between them, so the model permits the
reader never to see the write — and the JIT takes it up on the offer.

**`"synchronized writer only"`** is the one that catches experienced people.
The writer takes a lock, so the write is followed by a release; the reader
never acquires that lock, so there is no matching acquire and no edge. A
release with no acquire orders nothing. Both sides must synchronize, on the
same monitor.

**`"different locks"`** is the same point stated more obviously. The monitor
edge is between a release and a later acquire *of that same monitor*. Two
threads carefully locking two different objects have synchronized nothing and
have paid for the privilege.

The two `"volatile"` answers are one rule. `"volatile flag"` uses the edge
directly; `"data behind volatile flag"` uses it plus program order plus
transitivity — the plain write happens-before the volatile write, which
happens-before the volatile read, which happens-before the plain read. This
chaining is what makes a single `volatile` field able to publish a whole
structure, and it is the mechanism behind every `volatile boolean initialized`
you will see in real code.

`startJoinRoundTrip` without `join()` is a race with two separate faults, and
the missing edge is only the second of them. The first is that the main thread
usually reads `producedByWorker` before the worker has run at all, so the
answer is `0` — a plain ordering bug you would find in testing. The
memory-model fault is subtler: even if the worker did finish first, nothing
would guarantee main *sees* it. Adding `join()` fixes both at once, which is a
good illustration of why so much simple threaded code is correct without any
`volatile` anywhere — `start` and `join` are doing the work.
