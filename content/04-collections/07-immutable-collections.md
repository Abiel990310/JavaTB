---
title: "Immutable collections in practice"
navTitle: "Immutable collections"
summary: >-
  What an immutable collection does and does not promise about the things inside it, and the iteration order the JDK scrambles on purpose.
objectives:
  - Explain why an immutable collection of mutable elements is not immutable
  - Say why Set.of and Map.of iterate differently between runs
  - Choose where to copy at a boundary, and where a copy costs nothing
status: complete
standard: java21
requires: [iteration]
---

Chapter 4.1 laid out the four things "unmodifiable" can mean. This chapter is
what that chapter left: how far immutability actually reaches, and two
deliberate design decisions in the immutable factories that surprise people.

## Immutable is one level deep

```java run title="An unchangeable list of changeable things"
import java.util.*;

public class Main {
    static class Basket {
        private final List<String> contents = new ArrayList<>();

        void add(String item) {
            contents.add(item);
        }

        @Override
        public String toString() {
            return contents.toString();
        }
    }

    public static void main(String[] args) {
        Basket first = new Basket();
        first.add("apple");

        List<Basket> baskets = List.of(first, new Basket());
        System.out.println("before: " + baskets);

        try {
            baskets.add(new Basket());
        } catch (UnsupportedOperationException e) {
            System.out.println("cannot add a basket: UnsupportedOperationException");
        }

        baskets.get(0).add("pear");            // nothing stops this
        System.out.println("after:  " + baskets);
    }
}
```

`List.of` guarantees that the *list* will not change: no element is added,
removed or replaced. It says nothing about the elements. The list still holds
two baskets in the same order; one of them now contains something different.

This is chapter 2.2's rule at collection scale. An immutable collection of
mutable objects gives you a fixed set of doors and no control over what is
behind them.

Real immutability needs the whole graph:

- the collection is immutable — `List.of`, `Map.copyOf`
- **and** the elements are immutable — records of primitives and strings,
  enums, other immutable collections

Records help but do not settle it: chapter 2.9's quiz made the point that a
record holding a `List` copies nothing on the way in. `record Order(String id,
List<String> lines)` is immutable in exactly the way this list is.

:::tip
When a record must hold a collection, copy in the compact constructor:

```java
record Order(String id, List<String> lines) {
    Order {
        lines = List.copyOf(lines);
    }
}
```

Two words, and the record becomes as immutable as it looks. `copyOf` also
rejects nulls, so the components are validated as a side effect.
:::

## The order that changes between runs

```java run title="Press Run twice and compare"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        System.out.println("Set.of:        " + Set.of("alpha", "beta", "gamma", "delta", "epsilon"));
        System.out.println("Map.of keys:   " + Map.of("a", 1, "b", 2, "c", 3, "d", 4).keySet());
        System.out.println("LinkedHashSet: " + new LinkedHashSet<>(
            List.of("alpha", "beta", "gamma", "delta", "epsilon")));
    }
}
```

Run it, then run it again. The first two lines very likely differ between runs.
The third will not.

This is not chance. `Set.of` and `Map.of` compute their iteration order from a
random value chosen once when the JVM starts, specifically so that no
program can come to depend on the order. The JDK made unpredictability a
feature, having watched code accumulate dependencies on `HashMap`'s
incidental ordering for twenty years.

The practical consequence is worth stating plainly: **a test that asserts on
the printed form of a `Set.of` or `Map.of` will pass locally and fail on CI**,
or pass a hundred times and fail on the hundred and first. If order matters,
use `LinkedHashSet`, `TreeSet`, or a `List`.

It also explains a puzzle from chapter 4.1: `HashSet` "appeared" to sort small
integers there. Neither collection promises anything, but only the immutable
factories go out of their way to make the absence of a promise visible.

## Null hostility

