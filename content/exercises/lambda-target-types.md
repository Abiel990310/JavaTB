---
id: lambda-target-types
title: "Pick the target type"
difficulty: core
chapter: lambdas
topics: [lambdas, functional-interfaces, boxing]
check: unit
standard: java21
---

A lambda has no type until something gives it one. These methods each take or
return a functional interface; fill in the bodies, choosing the built-in
interface the signature already names.

- `static <T, R> List<R> mapAll(List<T> values, Function<T, R> mapper)`
- `static <T> List<T> keep(List<T> values, Predicate<T> test)` — order preserved
- `static <T> T orElseGet(T value, Supplier<T> fallback)` — returns `value`
  unless it is `null`, and must **not** call `fallback` otherwise
- `static int[] mapInts(int[] values, IntUnaryOperator op)` — a new array, no
  boxing anywhere
- `static <T> Predicate<T> neither(Predicate<T> a, Predicate<T> b)` — true when
  both `a` and `b` are false, and must not call `b` when `a` already answered

The last two are the interesting ones: one is about not boxing, the other about
not evaluating.

## Starter
```java
static <T, R> List<R> mapAll(List<T> values, Function<T, R> mapper) {
    return List.of();
}

static <T> List<T> keep(List<T> values, Predicate<T> test) {
    return List.of();
}

static <T> T orElseGet(T value, Supplier<T> fallback) {
    return fallback.get();
}

static int[] mapInts(int[] values, IntUnaryOperator op) {
    return new int[0];
}

static <T> Predicate<T> neither(Predicate<T> a, Predicate<T> b) {
    return value -> false;
}
```

## Tests
```java
checkEq(mapAll(List.of("a", "bb", "ccc"), String::length), List.of(1, 2, 3));
checkEq(mapAll(List.of(1, 2, 3), n -> n * 10), List.of(10, 20, 30));
checkEq(mapAll(List.of(), n -> n), List.of());

checkEq(keep(List.of(1, 2, 3, 4, 5), n -> n % 2 == 1), List.of(1, 3, 5));
checkEq(keep(List.of("ab", "c"), s -> s.length() > 1), List.of("ab"));
checkEq(keep(List.of(1, 2), n -> false), List.of());

checkEq(orElseGet("here", () -> "fallback"), "here");
checkEq(orElseGet(null, () -> "fallback"), "fallback");

// The fallback is lazy: it must not run when the value is present.
int[] calls = { 0 };
checkEq(orElseGet("here", () -> { calls[0]++; return "fallback"; }), "here");
checkEq(calls[0], 0);
checkEq(orElseGet(null, () -> { calls[0]++; return "fallback"; }), "fallback");
checkEq(calls[0], 1);

checkEq(Arrays.toString(mapInts(new int[] { 1, 2, 3 }, n -> n * n)), "[1, 4, 9]");
checkEq(Arrays.toString(mapInts(new int[0], n -> n)), "[]");

int[] source = { 1, 2 };
int[] mapped = mapInts(source, n -> n + 1);
mapped[0] = 99;
checkEq(source[0], 1);

Predicate<String> empty = String::isEmpty;
Predicate<String> shout = s -> s.endsWith("!");
Predicate<String> plain = neither(empty, shout);
check(plain.test("hello"));
check(!plain.test(""));
check(!plain.test("hey!"));

// Short-circuit: when the first predicate says true, the second is not asked.
int[] asked = { 0 };
Predicate<String> counting = s -> { asked[0]++; return false; };
checkEq(neither(s -> true, counting).test("x"), false);
checkEq(asked[0], 0);
checkEq(neither(s -> false, counting).test("x"), true);
checkEq(asked[0], 1);
```

## Hints
- `mapAll` and `keep` are ordinary loops over `values`, building an
  `ArrayList<>` and returning it.
- `orElseGet` must test `value == null` *before* touching `fallback`. Calling
  `fallback.get()` and then choosing is the bug the laziness test catches.
- `mapInts` takes `IntUnaryOperator`, whose method is
  `int applyAsInt(int)` — not `apply`.
- `neither(a, b)` returns a lambda that runs later. Inside it, `!a.test(v) &&
  !b.test(v)` gives you the short-circuit for free, because `&&` already has
  one.

## Solution
```java
static <T, R> List<R> mapAll(List<T> values, Function<T, R> mapper) {
    List<R> result = new ArrayList<>(values.size());
    for (T value : values) {
        result.add(mapper.apply(value));
    }
    return result;
}

static <T> List<T> keep(List<T> values, Predicate<T> test) {
    List<T> result = new ArrayList<>();
    for (T value : values) {
        if (test.test(value)) {
            result.add(value);
        }
    }
    return result;
}

static <T> T orElseGet(T value, Supplier<T> fallback) {
    return value != null ? value : fallback.get();
}

static int[] mapInts(int[] values, IntUnaryOperator op) {
    int[] result = new int[values.length];
    for (int i = 0; i < values.length; i++) {
        result[i] = op.applyAsInt(values[i]);
    }
    return result;
}

static <T> Predicate<T> neither(Predicate<T> a, Predicate<T> b) {
    return value -> !a.test(value) && !b.test(value);
}
```

## Notes
Four of these five bodies are the loop you would have written anyway. What the
functional interface changes is *who supplies the middle* — the caller does,
and they may supply anything.

`orElseGet` is where the shape starts earning its keep. Compare it with a
hypothetical `orElse(T value, T fallback)`: to call that, you must build the
fallback first, whether or not it is wanted. Taking a `Supplier<T>` moves the
decision inside, so the expensive default is only paid for when it is used.
This is exactly why `Optional` has both `orElse` and `orElseGet`, and why
`Map.computeIfAbsent` takes a function rather than a value — and why passing
`() -> expensive()` to `orElse` by mistake is a real performance bug that
compiles and tests clean.

`neither` returns a lambda rather than an answer. The captured `a` and `b` are
effectively final, so the returned object holds them and can be called any
number of times later. That is composition: `Predicate` has `and`, `or` and
`negate` built in, so the library's own spelling of this method is
`a.negate().and(b.negate())` — or, if you prefer De Morgan,
`a.or(b).negate()`. Both short-circuit for the same reason yours does.

`mapInts` is the boxing point. Written as `Function<Integer, Integer>` it would
box on every element, unbox to store, and allocate an `Integer` per value — the
chapter measured five to fifteen times the cost. `IntUnaryOperator` is `int` in,
`int` out, with no object anywhere. The awkward part is the method name:
`applyAsInt`, not `apply`, because erasure means `int apply(int)` and
`R apply(T)` cannot coexist as overrides. The name is ugly for a reason you now
know.
