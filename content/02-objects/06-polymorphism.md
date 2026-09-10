---
title: "Polymorphism"
navTitle: "Polymorphism"
summary: >-
  One reference, many possible objects: how the right method gets chosen, how to go back down the hierarchy safely, and what the choosing actually costs.
objectives:
  - Explain which method runs when a call goes through a parent reference
  - Downcast safely, and say why a chain of instanceof usually signals a design problem
  - Say what dynamic dispatch costs, based on a measurement rather than folklore
status: complete
standard: java21
requires: [inheritance]
---

Chapter 2.5 showed a parent's `toString` calling a child's `speak`. This
chapter is about that mechanism, which is the reason inheritance is worth
having at all: code written against a general type does the right thing for
every specific one, including the ones written after it.

## One reference, many objects

```java run title="The same call, three answers"
class Shape {
    double area() {
        return 0;
    }

    String describe() {
        return getClass().getSimpleName() + " with area " + area();
    }
}

class Square extends Shape {
    private final double side;
    Square(double side) { this.side = side; }

    @Override
    double area() {
        return side * side;
    }
}

class Circle extends Shape {
    private final double radius;
    Circle(double radius) { this.radius = radius; }

    @Override
    double area() {
        return Math.PI * radius * radius;
    }
}

public class Main {
    static double totalArea(Shape[] shapes) {
        double total = 0;
        for (Shape s : shapes) {
            total += s.area();          // which area()? decided per object, at run time
        }
        return total;
    }

    public static void main(String[] args) {
        Shape[] shapes = { new Square(2), new Circle(1), new Square(3) };

        for (Shape s : shapes) {
            System.out.printf("%.3f  %s%n", s.area(), s.describe());
        }
        System.out.printf("total %.3f%n", totalArea(shapes));
    }
}
```

`totalArea` mentions only `Shape`. It was compiled before `Square` and `Circle`
existed, as far as it is concerned, and it will keep working when a `Triangle`
is added next year without being recompiled or even reread.

That is the whole payoff. The alternative — a `switch` on a type tag inside
`totalArea` — has to be found and edited every time a shape is added, and the
compiler cannot tell you that you missed one.

Note `describe()` calling `getClass().getSimpleName()` and `area()`, both of
which resolve to the actual object. A method written in the parent gets the
child's behaviour for free.

## Up is free, down is a claim

```java run title="Casting in both directions"
class Shape { }
class Square extends Shape {
    int corners() { return 4; }
}

public class Main {
    public static void main(String[] args) {
        Square sq = new Square();

        Shape asShape = sq;                 // upcast: always safe, no cast needed
        System.out.println("upcast fine");

        Square back = (Square) asShape;     // downcast: you are asserting the type
        System.out.println("corners: " + back.corners());

        Shape plain = new Shape();
        try {
            Square wrong = (Square) plain;  // the assertion is false
            System.out.println(wrong.corners());
        } catch (ClassCastException e) {
            System.out.println("caught: " + e.getMessage());
        }
    }
}
```

Upcasting needs no syntax because it cannot fail: every `Square` is a `Shape`.
Downcasting needs a cast because it can, and when the claim is false you get a
`ClassCastException` at the point of the cast.

The safe form tests first:

```java run title="instanceof, and the pattern form"
class Shape { }
class Square extends Shape {
    int corners() { return 4; }
}

public class Main {
    static String describe(Shape s) {
        if (s instanceof Square square) {       // test, cast and name, in one
            return "a square with " + square.corners() + " corners";
        }
        return "some other shape";
    }

    public static void main(String[] args) {
        System.out.println(describe(new Square()));
        System.out.println(describe(new Shape()));
        System.out.println(describe(null));      // instanceof is false for null
    }
}
```

`s instanceof Square square` tests the type and, when it matches, declares
`square` already cast — the same pattern form chapter 2.4 used in `equals`. It
replaces the older three-line dance of testing, casting and assigning, and it
cannot get the two types out of step.

:::tip
A chain of `instanceof` over the subtypes of one hierarchy is usually a method
that belongs on the type. If you are asking "which kind of `Shape` is this?" in
order to decide what to do, the answer is normally to add a method to `Shape`
and let dispatch ask the question for you. Sealed types in chapter 2.11 are the
case where the chain is legitimate, because the compiler can then check it is
complete.
:::

## What does it cost?

