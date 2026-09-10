---
id: least-specific-parameter
title: "Ask for the least you need"
difficulty: intro
chapter: the-framework
topics: [collections, interfaces, design]
check: unit
standard: java21
---

`longestIn` finds the longest string in a group. It demands an `ArrayList`,
which means it cannot be given a `Set`, a `Deque`, an immutable `List`, or
anything else — for no benefit, since it only iterates.

Widen the parameter to the least specific type that still works, and make it
return `Optional<String>` so an empty input has an answer.

When several strings tie for longest, return the first one encountered in
iteration order.

## Starter
```java
static String longestIn(ArrayList<String> items) {
    String longest = items.get(0);
    for (String item : items) {
        if (item.length() > longest.length()) {
            longest = item;
        }
    }
    return longest;
}
```

## Tests
```java
List<String> arrayList = new ArrayList<>(List.of("fig", "banana", "kiwi"));
checkEq(longestIn(arrayList), Optional.of("banana"));

checkEq(longestIn(List.of("a", "bbb", "cc")), Optional.of("bbb"));

Set<String> set = new LinkedHashSet<>(List.of("one", "three", "up"));
checkEq(longestIn(set), Optional.of("three"));

Deque<String> deque = new ArrayDeque<>(List.of("x", "yyy"));
checkEq(longestIn(deque), Optional.of("yyy"));

checkEq(longestIn(List.of()), Optional.empty());
checkEq(longestIn(new ArrayList<String>()), Optional.empty());

checkEq(longestIn(List.of("aa", "bb")), Optional.of("aa"));
```

## Hints
- The method only walks the group, so it needs `Iterable<String>` — not
  `Collection`, and certainly not `ArrayList`.
- `items.get(0)` is a `List` operation and has to go; it also throws on an
  empty input.
- Start with no answer at all and let the loop supply one, which handles the
  empty case for free.
- A strict `>` keeps the first of any tie, which is what the last check asks
  for.

## Solution
```java
static Optional<String> longestIn(Iterable<String> items) {
    String longest = null;
    for (String item : items) {
        if (longest == null || item.length() > longest.length()) {
            longest = item;
        }
    }
    return Optional.ofNullable(longest);
}
```

## Notes
`ArrayList` in a parameter position is a promise the method never needed and a
restriction every caller pays. Nothing in the body indexes, adds, or removes;
it iterates. `Iterable` is exactly that capability, and widening to it lets the
same method serve a list, a set, a deque and an immutable literal without a
line changing inside.

The general rule reads in two directions, and both matter:

**Parameters: as general as possible.** Every unnecessary specificity is a
caller you have excluded.

**Return types: as specific as useful.** Returning `List` rather than
`Collection` tells the caller they may index. Returning `ArrayList` is usually
too specific — it commits you to an implementation forever.

Dropping `items.get(0)` also fixed the empty case. The starter throws
`IndexOutOfBoundsException` on an empty list, which is a second bug the type
change happened to force out: with no indexing available, the seed has to come
from the loop, and a loop that never runs leaves the seed alone. Constraints
that force better structure are worth noticing when they appear.

`Optional.ofNullable(longest)` at the end turns "the loop never ran" into an
empty `Optional`, which is chapter 3.4's argument — absence in the signature
rather than a `null` the caller must remember to check.
