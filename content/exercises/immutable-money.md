---
id: immutable-money
title: "Money that cannot change"
difficulty: core
chapter: aliasing
topics: [immutability, classes]
check: unit
standard: java21
---

Write an immutable `Money` class holding an amount in whole pence.

It needs:

- a constructor taking the number of pence
- `pence()` returning it
- `plus(Money other)` returning a **new** `Money` for the total
- `times(int n)` returning a **new** `Money` for the multiple

No method may change an existing `Money`. Adding to a `Money` must leave the
original exactly as it was — that is what the checks are testing.

Pence rather than pounds, and `long` rather than `double`, for the reason
chapter 1.2 gave: money in a floating-point type is money that does not add up.

## Starter
```java
static class Money {
    private long pence;

    Money(long pence) {
        this.pence = pence;
    }

    long pence() {
        return pence;
    }

    Money plus(Money other) {
        this.pence += other.pence;
        return this;
    }

    Money times(int n) {
        this.pence *= n;
        return this;
    }
}
```

## Tests
```java
Money fiver = new Money(500);
Money tenner = new Money(1000);

Money total = fiver.plus(tenner);
checkEq(total.pence(), 1500);
checkEq(fiver.pence(), 500);
checkEq(tenner.pence(), 1000);

Money doubled = fiver.times(2);
checkEq(doubled.pence(), 1000);
checkEq(fiver.pence(), 500);

Money chained = new Money(100).plus(new Money(200)).times(3);
checkEq(chained.pence(), 900);

Money zero = new Money(0);
checkEq(zero.plus(fiver).pence(), 500);
checkEq(zero.pence(), 0);
```

## Hints
- The starter's `plus` changes the receiver and hands it back, so `fiver` is no
  longer five pounds afterwards.
- Neither method should assign to a field. Both should end in `new Money(...)`.
- Make the field `final`. The compiler will then reject any method that tries
  to modify it, which turns the rule into something you cannot forget.

## Solution
```java
static class Money {
    private final long pence;

    Money(long pence) {
        this.pence = pence;
    }

    long pence() {
        return pence;
    }

    Money plus(Money other) {
        return new Money(pence + other.pence);
    }

    Money times(int n) {
        return new Money(pence * n);
    }
}
```

## Notes
The starter is a *mutable* class with an API that looks immutable. Returning
`this` from `plus` makes it chain like a builder, so `a.plus(b).times(3)` reads
correctly and quietly rewrites `a` twice along the way. Code that stored a
`Money` and expected it to stay put now has a different amount and no
explanation.

Making the field `final` is what converts the convention into a guarantee: with
`private final long pence`, the starter's `this.pence += ...` stops compiling.
That is the real reason to mark fields final — not the negligible optimisation,
but that the compiler starts enforcing the design decision on every future
edit, including the ones made by someone who has not read this problem.

Note that `plus` reads `other.pence` directly rather than calling
`other.pence()`. Private access is per *class*, not per object, so one `Money`
can see another's fields. That is what makes methods taking a second instance
of the same type read naturally.

There is nothing to defend here, in the chapter's sense: the only field is a
primitive, so no reference escapes and no copy is needed. Had it held a
`String` it would still be fine, since strings are immutable too. It is only
when a field points at something mutable — an array, a list, a date object of
the old kind — that immutability of the container requires copying at the
boundaries.
