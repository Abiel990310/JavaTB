---
id: weak-cache
title: "A cache the collector can empty"
difficulty: stretch
chapter: lifetime-and-gc
topics: [garbage-collection, weak-references, soft-references, caching]
check: unit
standard: java21
---

Three small classes, each choosing a different reference strength on purpose.

**`Attachments`** — extra data about objects you do not own, which must not
keep them alive:

- `void attach(Object subject, String note)`, `String noteFor(Object subject)`
  returning `null` when absent, and `int size()`
- An entry must disappear once nothing else refers to its subject
- Keys are matched the way the underlying map matches them — the tests pin down
  what that turns out to be, which is not what most people expect

**`Memo`** — a computed-value cache the JVM may empty under memory pressure:

- `String get(String key, Function<String, String> compute)` — computes on a
  miss, returns the cached value on a hit
- `int computations()` — how many times `compute` was actually called
- `int liveEntries()` — entries whose value is still held, with cleared entries
  purged from the map as a side effect

**`Bounded`** — the cache you should usually reach for instead: strong
references, a fixed size, least-recently-used eviction.

- `Bounded(int capacity)`, `String get(String key, Function<String, String> compute)`,
  `int size()`, `List<String> keysInOrder()` — least recently used first

## Starter
```java
static final class Attachments {
    private final Map<Object, String> notes = new HashMap<>();

    void attach(Object subject, String note) {
        notes.put(subject, note);
    }

    String noteFor(Object subject) {
        return notes.get(subject);
    }

    int size() {
        return notes.size();
    }
}

static final class Memo {
    private final Map<String, String> values = new HashMap<>();
    private int computations;

    String get(String key, Function<String, String> compute) {
        return values.computeIfAbsent(key, k -> {
            computations++;
            return compute.apply(k);
        });
    }

    int computations() {
        return computations;
    }

    int liveEntries() {
        return values.size();
    }
}

static final class Bounded {
    private final Map<String, String> values = new HashMap<>();

    Bounded(int capacity) {
    }

    String get(String key, Function<String, String> compute) {
        return values.computeIfAbsent(key, compute);
    }

    int size() {
        return values.size();
    }

    List<String> keysInOrder() {
        return List.copyOf(values.keySet());
    }
}
```

## Tests
```java
import java.lang.ref.WeakReference;

Predicate<WeakReference<?>> collected = ref -> {
    for (int i = 0; i < 25 && ref.get() != null; i++) {
        System.gc();
        try {
            Thread.sleep(20);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    return ref.get() == null;
};

Attachments attachments = new Attachments();
Object kept = new Object();
attachments.attach(kept, "still here");
checkEq(attachments.noteFor(kept), "still here");
checkEq(attachments.noteFor(new Object()), null);

// Keys are matched by equals, not identity: two distinct but equal strings
// are ONE subject, and the second attach overwrites the first.
String a1 = new String("same");
String a2 = new String("same");
checkEq(a1, a2);
check(a1 != a2);
attachments.attach(a1, "first");
attachments.attach(a2, "second");
checkEq(attachments.noteFor(a1), "second");
checkEq(attachments.noteFor(a2), "second");
checkEq(attachments.size(), 2);

// An unreferenced subject takes its entry with it.
Object temporary = new Object();
WeakReference<Object> watcher = new WeakReference<>(temporary);
attachments.attach(temporary, "doomed");
checkEq(attachments.size(), 3);
temporary = null;
check(collected.test(watcher));
checkEq(attachments.size(), 2);
checkEq(attachments.noteFor(kept), "still here");

Memo memo = new Memo();
int[] calls = { 0 };
Function<String, String> upper = key -> {
    calls[0]++;
    return key.toUpperCase();
};

checkEq(memo.get("a", upper), "A");
checkEq(memo.get("a", upper), "A");
checkEq(calls[0], 1);
checkEq(memo.computations(), 1);
checkEq(memo.get("b", upper), "B");
checkEq(memo.computations(), 2);
checkEq(memo.liveEntries(), 2);

Bounded bounded = new Bounded(2);
checkEq(bounded.get("a", upper), "A");
checkEq(bounded.get("b", upper), "B");
checkEq(bounded.size(), 2);
checkEq(bounded.keysInOrder(), List.of("a", "b"));

// Reading "a" makes "b" the least recently used.
checkEq(bounded.get("a", upper), "A");
checkEq(bounded.keysInOrder(), List.of("b", "a"));

checkEq(bounded.get("c", upper), "C");
checkEq(bounded.size(), 2);
checkEq(bounded.keysInOrder(), List.of("a", "c"));
checkEq(bounded.get("b", upper), "B");     // evicted, so recomputed
checkEq(bounded.keysInOrder(), List.of("c", "b"));
```

