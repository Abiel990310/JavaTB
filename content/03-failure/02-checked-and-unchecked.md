---
title: "Checked and unchecked"
navTitle: "Checked exceptions"
summary: >-
  The split only Java made, what the compiler enforces on each side, and how to decide which one your own exception should be.
objectives:
  - Say which exceptions the compiler forces you to declare or catch
  - Explain why an override may narrow a throws clause but never widen it
  - Choose between checked and unchecked for an exception of your own
status: complete
standard: java21
requires: [exceptions]
---

Java is the only mainstream language that makes the compiler check exceptions.
Everything under `RuntimeException` is **unchecked** and may be thrown from
anywhere without ceremony. Everything else under `Exception` is **checked**: a
method that can throw one must say so, and a caller must either catch it or say
so in turn.

The idea was that failures a caller could reasonably recover from should be
impossible to overlook. Thirty years of practice have been mixed, and the
argument is worth understanding rather than inheriting.

## What the compiler enforces

```java run expect-error title="A checked exception cannot be ignored"
import java.io.IOException;

public class Main {
    static void risky() throws IOException {
        throw new IOException("disk gone");
    }

    public static void main(String[] args) {
        risky();
    }
}
```

*unreported exception IOException; must be caught or declared to be thrown.*
Two ways to satisfy it — handle it, or pass the obligation up:

```java run title="Handle it, or declare it"
import java.io.IOException;

public class Main {
    static void risky() throws IOException {
        throw new IOException("disk gone");
    }

    static String handles() {
        try {
            risky();
            return "no failure";
        } catch (IOException e) {
            return "handled: " + e.getMessage();
        }
    }

    static void declares() throws IOException {   // passes the obligation to its caller
        risky();
    }

    public static void main(String[] args) {
        System.out.println(handles());

        try {
            declares();
        } catch (IOException e) {
            System.out.println("caught from declares(): " + e.getMessage());
        }
    }
}
```

An unchecked exception needs none of this. `IllegalArgumentException` can be
thrown by any method, declared by none, and caught by whoever wants it.

## throws is part of the contract

```java run expect-error title="An override cannot add a checked exception"
import java.io.IOException;

class Task {
    void run() {
    }
}

class FileTask extends Task {
    @Override
    void run() throws IOException {
        throw new IOException("no file");
    }
}

public class Main {
    public static void main(String[] args) {
        Task t = new FileTask();
        t.run();
    }
}
```

*run() in FileTask cannot override run() in Task — overridden method does not
throw IOException.*

This follows from chapter 2.6. A caller holding a `Task` was compiled against
`Task.run()`, which promises not to throw a checked exception. If a subclass
could add one, that promise would be broken by a substitution the caller cannot
see. So an override may throw **fewer** checked exceptions than the method it
overrides, or narrower ones, and never more — the same reasoning that stops an
override narrowing access.

## Which should yours be?

The intended rule:

- **Checked** when the caller can plausibly recover — a missing file might be
  retried, defaulted, or reported to a user.
- **Unchecked** when the failure means the program is wrong — a null where one
  was forbidden, an index out of range, an argument that violates the method's
  documented contract.

In practice most modern Java leans unchecked, for three reasons worth knowing:

**Checked exceptions do not compose.** A method that calls five things throwing
five different checked exceptions must declare all five, and so must its
callers. The declarations spread outward until someone widens them to
`throws Exception`, which tells nobody anything.

**They leak the implementation.** `throws SQLException` on a repository
interface says the data lives in a database. Change to a file and every caller
changes, not because their logic changed but because the declaration did.

**They interact badly with lambdas.** Nothing in `java.util.function` declares
a checked exception, so a lambda body that throws one does not compile — which
is why Part 6's stream code so often ends in a `try` that wraps and rethrows.

The library itself concedes this. `UncheckedIOException` exists for exactly one
purpose: wrapping an `IOException` so it can travel through code that cannot
declare it.

