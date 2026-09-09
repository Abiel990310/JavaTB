---
title: "Control flow"
navTitle: "Control flow"
summary: >-
  Choosing between the loop forms, and the two switches Java now has — one of which is a statement that falls through, and one of which is an expression that cannot.
objectives:
  - Choose the right loop for a job and say what each one cannot do
  - Write a switch expression, and explain why it must be exhaustive
  - Recognise fall-through in a classic switch and the warning javac gives for it
status: complete
standard: java21
requires: [values-and-variables]
---

Control flow is the part of a language people assume they already know, and
mostly they do. Java's `if` and `while` will hold no surprises. Two things in
this chapter are worth slowing down for: the loop that quietly refuses to write
back into your data, and `switch`, which since Java 14 is really two different
constructs wearing the same keyword — one of them a statement with a famous
trap, the other an expression that closes it.

## Branching

```java run title="if, else, and the shape of the code"
public class Main {
    static String describe(int n) {
        if (n < 0) {
            return "negative";
        } else if (n == 0) {
            return "zero";
        } else {
            return "positive";
        }
    }

    public static void main(String[] args) {
        System.out.println(describe(-5) + ", " + describe(0) + ", " + describe(7));
    }
}
```

Braces are optional around a single statement, and leaving them off is how a
whole class of bug gets in:

```java run title="Indentation is not control flow"
public class Main {
    public static void main(String[] args) {
        int balance = 100;
        boolean approved = false;

        if (approved)
            System.out.println("approving the withdrawal");
            balance -= 50;              // runs whether approved or not

        System.out.println("balance = " + balance);
    }
}
```

The indentation says both lines are guarded. The language says only the first
one is — a body without braces is exactly one statement. The balance is
debited on a withdrawal that was never approved. Always use braces; the two
characters cost nothing and this bug has taken down real systems.

## Loops

`while` tests before the body runs; `do`/`while` tests after, so its body always
runs at least once. That is the whole difference, and it is occasionally the
one you want:

```java run title="do-while runs first and asks later"
public class Main {
    public static void main(String[] args) {
        int attempts = 0;
        do {
            attempts++;
        } while (attempts < 0);   // false from the very start

        System.out.println("body ran " + attempts + " time(s)");
    }
}
```

The counted `for` loop puts the three parts of a loop — set up, test, advance —
on one line, which is why it is hard to get the order wrong:

```java run title="Two ways to walk an array"
public class Main {
    public static void main(String[] args) {
        int[] prices = { 10, 20, 30, 40 };

        int total = 0;
        for (int i = 0; i < prices.length; i++) {
            total += prices[i];
        }

        int alsoTotal = 0;
        for (int price : prices) {     // "for each price in prices"
            alsoTotal += price;
        }

        System.out.println(total + " and " + alsoTotal);
    }
}
```

Note `i < prices.length`, not `<=`. An array of length 4 has indices 0 to 3, so
`<=` reads one past the end:

```java run expect-throw title="The off-by-one, and how it announces itself"
public class Main {
    public static void main(String[] args) {
        int[] prices = { 10, 20, 30 };
        int total = 0;
        for (int i = 0; i <= prices.length; i++) {
            total += prices[i];
        }
        System.out.println(total);
    }
}
```

Java checks every array access, so this throws
`ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3` rather
than silently reading whatever memory happened to be next door. That check
costs a little speed on every access and buys you a whole category of security
bug that C and C++ programs still ship.

### The enhanced for loop cannot write back

```java run title="A loop that reads but cannot change"
public class Main {
    public static void main(String[] args) {
        int[] prices = { 10, 20, 30 };

        for (int price : prices) {
            price = price * 2;      // changes the copy, not the array
        }
        System.out.println("after for-each: " + java.util.Arrays.toString(prices));

        for (int i = 0; i < prices.length; i++) {
            prices[i] = prices[i] * 2;
        }
        System.out.println("after indexed: " + java.util.Arrays.toString(prices));
    }
}
```

`price` is a fresh variable holding a *copy* of each element. Assigning to it
changes nothing outside the loop. This is not a special rule about loops — it
is the same rule as everywhere else in Java, which passes and assigns by value.
When you need to modify elements in place, you need the index.

:::pitfall
The compiler will not warn you about that assignment. It is a perfectly legal
statement that happens to have no effect, and it is the single most common
reason a beginner's array "does not change".
:::

### Getting out early

`break` leaves the innermost loop, `continue` skips to its next iteration. When
the loop you want to leave is not the innermost one, label it:

```java run title="Labelled break, for when two loops are one search"
public class Main {
    public static void main(String[] args) {
        int[][] grid = { { 1, 2 }, { 3, 4 }, { 5, 6 } };
        int target = 4;

        search:
        for (int row = 0; row < grid.length; row++) {
            for (int col = 0; col < grid[row].length; col++) {
                if (grid[row][col] == target) {
                    System.out.println("found at row " + row + ", column " + col);
                    break search;
                }
            }
        }
    }
}
```

