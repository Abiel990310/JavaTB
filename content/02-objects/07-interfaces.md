---
title: "Interfaces"
navTitle: "Interfaces"
summary: >-
  Declaring what a type can do without saying how, taking on several roles at once, and the compromise that let the library add methods to interfaces already in use.
objectives:
  - Declare and implement an interface, and say how it differs from a class
  - Explain why default methods exist and what they cost
  - Resolve a conflict when two interfaces supply the same default
status: complete
standard: java21
requires: [polymorphism]
---

A class says what something *is* and how it works. An interface says only what
it can *do*, and leaves the how to whoever implements it. That sounds like a
small distinction and it is the one that makes large Java systems possible: code
written against an interface is written against a promise, and any type that
keeps the promise can be handed to it — including types that did not exist when
that code was written.

## Declaring a capability

```java run title="One interface, two unrelated implementations"
interface Priced {
    long pricePence();
}

class Book implements Priced {
    private final String title;
    private final long pence;

    Book(String title, long pence) {
        this.title = title;
        this.pence = pence;
    }

    @Override
    public long pricePence() {
        return pence;
    }

    @Override
    public String toString() {
        return title;
    }
}

class DeliverySlot implements Priced {
    private final int minutes;

    DeliverySlot(int minutes) {
        this.minutes = minutes;
    }

    @Override
    public long pricePence() {
        return minutes < 60 ? 499 : 199;   // faster costs more
    }

    @Override
    public String toString() {
        return minutes + "-minute delivery";
    }
}

public class Main {
    static long total(Priced[] items) {
        long sum = 0;
        for (Priced p : items) {
            sum += p.pricePence();
        }
        return sum;
    }

    public static void main(String[] args) {
        Priced[] basket = { new Book("Dune", 899), new DeliverySlot(30) };

        for (Priced p : basket) {
            System.out.println(p + " — " + p.pricePence() + "p");
        }
        System.out.println("total " + total(basket) + "p");
    }
}
```

A `Book` and a `DeliverySlot` have nothing in common and no useful shared
parent. They can still be totalled together, because `total` does not ask what
they are — only that they can be priced.

Interface methods are implicitly `public`, which is why the implementations say
`public long pricePence()`. Leaving it off is a compile error about attempting
to assign weaker access, and it catches everyone once.

## Several roles at once

A class has exactly one parent and may implement any number of interfaces:

```java run title="Two capabilities, one class"
interface Priced {
    long pricePence();
}

interface Discountable {
    long discountPence();
}

class Book implements Priced, Discountable {
    private final long pence;

    Book(long pence) {
        this.pence = pence;
    }

    @Override
    public long pricePence() {
        return pence;
    }

    @Override
    public long discountPence() {
        return pence / 10;
    }
}

public class Main {
    public static void main(String[] args) {
        Book b = new Book(1000);

        Priced asPriced = b;
        Discountable asDiscountable = b;

        System.out.println(asPriced.pricePence() + "p, save " + asDiscountable.discountPence() + "p");
        System.out.println("one object, both types: "
                           + (b instanceof Priced) + " / " + (b instanceof Discountable));
    }
}
```

This is why interfaces, and not multiple inheritance of classes, are Java's
answer to "this thing plays several roles". A role is a set of operations, not
a set of fields, and interfaces carry no state — so combining them raises no
question about whose fields you get.

## Default methods, and why they exist

Before Java 8, adding a method to an interface broke every existing
implementation. That is not a theoretical concern: when the library wanted to
add `forEach` to `Collection`, every `Collection` in the world would have
stopped compiling.

The compromise was the **default method** — an interface method with a body,
which implementations inherit unless they override it.

```java run title="A body in an interface"
interface Greeter {
    String name();                                  // implementations must supply this

    default String greet() {                        // they get this free
        return "Hello, " + name() + PUNCTUATION;
    }

    static Greeter of(String name) {                // a factory on the interface itself
        return () -> name;
    }

    String PUNCTUATION = "!";                       // implicitly public static final
}

class Formal implements Greeter {
    @Override
    public String name() {
        return "Dr Lovelace";
    }

    @Override
    public String greet() {
        return "Good evening, " + name();           // overriding the default
    }
}

public class Main {
    public static void main(String[] args) {
        System.out.println(Greeter.of("Grace").greet());
        System.out.println(new Formal().greet());
    }
}
```

Three things there are worth naming.

