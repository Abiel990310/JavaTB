---
id: avoid-the-boxing
title: "A list of int, without the boxing"
difficulty: core
chapter: the-limits
topics: [generics, boxing, primitives]
check: unit
standard: java21
---

`List<Integer>` is the obvious way to hold a growable run of numbers, and it is
the wrong one when the numbers are the point: every element is a separate heap
object, and traversing it chases a pointer per value.

Rewrite the starter so it stores an `int[]` and grows it, keeping the same
public shape:

- `add(int value)` — appends, growing the array when it is full
- `get(int index)` — throws `IndexOutOfBoundsException` for an index outside
  `0 .. size() - 1`
- `size()`
- `sum()` — the total, as a `long`, so a few billion does not wrap
- `indexOf(int value)` — the first index holding `value`, or `-1`
- `toArray()` — an `int[]` of exactly `size()` elements, and a *copy*: writing
  to it must not change the list

Start the backing array at capacity 4 and double it when it fills.

## Starter
```java
static final class IntList {
    private final List<Integer> items = new ArrayList<>();

    void add(int value) {
        items.add(value);
    }

    int get(int index) {
        return items.get(index);
    }

    int size() {
        return items.size();
    }

    int sum() {
        int total = 0;
        for (Integer value : items) {
            total += value;
        }
        return total;
    }

    int indexOf(int value) {
        Integer needle = value;
        for (int i = 0; i < items.size(); i++) {
            if (items.get(i) == needle) {
                return i;
            }
        }
        return -1;
    }

    int[] toArray() {
        int[] copy = new int[items.size()];
        for (int i = 0; i < copy.length; i++) {
            copy[i] = items.get(i);
        }
        return copy;
    }
}
```

## Tests
```java
IntList list = new IntList();
checkEq(list.size(), 0);
checkEq(list.sum(), 0L);
checkEq(list.indexOf(1), -1);

for (int i = 0; i < 10; i++) {
    list.add(i * 10);
}
checkEq(list.size(), 10);
checkEq(list.get(0), 0);
checkEq(list.get(9), 90);
checkEq(list.sum(), 450L);

checkEq(list.indexOf(30), 3);
checkEq(list.indexOf(31), -1);

checkThrows(IndexOutOfBoundsException.class, () -> list.get(10));
checkThrows(IndexOutOfBoundsException.class, () -> list.get(-1));

int[] copy = list.toArray();
checkEq(copy.length, 10);
checkEq(copy[5], 50);
copy[5] = -1;
checkEq(list.get(5), 50);

// A value above the Integer cache: identity comparison would miss it.
IntList big = new IntList();
big.add(1000);
big.add(2000);
checkEq(big.indexOf(1000), 0);
checkEq(big.indexOf(2000), 1);

// Three billion does not fit in an int.
IntList wide = new IntList();
for (int i = 0; i < 3; i++) {
    wide.add(1_000_000_000);
}
checkEq(wide.sum(), 3_000_000_000L);
```

## Hints
- Keep two fields: `private int[] items = new int[4];` and
  `private int count;`. `size()` returns `count`, not `items.length`.
- To grow: `items = Arrays.copyOf(items, items.length * 2)` when
  `count == items.length`.
- `sum` must accumulate into a `long`, not add up in an `int` and widen at the
  end — the overflow happens before the return.
- `toArray` is `Arrays.copyOf(items, count)`, which trims and copies in one go.
- The starter has two bugs, both worth understanding before you delete the
  code. Read `indexOf` and `sum` closely and work out which inputs expose each.

## Solution
```java
static final class IntList {
    private int[] items = new int[4];
    private int count;

    void add(int value) {
        if (count == items.length) {
            items = Arrays.copyOf(items, items.length * 2);
        }
        items[count++] = value;
    }

    int get(int index) {
        if (index < 0 || index >= count) {
            throw new IndexOutOfBoundsException("index " + index + ", size " + count);
        }
        return items[index];
    }

    int size() {
        return count;
    }

    long sum() {
        long total = 0;
        for (int i = 0; i < count; i++) {
            total += items[i];
        }
        return total;
    }

    int indexOf(int value) {
        for (int i = 0; i < count; i++) {
            if (items[i] == value) {
                return i;
            }
        }
        return -1;
    }

    int[] toArray() {
        return Arrays.copyOf(items, count);
    }
}
```

## Notes
The starter has two bugs, and both are invisible until the numbers get large.

`indexOf` compares `items.get(i) == needle` — two `Integer`s, so `==` compares
identities, not values. `Integer` caches the objects for -128 to 127, so two
boxes of the same small number *are* the same object and the comparison
accidentally works. Above 127 each box is fresh, so `indexOf(1000)` returns -1
for a list that contains 1000. A test with small numbers passes; the same code
fails at a thousand. Had `needle` stayed an `int`, Java would have unboxed the
element and compared numerically, and the bug would not exist — which is what
makes it so easy to introduce by accident. The `int[]` version cannot have this
bug at all, because there is no object to have an identity.

`sum` returns `int` and accumulates in one. Three additions of a billion wrap
to -1294967296. Widening at the return is too late; the overflow already
happened. Accumulate in the wider type.

The reason to do any of this is in the chapter's measurement: five million
values took 2 ms as an `int[]` and 11-13 ms as a `List<Integer>`, and about a
fifth of the memory. The `int[]` is one allocation; the list is one array of
references plus one `Integer` object per element, each with a header, scattered
across the heap. The traversal is not doing more arithmetic — it is doing more
waiting.

This is exactly why the JDK ships `IntStream`, `IntSummaryStatistics` and
`Arrays.stream(int[])` alongside the generic ones. When you find yourself
writing `List<Integer>` in a hot loop, ask whether an `int[]` will do. When it
will not — because you need `List`'s API, or the collection is small, or it is
not hot — `List<Integer>` is the right answer and the clearer one.
