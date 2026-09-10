---
title: "Class loading and initialisation order"
navTitle: "Class loading"
summary: >-
  A class is initialised the first time you touch it — except when the compiler has already copied the value into your code, and except when it is halfway through being initialised already.
objectives:
  - List what does and does not trigger class initialisation
  - Explain why a static final constant does not load its class
  - Predict the order of static and instance initialisers
  - Recognise the two initialisation hazards: circular clinit and this-escape
status: complete
standard: java21
requires: [stack-and-heap]
---

A class goes through three stages before it can be used. **Loading** finds the
bytes and makes a `Class` object. **Linking** verifies the bytecode, allocates
storage for the static fields and gives them their default values (`0`,
`false`, `null`), and resolves symbolic references. **Initialisation** runs the
static field initialisers and `static` blocks, in the order they appear in the
source.

Only the last one runs your code, and the JVM puts it off as long as it can.

## What triggers initialisation

```java run title="First touch"
public class Main {
    static class Late {
        static {
            System.out.println("  >>> Late was initialised");
        }

        static int value = 42;
    }

    public static void main(String[] args) {
        System.out.println("declaring a variable of the type:");
        Late unused;

        System.out.println("making an array of the type:");
        Late[] array = new Late[3];
        System.out.println("  array length " + array.length);

        System.out.println("reading a static field:");
        System.out.println("  " + Late.value);
    }
}
```

Naming a type does not initialise it. Making an array of it does not either —
`new Late[3]` allocates three null slots and needs to know nothing about
`Late`. Reading `Late.value` does.

The full list of triggers is short: creating an instance, reading or writing a
static field that is not a compile-time constant, calling a static method,
initialising a subclass, and reflection that asks for it. Everything else
leaves the class alone.

## The constant that isn't a field access

```java run title="A read that never touches the class"
public class Main {
    static class Holder {
        static final String CONSTANT = "known at compile time";
        static final String COMPUTED = "known at ".concat("run time");

        static {
            System.out.println("  >>> Holder was initialised");
        }
    }

    public static void main(String[] args) {
        System.out.println("reading CONSTANT:");
        System.out.println("  " + Holder.CONSTANT);

        System.out.println("reading COMPUTED:");
        System.out.println("  " + Holder.COMPUTED);
    }
}
```

The first read prints the value without initialising `Holder` at all. A
`static final` field of a primitive or `String` type whose initialiser is a
**constant expression** is a *compile-time constant*: `javac` copies the value
into every class that reads it, and no field access survives into the
bytecode. `COMPUTED` uses a method call, so it is not constant, so reading it
is a real field access and the class initialises.

Two consequences that bite in practice:

- **Changing a constant means recompiling its readers.** Ship a new version of
  `Holder` with `CONSTANT = "v2"` and every class compiled against the old
  value keeps printing `"v1"` until it is recompiled too. This is why a
  library's public constants are effectively frozen once released.
- **You cannot use a constant to force initialisation**, and you cannot use one
  to observe it. `static final int VERSION = 3;` in a class whose static block
  registers a driver will never run that block.

## Order, exactly

```java run title="Static then instance, super then sub"
public class Main {
    static class Base {
        static {
            System.out.println("2  Base static block");
        }

        {
            System.out.println("4  Base instance initialiser");
        }

        Base() {
            System.out.println("5  Base constructor");
        }
    }

    static class Sub extends Base {
        static {
            System.out.println("3  Sub static block");
        }

        private final String field = report("6  Sub field initialiser");

        {
            System.out.println("7  Sub instance initialiser");
        }

        Sub() {
            System.out.println("8  Sub constructor body");
        }

        static String report(String message) {
            System.out.println(message);
            return "done";
        }
    }

    public static void main(String[] args) {
        System.out.println("1  about to call new Sub()");
        new Sub();
        System.out.println("9  again, statics do not repeat:");
        new Sub();
    }
}
```

