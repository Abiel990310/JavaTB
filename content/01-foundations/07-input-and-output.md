---
title: "Input and output"
navTitle: "Input and output"
summary: >-
  Printing with control over the format, reading numbers and lines without losing one to a stray newline, and what Scanner costs when the input gets large.
objectives:
  - Format output with printf and say when to use %n rather than a newline
  - Read numbers and lines from the same input without losing one
  - Say when Scanner is too slow and what to reach for instead
status: complete
standard: java21
requires: [strings]
---

Every program so far has printed with `println` and read nothing. This chapter
finishes Part 1 by making both halves deliberate: getting output into the shape
you want, and getting input in without falling into the one trap that catches
every Java beginner exactly once.

:::note
The samples below feed `Scanner` a string rather than `System.in`, because a
runnable sample on this page has no keyboard attached. Everything about the
behaviour is identical — `Scanner` takes either — and the practice problems at
the end read real standard input.
:::

## Printing

```java run title="Three ways out"
public class Main {
    public static void main(String[] args) {
        System.out.println("println adds a line break");
        System.out.print("print does not");
        System.out.print(" — so these join up\n");

        System.out.printf("printf takes a format: %s is %d years old%n", "Ada", 36);
        System.out.printf("|%8.2f| padded to 8 wide, 2 decimals%n", 3.14159);
        System.out.printf("|%-8s| left-justified%n", "left");
        System.out.printf("%,d with grouping%n", 1234567);

        System.err.println("this goes to standard error, not standard output");
    }
}
```

`printf` takes a format string with placeholders: `%s` for anything, `%d` for
an integer, `%f` for a floating-point number, `%%` for a literal percent sign.
A number between the `%` and the letter sets the width, and `.2` sets the
decimal places.

Use **`%n`**, not `\n`. `\n` is always the single character U+000A, while `%n`
emits whatever the platform considers a line separator — which on Windows is
two characters. For output a person reads, `%n` is right.

`System.err` is a separate stream. It is unbuffered and conventionally carries
diagnostics, so that a program's real output can be redirected to a file while
errors still appear on the terminal.

## Reading with Scanner

```java run title="Reading typed values"
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner("42 3.5 true Ada");

        int count = in.nextInt();
        double ratio = in.nextDouble();
        boolean flag = in.nextBoolean();
        String word = in.next();

        System.out.println(count + " / " + ratio + " / " + flag + " / " + word);
    }
}
```

`Scanner` splits input on whitespace and converts each token on request.
`next` gives a word, `nextLine` gives everything up to the next line break, and
`nextInt`, `nextDouble` and `nextBoolean` parse a token into that type.

### The trap

```java run title="The bug every Java beginner meets once"
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner("30\nAda Lovelace\n");

        int age = in.nextInt();
        String name = in.nextLine();       // not what you wanted
        String actualName = in.nextLine();

        System.out.println("age             = " + age);
        System.out.println("first nextLine  = [" + name + "] length " + name.length());
        System.out.println("second nextLine = [" + actualName + "]");
    }
}
```

`nextInt` reads the digits and **stops**. The line break after them is still
sitting in the input. So the next `nextLine` finds it immediately, returns the
empty string it had been sitting in front of, and consumes it — and the name
you wanted arrives on the call after that.

The fix is to consume the rest of the line yourself:

```java run title="Two ways to get past it"
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner a = new Scanner("30\nAda Lovelace\n");
        int age = a.nextInt();
        a.nextLine();                       // discard the rest of the number's line
        System.out.println("name = [" + a.nextLine() + "]");

        // Or: never mix them. Read lines, and parse them yourself.
        Scanner b = new Scanner("30\nAda Lovelace\n");
        int age2 = Integer.parseInt(b.nextLine().strip());
        String name2 = b.nextLine();
        System.out.println("age = " + age2 + ", name = [" + name2 + "]");
    }
}
```

The second approach is the one to prefer in anything non-trivial. Reading whole
lines and parsing them keeps one idea per call, and the parsing failure is a
`NumberFormatException` naming the text that would not parse — considerably
more useful than a token silently going to the wrong variable.

## Reading until the input runs out

```java run title="Loop while there is more"
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner("3 1 4 1 5 9 2 6");

        int total = 0;
        int seen = 0;
        while (in.hasNextInt()) {
            total += in.nextInt();
            seen++;
        }
        System.out.println(seen + " numbers, total " + total);
    }
}
```

