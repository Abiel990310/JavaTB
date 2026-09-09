---
id: format-a-row
title: "Line up a table"
difficulty: core
chapter: input-and-output
topics: [output, formatting, strings]
check: unit
standard: java21
---

Write `formatRow(String name, int quantity, double price)`, returning one line
of a table as a string. Do not print it — return it.

The three fields are laid out like this:

- the name, left-justified, ten columns wide
- a single space
- the quantity, right-justified, three columns wide
- a single space
- the price, right-justified, eight columns wide, with exactly two decimal
  places

So `formatRow("Ada", 3, 4.5)` returns `Ada` followed by ten spaces, `3`, five
spaces, and `4.50`.

There is no trailing newline — this is one row, and the caller decides what
goes after it.

## Starter
```java
static String formatRow(String name, int quantity, double price) {
    return name + " " + quantity + " " + price;
}
```

## Tests
```java
checkEq(formatRow("Ada", 3, 4.5), "Ada          3     4.50");
checkEq(formatRow("Grace", 12, 199.999), "Grace       12   200.00");
checkEq(formatRow("Bartholomew", 1, 0.0), "Bartholomew   1     0.00");
checkEq(formatRow("", 0, -2.5), "             0    -2.50");
checkEq(formatRow("Ada", 3, 4.5).length(), 23);
```

## Hints
- `String.format` takes the same format string `printf` does, and returns the
  result instead of printing it.
- `%-10s` is left-justified in ten columns; leaving off the minus right-justifies.
- `%8.2f` is eight columns wide with two decimals. The whole format is three
  placeholders and two literal spaces.

## Solution
```java
static String formatRow(String name, int quantity, double price) {
    return String.format("%-10s %3d %8.2f", name, quantity, price);
}
```

## Notes
`String.format` and `printf` take the same format string; one returns, the
other writes. Building a formatted string and printing it separately is usually
the better structure, because a method that returns a string can be tested —
which is exactly what this problem does, and what a method calling
`System.out.printf` directly would not allow.

Two behaviours in the checks are worth noticing.

**Widths are minimums, not limits.** `Bartholomew` is eleven characters in a
ten-column field, and it is not truncated — the field simply grows and the rest
of the row shifts right. A format string does not protect a table from a long
value; if you need that, truncate the value yourself.

**`%.2f` rounds, it does not cut.** `199.999` comes out as `200.00`. That is
usually what you want in a display, and it is exactly what you do not want if
the total at the bottom of the table is computed from the displayed values
rather than the real ones — the classic way a printed invoice disagrees with
itself by a penny.

The final check on `length()` is there so that a solution which gets the fields
right but the separators wrong cannot pass by accident. Two adjacent width
specifiers with no space between them still line up column-wise, and would
differ only in total length.
