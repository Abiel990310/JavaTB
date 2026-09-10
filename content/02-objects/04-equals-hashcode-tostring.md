---
title: "equals, hashCode and toString"
navTitle: "equals and hashCode"
summary: >-
  The three methods every object inherits, what the library assumes about two of them, and what silently breaks when you honour one and not the other.
objectives:
  - Write equals and hashCode that satisfy their contracts
  - Explain exactly what breaks when equals is overridden without hashCode
  - Say why a field that can change must not take part in a hash code
status: complete
standard: java21
requires: [encapsulation]
---

Chapter 2.1 ended with two `Book` objects holding identical contents and `==`
reporting `false`, and promised this chapter would fix it. Fixing it turns out
to mean implementing a contract rather than writing a method — because the
collections library makes assumptions about these methods, and it will not tell
you when you have broken them.

Every class inherits three methods from `Object` worth overriding: `equals`,
`hashCode` and `toString`. The default behaviour of all three is based on
identity.

```java run title="What you get for free"
public class Main {
    static class Tag {
        final String name;
        Tag(String name) { this.name = name; }
    }

    public static void main(String[] args) {
        Tag a = new Tag("urgent");
        Tag b = new Tag("urgent");

        System.out.println("a.equals(b) " + a.equals(b));
        System.out.println("a.toString() " + a);
        System.out.println("a.hashCode() differs from b's: " + (a.hashCode() != b.hashCode()));
    }
}
```

The inherited `equals` is `==`. The inherited `toString` is the class name and
an identity hash. For a great many classes that is exactly right — two bank
accounts with the same balance are not the same account. But for a type that
represents a *value* — a point, a date, a tag, an amount of money — it is
wrong, and the whole library behaves oddly until you say so.

## The equals contract

An `equals` implementation must be:

- **reflexive** — `x.equals(x)` is true
- **symmetric** — if `x.equals(y)` then `y.equals(x)`
- **transitive** — if `x.equals(y)` and `y.equals(z)` then `x.equals(z)`
- **consistent** — repeated calls give the same answer while nothing changes
- **null-safe** — `x.equals(null)` is false, never an exception

```java run title="A value type that knows what equality means"
import java.util.Objects;

public class Main {
    static final class Point {
        private final int x;
        private final int y;

        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) {
                return true;                    // fast path, and guarantees reflexivity
            }
            if (!(o instanceof Point other)) {
                return false;                   // false for null too — instanceof handles it
            }
            return x == other.x && y == other.y;
        }

        @Override
        public int hashCode() {
            return Objects.hash(x, y);
        }

        @Override
        public String toString() {
            return "Point(" + x + ", " + y + ")";
        }
    }

    public static void main(String[] args) {
        Point a = new Point(3, 4);
        Point b = new Point(3, 4);

        System.out.println(a + " equals " + b + ": " + a.equals(b));
        System.out.println("same hash: " + (a.hashCode() == b.hashCode()));
        System.out.println("equals(null): " + a.equals(null));
        System.out.println("equals(\"not a point\"): " + a.equals("not a point"));
    }
}
```

`o instanceof Point other` is **pattern matching for instanceof**: it tests the
type and, if it matches, declares `other` already cast. It is also `false` when
`o` is `null`, which is how the null case is handled without writing it.

`@Override` is not decoration. It asks the compiler to check that you really
are overriding something — and it catches the single most common mistake here,
writing `equals(Point other)` instead of `equals(Object o)`. That compiles fine
without the annotation and creates an *overload* that the library never calls.

## What breaks without hashCode

```java run title="equals alone is worse than neither"
import java.util.HashSet;
import java.util.Set;

public class Main {
    static class Tag {
        final String name;
        Tag(String name) { this.name = name; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Tag other && other.name.equals(name);
        }
        // no hashCode
    }

    public static void main(String[] args) {
        Set<Tag> tags = new HashSet<>();
        tags.add(new Tag("urgent"));

        System.out.println("contains an equal Tag: " + tags.contains(new Tag("urgent")));

        tags.add(new Tag("urgent"));
        System.out.println("size after adding an equal Tag: " + tags.size());
    }
}
```

Two objects that `equals` says are equal, and the set neither finds the first
nor refuses the second. Look at the warnings panel too: javac reports *Class
Tag overrides equals, but neither it nor any superclass overrides hashCode*.
The compiler knows.

The reason is how hashing works. A `HashSet` puts each element in a bucket
chosen from its hash code, and looks only in that one bucket. Two equal objects
with different hash codes land in different buckets, so the lookup never
reaches the one it wants. Hence the contract:

> **If `a.equals(b)`, then `a.hashCode() == b.hashCode()`.**

The converse is not required — unequal objects may share a hash code, which is
called a collision and is handled by comparing with `equals` inside the bucket.
That asymmetry is why `hashCode` can be cheap and approximate while `equals`
must be exact.

