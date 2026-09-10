---
title: "List: ArrayList and LinkedList"
navTitle: "List"
summary: >-
  The two implementations, measured against each other at the four things lists do — including the one case where the textbook answer is wrong.
objectives:
  - Say what ArrayList and LinkedList each cost for indexing, iteration and insertion
  - Explain why LinkedList loses at insertion despite O(1) insertion
  - Choose the right list, and know when the right answer is neither
status: complete
standard: java21
requires: [the-framework]
---

`List` has two implementations in the JDK worth knowing, and their trade-off is
the standard example in every data structures course: an array is fast to index
and slow to insert into; a linked list is the reverse.

The standard example is half wrong, and the half that is wrong is the half
people remember.

## What each one is

An **`ArrayList`** holds an array with spare capacity at the end. Indexing is
one memory access. Adding at the end is free until the array fills, at which
point a new one about 1.5 times larger is allocated and everything is copied —
which averages out to constant time per element, the same doubling idea chapter
1.5 described for `Arrays.copyOf`.

A **`LinkedList`** holds a chain of nodes, each with a value and pointers to
its neighbours. There is no index: reaching position *n* means following *n*
pointers. Inserting is a matter of rewriting two pointers — **once you are
already there.**

That last clause is where the textbook answer goes wrong.

## Indexing and iteration

```java run title="Measured: reading"
import java.util.*;

public class Main {
    static long sink;

    static long randomAccess(List<Integer> list, int reps) {
        long total = 0;
        int n = list.size();
        for (int i = 0; i < reps; i++) {
            total += list.get((i * 7919) % n);      // a scattered, repeatable pattern
        }
        return total;
    }

    static long iterate(List<Integer> list) {
        long total = 0;
        for (int value : list) {
            total += value;
        }
        return total;
    }

    static long ms(Runnable r) {
        long t = System.nanoTime();
        r.run();
        return (System.nanoTime() - t) / 1_000_000;
    }

    public static void main(String[] args) {
        int n = 50_000;
        List<Integer> array = new ArrayList<>();
        List<Integer> linked = new LinkedList<>();
        for (int i = 0; i < n; i++) {
            array.add(i);
            linked.add(i);
        }

        for (int w = 0; w < 3; w++) {                 // warm up
            sink += randomAccess(array, 2_000);
            sink += randomAccess(linked, 500);
            sink += iterate(array);
            sink += iterate(linked);
        }

        System.out.printf("5,000 random gets:   ArrayList %4d ms   LinkedList %4d ms%n",
                          ms(() -> sink += randomAccess(array, 5_000)),
                          ms(() -> sink += randomAccess(linked, 5_000)));
        System.out.printf("20 full iterations:  ArrayList %4d ms   LinkedList %4d ms%n",
                          ms(() -> { for (int i = 0; i < 20; i++) sink += iterate(array); }),
                          ms(() -> { for (int i = 0; i < 20; i++) sink += iterate(linked); }));
        System.out.println("(checksum " + sink + ")");
    }
}
```

Random access is not close — it is a different complexity class, and at fifty
thousand elements that is three orders of magnitude.

Iteration is closer, because a `LinkedList` iterator holds its position and
walks one link at a time rather than restarting. It still loses, for a reason
complexity analysis does not capture: an `ArrayList`'s elements are consecutive
in memory, so each cache line fetched brings several of them, while a
`LinkedList`'s nodes are scattered wherever the allocator put them and each
step is a potential cache miss.

## Inserting: where the textbook answer breaks

```java run title="Measured: inserting"
import java.util.*;

public class Main {
    static long sink;

    static void addAtFront(List<Integer> list, int n) {
        for (int i = 0; i < n; i++) {
            list.add(0, i);
        }
    }

    static void addInMiddle(List<Integer> list, int n) {
        for (int i = 0; i < n; i++) {
            list.add(list.size() / 2, i);
        }
    }

    static long ms(Runnable r) {
        long t = System.nanoTime();
        r.run();
        return (System.nanoTime() - t) / 1_000_000;
    }

    public static void main(String[] args) {
        for (int w = 0; w < 2; w++) {                 // warm up
            addAtFront(new ArrayList<>(), 2_000);
            addAtFront(new LinkedList<>(), 2_000);
            addInMiddle(new ArrayList<>(), 2_000);
            addInMiddle(new LinkedList<>(), 2_000);
        }

        List<Integer> frontArray = new ArrayList<>();
        List<Integer> frontLinked = new LinkedList<>();
        System.out.printf("30,000 inserts at the front:  ArrayList %4d ms   LinkedList %4d ms%n",
                          ms(() -> addAtFront(frontArray, 30_000)),
                          ms(() -> addAtFront(frontLinked, 30_000)));

        List<Integer> midArray = new ArrayList<>();
        List<Integer> midLinked = new LinkedList<>();
        System.out.printf("20,000 inserts in the middle: ArrayList %4d ms   LinkedList %4d ms%n",
                          ms(() -> addInMiddle(midArray, 20_000)),
                          ms(() -> addInMiddle(midLinked, 20_000)));

        sink += frontArray.size() + frontLinked.size() + midArray.size() + midLinked.size();
        System.out.println("(checksum " + sink + ")");
    }
}
```

Two results, pointing opposite ways.

**At the front, `LinkedList` wins convincingly.** It rewrites two pointers;
`ArrayList` shifts every element one place right, every time.

