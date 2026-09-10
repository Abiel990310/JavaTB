---
id: word-frequency
title: "Count without get-check-put"
difficulty: intro
chapter: map
topics: [maps, counting]
check: unit
standard: java21
---

Write `countWords(List<String> words)` returning a map from each word to how
many times it appears.

Counting must be case-insensitive and the keys must come back lower-cased, so
`["Apple", "apple"]` gives `{apple=2}`. An empty input gives an empty map.

The starter throws on the first occurrence of every word.

## Starter
```java
static Map<String, Integer> countWords(List<String> words) {
    Map<String, Integer> counts = new HashMap<>();
    for (String word : words) {
        String key = word.toLowerCase(Locale.ROOT);
        counts.put(key, counts.get(key) + 1);
    }
    return counts;
}
```

## Tests
```java
checkEq(countWords(List.of("a", "b", "a")), Map.of("a", 2, "b", 1));
checkEq(countWords(List.of()), Map.of());
checkEq(countWords(List.of("solo")), Map.of("solo", 1));
checkEq(countWords(List.of("Apple", "apple", "APPLE")), Map.of("apple", 3));
checkEq(countWords(List.of("x", "y", "z")), Map.of("x", 1, "y", 1, "z", 1));

Map<String, Integer> counts = countWords(List.of("the", "cat", "the", "hat", "the"));
checkEq(counts.get("the"), 3);
checkEq(counts.get("cat"), 1);
checkEq(counts.get("missing"), null);
checkEq(counts.size(), 3);
```

## Hints
- `counts.get(key)` returns `null` for a word not seen yet, and unboxing
  `null` to `int` throws.
- `getOrDefault(key, 0)` gives 0 instead of null, which fixes it in one word.
- `merge(key, 1, Integer::sum)` does the whole thing: insert 1 if absent,
  otherwise combine the old value with 1 using the function.

## Solution
```java
static Map<String, Integer> countWords(List<String> words) {
    Map<String, Integer> counts = new HashMap<>();
    for (String word : words) {
        counts.merge(word.toLowerCase(Locale.ROOT), 1, Integer::sum);
    }
    return counts;
}
```

## Notes
The starter's failure is worth reading precisely. `counts.get(key)` returns
`null` for an unseen word, and `null + 1` requires unboxing the `null` to an
`int` — so the exception is a `NullPointerException` on a line containing no
visible dereference. The helpful message from chapter 3.4 does name it:
*Cannot invoke "java.lang.Integer.intValue()" because the return value of
"java.util.Map.get(Object)" is null*.

`getOrDefault(key, 0)` fixes it, and `merge` is better still. `merge(key, 1,
Integer::sum)` reads as "put 1 there, or combine what is there with 1", and it
does one hash lookup rather than the two that get-then-put performs. For a
counting loop over a large input that halving is the difference.

`toLowerCase(Locale.ROOT)` rather than `toLowerCase()` for the reason chapter
2.4's `case-insensitive-tag` gave: the no-argument form uses the default
locale, and in Turkish the lowercase of `I` is `ı`, so the same program would
count differently in Istanbul.

One thing the solution does not do is make the returned map immutable or
ordered. `HashMap` iteration order is unspecified — chapter 4.1 — so printing
this map gives an arbitrary arrangement. If the caller is going to display the
counts, returning a `LinkedHashMap` or sorting on the way out is worth the
thought.
