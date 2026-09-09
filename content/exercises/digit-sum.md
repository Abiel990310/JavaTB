---
id: digit-sum
title: "Sum of the digits"
difficulty: core
chapter: methods
topics: [recursion, methods]
check: unit
standard: java21
---

Write `digitSum(int n)`, returning the sum of the decimal digits of `n`.

`digitSum(1234)` is `1 + 2 + 3 + 4`, which is `10`. A single-digit number is
its own digit sum, and `digitSum(0)` is `0`. You may assume `n` is not
negative.

Write it recursively: a base case that returns without calling itself, and one
step that makes the problem strictly smaller.

## Starter
```java
static int digitSum(int n) {
    return n % 10;
}
```

## Tests
```java
checkEq(digitSum(0), 0);
checkEq(digitSum(7), 7);
checkEq(digitSum(10), 1);
checkEq(digitSum(1234), 10);
checkEq(digitSum(999), 27);
checkEq(digitSum(1000000), 1);
checkEq(digitSum(2147483647), 46);
```

## Hints
- `n % 10` is the last digit. What operation removes it?
- `1234 / 10` is `123`, because integer division truncates — chapter 1.2.
- Base case: when `n` is below 10 it is already a single digit, so return it.
  Otherwise return the last digit plus the digit sum of what is left.

## Solution
```java
static int digitSum(int n) {
    if (n < 10) {
        return n;
    }
    return n % 10 + digitSum(n / 10);
}
```

## Notes
The starter returns only the last digit, which is right for every single-digit
input and wrong for everything else — so `digitSum(7)` passes and misleads you
while `digitSum(10)` fails.

The pair `n % 10` and `n / 10` is the whole trick: one takes the last digit,
the other removes it. Both rely on integer division truncating rather than
rounding, which is why `1234 / 10` is `123` and not `123.4`.

The base case is `n < 10` rather than `n == 0`. Either terminates, but `n == 0`
makes an extra call for every number and then has to be careful that
`digitSum(0)` returns 0 rather than recursing forever. Prefer the base case
that describes when the answer is already known.

Recursion is safe here in a way it often is not: each step divides by ten, so
even `Integer.MAX_VALUE` is only ten frames deep. Compare that with recursing
once per element of a list, where the depth is the size of the input and a
large enough input becomes a `StackOverflowError`. Depth proportional to the
*logarithm* of the input is fine; depth proportional to the input is a loop
wearing a disguise.
