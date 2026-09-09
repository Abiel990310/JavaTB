---
id: counter-of-instances
title: "Count how many you made"
difficulty: core
chapter: classes-and-objects
topics: [classes, static]
check: unit
standard: java21
---

Write a class `Widget` that knows how many of itself have ever been created.

Each `Widget` gets an `id` field: the first one made is 1, the second 2, and so
on. The running total is available as `Widget.count`, which must be readable
without an object — because asking "how many exist?" is a question about the
class, not about any particular widget.

The starter counts, but every widget counts alone.

## Starter
```java
static class Widget {
    int count = 0;
    int id;

    Widget() {
        count++;
        this.id = count;
    }
}
```

## Tests
```java
Widget a = new Widget();
Widget b = new Widget();
Widget c = new Widget();

checkEq(a.id, 1);
checkEq(b.id, 2);
checkEq(c.id, 3);
checkEq(Widget.count, 3);

Widget d = new Widget();
checkEq(d.id, 4);
checkEq(Widget.count, 4);
```

## Hints
- Every widget currently gets its own `count`, starting at 0. How many are
  there supposed to be?
- One value shared by the whole class, not one per object.
- `Widget.count` in the checks will not compile against an instance field —
  that is the compiler telling you which one it has to be.

## Solution
```java
static class Widget {
    static int count = 0;
    int id;

    Widget() {
        count++;
        this.id = count;
    }
}
```

## Notes
The starter gives each object its own `count`, so each one increments its own
copy from 0 to 1 and every `id` is 1. The bug is not in the arithmetic; it is in
where the number lives.

`static` puts exactly one `count` on the class. Every constructor call
increments that same variable, so the ids come out 1, 2, 3, 4 and the total is
readable as `Widget.count` without an object in hand.

Note that the checks themselves force the answer: `Widget.count` names the
field on the class, and an instance field cannot be reached that way. When you
find yourself unable to write the call the specification asks for, that is
usually the specification telling you something about the design rather than an
obstacle to work around.

One caveat worth carrying forward. A shared mutable counter incremented from a
constructor is exactly the thing that breaks when two threads create objects at
once: `count++` is a read, an add and a write, and two threads can interleave
between them so that both see the same value and one increment is lost. Part 8
deals with this properly, with `AtomicInteger`. It is worth knowing now that
"static mutable state" is a phrase experienced Java programmers hear as a
warning.

