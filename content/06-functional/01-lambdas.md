---
title: "Lambdas and functional interfaces"
navTitle: "Lambdas"
summary: >-
  A lambda is not a function — it is an instance of an interface with one abstract method. Once you see that, everything else about the syntax follows.
objectives:
  - Say what a functional interface is and what @FunctionalInterface checks
  - Write a lambda for a given target type and explain how the type is inferred
  - Explain effectively-final capture and why it is required
  - Choose the right built-in functional interface, including the primitive ones
status: complete
standard: java21
requires: [the-limits]
---

Java has no function type. There is no way to declare a variable whose type is
"takes an `int`, returns a `String`" — and there never was, not even when
lambdas arrived in Java 8. What arrived instead was a shorter way to write
something Java already had.

## A lambda is an object

```java run title="The same thing, twice"
public class Main {
    interface Greeter {
        String greet(String name);
    }

    public static void main(String[] args) {
        Greeter longhand = new Greeter() {
            @Override
            public String greet(String name) {
                return "Hello, " + name;
            }
        };

        Greeter shorthand = name -> "Hello, " + name;

        System.out.println(longhand.greet("Ada"));
        System.out.println(shorthand.greet("Ada"));
    }
}
```

Both variables hold an object implementing `Greeter`. The second one is written
in nine characters instead of five lines, and that is the entire feature: a
**lambda is an instance of an interface that has exactly one abstract method**.
Such an interface is called a **functional interface**, and the lambda's
parameter list and body become that one method's parameters and body.

This explains the syntax rather than asking you to memorise it. `name` needs no
type because the compiler reads `greet`'s signature and finds `String`. There
is no method name because there is only one method it could be. There is no
`@Override`, no `public`, no braces when the body is a single expression —
every one of those was redundant once the target type was known.

It also explains the limit. `name -> "Hello, " + name` is not a value with a
type of its own; it is only meaningful once you say *what it is an instance
of*. Assign the same text to something else and it means something else:

```java run title="One lambda text, two types"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Function<String, String> asFunction = name -> "Hello, " + name;
        UnaryOperator<String> asOperator = name -> "Hello, " + name;

        System.out.println(asFunction.apply("Ada"));
        System.out.println(asOperator.apply("Grace"));

        // Function<String, String> and UnaryOperator<String> are different
        // types, so this does not compile:
        //     asFunction = asOperator;   // incompatible types
        System.out.println(asFunction.getClass() == asOperator.getClass());
    }
}
```

That last line prints `false`: two identical lambda texts against two different
target types produce two different classes. The text is not the value.

The compiler works from the **target type** — the type the expression is being
assigned to, passed as, or returned as — inwards. A lambda in a position with
no target type is a compile error, which is why `var f = x -> x;` does not
work: `var` needs the expression to have a type of its own, and this one does
not.

## `@FunctionalInterface`

Any interface with one abstract method can be a lambda's target. The annotation
does not make it so; it asks the compiler to check:

```java run expect-error title="Two abstract methods"
@FunctionalInterface
interface Broken {
    void first();
    void second();
}

public class Main {
    public static void main(String[] args) {
        System.out.println("never gets here");
    }
}
```

*Unexpected @FunctionalInterface annotation — multiple non-overriding abstract
methods.* Without the annotation this interface compiles fine; it simply is not
usable as a lambda target, and you find that out at every call site instead of
at the declaration. Put the annotation on interfaces you intend to be
implemented by lambdas, for the same reason you put `@Override` on overrides:
it moves an error from the users to the author.

"One abstract method" has two exemptions worth knowing. `default` and `static`
methods do not count — `Comparator` has a dozen of them and is still
functional. Neither do public methods of `Object`: `Comparator` also declares
`boolean equals(Object)`, and that is not counted, because every implementation
inherits one from `Object` already.

## Capture, and why it must be final

A lambda can use variables from around it:

```java run title="Capturing a local"
import java.util.function.*;

public class Main {
    static Supplier<String> greeterFor(String name) {
        String greeting = "Hello, " + name;
        return () -> greeting;
    }

    public static void main(String[] args) {
        Supplier<String> ada = greeterFor("Ada");
        Supplier<String> grace = greeterFor("Grace");

        System.out.println(ada.get());
        System.out.println(grace.get());
    }
}
```

`greeterFor` returns and its frame disappears, but the returned object still
answers with the right greeting. The lambda **captured** `greeting` — copied
the value into the object it created.

Copied, which is why this is rejected:

```java run expect-error title="A local that changes"
public class Main {
    public static void main(String[] args) {
        int count = 0;
        Runnable printer = () -> System.out.println(count);
        count = 1;
        printer.run();
    }
}
```

*local variables referenced from a lambda expression must be final or
effectively final.* If it compiled, what would it print? The lambda holds a
copy made when it was created, so `0` — while the code reads as though it
should print `1`. Java refuses to offer a variable that silently stops tracking
its variable. "Effectively final" means you never assign to it after
initialisation; you do not have to write `final`, you just have to behave as
though you had.

