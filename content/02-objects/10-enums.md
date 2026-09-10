---
title: "Enums"
navTitle: "Enums"
summary: >-
  A type with a fixed set of values, each of which can carry state and behaviour — and the compile-time exhaustiveness that makes adding one safe.
objectives:
  - Declare an enum with fields, a constructor and per-constant behaviour
  - Explain what a switch expression over an enum guarantees when a constant is added
  - Say why ordinal() must not be stored anywhere durable
status: complete
standard: java21
requires: [records]
---

Some types have a known, fixed set of values: a day of the week, an order
status, a suit of cards. Before Java 5 those were `int` constants, which meant
nothing stopped you passing `47` where a status was expected, or adding a
status to a price by accident.

An enum is a class whose instances are fixed at compile time and named.

```java run title="A type with three values and no others"
public class Main {
    enum Status {
        NEW, ACTIVE, DONE
    }

    public static void main(String[] args) {
        Status s = Status.ACTIVE;

        System.out.println(s);
        System.out.println("name    " + s.name());
        System.out.println("ordinal " + s.ordinal());
        System.out.println("all     " + java.util.Arrays.toString(Status.values()));
        System.out.println("parsed  " + Status.valueOf("DONE"));

        System.out.println("identity works: " + (Status.valueOf("NEW") == Status.NEW));
    }
}
```

Each constant is a single object created once, so `==` is correct for enums and
is the idiomatic comparison — unlike every other reference type in this book.
`equals` works too and does the same thing, but `==` cannot be given a `null`
and silently return `false`, so it fails faster.

`valueOf` throws `IllegalArgumentException` for an unknown name, which is
usually what you want when parsing external input: *No enum constant
Status.NOPE* names the problem precisely.

## Constants that carry data

An enum is a class. It can have fields, a constructor and methods — the
constructor runs once per constant, with the arguments in the declaration.

```java run title="Each constant with its own state"
public class Main {
    enum Planet {
        MERCURY(3.30e23, 2.44e6),
        EARTH(5.97e24, 6.37e6),
        JUPITER(1.90e27, 7.15e7);

        private static final double G = 6.67e-11;

        private final double massKg;
        private final double radiusM;

        Planet(double massKg, double radiusM) {
            this.massKg = massKg;
            this.radiusM = radiusM;
        }

        double surfaceGravity() {
            return G * massKg / (radiusM * radiusM);
        }

        double weightOf(double massKg) {
            return massKg * surfaceGravity();
        }
    }

    public static void main(String[] args) {
        for (Planet p : Planet.values()) {
            System.out.printf("%-8s g = %5.2f, a 70 kg person weighs %6.1f N%n",
                              p, p.surfaceGravity(), p.weightOf(70));
        }
    }
}
```

Earth comes out at 9.81, which is a reassuring sign the arithmetic is right.

An enum constructor is implicitly private — there is no way to make a fourth
planet — and it may not reference non-constant static fields, because the
constants are built before the rest of the class's statics.

## Behaviour that differs per constant

```java run title="An abstract method, answered by each constant"
public class Main {
    enum Op {
        PLUS("+") {
            @Override
            int apply(int a, int b) {
                return a + b;
            }
        },
        MINUS("-") {
            @Override
            int apply(int a, int b) {
                return a - b;
            }
        },
        TIMES("*") {
            @Override
            int apply(int a, int b) {
                return a * b;
            }
        };

        private final String symbol;

        Op(String symbol) {
            this.symbol = symbol;
        }

        abstract int apply(int a, int b);

        String symbol() {
            return symbol;
        }
    }

    public static void main(String[] args) {
        for (Op op : Op.values()) {
            System.out.println("7 " + op.symbol() + " 3 = " + op.apply(7, 3));
        }
    }
}
```

Declaring `apply` abstract forces every constant to supply a body, and the
compiler will not let a new operator be added without one. Each constant is
effectively an anonymous subclass of the enum.

The alternative — one `apply` containing a `switch` over `this` — works, but it
puts the behaviour somewhere other than the constant it belongs to, and adding
a constant leaves it silently unhandled unless the switch is exhaustive.

