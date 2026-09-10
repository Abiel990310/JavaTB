---
title: "Exceptions"
navTitle: "Exceptions"
summary: >-
  Throwing, catching, and the block that always runs — plus the two ways `finally` quietly changes what your method returns.
objectives:
  - Throw and catch an exception, and read the stack trace it produces
  - Place the hierarchy — Throwable, Error, Exception, RuntimeException
  - Explain what finally guarantees, and the one thing it must never contain
status: complete
standard: java21
requires: [nested-classes]
---

A method that cannot do what its name says has to tell somebody. Returning a
special value — `-1`, `null`, `false` — puts the burden on every caller to
check, and the caller who forgets gets no warning at all. An exception inverts
that: the failure travels up the call stack by itself, and code that has
nothing useful to say about it simply does not mention it.

That is the whole trade. This chapter is the mechanism; chapter 3.5 is the
judgement about when to use it.

## Throwing and catching

```java run title="A failure that stops the method"
public class Main {
    static int parsePositive(String text) {
        int value = Integer.parseInt(text);
        if (value <= 0) {
            throw new IllegalArgumentException("must be positive, got " + value);
        }
        return value;
    }

    public static void main(String[] args) {
        System.out.println("parsed: " + parsePositive("42"));

        try {
            parsePositive("-5");
        } catch (IllegalArgumentException e) {
            System.out.println("caught: " + e.getMessage());
        }

        try {
            parsePositive("banana");
        } catch (NumberFormatException e) {
            System.out.println("caught a different one: " + e.getMessage());
        }
    }
}
```

`throw` ends the method immediately and starts unwinding: each caller in turn
is abandoned until one has a `catch` that matches. If none does, the thread
dies and the JVM prints the stack trace — which chapter 1.1 introduced as the
third of the three places errors come from.

A `catch` matches the type it names **and every subtype**, which is why
`catch (Exception e)` catches almost everything and is almost always too
broad.

## The hierarchy

```java run title="Where things sit"
public class Main {
    public static void main(String[] args) {
        Throwable[] things = {
            new IllegalArgumentException("bad argument"),
            new java.io.IOException("disk gone"),
            new StackOverflowError(),
        };

        for (Throwable t : things) {
            System.out.printf("%-24s Exception? %-5b RuntimeException? %-5b Error? %b%n",
                              t.getClass().getSimpleName(),
                              t instanceof Exception,
                              t instanceof RuntimeException,
                              t instanceof Error);
        }
    }
}
```

Everything throwable descends from `Throwable`, which splits in two:

- **`Error`** — the JVM is in trouble: `OutOfMemoryError`, `StackOverflowError`.
  Do not catch these. There is nothing useful to do, and catching one usually
  means the program limps on in a state nobody designed.
- **`Exception`** — something went wrong that a program might handle. Inside it
  sits **`RuntimeException`**, which the compiler does not force you to declare
  or catch. Chapter 3.2 is about that split and why it is contentious.

`IllegalArgumentException`, `IllegalStateException`, `NullPointerException` and
`NumberFormatException` are all `RuntimeException`s, and between them cover most
of what your own code will throw.

## Catching several types

```java run title="One handler, two failures"
public class Main {
    static String lengthOf(Object o) {
        try {
            return "length " + ((String) o).length();
        } catch (NullPointerException | ClassCastException e) {
            return "not a usable string: " + e.getClass().getSimpleName();
        }
    }

    public static void main(String[] args) {
        System.out.println(lengthOf("hello"));
        System.out.println(lengthOf(null));
        System.out.println(lengthOf(42));
    }
}
```

Multi-catch handles unrelated exceptions with one block, and is better than
widening to a shared supertype: `catch (RuntimeException e)` would also swallow
failures you never considered.

Order matters when catches are separate — a subtype must be caught before its
supertype, or the broader clause takes everything first and the compiler
reports the narrower one as unreachable.

## finally

```java run title="The block that always runs"
public class Main {
    static String trace(boolean fail) {
        StringBuilder log = new StringBuilder();
        try {
            log.append("try ");
            if (fail) {
                throw new IllegalStateException("boom");
            }
            log.append("(no failure) ");
        } catch (IllegalStateException e) {
            log.append("catch(").append(e.getMessage()).append(") ");
        } finally {
            log.append("finally");
        }
        return log.toString();
    }

    public static void main(String[] args) {
        System.out.println("failing:    " + trace(true));
        System.out.println("succeeding: " + trace(false));
    }
}
```

