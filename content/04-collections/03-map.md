---
title: "Map"
navTitle: "Map"
summary: >-
  How a HashMap actually stores things, what the load factor buys, and the rescue for bad hash codes that only works if your key implements Comparable.
objectives:
  - Use the map operations that replace get-check-put
  - Explain buckets, load factor and resizing
  - Say what happens when every key collides, and what makes it survivable
status: complete
standard: java21
requires: [list]
---

A `Map` associates keys with values. It is the collection you will reach for
most after `List`, and the one whose performance depends most on code you
wrote — because it calls your `hashCode` and `equals` on every operation.

Chapter 2.4 established the contract. This chapter is what the map does with
it.

## The operations worth knowing

```java run title="Beyond put and get"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("apple", 5);
        stock.put("pear", 2);

        System.out.println("get:           " + stock.get("apple"));
        System.out.println("missing get:   " + stock.get("fig"));          // null
        System.out.println("getOrDefault:  " + stock.getOrDefault("fig", 0));

        // Counting, without get-check-put
        Map<String, Integer> counts = new HashMap<>();
        for (String word : List.of("a", "b", "a", "c", "a")) {
            counts.merge(word, 1, Integer::sum);
        }
        System.out.println("merge counts:  " + counts);

        // Grouping, without checking whether the list exists
        Map<Character, List<String>> byFirst = new HashMap<>();
        for (String word : List.of("apple", "avocado", "banana")) {
            byFirst.computeIfAbsent(word.charAt(0), k -> new ArrayList<>()).add(word);
        }
        System.out.println("grouped:       " + byFirst);

        System.out.println("putIfAbsent:   " + stock.putIfAbsent("apple", 99) + ", still " + stock.get("apple"));
    }
}
```

`merge` and `computeIfAbsent` replace the three-line get-check-put dance, and
they are worth learning as a pair: `merge` for combining a new value with an
existing one, `computeIfAbsent` for creating a container the first time a key
is seen.

`get` returning `null` is ambiguous — it means either "absent" or "present with
a null value". `getOrDefault` removes the ambiguity for reads, and
`containsKey` answers it directly.

## What a HashMap is doing

A `HashMap` holds an array of **buckets**. To find a key's bucket it calls
`hashCode()`, mixes the result — the high bits are XORed into the low ones, so
that keys differing only in their upper bits do not all land together — and
takes the low bits as an index.

Within a bucket, entries are compared with `equals`. So:

- **`hashCode` decides which bucket to look in.** Cheap and approximate.
- **`equals` decides which entry in that bucket is yours.** Exact.

That is why the contract from chapter 2.4 is what it is: unequal hash codes
send equal objects to different buckets, and the second one is never found.

### Load factor and resizing

The array starts at 16 buckets and grows when the number of entries exceeds
**capacity × 0.75** — the *load factor*. Growing doubles the array and
redistributes every entry.

The 0.75 is a deliberate compromise. Higher means fewer, fuller buckets: less
memory, more comparisons per lookup. Lower means more, emptier buckets: faster
lookups, more memory, and more frequent resizes. Three-quarters is where the
JDK's authors landed and there is rarely reason to change it.

What is worth doing is **sizing the map when you know roughly how many entries
are coming**. `new HashMap<>(10_000)` skips the ten resizes that filling an
empty map would cause, each of which rehashes everything already in it.

## When every key collides

A bucket holding many entries used to be a linked list, so a map whose keys all
hashed alike degraded to a linear scan — the classic denial-of-service against
web frameworks that put request parameters into a `HashMap`.

Java 8 added **treeification**: once a bucket holds eight entries and the table
is at least 64 buckets, that bucket becomes a red-black tree, and lookups
within it are O(log n) instead of O(n).

That is the story usually told, and it is incomplete in a way that matters.

```java run title="Two maps whose keys all hash to zero"
import java.util.*;

public class Main {
    static long sink;

    record Plain(int id) {
        @Override
        public int hashCode() {
            return 0;                       // every key in the same bucket
        }
    }

    record Ordered(int id) implements Comparable<Ordered> {
        @Override
        public int hashCode() {
            return 0;                       // same, but the keys can be ordered
        }

        @Override
        public int compareTo(Ordered other) {
            return Integer.compare(id, other.id);
        }
    }

    static long ms(Runnable r) {
        long t = System.nanoTime();
        r.run();
        return (System.nanoTime() - t) / 1_000_000;
    }

    public static void main(String[] args) {
        int n = 8_000;
        Map<Plain, Integer> plain = new HashMap<>();
        Map<Ordered, Integer> ordered = new HashMap<>();
        for (int i = 0; i < n; i++) {
            plain.put(new Plain(i), i);
            ordered.put(new Ordered(i), i);
        }

        for (int w = 0; w < 2; w++) {              // warm up
            for (int i = 0; i < 1_000; i++) {
                sink += plain.get(new Plain(i));
                sink += ordered.get(new Ordered(i));
            }
        }

        System.out.printf("%,d entries, 3,000 lookups, every key hashing to 0:%n", n);
        System.out.printf("  key is not Comparable: %5d ms%n",
                          ms(() -> { for (int i = 0; i < 3_000; i++) sink += plain.get(new Plain(i % n)); }));
        System.out.printf("  key is Comparable:     %5d ms%n",
                          ms(() -> { for (int i = 0; i < 3_000; i++) sink += ordered.get(new Ordered(i % n)); }));
        System.out.println("(checksum " + sink + ")");
    }
}
```

