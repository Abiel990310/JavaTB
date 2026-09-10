---
id: bounded-max
title: "A maximum that works for any comparable type"
difficulty: core
chapter: generic-classes
topics: [generics, bounds]
check: unit
standard: java21
---

Write two generic methods:

- `largest(List<T> items)` — the largest element by natural ordering, or
  `Optional.empty()` for an empty list.
- `largestBy(List<T> items, Comparator<? super T> comparator)` — the same, but
  using the supplied comparator, for types that have no natural ordering.

The starter compiles only because it uses raw types and casts, and it throws on
a type that is not `Comparable`.

## Starter
```java
@SuppressWarnings({ "unchecked", "rawtypes" })
static Optional<Object> largest(List items) {
    if (items.isEmpty()) {
        return Optional.empty();
    }
    Comparable best = (Comparable) items.get(0);
    for (Object item : items) {
        if (((Comparable) item).compareTo(best) > 0) {
            best = (Comparable) item;
        }
    }
    return Optional.of(best);
}
```

## Tests
```java
checkEq(largest(List.of(3, 9, 2)), Optional.of(9));
checkEq(largest(List.of("pear", "apple", "fig")), Optional.of("pear"));
checkEq(largest(List.<Integer>of()), Optional.empty());
checkEq(largest(List.of(7)), Optional.of(7));

// The result keeps its type: no cast at the call site.
String longest = largest(List.of("a", "bbb", "cc")).orElseThrow();
checkEq(longest, "cc");

record Point(int x, int y) { }
List<Point> points = List.of(new Point(1, 9), new Point(5, 2), new Point(3, 3));

checkEq(largestBy(points, Comparator.comparingInt(Point::x)), Optional.of(new Point(5, 2)));
checkEq(largestBy(points, Comparator.comparingInt(Point::y)), Optional.of(new Point(1, 9)));
checkEq(largestBy(List.<Point>of(), Comparator.comparingInt(Point::x)), Optional.empty());
checkEq(largestBy(List.of("a", "bbb"), Comparator.comparingInt(String::length)),
        Optional.of("bbb"));
```

## Hints
- `largest` needs a bound so `compareTo` is available:
  `<T extends Comparable<T>>`.
- The return type is `Optional<T>`, so the caller gets their own type back
  without a cast.
- `largestBy` needs no bound at all — the comparator supplies the ordering, so
  `T` can be anything.
- Both are the same loop. Seed from the first element and keep the better one.

## Solution
```java
static <T extends Comparable<T>> Optional<T> largest(List<T> items) {
    return largestBy(items, Comparator.naturalOrder());
}

static <T> Optional<T> largestBy(List<T> items, Comparator<? super T> comparator) {
    if (items.isEmpty()) {
        return Optional.empty();
    }
    T best = items.get(0);
    for (T item : items) {
        if (comparator.compare(item, best) > 0) {
            best = item;
        }
    }
    return Optional.of(best);
}
```

## Notes
The two methods differ in exactly one thing: where the ordering comes from. So
`largest` is written as a call to `largestBy` with `Comparator.naturalOrder()`,
and the loop exists once. That is worth doing whenever a bounded and an
unbounded version of the same operation are both wanted — the JDK does the same
thing in `Collections.max`.

The bound on `largest` is what makes `compareTo` available. Without it, `T` is
only known to be an `Object`, and the compiler rejects the call — the error is
*cannot find symbol: method compareTo(T)*, which is the compiler saying it has
no reason to believe the type has one.

`largestBy` needs no bound, because the comparator brings the ordering with it.
That is the more flexible design and the reason `Comparator` exists alongside
`Comparable`: a type has one natural order at most, and any number of useful
orderings.

`Comparator<? super T>` rather than `Comparator<T>` lets a comparator for a
supertype be used — a `Comparator<Object>` can order anything, so it should be
accepted here. That is a wildcard, and chapter 5.3 is about why it points that
way round.

The starter's `@SuppressWarnings` is the tell. Reaching for it usually means
the types are being fought rather than expressed, and the generic version needs
neither the annotation nor a single cast.
