---
title: "Strings"
navTitle: "Strings"
summary: >-
  Why a String cannot be changed, why == sometimes agrees with equals and sometimes does not, and what building one in a loop actually costs.
objectives:
  - Explain why == on strings is unreliable and when it happens to work
  - Build a string in a loop without making the work quadratic
  - Choose between trim and strip, and say what neither of them removes
status: complete
standard: java21
requires: [arrays]
---

`String` is the class you will use more than any other, and it behaves unlike
anything else in the language: it is an object, but it has a literal syntax; it
is a reference, but `==` on it usually seems to work; and it is immutable in a
language where almost nothing else is.

Every strange thing about strings follows from that last property, so start
there.

## Nothing can change a String

```java run title="The methods that sound like they modify"
public class Main {
    public static void main(String[] args) {
        String greeting = "hello";

        greeting.toUpperCase();          // result thrown away
        System.out.println("after calling toUpperCase: " + greeting);

        String shouted = greeting.toUpperCase();
        System.out.println("what it returned:          " + shouted);
        System.out.println("the original, still:       " + greeting);
    }
}
```

There is no method on `String` that changes it. `toUpperCase`, `replace`,
`substring`, `strip` and the rest all return a **new** string and leave the
receiver untouched. Calling one and ignoring the result — the first line above
— is a no-op, and it is one of the most common beginner bugs precisely because
it looks like it did something.

Immutability is what makes strings safe to share: since no one can change the
object, it does not matter how many variables point at it, and no method you
pass one to can alter it behind your back. That is why chapter 1.4's warning
about mutable objects never applies to `String`.

## `==` versus `equals`

Because a `String` is an object, `==` compares references. Because string
literals are shared, `==` frequently gives the right answer anyway — which is
worse than if it never did.

```java run title="Five comparisons, and only one of them is trustworthy"
public class Main {
    static String tail() {
        return "va";                        // the compiler cannot fold this away
    }

    public static void main(String[] args) {
        String a = "java";
        String b = "java";
        String c = new String("java");
        String folded = "ja" + "va";        // both halves are constants
        String built = "ja" + tail();       // assembled while running

        System.out.println("a == b        " + (a == b));
        System.out.println("a == c        " + (a == c));
        System.out.println("a == folded   " + (a == folded));
        System.out.println("a == built    " + (a == built));
        System.out.println("a.equals(b)   " + a.equals(b));
        System.out.println("a.equals(built) " + a.equals(built));
    }
}
```

Three mechanisms are visible there.

**Literals are pooled.** Every identical string literal in a program refers to
one shared object, held in a table called the string pool. So `a == b` is true —
not because their contents match, but because there is only one `"java"`.

**Constant expressions are folded.** `"ja" + "va"` is computed by the compiler,
so it becomes the literal `"java"` and lands in the same pool entry.

**Anything else is a new object.** `new String("java")` explicitly demands a
fresh one, and a concatenation whose parts are not all constants is built at run
time. Both compare `false` with `==` and `true` with `equals`.

:::warning
`==` on strings is a bug that passes its tests. It works for literals, which is
what every small example uses, and fails the moment a string arrives from a
file, a network, user input, or a concatenation — which is what every real
program uses. Compare strings with `equals`, always.
:::

```java run title="Comparing properly"
public class Main {
    public static void main(String[] args) {
        String name = "Ada";

        System.out.println(name.equals("Ada"));
        System.out.println(name.equalsIgnoreCase("ADA"));
        System.out.println("apple".compareTo("banana"));   // negative: apple sorts first
        System.out.println("   ".isEmpty() + " / " + "   ".isBlank());
    }
}
```

`compareTo` returns a negative number, zero, or a positive number, which is the
contract every sorting method in Java relies on. And note `isEmpty` versus
`isBlank`: the first asks whether the length is zero, the second whether there
is anything but whitespace.

## Building strings costs more than it looks

A `String` cannot change, so `s += "x"` cannot append. It builds a whole new
string containing the old contents plus the new piece, and abandons the old one.
Do that in a loop and each iteration copies everything written so far:

```java run title="Measured, not asserted"
public class Main {
    static int sink;

    static String byConcat(int n) {
        String s = "";
        for (int i = 0; i < n; i++) {
            s += "x";
        }
        return s;
    }

    static String byBuilder(int n) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++) {
            b.append("x");
        }
        return b.toString();
    }

    public static void main(String[] args) {
        // Warm up, or the first timing measures the interpreter (chapter 1.1).
        for (int w = 0; w < 30; w++) {
            sink += byConcat(4000).length();
            sink += byBuilder(4000).length();
        }

        for (int n : new int[] { 5000, 10000, 20000 }) {
            long t0 = System.nanoTime();
            sink += byConcat(n).length();
            long t1 = System.nanoTime();
            sink += byBuilder(n).length();
            long t2 = System.nanoTime();

            System.out.printf("n=%-6d concat %4d ms    builder %d ms%n",
                              n, (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000);
        }
        System.out.println("checksum " + sink);   // so nothing above is optimised away
    }
}
```

