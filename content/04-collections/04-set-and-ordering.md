---
title: "Set and ordering"
navTitle: "Set and ordering"
summary: >-
  Comparable, Comparator, and the reason a TreeSet can silently discard an element that equals says is perfectly distinct.
objectives:
  - Build a Comparator from comparing, thenComparing and reversed
  - Explain why a TreeSet decides duplicates by comparison rather than equals
  - Choose between HashSet, LinkedHashSet and TreeSet
status: complete
standard: java21
requires: [map]
---

A `Set` holds no duplicates. Which is a simple statement hiding a question the
implementations answer differently: *what makes two elements the same?*

`HashSet` and `LinkedHashSet` answer with `hashCode` and `equals`, as chapter
2.4 described. `TreeSet` answers with **comparison**, and the difference is not
a detail.

## Natural ordering

A type that has an obvious order implements `Comparable`:

```java run title="compareTo defines the natural order"
import java.util.*;

public class Main {
    record Version(int major, int minor) implements Comparable<Version> {
        @Override
        public int compareTo(Version other) {
            int byMajor = Integer.compare(major, other.major);
            return byMajor != 0 ? byMajor : Integer.compare(minor, other.minor);
        }

        @Override
        public String toString() {
            return major + "." + minor;
        }
    }

    public static void main(String[] args) {
        List<Version> versions = new ArrayList<>(
            List.of(new Version(2, 1), new Version(1, 9), new Version(2, 0)));

        Collections.sort(versions);
        System.out.println("sorted:  " + versions);
        System.out.println("max:     " + Collections.max(versions));
        System.out.println("sorted set: " + new TreeSet<>(versions));
    }
}
```

`compareTo` returns a negative number, zero, or a positive number. Build it
from `Integer.compare` and friends rather than by subtracting, for the overflow
reason chapter 1.2 gave and chapter 2.12's comparator notes repeated.

Implementing `Comparable` is a claim that the type has *one* obvious order.
Version numbers do; people do not — which is what `Comparator` is for.

## Comparators, composed

```java run title="Ordering as a value you can build"
import java.util.*;

public class Main {
    record Person(String name, int age) { }

    public static void main(String[] args) {
        List<Person> people = new ArrayList<>(List.of(
            new Person("Carol", 30), new Person("alice", 25), new Person("Bob", 30)));

        people.sort(Comparator.comparingInt(Person::age).thenComparing(Person::name));
        System.out.println("age, then name:      " + people);

        people.sort(Comparator.comparingInt(Person::age).reversed());
        System.out.println("age descending:      " + people);

        people.sort(Comparator.comparing(Person::name, String.CASE_INSENSITIVE_ORDER));
        System.out.println("name, ignoring case: " + people);
    }
}
```

A `Comparator` is an object, so orderings can be built up and passed around:

- `comparing(keyExtractor)` — order by whatever the function returns
- `comparingInt` / `comparingLong` / `comparingDouble` — the same, without
  boxing the key
- `thenComparing(...)` — break ties with a second key
- `reversed()` — flip the whole thing
- `nullsFirst(...)` / `nullsLast(...)` — wrap one so it tolerates nulls

Note where `reversed()` attaches. `comparingInt(Person::age).reversed()`
reverses the entire comparator built so far; to sort by age descending and then
by name ascending you need
`comparingInt(Person::age).reversed().thenComparing(Person::name)`, which is
the sort of expression worth reading twice before trusting.

## What a TreeSet thinks a duplicate is

```java run title="One of these people vanishes"
import java.util.*;

public class Main {
    record Person(String name, int age) { }

    public static void main(String[] args) {
        Person ada = new Person("Ada", 36);
        Person grace = new Person("Grace", 36);

        System.out.println("are they equal? " + ada.equals(grace));

        Set<Person> hashed = new HashSet<>(List.of(ada, grace));
        System.out.println("HashSet size: " + hashed.size());

        Set<Person> sorted = new TreeSet<>(Comparator.comparingInt(Person::age));
        sorted.add(ada);
        sorted.add(grace);
        System.out.println("TreeSet size: " + sorted.size() + "  " + sorted);

        System.out.println("TreeSet contains Grace? " + sorted.contains(grace));
    }
}
```

Two distinct people. The `HashSet` holds both. The `TreeSet` holds one — and
then reports that it *contains* the one it discarded.