```java run title="Deliberately intolerant"
import java.util.*;

public class Main {
    static void attempt(String what, Runnable action) {
        try {
            action.run();
            System.out.println("  " + what + ": allowed");
        } catch (NullPointerException e) {
            System.out.println("  " + what + ": NullPointerException");
        } catch (IllegalArgumentException e) {
            System.out.println("  " + what + ": IllegalArgumentException");
        }
    }

    public static void main(String[] args) {
        attempt("List.of with a null element", () -> List.of("a", null));
        attempt("Map.of with a null value", () -> Map.of("a", null));
        attempt("Set.of with a duplicate", () -> Set.of("a", "a"));

        List<String> withNull = new ArrayList<>();
        withNull.add(null);
        attempt("ArrayList holding null", () -> withNull.add(null));
        attempt("List.copyOf of a list containing null", () -> List.copyOf(withNull));

        System.out.println("HashSet tolerates a duplicate: "
                           + new HashSet<>(List.of("a", "a")).size());
    }
}
```

The immutable factories reject `null` elements, keys and values, and `Set.of`
rejects duplicate elements outright rather than silently keeping one.

Both are deliberate tightenings. A `null` in a collection is nearly always a
bug that surfaces far from where it was inserted, and a duplicate passed to
`Set.of` is almost always a mistake in the source — `Set.of(RED, GREEN, RED)`
is a typo, not a request. The older collections accept both because they
predate the opinion.

The consequence to plan for: `List.copyOf(existing)` throws if `existing`
contains a `null`. Copying a legacy collection at a boundary is where this
usually bites.

## Where a copy costs nothing

```java run title="copyOf on something already immutable"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> original = List.of("a", "b", "c");
        List<String> copy = List.copyOf(original);

        System.out.println("same object returned: " + (original == copy));

        List<String> mutable = new ArrayList<>(List.of("a", "b", "c"));
        List<String> fromMutable = List.copyOf(mutable);
        System.out.println("copied from a mutable source: " + (mutable == fromMutable));

        mutable.add("d");
        System.out.println("original " + mutable + " but the copy is " + fromMutable);
    }
}
```

`List.copyOf` returns its argument unchanged when the argument is already one
of these immutable lists — there is nothing to copy, because nothing can change
it. So a defensive `copyOf` in a getter is free for callers who already hold
immutable data, and the cost falls only where it is genuinely needed.

That makes `List.copyOf` a good default at a boundary: correct in every case,
and free in the common one where the value was immutable to begin with.

:::quiz
{
  "question": "A test asserts `assertEquals(\"[a, b, c]\", Set.of(\"a\", \"b\", \"c\").toString())`. What happens?",
  "options": [
    { "text": "It passes or fails depending on the JVM run, because the order is deliberately randomised", "correct": true, "why": "Right. Set.of derives its iteration order from a value chosen when the JVM starts, precisely so that nothing can depend on it. The test is stable within a run and unstable across them." },
    { "text": "It always passes — the elements were given in that order", "correct": false, "why": "A Set has no insertion order to preserve, and the immutable factories go further by scrambling it per JVM." },
    { "text": "It always fails — Set.of never iterates in insertion order", "correct": false, "why": "It sometimes does, by chance, which is worse than never: the test passes often enough to look correct." },
    { "text": "It passes, because toString on an immutable set is specified to be sorted", "correct": false, "why": "Nothing sorts. Sorted iteration is TreeSet's promise, and it is the only one that makes it." }
  ]
}
:::

## Practice

:::exercise truly-immutable-order

:::exercise stable-output

:::recap
- An immutable collection fixes the collection, not the elements. Real
  immutability needs the whole graph to be immutable.
- A record holding a collection should copy it in the compact constructor;
  `List.copyOf` does that and validates against nulls at the same time.
- `Set.of` and `Map.of` randomise iteration order per JVM run, on purpose, so
  that nothing can depend on it. Use `LinkedHashSet` or `TreeSet` when order
  matters.
- The immutable factories reject nulls and, for `Set.of`, duplicates —
  deliberate tightenings the older collections predate.
- `List.copyOf` returns its argument when it is already immutable, so a
  defensive copy at a boundary is free in the common case.
:::
