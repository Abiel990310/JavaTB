---
title: "Iteration and modification"
navTitle: "Iteration"
summary: >-
  Why changing a collection while looping over it throws — and the one case where it does not, which is worse.
objectives:
  - Explain how fail-fast iteration detects modification
  - Remove elements safely during iteration
  - Say why ConcurrentModificationException is best-effort and what that costs
status: complete
standard: java21
requires: [queues-and-deques]
---

The enhanced `for` loop hides an iterator. Modify the collection while that
iterator is live and you usually get a `ConcurrentModificationException` —
"usually" being the word this chapter is about.

## Fail-fast

```java run expect-throw title="The exception you are supposed to get"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> items = new ArrayList<>(List.of("a", "b", "c", "d"));

        for (String item : items) {
            if (item.equals("a")) {
                items.remove(item);
            }
        }
        System.out.println(items);
    }
}
```

Every `ArrayList` keeps a `modCount` — a counter incremented by every
structural change. When an iterator is created it records the current value,
and `next()` checks that the count still matches. If it does not, something
changed behind the iterator's back and it throws immediately rather than
returning elements that may be wrong.

The name is misleading: it has nothing to do with threads. A single thread
modifying a collection it is iterating is the usual cause.

## The case that does not throw

```java run title="Same loop, one element different"
import java.util.*;

public class Main {
    static String removeDuring(List<String> items, String target) {
        try {
            for (String item : items) {
                if (item.equals(target)) {
                    items.remove(item);
                }
            }
            return "no exception, left with " + items;
        } catch (ConcurrentModificationException e) {
            return "ConcurrentModificationException";
        }
    }

    public static void main(String[] args) {
        System.out.println("removing \"a\": " + removeDuring(new ArrayList<>(List.of("a", "b", "c", "d")), "a"));
        System.out.println("removing \"c\": " + removeDuring(new ArrayList<>(List.of("a", "b", "c", "d")), "c"));
        System.out.println("removing \"d\": " + removeDuring(new ArrayList<>(List.of("a", "b", "c", "d")), "d"));
    }
}
```

Removing the **second-to-last** element does not throw. It quietly produces a
list that is right, having never looked at the last element.

The mechanism is worth following, because it explains why this cannot be fixed.
`ArrayList`'s iterator implements `hasNext()` as `cursor != size` — and only
`next()` checks `modCount`. After removing `"c"`, the size drops to 3 and the
cursor is already 3, so `hasNext()` says there is nothing left, the loop exits
normally, and `next()` never runs to notice anything is wrong.

So the loop terminated one element early. Here the element it skipped needed no
attention, and nothing was harmed. Change the body to accumulate a total, and
the total is silently short by one.

:::warning
`ConcurrentModificationException` is documented as **best-effort**: "this
exception is thrown on a best-effort basis... programs that depend on it for
correctness are wrong." It is a debugging aid that catches most mistakes
loudly. Do not treat its absence as evidence that modifying during iteration
was safe.
:::

## Removing safely

```java run title="Three ways that work"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        // 1. The iterator's own remove
        List<String> viaIterator = new ArrayList<>(List.of("a", "bb", "c", "dd"));
        for (Iterator<String> it = viaIterator.iterator(); it.hasNext(); ) {
            if (it.next().length() == 1) {
                it.remove();
            }
        }
        System.out.println("Iterator.remove: " + viaIterator);

        // 2. removeIf — one pass, and it says what it means
        List<String> viaRemoveIf = new ArrayList<>(List.of("a", "bb", "c", "dd"));
        viaRemoveIf.removeIf(s -> s.length() == 1);
        System.out.println("removeIf:        " + viaRemoveIf);

        // 3. Collect, then remove — when the decision needs the whole collection
        List<String> viaCollect = new ArrayList<>(List.of("a", "bb", "c", "dd"));
        List<String> doomed = new ArrayList<>();
        for (String s : viaCollect) {
            if (s.length() == 1) {
                doomed.add(s);
            }
        }
        viaCollect.removeAll(doomed);
        System.out.println("collect then remove: " + viaCollect);
    }
}
```

`Iterator.remove()` works because the iterator performs the removal itself and
updates its own expectation of `modCount`. It is the only removal a live
iterator tolerates, and it removes the element `next()` last returned.

`removeIf` is the one to reach for. It says what it means, does one pass, and
`ArrayList` overrides it to compact the survivors with a single block move —
chapter 4.2's `batch-remove` is this exact point.

The collect-then-remove pattern is for when the decision cannot be made
element-by-element, or when the removal must happen somewhere else entirely.

## Maps

```java run title="Iterating pairs"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> prices = new LinkedHashMap<>();
        prices.put("apple", 100);
        prices.put("pear", 250);
        prices.put("fig", 400);

        for (Map.Entry<String, Integer> entry : prices.entrySet()) {
            entry.setValue(entry.getValue() * 2);        // allowed: not structural
        }
        System.out.println("doubled: " + prices);

        prices.entrySet().removeIf(e -> e.getValue() > 500);
        System.out.println("cheap:   " + prices);

        try {
            for (String key : prices.keySet()) {
                prices.put(key + "!", 0);                 // structural: not allowed
            }
        } catch (ConcurrentModificationException e) {
            System.out.println("putting a new key while iterating: " + e.getClass().getSimpleName());
        }
    }
}
```

Iterate a map with `entrySet()` when you need both halves — `keySet()` followed
by `get` does a second lookup per entry for no reason.

`entry.setValue(...)` is legal during iteration, because replacing a value is
not a *structural* modification: no entry is added or removed, so `modCount`
does not change. Adding a key is structural, and throws.

The `keySet()`, `values()` and `entrySet()` views are live and support removal,
which is why `prices.entrySet().removeIf(...)` filters the map itself.

:::tip
When the collection is being read from several threads, the answer is not
careful iteration — it is `ConcurrentHashMap` or `CopyOnWriteArrayList`, whose
iterators are explicitly weakly consistent and never throw this. Part 8 covers
them.
:::

:::quiz
{
  "question": "A loop over a four-element ArrayList removes the third element. What happens?",
  "options": [
    { "text": "No exception — the loop ends one element early and the fourth is never examined", "correct": true, "why": "Right. hasNext() is cursor != size, and after the removal both are 3, so the loop exits before next() can check modCount. The removal is correct; the iteration silently skipped an element." },
    { "text": "ConcurrentModificationException, as with any removal during iteration", "correct": false, "why": "That is the usual outcome and not a guarantee. Removing the second-to-last element is the specific case the check misses." },
    { "text": "The loop continues and processes the shifted element twice", "correct": false, "why": "That is what an index-based loop does — chapter 4.2's batch-remove. An iterator's cursor is not re-read from the list." },
    { "text": "The list is left in a corrupt state", "correct": false, "why": "The list is fine and the removal succeeded. Only the iteration was cut short." }
  ]
}
:::

## Practice

:::exercise remove-while-looping

:::exercise filter-a-map

:::recap
- Collections are fail-fast: a `modCount` records structural changes and
  `next()` throws when it has moved.
- The check is best-effort. Removing the second-to-last element passes
  unnoticed, because `hasNext()` compares the cursor with the new size and ends
  the loop first.
- Remove safely with `Iterator.remove()`, `removeIf`, or by collecting and
  removing afterwards. `removeIf` is usually clearest and does one pass.
- Iterate maps with `entrySet()`. `entry.setValue` is allowed during
  iteration; adding a key is not.
- For genuine concurrency, use the concurrent collections rather than careful
  iteration.
:::