The restriction is on the *variable*, not the object it refers to:

```java run title="Final reference, mutable object"
import java.util.*;
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        List<String> log = new ArrayList<>();      // never reassigned
        Runnable record = () -> log.add("called");

        record.run();
        record.run();
        System.out.println(log);
    }
}
```

`log` is effectively final — it is never assigned again — so capturing it is
fine, and the list it points at can change all it likes. Chapter 2.2's
distinction between a variable and the object it names is exactly the one the
rule is drawn along.

This is also the standard workaround when you genuinely need a counter: capture
a one-element array or an `AtomicInteger` and mutate through it. Reach for it
sparingly. A lambda that mutates something outside itself is a lambda you
cannot safely hand to a parallel stream, and chapter 6.5 will argue that if you
want to accumulate, a loop usually says so more honestly.

## `this` means the enclosing object

Here is the one place a lambda and an anonymous class genuinely differ in
meaning rather than in length:

```java run title="What this refers to"
public class Main {
    private final String name = "the enclosing object";

    void show() {
        Runnable lambda = () -> System.out.println("lambda:    " + this.name);

        Runnable anon = new Runnable() {
            private final String name = "the anonymous object";

            @Override
            public void run() {
                System.out.println("anonymous: " + this.name);
            }
        };

        lambda.run();
        anon.run();
    }

    public static void main(String[] args) {
        new Main().show();
    }
}
```

An anonymous class is a class, so it has its own `this` and can shadow the
enclosing fields. A lambda is not a new scope in that sense: `this`, `super`
and every name inside it mean what they mean in the surrounding method. This is
almost always what you want, and it is why replacing an anonymous class with a
lambda occasionally changes behaviour rather than just spelling.

## What the compiler actually emits

An anonymous class produces a class file. A lambda does not:

```java run title="Where does a lambda live?"
public class Main {
    public static void main(String[] args) {
        Runnable lambda = () -> {};
        Runnable anon = new Runnable() {
            @Override
            public void run() {}
        };

        System.out.println("lambda: " + lambda.getClass().getName());
        System.out.println("anon:   " + anon.getClass().getName());
    }
}
```

The anonymous class is `Main$1` — a real file on disk, produced by `javac`. The
lambda's class name has a `$$Lambda` in it and a hexadecimal number that
changes from run to run, because that class did not exist until the line ran.

The bytecode shows how:

```java run bytecode title="The invokedynamic instruction"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Supplier<String> constant = () -> "hello";
        System.out.println(constant.get());
    }
}
```

Open the **Bytecode** panel and look at the first instruction of `main`. It is
`invokedynamic`, not `new`. The body of the lambda is compiled into an ordinary
private static method (`lambda$main$0`), and `invokedynamic` asks
`LambdaMetafactory` — at run time, the first time that line executes — to spin
up a class implementing `Supplier` that calls it. Every later execution reuses
the result.

That has a consequence you can observe:

```java run title="A lambda that captures nothing"
import java.util.function.*;

public class Main {
    static Supplier<String> constant() {
        return () -> "hello";
    }

    static Supplier<String> capturing(String word) {
        return () -> word;
    }

    public static void main(String[] args) {
        System.out.println("no capture: " + (constant() == constant()));
        System.out.println("capture:    " + (capturing("hi") == capturing("hi")));
    }
}
```

A lambda that captures nothing has nothing to distinguish one instance from
another, so the JVM hands out the same one every time — `true`. A capturing
lambda has to hold its captured values, so it needs a fresh object per
evaluation — `false`.

Two things follow. Writing `list.forEach(x -> System.out.println(x))` in a hot
loop does not allocate; writing `list.forEach(x -> out.println(prefix + x))`
does. And you must never rely on lambda identity: nothing in the specification
promises either answer, and `==` on two lambdas is a bug waiting for a JVM
upgrade.

## The interfaces you will actually use

You rarely declare your own functional interface, because `java.util.function`
declares the shapes already. Six carry most of the weight:

| Interface | Method | Shape | Typical use |
|---|---|---|---|
| `Function<T,R>` | `R apply(T)` | one in, one out | `map` |
| `Predicate<T>` | `boolean test(T)` | one in, a yes/no | `filter` |
| `Consumer<T>` | `void accept(T)` | one in, nothing out | `forEach` |
| `Supplier<T>` | `T get()` | nothing in, one out | lazy defaults |
| `UnaryOperator<T>` | `T apply(T)` | `Function<T,T>` | `replaceAll` |
| `BiFunction<T,U,R>` | `R apply(T,U)` | two in, one out | `merge`, `reduce` |

`BiPredicate`, `BiConsumer` and `BinaryOperator` complete the pattern. Prefer
these to a hand-written interface: a method taking `Predicate<Order>` composes
with everything in the library, and a method taking your own `OrderTest` does
not.

