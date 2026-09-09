---
id: days-in-month
title: "Days in a month"
difficulty: core
chapter: control-flow
topics: [switch, expressions]
check: unit
standard: java21
---

Write `daysInMonth(int month, boolean leapYear)`, returning the number of days
in that month. `month` is 1 for January through 12 for December. February has
29 days when `leapYear` is true and 28 when it is false.

For any `month` outside 1–12, return `-1`. Callers get to tell the difference
between "no days" and "not a month".

Write it as a **switch expression** — the form with arrows that produces a
value — rather than a chain of `if`s. The point of the exercise is that a month
maps to a number of days, and a construct that maps inputs to values says so
more directly than one that performs assignments.

## Starter
```java
static int daysInMonth(int month, boolean leapYear) {
    return 30;
}
```

## Tests
```java
checkEq(daysInMonth(1, false), 31);
checkEq(daysInMonth(2, false), 28);
checkEq(daysInMonth(2, true), 29);
checkEq(daysInMonth(4, false), 30);
checkEq(daysInMonth(9, true), 30);
checkEq(daysInMonth(12, false), 31);
checkEq(daysInMonth(0, false), -1);
checkEq(daysInMonth(13, false), -1);
checkEq(daysInMonth(-3, true), -1);
```

## Hints
- Seven months have 31 days, four have 30, and February is its own case. That
  is three cases, not twelve.
- One case can list several labels: `case 4, 6, 9, 11 -> 30;`.
- February depends on the second argument, so its arm needs an expression
  rather than a constant: `leapYear ? 29 : 28`.

## Solution
```java
static int daysInMonth(int month, boolean leapYear) {
    return switch (month) {
        case 1, 3, 5, 7, 8, 10, 12 -> 31;
        case 4, 6, 9, 11 -> 30;
        case 2 -> leapYear ? 29 : 28;
        default -> -1;
    };
}
```

## Notes
Four lines, and the shape of the answer is the shape of the fact: three groups
of months and everything else. The `if`-chain version is eleven comparisons
that a reader has to hold in their head to be sure no month was missed.

The `default` arm is not optional here. A switch expression must be exhaustive
— it has to produce a value for every possible `int`, and the twelve months
plainly do not — so removing it is a compile error rather than a bug found
later. That is the trade the expression form makes: it will not let you write
the version that silently returns nothing.

Note also what this method does *not* do: validate that a leap year was
declared correctly. `daysInMonth(2, true)` returns 29 whether or not the year
in question is really a leap year, because deciding that is a different job
with its own rules — divisible by 4, except centuries, except centuries
divisible by 400. Methods that do one thing are easier to get right, and
`java.time.Year.isLeap` already does the other one.
