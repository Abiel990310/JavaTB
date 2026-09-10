---
id: reference-or-lambda
title: "When the reference is wrong"
difficulty: core
chapter: method-references
topics: [method-references, lambdas, capture]
check: unit
standard: java21
---

Every method below was written with a method reference, and three of them are
broken by it. Fix the broken ones; leave the correct ones alone.

- `static Supplier<Integer> sizeOf(List<?> list)` — reports the list's size
  *at the time it is called*, not at the time the supplier was made
- `static Supplier<String> reportFrom(StringBuilder log)` — likewise, the log's
  contents when asked
- `static Function<String, Integer> parser()` — parses a decimal `int`
- `static Supplier<Integer> lengthOrZero(String text)` — `text.length()`, or
  `0` when `text` is `null`, and building the supplier must never throw
- `static <T> Predicate<T> isPresent()` — true when the value is not `null`
- `static Comparator<String> byLengthThenText()` — shortest first, ties broken
  alphabetically, with no boxing in the length comparison

## Starter
```java
static Supplier<Integer> sizeOf(List<?> list) {
    return list::size;
}

static Supplier<String> reportFrom(StringBuilder log) {
    return log.toString()::toString;
}

static Function<String, Integer> parser() {
    return Integer::parseInt;
}

static Supplier<Integer> lengthOrZero(String text) {
    return text::length;
}

static <T> Predicate<T> isPresent() {
    return Objects::nonNull;
}

static Comparator<String> byLengthThenText() {
    return Comparator.comparing(String::length).thenComparing(Comparator.naturalOrder());
}
```

## Tests
```java
List<String> names = new ArrayList<>();
Supplier<Integer> size = sizeOf(names);
checkEq(size.get(), 0);
names.add("a");
names.add("b");
checkEq(size.get(), 2);

StringBuilder log = new StringBuilder();
Supplier<String> report = reportFrom(log);
checkEq(report.get(), "");
log.append("one");
checkEq(report.get(), "one");
log.append("/two");
checkEq(report.get(), "one/two");

checkEq(parser().apply("42"), 42);
checkEq(parser().apply("-7"), -7);
checkThrows(NumberFormatException.class, () -> parser().apply("x"));

checkEq(lengthOrZero("hello").get(), 5);
checkEq(lengthOrZero("").get(), 0);
// Building it must not throw, even for null.
Supplier<Integer> ofNull = lengthOrZero(null);
checkEq(ofNull.get(), 0);

Predicate<String> present = isPresent();
check(present.test("x"));
check(!present.test(null));

Comparator<String> order = byLengthThenText();
List<String> words = new ArrayList<>(List.of("pear", "fig", "kiwi", "date", "up"));
words.sort(order);
checkEq(words, List.of("up", "fig", "date", "kiwi", "pear"));
checkEq(order.compare("aa", "b"), 1);
checkEq(order.compare("aa", "ab"), -1);
checkEq(order.compare("aa", "aa"), 0);
```

## Hints
- `list::size` fixes the *receiver*, not the answer — `list` is never
  reassigned, so this one is already correct. Read it twice before changing it.
- `log.toString()::toString` evaluates `log.toString()` immediately and binds
  the reference to that snapshot. What you want is a lambda.
- `text::length` throws a `NullPointerException` on the line that creates it,
  before anything is called.
- `Objects::nonNull` is a static reference with nothing to capture — correct as
  written.
- `Comparator.comparing` boxes the `int` it is handed; the non-boxing spelling
  is `Comparator.comparingInt`.

## Solution
```java
static Supplier<Integer> sizeOf(List<?> list) {
    return list::size;
}

static Supplier<String> reportFrom(StringBuilder log) {
    return log::toString;
}

static Function<String, Integer> parser() {
    return Integer::parseInt;
}

static Supplier<Integer> lengthOrZero(String text) {
    return () -> text == null ? 0 : text.length();
}

static <T> Predicate<T> isPresent() {
    return Objects::nonNull;
}

static Comparator<String> byLengthThenText() {
    return Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder());
}
```

## Notes
The three broken ones each break for a different reason, and only one of them
is about method references being *wrong*.

`reportFrom` is the real trap. `log.toString()::toString` is a bound reference
whose receiver expression is `log.toString()` — a `String`, computed once, on
the spot. Every later `get()` returns that frozen snapshot. It even reads
plausibly, which is what makes it dangerous. `log::toString` binds to the
builder instead, and the builder is the thing that changes.

`sizeOf` is the control. It looks like the same mistake and is not: `list::size`
captures the `List` object, and the object's size is a property read at call
time. What a bound reference freezes is *which object*, not *what that object
currently contains*. Chapter 2.2's variable-versus-object distinction decides
the answer here too. If `sizeOf` had been written to reassign `list`, the
compiler would have stopped you — captured variables must be effectively final.

`lengthOrZero` cannot be a reference at all, because the null check has to
happen at call time and a reference has nowhere to put it. The
`NullPointerException` from `text::length` lands on the assignment line with a
`null` message, which is a genuinely confusing stack trace the first time you
see it.

`byLengthThenText` works either way; the fix is about allocation, not
correctness. `Comparator.comparing(String::length)` adapts the reference to
`Function<String, Integer>`, so every comparison boxes two `int`s — and a sort
does *n* log *n* comparisons. `comparingInt` takes a `ToIntFunction<String>`
and boxes nothing. The two lines are one word apart and the reference text is
identical, which is why this one is worth memorising rather than deriving:
whenever the key is an `int`, `long` or `double`, there is a `comparingInt`,
`comparingLong` or `comparingDouble` waiting.
