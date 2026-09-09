---
title: "Methods and what gets copied"
navTitle: "Methods"
summary: >-
  Parameters, returns and overloading — and the single rule about copying that explains why some changes a method makes are visible to its caller and some are not.
objectives:
  - Predict which changes a method makes are visible to its caller, and say why
  - Choose between overloads the way the compiler does
  - Write a recursive method and say what limits how deep it can go
status: complete
standard: java21
requires: [control-flow]
---

A method is a named piece of work with inputs and an output. You have been
writing them since the first chapter; `main` is one. This chapter is about what
happens at the boundary — what a caller hands over, what the method gets, and
which of the method's changes the caller can see afterwards.

There is exactly one rule, and it has no exceptions: **Java passes everything by
value.** Almost every confusion in this area comes from believing there is a
second rule for objects. There is not. What changes is *what the value is*.

## Declaring and calling

```java run title="Inputs, an output, and a name that says what it does"
public class Main {
    static int larger(int a, int b) {
        return a > b ? a : b;
    }

    static void announce(String what) {   // void: no result, called for its effect
        System.out.println("-> " + what);
    }

    public static void main(String[] args) {
        announce("comparing 3 and 9");
        System.out.println(larger(3, 9));
    }
}
```

The `static` on these will be explained properly in Part 2, when there are
objects for a non-static method to belong to. Until then, read it as "this
method belongs to the class rather than to any particular object", which is
what lets `main` call it directly.

## Primitives: the value is the number

```java run title="The swap that does not swap"
public class Main {
    static void trySwap(int a, int b) {
        int temp = a;
        a = b;
        b = temp;
    }

    public static void main(String[] args) {
        int x = 1, y = 2;
        trySwap(x, y);
        System.out.println("x = " + x + ", y = " + y);
    }
}
```

`a` and `b` are new variables holding copies of `1` and `2`. The method swaps
its own two copies perfectly, and then they cease to exist. `x` and `y` were
never involved. No arrangement of the code inside `trySwap` can change that —
a method simply cannot reassign a caller's primitive variable, and Java has no
`&` or `out` to let it.

## References: the value is the arrow, not the object

Here is where people conclude Java must pass objects by reference. Watch
carefully, because both of these are the same rule:

```java run title="One works, one does not"
import java.util.Arrays;

public class Main {
    static void fill(int[] xs) {
        for (int i = 0; i < xs.length; i++) {
            xs[i] = 9;               // follow the arrow, change what is there
        }
    }

    static void replace(int[] xs) {
        xs = new int[] { 7, 7, 7 };  // point my copy of the arrow somewhere else
    }

    public static void main(String[] args) {
        int[] a = { 1, 2, 3 };
        fill(a);
        System.out.println("after fill:    " + Arrays.toString(a));

        int[] b = { 1, 2, 3 };
        replace(b);
        System.out.println("after replace: " + Arrays.toString(b));
    }
}
```

`fill` changes the caller's array. `replace` does not. The difference is not
that one is "by reference" and the other is not — it is that a variable of
array or object type does not hold the object. It holds a *reference* to it: an
arrow pointing at the object. Calling a method copies the arrow. Both arrows
then point at the same object, so following either one reaches the same
elements — but reassigning the parameter only moves the copy.

:::memviz
{
  "title": "What a method call copies",
  "steps": [
    {
      "caption": "main has a, an arrow pointing at a three-element array.",
      "line": 1,
      "stack": [
        { "id": "a", "name": "a", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "a.ref" }] }
      ],
      "heap": [ { "id": "arr", "value": "[1, 2, 3]" } ],
      "arrows": [ { "from": "a.ref", "to": "arr" } ]
    },
    {
      "caption": "Calling fill(a) copies the arrow into the parameter xs. Two arrows, one array.",
      "line": 2,
      "stack": [
        { "id": "a", "name": "a", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "a.ref" }] },
        { "id": "xs", "name": "xs", "type": "int[]", "state": "new",
          "fields": [{ "k": "ref", "v": "→", "anchor": "xs.ref" }] }
      ],
      "heap": [ { "id": "arr", "value": "[1, 2, 3]" } ],
      "arrows": [ { "from": "a.ref", "to": "arr" }, { "from": "xs.ref", "to": "arr" } ]
    },
    {
      "caption": "xs[i] = 9 follows the arrow and changes the array itself. Both names see it.",
      "line": 3,
      "stack": [
        { "id": "a", "name": "a", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "a.ref" }] },
        { "id": "xs", "name": "xs", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "xs.ref" }] }
      ],
      "heap": [ { "id": "arr", "value": "[9, 9, 9]", "state": "new" } ],
      "arrows": [ { "from": "a.ref", "to": "arr" }, { "from": "xs.ref", "to": "arr" } ]
    },
    {
      "caption": "In replace, xs = new int[]{7,7,7} moves only the copy. The caller's arrow never moved, and the new array is unreachable when the method returns.",
      "line": 4,
      "stack": [
        { "id": "a", "name": "a", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "a.ref" }] },
        { "id": "xs", "name": "xs", "type": "int[]",
          "fields": [{ "k": "ref", "v": "→", "anchor": "xs.ref" }] }
      ],
      "heap": [
        { "id": "arr", "value": "[1, 2, 3]" },
        { "id": "new", "value": "[7, 7, 7]", "state": "new" }
      ],
      "arrows": [ { "from": "a.ref", "to": "arr" }, { "from": "xs.ref", "to": "new" } ]
    }
  ]
}
:::

So the practical rule a caller needs is not about primitives versus objects. It
is: **a method can change what your object contains; it cannot change which
object your variable names.**

