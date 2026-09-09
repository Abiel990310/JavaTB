---
title: "Classes and objects"
navTitle: "Classes and objects"
summary: >-
  Defining a type of your own: fields that hold its state, constructors that establish it, and the difference between a class and the objects made from it.
objectives:
  - Define a class with fields and constructors and create objects from it
  - Explain why fields have defaults and local variables do not
  - Say what two variables naming one object means for the code that changes it
status: complete
standard: java21
requires: [input-and-output]
---

Everything in Part 1 used types somebody else defined. This part is about
defining your own, and it starts where every Java program eventually starts: a
class with some fields and a way to make one.

A class is a *description*. An object is a thing made from that description.
The distinction sounds pedantic right up until the moment two variables name
one object and a change through one appears through the other — which is where
this chapter ends.

## A class with state

```java run title="A type of your own"
public class Main {
    static class Book {
        String title;
        int pages;
        boolean finished;
    }

    public static void main(String[] args) {
        Book b = new Book();
        b.title = "Dune";
        b.pages = 412;

        System.out.println(b.title + ", " + b.pages + " pages, finished? " + b.finished);
    }
}
```

`Book` declares three **fields**. `new Book()` allocates one object with room
for all three and hands back a reference to it. From chapters 1.4 and 1.5 you
already know what `b` holds: not the book, but an arrow to it.

:::note
`Book` is written as a `static class` nested inside `Main` because every sample
on this site is compiled as a single file called `Main.java`, and a file may
hold only one public top-level class. In your own projects each class normally
gets its own file — `Book.java` holding `public class Book`. Nothing else about
the code changes.
:::

## Fields have defaults; local variables do not

Notice that `finished` printed as `false` without ever being assigned. Fields
are given the zero value for their type, exactly as array slots are: `0`,
`false`, `null`.

Local variables are not:

```java run expect-error title="The compiler insists you assign a local"
public class Main {
    public static void main(String[] args) {
        int local;
        System.out.println(local);
    }
}
```

*variable local might not have been initialized.* The rule is called **definite
assignment**, and it is one of Java's better decisions: the compiler traces
every path to a use and rejects the program unless the variable is assigned on
all of them.

Why the inconsistency? Because an object's fields are allocated as a block and
zeroed in one go, before any of your code touches them — there is no moment at
which reading one could see garbage. A local variable lives on the stack in
space that a previous call may have used for something else, so a language that
allowed you to read it uninitialised would be handing you the previous call's
leftovers. C does exactly that; Java refuses to compile it.

The practical consequence is worth stating plainly: a field that is `null`
because you forgot to set it is a `NullPointerException` waiting somewhere far
from the mistake. Defaults are not a feature to rely on.

## Constructors

```java run title="Establishing the state up front"
public class Main {
    static class Book {
        String title;
        int pages;

        Book(String title, int pages) {
            this.title = title;      // this.title is the field, title is the parameter
            this.pages = pages;
        }

        Book(String title) {
            this(title, 0);          // delegate to the other constructor
        }
    }

    public static void main(String[] args) {
        Book full = new Book("Dune", 412);
        Book stub = new Book("Solaris");

        System.out.println(full.title + " / " + full.pages);
        System.out.println(stub.title + " / " + stub.pages);
    }
}
```

A constructor has the class's name and no return type. It runs immediately
after the object is allocated, and its job is to leave the object in a state
that makes sense.

`this` is the object the constructor is working on. It is needed here because
the parameter is called `title` too, and the parameter wins — `title = title`
would assign the parameter to itself and leave the field `null`. Naming the
parameter after the field and disambiguating with `this` is the conventional
style, and it is deliberate: the alternative, inventing a different name for
the parameter, makes the reader check whether it means the same thing.

`this(...)` as the first statement of a constructor calls another constructor
of the same class. That is how you keep one real constructor and let the others
supply defaults — rather than repeating the assignments and letting them drift
apart.

:::pitfall
Writing any constructor removes the free no-argument one. A class with no
constructors gets a default `Book()` supplied by the compiler; add
`Book(String, int)` and `new Book()` stops compiling. That surprises people
mid-refactor, and the fix is to write the no-argument constructor explicitly if
you still want it.
:::

## Instance and static

```java run title="Which things belong to the object"
public class Main {
    static class Counter {
        static int created = 0;      // one, shared by the whole class
        int id;                      // one per object

        Counter() {
            created++;
            this.id = created;
        }
    }

    public static void main(String[] args) {
        Counter a = new Counter();
        Counter b = new Counter();
        Counter c = new Counter();

        System.out.println("ids: " + a.id + ", " + b.id + ", " + c.id);
        System.out.println("created: " + Counter.created);
    }
}
```

A `static` field belongs to the class: there is exactly one, no matter how many
objects exist. An instance field belongs to the object: each one has its own.
The same split applies to methods, which is why `main` is `static` — it has to
run before any object exists.

Access a static member through the class name, `Counter.created`, rather than
through an object. Java permits `a.created`, but it reads as though it were per
object and it is not.

## Two names, one object

