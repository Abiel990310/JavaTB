---
id: reverse-in-place
title: "Reverse an array in place"
difficulty: intro
chapter: arrays
topics: [arrays, loops]
check: unit
standard: java21
---

Write `reverse(int[] xs)`, reversing the order of the elements **in place**.
It returns nothing — the caller sees the change through the array, for the
reason chapter 1.4 spent its length on.

Do not allocate a second array. Swap your way inward from both ends.

An empty array and a one-element array are already reversed; your method must
handle both without complaint.

## Starter
```java
static void reverse(int[] xs) {
    for (int i = 0; i < xs.length; i++) {
        int j = xs.length - 1 - i;
        int temp = xs[i];
        xs[i] = xs[j];
        xs[j] = temp;
    }
}
```

## Tests
```java
int[] a = { 1, 2, 3, 4 };
reverse(a);
checkEq(a, new int[] { 4, 3, 2, 1 });

int[] b = { 1, 2, 3 };
reverse(b);
checkEq(b, new int[] { 3, 2, 1 });

int[] c = { };
reverse(c);
checkEq(c, new int[] { });

int[] d = { 42 };
reverse(d);
checkEq(d, new int[] { 42 });

int[] e = { 1, 2, 3, 4, 5 };
reverse(e);
reverse(e);
checkEq(e, new int[] { 1, 2, 3, 4, 5 });
```

## Hints
- Trace the starter on `{1, 2, 3, 4}`. Write down the array after each
  iteration, all four of them.
- Every pair gets swapped, and then gets swapped back.
- Stop when the two ends meet. Two variables walking towards each other say
  that more clearly than one index and a subtraction.

## Solution
```java
static void reverse(int[] xs) {
    int left = 0;
    int right = xs.length - 1;
    while (left < right) {
        int temp = xs[left];
        xs[left] = xs[right];
        xs[right] = temp;
        left++;
        right--;
    }
}
```

## Notes
The starter swaps every pair twice. On `{1, 2, 3, 4}` the first iteration
exchanges positions 0 and 3, and the last iteration exchanges positions 3 and
0 — putting them back. The array ends up exactly as it started, which is why
the odd-length case is the more confusing failure: with `{1, 2, 3}` the middle
element never moves and the outer pair is swapped twice, so again nothing
changes.

Looping to `xs.length / 2` fixes it and is a perfectly good answer. The
two-pointer form above is written out because it is the shape of a technique
rather than a trick for this problem: two indices walking towards each other,
stopping when they meet, is how you reverse, how you test for a palindrome, and
how a whole family of array problems is solved in one pass.

Note the last check again: reversing twice restores the original. That property
holds for any correct implementation and is false for a great many wrong ones —
including, as it happens, the starter, which passes it for entirely the wrong
reason. A property test is strong evidence, not proof, and the earlier checks
are what pin this one down.