## Exhaustiveness, which is the real prize

Chapter 1.3 promised that a switch expression over an enum makes the compiler
find every place you forgot to update. Here it is:

```java run expect-error title="A gap the compiler will not accept"
public class Main {
    enum Status {
        NEW, ACTIVE, DONE
    }

    static String describe(Status s) {
        return switch (s) {
            case NEW -> "not started";
            case ACTIVE -> "in progress";
        };
    }

    public static void main(String[] args) {
        System.out.println(describe(Status.NEW));
    }
}
```

*the switch expression does not cover all possible input values.* Cover all
three and it compiles:

```java run title="Complete, and no default"
public class Main {
    enum Status {
        NEW, ACTIVE, DONE
    }

    static String describe(Status s) {
        return switch (s) {
            case NEW -> "not started";
            case ACTIVE -> "in progress";
            case DONE -> "finished";
        };
    }

    public static void main(String[] args) {
        for (Status s : Status.values()) {
            System.out.println(s + ": " + describe(s));
        }
    }
}
```

Now add a fourth constant, `CANCELLED`, and this method stops compiling —
along with every other exhaustive switch over `Status` in the codebase. That is
precisely what you want: a list of everywhere that needs a decision, produced
by the compiler, before the change ships.

:::pitfall
Writing `default -> "unknown"` throws that away. The switch becomes permanently
exhaustive, so adding a constant compiles silently and every unhandled case
falls into the default at run time. Use `default` for genuinely open inputs
like an `int`; leave it off when switching over an enum you control.
:::

## Never store ordinal()

`ordinal()` returns the constant's position, counting from zero. It exists for
the library's benefit — `EnumSet` and `EnumMap` use it to index arrays — and it
is a trap in your own code.

The position is defined by the *order the constants are written in*. Insert a
constant, or sort the list alphabetically during a tidy-up, and every number
you stored changes meaning. A database column holding `2` for `DONE` now says
something else, and nothing in the code will tell you.

Persist `name()` instead: it is stable under reordering, and `valueOf` turns it
back. If you need a number, declare a field and assign it explicitly — then the
number is part of the design rather than an accident of the source layout.

:::note
`EnumSet` and `EnumMap` are the collections designed for enum keys, and they
are dramatically more efficient than `HashSet` and `HashMap` — an `EnumSet` of
fewer than 65 constants is a single `long` used as a bit set. They belong to
Part 4, but reach for them whenever the key type is an enum.
:::

:::quiz
{
  "question": "An enum `Status` is switched over in twelve places, all using exhaustive switch expressions with no `default`. Someone adds a `CANCELLED` constant. What happens?",
  "options": [
    { "text": "All twelve stop compiling, listing exactly the places that need a decision", "correct": true, "why": "Right, and that is the reason to omit default. The compiler turns a change in one file into a checklist covering the whole codebase." },
    { "text": "They compile, and throw at run time when a CANCELLED arrives", "correct": false, "why": "That is what happens with a default arm that throws, or with a switch statement rather than an expression. An exhaustive switch expression is checked at compile time." },
    { "text": "They compile, returning null for CANCELLED", "correct": false, "why": "A switch expression must produce a value on every path; there is no implicit null. That requirement is exactly why the compiler must check exhaustiveness." },
    { "text": "Only switches in the same package break", "correct": false, "why": "Exhaustiveness is checked wherever the switch is written. Packages have no bearing on it." }
  ]
}
:::

## Practice

:::exercise currency-enum

:::exercise order-state-machine

:::recap
- An enum's constants are a fixed set of single objects, so `==` is the correct
  and idiomatic comparison.
- Constants can carry state through a constructor, and can each supply their
  own body for an abstract method declared on the enum.
- `values()` lists them, `valueOf` parses a name and throws on an unknown one.
- An exhaustive switch expression over an enum needs no `default`, and adding a
  constant then breaks every switch that has not been updated. Adding
  `default` gives that up.
- `ordinal()` depends on the order the constants are written in. Never store
  it; persist `name()`, or declare an explicit code field.
:::