Both maps have identical, uniformly terrible hash codes. One is hundreds of
times faster than the other.

The reason is that a red-black tree needs an **ordering** to search by. When
keys implement `Comparable`, the tree is built and searched using
`compareTo`, and lookups really are O(log n). When they do not, `HashMap` falls
back to comparing identity hash codes to decide where to *put* things — which
gives a consistent tree shape but is useless for *finding* a key later, because
a freshly constructed equal key has a different identity hash. The lookup ends
up traversing the tree exhaustively.

So the practical rule is stronger than "treeification saves you":

- **Write a good `hashCode`.** `Objects.hash(...)` over the fields that
  `equals` uses is nearly always enough.
- **Treeification is a safety net for adversarial input, not a substitute** —
  and the net has a hole in it unless the key is `Comparable`.

:::warning
Never write `hashCode()` returning a constant to "make equals work". It
compiles, it satisfies the contract — equal objects do have equal hash codes —
and it turns every map and set using that key into the slowest possible data
structure. The contract is a floor, not a goal.
:::

## Ordering, and null

```java run title="Three maps, three promises"
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> hash = new HashMap<>();
        Map<String, Integer> linked = new LinkedHashMap<>();
        Map<String, Integer> tree = new TreeMap<>();

        for (Map<String, Integer> m : List.of(hash, linked, tree)) {
            m.put("pear", 1);
            m.put("apple", 2);
            m.put("fig", 3);
        }

        System.out.println("HashMap       " + hash.keySet() + "  (no guarantee)");
        System.out.println("LinkedHashMap " + linked.keySet() + "  (insertion order)");
        System.out.println("TreeMap       " + tree.keySet() + "  (sorted)");

        hash.put(null, 0);
        System.out.println("HashMap accepts one null key: " + hash.get(null));
        try {
            Map.of("a", 1).getClass();
            Map<String, Integer> immutable = new HashMap<>(hash);
            Map.copyOf(immutable);
        } catch (NullPointerException e) {
            System.out.println("Map.copyOf rejects a null key");
        }
    }
}
```

`HashMap` accepts one `null` key and any number of `null` values. `TreeMap`
rejects a null key, because it must compare it. The immutable factories —
`Map.of`, `Map.copyOf` — reject nulls entirely, which is the same tightening
`List.of` applies.

:::tip
Reach for `LinkedHashMap` more often than you probably do. It costs one extra
reference per entry and makes output deterministic, which turns "the test fails
on CI and passes locally" into a class of bug you never have.
:::

:::quiz
{
  "question": "A class overrides `hashCode()` to `return 0;` and `equals` correctly. Ten thousand instances are put into a HashMap. What happens to lookups?",
  "options": [
    { "text": "They degrade badly — and treeification only rescues them if the key is Comparable", "correct": true, "why": "Right. Every key lands in one bucket. The bucket treeifies, but a red-black tree needs an ordering to search; without Comparable, HashMap orders by identity hash, which a freshly built equal key does not share, so lookup degenerates to traversing the tree." },
    { "text": "Nothing — the contract is satisfied, so the map works normally", "correct": false, "why": "The map is correct and extremely slow. Satisfying the contract makes it work; distributing well is what makes it fast." },
    { "text": "They stay O(log n) because Java 8 treeifies large buckets", "correct": false, "why": "That is the usual half of the story. Treeification happens, but the tree can only be searched efficiently when the keys are Comparable." },
    { "text": "The map throws once a bucket exceeds eight entries", "correct": false, "why": "Nothing throws. Eight entries is the threshold at which a bucket converts from a list to a tree, which is an optimisation and not a limit." }
  ]
}
:::

## Practice

:::exercise word-frequency

:::exercise index-by-key

:::recap
- `merge` and `computeIfAbsent` replace get-check-put; `getOrDefault` removes
  the ambiguity of a `null` return.
- A `HashMap` picks a bucket from `hashCode` and picks the entry inside it with
  `equals`. It grows when entries exceed capacity × 0.75, rehashing everything.
- Size the map up front when you know roughly how many entries are coming.
- A bucket with eight or more entries becomes a red-black tree — but that tree
  is only searchable in O(log n) if the key implements `Comparable`. Otherwise
  a bad `hashCode` is still catastrophic.
- `HashMap` promises no order, `LinkedHashMap` gives insertion order, `TreeMap`
  gives sorted order. `HashMap` allows one null key; `TreeMap` and the
  immutable factories do not.
:::
