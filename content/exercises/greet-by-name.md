---
id: greet-by-name
title: "Greet by name"
difficulty: intro
chapter: hello-jvm
topics: [methods, strings]
check: unit
standard: java21
---

Write a method `greet` that takes a name and returns a greeting.

`greet("Ada")` must return exactly `Hello, Ada!` — capital H, a comma, one
space, then the name, then an exclamation mark. An empty name is still a name:
`greet("")` returns `Hello, !`.

You are writing a method, not a program. There is no `main` here — the checks
below are run for you.

## Starter
```java
static String greet(String name) {
    return null;
}
```

## Tests
```java
checkEq(greet("Ada"), "Hello, Ada!");
checkEq(greet("Grace"), "Hello, Grace!");
checkEq(greet(""), "Hello, !");
checkEq(greet("Ada Lovelace"), "Hello, Ada Lovelace!");
```

## Hints
- Two strings are joined with `+`. The result is a new string; neither original
  is changed.
- Build the whole thing in one expression: something before the name, something
  after it.
- `"Hello, " + name + "!"` — mind the space after the comma.

## Solution
```java
static String greet(String name) {
    return "Hello, " + name + "!";
}
```

## Notes
`+` between strings is the one operator in Java that is overloaded, and it is
overloaded by the language rather than by anything you can write yourself.

What the compiler actually generates here is not a chain of concatenations. As
of Java 9 it emits a single `invokedynamic` instruction that hands the pieces
to a bootstrap method, which builds a formatter once and reuses it. You can see
that for yourself: the bytecode of any string concatenation shows
`makeConcatWithConstants` rather than a series of `StringBuilder.append` calls.

That matters later, in the loop chapter, where the distinction between one
concatenation and a concatenation *per iteration* is the difference between a
linear program and a quadratic one. One `+` is free. A `+=` inside a loop is
not.