A `TreeSet` never calls `equals`. It decides everything by comparison: two
elements are the same element exactly when the comparison returns zero. A
comparator on age alone says every 36-year-old is the same person, so the
second add is treated as a duplicate and the `contains` check matches on age.

This is documented behaviour, not a bug: `SortedSet` is specified as "ordering
consistent with equals" being *recommended*, not required. But it means a
comparator that considers fewer fields than `equals` silently loses data.

:::warning
A `Comparator` used with a `TreeSet` or `TreeMap` must distinguish every pair
of elements that `equals` distinguishes, or elements disappear. Adding a
tie-breaker fixes it: `comparingInt(Person::age).thenComparing(Person::name)`
keeps both people, and keeps the ordering you wanted.
:::

The same applies to `TreeMap` keys, and it is a favourite way to lose rows: a
map keyed by a comparator on one field quietly overwrites entries whose keys
differ in another.

## Navigating a sorted set

```java run title="Questions only a sorted set can answer"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        TreeSet<Integer> marks = new TreeSet<>(List.of(10, 20, 30, 40));

        System.out.println("first / last:      " + marks.first() + " / " + marks.last());
        System.out.println("floor(25):         " + marks.floor(25));      // largest <= 25
        System.out.println("ceiling(25):       " + marks.ceiling(25));    // smallest >= 25
        System.out.println("headSet(30):       " + marks.headSet(30));    // strictly below
        System.out.println("tailSet(30):       " + marks.tailSet(30));    // 30 and above
        System.out.println("descendingSet:     " + marks.descendingSet());
        System.out.println("subSet(15, 35):    " + marks.subSet(15, 35));
    }
}
```

These are the reason to accept a `TreeSet`'s costs. A `HashSet` can tell you
whether 25 is present; only a sorted structure can tell you what is nearest to
it, or hand you everything in a range without scanning.

`floor`, `ceiling`, `headSet` and `subSet` are all O(log n), and they are the
operations that make a `TreeMap` the right choice for things like rate tables,
schedules and version ranges — anywhere a lookup means "the entry that applies
at this point".

## Choosing

| | Order | Lookup | Null | Use when |
|---|---|---|---|---|
| `HashSet` | none | O(1) | one allowed | membership, and nothing else matters |
| `LinkedHashSet` | insertion | O(1) | one allowed | membership with reproducible output |
| `TreeSet` | sorted | O(log n) | rejected | you need range or nearest queries |

`HashSet` is the default. Reach for `LinkedHashSet` when the iteration order
showing up in output or a test would otherwise be arbitrary — the cost is one
reference per element. Reach for `TreeSet` when the *sorted* part is load
bearing, not merely convenient; if you only need the elements in order once,
sorting a list at the end is cheaper than maintaining a tree throughout.

:::quiz
{
  "question": "A TreeSet uses `Comparator.comparing(Employee::department)`. Twenty employees across four departments are added. What is its size?",
  "options": [
    { "text": "4 — every employee after the first in each department is treated as a duplicate", "correct": true, "why": "Right. A TreeSet decides identity by comparison alone, never equals, so a comparator that returns zero for two employees makes them the same element. Sixteen employees are silently discarded." },
    { "text": "20 — the comparator only affects iteration order", "correct": false, "why": "That is true of a list sort, and false for a sorted set. The comparator is how a TreeSet decides what is already present." },
    { "text": "20, provided Employee overrides equals correctly", "correct": false, "why": "TreeSet never calls equals. Overriding it changes nothing about which elements a TreeSet keeps." },
    { "text": "It throws, because the comparator is not consistent with equals", "correct": false, "why": "Consistency with equals is recommended by the specification, not enforced. Nothing checks, which is exactly why this loses data quietly." }
  ]
}
:::

## Practice

:::exercise sort-by-two-keys

:::exercise the-vanishing-elements

:::recap
- `Comparable` gives a type one natural order; `Comparator` is an order built
  as a value, from `comparing`, `thenComparing` and `reversed`.
- `reversed()` flips everything built before it, so its position in the chain
  matters.
- A `TreeSet` and `TreeMap` decide duplicates by comparison returning zero, and
  never call `equals`. A comparator that considers fewer fields than `equals`
  discards elements silently.
- Sorted sets answer questions hashing cannot: `floor`, `ceiling`, `headSet`,
  `subSet`, all in O(log n).
- `HashSet` by default, `LinkedHashSet` for reproducible output, `TreeSet` when
  range or nearest queries earn the cost.
:::
