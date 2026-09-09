---
id: count-vowels
title: "Count the vowels"
difficulty: intro
chapter: control-flow
topics: [loops, switch, strings]
check: unit
standard: java21
---

Write `countVowels(String s)`, returning how many characters of `s` are vowels.

Count `a`, `e`, `i`, `o` and `u`, in either case. Everything else — consonants,
digits, spaces, punctuation — counts for nothing. An empty string has no
vowels.

The starter is most of the way there and gets two things wrong. Read the
failures rather than the code: the checks will tell you which inputs it
mishandles, and the difference between them tells you why.

## Starter
```java
static int countVowels(String s) {
    int count = 0;
    for (int i = 0; i < s.length(); i++) {
        switch (s.charAt(i)) {
            case 'a' -> count++;
            case 'e' -> count++;
            case 'i' -> count++;
            case 'o' -> count++;
        }
    }
    return count;
}
```

## Tests
```java
checkEq(countVowels("hello"), 2);
checkEq(countVowels(""), 0);
checkEq(countVowels("rhythm"), 0);
checkEq(countVowels("queueing"), 5);
checkEq(countVowels("HELLO"), 2);
checkEq(countVowels("aeiouAEIOU"), 10);
checkEq(countVowels("a1e2i3o4u5"), 5);
```

## Hints
- One vowel is missing from the switch. Which check fails first?
- `HELLO` contains vowels too. `'E'` and `'e'` are different characters with
  different numeric values.
- A single case can carry several labels: `case 'a', 'A' -> count++;`.

## Solution
```java
static int countVowels(String s) {
    int count = 0;
    for (int i = 0; i < s.length(); i++) {
        switch (s.charAt(i)) {
            case 'a', 'e', 'i', 'o', 'u',
                 'A', 'E', 'I', 'O', 'U' -> count++;
            default -> { }
        }
    }
    return count;
}
```

## Notes
Two bugs, and they fail differently. The missing `u` is a gap in a list —
`queueing` catches it. The missing uppercase is a category the author never
thought about — `HELLO` catches that. Tests that only used lowercase words
would have passed a function that is wrong for half its inputs, which is the
argument for choosing test inputs by asking what *kinds* of input exist rather
than by writing three more examples of the kind you already have.

The solution puts ten labels on one case, which the arrow form allows. Written
as a classic switch this would be ten stacked `case` labels relying on
fall-through to share one body — legal, and the one use of fall-through that
is not a mistake, but it needs a `break` and it needs a reader to know that
rule.

`default -> { }` is an empty block, and it is there for the reader rather than
the compiler: a switch *statement* needs no default, but writing one says the
omission was deliberate. Note that `case 'a' -> count++;` works because `count++`
is an expression statement; an arrow case takes a single statement, a block, or
a `throw`.