```java run title="The consequence of a reference"
public class Main {
    static class Book {
        String title;
        int pages;

        Book(String title, int pages) {
            this.title = title;
            this.pages = pages;
        }
    }

    public static void main(String[] args) {
        Book original = new Book("Dune", 412);
        Book alias = original;          // copies the arrow, not the book
        Book separate = new Book("Dune", 412);

        alias.pages = 999;

        System.out.println("original.pages    " + original.pages);
        System.out.println("original == alias " + (original == alias));
        System.out.println("original == separate " + (original == separate));
        System.out.println("default toString: " + original);
    }
}
```

`alias = original` copies the reference. There is one book and two names for
it, so a change through either is visible through both. `separate` is a second
object with identical contents, and `==` says `false` — because `==` on
references asks "the same object?", which for `original` and `separate` it is
not.

:::memviz
{
  "title": "Assignment copies the arrow",
  "steps": [
    {
      "caption": "new Book(\"Dune\", 412) allocates an object; original points at it.",
      "line": 1,
      "stack": [
        { "id": "orig", "name": "original", "type": "Book",
          "fields": [{ "k": "ref", "v": "→", "anchor": "orig.ref" }] }
      ],
      "heap": [ { "id": "b1", "value": "Book{title=\"Dune\", pages=412}", "state": "new" } ],
      "arrows": [ { "from": "orig.ref", "to": "b1" } ]
    },
    {
      "caption": "alias = original copies the arrow. Still one book.",
      "line": 2,
      "stack": [
        { "id": "orig", "name": "original", "type": "Book",
          "fields": [{ "k": "ref", "v": "→", "anchor": "orig.ref" }] },
        { "id": "al", "name": "alias", "type": "Book", "state": "new",
          "fields": [{ "k": "ref", "v": "→", "anchor": "al.ref" }] }
      ],
      "heap": [ { "id": "b1", "value": "Book{title=\"Dune\", pages=412}" } ],
      "arrows": [ { "from": "orig.ref", "to": "b1" }, { "from": "al.ref", "to": "b1" } ]
    },
    {
      "caption": "alias.pages = 999 changes the one object both names reach.",
      "line": 3,
      "stack": [
        { "id": "orig", "name": "original", "type": "Book",
          "fields": [{ "k": "ref", "v": "→", "anchor": "orig.ref" }] },
        { "id": "al", "name": "alias", "type": "Book",
          "fields": [{ "k": "ref", "v": "→", "anchor": "al.ref" }] }
      ],
      "heap": [ { "id": "b1", "value": "Book{title=\"Dune\", pages=999}", "state": "new" } ],
      "arrows": [ { "from": "orig.ref", "to": "b1" }, { "from": "al.ref", "to": "b1" } ]
    },
    {
      "caption": "separate is a different object with equal contents. == is false between them.",
      "line": 4,
      "stack": [
        { "id": "orig", "name": "original", "type": "Book",
          "fields": [{ "k": "ref", "v": "→", "anchor": "orig.ref" }] },
        { "id": "sep", "name": "separate", "type": "Book", "state": "new",
          "fields": [{ "k": "ref", "v": "→", "anchor": "sep.ref" }] }
      ],
      "heap": [
        { "id": "b1", "value": "Book{title=\"Dune\", pages=999}" },
        { "id": "b2", "value": "Book{title=\"Dune\", pages=412}", "state": "new" }
      ],
      "arrows": [ { "from": "orig.ref", "to": "b1" }, { "from": "sep.ref", "to": "b2" } ]
    }
  ]
}
:::

That last line of output — something like `Main$Book@7440e464` — is the default
`toString` every object inherits: the class name and an identity hash. It is
almost never what you want to show anyone, and chapter 2.4 is about replacing
it, along with the `equals` that would let `separate` count as equal to
`original`.

:::quiz
{
  "question": "A class has fields but no constructor. You add `Book(String title)`. What happens to `new Book()`?",
  "options": [
    { "text": "It stops compiling — the free no-argument constructor is gone", "correct": true, "why": "Right. The compiler supplies a default no-argument constructor only when a class declares none at all. Declaring any constructor withdraws that offer." },
    { "text": "It still works, leaving all fields at their defaults", "correct": false, "why": "That is true only while the class declares no constructors of its own. Once one exists, it is the only one." },
    { "text": "It works but the compiler warns", "correct": false, "why": "It is an error, not a warning: constructor Book in class Book cannot be applied to given types." },
    { "text": "It works because every class inherits a no-argument constructor from Object", "correct": false, "why": "Constructors are not inherited. A subclass's constructor calls the superclass one, which is a different thing from having it." }
  ]
}
:::

## Practice

:::exercise build-a-rectangle

:::exercise counter-of-instances

:::recap
- A class describes a type; an object is one thing made from that description,
  reached through a reference.
- Fields are zeroed automatically — `0`, `false`, `null` — because they are
  allocated as a block. Local variables are not, and the compiler enforces
  definite assignment.
- A constructor establishes the state. `this.x = x` distinguishes field from
  parameter, and `this(...)` delegates to another constructor.
- Declaring any constructor removes the free no-argument one.
- `static` members belong to the class and exist once; instance members belong
  to the object and exist per object.
- Assignment copies the reference, so two variables can name one object and see
  each other's changes. `==` asks whether they are the same object, never
  whether the contents match.
:::