That also explains why passing a `String` never surprises anyone. A `String`
has no method that changes its contents, so there is nothing a method could do
to it that you would notice — not because strings are passed differently, but
because they are immutable. Chapter 1.6 comes back to this.

## Overloading

Several methods may share a name if their parameters differ. The compiler picks
one at compile time, from the *declared* types of the arguments:

```java run title="Which one gets called"
public class Main {
    static String f(long x)      { return "f(long)"; }
    static String f(Integer x)   { return "f(Integer)"; }
    static String f(Object... x) { return "f(Object...)"; }

    public static void main(String[] args) {
        System.out.println("f(5) -> " + f(5));
    }
}
```

`5` is an `int`, and there is no `f(int)`. All three candidates could accept it,
so the compiler applies a fixed order of preference:

1. **Widening a primitive** — `int` to `long`. Tried first.
2. **Boxing** — `int` to `Integer`. Only if no widening fits.
3. **Varargs** — always last.

Hence `f(long)`. This order is worth knowing because it is invisible at the call
site: `f(5)` looks like it should prefer the `Integer` overload, which is the
one that mentions the value's own type. It does not. Overloads that differ only
in ways this rule has to arbitrate are a reliable source of confusion — when
two overloads do genuinely different things, give them different names.

## Varargs

```java run title="Any number of arguments, including none"
public class Main {
    static int sum(int... numbers) {     // numbers is an int[] inside the method
        int total = 0;
        for (int n : numbers) {
            total += n;
        }
        return total;
    }

    public static void main(String[] args) {
        System.out.println(sum());
        System.out.println(sum(1, 2, 3));
        System.out.println(sum(new int[] { 4, 5 }));   // an array works too
    }
}
```

Inside the method the parameter simply *is* an array, which is why the
enhanced `for` works on it and why passing an array directly is accepted. A
method may have only one varargs parameter and it must come last, since
otherwise there would be no way to tell where it ended.

## Recursion, and where it stops

A method may call itself. Every call needs a *stack frame* holding its
parameters and locals, and the stack is finite:

```java run title="How deep can it go?"
public class Main {
    static int depth = 0;

    static void down() {
        depth++;
        down();
    }

    public static void main(String[] args) {
        for (int run = 1; run <= 3; run++) {
            depth = 0;
            try {
                down();
            } catch (StackOverflowError e) {
                System.out.println("run " + run + " reached " + depth + " frames");
            }
        }
    }
}
```

Look at the three numbers. The first is reliably the smallest, and the second
and third usually settle on the same larger value. That is the JIT compiler
from chapter 1.1 showing through: `down` starts out interpreted, and by the
second round HotSpot has compiled it to machine code with a smaller frame, so
the same stack holds more of them.

The absolute figures are worth nothing — press Run twice and even the settled
number moves, since it depends on the JVM, the platform and the thread's stack
size. What is reproducible is the shape: the first run goes least deep.

Two things follow. Depth limits are a property of the run, not of the program,
so a recursion that is "fine" in testing can fail in production on the same
input. And `StackOverflowError` is an `Error`, not an `Exception` — the
convention is that you do not catch it. The sample catches one to measure it,
which is a legitimate use and not a pattern to copy.

:::warning
Recursion depth is bounded by the thread's stack, which defaults to a few
hundred kilobytes to a couple of megabytes depending on the JVM and platform.
Recursing once per element of a large input is a crash waiting for a big enough
input; write it as a loop instead.
:::

Useful recursion has a **base case** that returns without recursing, and every
other path must move towards it:

```java run title="A recursion that ends"
public class Main {
    static int digitSum(int n) {
        if (n < 10) {
            return n;                       // base case
        }
        return n % 10 + digitSum(n / 10);   // strictly smaller each time
    }

    public static void main(String[] args) {
        System.out.println(digitSum(7) + ", " + digitSum(1234) + ", " + digitSum(999));
    }
}
```

:::quiz
{
  "question": "A method takes a `StringBuilder` parameter, calls `append(\"!\")` on it, and then assigns a brand-new StringBuilder to the parameter. What does the caller see afterwards?",
  "options": [
    { "text": "The exclamation mark was added; the reassignment had no effect", "correct": true, "why": "Right. append followed the copied arrow and changed the shared object. The assignment moved only the method's copy of the arrow, leaving the caller's pointing where it always did." },
    { "text": "Both changes are visible", "correct": false, "why": "That would require the caller's variable itself to be reachable from the method. Java copies the reference on the way in, so the caller's variable cannot be reassigned." },
    { "text": "Neither change is visible", "correct": false, "why": "This is the mistake in the other direction. The copy is of the arrow, not of the object, so mutating through it is visible to everyone holding an arrow to that object." },
    { "text": "It depends on whether the parameter is declared final", "correct": false, "why": "final would stop the method reassigning its own parameter, which changed nothing anyway. It has no effect on what the caller sees." }
  ]
}
:::

## Practice

:::exercise swap-elements

:::exercise digit-sum

:::recap
- Java passes everything by value, always. What differs is what the value is.
- For a primitive the value is the number, so a method cannot change a caller's
  variable at all.
- For an object the value is a reference. The method gets a copy of the arrow,
  so it can change what the object contains but cannot change which object the
  caller's variable names.
- Overload resolution prefers widening, then boxing, then varargs — so `f(5)`
  chooses `f(long)` over `f(Integer)`.
- A varargs parameter is an array inside the method, must come last, and there
  can only be one.
- Recursion needs a base case, and its depth is limited by the thread stack.
  The limit varies between runs of the same program, because compiled frames
  are smaller than interpreted ones.
:::
