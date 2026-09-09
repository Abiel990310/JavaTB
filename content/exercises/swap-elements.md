---
id: swap-elements
title: "Swap two elements"
difficulty: intro
chapter: methods
topics: [methods, arrays, references]
check: unit
standard: java21
---

Write `swap(int[] xs, int i, int j)`, exchanging the elements at positions `i`
and `j`. It returns nothing — the caller sees the change through the array.

That this can work at all is the chapter's point: a method cannot swap two
`int` variables belonging to its caller, but it can swap two elements of an
array the caller handed it, because both of them are following the same arrow
to the same array.

You may assume both indices are in range.

## Starter
```java
static void swap(int[] xs, int i, int j) {
    int temp = xs[i];
    xs[i] = xs[j];
    xs[j] = xs[i];
}
```

## Tests
```java
int[] a = { 1, 2, 3 };
swap(a, 0, 2);
checkEq(a, new int[] { 3, 2, 1 });

int[] b = { 10, 20 };
swap(b, 0, 1);
checkEq(b, new int[] { 20, 10 });

int[] c = { 5, 6, 7 };
swap(c, 1, 1);
checkEq(c, new int[] { 5, 6, 7 });

int[] d = { 1, 2, 3, 4 };
swap(d, 1, 2);
swap(d, 1, 2);
checkEq(d, new int[] { 1, 2, 3, 4 });
```

## Hints
- Walk the starter line by line with `xs = {1, 2, 3}`, `i = 0`, `j = 2`. What is
  in `xs[i]` by the time the last line runs?
- The value you need on the last line was overwritten on the line before it.
- `temp` exists precisely so that one of the two values survives the first
  assignment. Use it.

## Solution
```java
static void swap(int[] xs, int i, int j) {
    int temp = xs[i];
    xs[i] = xs[j];
    xs[j] = temp;
}
```

## Notes
The starter writes `xs[j] = xs[i]`, and by that point `xs[i]` is already the
value that came *from* `xs[j]`. So both slots end up holding the original
`xs[j]` and the other value is gone. It is the classic version of this bug, and
it survives casual testing because the array does visibly change — just not
into what you wanted.

The last check is there for a reason worth naming: swapping twice must restore
the original. A method that loses a value passes plenty of single-swap tests
and fails this one immediately, because it is a property of the operation
rather than another example of it. When you can state what must be true after
*any* run — swap twice and nothing changed, sort then check it is ordered — you
get a check that is much harder to accidentally satisfy.

`checkEq` compares arrays by value here rather than by identity, using
`Objects.deepEquals`. Plain `==` on two arrays asks whether they are the same
object, which is almost never the question you meant.