**In the middle, by index, `ArrayList` wins — heavily.** This is the case the
textbook answer predicts `LinkedList` should win, and it does not, because
`add(index, value)` on a `LinkedList` has to *walk to the index first*. The
insertion is O(1) and getting there is O(n), so the operation is O(n) with a
pointer-chase for every step — while `ArrayList`'s O(n) shift is `System.arraycopy`
moving a block of contiguous memory, which is about as fast as a computer does
anything.

The lesson generalises beyond lists: **an operation's cost is the whole
operation, including finding the place to do it.** A structure that is fast at
step two and slow at step one is slow.

## When LinkedList is right, and what to use instead

`LinkedList`'s genuine strength is adding and removing at the **ends**. But it
is not the best choice even there:

```java run title="The thing you actually wanted"
import java.util.*;

public class Main {
    static long sink;

    /** Steady-state queue use: push one, pop one, repeatedly. */
    static long churn(Deque<Integer> queue, int n) {
        long total = 0;
        for (int i = 0; i < n; i++) {
            queue.addLast(i);
            total += queue.removeFirst();
        }
        return total;
    }

    static long ms(Runnable r) {
        long t = System.nanoTime();
        r.run();
        return (System.nanoTime() - t) / 1_000_000;
    }

    public static void main(String[] args) {
        for (int w = 0; w < 3; w++) {               // warm up both paths thoroughly
            sink += churn(new LinkedList<>(), 100_000);
            sink += churn(new ArrayDeque<>(), 100_000);
        }

        Deque<Integer> linked = new LinkedList<>();
        Deque<Integer> deque = new ArrayDeque<>();

        System.out.printf("1,000,000 push and pop:  LinkedList %4d ms   ArrayDeque %4d ms%n",
                          ms(() -> sink += churn(linked, 1_000_000)),
                          ms(() -> sink += churn(deque, 1_000_000)));
        System.out.println("(checksum " + sink + ")");
    }
}
```

`ArrayDeque` is a circular array: adding or removing at either end writes one
slot and moves an index, with no allocation at all once the array is big
enough. `LinkedList` allocates a node per element and frees it again, which is
work for the collector as well as the CPU. Over sustained queue use that is
roughly a factor of two.

Be careful how much this claim is worth, though. A one-shot fill of a deque
that has never been used comes out about **even**, because `ArrayDeque` spends
its advantage on growing the array — and `new ArrayDeque<>(200_000)`, sized up
front, wins again. The gap that survives every arrangement is memory: a
`LinkedList` node is an object with a header and three references, so an
`Integer` costs around forty bytes against the four an `ArrayDeque` slot needs.

An earlier draft of this chapter claimed `ArrayDeque` beats `LinkedList`
outright at front insertion. Measured properly, it does not — the first version
of the benchmark compared `LinkedList.add(0, x)` against `ArrayDeque.addFirst`,
which is not the same operation. The corrected comparison is above.

So the practical guidance:

- **`ArrayList` by default.** Indexing, iteration, and appending are all fast,
  and appending is the common case.
- **`ArrayDeque`** when you need a queue or a stack — additions and removals at
  the ends, sustained.
- **`LinkedList`** essentially never. Its remaining niche is holding an
  iterator into the middle of a long list and inserting there repeatedly, which
  is rare enough that most Java programmers will not meet it.

:::note
This is not "linked lists are useless". A linked list is the right structure in
plenty of contexts — inside an LRU cache, in an intrusive list where nodes are
already objects you own, in a language without a resizable array in the
standard library. What the measurements say is narrower: for a `List` accessed
by index, `java.util.LinkedList` loses to `ArrayList` at nearly everything, and
where it wins — operations at the ends — `ArrayDeque` is the better tool for
sustained use and far cheaper in memory.
:::

:::tip
If you know roughly how many elements you will add, say so:
`new ArrayList<>(10_000)` allocates the array once instead of growing it a
dozen times. It is a one-word change that removes all the copying.
:::

:::quiz
{
  "question": "You need to insert 20,000 items into the middle of a list by index. Which is faster, and why?",
  "options": [
    { "text": "ArrayList — LinkedList must walk to the index before it can insert", "correct": true, "why": "Right. LinkedList's O(1) insertion assumes you are already at the position. Reaching index n costs n pointer-chases, while ArrayList's shift is a contiguous block move that hardware is extremely good at." },
    { "text": "LinkedList — insertion is O(1) and ArrayList must shift elements", "correct": false, "why": "This is the textbook answer and the measurement contradicts it. The O(1) applies to the insertion itself, not to finding the place." },
    { "text": "They are equivalent — both are O(n) overall", "correct": false, "why": "Both are O(n), and the constants differ by more than an order of magnitude. Complexity classes do not capture that a block move is far cheaper per element than a pointer chase." },
    { "text": "LinkedList, but only if the list is large", "correct": false, "why": "The gap widens with size rather than closing: more elements means a longer walk to the middle, and the walk is the expensive part." }
  ]
}
:::

## Practice

:::exercise pick-the-list

:::exercise batch-remove

:::recap
- `ArrayList` is an array with spare capacity: indexing is one access,
  appending is amortised constant, inserting elsewhere shifts a contiguous
  block.
- `LinkedList` is a chain of nodes: no indexing, and insertion is cheap only
  once you are at the position.
- Measured, `ArrayList` wins random access by three orders of magnitude, wins
  iteration on cache locality, and wins middle insertion — the case the
  textbook says it should lose — because walking to the index dominates.
- `LinkedList` wins at the front. For sustained queue use `ArrayDeque` is about
  twice as fast and uses a tenth of the memory — though a single unsized fill
  comes out roughly even, which is worth measuring rather than assuming.
- Default to `ArrayList`, use `ArrayDeque` for ends, and size the list up front
  when you know how many elements are coming.
:::
