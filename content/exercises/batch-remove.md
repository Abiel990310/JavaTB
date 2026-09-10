---
id: batch-remove
title: "Remove without quadratic cost"
difficulty: stretch
chapter: list
topics: [collections, performance]
check: unit
standard: java21
---

Write `removeAllShorterThan(List<String> words, int minLength)`, removing every
word shorter than `minLength` **in place** and returning how many were removed.

The obvious loop — walk the list and call `remove(i)` on each match — is
quadratic, because every removal shifts the whole tail of the array. Worse, the
naive version skips elements: removing index `i` moves the next element into
`i`, and the loop then increments past it.

Write a version that is linear and correct. Do not create a new list to return;
the caller's list must be the one that changes.

## Starter
```java
static int removeAllShorterThan(List<String> words, int minLength) {
    int removed = 0;
    for (int i = 0; i < words.size(); i++) {
        if (words.get(i).length() < minLength) {
            words.remove(i);
            removed++;
        }
    }
    return removed;
}
```

## Tests
```java
List<String> a = new ArrayList<>(List.of("a", "bb", "ccc", "dddd"));
checkEq(removeAllShorterThan(a, 3), 2);
checkEq(a, List.of("ccc", "dddd"));

List<String> consecutive = new ArrayList<>(List.of("x", "y", "long", "z"));
checkEq(removeAllShorterThan(consecutive, 2), 3);
checkEq(consecutive, List.of("long"));

List<String> none = new ArrayList<>(List.of("aaa", "bbb"));
checkEq(removeAllShorterThan(none, 2), 0);
checkEq(none, List.of("aaa", "bbb"));

List<String> all = new ArrayList<>(List.of("a", "b", "c"));
checkEq(removeAllShorterThan(all, 5), 3);
checkEq(all, List.of());

List<String> empty = new ArrayList<>();
checkEq(removeAllShorterThan(empty, 3), 0);
checkEq(empty, List.of());

List<String> big = new ArrayList<>();
for (int i = 0; i < 200_000; i++) {
    big.add(i % 2 == 0 ? "x" : "keeper");
}
checkEq(removeAllShorterThan(big, 3), 100_000);
checkEq(big.size(), 100_000);
checkEq(big.get(0), "keeper");
```

## Hints
- Run the starter on `["x", "y", "long", "z"]` by hand. Which elements does it
  actually look at?
- `removeIf` takes a predicate and does the whole job in one pass —
  `words.removeIf(w -> w.length() < minLength)`. It returns a boolean, so count
  separately.
- If you write it yourself, walk forwards and compact: keep a write index,
  copy each survivor to it, then clear the tail.
- The last check has two hundred thousand elements. A quadratic solution will
  not finish inside the time limit.

## Solution
```java
static int removeAllShorterThan(List<String> words, int minLength) {
    int before = words.size();
    words.removeIf(word -> word.length() < minLength);
    return before - words.size();
}
```

## Notes
The starter has both problems the statement warns about, and the second is the
one that bites first. On `["x", "y", "long", "z"]` it removes `"x"`, which
shifts `"y"` into index 0 — and the loop then moves to index 1, never looking
at `"y"` at all. It returns 2 where the answer is 3, and leaves a word behind
that should have gone.

That is the classic index-shifting bug, and the classic fix — iterating
backwards — solves the correctness half while leaving the performance half
untouched.

`removeIf` solves both. It is defined on `Collection` and `ArrayList`
overrides it with a single-pass implementation: it marks the survivors, then
compacts them into place with one block move at the end. One traversal, one
shift, linear overall.

The two-hundred-thousand-element check is there to enforce that. A quadratic
implementation removing a hundred thousand elements does on the order of
10^10 element moves and does not finish; the linear one is a few milliseconds.
This is the pattern chapter 1.5's authoring note described — a case sized so
that the complexity class, not merely the answer, is what passes.

Note also `removeIf` returning `boolean` rather than a count. That is why the
solution measures the size before and after: the library tells you *whether*
anything changed, not how much, because for most callers the count is not
wanted and computing it would cost everyone. When you do need it, subtracting
sizes is exact and free.