## Hints
- `Attachments` wants a `WeakHashMap`, whose keys are weakly referenced and
  whose entries vanish when the key does.
- Do not add anything to make the string test pass. Run it against a plain
  `WeakHashMap` first and believe the result.
- `WeakHashMap` purges cleared entries lazily, when it is next touched, so
  `size()` is what triggers the purge. That is why the test calls it after
  waiting for the weak reference.
- The values in a `WeakHashMap` are strong. Make sure a value never refers back
  to its own key, or the entry pins itself forever.
- `Memo` wants `Map<String, SoftReference<String>>`. `computeIfAbsent` is no
  longer enough, because a present-but-cleared reference counts as a miss.
- `liveEntries` should remove entries whose reference has been cleared while it
  counts, so the map does not accumulate empty shells.
- `LinkedHashMap` has a constructor taking `accessOrder`, and a
  `removeEldestEntry` hook you override to cap the size. Its iteration order is
  then least-recently-used first, which is what `keysInOrder` wants.

## Solution
```java
static final class Attachments {
    private final Map<Object, String> notes = new WeakHashMap<>();

    void attach(Object subject, String note) {
        notes.put(subject, note);
    }

    String noteFor(Object subject) {
        return notes.get(subject);
    }

    int size() {
        return notes.size();
    }
}

static final class Memo {
    private final Map<String, java.lang.ref.SoftReference<String>> values = new HashMap<>();
    private int computations;

    String get(String key, Function<String, String> compute) {
        java.lang.ref.SoftReference<String> reference = values.get(key);
        String cached = reference == null ? null : reference.get();
        if (cached != null) {
            return cached;
        }
        computations++;
        String computed = compute.apply(key);
        values.put(key, new java.lang.ref.SoftReference<>(computed));
        return computed;
    }

    int computations() {
        return computations;
    }

    int liveEntries() {
        values.values().removeIf(reference -> reference.get() == null);
        return values.size();
    }
}

static final class Bounded {
    private final int capacity;
    private final LinkedHashMap<String, String> values;

    Bounded(int capacity) {
        this.capacity = capacity;
        this.values = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                return size() > Bounded.this.capacity;
            }
        };
    }

    String get(String key, Function<String, String> compute) {
        return values.computeIfAbsent(key, compute);
    }

    int size() {
        return values.size();
    }

    List<String> keysInOrder() {
        return List.copyOf(values.keySet());
    }
}
```

## Notes
Three caches, three reference strengths, and the ordering of the tests is the
argument: the one you should reach for is the last one.

`Attachments` is `WeakHashMap`'s actual use case — data *about* objects whose
lifetime you do not control. The string test is there because the name misleads
almost everyone: a *weak* map sounds like an *identity* map, and it is not.
`WeakHashMap` matches keys with `equals`, so `new String("same")` and another
`new String("same")` are one entry and the second `attach` overwrites the
first. If you want weakness *and* identity you have to build it — a
`WeakReference` subclass with identity `equals` and `hashCode`, drained through
a `ReferenceQueue` — because the JDK ships `WeakHashMap` (weak, equals-based)
and `IdentityHashMap` (strong, identity-based) and nothing with both.

The practical rule that follows: do not use `WeakHashMap` with `String` keys at
all. A literal is interned and effectively immortal, so its entry never clears;
a computed string clears at an unpredictable moment; and equal strings collide.
Use it with keys whose identity *is* the thing, such as the objects a framework
hands you.

The other `WeakHashMap` trap is in the hint and worth repeating: the *values*
are strongly held. If a value refers back to its own key — a `Node` whose entry
is keyed on the node — the entry keeps its own key alive and nothing is ever
collected. `WeakHashMap` cannot detect that for you.

`Memo` is where `computeIfAbsent` stops being enough. A `SoftReference` that
has been cleared is still *present* in the map, so `computeIfAbsent` sees a
mapping and returns a reference whose `get()` is `null`. The three-state read —
absent, present-but-cleared, present-and-live — has to be written out. Every
cache built on references has this shape, and it is the single most common bug
in one.

`liveEntries` purging as it counts is not tidiness. Without it, the map keeps
one dead `SoftReference` per key ever cached: the values are collected, so the
memory saving is real, but the map itself grows without bound. A reference
cache needs a sweep, either on read like this or through a `ReferenceQueue`.

`Bounded` uses ordinary strong references and is almost always the right
answer. Its size is a number you chose rather than a consequence of heap
pressure, its eviction happens at a predictable moment, and `LinkedHashMap`
does the whole thing in a constructor argument and a three-line override —
`accessOrder = true` moves an entry to the end on every `get`, and
`removeEldestEntry` is consulted after each insertion. Soft references hand
that decision to the collector, which will make it at the worst possible time
and all at once.
