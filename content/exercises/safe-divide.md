---
id: safe-divide
title: "Divide without crashing the caller"
difficulty: intro
chapter: exceptions
topics: [exceptions, try-catch]
check: unit
standard: java21
---

Write `divide(String a, String b)` returning the result of dividing the first
number by the second, as text — and describing the problem instead when it
cannot.

- `divide("10", "2")` returns `"5"`
- a value that is not a whole number returns `"not a number"`
- dividing by zero returns `"cannot divide by zero"`
- a `null` for either argument returns `"missing input"`

Integer division, so `divide("7", "2")` is `"3"`.

Three different failures, three different messages, and none of them may
escape as an exception — the method always returns a string.

## Starter
```java
static String divide(String a, String b) {
    return String.valueOf(Integer.parseInt(a) / Integer.parseInt(b));
}
```

## Tests
```java
checkEq(divide("10", "2"), "5");
checkEq(divide("7", "2"), "3");
checkEq(divide("-8", "4"), "-2");
checkEq(divide("0", "5"), "0");

checkEq(divide("10", "0"), "cannot divide by zero");
checkEq(divide("abc", "2"), "not a number");
checkEq(divide("10", "2.5"), "not a number");
checkEq(divide(null, "2"), "missing input");
checkEq(divide("10", null), "missing input");
checkEq(divide(null, null), "missing input");
```

## Hints
- `Integer.parseInt` throws `NumberFormatException` for text that is not a
  whole number — and also for `null`, which is why the null case needs
  handling first.
- Integer division by zero throws `ArithmeticException`. Floating-point
  division does not, as chapter 1.2 showed.
- Check for null explicitly, then wrap the rest in a `try` with two `catch`
  clauses.

## Solution
```java
static String divide(String a, String b) {
    if (a == null || b == null) {
        return "missing input";
    }
    try {
        return String.valueOf(Integer.parseInt(a) / Integer.parseInt(b));
    } catch (NumberFormatException e) {
        return "not a number";
    } catch (ArithmeticException e) {
        return "cannot divide by zero";
    }
}
```

## Notes
The null case is handled before the `try` rather than inside it, and that is
deliberate. `Integer.parseInt(null)` really does throw `NumberFormatException`
— with the message `Cannot parse null string: null` — so catching that alone
would report `"not a number"` for a null and never distinguish the two. Testing
first is both clearer and correct.

The two catch clauses are separate rather than a multi-catch, because they
produce different answers. Multi-catch is for failures that share a response;
these do not.

Order does not matter here, since `NumberFormatException` and
`ArithmeticException` are unrelated — neither is a subtype of the other. Had
one been, the compiler would have insisted on the narrower one first.

Worth noticing what this method has become: a function that never throws and
returns a string describing what happened. That is a legitimate design and it
has a cost — the caller now has to compare against three magic strings to find
out whether it worked, and nothing stops them forgetting. Chapter 3.5 is about
choosing between this, throwing, and returning a type that makes the failure
impossible to ignore, which is what `result-or-error` in chapter 2.11 built.