Dispatching to the right method requires an indirection: the object carries a
pointer to its class, the class carries a table of methods, and the call goes
through it. Folklore says this is expensive and that a call site seeing many
types is worse than one seeing a single type. It is worth measuring rather than
repeating.

```java run title="Measured: one receiver type against four"
public class Main {
    interface Op {
        int apply(int x);
    }

    static final class A implements Op { public int apply(int x) { return x + 1; } }
    static final class B implements Op { public int apply(int x) { return x + 1; } }
    static final class C implements Op { public int apply(int x) { return x + 1; } }
    static final class D implements Op { public int apply(int x) { return x + 1; } }

    static long sink;

    static long run(Op[] ops, int iterations) {
        long total = 0;
        for (int i = 0; i < iterations; i++) {
            total += ops[i & 3].apply(i);
        }
        return total;
    }

    public static void main(String[] args) {
        Op[] oneType  = { new A(), new A(), new A(), new A() };
        Op[] fourTypes = { new A(), new B(), new C(), new D() };

        for (int w = 0; w < 3; w++) {          // warm up, or this measures nothing
            sink += run(oneType, 2_000_000);
            sink += run(fourTypes, 2_000_000);
        }

        int n = 10_000_000;
        long t0 = System.nanoTime();
        sink += run(oneType, n);
        long t1 = System.nanoTime();
        sink += run(fourTypes, n);
        long t2 = System.nanoTime();

        System.out.printf("one receiver type   %4d ms%n", (t1 - t0) / 1_000_000);
        System.out.printf("four receiver types %4d ms%n", (t2 - t1) / 1_000_000);
        System.out.println("(checksum " + sink + ")");
    }
}
```

Both arrays have four elements and the same indexing, so the only difference is
how many distinct types the call site sees. Run it a few times.

**They come out the same**, within noise. That is not the answer the folklore
predicts, and it is worth understanding why: HotSpot does not implement a
virtual call as a table lookup in hot code. It observes which types actually
arrive, and compiles a direct, inlined call guarded by a type check — an
*inline cache*. With one type it inlines one body; with a handful it can inline
several and pick between them.

Two honest caveats, because a single measurement is not a law:

- These method bodies are trivial and identical. When bodies differ enough that
  inlining several of them exceeds the JIT's budget, the megamorphic case does
  lose — it just does not lose here, at this size.
- This measures throughput in a tight loop, which is the friendliest possible
  case for the optimiser.

The practical conclusion stands regardless: **do not distort a design to avoid
virtual calls.** The cost is not where intuition puts it, and if it ever
matters for your program, you will find that out by measuring it rather than by
reasoning about it in advance.

:::quiz
{
  "question": "`Shape s = new Circle(1); System.out.println(s.area());` — the variable is declared `Shape`. Which `area()` runs?",
  "options": [
    { "text": "Circle's, because the object is a Circle", "correct": true, "why": "Right. Methods dispatch on the object's actual type at run time. The declared type decides which methods you are *allowed* to call, not which implementation runs." },
    { "text": "Shape's, because the variable is declared Shape", "correct": false, "why": "That is how fields behave — chapter 2.5's hiding — and it is exactly the asymmetry that catches people. Methods do not work that way." },
    { "text": "Circle's, but only if Shape.area() is abstract", "correct": false, "why": "Overriding works the same whether the parent's version is abstract or has a body. abstract only forces the subclass to supply one." },
    { "text": "It depends on whether area() is declared final in Circle", "correct": false, "why": "final on Circle.area() would stop anything below Circle overriding it. It has no bearing on this call, which already resolves to Circle." }
  ]
}
:::

## Practice

:::exercise polymorphic-payroll

:::exercise flatten-the-instanceof

:::recap
- A call through a parent reference runs the object's own override, chosen at
  run time. Code written against the general type keeps working for subtypes
  written later.
- Upcasting is implicit and cannot fail. Downcasting is an assertion, and a
  false one throws `ClassCastException`.
- `x instanceof Square square` tests, casts and names in one expression, and is
  false for `null`.
- A chain of `instanceof` over one hierarchy usually means a method is missing
  from the type.
- Measured, a call site seeing four receiver types costs the same as one seeing
  a single type, because HotSpot compiles an inlined call guarded by a type
  check rather than a table lookup. Do not distort a design to avoid virtual
  calls.
:::
