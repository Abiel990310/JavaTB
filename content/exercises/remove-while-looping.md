---
id: remove-while-looping
title: "Remove during a loop, correctly"
difficulty: intro
chapter: iteration
topics: [iteration, collections]
check: unit
standard: java21
---

Write `dropExpired(List<Item> items, int now)`, removing every item whose
`expiry` is at or before `now`, in place, and returning how many were removed.

`Item` is given: `record Item(String name, int expiry) { }`.

The starter modifies the list while an enhanced `for` loop is walking it. On
most inputs it throws; on one shape of input it silently returns the wrong
count, which is the case the checks are built around.

## Starter
```java
record Item(String name, int expiry) { }

static int dropExpired(List<Item> items, int now) {
    int removed = 0;
    for (Item item : items) {
        if (item.expiry() <= now) {
            items.remove(item);
            removed++;
        }
    }
    return removed;
}
```

## Tests
```java
List<Item> a = new ArrayList<>(List.of(
    new Item("a", 1), new Item("b", 5), new Item("c", 2), new Item("d", 9)));
checkEq(dropExpired(a, 3), 2);
checkEq(a, List.of(new Item("b", 5), new Item("d", 9)));

List<Item> secondToLast = new ArrayList<>(List.of(
    new Item("a", 9), new Item("b", 9), new Item("c", 1), new Item("d", 9)));
checkEq(dropExpired(secondToLast, 3), 1);
checkEq(secondToLast, List.of(new Item("a", 9), new Item("b", 9), new Item("d", 9)));

List<Item> allExpired = new ArrayList<>(List.of(new Item("a", 1), new Item("b", 1)));
checkEq(dropExpired(allExpired, 5), 2);
checkEq(allExpired, List.of());

List<Item> noneExpired = new ArrayList<>(List.of(new Item("a", 9)));
checkEq(dropExpired(noneExpired, 5), 0);
checkEq(noneExpired, List.of(new Item("a", 9)));

List<Item> empty = new ArrayList<>();
checkEq(dropExpired(empty, 5), 0);
checkEq(empty, List.of());
```

## Hints
- `removeIf` does the removal in one pass and returns a boolean, so count by
  comparing sizes before and after.
- Or use an explicit `Iterator` and call `it.remove()`, which is the only
  removal a live iterator permits.
- The `secondToLast` case is the one that does not throw. Work out what the
  starter returns for it before fixing anything.

## Solution
```java
record Item(String name, int expiry) { }

static int dropExpired(List<Item> items, int now) {
    int before = items.size();
    items.removeIf(item -> item.expiry() <= now);
    return before - items.size();
}
```

## Notes
Run the starter on the `secondToLast` list in your head. It removes `"c"` at
index 2, the size drops from 4 to 3, and the iterator's cursor is already 3 —
so `hasNext()` reports nothing left and the loop ends without `next()` ever
checking `modCount`. No exception. The count returned is 1, which happens to be
right, and `"d"` was never examined, which happens not to matter here.

Change the expiry of `"d"` to 1 and the same code returns 1 where the answer is
2, still without throwing. That is the shape of bug this chapter exists to warn
about: the exception is a debugging aid that catches most of these loudly, and
the ones it misses are silent.

`removeIf` avoids the whole question. It is defined on `Collection`, does one
pass, and `ArrayList` implements it by marking survivors and compacting them
with a single block move — so it is also faster than repeated `remove(Object)`,
each of which is a linear search followed by a shift.

Counting by subtracting sizes is exact and free. `removeIf` returns only
whether anything changed, for the reason chapter 4.2's `batch-remove` gave: the
count is not wanted by most callers and computing it would cost all of them.

The `Iterator` form is worth being able to write, because it generalises to
cases `removeIf` cannot express — needing the index, removing from a second
collection at the same time, or stopping early:

```java
for (Iterator<Item> it = items.iterator(); it.hasNext(); ) {
    if (it.next().expiry() <= now) {
        it.remove();
        removed++;
    }
}
```
