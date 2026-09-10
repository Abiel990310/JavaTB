---
id: stable-output
title: "Output that does not depend on the JVM"
difficulty: intro
chapter: immutable-collections
topics: [collections, ordering, determinism]
check: unit
standard: java21
---

`summarise` builds a comma-separated list of the distinct tags in a list of
articles, for display.

It uses `Set.of`-style deduplication, so its output order is whatever the JVM
chose this morning. Two runs of the same program can produce different strings,
which makes the output useless for a test, a diff, or a cache key.

Fix it so the output is **always alphabetical**, regardless of input order or
JVM run.

- `summarise(List<String> tags)` returns the distinct tags, lower-cased,
  sorted alphabetically, joined with `", "`.
- Duplicates differing only in case collapse: `["Java", "java"]` gives
  `"java"`.
- An empty input gives an empty string.

## Starter
```java
static String summarise(List<String> tags) {
    Set<String> distinct = new HashSet<>();
    for (String tag : tags) {
        distinct.add(tag.toLowerCase(Locale.ROOT));
    }
    return String.join(", ", distinct);
}
```

## Tests
```java
checkEq(summarise(List.of("java", "collections", "java")), "collections, java");
checkEq(summarise(List.of("Java", "java", "JAVA")), "java");
checkEq(summarise(List.of()), "");
checkEq(summarise(List.of("solo")), "solo");
checkEq(summarise(List.of("zebra", "apple", "mango")), "apple, mango, zebra");
checkEq(summarise(List.of("b", "a", "c", "a", "b")), "a, b, c");

// The same input in a different order must give the same output.
checkEq(summarise(List.of("delta", "alpha", "charlie", "bravo")),
        summarise(List.of("bravo", "charlie", "alpha", "delta")));
checkEq(summarise(List.of("delta", "alpha", "charlie", "bravo")),
        "alpha, bravo, charlie, delta");
```

## Hints
- `HashSet` promises no order, so `String.join` over it produces whatever
  arrangement the hash table happened to give.
- A `TreeSet` keeps its elements sorted, and is a one-word change.
- Alternatively collect into a list and call `Collections.sort` before joining.

## Solution
```java
static String summarise(List<String> tags) {
    Set<String> distinct = new TreeSet<>();
    for (String tag : tags) {
        distinct.add(tag.toLowerCase(Locale.ROOT));
    }
    return String.join(", ", distinct);
}
```

## Notes
`TreeSet` is the smallest possible fix: it deduplicates like a `HashSet` and
iterates in sorted order, so `String.join` produces the same string every time.

The check comparing two different input orderings is the one that matters. A
`HashSet` would very often pass it — hash order does not depend on insertion
order, so two permutations of the same elements usually iterate identically —
which is exactly why this bug survives review. What it does *not* survive is a
different JVM, a different Java version, or a set large enough to resize
differently.

For a set built with `Set.of`, the failure is far more visible, because those
scramble their order per JVM run on purpose. Between the two, `HashSet` is the
more dangerous: it is stable enough within one machine to look reliable.

Three ways to get a deterministic order, and when each is right:

- **`TreeSet`** — sorted, and stays sorted as elements are added. Right when
  the collection lives on and is read repeatedly.
- **`LinkedHashSet`** — insertion order. Right when "the order they arrived" is
  meaningful and you only want to remove duplicates.
- **Collect into a `List` and sort at the end** — right when the sorting is a
  one-off for display, since it avoids maintaining a tree throughout for a
  single traversal.

The last of those is usually the cheapest here, since `summarise` iterates
exactly once. `TreeSet` is used in the solution because it is a one-word change
and the difference at this size is nothing.