A label is not a `goto` — Java has no `goto`. It only names a loop so that
`break` and `continue` can say which one they mean. Use it for exactly this
case, a search across nested loops, and reach for a method with an early
`return` when the logic gets any bigger than this.

## Two switches

The `switch` Java inherited from C is a **statement**, and control falls from
one case into the next unless you stop it:

```java run title="Fall-through, which is almost never what you meant"
public class Main {
    static String classify(int n) {
        StringBuilder out = new StringBuilder();
        switch (n) {
            case 1: out.append("one ");
            case 2: out.append("two ");
            case 3: out.append("three "); break;
            default: out.append("other ");
        }
        return out.toString().trim();
    }

    public static void main(String[] args) {
        System.out.println("classify(1) = " + classify(1));
        System.out.println("classify(2) = " + classify(2));
        System.out.println("classify(9) = " + classify(9));
    }
}
```

`classify(1)` returns `one two three`, because `case 1` has no `break` and
execution simply continues downward through the labels. Look at the warnings
panel on that sample: javac reports *possible fall-through into case* twice.
The language shipped a warning for its own feature, which tells you how often
it is a mistake.

Since Java 14 there is an arrow form. Each case is its own body, and nothing
falls through:

```java run title="The arrow form, and switch as an expression"
public class Main {
    static String classify(int n) {
        String label;
        switch (n) {
            case 1 -> label = "one";
            case 2 -> label = "two";
            case 3 -> label = "three";
            default -> label = "other";
        }
        return label;
    }

    // Better still: let the switch itself produce the value.
    static int hoursFor(String day) {
        return switch (day) {
            case "SAT", "SUN" -> 0;
            case "MON" -> {
                int base = 8;
                yield base - 1;      // yield, not return: return would leave hoursFor
            }
            default -> 8;
        };
    }

    public static void main(String[] args) {
        System.out.println(classify(1) + ", " + classify(9));
        System.out.println("SAT=" + hoursFor("SAT") + " MON=" + hoursFor("MON")
                           + " TUE=" + hoursFor("TUE"));
    }
}
```

Three things changed at once here, and each is worth naming:

- **No fall-through.** One arrow, one body, no `break` to forget.
- **Several labels per case.** `case "SAT", "SUN" ->` instead of two stacked
  labels relying on fall-through to share a body.
- **It is an expression.** `switch` can produce a value, so the variable it
  fills can be assigned once rather than declared empty and filled in later. A
  case that needs more than one statement uses a block and `yield` to say what
  the block's value is.

A switch *expression* must be exhaustive — it has to produce a value for every
possible input, because there is no sensible value for "none of the above":

```java run expect-error title="An expression with a gap will not compile"
public class Main {
    static int size(int n) {
        return switch (n) {
            case 1 -> 10;
            case 2 -> 20;
        };
    }

    public static void main(String[] args) {
        System.out.println(size(1));
    }
}
```

*the switch expression does not cover all possible input values.* Adding
`default` fixes it. This is a real guarantee rather than a nuisance: when you
switch over an enum and later add a constant, the compiler shows you every
switch that has not been updated — a chapter in Part 2 leans on exactly that.

:::tip
Reach for the arrow form by default, and the expression form whenever the
switch exists to produce a value. Keep the classic form for the rare case
where you genuinely want several labels to share a body's tail — and when you
do, say so in a comment, because every reader will assume it is a missing
`break`.
:::

:::quiz
{
  "question": "What does this print?\n\n```\nint n = 2;\nswitch (n) {\n    case 2: System.out.print(\"a\");\n    case 3: System.out.print(\"b\"); break;\n    default: System.out.print(\"c\");\n}\n```",
  "options": [
    { "text": "ab", "correct": true, "why": "Right. case 2 has no break, so execution falls through into case 3, prints b, and the break there stops it before default." },
    { "text": "a", "correct": false, "why": "That would be the arrow form's behaviour. In a classic switch, a case without break does not end — control continues into the next label." },
    { "text": "abc", "correct": false, "why": "The break in case 3 stops it. Without that break it would indeed reach default and print abc." },
    { "text": "It does not compile without a default first", "correct": false, "why": "A switch *statement* needs no default. A switch *expression* does, because it has to produce a value for every input." }
  ]
}
:::

## Practice

:::exercise count-vowels

:::exercise days-in-month

:::recap
- A body without braces is one statement, whatever the indentation suggests.
- `while` tests first; `do`/`while` always runs its body once.
- Index with `i < length`. Java checks every access and throws
  `ArrayIndexOutOfBoundsException` rather than reading past the end.
- The enhanced `for` gives you a copy of each element, so assigning to the loop
  variable changes nothing. Modifying elements needs the index.
- A label names a loop so `break` can leave an outer one. It is not a `goto`.
- The classic `switch` falls through, and javac warns about it. The arrow form
  does not, allows several labels per case, and can be used as an expression —
  which must be exhaustive, and uses `yield` to give a block a value.
:::
