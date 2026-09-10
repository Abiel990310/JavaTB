---
title: "The collections framework"
navTitle: "The framework"
summary: >-
  The shape of the hierarchy, why Map sits outside it, and the four different things "unmodifiable" turns out to mean.
objectives:
  - Place List, Set, Queue and Map in the hierarchy and say what each promises
  - Distinguish an immutable collection, a fixed-size one, a view and a snapshot
  - Say which collections guarantee an iteration order and which only appear to
status: complete
standard: java21
requires: [designing-failure]
---

Arrays, from chapter 1.5, have a fixed length and no operations. Everything
past that comes from the collections framework: a set of interfaces describing
what a group of objects can do, and implementations that make different
trade-offs about how.

The interfaces are the part worth learning. Implementations get swapped;
`List` does not.

## The shape

```
Iterable
   └── Collection
         ├── List       ordered, indexed, duplicates allowed
         ├── Set        no duplicates, usually unordered
         └── Queue      ordered for insertion and removal at ends

Map                     keys to values — not a Collection
```

`Iterable` is what the enhanced `for` loop needs, and its only requirement is
that you can walk the contents once.

`Collection` adds the operations every group has: `add`, `remove`, `contains`,
`size`, `isEmpty`.

**`Map` is deliberately not a `Collection`.** A `Collection` holds elements and
a `Map` holds pairs, so almost none of `Collection`'s methods would mean the
same thing — `add` takes one argument, `contains` would be ambiguous between
keys and values. Instead a `Map` offers three *views* that are collections:
`keySet()`, `values()` and `entrySet()`.

```java run title="One object, several interfaces"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<String> list = new ArrayList<>(List.of("b", "a", "b"));
        Set<String> set = new HashSet<>(list);
        Map<String, Integer> map = new HashMap<>();
        map.put("a", 1);
        map.put("b", 2);

        System.out.println("list " + list + " size " + list.size());
        System.out.println("set  " + set + "  — the duplicate is gone");
        System.out.println("map keys   " + map.keySet());
        System.out.println("map values " + map.values());

        Collection<String> asCollection = list;      // a List is a Collection
        System.out.println("contains \"a\": " + asCollection.contains("a"));
        System.out.println("a Map is a Collection: " + (map instanceof Collection));
    }
}
```

Declare variables by the **interface** and construct by the implementation:
`List<String> names = new ArrayList<>()`. The right-hand side is a decision
about performance; the left-hand side is what the rest of the code depends on,
and keeping it general means the decision can be revisited.

## Four kinds of "unmodifiable"

This is where most confusion about collections starts, because four different
things share one word.

```java run title="They are not the same thing"
import java.util.*;

public class Main {
    static void attempt(String what, Runnable action) {
        try {
            action.run();
            System.out.println("  " + what + ": allowed");
        } catch (UnsupportedOperationException e) {
            System.out.println("  " + what + ": UnsupportedOperationException");
        } catch (NullPointerException e) {
            System.out.println("  " + what + ": NullPointerException");
        }
    }

    public static void main(String[] args) {
        System.out.println("List.of — immutable:");
        List<String> immutable = List.of("a", "b");
        attempt("add", () -> immutable.add("c"));
        attempt("set", () -> immutable.set(0, "z"));
        attempt("containing null", () -> List.of("a", null));

        System.out.println("Arrays.asList — fixed size, mutable elements:");
        List<String> fixed = Arrays.asList("a", "b");
        attempt("add", () -> fixed.add("c"));
        attempt("set", () -> fixed.set(0, "z"));
        System.out.println("  after set: " + fixed);

        System.out.println("Collections.unmodifiableList — a view:");
        List<String> backing = new ArrayList<>(List.of("a", "b"));
        List<String> view = Collections.unmodifiableList(backing);
        attempt("add through the view", () -> view.add("c"));
        backing.add("c");
        System.out.println("  someone changed the backing list, so the view is now " + view);

        System.out.println("List.copyOf — a snapshot:");
        List<String> snapshot = List.copyOf(backing);
        backing.add("d");
        System.out.println("  snapshot " + snapshot + " while the original is " + backing);
    }
}
```

- **`List.of(...)`** is genuinely immutable. Nothing can change it, and it
  rejects `null` elements outright — a deliberate tightening, since `null` in a
  collection is nearly always a mistake.
- **`Arrays.asList(...)`** is a *fixed-size list backed by the array*. You
  cannot add or remove, but `set` works and writes through to the array. It is
  a bridge between arrays and lists, not an immutable list.
- **`Collections.unmodifiableList(x)`** is a **view**. It blocks changes made
  *through it* and is powerless against changes made to `x`. Hand one out while
  keeping the original and you have handed out something that can change under
  the caller — chapter 2.2's escaping reference in a new costume.
