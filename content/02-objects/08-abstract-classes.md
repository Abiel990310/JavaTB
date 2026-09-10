---
title: "Abstract classes"
navTitle: "Abstract classes"
summary: >-
  Declaring a method without answering it, sharing the state and the skeleton that subclasses fill in, and choosing between this and an interface.
objectives:
  - Write an abstract class with shared state and an abstract method
  - Explain what the compiler enforces about abstract types
  - Choose between an abstract class and an interface for a given job
status: complete
standard: java21
requires: [interfaces]
---

Chapter 2.6 left `Employee.monthlyPay()` returning zero — a placeholder that
exists only because the parent had to return something, and a bug waiting for
whoever forgets to override it. An abstract class is how you say "every
subclass answers this, and I will not" and have the compiler enforce it.

## Declaring without answering

```java run title="A skeleton with one hole in it"
abstract class Report {
    private final String title;

    Report(String title) {                      // abstract classes have constructors
        this.title = title;
    }

    abstract String body();                     // no body, no braces, just a semicolon

    final String render() {                     // written once, for every subclass
        return "== " + title + " ==\n" + body();
    }
}

class Sales extends Report {
    private final int percent;

    Sales(int percent) {
        super("Sales");
        this.percent = percent;
    }

    @Override
    String body() {
        return "revenue up " + percent + "%";
    }
}

class Staffing extends Report {
    Staffing() {
        super("Staffing");
    }

    @Override
    String body() {
        return "three vacancies";
    }
}

public class Main {
    public static void main(String[] args) {
        Report[] reports = { new Sales(3), new Staffing() };
        for (Report r : reports) {
            System.out.println(r.render());
        }
    }
}
```

`Report` holds a field, has a constructor, and provides a finished `render()`.
What it cannot do is say what a body contains — so it declares `body()`
abstract and lets each subclass answer.

This shape has a name, the **template method**: a `final` method in the parent
fixes the sequence of steps, and abstract methods leave the varying parts to
subclasses. `render()` is `final` deliberately — the parent is promising that
every report is titled the same way, and a subclass that could override it
could break that promise.

## What the compiler enforces

```java run expect-error title="An abstract class is not a thing you can have"
abstract class Report {
    abstract String body();
}

public class Main {
    public static void main(String[] args) {
        Report r = new Report();
        System.out.println(r.body());
    }
}
```

*Report is abstract; cannot be instantiated.* There is no object it could
make — `body()` has no implementation to run. You may still *declare* a
variable of the type, and that is the whole point: `Report[] reports` above
holds objects whose classes are concrete.

```java run expect-error title="A concrete subclass must fill every hole"
abstract class Report {
    abstract String body();
}

class Empty extends Report {
}

public class Main {
    public static void main(String[] args) {
        System.out.println(new Empty());
    }
}
```

*Empty is not abstract and does not override abstract method body().* The
alternative is for `Empty` to be declared `abstract` too, passing the
obligation further down. Somewhere at the bottom, a concrete class has to
answer.

That is the guarantee chapter 2.6's payroll lacked. With `Employee` abstract
and `monthlyPay()` abstract, `Hourly`'s accidental overload becomes a compile
error rather than a silent zero.

## Abstract with a default

An abstract class may also provide ordinary methods that subclasses inherit or
override:

```java run title="Some answered, one not"
abstract class Notification {
    abstract String message();

    String subject() {
        return "Notification";              // a default subclasses may replace
    }

    String send() {
        return "[" + subject() + "] " + message();
    }
}

class Alert extends Notification {
    @Override
    String message() {
        return "disk almost full";
    }

    @Override
    String subject() {
        return "ALERT";
    }
}

class Reminder extends Notification {
    @Override
    String message() {
        return "standup in 5 minutes";       // keeps the default subject
    }
}

public class Main {
    public static void main(String[] args) {
        System.out.println(new Alert().send());
        System.out.println(new Reminder().send());
    }
}
```

`message()` is abstract because there is no sensible default. `subject()` has
one, so it is concrete and overridable. That distinction is the useful part of
designing an abstract class: deciding which questions the parent can answer and
which it must not pretend to.

## Choosing between the two

Since Java 8 gave interfaces default methods, the two overlap considerably.
What remains genuinely different:

| | Interface | Abstract class |
|---|---|---|
| A class can have | any number | exactly one |
| Per-object state | no | yes |
| Constructor | no | yes |
| Non-public members | `private` helpers only | all four levels |
| Answers "what can it do?" | yes | also "what is it?" |

The two questions that decide it in practice:

**Does it need state?** An interface cannot hold a field per object. If the
shared code needs to remember something — a connection, a buffer, a title —
that is an abstract class.

**Might an implementer already have a parent?** A class gets one. Requiring
inheritance forecloses that slot forever, and if your type is a capability
rather than a kind, you will eventually meet a class that wants it and cannot
have it.

:::tip
When both fit, prefer the interface, and put any shared implementation in an
abstract class *beside* it that implementers may use if they wish. That is what
the collections library does: `List` is the interface everything is written
against, and `AbstractList` is there for people writing their own. Callers
depend on the promise; implementers opt into the help.
:::

:::warning
An abstract class is still inheritance, with everything chapter 2.5 warned
about: construction runs outside-in, so an abstract class whose constructor
calls its own abstract method runs the subclass's implementation against a
half-built object. That is a particularly easy mistake here, because calling
the abstract method is exactly what the class is for.
:::

:::quiz
{
  "question": "You need a type that several unrelated classes can take on, and it needs no state. Which fits better?",
  "options": [
    { "text": "An interface — the classes may already have parents, and there is nothing to store", "correct": true, "why": "Right. Both tests point the same way: no state means an interface can express it, and 'unrelated classes' means requiring inheritance would consume the one parent slot each of them has." },
    { "text": "An abstract class, so shared method bodies can be inherited", "correct": false, "why": "Default methods let an interface supply bodies too. The deciding factors are state and the single-parent limit, not whether you want to share code." },
    { "text": "An abstract class, because interfaces cannot have any implementation", "correct": false, "why": "They can, since Java 8: default methods have bodies, and static methods on interfaces are allowed too." },
    { "text": "Either — they are equivalent since Java 8", "correct": false, "why": "They converged but did not merge. An interface still cannot hold per-object state or a constructor, and a class still has only one parent." }
  ]
}
:::

## Practice

:::exercise abstract-payroll

:::exercise template-method-import

:::recap
- `abstract` on a method declares it without a body; `abstract` on a class
  means it cannot be instantiated.
- A concrete subclass must implement every inherited abstract method, or be
  declared abstract itself. That is a compile-time guarantee, unlike a parent
  method returning a placeholder.
- An abstract class may hold state, have constructors, and mix abstract with
  concrete methods — the template method shape makes the sequence `final` and
  leaves the steps abstract.
- Choose an interface when the type is a capability, when there is no state,
  or when implementers might already have a parent. Choose an abstract class
  when shared code needs fields.
- When both fit, publish the interface and offer an abstract class beside it.
:::
