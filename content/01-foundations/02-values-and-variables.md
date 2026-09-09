---
title: "Values and variables"
navTitle: "Values and variables"
summary: >-
  The eight primitive types, what each one can hold, and the three ways they lie to you when you reach the edge of it.
objectives:
  - Name the eight primitive types and say what each one can hold
  - Predict what an int does when it overflows, and detect it rather than hope
  - Explain why 0.1 + 0.2 is not 0.3, and choose a type that does not have that problem
status: complete
standard: java21
requires: [hello-jvm]
---

A variable in Java is a named place with a type fixed when you compile and a
size fixed by the language specification. That second half is unusual. In C, an
`int` is whatever width the compiler felt was natural; in Python, an integer
grows until you run out of memory. In Java an `int` is exactly 32 bits on every
machine that has ever run Java, and the guarantee is the whole point — a
program that behaves one way on your laptop cannot quietly behave another way
on a server.

The price of a fixed size is a fixed edge. This chapter is mostly about what
happens at that edge, because every one of the failures below is silent by
default, and each of them has cost somebody real money.

## The eight primitives

Everything else in Java is an object. These eight are not.

| Type | Bits | Holds |
|---|---|---|
| `boolean` | — | `true` or `false` |
| `byte` | 8 | −128 to 127 |
| `short` | 16 | −32,768 to 32,767 |
| `char` | 16 | an unsigned UTF-16 code unit, 0 to 65,535 |
| `int` | 32 | about ±2.1 billion |
| `long` | 64 | about ±9.2 quintillion |
| `float` | 32 | roughly 7 decimal digits of precision |
| `double` | 64 | roughly 15 decimal digits of precision |

`boolean` has no defined size — the specification deliberately declines to say,
because the JVM is free to store one in a byte, a word, or a bit of a larger
field depending on where it lives.

You never have to look these up. Every one of them is a class constant:

```java run title="The edges, from the library rather than from memory"
public class Main {
    public static void main(String[] args) {
        System.out.println("byte  " + Byte.MIN_VALUE + " to " + Byte.MAX_VALUE);
        System.out.println("short " + Short.MIN_VALUE + " to " + Short.MAX_VALUE);
        System.out.println("int   " + Integer.MIN_VALUE + " to " + Integer.MAX_VALUE);
        System.out.println("long  " + Long.MIN_VALUE + " to " + Long.MAX_VALUE);
        System.out.println("int is " + Integer.SIZE + " bits, long is " + Long.SIZE);
    }
}
```

In practice you will use `int`, `long`, `double` and `boolean`, and meet the
others when something forces you to. `byte` appears when you are handling raw
data; `short` almost never; `float` when memory matters more than precision,
which is rarer than people assume.

## Integers wrap, and say nothing

Add one to the largest `int` and you do not get an error. You get the smallest
`int`.

```java run title="Falling off the edge"
public class Main {
    public static void main(String[] args) {
        int max = Integer.MAX_VALUE;
        System.out.println("max     = " + max);
        System.out.println("max + 1 = " + (max + 1));
        System.out.println("is that the minimum? " + (max + 1 == Integer.MIN_VALUE));
    }
}
```

The arithmetic is *modular*: 32 bits count from zero to 2³²−1 and start again,
and Java interprets the top half of that range as negative numbers. Nothing has
gone wrong from the machine's point of view. Your program simply now holds a
number that is off by 4,294,967,296.

Here is that failure wearing its everyday costume:

```java run title="How many milliseconds in a year?"
public class Main {
    public static void main(String[] args) {
        // Every value here is an int literal, so the whole product is int
        // arithmetic — the long on the left is applied only to the result.
        long wrong = 1000 * 60 * 60 * 24 * 365;

        // One L makes the first operand a long, and everything after it
        // is promoted to long as well.
        long right = 1000L * 60 * 60 * 24 * 365;

        System.out.println("wrong = " + wrong);
        System.out.println("right = " + right);
    }
}
```

`1471228928` is not a plausible number of milliseconds in a year, but it is a
perfectly plausible-looking number, and that is exactly why this bug survives
code review. The type on the *left* of an assignment does not reach back and
change how the right-hand side is calculated.

:::warning
Overflow is silent. There is no exception, no warning, no flag to switch on.
If a calculation could exceed two billion, either use `long` or check, because
nothing else will tell you.
:::

When you need to know, ask:

```java run title="Checking instead of hoping"
public class Main {
    public static void main(String[] args) {
        try {
            int boom = Math.addExact(Integer.MAX_VALUE, 1);
            System.out.println("no overflow: " + boom);
        } catch (ArithmeticException e) {
            System.out.println("caught: " + e.getMessage());
        }

        // And the one that catches almost everybody:
        System.out.println("Math.abs(Integer.MIN_VALUE) = " + Math.abs(Integer.MIN_VALUE));
    }
}
```

`Math.addExact`, `subtractExact` and `multiplyExact` do the same arithmetic and
throw `ArithmeticException` rather than wrap.

That last line is not a bug in the library. `Math.abs` promises to return an
`int`, and the positive counterpart of −2,147,483,648 is 2,147,483,648, which
is not an `int`. There is nothing correct it could return, so it returns its
argument unchanged — negative. Any code that assumes `Math.abs` gives a
non-negative result has a bug for exactly one input, and hash-bucket
calculations written as `Math.abs(hash) % size` have shipped with it for years.

## Integer division truncates

```java run title="Two surprises in one line"
public class Main {
    public static void main(String[] args) {
        System.out.println("7 / 2   = " + (7 / 2));
        System.out.println("-7 / 2  = " + (-7 / 2));
        System.out.println("7 % 2   = " + (7 % 2));
        System.out.println("-7 % 2  = " + (-7 % 2));

        double average = 7 / 2;         // the division happens first, in ints
        double better  = 7 / 2.0;       // one double operand makes it real division
        System.out.println("average = " + average + ", better = " + better);
    }
}
```

Dividing two `int`s gives an `int`, and the result is truncated **toward zero**
— not rounded, and not floored. So `-7 / 2` is `-3`, where a language that
floors would say `-4`. The remainder follows: `%` takes the sign of the
left-hand operand, which is why `-7 % 2` is `-1`.

Assigning to a `double` afterwards cannot recover what was already thrown away.
`7 / 2` was `3` before the assignment ever happened.

## Doubles are not decimals

```java run title="The most reported non-bug in programming"
public class Main {
    public static void main(String[] args) {
        System.out.println("0.1 + 0.2      = " + (0.1 + 0.2));
        System.out.println("== 0.3 ?         " + (0.1 + 0.2 == 0.3));
        System.out.println("what 0.1+0.2 is: " + new java.math.BigDecimal(0.1 + 0.2));
    }
}
```

A `double` stores a number as a sign, an exponent and a fraction — in binary.
One tenth in binary recurs forever, the same way one third does in decimal, so
`0.1` is stored as the nearest representable value rather than as one tenth.
Add two such approximations and the error becomes visible.

This is not Java being sloppy. It is IEEE 754, and every mainstream language
does the same thing; printing `0.30000000000000004` rather than rounding it away
is Java being honest about it.

Two consequences you must act on:

- **Never compare doubles with `==`.** Compare the difference against a
  tolerance you have chosen deliberately.
- **Never store money in a `double`.** Use `long` counting the smallest unit —
  pence, cents — or `BigDecimal` when you need decimal arithmetic with rounding
  rules you control.

Precision runs out sooner than people expect, and when it does, addition simply
stops having an effect:

```java run title="Where a float gives up"
public class Main {
    public static void main(String[] args) {
        float f = 16_777_216f;             // 2^24
        System.out.println("f     = " + f);
        System.out.println("f + 1 = " + (f + 1f));
        System.out.println("did adding 1 change it? " + (f + 1f != f));

        System.out.println("1 / 0.0   = " + (1 / 0.0));
        System.out.println("0.0 / 0.0 = " + (0.0 / 0.0));
        System.out.println("NaN == NaN ? " + (Double.NaN == Double.NaN));
    }
}
```

Beyond 2²⁴ a `float` no longer has a bit available for the ones column, so
adding one rounds straight back to where it started. A loop counting upward in
`float` past that point never terminates.

Note the last three lines. Floating-point division by zero does not throw — it
produces `Infinity` or `NaN`. And `NaN` is not equal to itself, which is
required by the standard and is why `Double.isNaN` exists.

:::pitfall
Integer division by zero throws `ArithmeticException`. Floating-point division
by zero returns `Infinity`. The same-looking bug in the same-looking code fails
loudly in one type and silently in the other.
:::

## `char` is a code unit, not a character