`hasNextInt` asks whether another integer is available *without* consuming it,
so it is safe as a loop condition. Calling `nextInt` when nothing is left throws
`NoSuchElementException`, so a loop that reads until end of input needs one of
these guards.

## When Scanner is too slow

`Scanner` is convenient because it does a lot: it is built on regular
expressions, it is locale-aware, and it re-checks its buffers constantly. All
of that costs.

```java run title="Measured on 200,000 integers"
import java.io.*;
import java.util.*;

public class Main {
    static long sink;

    static long viaScanner(String data) {
        Scanner in = new Scanner(new StringReader(data));
        long total = 0;
        while (in.hasNextInt()) {
            total += in.nextInt();
        }
        return total;
    }

    static long viaTokenizer(String data) throws IOException {
        StreamTokenizer in = new StreamTokenizer(new BufferedReader(new StringReader(data)));
        long total = 0;
        while (in.nextToken() != StreamTokenizer.TT_EOF) {
            total += (long) in.nval;
        }
        return total;
    }

    public static void main(String[] args) throws IOException {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 200_000; i++) {
            sb.append(i % 1000).append(' ');
        }
        String data = sb.toString();

        for (int w = 0; w < 2; w++) {          // warm up before timing anything
            sink += viaScanner(data);
            sink += viaTokenizer(data);
        }

        long t0 = System.nanoTime();
        sink += viaScanner(data);
        long t1 = System.nanoTime();
        sink += viaTokenizer(data);
        long t2 = System.nanoTime();

        System.out.printf("Scanner %d ms, StreamTokenizer %d ms (checksum %d)%n",
                          (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000, sink);
    }
}
```

Around six times slower, reproducibly. For a program reading a few dozen values
from a person that difference is invisible and `Scanner` is the right choice.
For a hundred thousand numbers from a file or a judge it is the difference
between finishing and timing out — with an algorithm that was never the
problem.

`BufferedReader` is the middle option: it reads a line at a time into a buffer,
and you split and parse yourself.

```java run title="Lines, buffered"
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader in = new BufferedReader(new StringReader("Ada,36\nGrace,45\n"));

        String line;
        while ((line = in.readLine()) != null) {
            String[] parts = line.split(",");
            System.out.printf("%-6s %3d%n", parts[0], Integer.parseInt(parts[1]));
        }
    }
}
```

`readLine` returns `null` at end of input, which is why the loop condition
assigns and compares in one expression — an idiom worth recognising even if you
would rather not write it. In a real program the argument is `new
InputStreamReader(System.in)` instead of a `StringReader`.

:::quiz
{
  "question": "A program calls `nextInt()` to read a count, then `nextLine()` to read a name, and the name always comes out empty. Why?",
  "options": [
    { "text": "nextInt left the line break in the input, and nextLine consumed exactly that", "correct": true, "why": "Right. nextInt stops after the digits. The pending line break is the first thing nextLine sees, so it returns the empty string before it — and the real name is still waiting." },
    { "text": "nextLine cannot be used after nextInt at all", "correct": false, "why": "It can; it just has to get past the line break first, either with an extra nextLine() or by reading lines throughout and parsing them yourself." },
    { "text": "The Scanner needs flushing between reads", "correct": false, "why": "Flushing applies to output streams. A Scanner reads on demand and has nothing to flush." },
    { "text": "nextInt consumed the whole line including the name", "correct": false, "why": "The opposite — it consumes too little, not too much. It stops at the end of the number and leaves everything after it, the line break included." }
  ]
}
:::

## Practice

:::exercise sum-the-input

:::exercise format-a-row

:::recap
- `printf` formats with `%s`, `%d`, `%f` and a width; prefer `%n` to `\n` so the
  line separator matches the platform.
- `System.err` is a separate stream for diagnostics, so output can be
  redirected without losing them.
- `nextInt` leaves the line break behind, so a following `nextLine` returns the
  empty string. Consume the rest of the line, or read lines throughout and
  parse them yourself.
- `hasNextInt` tests without consuming; `nextInt` with nothing left throws.
- `Scanner` is roughly six times slower than `StreamTokenizer` over a
  `BufferedReader`. Convenience is right for human-sized input and wrong for
  large input.
:::
