---
id: comparator-by-anonymous-class
title: "Sort by two keys"
difficulty: core
chapter: nested-classes
topics: [anonymous classes, lambdas, sorting]
check: unit
standard: java21
---

Write `sortByLengthThenAlphabetically(String[] words)`, sorting the array **in
place** so that shorter words come first, and words of equal length are in
alphabetical order.

Do it with `Arrays.sort(array, comparator)`, supplying the comparator yourself —
either as an anonymous class or as a lambda. Both are accepted; the chapter's
point is that they differ only where `this` is involved, and no comparator here
mentions `this`.

`Comparator<String>` has one method, `int compare(String a, String b)`,
returning a negative number when `a` sorts first, zero when they tie, and a
positive number when `b` sorts first.

## Starter
```java
static void sortByLengthThenAlphabetically(String[] words) {
    Arrays.sort(words);
}
```

## Tests
```java
String[] a = { "pear", "fig", "apple", "kiwi", "date" };
sortByLengthThenAlphabetically(a);
checkEq(a, new String[] { "fig", "date", "kiwi", "pear", "apple" });

String[] b = { "bb", "aa", "c" };
sortByLengthThenAlphabetically(b);
checkEq(b, new String[] { "c", "aa", "bb" });

String[] empty = { };
sortByLengthThenAlphabetically(empty);
checkEq(empty, new String[] { });

String[] one = { "solo" };
sortByLengthThenAlphabetically(one);
checkEq(one, new String[] { "solo" });

String[] ties = { "zebra", "apple", "mango" };
sortByLengthThenAlphabetically(ties);
checkEq(ties, new String[] { "apple", "mango", "zebra" });
```

## Hints
- The starter sorts alphabetically only, so `apple` lands before `fig`.
- Compare the lengths first. If they differ, that decides it.
- If the lengths are equal, fall back to `a.compareTo(b)`, which compares
  alphabetically and already returns the right kind of number.
- `Integer.compare(x, y)` gives the sign safely; `x - y` can overflow, as
  chapter 1.2 showed.

## Solution
```java
static void sortByLengthThenAlphabetically(String[] words) {
    Arrays.sort(words, new Comparator<String>() {
        @Override
        public int compare(String a, String b) {
            if (a.length() != b.length()) {
                return Integer.compare(a.length(), b.length());
            }
            return a.compareTo(b);
        }
    });
}
```

## Notes
The same comparator as a lambda is three lines shorter and identical in
behaviour:

```java
Arrays.sort(words, (a, b) ->
    a.length() != b.length() ? Integer.compare(a.length(), b.length()) : a.compareTo(b));
```

and the library's own combinator form is shorter still:

```java
Arrays.sort(words, Comparator.comparingInt(String::length).thenComparing(s -> s));
```

All three are correct. The anonymous class is written out in the solution
because it makes the shape visible — it really is a class, implementing an
interface, with one method — which is what a lambda is standing in for. Part 6
takes the third form apart.

`Integer.compare(a.length(), b.length())` rather than `a.length() - b.length()`
is not pedantry, though it is safe for string lengths specifically. The
subtraction form is the classic comparator bug: for values far apart in the
`int` range it overflows and returns a number of the wrong sign, so the sort
sees an inconsistent ordering and produces garbage — or throws *Comparison
method violates its general contract*. Lengths cannot be negative so they
cannot overflow here, but the habit is worth having, because the same
comparator shape gets copied onto timestamps and IDs where they can.

The `ties` check is doing specific work: three words of equal length force the
alphabetical fallback to be exercised on its own, without the length comparison
deciding anything. Without it, a comparator that ignored the tie-break entirely
would still pass the first two checks — `Arrays.sort` is stable, so equal
elements keep their original order, and in those inputs the original order
happens to be alphabetical already.
