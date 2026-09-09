---
id: nearly-equal
title: "Comparing doubles honestly"
difficulty: intro
chapter: values-and-variables
topics: [floating-point, comparison]
check: unit
standard: java21
---

Write `nearlyEqual(double a, double b)`, returning `true` when the two values
are close enough to be treated as the same number, and `false` otherwise.

"Close enough" here means their difference is at most `1e-9`. That tolerance is
generous enough to absorb the rounding error from a handful of arithmetic
operations and tight enough that genuinely different numbers still compare as
different.

The starter compares with `==`, which is what the chapter told you never to do.
The checks below include `0.1 + 0.2`, so the starter fails immediately.

## Starter
```java
static boolean nearlyEqual(double a, double b) {
    return a == b;
}
```

## Tests
```java
check(nearlyEqual(0.1 + 0.2, 0.3));
check(nearlyEqual(1.0, 1.0));
check(nearlyEqual(0.0, 0.0));
check(nearlyEqual(-2.5, -2.5));
check(!nearlyEqual(1.0, 1.1));
check(!nearlyEqual(0.0, 1e-6));
check(nearlyEqual(1.0, 1.0 + 1e-12));
check(!nearlyEqual(Double.NaN, Double.NaN));
```

## Hints
- Subtract one from the other. How big is the result allowed to be?
- A difference can come out negative, and `-0.5` is not less than `1e-9` in the
  way you want. Take its magnitude.
- `Math.abs(a - b) <= 1e-9`. Then check what that does when either value is
  `NaN`.

## Solution
```java
static boolean nearlyEqual(double a, double b) {
    return Math.abs(a - b) <= 1e-9;
}
```

## Notes
The last check is the interesting one. `NaN` must not be nearly equal to
anything, including itself — and the solution gets that right without a special
case, because every comparison involving `NaN` is false. `NaN - NaN` is `NaN`,
`Math.abs(NaN)` is `NaN`, and `NaN <= 1e-9` is false. The standard's rule that
`NaN` compares false against everything, which looks like an oddity, is here
doing exactly the right thing for free.

Two limitations worth knowing, because this function is not a general answer:

A **fixed tolerance is an absolute one**. Comparing values in the billions,
`1e-9` is far smaller than the gap between adjacent doubles, so the function
degenerates into `==`. Comparing values around `1e-15`, it treats every value
as equal to every other. Production code that spans magnitudes uses a relative
tolerance — scaling the allowance by the size of the operands — or compares the
number of representable values between them.

And `Math.abs(a - b)` can itself overflow to `Infinity` when the two are at
opposite ends of the range. `Infinity <= 1e-9` is false, which is the answer
you wanted, so this one happens to be harmless — but it is worth noticing that
it happened rather than assuming the arithmetic in a comparison is safe just
because it is a comparison.
