---
id: choose-the-signature
title: "Three failures, three mechanisms"
difficulty: core
chapter: designing-failure
topics: [design, exceptions, Optional]
check: unit
standard: java21
---

Three operations fail in three different ways, and each should report it
differently. The starter reports all three the same way — by throwing — which
is right for exactly one of them.

- **`integerSquareRoot(int n)`** — returns the integer square root, rounded
  down. A negative input is a caller bug: nothing produces one legitimately.
  **Throw `IllegalArgumentException`** with the message `negative: N`.
- **`lookup(Map<String, String> m, String key)`** — a missing key is an
  ordinary outcome, and the reason is never in doubt. **Return
  `Optional<String>`.**
- **`parseAge(String text)`** — several distinguishable failures, and a caller
  showing a form needs to know which. **Return a result type**: `Valid(int
  age)` or `Invalid(String reason)`, with the reasons `empty`, `not a number`
  and `out of range` for anything below 0 or above 150.

`Age`, `Valid` and `Invalid` are given.

## Starter
```java
sealed interface Age permits Valid, Invalid { }
record Valid(int age) implements Age { }
record Invalid(String reason) implements Age { }

static int integerSquareRoot(int n) {
    return (int) Math.sqrt(n);
}

static String lookup(Map<String, String> m, String key) {
    String value = m.get(key);
    if (value == null) {
        throw new NoSuchElementException("missing: " + key);
    }
    return value;
}

static Age parseAge(String text) {
    return new Valid(Integer.parseInt(text));
}
```

## Tests
```java
checkEq(integerSquareRoot(16), 4);
checkEq(integerSquareRoot(17), 4);
checkEq(integerSquareRoot(0), 0);
checkThrows(IllegalArgumentException.class, () -> integerSquareRoot(-1));

Map<String, String> m = new HashMap<>();
m.put("a", "alpha");
checkEq(lookup(m, "a"), Optional.of("alpha"));
checkEq(lookup(m, "z"), Optional.empty());
checkEq(lookup(m, "z").orElse("fallback"), "fallback");

checkEq(parseAge("30"), new Valid(30));
checkEq(parseAge("0"), new Valid(0));
checkEq(parseAge("150"), new Valid(150));
checkEq(parseAge(""), new Invalid("empty"));
checkEq(parseAge("abc"), new Invalid("not a number"));
checkEq(parseAge("-1"), new Invalid("out of range"));
checkEq(parseAge("151"), new Invalid("out of range"));
```

## Hints
- `integerSquareRoot` is the one the starter gets right in spirit — it just
  needs to reject negatives explicitly rather than returning 0 from
  `Math.sqrt(-1)`, which is `NaN` cast to `int`.
- `lookup` should return `Optional.ofNullable(m.get(key))` and stop throwing.
- `parseAge` needs a `try`/`catch` for the number, a check for empty first, and
  a range check after parsing.

## Solution
```java
sealed interface Age permits Valid, Invalid { }
record Valid(int age) implements Age { }
record Invalid(String reason) implements Age { }

static int integerSquareRoot(int n) {
    if (n < 0) {
        throw new IllegalArgumentException("negative: " + n);
    }
    return (int) Math.sqrt(n);
}

static Optional<String> lookup(Map<String, String> m, String key) {
    return Optional.ofNullable(m.get(key));
}

static Age parseAge(String text) {
    if (text == null || text.isEmpty()) {
        return new Invalid("empty");
    }
    int age;
    try {
        age = Integer.parseInt(text);
    } catch (NumberFormatException e) {
        return new Invalid("not a number");
    }
    if (age < 0 || age > 150) {
        return new Invalid("out of range");
    }
    return new Valid(age);
}
```

## Notes
Note what `integerSquareRoot(-1)` does in the starter: `Math.sqrt(-1)` is
`NaN`, and casting `NaN` to `int` gives `0`. So it does not throw and does not
fail — it returns a plausible wrong answer, which is the worst of the three
outcomes. Rejecting the input explicitly is the fix; relying on a downstream
operation to notice is not.

The three signatures now say three different things to a caller before any code
runs. `int` with an unchecked exception says "this always works if you use it
correctly". `Optional<String>` says "there may be nothing, and you must decide
what then". `Age` says "this can fail in ways you may want to distinguish".

That last one is the only signature that makes the failure impossible to
ignore: the caller's switch must be exhaustive, so there is no path that
forgets. `Optional` can be defeated with `.get()`, and an unchecked exception
can be dropped silently. Strength of guarantee runs in exactly the reverse
order to how commonly the three are used.

The order of checks inside `parseAge` matters. Empty is tested before parsing
because `Integer.parseInt("")` throws `NumberFormatException` and would be
reported as `not a number` — technically defensible and less useful to someone
filling in a form. Range is checked after parsing because there is no number to
range-check until then. Each guard belongs at the first point where its answer
is knowable.
