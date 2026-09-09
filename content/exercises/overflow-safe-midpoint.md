---
id: overflow-safe-midpoint
title: "A midpoint that survives large inputs"
difficulty: core
chapter: values-and-variables
topics: [integers, overflow]
check: unit
standard: java21
---

Write `midpoint(int lo, int hi)`, returning the integer midway between `lo` and
`hi`, rounded down. You may assume `lo <= hi`.

The obvious answer is `(lo + hi) / 2`, and it is what the starter does. It is
also wrong, and it was wrong in the JDK's own binary search for nine years
before anyone noticed. Your job is to find the input that breaks it and write a
version that does not.

`midpoint` must work for every pair of ints with `lo <= hi`, including values
near `Integer.MAX_VALUE`. It must not use `long`, `BigInteger`, or anything
else wider than `int` — the point is to fix the arithmetic, not to escape it.

## Starter
```java
static int midpoint(int lo, int hi) {
    return (lo + hi) / 2;
}
```

## Tests
```java
checkEq(midpoint(0, 10), 5);
checkEq(midpoint(3, 4), 3);
checkEq(midpoint(7, 7), 7);
checkEq(midpoint(-10, 10), 0);
checkEq(midpoint(-9, -1), -5);
checkEq(midpoint(2000000000, 2000000010), 2000000005);
checkEq(midpoint(Integer.MAX_VALUE - 1, Integer.MAX_VALUE), Integer.MAX_VALUE - 1);
check(midpoint(Integer.MAX_VALUE, Integer.MAX_VALUE) == Integer.MAX_VALUE);
```

## Hints
- Work out what `lo + hi` is when both are near two billion, before the
  division ever runs.
- You want the distance between them, not their total. The distance always
  fits.
- `lo + (hi - lo) / 2`. Convince yourself `hi - lo` cannot overflow when
  `lo <= hi` and both are ints.

## Solution
```java
static int midpoint(int lo, int hi) {
    return lo + (hi - lo) / 2;
}
```

## Notes
`(lo + hi)` overflows whenever the sum exceeds `Integer.MAX_VALUE`, and the
wrapped result is negative, so the division produces a number nowhere near
either input. In a binary search that means an index outside the array, and the
symptom is an `ArrayIndexOutOfBoundsException` that only appears on very large
inputs — which is precisely why `java.util.Arrays.binarySearch` shipped with
this bug from 1997 until 2006.

`lo + (hi - lo) / 2` is safe because `hi - lo` is a non-negative number no
larger than the distance between the two, which always fits in an `int` when
both operands are ints and `lo <= hi`. Adding half of it back to `lo` cannot
exceed `hi`.

Note what the fix is *not*: making the parameters `long` would work here but
only moves the edge, and it changes the method's signature to solve an
arithmetic problem. The bit-twiddling form `(lo + hi) >>> 1` — which is what the
JDK actually uses — also survives the overflow, because the unsigned shift
reinterprets the wrapped bit pattern correctly. But it is only correct when the
sum is non-negative. On `midpoint(-9, -1)` it returns 2,147,483,643 instead of
−5, because `-10 >>> 1` treats the sign bit as an ordinary value bit. That is
fine in `binarySearch`, where indices are never negative, and wrong here. The
JDK's fix is correct in its context rather than in general, which is worth
noticing before you copy a trick out of the standard library.