The first line printed is `1`, not `2`: neither class does anything until
`new Sub()` runs. Then the rules, in full:

1. A class's superclass is initialised before it is.
2. Static initialisers run **once**, in source order, at first active use.
3. On `new`, the superclass constructor runs first — implicitly, if you did not
   write `super(...)`.
4. Then the subclass's instance field initialisers and instance initialiser
   blocks run, interleaved in source order.
5. Then the constructor body.

Point 4 is the one people get wrong. Field initialisers are not part of the
constructor body; they run *before* it, which is why a constructor can safely
overwrite a field its initialiser just set, and why the two run in an order
that source position — not declaration kind — decides.

## Hazard one: `this` escaping a constructor

Rule 3 plus polymorphism gives you this:

```java run title="A final field observed as null"
public class Main {
    static class Base {
        Base() {
            System.out.println("Base constructor sees: " + describe());
        }

        String describe() {
            return "Base";
        }
    }

    static class Sub extends Base {
        private final String name;
        private final int size;

        Sub(String name) {
            super();
            this.name = name;
            this.size = name.length();
        }

        @Override
        String describe() {
            return "name = " + name + ", size = " + size;
        }
    }

    public static void main(String[] args) {
        Sub sub = new Sub("hello");
        System.out.println("afterwards:        " + sub.describe());
    }
}
```

`name = null, size = 0`. Both fields are `final` and both are observed at their
default values, because `super()` runs before the subclass has assigned
anything — and `describe()` is virtual, so `Base`'s constructor calls `Sub`'s
override.

The rule: **never call an overridable method from a constructor.** Make the
method `private`, `static` or `final`, or move the work out of the constructor.
The same applies to registering `this` with anything — a listener list, a
cache, another thread — before the constructor finishes; chapter 2.11's
argument for `final` classes and chapter 7.1's note about `Cleaner` actions are
the same hazard from different directions.

`javac` will tell you, when it can: compile a *public* class that calls an
overridable method from its constructor and `-Xlint:this-escape` reports
*possible 'this' escape before subclass is fully initialized*. The nested
classes above do not trigger it, because the compiler can see every subclass in
the file and prove there is no problem — which is a good illustration of why
the warning is about *subclassable* classes rather than about constructors.

## Hazard two: two classes initialising each other

```java run title="A constant observed as zero"
public class Main {
    static class A {
        static final int FROM_B = B.value();
        static final int VALUE = Integer.parseInt("1");

        static int value() {
            return VALUE;
        }
    }

    static class B {
        static final int FROM_A = A.value();
        static final int VALUE = Integer.parseInt("2");

        static int value() {
            return VALUE;
        }
    }

    public static void main(String[] args) {
        System.out.println("A.FROM_B = " + A.FROM_B + "   (B.VALUE is " + B.VALUE + ")");
        System.out.println("B.FROM_A = " + A.VALUE + " ... no: " + B.FROM_A);
    }
}
```

`B.FROM_A` is **0**. Touching `A` starts initialising it; its first field calls
into `B`, which starts initialising and asks `A` for `VALUE` — but `A` is
already *in progress* on this thread, so the JVM does not restart it and does
not block. `B` reads the prepared-but-unassigned default, `0`, and stores it in
a `static final` field forever.

No exception, no warning, and the answer depends on which class you happened to
touch first. There is no language feature that fixes this; the fix is to not
have static initialisers that reach into each other. If two classes must know
about each other at startup, move the wiring into a third place that runs after
both are loaded.

## A failed initialiser fails forever

```java run expect-throw title="Once bitten"
public class Main {
    static class Broken {
        static final int VALUE;

        static {
            VALUE = 1 / Integer.parseInt("0");
        }
    }

    public static void main(String[] args) {
        try {
            System.out.println(Broken.VALUE);
        } catch (Throwable first) {
            System.out.println("first attempt:  " + first.getClass().getSimpleName()
                + " caused by " + first.getCause().getClass().getSimpleName());
        }

        System.out.println(Broken.VALUE);
    }
}
```

