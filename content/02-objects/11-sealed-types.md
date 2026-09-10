---
title: "Sealed types and pattern matching"
navTitle: "Sealed types"
summary: >-
  Closing a hierarchy so the compiler knows every possibility, then matching on it — including taking records apart in the pattern itself.
objectives:
  - Declare a sealed type and say what the permits clause buys you
  - Write an exhaustive switch over a sealed hierarchy without a default arm
  - Use record patterns and guards to match on shape and value together
status: complete
standard: java21
requires: [enums]
---

Chapter 2.6 argued that a chain of `instanceof` usually means a method is
missing from the type, and promised one exception. This is it.

Sometimes the operations you want to perform on a hierarchy do not belong to
it. A `Shape` should know its own area; it should not know how to render itself
as SVG, serialise itself to JSON, and price itself for a quotation system —
each of those belongs to a different part of the program, and piling them onto
`Shape` couples everything to everything.

For that you want to ask what kind of shape you have, from outside. And to do
it safely you need the compiler to know the list is complete.

## Sealing a hierarchy

```java run title="A closed set of alternatives"
sealed interface Shape permits Circle, Square, Rect { }

record Circle(double radius) implements Shape { }
record Square(double side) implements Shape { }
record Rect(double width, double height) implements Shape { }

public class Main {
    static double area(Shape s) {
        return switch (s) {
            case Circle c -> Math.PI * c.radius() * c.radius();
            case Square q -> q.side() * q.side();
            case Rect r -> r.width() * r.height();
        };
    }

    public static void main(String[] args) {
        Shape[] shapes = { new Circle(1), new Square(3), new Rect(2, 5) };
        for (Shape s : shapes) {
            System.out.printf("%-28s area %6.2f%n", s, area(s));
        }
    }
}
```

`sealed ... permits` names every direct subtype. Nothing else may implement
`Shape` — not in this file, not in another module, not ever — and that is what
lets the switch omit its `default` arm and still compile.

Every permitted subtype must itself be `final`, `sealed`, or `non-sealed`. A
record is implicitly final, which is why the three above need no keyword.
`non-sealed` is the escape hatch: it reopens that branch to arbitrary
subclasses, and it exists so a sealed hierarchy can have one extensible corner
without giving up the guarantee everywhere else.

:::note
The `permits` clause can be omitted when all the subtypes are in the same file,
as they are here — the compiler infers it. Writing it out is worth the words in
real code, because the list is the documentation.
:::

## The compiler enforces both halves

```java run expect-error title="An implementer that was not invited"
sealed interface Shape permits Circle { }

record Circle(double radius) implements Shape { }
record Triangle(double base, double height) implements Shape { }

public class Main {
    public static void main(String[] args) {
        System.out.println(new Circle(1));
    }
}
```

*class is not allowed to extend sealed class: Shape (as it is not listed in its
'permits' clause).*

```java run expect-error title="A case that was not covered"
sealed interface Shape permits Circle, Square { }

record Circle(double radius) implements Shape { }
record Square(double side) implements Shape { }

public class Main {
    static String name(Shape s) {
        return switch (s) {
            case Circle c -> "circle";
        };
    }

    public static void main(String[] args) {
        System.out.println(name(new Circle(1)));
    }
}
```

*the switch expression does not cover all possible input values.*

Those two errors are the whole feature. The first says the set cannot grow
behind your back; the second says that when it does grow deliberately, every
switch over it becomes a compile error until you decide what the new case
means. It is the enum guarantee from chapter 2.10, extended to types that carry
data.

## Record patterns

A pattern can take a record apart in the same breath as matching it:

