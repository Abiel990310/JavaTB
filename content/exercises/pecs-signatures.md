---
id: pecs-signatures
title: "Widen the signatures"
difficulty: core
chapter: wildcards
topics: [generics, wildcards, PECS]
check: unit
standard: java21
---

Three methods are correct and too fussy: each demands an exact type argument
where a wildcard would let far more callers in.

Widen each signature so the calls in the checks compile, without changing any
method body.

- `total(List<Number>)` reads numbers and sums them as `double`.
- `addSquares(List<Integer>, int)` adds the squares of 1..n to the list.
- `copyInto(List<T>, List<T>)` copies everything from the first into the second.

## Starter
```java
static double total(List<Number> numbers) {
    double sum = 0;
    for (Number n : numbers) {
        sum += n.doubleValue();
    }
    return sum;
}

static void addSquares(List<Integer> sink, int n) {
    for (int i = 1; i <= n; i++) {
        sink.add(i * i);
    }
}

static <T> void copyInto(List<T> source, List<T> destination) {
    for (T item : source) {
        destination.add(item);
    }
}
```

## Tests
```java
checkEq(total(List.of(1, 2, 3)), 6.0);
checkEq(total(List.of(1.5, 2.5)), 4.0);
checkEq(total(List.<Number>of(1, 2.5)), 3.5);

List<Integer> ints = new ArrayList<>();
addSquares(ints, 3);
checkEq(ints, List.of(1, 4, 9));

List<Number> numbers = new ArrayList<>();
addSquares(numbers, 2);
checkEq(numbers, List.of(1, 4));

List<Object> objects = new ArrayList<>();
addSquares(objects, 2);
checkEq(objects, List.of(1, 4));

List<Number> destination = new ArrayList<>();
copyInto(List.of(1, 2), destination);
checkEq(destination, List.of(1, 2));

List<Object> anything = new ArrayList<>();
copyInto(List.of("a", "b"), anything);
checkEq(anything, List.of("a", "b"));
```

## Hints
- `total` only reads. Producer extends: `List<? extends Number>`.
- `addSquares` only writes. Consumer super: `List<? super Integer>`.
- `copyInto` does both, but not to the same list — the source produces and the
  destination consumes, so each gets its own wildcard.
- No method body changes. Only the parameter types.

## Solution
```java
static double total(List<? extends Number> numbers) {
    double sum = 0;
    for (Number n : numbers) {
        sum += n.doubleValue();
    }
    return sum;
}

static void addSquares(List<? super Integer> sink, int n) {
    for (int i = 1; i <= n; i++) {
        sink.add(i * i);
    }
}

static <T> void copyInto(List<? extends T> source, List<? super T> destination) {
    for (T item : source) {
        destination.add(item);
    }
}
```

## Notes
Every body is unchanged, which is the point: PECS is about what a signature
*permits*, not about what the code does. The starters were always capable of
handling these calls; they simply refused to be given them.

`total(List.of(1, 2, 3))` is the clearest case. `List.of(1, 2, 3)` is a
`List<Integer>`, and a `List<Integer>` is not a `List<Number>` — invariance —
so the original signature rejects a call that could not possibly go wrong,
because the method only reads.

`addSquares` widening to `? super Integer` is what lets the same method fill a
`List<Integer>`, a `List<Number>` and a `List<Object>`. All three can hold an
`Integer`; only the first was allowed before.

`copyInto` shows why the two wildcards are not redundant with each other. With
`List<T>` on both sides, `T` must be the same type in both, so copying a
`List<String>` into a `List<Object>` was impossible. With the wildcards, `T` is
inferred as `String` for the source and the destination merely has to hold one.

A useful way to check a signature: ask what the method does with the parameter,
not what it is called with. If a value only ever flows *out* of it, extends. If
values only ever flow *in*, super. If both, no wildcard — and if that feels
restrictive, the method is probably doing two jobs.
