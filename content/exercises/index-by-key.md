---
id: index-by-key
title: "Group items under a key"
difficulty: core
chapter: map
topics: [maps, grouping]
check: unit
standard: java21
---

Write `groupByLength(List<String> words)` returning a map from word length to
every word of that length, in the order they appeared.

`["fig", "kiwi", "pear"]` gives `{3=[fig], 4=[kiwi, pear]}`.

The starter keeps only the last word of each length, because it replaces the
value instead of adding to it.

## Starter
```java
static Map<Integer, List<String>> groupByLength(List<String> words) {
    Map<Integer, List<String>> groups = new HashMap<>();
    for (String word : words) {
        groups.put(word.length(), List.of(word));
    }
    return groups;
}
```

## Tests
```java
checkEq(groupByLength(List.of("fig", "kiwi", "pear")),
        Map.of(3, List.of("fig"), 4, List.of("kiwi", "pear")));

checkEq(groupByLength(List.of()), Map.of());

checkEq(groupByLength(List.of("a")), Map.of(1, List.of("a")));

checkEq(groupByLength(List.of("aa", "bb", "cc")), Map.of(2, List.of("aa", "bb", "cc")));

Map<Integer, List<String>> mixed =
        groupByLength(List.of("one", "three", "two", "seven", "six"));
checkEq(mixed.get(3), List.of("one", "two", "six"));
checkEq(mixed.get(5), List.of("three", "seven"));
checkEq(mixed.get(9), null);
checkEq(mixed.size(), 2);
```

## Hints
- `List.of(word)` builds a fresh one-element list every time, so each `put`
  discards whatever was there.
- You need a mutable list per key, created the first time that key is seen.
- `computeIfAbsent(key, k -> new ArrayList<>())` returns the existing list, or
  creates and stores one — either way you get a list to add to.

## Solution
```java
static Map<Integer, List<String>> groupByLength(List<String> words) {
    Map<Integer, List<String>> groups = new HashMap<>();
    for (String word : words) {
        groups.computeIfAbsent(word.length(), length -> new ArrayList<>()).add(word);
    }
    return groups;
}
```

## Notes
`computeIfAbsent` returns the value — existing or newly created — which is what
makes the one-liner work. The alternative written out is four lines and one
easily-forgotten `put`:

```java
List<String> group = groups.get(word.length());
if (group == null) {
    group = new ArrayList<>();
    groups.put(word.length(), group);
}
group.add(word);
```

Both are correct. `computeIfAbsent` also performs a single lookup where this
does up to three.

The lambda takes the key as its parameter — `length -> new ArrayList<>()` —
and ignores it here, which is normal. It matters when the initial value
depends on the key, as in `computeIfAbsent(name, n -> new Account(n))`.

Two traps worth carrying forward:

**Do not modify the map inside the lambda.** `computeIfAbsent` is holding the
map's internal state while the function runs, and a nested `put` to the same
map can corrupt it or throw `ConcurrentModificationException`. This is a real
constraint, not a theoretical one — it is documented, and recursive
`computeIfAbsent` on a memoisation map is the usual way people hit it.

**The lists inside are mutable, and they escape.** The map returned here holds
`ArrayList`s that a caller can add to, which is chapter 2.2's problem exactly.
Where that matters, copy on the way out — building an immutable map of
immutable lists — and Part 6's `Collectors.groupingBy` gives a shorter route to
the same result.
