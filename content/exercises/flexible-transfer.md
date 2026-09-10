---
id: flexible-transfer
title: "Move matching items between collections"
difficulty: stretch
chapter: wildcards
topics: [generics, wildcards, predicates]
check: unit
standard: java21
---

Write `transfer(source, destination, predicate)`, moving every element of
`source` that satisfies the predicate into `destination`, removing it from
`source`, and returning how many moved.

The signature is the exercise. It must accept:

- a source list of `T` or of any subtype of `T`
- a destination that can hold a `T` — so `T` itself or any supertype
- a predicate that can test a `T`, including one written for a supertype

Order is preserved in both lists.

`Predicate<T>` has one method, `boolean test(T value)`.

## Starter
```java
static <T> int transfer(List<T> source, List<T> destination, Predicate<T> predicate) {
    int moved = 0;
    Iterator<T> it = source.iterator();
    while (it.hasNext()) {
        T item = it.next();
        if (predicate.test(item)) {
            destination.add(item);
            it.remove();
            moved++;
        }
    }
    return moved;
}
```

## Tests
```java
List<Integer> source = new ArrayList<>(List.of(1, 2, 3, 4, 5, 6));
List<Number> evens = new ArrayList<>();
checkEq(transfer(source, evens, n -> n % 2 == 0), 3);
checkEq(source, List.of(1, 3, 5));
checkEq(evens, List.of(2, 4, 6));

List<String> words = new ArrayList<>(List.of("a", "bbb", "cc"));
List<Object> longOnes = new ArrayList<>();
checkEq(transfer(words, longOnes, s -> s.length() > 1), 2);
checkEq(words, List.of("a"));
checkEq(longOnes, List.of("bbb", "cc"));

// A predicate written for a supertype must be accepted.
Predicate<Object> notNull = Objects::nonNull;
List<String> maybe = new ArrayList<>(List.of("x", "y"));
List<String> kept = new ArrayList<>();
checkEq(transfer(maybe, kept, notNull), 2);
check(maybe.isEmpty());
checkEq(kept, List.of("x", "y"));

List<Integer> none = new ArrayList<>(List.of(1, 3));
List<Integer> sink = new ArrayList<>();
checkEq(transfer(none, sink, n -> n > 100), 0);
checkEq(none, List.of(1, 3));
check(sink.isEmpty());
```

## Hints
- The source is read from and removed from, but nothing is *added* to it, so
  it still counts as a producer: `List<? extends T>`.
- The destination only receives: `List<? super T>`.
- The predicate consumes a `T`, so it takes `? super T` — which is why a
  `Predicate<Object>` is acceptable.
- Removal through the iterator works regardless of the wildcard, because
  `Iterator.remove` takes no argument.

## Solution
```java
static <T> int transfer(List<? extends T> source,
                        List<? super T> destination,
                        Predicate<? super T> predicate) {
    int moved = 0;
    Iterator<? extends T> it = source.iterator();
    while (it.hasNext()) {
        T item = it.next();
        if (predicate.test(item)) {
            destination.add(item);
            it.remove();
            moved++;
        }
    }
    return moved;
}
```

## Notes
Three parameters, three different wildcard decisions, and the interesting one
is the source.

`List<? extends T>` normally means "read only" — you cannot `add` through it.
But `transfer` *removes* from the source, and that is allowed, because
`Iterator.remove()` takes no argument. The prohibition on `? extends` is
specifically about putting a value *in*, since the compiler cannot know the
element type is compatible. Taking one out needs no such guarantee, so the
wildcard permits it. `source.add(item)` would not compile; `it.remove()` does.

`Predicate<? super T>` is the same reasoning as `Comparator<? super T>` in
chapter 5.1. A predicate that can test any `Object` can certainly test a
`String`, so refusing it would be arbitrary — and the third check passes
exactly such a predicate.

The iterator's own type has to be `Iterator<? extends T>` rather than
`Iterator<T>`, which is the kind of detail that makes wildcards feel heavier
than they are. `var it = source.iterator()` avoids writing it at all, and is
what most modern code does here.

Note the shape of the checks: they move `Integer`s into a `List<Number>` and
`String`s into a `List<Object>`. Neither compiles against the starter's
signature, and neither is unsafe — the whole exercise is the gap between what
the code can do and what its signature admits to.
