---
id: is-palindrome
title: "Palindrome, ignoring the noise"
difficulty: intro
chapter: strings
topics: [strings, comparison]
check: unit
standard: java21
---

Write `isPalindrome(String s)`, returning whether `s` reads the same forwards
and backwards once you ignore everything that is not a letter or a digit, and
ignore case.

So `"A man, a plan, a canal: Panama"` is a palindrome. So is the empty string,
and so is any single character.

The starter already does the cleaning. It gets the comparison wrong, in the way
this chapter exists to warn you about.

## Starter
```java
static boolean isPalindrome(String s) {
    StringBuilder cleaned = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (Character.isLetterOrDigit(c)) {
            cleaned.append(Character.toLowerCase(c));
        }
    }
    String forward = cleaned.toString();
    String backward = cleaned.reverse().toString();
    return forward == backward;
}
```

## Tests
```java
check(isPalindrome("racecar"));
check(isPalindrome("A man, a plan, a canal: Panama"));
check(isPalindrome("No 'x' in Nixon"));
check(isPalindrome(""));
check(isPalindrome("a"));
check(isPalindrome("Was it a car or a cat I saw?"));
check(!isPalindrome("hello"));
check(!isPalindrome("ab"));
```

## Hints
- Every check fails, including the ones expecting `true`. What single line could
  make a method wrong for *every* input?
- `forward` and `backward` are two separate objects, built separately. What does
  `==` ask about two objects?
- The whole chapter, in one line.

## Solution
```java
static boolean isPalindrome(String s) {
    StringBuilder cleaned = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
        char c = s.charAt(i);
        if (Character.isLetterOrDigit(c)) {
            cleaned.append(Character.toLowerCase(c));
        }
    }
    String forward = cleaned.toString();
    String backward = cleaned.reverse().toString();
    return forward.equals(backward);
}
```

## Notes
`forward == backward` is false for every input, including the empty string:
`StringBuilder.toString()` builds a new `String` each time it is called, so the
two are never the same object no matter what they contain. The starter is not
subtly wrong on edge cases — it is wrong on everything, which is the most
merciful version of this bug. The dangerous version compares two literals,
passes its tests, and fails months later on a string read from a file.

Note that `cleaned.toString()` is called before `cleaned.reverse()`, and that
this matters. `reverse` mutates the builder in place and returns the same
object, so calling `toString` afterwards sees the reversed contents — the
opposite of `String`, where every method returns something new. The one line
that looks like it copies is the one that does; the one that looks like it
returns a new builder does not.

A version that avoids building two strings at all walks two indices inward from
the ends of the cleaned text, comparing as it goes — the same two-pointer shape
as `reverse-in-place` in the previous chapter, and it stops at the first
mismatch instead of always doing the full work.