`Objects.hash(x, y)` combines any number of fields correctly. Use exactly the
fields `equals` uses, and no others.

:::note
`HashSet` properly belongs to Part 4, and its internals are chapter 4.3's job.
It appears here because it is the shortest demonstration of why the contract
matters — the failure is invisible in the class itself and only shows up when
something else relies on it.
:::

## The mutable key trap

```java run title="An object lost inside its own set"
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

public class Main {
    static class Label {
        String text;                       // not final — that is the problem

        Label(String text) { this.text = text; }

        @Override
        public boolean equals(Object o) {
            return o instanceof Label other && other.text.equals(text);
        }

        @Override
        public int hashCode() {
            return Objects.hash(text);
        }
    }

    public static void main(String[] args) {
        Set<Label> labels = new HashSet<>();
        Label label = new Label("before");
        labels.add(label);

        label.text = "after";              // the hash code just changed

        System.out.println("contains(label): " + labels.contains(label));
        System.out.println("set size:        " + labels.size());
        System.out.println("but iterating finds: " + labels.iterator().next().text);
    }
}
```

The set contains that exact object — iteration proves it — and cannot find it.
It was filed under the hash of `"before"`, and `contains` now looks in the
bucket for `"after"`.

Nothing is corrupted; the rules were simply broken. `hashCode` must be
consistent while the object is in a hash-based collection, and mutating a field
that feeds it breaks that. The practical rule: **build hash codes from
immutable fields only** — which usually means making the whole type immutable,
as chapter 2.2 recommended for other reasons entirely.

## toString

```java run title="For humans, not for parsing"
public class Main {
    record Order(String item, int quantity) { }

    static class Handwritten {
        private final String item;
        private final int quantity;
        Handwritten(String item, int quantity) { this.item = item; this.quantity = quantity; }

        @Override
        public String toString() {
            return "Handwritten[item=" + item + ", quantity=" + quantity + "]";
        }
    }

    public static void main(String[] args) {
        System.out.println(new Order("rope", 3));
        System.out.println(new Handwritten("rope", 3));
    }
}
```

`toString` is called implicitly by string concatenation and by `println`, which
is why a class without one shows up as `Main$Tag@12a3a380` in every log message
that ever mentions it. Include the class name and the fields that identify the
object; leave out anything secret.

Do not parse it. A `toString` is for a person reading a log or a debugger, and
changing it should never break code — which it will, immediately, if something
is splitting it on commas.

That `record` in the sample is chapter 2.9's subject. It writes `equals`,
`hashCode` and `toString` for you, correctly, from the fields you declare — and
once you have written all three by hand a few times, that is a considerable
relief.

:::warning
Use `getClass() != o.getClass()` instead of `instanceof` when a subclass could
exist and must not be equal to its parent. `instanceof` accepts subclasses,
which can break symmetry: a `Point` might say it equals a `ColouredPoint` while
the `ColouredPoint` disagrees. Making value classes `final`, as `Point` above
is, removes the question entirely.
:::

:::quiz
{
  "question": "A class overrides `hashCode` but not `equals`. What happens when you put two objects with equal contents into a HashSet?",
  "options": [
    { "text": "Both are stored — they land in the same bucket and are then found unequal", "correct": true, "why": "Right. Matching hash codes send them to the same bucket, but the set confirms with equals, which is still identity. So they are treated as two distinct elements." },
    { "text": "Only one is stored, because the hash codes match", "correct": false, "why": "A matching hash code is not enough. The bucket is only a shortlist; equals decides, and the inherited equals is ==." },
    { "text": "It throws, because the contract is violated", "correct": false, "why": "Nothing checks the contract at run time. This is the difficulty with both halves of it — breakage is silent and shows up as wrong behaviour far away." },
    { "text": "The behaviour is identical to overriding neither", "correct": false, "why": "Almost, and this direction is much less harmful than the other. The difference is that the objects now collide into one bucket, so lookups degrade slightly while staying correct." }
  ]
}
:::

## Practice

:::exercise value-equality

:::exercise case-insensitive-tag

:::recap
- The inherited `equals` is `==`, and the inherited `toString` is a class name
  and an identity hash. Both are right for entities and wrong for value types.
- `equals` must be reflexive, symmetric, transitive, consistent and false for
  `null`. `o instanceof Point other` handles the type test, the cast and the
  null case at once.
- `@Override` catches `equals(Point)` written in place of `equals(Object)`,
  which is an overload the library never calls.
- Equal objects must have equal hash codes. Break that and hash-based
  collections silently fail to find things; javac warns when you override one
  without the other.
- A hash code must not change while the object is in a hash-based collection,
  so build it from immutable fields only.
- `toString` is for people. Never parse it.
:::
