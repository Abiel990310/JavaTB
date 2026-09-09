---
title: "Arrays"
navTitle: "Arrays"
summary: >-
  Fixed-length storage, what it holds before you fill it, and the three ways comparing or copying an array goes quietly wrong.
objectives:
  - Create arrays and say what they contain before anything is assigned
  - Compare and copy arrays correctly, including nested ones
  - Explain why storing into an Object[] can throw at run time
status: complete
standard: java21
requires: [methods]
---

An array is a fixed run of slots, all the same type, numbered from zero. It is
the simplest thing in Java that holds more than one value, and the one every
other collection is eventually built on.

Fixed is the word to hold on to. An array's length is decided when it is
created and never changes — there is no `add`. Part 4 introduces `ArrayList`,
which is an array underneath with the resizing written for you. Until then,
arrays are also the best possible place to learn what a reference is, because
their mistakes are so visible.

## Creating one

```java run title="Three ways to make an array, and what is in it"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] counts = new int[3];              // length 3, filled with the default
        String[] names = new String[2];
        boolean[] flags = new boolean[2];

        System.out.println(Arrays.toString(counts));
        System.out.println(Arrays.toString(names));
        System.out.println(Arrays.toString(flags));

        int[] primes = { 2, 3, 5, 7 };          // literal, length inferred
        System.out.println(Arrays.toString(primes) + " has length " + primes.length);
    }
}
```

A new array is never uninitialised. Every slot holds the zero value for its
type: `0` for numeric types, `false` for `boolean`, the code point zero for
`char`, and `null` for every reference type. That last one matters —
`new String[2]` gives you two slots holding nothing, not two empty strings, and
calling a method on either is a `NullPointerException`.

`length` is a field, not a method: `primes.length`, with no parentheses. A
`String` uses `length()` with them. Nothing justifies the inconsistency; you
simply have to remember it, and the compiler will catch you every time.

## Arrays are objects, so `==` asks the wrong question

Chapter 1.4 established that a variable of array type holds a reference. Two
consequences follow immediately:

```java run title="Comparing arrays"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] a = { 1, 2, 3 };
        int[] b = { 1, 2, 3 };

        System.out.println("a == b            " + (a == b));
        System.out.println("Arrays.equals     " + Arrays.equals(a, b));

        int[][] x = { { 1, 2 } };
        int[][] y = { { 1, 2 } };
        System.out.println("Arrays.equals 2D  " + Arrays.equals(x, y));
        System.out.println("Arrays.deepEquals " + Arrays.deepEquals(x, y));
    }
}
```

`a == b` is `false` because they are two different arrays; `==` on references
asks "the same object?", not "the same contents?". `Arrays.equals` asks the
question you meant.

But look at the third line. `Arrays.equals` on a two-dimensional array is also
`false` — because an `int[][]` is an array *of arrays*, so comparing element by
element compares references with `==` again, one level down. `deepEquals`
recurses. The rule is: `equals` for a flat array, `deepEquals` the moment there
is nesting.

## Printing one

```java run title="Why your array prints as gibberish"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] flat = { 1, 2, 3 };
        int[][] nested = { { 1, 2 }, { 3, 4 } };

        System.out.println("println directly: " + flat);
        System.out.println("Arrays.toString:  " + Arrays.toString(flat));
        System.out.println("toString on 2D:   " + Arrays.toString(nested));
        System.out.println("deepToString:     " + Arrays.deepToString(nested));
    }
}
```

Printing an array directly gives something like `[I@66d3c617`: `[I` means "array
of int" and the hex is an identity hash — not a memory address, and not
anything useful. Arrays do not override `toString`, so they inherit the default
one from `Object`.

The third line is the same trap as `equals` — `Arrays.toString` on a nested
array prints each *element's* default `toString`, so you get a list of
gibberish instead of one piece of it. `deepToString` recurses.

:::tip
`Arrays.toString` and `Arrays.equals` for flat, `deepToString` and `deepEquals`
for nested. Four methods, one distinction, and it is the same distinction both
times.
:::

## Two dimensions is an array of arrays

```java run title="Rectangular, and not"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[][] grid = new int[2][3];          // 2 rows, each a new int[3]
        grid[1][2] = 7;
        System.out.println(Arrays.deepToString(grid));

        int[][] triangle = new int[3][];        // 3 rows, each still null
        for (int row = 0; row < triangle.length; row++) {
            triangle[row] = new int[row + 1];   // give each row its own length
        }
        System.out.println(Arrays.deepToString(triangle));
        System.out.println("row 2 has length " + triangle[2].length);
    }
}
```

Java has no true multi-dimensional array. `int[][]` is an array whose elements
are `int[]` references, which is why the rows can have different lengths and
why `new int[3][]` leaves them `null` until you supply them. It is also why
`grid.length` is the number of rows and `grid[0].length` is the length of the
first row specifically — there is no "width" to ask for.

## Copying, and how deep it goes

