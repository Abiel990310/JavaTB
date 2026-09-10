---
title: "Inheritance"
navTitle: "Inheritance"
summary: >-
  Building one class on another: what super does, the order a subclass is constructed in, and the two things that look like overriding but are not.
objectives:
  - Write a subclass with a constructor that initialises its parent correctly
  - Explain the order in which a subclass is built, and what is unsafe during it
  - Distinguish overriding a method from hiding a field
status: complete
standard: java21
requires: [equals-and-hashcode]
---

Inheritance lets one class start from another: it gets the parent's fields and
methods, and may add or replace. It is the oldest idea in object-oriented
programming and the most frequently misused, so this chapter is mostly about
the mechanism, and chapter 2.8 is about when to reach for it at all.

Every class you have written already has a parent. A class with no `extends`
extends `Object`, which is where `equals`, `hashCode` and `toString` came from
in the last chapter.

## extends and super

```java run title="A subclass adding to its parent"
class Animal {
    private final String name;

    Animal(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    String speak() {
        return "...";
    }

    @Override
    public String toString() {
        return name + " says " + speak();
    }
}

class Dog extends Animal {
    private final String breed;

    Dog(String name, String breed) {
        super(name);              // must come first
        this.breed = breed;
    }

    @Override
    String speak() {
        return "woof";
    }

    String breed() {
        return breed;
    }
}

public class Main {
    public static void main(String[] args) {
        Dog d = new Dog("Rex", "collie");

        System.out.println(d);
        System.out.println(d.name() + " is a " + d.breed());
        System.out.println("a Dog is an Animal: " + (d instanceof Animal));
    }
}
```

`super(name)` calls the parent's constructor, and it must be the first
statement — a subclass cannot exist before the part it is built on does. If you
leave it out, the compiler inserts `super()` for you, which is fine when the
parent has a no-argument constructor and a compile error when it does not.

Notice `toString` on `Animal` calling `speak()`, and the output saying `woof`.
The parent's code calls the child's method, because the object *is* a `Dog`.
That is dynamic dispatch, and chapter 2.6 is about how it works.

## The order a subclass is built in

```java run title="A method called too early"
class Animal {
    Animal() {
        System.out.println("  Animal constructor sees: " + describe());
    }

    String describe() {
        return "an animal";
    }
}

class Dog extends Animal {
    private String name = "Rex";

    Dog() {
        super();
        System.out.println("  Dog constructor sees: " + describe());
    }

    @Override
    String describe() {
        return "a dog called " + name;
    }
}

public class Main {
    public static void main(String[] args) {
        System.out.println("constructing:");
        Dog d = new Dog();
        System.out.println("afterwards:   " + d.describe());
    }
}
```

The first line prints **a dog called null**.

Construction runs strictly outside-in: the parent constructor finishes before
the subclass's field initialisers run. So when `Animal`'s constructor calls
`describe()`, dispatch correctly selects `Dog`'s override — and that override
reads `name`, which has not been assigned yet and still holds its default.

:::warning
Never call an overridable method from a constructor. The override will run
against a half-built object, and the bug appears only in subclasses, only
sometimes, and never in the class that caused it. Make such methods `private`
or `final`, or move the work out of the constructor entirely.
:::

## Overriding versus hiding

```java run title="Two things that look the same and are not"
class Animal {
    String kind = "animal";

    String describe() {
        return "an animal";
    }
}

class Dog extends Animal {
    String kind = "dog";          // hides the parent's field

    @Override
    String describe() {           // overrides the parent's method
        return "a dog";
    }
}

public class Main {
    public static void main(String[] args) {
        Dog dog = new Dog();
        Animal asAnimal = dog;    // one object, two declared types

        System.out.println("method through Dog:    " + dog.describe());
        System.out.println("method through Animal: " + asAnimal.describe());
        System.out.println("field through Dog:     " + dog.kind);
        System.out.println("field through Animal:  " + asAnimal.kind);
    }
}
```

One object. The method gives the same answer through both names; the field does
not.

**Methods are resolved by the object's actual type, at run time.** **Fields are
resolved by the variable's declared type, at compile time.** A subclass field
with the same name as its parent's does not replace it — both exist, and which
one you get depends on how you are looking at the object.

This is almost never useful and is a reliable source of confusion. Do not
declare a field with the same name as one in a parent class. If you want the
parent's value to differ, give the parent a constructor parameter or an
overridable method that returns it.

## Reaching the parent's version

```java run title="super, for extending rather than replacing"
class Logger {
    String format(String message) {
        return "[log] " + message;
    }
}

class TimestampLogger extends Logger {
    @Override
    String format(String message) {
        return super.format(message) + " (at t=0)";
    }
}

public class Main {
    public static void main(String[] args) {
        System.out.println(new TimestampLogger().format("started"));
    }
}
```

`super.format(...)` calls the parent's implementation from inside the override.
It is the difference between *replacing* behaviour and *extending* it, and it
is the only way to reach a method you have overridden — `this.format(...)`
would call itself forever.

## What a subclass may not do

- **Narrow access.** An override may widen visibility but never restrict it; a
  `public` method cannot be overridden as `private`, because callers holding a
  parent reference are entitled to it.
- **Override a `final` method.** `final` on a method means "this behaviour is
  part of the contract, not a suggestion".
- **Extend a `final` class.** `String` is `final`, which is why nobody can
  subclass it and break the immutability everything relies on.
- **Extend more than one class.** Java has single inheritance for classes.
  Interfaces, in chapter 2.7, are how a type takes on several roles.

:::quiz
{
  "question": "A parent constructor calls a method that the child overrides, and the child's override reads a field the child initialises inline. What does that field hold during the parent's constructor?",
  "options": [
    { "text": "Its default — null or zero — because the child's initialisers have not run yet", "correct": true, "why": "Right. Construction runs outside-in: the parent's constructor body completes before the child's field initialisers and constructor body execute. Dispatch still finds the override, so it runs against a half-built object." },
    { "text": "Its assigned value, because field initialisers run before any constructor", "correct": false, "why": "They run before the *child's* constructor body, but after the parent's constructor has finished — which is exactly the window in which this goes wrong." },
    { "text": "The parent's version of the method runs, so the field is never read", "correct": false, "why": "Overriding is not suspended during construction. The object's type is already Dog, and dispatch selects the override." },
    { "text": "It does not compile — calling an overridable method from a constructor is an error", "correct": false, "why": "It compiles. Some tools warn about it, and javac has a this-escape lint for exactly this, but the language permits it." }
  ]
}
:::

## Practice

:::exercise extend-the-account

:::exercise safe-construction

:::recap
- A class with no `extends` extends `Object`. `super(...)` calls the parent
  constructor and must be the first statement.
- Construction runs outside-in, so a parent constructor that calls an
  overridable method runs the override against a half-initialised object.
- Methods dispatch on the object's actual type; fields resolve on the
  variable's declared type. A same-named field in a subclass hides rather than
  overrides, and should be avoided.
- `super.method()` extends the parent's behaviour instead of replacing it.
- An override may not narrow access; `final` methods and classes cannot be
  overridden or extended; a class has exactly one parent.
:::
