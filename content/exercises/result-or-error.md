---
id: result-or-error
title: "A result that is one thing or the other"
difficulty: core
chapter: sealed-types
topics: [sealed, pattern matching, error handling]
check: unit
standard: java21
---

Model the outcome of parsing as a sealed type, so that a caller cannot forget
to handle failure.

`Parsed` permits exactly two kinds:

- `Ok(int value)`
- `Err(String message)`

Write two methods:

- `parse(String text)` — returns `Ok` with the number, or `Err` with the
  message `not a number: <text>` when it will not parse. An empty or null input
  gives `Err` with `empty input`.
- `describe(Parsed p)` — returns `"got 42"` for an `Ok(42)`, and
  `"failed: <message>"` for an `Err`. Use a switch expression with no
  `default`.

`Integer.parseInt` throws `NumberFormatException` on bad input. Catching it is
allowed and expected here — chapter 3 covers exceptions properly.

## Starter
```java
sealed interface Parsed permits Ok, Err { }

record Ok(int value) implements Parsed { }
record Err(String message) implements Parsed { }

static Parsed parse(String text) {
    return new Ok(Integer.parseInt(text));
}

static String describe(Parsed p) {
    return "";
}
```

## Tests
```java
checkEq(parse("42"), new Ok(42));
checkEq(parse("-7"), new Ok(-7));
checkEq(parse("0"), new Ok(0));

checkEq(parse("abc"), new Err("not a number: abc"));
checkEq(parse("4.5"), new Err("not a number: 4.5"));
checkEq(parse(""), new Err("empty input"));
checkEq(parse(null), new Err("empty input"));

checkEq(describe(new Ok(42)), "got 42");
checkEq(describe(new Err("boom")), "failed: boom");
checkEq(describe(parse("13")), "got 13");
checkEq(describe(parse("nope")), "failed: not a number: nope");
```

## Hints
- The starter's `parse` throws instead of returning an `Err`. Wrap the
  `parseInt` call in `try`/`catch` and return an `Err` from the catch block.
- Check for null and empty before parsing, and return the `empty input` error.
- `describe` is two cases: `case Ok(int v)` and `case Err(String m)`.
- `checkEq(parse("42"), new Ok(42))` compares with `equals`, which the record
  generates — so returning the right kind with the right contents is enough.

## Solution
```java
sealed interface Parsed permits Ok, Err { }

record Ok(int value) implements Parsed { }
record Err(String message) implements Parsed { }

static Parsed parse(String text) {
    if (text == null || text.isEmpty()) {
        return new Err("empty input");
    }
    try {
        return new Ok(Integer.parseInt(text));
    } catch (NumberFormatException e) {
        return new Err("not a number: " + text);
    }
}

static String describe(Parsed p) {
    return switch (p) {
        case Ok(int v) -> "got " + v;
        case Err(String m) -> "failed: " + m;
    };
}
```

## Notes
The point of returning a `Parsed` rather than throwing is that failure becomes
part of the type. A caller holding a `Parsed` cannot use the number without
first saying what happens when there isn't one — the switch will not compile
until both cases are covered, so there is no equivalent of ignoring a returned
error code.

That is worth weighing against an exception rather than treated as strictly
better, and chapter 3.5 does the weighing. Briefly: this shape suits failures
that are *expected* — parsing user input, looking something up that might be
absent — where the caller has a real decision to make. An exception suits
failures that are *exceptional*, where most callers can do nothing useful and
would only rethrow.

`checkEq(parse("42"), new Ok(42))` works because records generate `equals`. The
whole problem leans on chapter 2.9: without a generated `equals` every check
would be comparing object identity and failing.

`parse("4.5")` returning an error is worth noticing — `Integer.parseInt` rejects
a decimal point rather than truncating, which is the right behaviour and
surprises people who expect it to behave like a cast.

The `null` check comes first for a reason. `"".isEmpty()` is fine but
`null.isEmpty()` throws, and the order of `||` is what makes the combined
condition safe — Java evaluates the left side first and short-circuits, so the
second test never runs on a null. Chapter 3.4 has more to say about null than
this problem does.