The first touch throws `ExceptionInInitializerError`, wrapping the
`ArithmeticException` that actually happened. The second throws
`NoClassDefFoundError` — the class is marked erroneous and can never be
initialised again in this JVM, and the message no longer mentions the real
cause.

This is the reason a stack trace reading `NoClassDefFoundError: Could not
initialize class Foo` is so frustrating: it is almost never a missing class. It
means `Foo`'s static initialiser threw *earlier*, and the log entry you want is
the first one. Search the log upwards for `ExceptionInInitializerError`.

## Laziness you can use

Because initialisation is lazy and thread-safe — the JVM guarantees a class's
`static` initialiser runs exactly once, with proper synchronisation — you get a
lazy singleton for free:

```java run title="The holder idiom"
public class Main {
    static final class Service {
        private static final class Holder {
            static {
                System.out.println("  >>> Holder initialised, building the service");
            }

            static final Service INSTANCE = new Service();
        }

        static Service instance() {
            return Holder.INSTANCE;
        }

        static String cheapCall() {
            return "no instance needed";
        }
    }

    public static void main(String[] args) {
        System.out.println("calling something that does not need the instance:");
        System.out.println("  " + Service.cheapCall());

        System.out.println("calling instance():");
        System.out.println("  got " + Service.instance().getClass().getSimpleName());
    }
}
```

`Holder` is initialised the first time `Holder.INSTANCE` is read, and not
before — so `cheapCall()` costs nothing. No `synchronized`, no double-checked
locking, no `volatile`: the class initialisation lock does all of it, and it is
one of the very few pieces of free thread-safety in the language.

Reflection can opt out of the trigger entirely:
`Class.forName("Some.Class", false, loader)` loads and links without
initialising, which is how tools inspect classes they do not want to run.
`Class.forName(name)` — the one-argument version — *does* initialise.

:::quiz
{
  "question": "`static final String NAME = \"widget\";` in class `Config`, read from another class as `Config.NAME`. Does reading it initialise `Config`?",
  "options": [
    { "text": "No — it is a compile-time constant, so javac copied the value into the reading class and no field access remains", "correct": true, "why": "Right, and the consequence is that changing NAME requires recompiling every class that reads it, not just Config." },
    { "text": "Yes — reading any static field is an active use that triggers initialisation", "correct": false, "why": "True for most static fields, but a static final of primitive or String type with a constant initialiser is inlined and never read at run time." },
    { "text": "Only if Config has a static initialiser block", "correct": false, "why": "Whether the class has a static block does not change how the constant is compiled; the read is gone either way." },
    { "text": "Only the first time, after which the value is cached", "correct": false, "why": "There is no caching involved — the value was substituted at compile time, so there is no first time." }
  ]
}
:::

## Practice

:::exercise predict-the-order

:::exercise safe-construction-order

:::recap
- Loading finds the bytes, linking prepares static fields at their defaults,
  and initialisation runs your static code — lazily, at first active use.
- Triggers: `new`, a non-constant static field access, a static method call,
  subclass initialisation, reflection. Not: declaring a variable, or making an
  array.
- A `static final` primitive or `String` with a constant initialiser is inlined
  by `javac`, so reading it never touches the class — and changing it means
  recompiling every reader.
- Order: superclass before subclass; static once at first use; then instance
  field initialisers and instance blocks in source order; then the constructor
  body.
- Never call an overridable method from a constructor — the subclass's `final`
  fields will be `null` and `0`.
- Two classes whose static initialisers reach into each other will observe a
  default value, silently, with the answer depending on which was touched
  first.
- A static initialiser that throws gives `ExceptionInInitializerError` once and
  `NoClassDefFoundError` forever after; look upwards in the log.
- The holder idiom gets a lazy, thread-safe singleton out of the class
  initialisation lock, with no synchronisation of your own.
