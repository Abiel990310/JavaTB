---
id: validated-fraction
title: "A fraction that is always in lowest terms"
difficulty: core
chapter: encapsulation
topics: [encapsulation, invariants, immutability]
check: unit
standard: java21
---

Write an immutable class `Fraction` that is **always** stored in lowest terms
with a non-negative denominator.

- The constructor takes a numerator and a denominator. A zero denominator
  throws `IllegalArgumentException`.
- `numerator()` and `denominator()` return the reduced form. `new Fraction(2, 4)`
  reports 1 and 2.
- A negative sign always lives on the numerator: `new Fraction(1, -2)` reports
  −1 and 2.
- `times(Fraction other)` returns a new `Fraction`, also in lowest terms.

The point is that no `Fraction` can ever exist in an unreduced state — not for
a moment, not by any route. Reducing on the way *out*, in the getters, is not
the same thing and will not pass.

## Starter
```java
static class Fraction {
    private final int numerator;
    private final int denominator;

    Fraction(int numerator, int denominator) {
        this.numerator = numerator;
        this.denominator = denominator;
    }

    int numerator() {
        return numerator;
    }

    int denominator() {
        return denominator;
    }

    Fraction times(Fraction other) {
        return new Fraction(numerator * other.numerator, denominator * other.denominator);
    }
}
```

## Tests
```java
Fraction half = new Fraction(2, 4);
checkEq(half.numerator(), 1);
checkEq(half.denominator(), 2);

Fraction third = new Fraction(3, 9);
checkEq(third.numerator(), 1);
checkEq(third.denominator(), 3);

Fraction negative = new Fraction(1, -2);
checkEq(negative.numerator(), -1);
checkEq(negative.denominator(), 2);

Fraction bothNegative = new Fraction(-3, -6);
checkEq(bothNegative.numerator(), 1);
checkEq(bothNegative.denominator(), 2);

Fraction zero = new Fraction(0, 5);
checkEq(zero.numerator(), 0);
checkEq(zero.denominator(), 1);

Fraction product = new Fraction(2, 3).times(new Fraction(3, 4));
checkEq(product.numerator(), 1);
checkEq(product.denominator(), 2);

checkThrows(IllegalArgumentException.class, () -> new Fraction(1, 0));

Fraction whole = new Fraction(6, 3);
checkEq(whole.numerator(), 2);
checkEq(whole.denominator(), 1);
```

## Hints
- Reduce inside the constructor, before assigning the fields. Then every other
  method gets the invariant for free.
- The greatest common divisor of the two numbers is what to divide by. Euclid's
  algorithm is four lines, or use `Math.abs` with a loop.
- Handle the sign separately: if the denominator is negative, negate both.
- Zero is a special case. The gcd of 0 and 5 is 5, which reduces 0/5 to 0/1 —
  check that falls out rather than assuming it.

## Solution
```java
static class Fraction {
    private final int numerator;
    private final int denominator;

    Fraction(int numerator, int denominator) {
        if (denominator == 0) {
            throw new IllegalArgumentException("denominator cannot be zero");
        }
        if (denominator < 0) {
            numerator = -numerator;
            denominator = -denominator;
        }
        int divisor = gcd(Math.abs(numerator), denominator);
        this.numerator = numerator / divisor;
        this.denominator = denominator / divisor;
    }

    private static int gcd(int a, int b) {
        while (b != 0) {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a == 0 ? 1 : a;
    }

    int numerator() {
        return numerator;
    }

    int denominator() {
        return denominator;
    }

    Fraction times(Fraction other) {
        return new Fraction(numerator * other.numerator, denominator * other.denominator);
    }
}
```

## Notes
This is the invariant idea at full strength. "Always in lowest terms with a
non-negative denominator" is established in exactly one place — the constructor
— and every other method gets it without doing anything. `times` multiplies
numerators and denominators without a thought for reduction, and its result is
reduced anyway, because the only way to make a `Fraction` runs the reduction.

That is the payoff for enforcing invariants at construction rather than on
access. Had the class reduced inside `numerator()` and `denominator()` instead,
every future method would have to remember to do the same, and `times` above
would produce 6/12 internally and only *look* reduced from outside. The
difference shows up the moment someone compares two fractions, or uses one as a
map key.

Three details the checks pin down:

**Sign normalisation happens before reduction**, so `new Fraction(-3, -6)`
becomes 3/6 and then 1/2 rather than −1/−2. Without a canonical place for the
sign, two fractions representing the same value can hold different numbers.

**`gcd(0, 5)` is 5**, which turns 0/5 into 0/1. That falls out of Euclid's
algorithm rather than needing a special case — but the `a == 0 ? 1 : a` guard
is needed for the one input where it would otherwise return 0 and divide by
zero.

**The parameters are reassigned** inside the constructor before being stored.
That is legal and, here, clearer than introducing two more names — and it is
worth contrasting with `build-a-rectangle`, where assigning a parameter was the
bug. The difference is whether the value ends up in the field.