A `char` is 16 bits, which was enough for every character in Unicode when Java
was designed in 1995. It has not been since 2001.

```java run title="One emoji, two chars"
public class Main {
    public static void main(String[] args) {
        String grin = "😀";
        System.out.println("length()        = " + grin.length());
        System.out.println("codePointCount  = " + grin.codePointCount(0, grin.length()));
        System.out.println("charAt(0) value = " + (int) grin.charAt(0));

        // char is a number, so arithmetic on it works and promotes to int.
        char letter = 'a';
        System.out.println("'a' + 1       = " + (letter + 1));
        System.out.println("as a char     = " + (char) (letter + 1));
    }
}
```

That emoji is one character and two `char`s. Characters outside the first
65,536 are stored as a *surrogate pair* — two code units that only mean
something together — so `length()` counts storage, not letters, and `charAt`
can hand you half of something.

For text a human will read, work in code points (`codePointCount`,
`codePoints()`) or use whole `String` operations. `char` is the right type for
ASCII-range work — parsing digits, walking a word of English — and the wrong
one for anything that might contain the rest of the world.

## Writing literals so they read

```java run title="Notation that costs nothing"
public class Main {
    public static void main(String[] args) {
        int population = 67_330_000;      // underscores are ignored by the compiler
        int mask       = 0b1010_1010;     // binary
        int colour     = 0xFF_A5_00;      // hexadecimal
        long distance  = 9_460_730_472_580_800L;   // L is required past int range

        System.out.println(population + " " + mask + " " + colour + " " + distance);

        var count = 42;                   // inferred as int, not a new kind of type
        var name  = "Ada";                // inferred as String
        System.out.println(count + " " + name);
    }
}
```

The `L` on a long literal is not optional decoration: without it the number is
an `int` literal, and the compiler rejects it before it can overflow. Use a
capital `L`, because a lowercase `l` is indistinguishable from `1` in most
fonts.

`var` asks the compiler to infer the type from the initialiser. It is not
dynamic typing and it is not a type of its own — `count` above is an `int`, as
permanently as if you had written `int`:

```java run expect-error title="var infers once, and then it is fixed"
public class Main {
    public static void main(String[] args) {
        var count = 42;
        count = "forty-two";
        System.out.println(count);
    }
}
```

Use `var` when the initialiser already names the type and repeating it adds
nothing. Avoid it when the type is the thing a reader most needs to know.

:::quiz
{
  "question": "A program computes `int total = price * quantity;` where price is 50,000 and quantity is 50,000. What happens?",
  "options": [
    { "text": "An ArithmeticException is thrown", "correct": false, "why": "Integer overflow never throws. Only division by zero throws for integers — and `Math.multiplyExact` if you explicitly ask for the checking version." },
    { "text": "total holds 2,500,000,000", "correct": false, "why": "That is the mathematically correct answer, and it is larger than Integer.MAX_VALUE — about 2.1 billion — so an int cannot hold it." },
    { "text": "total holds a wrong number, and nothing reports it", "correct": true, "why": "Right. The product wraps modulo 2^32 and the program carries on with a plausible-looking wrong value. Making `total` a long would not help either — the multiplication is int arithmetic before the assignment. One operand has to be a long." },
    { "text": "total holds Integer.MAX_VALUE, saturated at the limit", "correct": false, "why": "Some languages and some CPU instructions saturate. Java's integer arithmetic wraps, always." }
  ]
}
:::

## Practice

:::exercise overflow-safe-midpoint

:::exercise nearly-equal

:::recap
- There are eight primitive types, each with a size fixed by the specification
  rather than by the machine. Everything else in Java is an object.
- Integer arithmetic wraps silently at the edge of the type. `Math.addExact`
  and friends throw instead, and are what to reach for when the input could be
  large.
- The type on the left of an assignment does not change how the right-hand side
  is computed. `long ms = 1000 * 60 * 60 * 24 * 365` overflows before the
  assignment happens.
- `Math.abs(Integer.MIN_VALUE)` is negative, because the positive value does not
  exist in the type.
- Integer division truncates toward zero, so `-7 / 2` is `-3`.
- Doubles are binary fractions, so `0.1 + 0.2` is not `0.3`. Compare with a
  tolerance, and keep money in `long` units or `BigDecimal`.
- `char` is a 16-bit code unit, not a character. Anything outside the first
  65,536 takes two of them.
:::
