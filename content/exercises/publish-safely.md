---
id: publish-safely
title: "Publish it so everyone sees it"
difficulty: stretch
chapter: the-memory-model
topics: [memory-model, safe-publication, immutability, lazy-init]
check: unit
standard: java21
---

Four ways to hand an object to another thread, three of which the starter gets
wrong. The object is deliberately expensive to build so that a partially
constructed one would be observable in principle — and the fix in each case is
a happens-before edge, not a bigger lock.

`Settings` is given as a mutable class on purpose; your first job is to make it
safe to share.

- Make `Settings` **immutable**: `Settings(String host, int port, List<String> tags)`,
  with `host()`, `port()` and `tags()` returning an unmodifiable list. It must
  be safely publishable through a plain field.
- `static final class VolatileHolder` — `set(Settings)` and `get()`, using a
  `volatile` field so a reader either sees `null` or a fully built object
- `static final class LockedHolder` — the same, guarded by a `ReentrantLock`
  on **both** methods
- `static final class LazyHolder` — `get(Supplier<Settings>)` builds the value
  at most once across all threads and returns the same instance to everyone;
  the supplier must be called exactly once
- `static Settings acrossThreads(Settings value)` — hands `value` to a new
  thread which stores it, joins, and returns what the thread stored, using no
  synchronisation beyond `start`/`join`

## Starter
```java
import java.util.concurrent.locks.ReentrantLock;

static final class Settings {
    String host;
    int port;
    List<String> tags;

    Settings(String host, int port, List<String> tags) {
        this.host = host;
        this.port = port;
        this.tags = tags;
    }

    String host() {
        return host;
    }

    int port() {
        return port;
    }

    List<String> tags() {
        return tags;
    }
}

static final class VolatileHolder {
    private Settings value;

    void set(Settings value) {
        this.value = value;
    }

    Settings get() {
        return value;
    }
}

static final class LockedHolder {
    private final ReentrantLock lock = new ReentrantLock();
    private Settings value;

    void set(Settings value) {
        lock.lock();
        this.value = value;
        lock.unlock();
    }

    Settings get() {
        return value;
    }
}

static final class LazyHolder {
    private Settings value;

    Settings get(Supplier<Settings> maker) {
        if (value == null) {
            value = maker.get();
        }
        return value;
    }
}

static Settings acrossThreads(Settings value) throws InterruptedException {
    Settings[] box = new Settings[1];
    new Thread(() -> box[0] = value).start();
    return box[0];
}
```

## Tests
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

List<String> mutableTags = new ArrayList<>();
mutableTags.add("a");
mutableTags.add("b");

Settings settings = new Settings("example.test", 8080, mutableTags);
checkEq(settings.host(), "example.test");
checkEq(settings.port(), 8080);
checkEq(settings.tags(), List.of("a", "b"));

// Immutable: neither the caller's list nor the returned one can change it.
mutableTags.add("c");
checkEq(settings.tags(), List.of("a", "b"));
checkThrows(UnsupportedOperationException.class, () -> settings.tags().add("d"));

VolatileHolder volatileHolder = new VolatileHolder();
checkEq(volatileHolder.get(), null);
volatileHolder.set(settings);
checkEq(volatileHolder.get().host(), "example.test");

LockedHolder lockedHolder = new LockedHolder();
checkEq(lockedHolder.get(), null);
lockedHolder.set(settings);
checkEq(lockedHolder.get().port(), 8080);

// Both holders must survive being written and read from many threads.
for (int attempt = 0; attempt < 3; attempt++) {
    VolatileHolder shared = new VolatileHolder();
    ExecutorService pool = Executors.newFixedThreadPool(4);
    Set<String> seen = ConcurrentHashMap.newKeySet();
    for (int i = 0; i < 2_000; i++) {
        pool.submit(() -> shared.set(new Settings("h", 1, List.of("t"))));
        pool.submit(() -> {
            Settings read = shared.get();
            seen.add(read == null ? "null" : read.host() + read.port() + read.tags());
        });
    }
    pool.shutdown();
    check(pool.awaitTermination(20, TimeUnit.SECONDS));
    // Every non-null read saw a complete object.
    seen.remove("null");
    checkEq(seen, Set.of("h1[t]"));
}

// The lazy holder builds exactly once, however many threads ask.
AtomicInteger builds = new AtomicInteger();
LazyHolder lazy = new LazyHolder();
Supplier<Settings> maker = () -> {
    builds.incrementAndGet();
    return new Settings("lazy", 1, List.of());
};

ExecutorService pool = Executors.newFixedThreadPool(8);
Set<Settings> instances = ConcurrentHashMap.newKeySet();
for (int i = 0; i < 4_000; i++) {
    pool.submit(() -> instances.add(lazy.get(maker)));
}
pool.shutdown();
check(pool.awaitTermination(20, TimeUnit.SECONDS));
checkEq(builds.get(), 1);
checkEq(instances.size(), 1);
checkEq(lazy.get(maker).host(), "lazy");
checkEq(builds.get(), 1);

