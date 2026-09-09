---
id: second-largest
title: "The second largest value"
difficulty: core
chapter: arrays
topics: [arrays, loops]
check: unit
standard: java21
---

Write `secondLargest(int[] xs)`, returning the second largest **distinct** value
in the array.

Distinct is the word doing the work. In `{5, 5, 3}` the largest value is 5 and
the second largest is 3, not 5 — duplicates of the maximum do not count as the
runner-up. You may assume the array contains at least two distinct values.

Do it in one pass, without sorting and without allocating anything.

## Starter
```java
static int secondLargest(int[] xs) {
    int largest = xs[0];
    for (int x : xs) {
        if (x > largest) {
            largest = x;
        }
    }
    return largest;
}
```

## Tests
```java
checkEq(secondLargest(new int[] { 1, 2, 3, 4 }), 3);
checkEq(secondLargest(new int[] { 4, 3, 2, 1 }), 3);
checkEq(secondLargest(new int[] { 5, 5, 3 }), 3);
checkEq(secondLargest(new int[] { 3, 5, 5 }), 3);
checkEq(secondLargest(new int[] { 2, 1 }), 1);
checkEq(secondLargest(new int[] { -5, -2, -9 }), -5);
checkEq(secondLargest(new int[] { 7, 7, 7, 2 }), 2);
checkEq(secondLargest(new int[] { Integer.MIN_VALUE, Integer.MAX_VALUE }), Integer.MIN_VALUE);
```

## Hints
- Track two values as you go, not one: the best so far and the best of the
  rest.
- When a new value beats the largest, the old largest becomes the second
  largest. When it only beats the second largest, just replace that.
- A value equal to the largest must update neither. That is what makes
  `{5, 5, 3}` work.
- Do not initialise either variable to `Integer.MIN_VALUE` and hope — the last
  check passes it in as a real value. Track whether you have found a second
  value yet instead of encoding that in the value.

## Solution
```java
static int secondLargest(int[] xs) {
    int largest = xs[0];
    int second = 0;
    boolean haveSecond = false;

    for (int x : xs) {
        if (x > largest) {
            second = largest;          // the old maximum slides down
            haveSecond = true;
            largest = x;
        } else if (x != largest && (!haveSecond || x > second)) {
            second = x;
            haveSecond = true;
        }
    }
    return second;
}
```

## Notes
The starter returns the largest — it answers a question one word away from the
one that was asked, and does it correctly. That is worth seeing, because it is
what a plausible-looking wrong function feels like from the inside.

Three details decide this problem:

**`x != largest` in the second branch.** Without it, `{7, 7, 7, 2}` returns 7:
the second and third sevens are not greater than `largest`, but they are
greater than `second`, so they get promoted. The word "distinct" in the
statement is this condition.

**A flag rather than a sentinel.** The obvious way to say "no second value yet"
is to start `second` at `Integer.MIN_VALUE`, and the last check passes exactly
that value in as real data. Any sentinel you invent is a value some input is
allowed to contain, so the absence has to be tracked separately —
`haveSecond` — rather than encoded in the number.

My own first attempt at this seeded `largest` and `second` from the first two
elements with `Math.max` and `Math.min`, which is tidy and wrong: on
`{5, 5, 3}` it seeds both to 5 and never recovers, because 3 is not greater
than the 5 sitting in `second`. It returned 7 for `{7, 7, 7, 2}` too. Seeding
from two elements quietly assumes those two are distinct.

**Both variables updating together.** When a new maximum arrives, the old
maximum has to slide down into `second` — forgetting that line gives you a
function that is right whenever the array happens to be in descending order,
which is exactly the shape of bug that survives a careless test.
