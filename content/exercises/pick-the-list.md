---
id: pick-the-list
title: "Build a history that only grows at one end"
difficulty: core
chapter: list
topics: [collections, performance, design]
check: unit
standard: java21
---

`History` records the last `capacity` actions, newest first. When it is full,
adding a new action discards the oldest.

The starter uses an `ArrayList` and `add(0, action)`, which shifts every
element on every push — so recording *n* actions costs O(n²).

Rewrite it using `ArrayDeque`, keeping the same public behaviour:

- `record(String action)` — adds at the front, discarding the oldest when full
- `mostRecent()` — the newest action, or `Optional.empty()` when nothing has
  been recorded
- `all()` — every action newest-first, as an immutable `List<String>`
- `size()`

## Starter
```java
static class History {
    private final List<String> actions = new ArrayList<>();
    private final int capacity;

    History(int capacity) {
        this.capacity = capacity;
    }

    void record(String action) {
        actions.add(0, action);
        if (actions.size() > capacity) {
            actions.remove(actions.size() - 1);
        }
    }

    Optional<String> mostRecent() {
        return actions.isEmpty() ? Optional.empty() : Optional.of(actions.get(0));
    }

    List<String> all() {
        return actions;
    }

    int size() {
        return actions.size();
    }
}
```

## Tests
```java
History h = new History(3);
checkEq(h.mostRecent(), Optional.empty());
checkEq(h.size(), 0);
checkEq(h.all(), List.of());

h.record("one");
h.record("two");
checkEq(h.mostRecent(), Optional.of("two"));
checkEq(h.all(), List.of("two", "one"));
checkEq(h.size(), 2);

h.record("three");
h.record("four");
checkEq(h.size(), 3);
checkEq(h.all(), List.of("four", "three", "two"));
checkEq(h.mostRecent(), Optional.of("four"));

List<String> snapshot = h.all();
h.record("five");
checkEq(snapshot, List.of("four", "three", "two"));
checkEq(h.all(), List.of("five", "four", "three"));

boolean rejected = false;
try {
    h.all().add("sneaky");
} catch (UnsupportedOperationException e) {
    rejected = true;
}
check(rejected);
checkEq(h.size(), 3);
```

## Hints
- `ArrayDeque` has `addFirst`, `removeLast`, `peekFirst` and `size`, which are
  exactly the four operations here.
- `Deque` iterates from the front, so a `List.copyOf(deque)` is already
  newest-first.
- The starter's `all()` returns the internal list — the snapshot check will
  fail until it returns a copy, as chapter 4.1's `snapshot-not-view` showed.
- `peekFirst()` returns `null` on an empty deque, which `Optional.ofNullable`
  turns into an empty `Optional`.

## Solution
```java
static class History {
    private final ArrayDeque<String> actions = new ArrayDeque<>();
    private final int capacity;

    History(int capacity) {
        this.capacity = capacity;
    }

    void record(String action) {
        actions.addFirst(action);
        if (actions.size() > capacity) {
            actions.removeLast();
        }
    }

    Optional<String> mostRecent() {
        return Optional.ofNullable(actions.peekFirst());
    }

    List<String> all() {
        return List.copyOf(actions);
    }

    int size() {
        return actions.size();
    }
}
```

## Notes
Every operation is now constant time. `addFirst` writes one slot and moves an
index; `removeLast` does the same at the other end. The starter's `add(0, ...)`
shifted the whole list on every single call, and `remove(size - 1)` was the
only cheap thing it did.

The behaviour is identical, which is the point — the interface `History`
presents to its callers never mentioned a list, so the implementation was free
to change. Had `all()` returned `ArrayList` rather than `List`, or had the
field been public, the swap would have been a breaking change. Chapter 4.1's
rule about declaring by the interface is what made this a five-line edit.

`peekFirst()` returning `null` rather than throwing is the `Deque` convention:
the `peek`/`poll`/`offer` family returns a sentinel and the `get`/`remove`/`add`
family throws. Both exist because a queue that is empty is sometimes an error
and sometimes just an empty queue — chapter 3.5's distinction, built into the
API. Wrapping the `null` in `Optional.ofNullable` at the boundary keeps it from
travelling further.

`List.copyOf(actions)` copies a `Deque` into an immutable `List`, which is
allowed because `copyOf` takes any `Collection`. The copy is what makes the
snapshot check pass, and it costs O(n) per call — acceptable for a bounded
history of three, and something to reconsider for one of a million.