```java run title="The library's own escape hatch"
import java.io.IOException;
import java.io.UncheckedIOException;

public class Main {
    static String readIt() throws IOException {
        throw new IOException("settings.json not found");
    }

    static String unchecked() {                    // no throws clause
        try {
            return readIt();
        } catch (IOException e) {
            throw new UncheckedIOException(e);     // same failure, no obligation
        }
    }

    public static void main(String[] args) {
        try {
            unchecked();
        } catch (UncheckedIOException e) {
            System.out.println("caught: " + e.getMessage());
            System.out.println("cause:  " + e.getCause().getClass().getSimpleName());
        }
    }
}
```

:::pitfall
Wrapping a checked exception in an unchecked one is a reasonable decision and a
terrible habit. Done deliberately, at a boundary, with the cause preserved, it
keeps a clean interface. Done reflexively, in every method, it converts a
compiler-enforced contract into a run-time surprise and loses the one thing
checked exceptions were for.

The question to ask is: *is there a caller who could sensibly do something
about this?* If yes, the type should say so. If no, an unchecked exception is
honest.
:::

## Declaring your own

```java run title="Two exception types, two intentions"
public class Main {
    // Unchecked: the caller made a mistake. Nothing to recover from.
    static class InvalidAmountException extends IllegalArgumentException {
        InvalidAmountException(long pence) {
            super("amount must be positive, got " + pence);
        }
    }

    // Checked: an expected outcome the caller must decide about.
    static class InsufficientFundsException extends Exception {
        private final long shortfallPence;

        InsufficientFundsException(long shortfallPence) {
            super("short by " + shortfallPence + "p");
            this.shortfallPence = shortfallPence;
        }

        long shortfallPence() {
            return shortfallPence;
        }
    }

    static void withdraw(long balance, long amount) throws InsufficientFundsException {
        if (amount <= 0) {
            throw new InvalidAmountException(amount);
        }
        if (amount > balance) {
            throw new InsufficientFundsException(amount - balance);
        }
    }

    public static void main(String[] args) {
        try {
            withdraw(1000, 2500);
        } catch (InsufficientFundsException e) {
            System.out.println("recoverable: " + e.getMessage()
                               + " — offer an overdraft of " + e.shortfallPence() + "p");
        }

        try {
            withdraw(1000, -5);
        } catch (InvalidAmountException e) {
            System.out.println("bug: " + e.getMessage());
        } catch (InsufficientFundsException e) {
            System.out.println("unreachable here");
        }
    }
}
```

Note that `InsufficientFundsException` carries the shortfall as a field. An
exception is an object, and giving it the data a handler needs is what makes
recovery possible — a handler that can only read a message string has to parse
English to act on it.

:::quiz
{
  "question": "A method in an interface declares no checked exceptions. An implementation needs to read a file, which throws IOException. What are its options?",
  "options": [
    { "text": "Catch it internally, or wrap it in an unchecked exception", "correct": true, "why": "Right. The interface fixed the contract, so the implementation cannot add a checked exception to it. Handling it locally or wrapping it — UncheckedIOException exists for this — are the two honest options." },
    { "text": "Declare throws IOException on the implementation", "correct": false, "why": "That is exactly what the compiler refuses: an override may not throw checked exceptions the overridden method does not declare." },
    { "text": "Declare throws Exception, which is broader and therefore allowed", "correct": false, "why": "Broader is worse, not better. The rule is that an override may throw fewer or narrower checked exceptions, never more." },
    { "text": "Add throws IOException to the interface method — implementations are free to ignore it", "correct": false, "why": "That does work and is sometimes right, but it changes the contract for every caller and every other implementation, which is a much larger decision than the question implies." }
  ]
}
:::

## Practice

:::exercise checked-or-unchecked

:::exercise carry-the-data

:::recap
- Everything under `RuntimeException` is unchecked; everything else under
  `Exception` is checked and must be caught or declared.
- An override may declare fewer or narrower checked exceptions than the method
  it overrides, never more — the same substitutability rule that governs
  access.
- The intended split is recoverable versus programming error. Modern Java leans
  unchecked because checked exceptions do not compose, leak the
  implementation, and cannot pass through lambdas.
- `UncheckedIOException` is the library conceding the point. Wrapping is fine
  at a boundary and corrosive as a habit.
- Give an exception the fields a handler needs; a message string cannot be
  acted on.
:::
