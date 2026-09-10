---
title: "Object lifetime and garbage collection"
navTitle: "Lifetime and GC"
summary: >-
  Nothing is freed because you stopped using it — it is freed because nothing can reach it. What that buys, what it costs, and the leaks it does not prevent.
objectives:
  - State the reachability rule and why it collects cycles
  - Explain why allocation of short-lived objects is cheap
  - Choose between strong, soft and weak references
  - Recognise the four common shapes of a leak in a garbage-collected language
status: complete
standard: java21
requires: [when-a-loop-wins]
---

Java has no `delete`, no `free`, and no destructor. An object's memory is
reclaimed when the garbage collector can prove that no part of the running
program can reach it — not when the last variable naming it goes out of scope,
and not at any moment you can predict.

That one rule explains almost everything in this chapter.

## Reachability, not counting

A collector that counted references would leak a cycle: two objects pointing at
each other each have a count of one, forever. Java's does not count. It starts
from the **roots** — local variables on every thread's stack, static fields,
JNI references — and marks everything reachable from them. Whatever is left is
garbage, cycle or no cycle.

```java run title="A cycle nobody can reach"
import java.lang.ref.*;

public class Main {
    static final class Node {
        Node partner;
        final String name;

        Node(String name) {
            this.name = name;
        }
    }

    public static void main(String[] args) throws Exception {
        Node a = new Node("a");
        Node b = new Node("b");
        a.partner = b;
        b.partner = a;                 // each holds the other

        WeakReference<Node> watcher = new WeakReference<>(a);
        System.out.println("while a is a local: " + describe(watcher));

        a = null;
        b = null;
        for (int i = 0; i < 5 && watcher.get() != null; i++) {
            System.gc();
            Thread.sleep(20);
        }
        System.out.println("after dropping both: " + describe(watcher));
    }

    static String describe(WeakReference<?> ref) {
        return ref.get() != null ? "still there" : "collected";
    }
}
```

Both objects still point at each other when they are collected. Nothing else
points at either, so nothing else can ever look at them, so their contents are
irrelevant.

The `WeakReference` in that program is the only honest way to ask "was this
collected?" — a strong reference would keep the object alive and change the
answer by asking the question. We come back to it below.

## `System.gc()` is a request

The loop above calls `System.gc()` five times and checks between calls. That is
not superstition: `System.gc()` is documented as a *suggestion*, the JVM is
free to ignore it, and some collectors do. Nothing in the specification
promises that an unreachable object is ever collected — only that a reachable
one is not.

So: never write production code that depends on a collection happening. If you
find yourself calling `System.gc()` to fix a bug, the bug is that something is
still reachable.

## Allocation is cheaper than you think

The usual instinct from a manually-managed language is that `new` in a loop is
expensive. Measure it:

```java run title="Measured: twenty million short-lived objects"
public class Main {
    record Point(int x, int y) {}

    public static void main(String[] args) {
        int n = 20_000_000;

        for (int round = 1; round <= 3; round++) {
            long start = System.nanoTime();
            long withObjects = 0;
            for (int i = 0; i < n; i++) {
                Point p = new Point(i, i + 1);
                withObjects += p.x() + p.y();
            }
            long allocMs = (System.nanoTime() - start) / 1_000_000;

            start = System.nanoTime();
            long withoutObjects = 0;
            for (int i = 0; i < n; i++) {
                withoutObjects += i + (i + 1);
            }
            long plainMs = (System.nanoTime() - start) / 1_000_000;

            System.out.println("round " + round
                + ":  allocating " + allocMs + " ms"
                + "   plain arithmetic " + plainMs + " ms"
                + "   (" + (withObjects == withoutObjects) + ")");
        }
    }
}
```

Warm, on the machine this was written on: **13 ms against 6 ms** for twenty
million objects. That is under half a nanosecond each, which is less than an
allocation can possibly cost — because most of them are not allocated at all.
Chapter 6.1 met this already: the JIT proves the `Point` never escapes the loop
and replaces it with two `int` locals. Run the same program with
`-XX:-DoEscapeAnalysis` and the first column becomes 61–88 ms, which is the
real allocation cost: about 3 nanoseconds an object.