`finally` runs whether the block completed, threw, or returned. It is where
cleanup goes — closing a file, releasing a lock — and chapter 3.3 shows the
syntax that has largely replaced writing it by hand.

### Two ways finally changes the answer

```java run title="Look at the warnings panel"
public class Main {
    static int swallowed() {
        try {
            return 1;
        } finally {
            return 2;          // discards the return above — and any exception
        }
    }

    static int tooLate() {
        int[] box = { 0 };
        try {
            return box[0] = 1;   // the value 1 is computed and set aside here
        } finally {
            box[0] = 99;         // changes the array, not the pending result
        }
    }

    public static void main(String[] args) {
        System.out.println("swallowed(): " + swallowed());
        System.out.println("tooLate():   " + tooLate() );
    }
}
```

`swallowed()` returns **2**. A `return` inside `finally` replaces whatever the
`try` was going to do — including throwing. An exception on its way up is
discarded silently, which is as bad as it sounds. javac warns about it:
*finally clause cannot complete normally*, visible in the warnings panel above.

`tooLate()` returns **1**. The return value is evaluated before `finally` runs,
so assigning to the array afterwards changes the array and not the result
already computed. The two together make the rule easy: **never `return`,
`break`, `continue` or `throw` from a `finally` block.** Use it only for
cleanup.

## Chaining: keep the original cause

```java run title="Wrapping without losing the trail"
public class Main {
    static class ConfigException extends RuntimeException {
        ConfigException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    static void loadConfig() {
        try {
            throw new java.io.UncheckedIOException(
                new java.io.IOException("settings.json not found"));
        } catch (java.io.UncheckedIOException e) {
            throw new ConfigException("cannot start without configuration", e);
        }
    }

    public static void main(String[] args) {
        try {
            loadConfig();
        } catch (ConfigException e) {
            System.out.println("caught:  " + e.getMessage());
            System.out.println("because: " + e.getCause());
            System.out.println("root:    " + e.getCause().getCause());
        }
    }
}
```

Passing the original exception as the *cause* keeps the whole chain. A stack
trace then prints `Caused by:` sections down to the real problem, which is the
difference between "cannot start without configuration" and knowing that a file
is missing.

:::warning
`catch (Exception e) { }` — an empty catch block — is the single most damaging
line in Java. It converts a failure into silence: the method carries on with
whatever state it had, and the eventual symptom appears somewhere else entirely
with nothing to connect it back. If you genuinely intend to ignore something,
say so in a comment explaining why, and log it.
:::

:::quiz
{
  "question": "```\ntry { return \"a\"; } finally { return \"b\"; }\n```\nWhat does this return, and what if the try block threw instead?",
  "options": [
    { "text": "\"b\" in both cases — and if the try threw, the exception is discarded", "correct": true, "why": "Right. A return in finally replaces whatever the try was doing, whether that was returning or throwing. The exception vanishes with no trace at all, which is why javac warns that the finally clause cannot complete normally." },
    { "text": "\"a\", because the try's return is evaluated first", "correct": false, "why": "The value is evaluated first, but the finally block still runs before the method actually returns — and its own return wins." },
    { "text": "\"b\" if it returned, but the exception still propagates if it threw", "correct": false, "why": "That would be the safer design, and it is not what Java does. The return in finally discards a pending exception exactly as it discards a pending return." },
    { "text": "It does not compile", "correct": false, "why": "It compiles with a warning. The language permits it; every style guide forbids it." }
  ]
}
:::

## Practice

:::exercise safe-divide

:::exercise chain-the-cause

:::recap
- `throw` abandons the method and unwinds until a matching `catch` is found;
  `catch` matches the named type and its subtypes.
- `Throwable` splits into `Error` (do not catch) and `Exception`, which
  contains `RuntimeException` (the compiler does not force you to declare it).
- Multi-catch handles unrelated failures without widening to a supertype; a
  subtype must be caught before its supertype.
- `finally` always runs, and must contain only cleanup. A `return` inside it
  replaces the pending return *and discards a pending exception*.
- The return value is computed before `finally` runs, so mutating afterwards
  cannot change it.
- Pass the original exception as the cause when wrapping, or the trail is lost.
- An empty catch block converts a failure into silence.
:::
