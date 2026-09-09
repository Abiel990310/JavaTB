---
title: "Aliasing and defensive copying"
navTitle: "Aliasing"
summary: >-
  What happens when a reference to your object's insides escapes, the two doors it escapes through, and the two ways to shut them.
objectives:
  - Spot the two places a reference to an object's internals escapes
  - Write a class that cannot be modified from outside by copying at its boundaries
  - Explain what final does and does not protect
status: complete
standard: java21
requires: [classes-and-objects]
---

Chapter 1.4 established that passing an object copies the arrow, not the
object. Chapter 2.1 closed on two variables naming one book. Both of those were
about what a reference *is*. This chapter is about what it does to your code
when one gets out.

The short version: a class that stores a reference it was given, or hands one
out, has no control over its own state any more. Whoever holds the other end
can change it, at any time, without going through a single one of your methods.

## The two doors

```java run title="A class that does not own its own data"
import java.util.Arrays;

public class Main {
    static class Team {
        private final String[] members;

        Team(String[] members) {
            this.members = members;          // door one: stores the caller's array
        }

        String[] getMembers() {
            return members;                  // door two: hands out its own array
        }
    }

    public static void main(String[] args) {
        String[] source = { "Ada", "Grace" };
        Team team = new Team(source);

        source[0] = "Intruder";              // through the door we came in by
        System.out.println("after editing the source:        " + Arrays.toString(team.getMembers()));

        team.getMembers()[1] = "Also intruder";   // through the door we were given
        System.out.println("after editing the getter result: " + Arrays.toString(team.getMembers()));
    }
}
```

Both fields are `private`. Both are `final`. Neither helped.

The constructor stored the very array the caller was holding, so the caller
still has it. The getter returned the very array the object is using, so now the
world has it too. `private` controls who can name the *field*; it says nothing
about who can reach the object the field points at.

## What `final` actually promises

```java run expect-error title="final stops one thing"
public class Main {
    static class Box {
        private final int[] data;

        Box(int[] data) {
            this.data = data;
        }

        void swapIn(int[] other) {
            data = other;
        }
    }

    public static void main(String[] args) {
        System.out.println(new Box(new int[] { 1 }));
    }
}
```

*cannot assign a value to final variable data.* `final` on a field means the
reference cannot be repointed after construction. It says nothing whatsoever
about the object at the far end, which is why the previous sample could rewrite
every element of a `final` array.

That distinction is worth saying out loud, because `final` reads like a promise
of immutability and is not one: **a `final` field is a fixed arrow to a
possibly-changing object.**

## Shutting both doors

```java run title="Copy on the way in, copy on the way out"
import java.util.Arrays;

public class Main {
    static class Team {
        private final String[] members;

        Team(String[] members) {
            this.members = members.clone();   // our own array from the start
        }

        String[] getMembers() {
            return members.clone();           // callers get a copy to play with
        }

        int size() {
            return members.length;
        }
    }

    public static void main(String[] args) {
        String[] source = { "Ada", "Grace" };
        Team team = new Team(source);

        source[0] = "Intruder";
        team.getMembers()[1] = "Also intruder";

        System.out.println(Arrays.toString(team.getMembers()) + ", size " + team.size());
    }
}
```

Two `clone()` calls and the class owns its state. This is **defensive copying**,
and the rule is symmetric: copy anything mutable you accept, and copy anything
mutable you return.

Note `size()` returning `members.length` rather than making the caller ask for
the array and measure it. Most getters that hand out a whole collection exist
because the class did not offer the operation the caller actually wanted. The
cheapest way to avoid copying is to have nothing to copy.

:::pitfall
`clone()` on an array copies one level, as chapter 1.5 showed. An array of
mutable objects cloned this way gives you a new array pointing at the *same*
objects, and every one of them is still shared. Defensive copying is only as
deep as the mutability you are defending against.
:::

## The alternative: have nothing worth stealing

```java run title="An object that cannot change"
public class Main {
    static final class Point {
        private final int x;
        private final int y;

        Point(int x, int y) {
            this.x = x;
            this.y = y;
        }

        int x() { return x; }
        int y() { return y; }

        Point movedBy(int dx, int dy) {
            return new Point(x + dx, y + dy);   // a new point, not a changed one
        }

        @Override
        public String toString() {
            return "(" + x + ", " + y + ")";
        }
    }

    public static void main(String[] args) {
        Point origin = new Point(0, 0);
        Point moved = origin.movedBy(3, 4);

        System.out.println("origin " + origin + ", moved " + moved);
    }
}
```

`Point` has no setters, all its fields are `final`, and all of them are
primitives — so there is nothing to defend. It can be shared freely, passed
anywhere, used as a map key, and read from several threads at once, all without
a copy.

That is exactly why `String` is immutable, and why the reference rules in
chapter 1.4 never seem to bite when strings are involved. An immutable object
makes aliasing a non-issue by making the question meaningless: it does not
matter how many names point at it if none of them can change it.

An immutable class needs three things: every field `final`, no method that
modifies state, and — if any field is a reference to something mutable — a
defensive copy in the constructor *and* in the getter, because otherwise the
class is only pretending. Making the class itself `final` stops a subclass
adding mutable state and breaking the promise, which is why `Point` above is
declared that way.

:::tip
Reach for immutability first and defensive copying second. Copies cost time and
memory on every call, and it is easy to forget one; an immutable type gets the
same guarantee once, at the design stage, and never pays again. Chapter 2.9's
records make writing one almost free.
:::

## Aliasing is not always the bug

None of this means sharing is wrong. Two references to one object is how you
avoid copying a large structure around, how a cache works, and how two parts of
a program observe the same thing. The bug is not aliasing; it is aliasing that
*someone did not know about*.

So the question to ask of every reference crossing a boundary is: after this
call, who can change this object? If the answer is more than one place and only
one of them knows it, that is where the next confusing bug will come from.

:::quiz
{
  "question": "A class stores a `private final int[] scores` and returns it from `getScores()`. A caller writes `obj.getScores()[0] = 99;`. What happens?",
  "options": [
    { "text": "The object's own array is modified", "correct": true, "why": "Right. The getter returned the reference the field holds, so the caller is indexing into the object's own array. private and final both stop something else entirely." },
    { "text": "It does not compile — the array is private", "correct": false, "why": "private controls who can write obj.scores. The getter already handed the reference out, and at that point it is an ordinary array reference like any other." },
    { "text": "It does not compile — the field is final", "correct": false, "why": "final forbids reassigning the field. Writing to an element does not reassign anything; the arrow still points where it always did." },
    { "text": "It modifies a copy, so the object is unaffected", "correct": false, "why": "That is what it would do if the getter returned scores.clone(). Returning the field itself returns the reference, and there is only one array." }
  ]
}
:::

## Practice

:::exercise defend-the-inventory

:::exercise immutable-money

:::recap
- A reference escapes through two doors: a constructor that stores what it was
  given, and a getter that returns what the object holds.
- `private` controls who can name the field. `final` fixes which object the
  field points at. Neither protects the object at the far end.
- Defensive copying means copying mutable things on the way in *and* on the way
  out — and it is only as deep as `clone` goes, which is one level.
- An immutable class — final fields, no mutators, defensive copies for any
  mutable field, and `final` on the class — makes aliasing a non-question, which
  is why `String` never causes these bugs.
- Sharing is not the problem. Sharing that one side does not know about is.
:::