- **`List.copyOf(x)`** takes a snapshot and is immutable thereafter. This is
  the one to return from a getter.

:::warning
`Collections.unmodifiableList` is not defensive copying. It protects the
recipient from making changes; it does not protect them from *seeing* changes.
If a caller must have a stable value, copy — as chapter 2.2's `defend-the-
inventory` did.
:::

## Which orders are guaranteed

```java run title="One of these is a coincidence"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> input = List.of(3, 1, 2);

        System.out.println("ArrayList     " + new ArrayList<>(input));
        System.out.println("HashSet       " + new HashSet<>(input));
        System.out.println("LinkedHashSet " + new LinkedHashSet<>(input));
        System.out.println("TreeSet       " + new TreeSet<>(input));

        List<String> words = List.of("pear", "fig", "apple");
        System.out.println("HashSet of strings " + new HashSet<>(words));
    }
}
```

- **`ArrayList`** keeps insertion order, always. It is a list; that is the
  point.
- **`LinkedHashSet`** keeps insertion order too, by maintaining a linked list
  alongside the hash table.
- **`TreeSet`** keeps *sorted* order, by keeping a balanced tree.
- **`HashSet` guarantees nothing.**

Look at the `HashSet` line for the integers. It very likely prints `[1, 2, 3]`,
which looks like sorting and is not: small `Integer` objects hash to their own
value, so they land in buckets in numeric order by accident. The line below,
with strings, shows the order scattering.

That accident is a trap. Code written against three small integers appears to
work, and fails when the data grows, changes type, or the map resizes. **If the
order matters, use a collection that promises one.**

:::note
An implementation detail worth knowing early: `HashSet` is a `HashMap` with a
constant object as every value. It is not a separate data structure, which is
why the two behave identically about ordering, null handling and resizing.
Chapter 4.3 opens the map up.
:::

## The operations everything shares

```java run title="Written against the interface"
import java.util.*;

public class Main {
    static int countLongerThan(Collection<String> items, int length) {
        int count = 0;
        for (String item : items) {
            if (item.length() > length) {
                count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        List<String> list = List.of("apple", "fig", "banana");
        Set<String> set = new TreeSet<>(list);
        Deque<String> deque = new ArrayDeque<>(list);

        System.out.println(countLongerThan(list, 3));
        System.out.println(countLongerThan(set, 3));
        System.out.println(countLongerThan(deque, 3));
    }
}
```

One method, three implementations, no changes. That is what the hierarchy buys:
`countLongerThan` needs only `Iterable`, so declaring `Collection` is already
more specific than it has to be.

The rule of thumb for parameters: **ask for the least you need.** `Iterable` if
you only iterate, `Collection` if you also need `size` or `contains`, `List`
only if you genuinely index. A method demanding `ArrayList` cannot be given
anything else, for no benefit whatsoever.

:::quiz
{
  "question": "A getter returns `Collections.unmodifiableList(items)`, where `items` is the object's own mutable list. What can the caller do?",
  "options": [
    { "text": "Not modify it — but they will see every later change the object makes", "correct": true, "why": "Right. It is a view over the same list, so it blocks writes through itself and reflects writes made to the backing list. For a stable value the getter must copy, with List.copyOf." },
    { "text": "Nothing at all — the list is immutable", "correct": false, "why": "Only writes through the view are blocked. The backing list is untouched and every change to it is visible through the view immediately." },
    { "text": "Modify it, since the view delegates to the backing list", "correct": false, "why": "Writes through the view throw UnsupportedOperationException. Reads delegate; writes do not." },
    { "text": "See a snapshot taken when the getter was called", "correct": false, "why": "That is List.copyOf. unmodifiableList copies nothing and takes no snapshot — it wraps." }
  ]
}
:::

## Practice

:::exercise least-specific-parameter

:::exercise snapshot-not-view

:::recap
- `Iterable` → `Collection` → `List`, `Set`, `Queue`. `Map` sits outside,
  because it holds pairs, and exposes `keySet`, `values` and `entrySet` as
  collection views.
- Declare by the interface, construct by the implementation, and ask for the
  least specific parameter type that does the job.
- `List.of` is immutable and rejects null; `Arrays.asList` is fixed-size but
  `set` writes through; `Collections.unmodifiableList` is a view that shows
  later changes; `List.copyOf` is a snapshot.
- `ArrayList` and `LinkedHashSet` keep insertion order, `TreeSet` keeps sorted
  order, and `HashSet` guarantees nothing — even when it appears to sort small
  integers.
:::
