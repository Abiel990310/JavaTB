---
title: "Queues and deques"
navTitle: "Queues and deques"
summary: >-
  Stacks and queues from one interface, the two method families that fail differently, and why printing a PriorityQueue does not show you sorted order.
objectives:
  - Use a Deque as both a stack and a queue, and choose between its two method families
  - Say what a PriorityQueue guarantees and what it does not
  - Explain why iterating a PriorityQueue is not the same as draining it
status: complete
standard: java21
requires: [set-and-ordering]
---

A `Queue` takes elements at one end and gives them back at the other. A `Deque`
— "deck", double-ended queue — does it at both ends, which makes it a stack, a
queue, or both at once.

Chapter 4.2 already recommended `ArrayDeque` over `LinkedList`. This chapter is
what to do with it.

## One class, two shapes

```java run title="A stack and a queue from the same type"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Deque<String> stack = new ArrayDeque<>();
        stack.push("a");
        stack.push("b");
        stack.push("c");
        System.out.println("stack pops:  " + stack.pop() + stack.pop() + stack.pop());

        Deque<String> queue = new ArrayDeque<>();
        queue.offer("a");
        queue.offer("b");
        queue.offer("c");
        System.out.println("queue polls: " + queue.poll() + queue.poll() + queue.poll());
    }
}
```

`push`/`pop` work at the front; `offer`/`poll` add at the back and remove from
the front. Same object, two disciplines, chosen by which methods you call.

:::warning
Do not use `java.util.Stack`. It extends `Vector`, so every method is
synchronised whether you need it or not, and — worse — it iterates
**bottom-to-top**, the opposite of pop order, which has surprised people for
twenty-five years. `ArrayDeque` is faster, unsynchronised, and iterates in pop
order. The JDK's own documentation now says to prefer it.
:::

## Two method families, two failure modes

Every `Queue` operation comes in a pair: one that throws when it cannot
proceed, and one that returns a sentinel.

| Operation | Throws | Returns a sentinel |
|---|---|---|
| insert | `add` | `offer` |
| remove | `remove` | `poll` (returns `null`) |
| examine | `element` | `peek` (returns `null`) |

```java run title="The same emptiness, reported two ways"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Deque<String> empty = new ArrayDeque<>();

        System.out.println("peek():   " + empty.peek());
        System.out.println("poll():   " + empty.poll());

        try {
            empty.element();
        } catch (NoSuchElementException e) {
            System.out.println("element(): NoSuchElementException");
        }

        try {
            empty.add(null);
        } catch (NullPointerException e) {
            System.out.println("add(null): ArrayDeque rejects null elements");
        }
    }
}
```

This is chapter 3.5's distinction built into an API. An empty queue is
sometimes a bug — a worker pulling from a queue that should never be empty —
and sometimes just an empty queue. Pick the family that matches which one it is,
rather than wrapping `poll` in a null check out of habit.

`ArrayDeque` rejects `null` elements outright, and that is why: `poll` and
`peek` use `null` to mean "nothing there", so allowing a null element would
make the answer ambiguous.

## PriorityQueue

A `PriorityQueue` gives back the *smallest* element first, by natural ordering
or by a comparator. It is a binary heap: `offer` and `poll` are O(log n), and
`peek` is O(1).

```java run title="What it promises, and what it does not"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        PriorityQueue<Integer> queue = new PriorityQueue<>(List.of(5, 1, 4, 2, 3));

        System.out.println("printed:    " + queue);
        System.out.println("iterated:   " + new ArrayList<>(queue));

        StringBuilder drained = new StringBuilder();
        while (!queue.isEmpty()) {
            drained.append(queue.poll()).append(' ');
        }
        System.out.println("polled:     " + drained.toString().trim());

        PriorityQueue<String> byLength = new PriorityQueue<>(Comparator.comparingInt(String::length));
        byLength.addAll(List.of("ccc", "a", "bb"));
        System.out.println("by length:  " + byLength.poll() + " " + byLength.poll() + " " + byLength.poll());
    }
}
```

Look at the first two lines against the third.

**Printing a `PriorityQueue` does not show sorted order.** Neither does
iterating it, or copying it into a list, or streaming it. All of those walk the
underlying array, which is a heap — a tree flattened into an array, where the
only guarantee is that each node is smaller than its children. Position 0 holds
the minimum and the rest are in no order you should rely on.

The only thing that produces sorted order is **draining it with `poll`**, which
re-heapifies after each removal.

:::pitfall
`new ArrayList<>(priorityQueue)` and `priorityQueue.toString()` are the two
usual ways this bug arrives, and both look completely reasonable. If you need
the elements in order, poll them out, or sort the copy explicitly. A test that
asserts on the printed form of a `PriorityQueue` is testing the heap's internal
layout.
:::

A `PriorityQueue` is the right structure whenever you repeatedly need "the
smallest thing left" and the set keeps changing: task scheduling, event
simulation, Dijkstra's algorithm, merging sorted inputs. When the collection is
fixed and you want it all in order, sorting a list is simpler and faster.

For a *largest*-first queue, reverse the comparator:
`new PriorityQueue<>(Comparator.reverseOrder())`.

:::quiz
{
  "question": "You add 5, 1, 4, 2, 3 to a PriorityQueue and print it. What comes out?",
  "options": [
    { "text": "Something starting with 1, with the rest in heap order rather than sorted", "correct": true, "why": "Right. toString walks the backing array, which is a heap: position 0 is the minimum and the remainder satisfies only the parent-smaller-than-children property. Draining with poll is the only thing that yields sorted order." },
    { "text": "[1, 2, 3, 4, 5] — the queue keeps its elements sorted", "correct": false, "why": "A heap is not a sorted array. Keeping it fully sorted would make insertion O(n) instead of O(log n), which is the trade the structure exists to avoid." },
    { "text": "[5, 1, 4, 2, 3] — insertion order, like a list", "correct": false, "why": "Elements move as the heap restores its invariant on each insertion, so insertion order does not survive." },
    { "text": "It throws, because a PriorityQueue has no defined iteration order", "correct": false, "why": "It has an iteration order and is happy to show it; the order simply is not the priority order, which is what makes this quiet rather than loud." }
  ]
}
:::

## Practice

:::exercise balanced-brackets

:::exercise top-k-scores

:::recap
- A `Deque` is a stack with `push`/`pop` and a queue with `offer`/`poll`.
  `ArrayDeque` is the implementation to use; `java.util.Stack` iterates in the
  wrong direction and is synchronised for no reason.
- Every queue operation has a throwing form (`add`, `remove`, `element`) and a
  sentinel form (`offer`, `poll`, `peek`). Choose by whether emptiness is a bug.
- `ArrayDeque` rejects `null` because `poll` and `peek` use it to mean "empty".
- A `PriorityQueue` is a heap: `poll` returns the smallest, in O(log n).
- Printing, iterating or copying a `PriorityQueue` shows heap order, not sorted
  order. Only draining it with `poll` sorts.
:::