```java run title="Matching and destructuring at once"
sealed interface Shape permits Circle, Rect { }

record Circle(double radius) implements Shape { }
record Rect(double width, double height) implements Shape { }

public class Main {
    static String describe(Shape s) {
        return switch (s) {
            case Circle(double r) when r > 10 -> "a big circle of radius " + r;
            case Circle(double r) -> "a circle of radius " + r;
            case Rect(double w, double h) when w == h -> "a " + w + " square, in disguise";
            case Rect(double w, double h) -> w + " by " + h;
        };
    }

    public static void main(String[] args) {
        Shape[] shapes = { new Circle(1), new Circle(20), new Rect(4, 4), new Rect(2, 5) };
        for (Shape s : shapes) {
            System.out.println(describe(s));
        }
    }
}
```

`case Rect(double w, double h)` matches a `Rect` and binds its two components
to names in one step — no accessor calls, no intermediate variable. Patterns
nest, so `case Line(Point(var x1, var y1), Point(var x2, var y2))` reaches two
levels down.

`when` adds a guard. Order matters: the guarded `Circle` case must come before
the unguarded one, or the unguarded one would match everything first — and the
compiler says so, with *this case label is dominated by a preceding case label*.

## Sealed types or polymorphism?

Both model "one of several kinds". The question is where the behaviour belongs.

| | Put a method on the type | Sealed type plus switch |
|---|---|---|
| Adding a **kind** | one new class, nothing else changes | every switch stops compiling |
| Adding an **operation** | edit every class in the hierarchy | one new method, in one place |
| Behaviour lives | with the data | with the caller |
| Works when the hierarchy is | open | closed |

So they are duals, and the choice follows from which axis moves. `area()`
belongs on `Shape`: it is intrinsic, and a new shape should supply it. An SVG
renderer belongs in a switch: it is one of many possible operations, it has
nothing to do with geometry, and rendering has dependencies a `Shape` should
not acquire.

The failure mode of each is worth remembering. Get it wrong in one direction
and adding a shape means editing forty switches. Get it wrong in the other and
`Shape` ends up importing a JSON library.

:::tip
Sealed interfaces plus records is the standard way to model a value that is
"one of these shapes, each carrying different data" — a parsed token, a result
that is either success or failure, a message of several kinds. The result type
is common enough to be worth the pattern: `sealed interface Result permits Ok,
Err`, with `record Ok(String value)` and `record Err(String message)`, gives you
something a switch can exhaustively handle. Chapter 3.5 compares it with
exceptions.
:::

:::quiz
{
  "question": "A sealed interface `Event permits Click, Scroll` is switched over exhaustively in six places. A `KeyPress` record is added to the permits clause. What happens?",
  "options": [
    { "text": "All six stop compiling until each decides what a KeyPress means", "correct": true, "why": "Right. Exhaustiveness is rechecked against the new permits list, so the compiler produces the list of places needing a decision — the same guarantee an enum gives, for types that carry data." },
    { "text": "They compile, and a KeyPress falls through to no case at run time", "correct": false, "why": "A switch expression must yield a value on every path. If a KeyPress could arrive unmatched the switch was never exhaustive, which is precisely what the compiler refuses." },
    { "text": "Only switches that use record patterns break", "correct": false, "why": "Exhaustiveness is about covering the permitted subtypes. Whether a case binds components makes no difference to whether the set is covered." },
    { "text": "Nothing, because sealed types are checked only at run time", "correct": false, "why": "Both halves are compile-time: an unpermitted implementer will not compile, and neither will an incomplete switch." }
  ]
}
:::

## Practice

:::exercise expression-evaluator

:::exercise result-or-error

:::recap
- `sealed ... permits` fixes the set of direct subtypes; every one must be
  `final`, `sealed` or `non-sealed`.
- Because the set is closed, a switch over it needs no `default` — and adding a
  subtype then breaks every switch that has not been updated.
- A record pattern matches and destructures at once, and patterns nest.
- `when` guards a case; a guarded case must precede the unguarded one it
  refines, or the compiler reports domination.
- Put behaviour on the type when kinds are added often; use a sealed type and a
  switch when operations are added often and the kinds are fixed.
:::
