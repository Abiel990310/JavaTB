---
id: normalise-on-construction
title: "No fraction may exist unreduced"
difficulty: core
chapter: records
topics: [records, invariants, compact constructor]
check: unit
standard: java21
---

Chapter 2.3's `Fraction` reduced itself in a constructor. Write it again as a
record, using a compact constructor.

`record Fraction(int numerator, int denominator)` must guarantee:

- a zero denominator throws `IllegalArgumentException`
- the value is always stored in lowest terms
- the sign always lives on the numerator, so `new Fraction(1, -2)` is stored as
  −1 and 2

Add `times(Fraction other)` returning a new `Fraction`.

Because a record's `equals` compares the stored components, two fractions with
the same value must be `equals` — `new Fraction(1, 2)` and `new Fraction(2, 4)`
are the same fraction. That only works if the reduction happens on the way in,
which is what the compact constructor is for.

## Starter
```java
record Fraction(int numerator, int denominator) {
    Fraction times(Fraction other) {
        return new Fraction(numerator * other.numerator, denominator * other.denominator);
    }
}
```

## Tests
```java
checkEq(new Fraction(2, 4), new Fraction(1, 2));
checkEq(new Fraction(3, 9).numerator(), 1);
checkEq(new Fraction(3, 9).denominator(), 3);

checkEq(new Fraction(1, -2).numerator(), -1);
checkEq(new Fraction(1, -2).denominator(), 2);
checkEq(new Fraction(-3, -6), new Fraction(1, 2));

checkEq(new Fraction(0, 5).numerator(), 0);
checkEq(new Fraction(0, 5).denominator(), 1);
checkEq(new Fraction(6, 3), new Fraction(2, 1));

checkEq(new Fraction(2, 3).times(new Fraction(3, 4)), new Fraction(1, 2));
checkEq(new Fraction(2, 4).toString(), "Fraction[numerator=1, denominator=2]");

checkThrows(IllegalArgumentException.class, () -> new Fraction(1, 0));

Set<Fraction> set = new HashSet<>();
set.add(new Fraction(1, 2));
set.add(new Fraction(2, 4));
set.add(new Fraction(3, 6));
checkEq(set.size(), 1);
```

## Hints
- A compact constructor is the record's name followed by `{ }` — no parameter
  list and no assignments.
- Inside it, `numerator` and `denominator` are ordinary variables. Whatever
  they hold at the end is what gets stored.
- Handle the zero denominator first, then the sign, then divide both by their
  greatest common divisor.
- A private static helper method is allowed inside a record body.

## Solution
```java
record Fraction(int numerator, int denominator) {
    Fraction {
        if (denominator == 0) {
            throw new IllegalArgumentException("denominator cannot be zero");
        }
        if (denominator < 0) {
            numerator = -numerator;
            denominator = -denominator;
        }
        int divisor = gcd(Math.abs(numerator), denominator);
        numerator = numerator / divisor;
        denominator = denominator / divisor;
    }

    private static int gcd(int a, int b) {
        while (b != 0) {
            int temp = b;
            b = a % b;
            a = temp;
        }
        return a == 0 ? 1 : a;
    }

    Fraction times(Fraction other) {
        return new Fraction(numerator * other.numerator, denominator * other.denominator);
    }
}
```

## Notes
The compact constructor assigns to its parameters and never mentions the
fields. That looks wrong the first time — chapter 2.1's `build-a-rectangle`
made assigning a parameter the bug — but here it is the whole mechanism: the
compiler emits `this.numerator = numerator;` after your body runs, so the
parameters are the values on their way in, and changing them changes what gets
stored.

The `HashSet` check at the end is what makes this more than tidiness.
`new Fraction(2, 4)` and `new Fraction(3, 6)` are only the same set element if
they hold identical components, because the generated `equals` and `hashCode`
compare the stored numbers rather than the mathematical value. Reduce on the
way out instead — in the accessors — and the components would still be 2 and 4,
the hash would differ from 1/2's, and the set would hold three fractions that
are all one half.

That is the general lesson, and it is why this problem is here rather than in
chapter 2.3: with a record, normalising at construction is not merely tidier
than normalising on access — it is the only version that works, because the
generated methods read the fields directly and there is no way to interpose.

`times` needs no reduction of its own. It multiplies raw and hands the result
to the constructor, which reduces it, because that is the only route by which a
`Fraction` can come into existence.
