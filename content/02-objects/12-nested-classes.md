---
title: "Nested, inner and anonymous classes"
navTitle: "Nested classes"
summary: >-
  Four ways to declare a class inside something else, the hidden reference one of them carries, and why `this` means different things in a lambda and an anonymous class.
objectives:
  - Choose between a static nested class and an inner class, and say what the difference costs
  - Explain what an inner class instance holds a reference to, and when that leaks
  - Say why a captured local must be effectively final
status: complete
standard: java21
requires: [sealed-types]
---

Every sample in this book has used a class declared inside another one, because
the runner compiles a single file. That was a convenience. It is also a real
feature with four distinct forms, one of which holds a reference you cannot see
and did not ask for.

## Static nested: a class that happens to live inside

```java run title="Nesting for namespacing"
public class Main {
    static class Node {
        final int value;
        Node next;

        Node(int value) {
            this.value = value;
        }
    }

    public static void main(String[] args) {
        Node head = new Node(1);
        head.next = new Node(2);

        System.out.println(head.value + " -> " + head.next.value);
    }
}
```

A `static` nested class is an ordinary class that happens to be declared inside
another, for namespacing: `Node` belongs to whatever list class owns it and has
no meaning apart from it. It has no connection to any instance of the enclosing
class, and you create one with `new Node(1)` like anything else.

This is the form to reach for by default. Every nested class in this book so
far has been one.

## Inner: a class attached to an instance

Drop the `static` and something changes:

```java run title="An inner class can see the enclosing object"
public class Main {
    private final String label;

    Main(String label) {
        this.label = label;
    }

    class Badge {                       // no static
        String render() {
            return "[" + label + "]";   // reaching into the enclosing instance
        }
    }

    public static void main(String[] args) {
        Main outer = new Main("urgent");
        Main.Badge badge = outer.new Badge();

        System.out.println(badge.render());
    }
}
```

An inner class instance belongs to an instance of the enclosing class. It can
read the outer object's fields — including private ones — because it holds a
hidden reference to it. That is why creating one needs an outer object to hang
off: `outer.new Badge()`, a syntax you will rarely write and should recognise.

Where the name is ambiguous, `Main.this.label` names the outer object's field
explicitly, in the same way `super` names the parent's.

:::warning
That hidden reference is a real cost and a real bug. An inner class instance
keeps its enclosing object alive for as long as it lives — so a listener, a
comparator or a cached callback declared as an inner class pins the entire
enclosing object in memory, even when nothing else refers to it. It is one of
the classic Java memory leaks, and the fix is nearly always `static`.

If a nested class does not need the outer instance, make it `static`. The
compiler will not tell you; nothing will, until a heap dump does.
:::

## Local: a class declared inside a method

```java run title="Scoped to one method"
public class Main {
    static String describe(int threshold) {
        class Checker {                        // visible only inside this method
            boolean passes(int value) {
                return value >= threshold;     // captures the parameter
            }
        }

        Checker checker = new Checker();
        return "5 passes: " + checker.passes(5) + ", 15 passes: " + checker.passes(15);
    }

    public static void main(String[] args) {
        System.out.println(describe(10));
    }
}
```

A local class exists only within the method that declares it, and can use that
method's locals and parameters. It is rare, and mostly superseded by lambdas.

## Anonymous: declare and instantiate at once

```java run title="A one-off implementation"
import java.util.function.Supplier;

public class Main {
    private final String label = "outer";

    Supplier<String> asAnonymousClass() {
        return new Supplier<String>() {
            @Override
            public String get() {
                return "this is " + this.getClass().getName() + ", label = " + label;
            }
        };
    }

    Supplier<String> asLambda() {
        return () -> "this is " + this.getClass().getName() + ", label = " + label;
    }

    public static void main(String[] args) {
        Main m = new Main();
        System.out.println(m.asAnonymousClass().get());
        System.out.println(m.asLambda().get());
    }
}
```

Look carefully at the two outputs. They differ, and the difference is the one
thing worth remembering about lambdas before Part 6 covers them properly.

In the **anonymous class**, `this` refers to the anonymous object itself — the
class prints as `Main$1`, a name the compiler invented. It is a new class with
a new identity.

In the **lambda**, `this` refers to the *enclosing* instance, and prints as
`Main`. A lambda is not a class of its own and introduces no new scope for
`this`, `super` or local names. It is a piece of code with the surrounding
method's view of the world.

Both read `label` identically, so most of the time the distinction is
invisible. It becomes visible exactly when you write `this` — and an anonymous
class is still required when you need to implement more than one method, or to
subclass something rather than implement a functional interface.

## Captured locals must be effectively final

```java run expect-error title="Capturing a variable that changes"
public class Main {
    public static void main(String[] args) {
        int counter = 1;

        Runnable task = () -> System.out.println(counter);

        counter = 2;
        task.run();
    }
}
```

*local variables referenced from a lambda expression must be final or
effectively final.* "Effectively final" means you never assign to it after its
initialisation — you need not write `final`, only behave as though you had.

The reason is that the lambda captures the *value*, not the variable. A local
lives on the stack and may be gone by the time the lambda runs, so the value is
copied in. If the variable could then change, the copy and the original would
disagree, and the language declines to say which one you meant.

The escape hatch, when you genuinely need shared mutable state, is to capture a
mutable *object* instead — an array of one element, or an `AtomicInteger`. That
works because the reference is what is captured and it never changes. It is
also a strong hint that the design wants revisiting, and Part 8 explains why
sharing mutable state across threads is worse still.

:::quiz
{
  "question": "A cache holds listener objects declared as inner (non-static) classes of a large service object. The service is discarded but the cache lives on. What happens?",
  "options": [
    { "text": "The service cannot be collected — each listener holds a hidden reference to it", "correct": true, "why": "Right. An inner class instance keeps its enclosing instance reachable, so the whole service and everything it refers to stays in memory for as long as any listener does. Making the listener static breaks the link." },
    { "text": "The service is collected, and the listeners throw when used", "correct": false, "why": "Garbage collection never leaves a reachable reference dangling. The listener holds a real reference, so the service stays alive rather than disappearing." },
    { "text": "Nothing — inner classes only reference the outer class, not the instance", "correct": false, "why": "That describes a static nested class. A non-static inner class is attached to an instance, which is what lets it read the outer object's fields." },
    { "text": "The reference is weak, so it is collected under memory pressure", "correct": false, "why": "It is an ordinary strong reference. Weak references exist in java.lang.ref and must be asked for explicitly." }
  ]
}
:::

## Practice

:::exercise choose-the-nesting

:::exercise comparator-by-anonymous-class

:::recap
- A `static` nested class is an ordinary class declared inside another for
  namespacing. It is the right default.
- An inner class is attached to an enclosing *instance*, can read its private
  fields, and is created as `outer.new Inner()`. The hidden reference keeps the
  enclosing object alive, which is a classic memory leak.
- A local class is scoped to one method; an anonymous class declares and
  instantiates an implementation in one expression.
- In an anonymous class `this` is the anonymous object; in a lambda `this` is
  the enclosing instance, because a lambda introduces no new scope.
- A captured local must be effectively final, because the value is copied.
:::
