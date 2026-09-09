---
id: first-program
title: "A whole program of your own"
difficulty: intro
chapter: hello-jvm
topics: [programs, output]
check: output
standard: java21
---

The other problem gave you a method and ran it for you. This one is the whole
thing: a class, a `main`, and output that has to match exactly.

Write a complete program that prints these three lines and nothing else:

```
Java 21
Main.class
Hello, JVM
```

Remember the two rules from this chapter: the class must be called `Main`,
because that is the file it will be compiled as, and the launcher will only
start a method whose shape is exactly `public static void main(String[] args)`.

## Starter
```java
public class Main {
    public static void main(String[] args) {
        // Print the three lines here.
    }
}
```

## Tests
```
Java 21
Main.class
Hello, JVM
```

## Hints
- `System.out.println(...)` prints its argument and then a newline.
- Three lines means three calls, one after another, inside `main`.
- Each line is a string literal in double quotes. Nothing needs to be computed.

## Solution
```java
public class Main {
    public static void main(String[] args) {
        System.out.println("Java 21");
        System.out.println("Main.class");
        System.out.println("Hello, JVM");
    }
}
```

## Notes
The comparison ignores trailing spaces at the end of a line and any blank lines
at the very end, so a final `println` leaving a trailing newline is fine. It
does not ignore anything else: a missing capital, a different order, or an
extra line of your own all fail.

That strictness is the point. This is how a contest judge grades, and how the
judge-style problems later in the book work — your program's entire standard
output is compared, byte for byte, against what was asked for. Getting used to
exact output now costs you nothing; discovering it later, on a problem where
the algorithm is also hard, costs an afternoon.

`System.out.print` without the `ln` would put all three on one line, which is a
different output and a failure. If you reach for `printf`, remember `%n` rather
than `\n` — it emits the platform's line separator, which is what `println`
does too.
