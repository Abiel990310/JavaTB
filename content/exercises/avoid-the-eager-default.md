---
id: avoid-the-eager-default
title: "Do not compute what you will throw away"
difficulty: intro
chapter: null-and-optional
topics: [Optional, evaluation]
check: unit
standard: java21
---

`settingOr` returns a configuration value if it is present, and otherwise loads
a default — which is expensive, and is counted here so you can see how often it
happens.

Fix it so that the expensive default is computed **only when it is actually
needed**. The returned values are already correct; what is wrong is how much
work happens to produce them.

`loadExpensiveDefault()` increments `loadCount` each time it runs. The checks
inspect that counter.

## Starter
```java
static int loadCount = 0;

static String loadExpensiveDefault() {
    loadCount++;
    return "default";
}

static String settingOr(Optional<String> configured) {
    return configured.orElse(loadExpensiveDefault());
}
```

## Tests
```java
loadCount = 0;
checkEq(settingOr(Optional.of("configured")), "configured");
checkEq(loadCount, 0);

checkEq(settingOr(Optional.empty()), "default");
checkEq(loadCount, 1);

loadCount = 0;
for (int i = 0; i < 5; i++) {
    settingOr(Optional.of("present"));
}
checkEq(loadCount, 0);

for (int i = 0; i < 3; i++) {
    settingOr(Optional.empty());
}
checkEq(loadCount, 3);
```

## Hints
- The returned values are already right. Only `loadCount` is wrong.
- `orElse` takes a value, so its argument is evaluated before the call — every
  time, present or not.
- `orElseGet` takes a function and calls it only when there is nothing.
- `Main::loadExpensiveDefault` is a method reference to a no-argument method.

## Solution
```java
static int loadCount = 0;

static String loadExpensiveDefault() {
    loadCount++;
    return "default";
}

static String settingOr(Optional<String> configured) {
    return configured.orElseGet(Main::loadExpensiveDefault);
}
```

## Notes
Nothing about the starter's *answers* is wrong. Every call returns the correct
string, every test of the return value passes, and a code review would very
likely let it through. The only symptom is work done and discarded — five
lookups of a configured value performing five pointless loads.

This is why the bug survives. It is invisible unless something counts, which is
what `loadCount` is doing here and what a profiler does in real life. Swap
`loadExpensiveDefault` for a database query in a request handler and the cost
becomes a load-test result nobody can explain.

The mechanism is chapter 1.4's, not `Optional`'s. Java evaluates arguments
before entering a method, so by the time `orElse` runs, the default already
exists. `orElseGet` takes a `Supplier` — a function to call — so the decision
about whether to do the work moves inside, where the answer is known.

The same distinction appears throughout the library once you know to look for
it, and always with the same naming convention: a method taking a value does
the work eagerly, and its `...Get` or supplier-taking sibling defers it.
`Objects.requireNonNullElse` and `requireNonNullElseGet` are the same pair;
`Optional.orElseThrow(Supplier)` defers constructing the exception, which
matters because building an exception captures a stack trace and is not cheap.
