---
id: currency-enum
title: "Constants that know their own rules"
difficulty: core
chapter: enums
topics: [enums, formatting]
check: unit
standard: java21
---

Write an enum `Currency` with three constants, each carrying its symbol and how
many minor units make one major unit:

| Constant | Symbol | Minor units |
|---|---|---|
| `GBP` | `£` | 100 |
| `USD` | `$` | 100 |
| `JPY` | `¥` | 1 |

It needs:

- `symbol()` and `minorUnits()`
- `format(long minorAmount)` returning the amount as text — `GBP.format(1234)`
  is `£12.34`, `JPY.format(1234)` is `¥1234`

A currency with one minor unit has no decimal point and no fractional digits at
all. That is the whole reason the field exists: yen are not pounds with the
decimal moved.

## Starter
```java
enum Currency {
    GBP, USD, JPY;

    String symbol() {
        return "£";
    }

    int minorUnits() {
        return 100;
    }

    String format(long minorAmount) {
        return symbol() + (minorAmount / 100) + "." + (minorAmount % 100);
    }
}
```

## Tests
```java
checkEq(Currency.GBP.symbol(), "£");
checkEq(Currency.USD.symbol(), "$");
checkEq(Currency.JPY.symbol(), "¥");

checkEq(Currency.GBP.minorUnits(), 100);
checkEq(Currency.JPY.minorUnits(), 1);

checkEq(Currency.GBP.format(1234), "£12.34");
checkEq(Currency.USD.format(1234), "$12.34");
checkEq(Currency.JPY.format(1234), "¥1234");

checkEq(Currency.GBP.format(5), "£0.05");
checkEq(Currency.GBP.format(0), "£0.00");
checkEq(Currency.GBP.format(100), "£1.00");
checkEq(Currency.JPY.format(0), "¥0");

checkEq(Currency.values().length, 3);
checkEq(Currency.valueOf("USD"), Currency.USD);
```

## Hints
- Give the enum a constructor taking the symbol and the minor-unit count, and
  pass them in the constant declarations: `GBP("£", 100)`.
- `format` needs to branch: no decimal point when there is only one minor unit.
- `£0.05` needs a leading zero on the fractional part. `"%02d".formatted(...)`
  or `String.format` will do it; plain concatenation gives `£0.5`.

## Solution
```java
enum Currency {
    GBP("£", 100),
    USD("$", 100),
    JPY("¥", 1);

    private final String symbol;
    private final int minorUnits;

    Currency(String symbol, int minorUnits) {
        this.symbol = symbol;
        this.minorUnits = minorUnits;
    }

    String symbol() {
        return symbol;
    }

    int minorUnits() {
        return minorUnits;
    }

    String format(long minorAmount) {
        if (minorUnits == 1) {
            return symbol + minorAmount;
        }
        return symbol + (minorAmount / minorUnits) + "."
               + "%02d".formatted(minorAmount % minorUnits);
    }
}
```

## Notes
The starter hard-codes pounds and pretends to be three currencies. Every
constant returns `£`, every amount gets two decimal places, and `JPY.format`
produces `¥12.34` for what should be 1,234 yen — an error of two orders of
magnitude, in a program that looked like it handled currencies.

`Currency.GBP.format(5)` is the check that catches naive concatenation.
`5 / 100` is `0` and `5 % 100` is `5`, so the obvious expression yields `£0.5`
rather than `£0.05`. Padding the minor part to the width of the currency is not
optional decoration; it is part of being correct.

Note that this implementation still assumes exactly two decimal places when
there is more than one minor unit — it would be wrong for a currency with
1,000 minor units, of which a few exist. The honest fix is to derive the width
from `minorUnits` rather than hard-coding `%02d`. It is left as it is because
the three constants declared here never hit that case, and it is worth
noticing that "correct for the values we have" and "correct" are different
claims. `java.util.Currency` in the JDK carries a `getDefaultFractionDigits()`
for exactly this reason.
