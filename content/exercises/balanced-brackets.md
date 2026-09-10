---
id: balanced-brackets
title: "Are the brackets balanced?"
difficulty: core
chapter: queues-and-deques
topics: [stacks, deques]
check: unit
standard: java21
---

Write `isBalanced(String text)`, returning whether every bracket in `text` is
closed by the matching kind, in the right order.

Three kinds count: `()`, `[]` and `{}`. Any other character is ignored, so
`"a(b)c"` is balanced. The empty string is balanced.

`"([{}])"` is balanced. `"(]"` is not, and neither is `"([)]"` or `"("` or
`")("`.

Use an `ArrayDeque` as a stack.

## Starter
```java
static boolean isBalanced(String text) {
    Deque<Character> open = new ArrayDeque<>();
    for (char c : text.toCharArray()) {
        if (c == '(' || c == '[' || c == '{') {
            open.push(c);
        } else if (c == ')' || c == ']' || c == '}') {
            open.pop();
        }
    }
    return true;
}
```

## Tests
```java
check(isBalanced(""));
check(isBalanced("()"));
check(isBalanced("([{}])"));
check(isBalanced("a(b)c[d]"));
check(isBalanced("(())()"));

check(!isBalanced("("));
check(!isBalanced(")"));
check(!isBalanced("(]"));
check(!isBalanced("([)]"));
check(!isBalanced(")("));
check(!isBalanced("(()"));
check(!isBalanced("())"));
```

## Hints
- The starter never checks that a closer matches the opener it popped, and
  never checks that anything is left over.
- Popping an empty stack throws `NoSuchElementException` — so `")"` crashes
  rather than returning false. `poll` returns `null` instead, which is easier
  to test.
- At the end, the stack must be empty: leftover openers mean `"(()"`.
- A small helper mapping each closer to its opener keeps the comparison to one
  line.

## Solution
```java
static final Map<Character, Character> PAIRS =
        Map.of(')', '(', ']', '[', '}', '{');

static boolean isBalanced(String text) {
    Deque<Character> open = new ArrayDeque<>();
    for (char c : text.toCharArray()) {
        if (c == '(' || c == '[' || c == '{') {
            open.push(c);
        } else if (PAIRS.containsKey(c)) {
            Character expected = PAIRS.get(c);
            if (!expected.equals(open.poll())) {
                return false;
            }
        }
    }
    return open.isEmpty();
}
```

## Notes
The starter has three separate holes, and they fail on three different inputs.

`")"` pops an empty stack, and `pop` is the *throwing* member of the pair from
this chapter — so the method dies with `NoSuchElementException` instead of
returning `false`. Switching to `poll`, which returns `null`, turns a crash
into a value you can test.

`"(]"` pops the right number of brackets but never checks that the closer
matches what it opened. Balance is not about counting; it is about matching.

`"(()"` finishes with an opener still on the stack, and the starter returns
`true` regardless. The stack being empty at the end is half the definition.

`expected.equals(open.poll())` rather than `==` handles the empty case for
free: `poll` returns `null`, and `equals(null)` is `false` rather than a
`NullPointerException`. Writing it the other way round — `open.poll() ==
expected` — would compare two `Character` objects by identity, which works only
by accident for the cached small values and is chapter 2.4's mistake in
miniature.

A stack is the right structure here because the problem is *last opened, first
closed*, which is the definition of a stack. Whenever a problem has that shape
— nesting, undo, expression evaluation, tracking scope — a stack is usually the
whole answer.
