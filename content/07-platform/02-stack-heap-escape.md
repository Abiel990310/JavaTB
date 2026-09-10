---
title: "Stack, heap, and escape — where an object actually lives"
navTitle: "Stack and heap"
summary: >-
  Every object is on the heap, except the ones the JIT proves nobody can see — and one extra assignment is the difference between 8 ms and 81 ms.
objectives:
  - Say what lives in a stack frame and what lives on the heap
  - Predict roughly how deep recursion can go and what changes it
  - Explain escape analysis and scalar replacement, and measure the difference
  - Recognise that publishing an object has a cost beyond design
status: complete
standard: java21
requires: [lifetime-and-gc]
---

The specification is simple. Each thread has a **stack**: a run of frames, one
per active method call, each holding that call's parameters, local variables
and a small operand stack. Everything else — every object, every array, every
boxed number — is on the **heap**, which all threads share.

A local variable of a primitive type *is* its value, stored in the frame. A
local variable of any other type is a reference: four or eight bytes in the
frame, naming an object on the heap. Java gives you no way to say otherwise;
there is no stack allocation, no `Point p = Point(1, 2)` making a value, and no
`&p`.

## How deep is the stack?

Deep enough to be worth knowing, and shallow enough to hit:

```java run expect-throw title="Until it runs out"
public class Main {
    static int depth;

    static void descend() {
        depth++;
        descend();
    }

    public static void main(String[] args) {
        descend();
    }
}
```

The program dies with a `StackOverflowError` and no message, because there is
nothing useful to say: the stack ran out. How many frames fitted before it did
is not a fixed number — it depends on the thread's stack size (`-Xss`, 8 MB in
this runner and typically 512 KB to 1 MB elsewhere) and on how wide each frame
is. The next program measures both.

Frame width is the part you control:

```java run title="Wide frames run out sooner"
public class Main {
    static int depth;

    static void narrow() {
        depth++;
        narrow();
    }

    static long wide(long a, long b, long c, long d, long e, long f) {
        depth++;
        return wide(a + 1, b, c, d, e, f);
    }

    public static void main(String[] args) {
        int narrowDepth = 0;
        int wideDepth = 0;

        try {
            narrow();
        } catch (StackOverflowError overflow) {
            narrowDepth = depth;
        }

        depth = 0;
        try {
            wide(1, 2, 3, 4, 5, 6);
        } catch (StackOverflowError overflow) {
            wideDepth = depth;
        }

        System.out.println("no locals:    " + narrowDepth + " frames");
        System.out.println("six longs:    " + wideDepth + " frames");
        System.out.println("ratio:        " + (narrowDepth / wideDepth) + "x");
    }
}
```

Six `long` parameters cost about **three times** as many frames' worth of
stack, and that ratio holds whatever `-Xss` is set to — the absolute numbers do
not. If a recursive algorithm is running out of stack, fewer and narrower
locals buys you a constant factor; converting to iteration with an explicit
`ArrayDeque` buys you the heap, which is far larger.

Note also what `StackOverflowError` is: an `Error`, not an `Exception`, and one
you must not routinely catch. The program above catches it to measure it, which
is the one legitimate use — and even then, the catch runs in a frame near the
top of an exhausted stack, so anything it tries to do can overflow again.

## The rule the JIT is allowed to break

"Every object is on the heap" is what the specification says the program must
*behave* as though it does. It is not what actually happens. If the JIT can
prove that an object never becomes visible outside the method that made it, it
may take the object apart and keep its fields in registers or the frame —
**scalar replacement**, driven by **escape analysis**.

The difference is one assignment:

```java run title="Measured: the cost of one extra store"
public class Main {
    record Point(int x, int y) {}

    static Point published;

    static int staysLocal(int i) {
        Point p = new Point(i, i + 1);
        return p.x() + p.y();
    }

    static int escapes(int i) {
        Point p = new Point(i, i + 1);
        published = p;                     // now something outside can see it
        return p.x() + p.y();
    }

    public static void main(String[] args) {
        int n = 20_000_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long localTotal = 0;
            for (int i = 0; i < n; i++) {
                localTotal += staysLocal(i);
            }
            long localMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long escapedTotal = 0;
            for (int i = 0; i < n; i++) {
                escapedTotal += escapes(i);
            }
            long escapedMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  stays local " + localMs + " ms"
                + "   escapes to a field " + escapedMs + " ms"
                + "   same answer: " + (localTotal == escapedTotal));
        }
    }
}
```

Warm, on the machine this was written on: **8 ms against 81 ms**. Identical
arithmetic, identical allocation in the source, ten times the cost — because
`published = p` means the `Point` outlives the call and has to be a real object
on the real heap.

