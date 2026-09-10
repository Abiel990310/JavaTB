---
id: filter-a-map
title: "Change a map while reading it"
difficulty: core
chapter: iteration
topics: [maps, iteration]
check: unit
standard: java21
---

Write two methods over a `Map<String, Integer>` of prices in pence.

- `applyDiscount(Map<String, Integer> prices, int percent)` — reduces every
  price by that percentage, rounding **down**, modifying the map in place.
- `dropAbove(Map<String, Integer> prices, int limit)` — removes every entry
  whose price is strictly above `limit`, in place, returning how many were
  removed.

Both must work without a `ConcurrentModificationException`, and without
building a replacement map.

The starter throws on the second one.

## Starter
```java
static void applyDiscount(Map<String, Integer> prices, int percent) {
    for (String key : prices.keySet()) {
        prices.put(key, prices.get(key) * (100 - percent) / 100);
    }
}

static int dropAbove(Map<String, Integer> prices, int limit) {
    int removed = 0;
    for (Map.Entry<String, Integer> entry : prices.entrySet()) {
        if (entry.getValue() > limit) {
            prices.remove(entry.getKey());
            removed++;
        }
    }
    return removed;
}
```

## Tests
```java
Map<String, Integer> prices = new LinkedHashMap<>();
prices.put("apple", 100);
prices.put("pear", 250);
prices.put("fig", 401);

applyDiscount(prices, 10);
checkEq(prices.get("apple"), 90);
checkEq(prices.get("pear"), 225);
checkEq(prices.get("fig"), 360);
checkEq(prices.size(), 3);

checkEq(dropAbove(prices, 300), 1);
checkEq(prices.size(), 2);
check(!prices.containsKey("fig"));
checkEq(prices.get("apple"), 90);

Map<String, Integer> rounding = new LinkedHashMap<>();
rounding.put("odd", 99);
applyDiscount(rounding, 33);
checkEq(rounding.get("odd"), 66);

Map<String, Integer> none = new LinkedHashMap<>();
none.put("a", 10);
checkEq(dropAbove(none, 100), 0);
checkEq(none.size(), 1);

Map<String, Integer> allGone = new LinkedHashMap<>();
allGone.put("a", 500);
allGone.put("b", 600);
checkEq(dropAbove(allGone, 100), 2);
check(allGone.isEmpty());
```

## Hints
- `applyDiscount` works, but iterates `keySet()` and then calls `get` for every
  key — two lookups where one would do. `entrySet()` with `setValue` is the
  direct form, and `setValue` is legal during iteration.
- `dropAbove` removes through the map while an iterator is live, which is a
  structural change and throws.
- `prices.entrySet().removeIf(...)` filters the map itself, because the entry
  set is a live view of it.
- `replaceAll` on a map applies a function to every value in place, which is
  `applyDiscount` in one line.

## Solution
```java
static void applyDiscount(Map<String, Integer> prices, int percent) {
    prices.replaceAll((key, price) -> price * (100 - percent) / 100);
}

static int dropAbove(Map<String, Integer> prices, int limit) {
    int before = prices.size();
    prices.entrySet().removeIf(entry -> entry.getValue() > limit);
    return before - prices.size();
}
```

## Notes
The two halves fail differently, and the difference is exactly the definition
of a **structural** modification.

`applyDiscount` replaces values. No entry is added or removed, so `modCount`
never changes and nothing throws — the starter is correct, merely wasteful.
`entrySet()` with `entry.setValue(...)` removes the second lookup, and
`replaceAll` removes the loop as well.

`dropAbove` removes entries, which is structural, so the iterator notices and
throws. `entrySet().removeIf(...)` works because the entry set is a **live
view** of the map rather than a copy — removing from the view removes from the
map, and `removeIf` on a view is implemented through the view's own iterator,
which is allowed to remove.

That the three map views are live is worth holding on to. `keySet().retainAll(
other)` intersects a map's keys with a collection, in place. `values().remove(
x)` drops one entry with that value. They are not snapshots and never were,
which makes them powerful and makes handing one to a caller the same mistake
chapter 4.1 described for `unmodifiableList`.

The rounding check is there because `99 * 67 / 100` is `66.33`, and integer
division truncates toward zero — chapter 1.2 — so the answer is 66 rather than
a rounded 66. Multiplying before dividing also matters: `99 / 100 * 67` would
be 0, having thrown the value away in the first operation.