Three nanoseconds is still cheap, and the reason is the **generational
hypothesis**: most objects die young. New objects go into a contiguous nursery
where allocating is a pointer bump, and collecting it copies out the few
survivors and resets the pointer — the cost is proportional to what *survives*,
not to what was allocated. A million objects that die immediately cost almost
nothing to collect.

The practical reading is not "allocate freely" but "do not contort your code to
avoid short-lived objects". What is expensive is objects that survive: they get
copied between generations, and eventually collected by a slower algorithm over
the whole old generation.

## What the collector does not manage

Memory. Only memory.

An open file, a socket, a lock, a native buffer — none of those are reclaimed
by reachability, because the collector has no idea they exist. This is why
chapter 3.5 exists and why `try`-with-resources is not optional. An object
holding a file descriptor can be collected without the descriptor ever being
closed, and you will find out when the process hits its file-handle limit.

Java once had `finalize()` for this. It was unpredictable, ran on an unspecified
thread, could resurrect the object, and delayed collection of anything holding
it; it has been deprecated for removal since Java 9 and disabled by default
since Java 18. Do not write one.

The supported replacement is `Cleaner`, and it is a safety net rather than a
mechanism:

```java run title="Cleaner as a last resort"
import java.lang.ref.Cleaner;

public class Main {
    static final Cleaner CLEANER = Cleaner.create();

    static final class Handle {
        private final int[] payload = new int[1_000];

        Handle() {
            // The action must NOT capture `this` — a lambda holding the object
            // it is registered for makes it permanently reachable, and the
            // cleaner would never run.
            CLEANER.register(this, () -> System.out.println("  cleanup ran"));
        }
    }

    public static void main(String[] args) throws Exception {
        Handle handle = new Handle();
        System.out.println("created");

        handle = null;
        for (int i = 0; i < 10; i++) {
            System.gc();
            Thread.sleep(20);
        }
        Thread.sleep(100);
        System.out.println("done");
    }
}
```

The comment in that program is the whole trap. A `Cleaner` action that captures
`this` — including any lambda referring to an instance field — keeps the object
reachable through the cleaner's own registry, so the object never becomes
garbage and the action never runs. The action must hold only the state it needs
to clean up, in a separate object.

And note the shape of the demonstration: ten `System.gc()` calls and a sleep,
because there is no way to make it happen on demand. That is exactly why a
`Cleaner` is a backstop for a caller who forgot `close()`, never the primary
path.

## Four strengths of reference

| Kind | Cleared when | Use for |
|---|---|---|
| Strong (an ordinary field or variable) | never — it keeps the object alive | everything, by default |
| `SoftReference` | the JVM would otherwise run out of memory | a cache you would like to keep |
| `WeakReference` | as soon as nothing strong points at the object | a key or a back-pointer that must not keep its target alive |
| `PhantomReference` | after the object is finalizable, and `get()` always returns `null` | knowing an object *has* gone, for cleanup |

```java run title="Soft under pressure, weak on sight"
import java.lang.ref.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        System.out.println("max heap: " + Runtime.getRuntime().maxMemory() / (1024 * 1024) + " MB");

        List<SoftReference<byte[]>> cache = new ArrayList<>();
        for (int i = 0; i < 400; i++) {
            cache.add(new SoftReference<>(new byte[1024 * 1024]));
        }
        long cleared = cache.stream().filter(ref -> ref.get() == null).count();
        System.out.println("soft references cleared: " + cleared + " of " + cache.size());

        Map<Object, String> weak = new WeakHashMap<>();
        Object kept = new Object();
        weak.put(kept, "reachable key");
        weak.put(new Object(), "nothing points at this key");
        System.out.println("weak map before: " + weak.size());

        for (int i = 0; i < 5; i++) {
            System.gc();
            Thread.sleep(20);
        }
        System.out.println("weak map after:  " + weak.size() + ", kept = " + weak.get(kept));
    }
}
```

Four hundred one-megabyte arrays do not fit in a 512 MB heap. With strong
references that is an `OutOfMemoryError`; with soft ones the collector clears
as many as it needs to — 254 of them here — and the program survives. That is
the entire use case: a cache whose contents are nice to have.

