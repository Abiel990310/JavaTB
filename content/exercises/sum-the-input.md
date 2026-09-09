---
id: sum-the-input
title: "Add up everything you are given"
difficulty: intro
chapter: input-and-output
topics: [input, loops]
check: output
standard: java21
stdin: |
  3 1 4 1 5 9 2 6
---

Read every integer from standard input and print their sum, on its own line
and with nothing else.

You are not told how many there are. Read until the input runs out.

This is your first whole program judged on its output rather than on a method's
return value: what your program writes to standard output is compared with what
was asked for, exactly.

## Starter
```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int total = in.nextInt();
        System.out.println(total);
    }
}
```

## Tests
```
31
```

## Hints
- The starter reads exactly one number. You need every number.
- `hasNextInt()` reports whether another integer is waiting, without consuming
  it — which makes it safe as a `while` condition.
- Accumulate into a variable declared before the loop, and print once after it.

## Solution
```java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int total = 0;
        while (in.hasNextInt()) {
            total += in.nextInt();
        }
        System.out.println(total);
    }
}
```

## Notes
The guard matters. Replacing `hasNextInt()` with a fixed count works only for
input of exactly that length, and calling `nextInt()` with nothing left throws
`NoSuchElementException` rather than returning a sentinel — there is no value
it could return that an input is not allowed to contain, which is the same
argument that ruled out `Integer.MIN_VALUE` in `second-largest`.

Printing is once, after the loop. A print inside the loop would produce eight
lines, and the comparison is against the whole of standard output — trailing
whitespace on a line is forgiven and an extra line is not.

`int` is wide enough here, but notice how quickly it would not be: a hundred
thousand values averaging a hundred thousand each overflows silently, in the
way chapter 1.2 showed. Judge problems that sum a large list almost always want
`long`, and the ones that do not say so are testing whether you noticed.
