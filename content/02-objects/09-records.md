---
title: "Records"
navTitle: "Records"
summary: >-
  A declaration that writes the constructor, accessors, equals, hashCode and toString for you — what it gives you, what it costs, and the one component type it gets wrong.
objectives:
  - Declare a record and say which members the compiler generates
  - Validate and normalise state in a compact constructor
  - Explain why a record holding an array does not compare the way you expect
status: complete
standard: java21
requires: [abstract-classes]
---

Chapter 2.4 wrote `equals`, `hashCode` and `toString` for a two-field `Point`
by hand. It took thirty lines, every one of which had to be right, and every
one of which has to be revisited when a field is added.

A record is that same class, declared once:

```java run title="The whole class"
public class Main {
    record Point(int x, int y) { }

    public static void main(String[] args) {
        Point a = new Point(3, 4);
        Point b = new Point(3, 4);

        System.out.println("toString:  " + a);
        System.out.println("accessors: " + a.x() + ", " + a.y());
        System.out.println("equals:    " + a.equals(b));
        System.out.println("same hash: " + (a.hashCode() == b.hashCode()));
    }
}
```

From `record Point(int x, int y)` the compiler generates a private final field
per component, a constructor taking all of them, an accessor per component
named after it, and correct `equals`, `hashCode` and `toString`. That is the
entire content of chapter 2.4's `Point`, and none of it can drift out of step
with the fields, because there are no separate fields to drift from.

Note the accessors are `x()` and `y()`, not `getX()`. A record states what it
*is* rather than exposing properties, and the naming follows.

## What you are agreeing to

A record is not just shorthand. It carries commitments:

- **It is final.** No subclassing.
- **Its components are final.** No setters, ever.
- **It cannot extend a class** (it already extends `Record`), though it may
  implement interfaces.
- **`equals` compares every component**, so all of them are part of its
  identity.

That list is the definition of a *transparent carrier for its data*, and it is
what lets the compiler generate the rest safely. If any of those is wrong for
your type, you want a class.

The commitments are also the point. A record is immutable and correctly
comparable by construction, which is exactly what chapters 2.2 and 2.4 spent
their length arguing for.

## Adding behaviour

A record body can hold methods, static members and constructors — just not
instance fields beyond its components.

```java run title="Records are still classes"
public class Main {
    record Money(long pence) implements Comparable<Money> {
        static Money zero() {
            return new Money(0);
        }

        Money plus(Money other) {
            return new Money(pence + other.pence);
        }

        String formatted() {
            return "£%d.%02d".formatted(pence / 100, pence % 100);
        }

        @Override
        public int compareTo(Money other) {
            return Long.compare(pence, other.pence);
        }
    }

    public static void main(String[] args) {
        Money a = new Money(1250);
        Money b = new Money(99);

        System.out.println(a.formatted() + " + " + b.formatted()
                           + " = " + a.plus(b).formatted());
        System.out.println("zero: " + Money.zero());
        System.out.println("a is larger: " + (a.compareTo(b) > 0));
    }
}
```

That is chapter 2.2's `Money` with the constructor, accessor, `equals`,
`hashCode` and `toString` deleted and nothing lost.

## The compact constructor

Validation goes in a **compact constructor** — the record's name, parentheses
with no parameter list, and a body that runs before the fields are assigned.

```java run title="Validating and normalising on the way in"
public class Main {
    record Point(int x, int y) {
        Point {
            if (x < 0 || y < 0) {
                throw new IllegalArgumentException("negative coordinate: " + x + ", " + y);
            }
        }
    }

    record Range(int lo, int hi) {
        Range {
            if (lo > hi) {          // assigning the parameter normalises the component
                int swap = lo;
                lo = hi;
                hi = swap;
            }
        }
    }

    public static void main(String[] args) {
        System.out.println(new Point(3, 4));
        try {
            new Point(-1, 0);
        } catch (IllegalArgumentException e) {
            System.out.println("rejected: " + e.getMessage());
        }

        System.out.println("given (9, 2): " + new Range(9, 2));
    }
}
```

Inside a compact constructor the parameters are ordinary variables, and
whatever they hold at the end is what gets assigned to the fields. So
assigning to `lo` and `hi` normalises the record — `new Range(9, 2)` really is
`Range[lo=2, hi=9]`, with no way to construct an unsorted one.

This is chapter 2.3's invariant argument at its cleanest. The rule is stated
once, in the only place that can build the object, and every other method gets
it for free.

:::pitfall
A record with an array component does not compare the way you want:

```java
record Holder(int[] data) { }
new Holder(new int[] {1, 2}).equals(new Holder(new int[] {1, 2}))   // false
```

The generated `equals` uses `Objects.equals` on each component, and on arrays
that is reference identity — chapter 1.5's rule again. `toString` is just as
bad, printing `Holder[data=[I@1b6d3586]`.

Records are for values, and an array is not one: it is mutable and it compares
by identity, so it breaks both promises a record makes. Use `List.of(...)`,
which is immutable and compares by contents — or override `equals`,
`hashCode` and `toString`, at which point the record is buying you very little.
:::

## When not to use one

- **The type has identity, not just value.** Two employees with the same name
  and salary are two people. A record says they are the same thing.
- **It needs to be mutable.** Records cannot be.
- **It needs a superclass.** Records cannot extend.
- **Some state is derived or cached.** A record's components are exactly its
  state, and there is nowhere to put a lazily-computed field.
- **Not every component belongs in `equals`.** All of them are included, and
  you cannot exclude one without writing `equals` yourself.

For everything else — coordinates, money, a parsed configuration line, the
return value of a method that needs to give back two things — a record is the
right default, and chapter 2.11 pairs them with sealed interfaces to model a
closed set of alternatives.

:::quiz
{
  "question": "`record User(String name, List<String> roles) { }` — a caller constructs one, then mutates the list they passed in. What happens to the record?",
  "options": [
    { "text": "The record's roles change too — it stored the reference it was given", "correct": true, "why": "Right. A record's constructor assigns the component as it arrives, exactly like the leaking constructor in chapter 2.2. Immutability of the record does not make its components immutable." },
    { "text": "Nothing — records copy their components defensively", "correct": false, "why": "They do not. The generated constructor is a plain assignment; there is no copying anywhere in what the compiler writes." },
    { "text": "Nothing — the component is final, so the list cannot change", "correct": false, "why": "final fixes which list the field points at, not the contents of that list. Chapter 2.2 made exactly this distinction." },
    { "text": "It throws, because records reject mutable components", "correct": false, "why": "Nothing checks. A record will happily hold anything, which is why choosing immutable component types is the author's job." }
  ]
}
:::

## Practice

:::exercise record-the-point

:::exercise normalise-on-construction

:::recap
- A record generates a final field, an accessor, a canonical constructor,
  `equals`, `hashCode` and `toString` from its component list.
- It is final, its components are final, and it cannot extend a class — those
  commitments are what make the generated members safe.
- A compact constructor validates and can normalise by assigning to the
  parameters before they reach the fields.
- Accessors are named after the components: `x()`, not `getX()`.
- A record holding an array compares by identity and prints as gibberish.
  Prefer an immutable component type such as `List.of(...)`.
- A record holding a mutable component is not really immutable — the reference
  is fixed, the contents are not.
:::