`WeakHashMap` shows the other half. Its entry whose key nobody else holds
disappears; the entry whose key is still a local survives. That is what makes
it right for "extra data attached to an object I do not own" and wrong for
almost everything else, because entries vanish at unpredictable times.

Use soft references sparingly. They delay collection, they interact badly with
a full heap, and a bounded `LinkedHashMap` cache with an eviction policy you
chose is usually better than one the collector empties for you at the worst
possible moment.

## Leaks still happen

A garbage collector removes the *use-after-free* and *double-free* families of
bug. It does not remove leaks, because a leak in Java is not a failure to free
— it is an accidental reference.

```java run title="Measured: two hundred thousand things nobody needs"
import java.util.*;

public class Main {
    static final List<int[]> LISTENERS = new ArrayList<>();

    static long usedBytes() {
        Runtime runtime = Runtime.getRuntime();
        return runtime.totalMemory() - runtime.freeMemory();
    }

    public static void main(String[] args) throws Exception {
        long before = usedBytes();

        for (int i = 0; i < 200_000; i++) {
            LISTENERS.add(new int[64]);        // registered, never removed
        }
        System.out.println("held by a static list: "
            + (usedBytes() - before) / (1024 * 1024) + " MB");

        LISTENERS.clear();
        for (int i = 0; i < 3; i++) {
            System.gc();
            Thread.sleep(30);
        }
        System.out.println("after clearing:        "
            + (usedBytes() - before) / (1024 * 1024) + " MB");
    }
}
```

56 MB held, zero after `clear()`. The collector was working perfectly the whole
time — a `static` field is a root, so everything in that list was genuinely
reachable.

The four shapes worth recognising:

- **The collection that never forgets.** A cache, a registry, a list of
  listeners, a `Map` keyed on something long-lived. Every `add` needs a
  corresponding `remove`, or a bound.
- **The listener that outlives its subject.** `this::handle` registered with a
  long-lived publisher keeps the whole enclosing object alive — chapter 6.2's
  note about bound method references, met as a memory bug.
- **`ThreadLocal` on a pooled thread.** The thread is never destroyed, so the
  value is never released. Always `remove()` in a `finally`.
- **The oversized container.** `ArrayList.remove` nulls the slot it vacates
  (chapter 5.2's problem said why); a container you wrote that does not is
  holding every element ever added.

The tell is always the same: something is still reachable. When a heap grows
without bound, the question is never "why was this not freed" but "who is still
holding it" — which is a question a heap dump answers directly.

:::quiz
{
  "question": "Two objects hold references to each other and nothing else refers to either. What happens?",
  "options": [
    { "text": "Both become eligible for collection, because neither is reachable from a root", "correct": true, "why": "Right. Java marks from the roots rather than counting references, so a cycle with no path from a root is garbage like anything else." },
    { "text": "Neither is collected, because each has a live reference to it", "correct": false, "why": "That is what a reference-counting collector would do, and it is why reference counting leaks cycles. Java does not count." },
    { "text": "One is collected and the other survives, depending on allocation order", "correct": false, "why": "Reachability is not affected by order; the pair is reached or not reached together." },
    { "text": "They are collected only if you break the cycle by setting one field to null", "correct": false, "why": "Breaking the cycle is a habit from reference-counted languages and does nothing here." }
  ]
}
:::

## Practice

:::exercise plug-the-leak

:::exercise weak-cache

:::recap
- An object is collected when it is **unreachable from any root**, not when the
  last variable naming it goes away — so cycles are collected and nothing
  happens at a predictable time.
- `System.gc()` is a suggestion. Code that needs a collection to happen is
  already broken.
- Short-lived objects are cheap: 20 million cost 13 ms with escape analysis
  removing most of them, and about 3 ns each without it. Collection cost is
  proportional to what *survives*.
- The collector manages memory and nothing else. Files, sockets and locks need
  `try`-with-resources; `finalize` is gone, and `Cleaner` is a backstop whose
  action must never capture the object it cleans up.
- `SoftReference` for a cache you would like to keep, `WeakReference` for a
  reference that must not keep its target alive, `WeakHashMap` for data
  attached to objects you do not own.
- A leak in Java is an accidental reference: a growing collection, a registered
  listener, a `ThreadLocal` on a pooled thread, or a container that does not
  null what it removes.
