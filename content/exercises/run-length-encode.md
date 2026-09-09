---
id: run-length-encode
title: "Run-length encoding"
difficulty: core
chapter: strings
topics: [strings, StringBuilder, loops]
check: unit
standard: java21
---

Write `encode(String s)`, compressing runs of identical characters into the
character followed by how many times it repeats.

`"aaabbc"` becomes `"a3b2c1"`. Every run gets a count, including runs of one,
so `"abc"` becomes `"a1b1c1"`. The empty string encodes to the empty string.

Use a `StringBuilder`. Building the result with `+=` would be quadratic for the
reason this chapter measured.

## Starter
```java
static String encode(String s) {
    StringBuilder out = new StringBuilder();
    int runLength = 0;
    for (int i = 0; i < s.length(); i++) {
        runLength++;
        if (i + 1 < s.length() && s.charAt(i + 1) != s.charAt(i)) {
            out.append(s.charAt(i)).append(runLength);
            runLength = 0;
        }
    }
    return out.toString();
}
```

## Tests
```java
checkEq(encode("aaabbc"), "a3b2c1");
checkEq(encode(""), "");
checkEq(encode("a"), "a1");
checkEq(encode("abc"), "a1b1c1");
checkEq(encode("aabb"), "a2b2");
checkEq(encode("aaaaaaaaaaa"), "a11");
checkEq(encode("aab"), "a2b1");
checkEq(encode("abbbbbbbbbbba"), "a1b11a1");
```

## Hints
- Run the starter on `"aaabbc"` in your head. What does it produce, and what is
  missing?
- The `append` only happens when the *next* character differs. At the last
  character there is no next one.
- The final run needs flushing. Either widen the condition to include "I am at
  the end", or append once more after the loop.

## Solution
```java
static String encode(String s) {
    StringBuilder out = new StringBuilder();
    int runLength = 0;
    for (int i = 0; i < s.length(); i++) {
        runLength++;
        boolean lastOfRun = i + 1 == s.length() || s.charAt(i + 1) != s.charAt(i);
        if (lastOfRun) {
            out.append(s.charAt(i)).append(runLength);
            runLength = 0;
        }
    }
    return out.toString();
}
```

## Notes
The starter drops the final run: it emits a run only when it can see a
different character coming next, and at the end of the string there is nothing
coming next. `encode("aaabbc")` gives `"a3b2"` and `encode("a")` gives `""`.
This is the archetypal loop bug — the body handles transitions, and the end of
the input is a transition the loop never sees.

The fix here makes "am I the last character of a run?" an explicit named
condition, which is worth doing beyond just making it fit: `i + 1 == s.length()
|| s.charAt(i + 1) != s.charAt(i)` is exactly the sentence "either the string
ends here or the next character is different", and naming it `lastOfRun` means
the `if` reads as what it means. The alternative — flushing once after the loop
— works equally well but needs a guard so the empty string does not emit a run
that never existed.

`append` is overloaded for every primitive type as well as `Object`, so
`.append(runLength)` takes the `int` directly rather than needing a conversion.
It also returns the builder, which is why calls chain. That is a deliberate
design choice: `String` returns new objects because it must, and
`StringBuilder` returns itself because it must not.
