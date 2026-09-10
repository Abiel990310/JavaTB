---
id: clamped-volume
title: "A volume control that cannot break"
difficulty: intro
chapter: encapsulation
topics: [encapsulation, invariants]
check: unit
standard: java21
---

Write a class `Volume` whose level is always between 0 and 100 inclusive, no
matter what anyone does to it.

It needs:

- a constructor taking a starting level, which **throws
  `IllegalArgumentException`** if the level is outside 0–100
- `level()` returning the current level
- `up(int amount)` and `down(int amount)`, which move the level by that much
  but **clamp** at the limits rather than throwing

The split is deliberate. Constructing a `Volume` at 150 is a caller mistake and
should fail loudly. Turning the volume up past the maximum is what happens
every time somebody holds the button down, and clamping is the right answer.

## Starter
```java
static class Volume {
    int level;

    Volume(int level) {
        this.level = level;
    }

    int level() {
        return level;
    }

    void up(int amount) {
        level += amount;
    }

    void down(int amount) {
        level -= amount;
    }
}
```

## Tests
```java
Volume v = new Volume(50);
checkEq(v.level(), 50);

v.up(20);
checkEq(v.level(), 70);

v.up(100);
checkEq(v.level(), 100);

v.down(500);
checkEq(v.level(), 0);

v.down(10);
checkEq(v.level(), 0);

checkThrows(IllegalArgumentException.class, () -> new Volume(150));
checkThrows(IllegalArgumentException.class, () -> new Volume(-1));

Volume edge = new Volume(0);
checkEq(edge.level(), 0);
Volume top = new Volume(100);
checkEq(top.level(), 100);
```

## Hints
- Two different behaviours are wanted: the constructor rejects, the movers
  clamp.
- `Math.min` and `Math.max` do clamping without an `if`. Clamping to a range
  needs both.
- 0 and 100 are valid starting levels — check your comparison is not off by one.

## Solution
```java
static class Volume {
    private int level;

    Volume(int level) {
        if (level < 0 || level > 100) {
            throw new IllegalArgumentException("level out of range: " + level);
        }
        this.level = level;
    }

    int level() {
        return level;
    }

    void up(int amount) {
        level = Math.min(100, level + amount);
    }

    void down(int amount) {
        level = Math.max(0, level - amount);
    }
}
```

## Notes
The starter's field is package-private rather than private, and nothing checks
anything — so the invariant "0 ≤ level ≤ 100" is not enforced at any of the
four places that could break it.

`Math.min(100, level + amount)` reads as "whichever is smaller, the maximum or
where we were heading", which is what clamping means. Writing it with an `if`
works identically; the reason to prefer the one-liner is that it has no branch
to get backwards.

The two `checkThrows` calls are worth noticing as a technique. Asserting that
something *fails* is as much a part of a specification as asserting that it
succeeds, and a constructor that quietly accepted 150 would pass every other
check in this problem. When a class's whole job is to refuse bad input, the
tests that matter most are the ones handing it bad input.

One real limit of this implementation: `up(Integer.MAX_VALUE)` overflows
`level + amount` to a negative number, and `Math.min` then happily returns it.
Chapter 1.2's rule applies — the fix is to clamp before adding, or to do the
arithmetic in a `long`. The checks here do not test it, which is exactly the
kind of gap worth noticing in your own code.