The exception is when a name would carry meaning that `Function` cannot.
`Comparator<T>` could have been `BiFunction<T,T,Integer>` and is much better as
itself; if your interface is like that — a named concept with its own
`default` methods — declare it.

## Do not box the primitives

Chapter 5.4 explained why `List<int>` is impossible. The same restriction hits
here: `Function<Integer, Integer>` boxes on the way in and on the way out. So
`java.util.function` also ships primitive versions — `IntPredicate`,
`IntUnaryOperator`, `ToIntFunction<T>`, `IntFunction<R>`, `DoubleSupplier` and
about thirty more.

```java run title="Measured: ten million tests"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Predicate<Integer> boxed = n -> n % 2 == 0;
        IntPredicate raw = n -> n % 2 == 0;
        int n = 20_000_000;

        for (int round = 1; round <= 4; round++) {
            long start = System.nanoTime();
            int boxedCount = 0;
            for (int i = 0; i < n; i++) {
                if (boxed.test(i)) boxedCount++;
            }
            long boxedMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            int rawCount = 0;
            for (int i = 0; i < n; i++) {
                if (raw.test(i)) rawCount++;
            }
            long rawMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  Predicate<Integer> " + boxedMs + " ms (" + boxedCount + ")"
                + "   IntPredicate " + rawMs + " ms (" + rawCount + ")");
        }
    }
}
```

`IntPredicate` is flat at 12–13 ms a round on the machine this was written on.
`Predicate<Integer>` ranges from 70 to about 190 ms — five to fifteen times
slower, and, more tellingly, *unstable*. It is allocating twenty million
`Integer` objects per round, so the garbage collector is now part of your
timing.

The instability has a cause you can confirm. The JIT sometimes proves that the
box never escapes the loop and deletes the allocation outright, which is why an
early round can be unusually fast; run the same program with
`-XX:-DoEscapeAnalysis` and that round slows down to match the others. You
cannot predict which rounds get the optimisation, which is the practical point:
when the boxed version is fast, it is fast because a compiler decided to be
kind to you.

Use the primitive interface when the values are primitives. It costs one extra
character of typing and removes the whole question.

## Checked exceptions do not fit

```java run expect-error title="Throwing from a lambda"
import java.util.function.*;

public class Main {
    public static void main(String[] args) {
        Supplier<String> reader = () -> {
            throw new java.io.IOException("disk gone");
        };
        System.out.println(reader.get());
    }
}
```

*unreported exception IOException.* `Supplier.get` declares no checked
exceptions, so neither may an implementation — the ordinary override rule from
chapter 2.6, applied to a lambda. None of `java.util.function` declares any,
which means none of it can be handed a method that throws a checked exception
without wrapping.

There are three answers, in the order you should try them: catch inside the
lambda and turn the failure into a value (an `Optional`, or a result record);
wrap it in an unchecked exception and let it out; or declare your own
functional interface whose method `throws E`. The third is occasionally right
and always more work than it looks, because nothing in the standard library
will accept it.

:::quiz
{
  "question": "Why does `Supplier<String> s = () -> \"x\";` produce the same object every time it is evaluated, while `() -> word` does not?",
  "options": [
    { "text": "A lambda with no captured state has nothing to distinguish two instances, so the runtime is free to reuse one", "correct": true, "why": "Right. `invokedynamic` links once and caches the result; a capturing lambda must build a fresh object to hold what it captured." },
    { "text": "String literals are interned, so the supplier is interned too", "correct": false, "why": "Interning applies to the `String` the lambda returns, not to the `Supplier` object. Replace the body with `new Object()` and the identity result is unchanged." },
    { "text": "The compiler creates a static final field for every non-capturing lambda", "correct": false, "why": "Nothing is created at compile time — the class does not exist until `invokedynamic` runs. The caching happens at the call site, at run time." },
    { "text": "Because `Supplier` is a functional interface and functional interfaces are singletons", "correct": false, "why": "Being functional says nothing about instance count; the capturing lambda in the same program targets a functional interface too and gives a different object each time." }
  ]
}
:::

## Practice

:::exercise lambda-target-types

:::exercise composable-validation

:::recap
- A lambda is an instance of a **functional interface** — an interface with
  exactly one abstract method. `default`, `static` and `Object` methods do not
  count.
- The **target type** supplies the parameter types and the method name, which
  is why a lambda cannot stand alone and `var f = x -> x;` does not compile.
- Captured locals must be **effectively final**, because the lambda holds a
  copy. The object a captured reference points at may still change.
- `this` inside a lambda is the enclosing object; inside an anonymous class it
  is the anonymous instance.
- Lambdas compile to `invokedynamic`, not to a class file. Non-capturing ones
  are reused; capturing ones allocate. Never compare lambdas with `==`.
- Prefer `java.util.function` to hand-written interfaces, and its primitive
  specialisations to boxed type arguments — measured here at five to fifteen
  times.
- A lambda may not throw a checked exception its interface does not declare.