checkEq(acrossThreads(settings).host(), "example.test");
checkEq(acrossThreads(null), null);
```

## Hints
- `Settings` needs `final` fields, `List.copyOf(tags)` in the constructor
  (which both copies and freezes), and no setters. A `record` would do it in
  one line — write it as a class here so the `final` keywords are visible.
- `VolatileHolder`'s field is not volatile. That is the whole fix.
- `LockedHolder.get()` reads without the lock, so there is no acquire to match
  the writer's release. Lock in both, `try`/`finally` in both.
- `LazyHolder.get` is check-then-act across threads: several can see `null` and
  all build. `synchronized` on the method is the simple correct answer; if you
  use double-checked locking, the field **must** be `volatile`.
- `acrossThreads` never joins, so it reads the box before the thread writes it.
  `start`, then `join`, then read — those two edges are all the synchronisation
  it needs.
- The `Set<Settings>` test compares instances, so `Settings` must **not**
  override `equals`; leave identity comparison alone.

## Solution
```java
import java.util.concurrent.locks.ReentrantLock;

static final class Settings {
    private final String host;
    private final int port;
    private final List<String> tags;

    Settings(String host, int port, List<String> tags) {
        this.host = host;
        this.port = port;
        this.tags = List.copyOf(tags);
    }

    String host() {
        return host;
    }

    int port() {
        return port;
    }

    List<String> tags() {
        return tags;
    }
}

static final class VolatileHolder {
    private volatile Settings value;

    void set(Settings value) {
        this.value = value;
    }

    Settings get() {
        return value;
    }
}

static final class LockedHolder {
    private final ReentrantLock lock = new ReentrantLock();
    private Settings value;

    void set(Settings value) {
        lock.lock();
        try {
            this.value = value;
        } finally {
            lock.unlock();
        }
    }

    Settings get() {
        lock.lock();
        try {
            return value;
        } finally {
            lock.unlock();
        }
    }
}

static final class LazyHolder {
    private volatile Settings value;

    Settings get(Supplier<Settings> maker) {
        Settings local = value;
        if (local != null) {
            return local;
        }
        synchronized (this) {
            if (value == null) {
                value = maker.get();
            }
            return value;
        }
    }
}

static Settings acrossThreads(Settings value) throws InterruptedException {
    Settings[] box = new Settings[1];
    Thread worker = new Thread(() -> box[0] = value);
    worker.start();
    worker.join();
    return box[0];
}
```

## Notes
Making `Settings` immutable is the first fix and the one that makes the rest
easy. Final fields, a defensive `List.copyOf` of the caller's list, and no way
to mutate afterwards — so the final-field guarantee applies and a `Settings`
can be handed to any thread by any means. The two lines the tests check are
worth separating: `mutableTags.add("c")` not showing through proves the copy
happened at construction, and `settings.tags().add("d")` throwing proves the
returned list is not a way back in. Chapter 2.3 argued for both on design
grounds; here they are what makes the object publishable.

`VolatileHolder` without `volatile` is the textbook unsafe publication. On the
hardware most people test on, a reader will almost always see either `null` or
a complete object anyway — which is exactly why the bug survives testing. The
model permits a reader to see a non-null reference to an object whose `host` is
still `null` and whose `port` is still `0`, and the test's assertion that every
non-null read saw `"h1[t]"` is the property that must hold by *specification*,
not by luck. With `Settings` immutable it would hold even without `volatile`;
the field is marked anyway, because the holder should not silently depend on
its payload staying immutable forever.

`LockedHolder` reading outside the lock is the `"synchronized writer only"`
case from `happens-before-quiz`. A release with no matching acquire orders
nothing, and the reader has no edge at all — one lock used by one side is not
synchronisation, it is overhead.

`LazyHolder` is double-checked locking, and it is here because it is the
canonical example of a fix that was wrong for years. The unsynchronized read
is what makes it fast; `volatile` on the field is what makes it correct,
because without it a second thread can see a non-null reference published by
the first before the constructor's writes are visible. Note the local variable
`local` — reading a volatile field once into a local rather than twice is the
standard shape, and it is the only micro-optimisation in this solution.

And note what the chapter recommended instead: for a `static` singleton,
chapter 7.3's holder idiom gets the same laziness and the same thread safety
from the class initialisation lock, with no `volatile`, no `synchronized`, and
nothing to get wrong. Double-checked locking is for a per-instance field, where
that trick is unavailable.

`acrossThreads` is the reminder that not everything needs a keyword. `start`
and `join` are full happens-before edges, so a plain array, written by the
worker and read after the join, is completely safe. The starter's version is
broken by the missing `join` rather than by the missing `volatile`.
