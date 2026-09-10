---
id: generic-pair
title: "A pair of two different types"
difficulty: intro
chapter: generic-classes
topics: [generics]
check: unit
standard: java21
---

Write a generic class `Pair<A, B>` holding one value of each type.

It needs:

- a constructor taking both
- `first()` and `second()`
- `swapped()` returning a `Pair<B, A>` with the two exchanged
- `equals`, `hashCode` and `toString`, with `toString` producing
  `Pair(left, right)`

The starter uses `Object` for both, so every caller has to cast — which is
what generics exist to remove.

## Starter
```java
static final class Pair {
    private final Object first;
    private final Object second;

    Pair(Object first, Object second) {
        this.first = first;
        this.second = second;
    }

    Object first() {
        return first;
    }

    Object second() {
        return second;
    }

    Pair swapped() {
        return new Pair(second, first);
    }
}
```

## Tests
```java
Pair<String, Integer> pair = new Pair<>("age", 36);

String name = pair.first();          // no cast
int value = pair.second();
checkEq(name, "age");
checkEq(value, 36);

Pair<Integer, String> flipped = pair.swapped();
checkEq(flipped.first(), 36);
checkEq(flipped.second(), "age");

checkEq(pair.toString(), "Pair(age, 36)");
checkEq(pair, new Pair<>("age", 36));
checkEq(pair.hashCode(), new Pair<>("age", 36).hashCode());
check(!pair.equals(new Pair<>("age", 37)));

Pair<String, String> both = new Pair<>("a", "b");
checkEq(both.swapped().toString(), "Pair(b, a)");

Set<Pair<String, Integer>> set = new HashSet<>();
set.add(new Pair<>("x", 1));
set.add(new Pair<>("x", 1));
checkEq(set.size(), 1);
```

## Hints
- Two type parameters go after the class name: `class Pair<A, B>`.
- `swapped()` returns `Pair<B, A>` — the parameters in the other order, which
  is the whole point of naming them separately.
- A record would generate `equals`, `hashCode` and `toString`, and records can
  be generic: `record Pair<A, B>(A first, B second)`.
- The required `toString` is `Pair(a, b)`, which a record's generated one does
  not match, so it needs overriding either way.

## Solution
```java
record Pair<A, B>(A first, B second) {
    Pair<B, A> swapped() {
        return new Pair<>(second, first);
    }

    @Override
    public String toString() {
        return "Pair(" + first + ", " + second + ")";
    }
}
```

## Notes
A record can be generic, and here it removes almost the whole class: the
constructor, both accessors, `equals` and `hashCode` are all generated, leaving
only the two members the specification actually asks for.

`swapped()` returning `Pair<B, A>` is what two type parameters buy. With a
single `T` the method could not express "the same pair, other way round"; with
`Object` it could, and the caller would have to cast both halves back. The
checks call `pair.first()` into a `String` with no cast, which is the entire
benefit stated as a test.

The last check is worth noticing. Putting two equal pairs into a `HashSet` and
expecting one element only works because the record generates `equals` and
`hashCode` over both components — chapter 2.4's contract, obtained free. The
`Object`-based starter inherits identity equality, so that check would report
two elements.

`toString` has to be written by hand because the generated form is
`Pair[first=age, second=36]`, which chapter 2.9 noted is not negotiable without
an override. That is the one place a record costs a line rather than saving
several.

Note what the type parameters do *not* do: at run time, a `Pair<String,
Integer>` and a `Pair<Integer, String>` are the same class, and neither knows
what `A` or `B` were. That is erasure, and it is the next chapter.