The JIT classifies each allocation into one of three states:

- **NoEscape** — nothing outside the method can see it. Free to scalar-replace.
- **ArgEscape** — passed to another method but does not outlive the call.
  Cannot be scalar-replaced, but its locks can still be removed.
- **GlobalEscape** — stored in a field, returned, thrown, or given to another
  thread. It is a heap object, and that is that.

## Locks disappear too

The same proof licenses a second optimisation. If nobody else can reach an
object, nobody else can lock it, so locking it means nothing:

```java run title="Measured: locking something nobody can see"
public class Main {
    static final Object SHARED = new Object();

    static long lockLocal(int i) {
        Object lock = new Object();
        synchronized (lock) {
            return i * 2L;
        }
    }

    static long lockShared(int i) {
        synchronized (SHARED) {
            return i * 2L;
        }
    }

    public static void main(String[] args) {
        int n = 20_000_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long localTotal = 0;
            for (int i = 0; i < n; i++) {
                localTotal += lockLocal(i);
            }
            long localMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long sharedTotal = 0;
            for (int i = 0; i < n; i++) {
                sharedTotal += lockShared(i);
            }
            long sharedMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  lock on a local " + localMs + " ms"
                + "   lock on a shared object " + sharedMs + " ms"
                + "   same answer: " + (localTotal == sharedTotal));
        }
    }
}
```

**11 ms against 424 ms** — around forty times, and the shared version is not
even contended; a single thread is taking and releasing an uncontended monitor
twenty million times, at about 21 nanoseconds a go.

This is why the old advice to replace `StringBuffer` with `StringBuilder` for
speed is mostly obsolete: a `StringBuffer` that never leaves its method has its
locks removed anyway. Use `StringBuilder` because the synchronisation is
meaningless, not because you have measured it costing anything.

## What to take from this

Not "write code to help escape analysis". The optimisation is invisible,
unspecified, absent in the interpreter, and can vanish when a method gets too
big to inline or when profile pollution makes a call site polymorphic. Code
written to please it is code written against a moving target.

What is worth taking is that **publishing an object has a cost**, and it lines
up exactly with the design advice you already had:

- Returning an object from a getter publishes it — which is chapter 2.3's
  argument for a defensive copy, and also a reason the original could not be
  optimised away.
- Storing something in a `static` or a long-lived collection publishes it —
  chapter 7.1's leak, and a `GlobalEscape`.
- A short-lived object used and dropped inside one method is both the cheapest
  thing you can write and the easiest to reason about.

The habit that helps performance here is the same one that helps correctness:
give an object the smallest scope that does the job. You do not have to think
about the JIT to get that right, which is the point.

One mechanism worth naming, since it explains the numbers in chapter 7.1: real
allocations do not contend for a global heap pointer either. Each thread gets a
**thread-local allocation buffer**, a private slab of the young generation, and
allocating inside it is a pointer bump with no synchronisation at all. When the
slab runs out the thread takes another. That is how three nanoseconds an object
is possible.

:::quiz
{
  "question": "Two methods allocate the same record and do the same arithmetic; one also assigns it to a static field. The second measured ten times slower. Why?",
  "options": [
    { "text": "The assignment makes the object outlive the call, so escape analysis can no longer scalar-replace it and a real heap object must be allocated", "correct": true, "why": "Right. The store turns a NoEscape allocation into a GlobalEscape one, and the allocation stops being free." },
    { "text": "Writing a static field requires a memory barrier on every write", "correct": false, "why": "An ordinary (non-volatile) static store needs no barrier. The cost is the allocation the JIT can no longer remove." },
    { "text": "The static field keeps every Point alive, so the garbage collector has more to trace", "correct": false, "why": "The field holds one reference; each store replaces the last, so all but one Point is immediately garbage." },
    { "text": "Records are more expensive to allocate than ordinary classes", "correct": false, "why": "A record allocates exactly like any other class — and the faster method allocates the same record." }
  ]
}
:::

## Practice

:::exercise where-does-it-live

:::exercise recursion-to-iteration

:::recap
- Each thread has a stack of frames holding parameters, locals and an operand
  stack. Every object is on the shared heap; a local of reference type is just
  the reference.
- Recursion depth depends on `-Xss` and on frame width — six `long`
  parameters cost about three times the stack of none.
- `StackOverflowError` is an `Error`. Catch it to measure, not to recover.
- Escape analysis lets the JIT scalar-replace an object nothing outside the
  method can see. One store to a static field turned 8 ms into 81 ms.
- The same proof removes locks on unshared objects: 11 ms against 424 ms.
- Do not write code for the optimiser. Do notice that publishing an object —
  returning it, storing it, sharing it — is a real cost as well as a design
  decision.
