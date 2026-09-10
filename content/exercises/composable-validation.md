---
id: composable-validation
title: "Validation you can compose"
difficulty: stretch
chapter: lambdas
topics: [lambdas, functional-interfaces, composition]
check: unit
standard: java21
---

`Predicate` answers yes or no, which is not enough for a form: when the answer
is no, the user needs to know why, and needs to hear about *every* problem at
once rather than one per submission.

Build a small validator around a functional interface of your own.

Declare `Validator<T>` with one abstract method
`List<String> problems(T value)` — an empty list means valid — and give it
these `default` methods:

- `default boolean isValid(T value)`
- `default Validator<T> and(Validator<T> other)` — reports the problems from
  both, in order, with no duplicates removed

Then three static factories:

- `static <T> Validator<T> rule(Predicate<T> test, String message)` — no
  problems when `test` passes, otherwise the one message
- `static <T> Validator<T> notNull(String message)` — the only validator
  allowed to see a `null`; every validator built by `rule` must report nothing
  for `null` rather than throwing
- `static <T, U> Validator<T> on(Function<T, U> part, Validator<U> inner)` —
  applies `inner` to a piece of a larger value

Mark the interface `@FunctionalInterface`; if your `default` methods are right
it will still compile.

## Starter
```java
@FunctionalInterface
interface Validator<T> {
    List<String> problems(T value);
}

static <T> Validator<T> rule(Predicate<T> test, String message) {
    return value -> test.test(value) ? List.of() : List.of(message);
}

static <T> Validator<T> notNull(String message) {
    return value -> List.of();
}

static <T, U> Validator<T> on(Function<T, U> part, Validator<U> inner) {
    return value -> List.of();
}
```

## Tests
```java
Validator<String> nonEmpty = rule(s -> !s.isEmpty(), "must not be empty");
Validator<String> shortEnough = rule(s -> s.length() <= 5, "too long");

checkEq(nonEmpty.problems("hi"), List.of());
check(nonEmpty.isValid("hi"));
checkEq(nonEmpty.problems(""), List.of("must not be empty"));
check(!nonEmpty.isValid(""));

Validator<String> both = nonEmpty.and(shortEnough);
checkEq(both.problems("hi"), List.of());
checkEq(both.problems(""), List.of("must not be empty"));
checkEq(both.problems("far too long"), List.of("too long"));

// Order is the order of composition, and nothing is dropped.
Validator<String> alwaysA = rule(s -> false, "a");
Validator<String> alwaysB = rule(s -> false, "b");
Validator<String> noisy = alwaysA.and(alwaysB).and(alwaysA);
checkEq(noisy.problems("x"), List.of("a", "b", "a"));

// A rule never sees null; notNull is what reports it.
checkEq(nonEmpty.problems(null), List.of());
Validator<String> present = notNull("required");
Validator<String> required = present.and(nonEmpty);
checkEq(required.problems(null), List.of("required"));
checkEq(required.problems(""), List.of("must not be empty"));
checkEq(required.problems("ok"), List.of());

// Validating a part of a bigger value.
Validator<int[]> firstIsPositive = on(pair -> pair[0], rule(n -> n > 0, "first must be positive"));
Validator<int[]> secondIsPositive = on(pair -> pair[1], rule(n -> n > 0, "second must be positive"));
Validator<int[]> pairOk = firstIsPositive.and(secondIsPositive);

checkEq(pairOk.problems(new int[] { 1, 2 }), List.of());
checkEq(pairOk.problems(new int[] { 0, 2 }), List.of("first must be positive"));
checkEq(pairOk.problems(new int[] { 0, 0 }),
        List.of("first must be positive", "second must be positive"));

// The result is a real List; the caller must not be able to corrupt the rules.
List<String> reported = pairOk.problems(new int[] { 0, 0 });
checkEq(reported.size(), 2);
checkThrows(UnsupportedOperationException.class, () -> reported.add("extra"));

// Composition is lazy: nothing runs until problems() is called.
int[] calls = { 0 };
Validator<String> counting = value -> { calls[0]++; return List.of(); };
Validator<String> composed = counting.and(counting).and(counting);
checkEq(calls[0], 0);
composed.problems("x");
checkEq(calls[0], 3);
```

## Hints
- `and` returns a lambda that calls both sides and concatenates. Build an
  `ArrayList`, `addAll` from each, and return
  `Collections.unmodifiableList(...)` — or `List.copyOf(...)`, which copies and
  freezes in one call.
- `rule` must skip a `null`: `value == null || test.test(value)` gives no
  problems for null and defers to the test otherwise.
- `notNull` is `value -> value == null ? List.of(message) : List.of()`.
- `on` extracts and delegates: `value -> inner.problems(part.apply(value))`.
- `default` methods do not count towards the one-abstract-method rule, so
  `isValid` and `and` can both be defaults on a `@FunctionalInterface`.
- `isValid` is `problems(value).isEmpty()`.

## Solution
```java
@FunctionalInterface
interface Validator<T> {
    List<String> problems(T value);

    default boolean isValid(T value) {
        return problems(value).isEmpty();
    }

    default Validator<T> and(Validator<T> other) {
        return value -> {
            List<String> all = new ArrayList<>(problems(value));
            all.addAll(other.problems(value));
            return List.copyOf(all);
        };
    }
}

static <T> Validator<T> rule(Predicate<T> test, String message) {
    return value -> value == null || test.test(value) ? List.of() : List.of(message);
}

static <T> Validator<T> notNull(String message) {
    return value -> value == null ? List.of(message) : List.of();
}

static <T, U> Validator<T> on(Function<T, U> part, Validator<U> inner) {
    return value -> inner.problems(part.apply(value));
}
```

## Notes
The abstract method is `List<String> problems(T)` — one method, so a lambda can
implement it, and the tests do exactly that with
`value -> { calls[0]++; return List.of(); }`. The two `default` methods do not
count, which is what makes this pattern possible at all: `Comparator`,
`Predicate` and `Function` are built the same way, one abstract method carrying
a shelf of composition helpers around it.

Notice what `and` captures. Inside a `default` method, `this` is the validator
the method was called on, so the bare `problems(value)` in `and`'s lambda means
`this.problems(value)` — the enclosing validator, per the chapter's rule about
`this` in a lambda. `other` is a parameter and effectively final. The returned
lambda holds both and does nothing until someone calls it, which is what the
laziness test checks: three `and` calls, zero invocations.

The null rule is a design decision rather than a discovery. Every validator
built by `rule` treats `null` as "not my problem", so a missing field produces
exactly one message — `required` — instead of one from every rule that tried to
call a method on it. Compare it with the alternative where each rule
null-checks itself: same behaviour, written out five times, and wrong the first
time someone forgets. Chapter 3.4's argument that `null` deserves a single
designated handler is this, applied to one interface.

`List.copyOf` rather than returning the mutable `ArrayList` is the same
defensive-copy move as chapter 2.2. Without it, a caller holding the returned
list could add to it, and since `and` builds a fresh list per call the damage
would be confusing rather than dramatic — which is worse. `List.copyOf` also
means the empty case shares the canonical empty list and allocates nothing.

The last piece, `on`, is the one that scales. A validator for a whole record is
`on(Order::customer, customerValidator).and(on(Order::total, positive))`, and
each part's validator knows nothing about the whole. That composability is the
reason to build this on a functional interface rather than a class hierarchy of
`AbstractValidator` subclasses: every one of these combinators is a lambda over
values you already have.