Watch what happens to the concatenation column as `n` doubles. It does not
double — it goes up by a factor of four to six, because the work is quadratic
in `n` and the discarded strings put pressure on the garbage collector as well.
The builder column stays at zero.

`StringBuilder` keeps a `char` array and appends into it, growing it when it
runs out, which is the array-doubling idea from chapter 1.5. Nothing is copied
except when it grows, so the whole loop is linear.

:::note
A single `+` is free. Java compiles `"a" + b + "c"` into one `invokedynamic`
that assembles the result in one go, so ordinary concatenation outside a loop
needs no `StringBuilder` and reads better without one. The cost appears
specifically when concatenation happens *repeatedly*, once per iteration.
:::

## Whitespace, and what "whitespace" means

```java run title="trim, strip, and a character that is neither"
public class Main {
    static void show(String label, String s) {
        System.out.printf("%-14s raw=%d  trim=%d  strip=%d  isWhitespace=%b%n",
                          label, s.length(), s.trim().length(), s.strip().length(),
                          Character.isWhitespace(s.charAt(0)));
    }

    public static void main(String[] args) {
        show("space",  " hi ");
        show("tab",    "\thi\t");
        show("em space", " hi ");
        show("NBSP",   " hi ");
    }
}
```

`trim` is the original method and predates Unicode support: it removes anything
with a code point at or below `U+0020`, which covers space and tab and nothing
else. `strip` was added in Java 11 and uses `Character.isWhitespace`, so it
also removes the em space and the rest of Unicode's spacing characters. Prefer
`strip`.

Then there is the non-breaking space, `U+00A0`. `Character.isWhitespace`
returns **false** for it, so neither method removes it. It is invisible, it
arrives constantly from copied-and-pasted text and from HTML, and a field that
looks empty but is not is the result. When input has been through a browser,
consider replacing ` ` explicitly before trimming.

## Text blocks

```java run title="A string that spans lines"
public class Main {
    public static void main(String[] args) {
        String json = """
            {
              "name": "Ada",
              "year": 1815
            }""";

        System.out.println(json);
        System.out.println("---");
        System.out.println(String.join(" | ", "a", "b", "c"));
        System.out.println("ab".repeat(3));
        System.out.println("total: %d items".formatted(7));
    }
}
```

A text block is delimited by three quotes and keeps its line breaks, so
embedded quotes need no escaping. The indentation common to every line is
stripped, measured from the least-indented line — which is why the closing
delimiter's position matters: put it on its own line further left and you keep
more indentation.

:::quiz
{
  "question": "A method reads a name from a file and compares it with `name == \"Ada\"`. The file contains exactly `Ada`. What happens?",
  "options": [
    { "text": "It is false, because the string from the file is a different object", "correct": true, "why": "Right. Only literals and compile-time constants land in the pool. A string built at run time — read from a file, concatenated, parsed — is a new object, so == compares two different references." },
    { "text": "It is true, because the contents are identical", "correct": false, "why": "That is what equals asks. == asks whether the two references point at the same object, and identical contents do not make one object." },
    { "text": "It is true, because Java interns every string automatically", "correct": false, "why": "Only literals and constant expressions are interned automatically. You can request it for others with .intern(), but almost nothing should." },
    { "text": "It does not compile — == is not allowed on strings", "correct": false, "why": "It compiles without so much as a warning, which is exactly why this bug is common. Both sides are references and == is legal on any two references." }
  ]
}
:::

## Practice

:::exercise is-palindrome

:::exercise run-length-encode

:::recap
- A `String` cannot be modified. Every method that sounds like it modifies
  returns a new string, and ignoring that result does nothing at all.
- `==` compares references. It happens to work for literals, because identical
  literals share one pooled object, and fails for anything built at run time.
  Use `equals`.
- `s += "x"` in a loop is quadratic: each step copies everything so far. Use
  `StringBuilder`, which appends into a growing array. A single `+` outside a
  loop costs nothing.
- `strip` understands Unicode whitespace and `trim` does not, so prefer
  `strip` — but neither removes a non-breaking space, because Java does not
  classify `U+00A0` as whitespace.
- A text block keeps line breaks and strips the indentation common to all its
  lines.
:::