```java run title="clone copies one level"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] flat = { 1, 2, 3 };
        int[] copy = flat.clone();
        copy[0] = 99;
        System.out.println("flat after editing its copy: " + Arrays.toString(flat));

        int[][] nested = { { 1, 2 }, { 3, 4 } };
        int[][] shallow = nested.clone();
        shallow[0][0] = 99;
        System.out.println("nested after editing its clone: " + Arrays.deepToString(nested));
    }
}
```

The flat copy is independent. The nested one is not: `clone` copied the outer
array, so `shallow` is a new array of two references — pointing at the *same*
two rows. Change a row through one and the other sees it, because there is only
one row.

This is the reference rule from chapter 1.4 again, and it is worth noticing
that nothing here is special to `clone`. Copying an array of references always
copies the references. A genuinely independent nested copy has to clone each
row as well.

## The toolbox

```java run title="What java.util.Arrays gives you"
import java.util.Arrays;

public class Main {
    public static void main(String[] args) {
        int[] values = { 5, 3, 1, 4 };

        int[] sorted = values.clone();
        Arrays.sort(sorted);
        System.out.println("sorted:       " + Arrays.toString(sorted));
        System.out.println("binarySearch: index " + Arrays.binarySearch(sorted, 4));

        System.out.println("copyOf grown: " + Arrays.toString(Arrays.copyOf(values, 6)));

        int[] filled = new int[4];
        Arrays.fill(filled, -1);
        System.out.println("fill:         " + Arrays.toString(filled));

        int[] source = { 1, 2, 3, 4, 5 };
        int[] target = new int[5];
        System.arraycopy(source, 1, target, 0, 3);   // from index 1, 3 elements
        System.out.println("arraycopy:    " + Arrays.toString(target));
    }
}
```

Two things to note. `Arrays.sort` sorts **in place** and returns nothing, which
is why the sample clones first — a method that returned a sorted copy would
have to allocate one, and the library made the other choice. And
`binarySearch` requires the array to be sorted already; on unsorted input it
returns a meaningless answer rather than an error, which is a trap worth
remembering.

`Arrays.copyOf` is the closest thing to resizing: it makes a new array of the
requested length and pads with the default value. That, in a loop with a
doubling strategy, is essentially what `ArrayList` does for you in Part 4.

## Where arrays betray the type system

```java run expect-throw title="A store that the compiler allowed"
public class Main {
    public static void main(String[] args) {
        String[] names = { "Ada", "Grace" };
        Object[] objects = names;        // allowed: String[] is an Object[]

        objects[0] = 42;                 // an Integer is an Object, so this compiles
        System.out.println(objects[0]);
    }
}
```

That compiles cleanly and throws `ArrayStoreException` at run time.

Arrays in Java are **covariant**: because `String` is an `Object`, `String[]`
is treated as an `Object[]`. That lets you write a method taking `Object[]` and
pass it any array of references — convenient, and unsound, because through the
`Object[]` view the compiler will happily let you store an `Integer` into what
is really a `String[]`. The JVM therefore checks the type of every store into a
reference array, and throws when it does not fit.

So this is a hole the language leaves open at compile time and patches at run
time, at the cost of a check on every write. It is worth meeting now because it
explains a decision you will meet in Part 5: generics are **not** covariant —
`List<String>` is not a `List<Object>` — and the reason is precisely that the
designers had already seen how this turned out for arrays.

:::quiz
{
  "question": "`int[][] grid = new int[3][];` — what does `grid[0].length` do?",
  "options": [
    { "text": "Throws NullPointerException", "correct": true, "why": "Right. Only the outer array was created; its three elements are int[] references, and they are null until assigned. Reading .length on null throws." },
    { "text": "Returns 0", "correct": false, "why": "That would be the answer if the rows were zero-length arrays. They are not arrays at all yet — they are null." },
    { "text": "Returns 3", "correct": false, "why": "3 is grid.length, the number of rows. There is no width until each row is given its own array." },
    { "text": "Does not compile — the second dimension is required", "correct": false, "why": "It compiles. Leaving the second dimension out is exactly how you build a jagged array whose rows have different lengths." }
  ]
}
:::

## Practice

:::exercise reverse-in-place

:::exercise second-largest

:::recap
- An array has a fixed length and is filled with the zero value for its type:
  `0`, `false`, code point zero, or `null`.
- `length` is a field on an array and a method on a `String`.
- `==` on arrays compares identity. Use `Arrays.equals`, or `deepEquals` as soon
  as there is nesting — and the same split applies to `toString` and
  `deepToString`.
- `int[][]` is an array of `int[]` references, so rows may differ in length and
  may be null.
- `clone` copies one level. Cloning an array of references gives you new
  references to the same objects.
- `Arrays.sort` sorts in place; `binarySearch` gives a meaningless answer on
  unsorted input rather than an error.
- Arrays are covariant and therefore unsound, so every store into a reference
  array is checked at run time and can throw `ArrayStoreException`.
:::