`default` gives a body that implementations inherit — `Greeter.of("Grace")`
supplies only `name()` and gets `greet()` for nothing.

`static` methods on an interface belong to the interface itself and are not
inherited. They are the natural home for factories, which used to require a
separate `Greeters` utility class.

A field in an interface is implicitly `public static final` — a constant. An
interface still holds no per-object state, and a constant here is a design
smell more often than not: it becomes part of the public API of every
implementing class.

:::note
`() -> name` is a **lambda**, standing in for an interface with a single
abstract method. `Greeter` qualifies, since `greet` has a default and only
`name()` is left unimplemented. Part 6 is about this properly; it appears here
because it is the shortest way to make an implementation inline.
:::

## When two defaults collide

```java run expect-error title="The compiler will not choose for you"
interface Greeter {
    default String greet() {
        return "Hello";
    }
}

interface Shouter {
    default String greet() {
        return "OI";
    }
}

class Both implements Greeter, Shouter {
}

public class Main {
    public static void main(String[] args) {
        System.out.println(new Both().greet());
    }
}
```

*class Both inherits unrelated defaults for greet() from types Greeter and
Shouter.* Java refuses to guess. The fix is to override and say which you mean,
or combine them:

```java run title="Saying which one you meant"
interface Greeter {
    default String greet() {
        return "Hello";
    }
}

interface Shouter {
    default String greet() {
        return "OI";
    }
}

class Both implements Greeter, Shouter {
    @Override
    public String greet() {
        return Greeter.super.greet() + " / " + Shouter.super.greet();
    }
}

public class Main {
    public static void main(String[] args) {
        System.out.println(new Both().greet());
    }
}
```

`Greeter.super.greet()` names which inherited default you want — the only place
in Java where `super` takes a qualifier.

:::pitfall
Default methods make interfaces more powerful and are not a licence to put
behaviour in them by preference. A default cannot see any state, so it can only
be written in terms of the interface's own abstract methods — and one that is
overridden by most implementations was never a sensible default. Use them for
what they were designed for: adding to an interface that already has
implementations you cannot change.
:::

## Interface or abstract class?

Both let you write code against a general type. The practical differences:

| | Interface | Abstract class |
|---|---|---|
| How many can a class have? | Any number | One |
| Can it hold state? | No (constants only) | Yes |
| Can it have a constructor? | No | Yes |
| Method bodies? | `default` and `static` | Any |
| Access levels? | `public` (and `private` helpers) | All four |

The rule of thumb: **an interface for a capability, an abstract class for a
partial implementation.** `Priced` is a capability — anything at all might be
priced. A half-written `AbstractHttpHandler` that manages a connection and
leaves one method for you is a partial implementation, and it needs fields.

Chapter 2.8 takes abstract classes properly.

:::quiz
{
  "question": "An interface adds a new abstract method. What happens to existing classes that implement it?",
  "options": [
    { "text": "They stop compiling until each supplies the method", "correct": true, "why": "Right — and that is exactly the problem default methods were introduced to solve. Adding a default instead lets existing implementations keep compiling and inherit a body." },
    { "text": "They keep compiling and inherit an empty implementation", "correct": false, "why": "Only a default method supplies a body. A plain abstract method is a requirement, and an implementation that does not meet it is not a valid class." },
    { "text": "They keep compiling but throw at run time when it is called", "correct": false, "why": "That is what an abstract method in a class would do if the JVM allowed it, and it does not. Java catches this at compile time." },
    { "text": "Only classes in other packages break", "correct": false, "why": "Implementing an interface is a compile-time obligation regardless of package. Access levels change who may implement it, not what implementing requires." }
  ]
}
:::

## Practice

:::exercise sortable-by-interface

:::exercise default-method-audit

:::recap
- An interface declares what a type can do. Any class that keeps the promise
  can be used by code written against it, including classes written later.
- A class has one parent and any number of interfaces, which is how a type
  takes on several roles. Interfaces hold no per-object state, so combining
  them raises no question about fields.
- Interface methods are implicitly `public`; interface fields are implicitly
  `public static final`.
- `default` methods exist so that an interface can gain a method without
  breaking existing implementations. They can only use the interface's own
  abstract methods, having no state to see.
- Two unrelated defaults with the same signature are a compile error. Override
  and use `Greeter.super.greet()` to say which you meant.
- Interface for a capability; abstract class for a partial implementation that
  needs state.
:::
