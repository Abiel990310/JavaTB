---
title: "try-with-resources"
navTitle: "try-with-resources"
summary: >-
  Releasing things reliably — and the failure that hand-written cleanup causes, in which the exception you needed to see is replaced by the one you did not.
objectives:
  - Write a try-with-resources block and implement AutoCloseable
  - Say in what order resources are closed
  - Explain what a suppressed exception is and what is lost without one
status: complete
standard: java21
requires: [checked-exceptions]
---

Some things must be released: files, sockets, database connections, locks. The
`finally` block of chapter 3.1 can do it, and for twenty years that is how it
was done. It turns out to be almost impossible to get right, in a way that is
not obvious until you see it fail.

## The syntax

```java run title="Opened, used, closed"
public class Main {
    static class Resource implements AutoCloseable {
        private final String name;

        Resource(String name) {
            this.name = name;
            System.out.println("  open " + name);
        }

        void use() {
            System.out.println("  use " + name);
        }

        @Override
        public void close() {
            System.out.println("  close " + name);
        }
    }

    public static void main(String[] args) {
        try (Resource first = new Resource("first");
             Resource second = new Resource("second")) {
            first.use();
            second.use();
        }
        System.out.println("done");
    }
}
```

Anything declared in the parentheses is closed when the block ends — normally,
by `return`, or by an exception. The only requirement is that it implements
`AutoCloseable`, which declares a single `close()` method.

Note the order: **second, then first.** Resources close in reverse order of
opening, because a later one may depend on an earlier one. A statement wrapping
a stream must be closed before the stream it wraps.

## What hand-written cleanup gets wrong

Here are the two versions side by side, in the case that matters: the body
fails *and* closing fails.

```java run title="One of these loses your exception"
public class Main {
    static class Resource implements AutoCloseable {
        private final String name;

        Resource(String name) {
            this.name = name;
        }

        void use() {
            System.out.println("  using " + name);
        }

        @Override
        public void close() {
            throw new IllegalStateException("close failed: " + name);
        }
    }

    public static void main(String[] args) {
        System.out.println("try-with-resources:");
        try (Resource r = new Resource("auto")) {
            r.use();
            throw new RuntimeException("body failed");
        } catch (RuntimeException e) {
            System.out.println("  caught:     " + e.getMessage());
            for (Throwable suppressed : e.getSuppressed()) {
                System.out.println("  suppressed: " + suppressed.getMessage());
            }
        }

        System.out.println("hand-written finally:");
        try {
            Resource r = new Resource("manual");
            try {
                r.use();
                throw new RuntimeException("body failed");
            } finally {
                r.close();
            }
        } catch (RuntimeException e) {
            System.out.println("  caught:     " + e.getMessage());
            System.out.println("  suppressed: " + e.getSuppressed().length + " (nothing kept)");
        }
    }
}
```

The hand-written version reports **close failed: manual**. The body's failure —
the thing that actually went wrong, the reason you were debugging — has been
destroyed. `close()` threw while the original exception was propagating, and a
new exception thrown from a `finally` block replaces the one already in flight,
exactly as chapter 3.1's `return` did.

try-with-resources reports **body failed**, and keeps the close failure as a
*suppressed* exception attached to it. Nothing is lost: the primary failure is
the one you see, and the secondary is still there when you go looking.
`printStackTrace` shows it under a `Suppressed:` heading.

This is why the feature exists. Writing the equivalent by hand — catching the
body's exception, attempting the close, calling `addSuppressed` if that also
fails, rethrowing the right one — takes about fifteen lines and essentially
nobody wrote them.

## Implementing AutoCloseable

```java run title="A resource of your own"
public class Main {
    static class Transaction implements AutoCloseable {
        private final String name;
        private boolean committed;

        Transaction(String name) {
            this.name = name;
            System.out.println("BEGIN " + name);
        }

        void commit() {
            committed = true;
            System.out.println("COMMIT " + name);
        }

        @Override
        public void close() {
            if (!committed) {
                System.out.println("ROLLBACK " + name);
            }
        }
    }

    static void succeeds() {
        try (Transaction tx = new Transaction("good")) {
            tx.commit();
        }
    }

    static void fails() {
        try (Transaction tx = new Transaction("bad")) {
            throw new IllegalStateException("something went wrong in " + tx.name);
        } catch (IllegalStateException e) {
            System.out.println("handled: " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        succeeds();
        fails();
    }
}
```

`close()` rolls back unless the work was committed, so the failure path needs
no cleanup code at all. That shape — commit in the body, undo in `close`,
nothing in between — is worth recognising: it is how transactions, locks and
temporary files are all managed.

:::note
`AutoCloseable.close()` is declared to throw `Exception`, so an implementation
may throw a checked exception and callers must handle it. `Closeable`, the
older interface used by the I/O classes, narrows that to `IOException`.
Narrowing further is allowed — chapter 3.2's rule — so a resource whose close
cannot fail should declare `public void close()` with no `throws` at all, as
both examples above do. That saves every caller a pointless `catch`.
:::

## Using an existing variable

Since Java 9, a resource that already exists can be named directly, provided it
is effectively final:

```java run title="No redundant declaration"
public class Main {
    static class Resource implements AutoCloseable {
        private final String name;

        Resource(String name) {
            this.name = name;
        }

        @Override
        public void close() {
            System.out.println("closed " + name);
        }
    }

    public static void main(String[] args) {
        Resource existing = new Resource("passed in");

        try (existing) {
            System.out.println("working with " + existing.name);
        }
    }
}
```

Before that, you had to write `try (Resource r = existing)`, which read as
though a second resource were being created.

:::warning
A resource is closed by the block that declares it, so do not open a resource
inside a method and return it — the caller cannot tell whether it is already
closed. Either do the work inside the method, or hand back something the caller
declares in its own try-with-resources and knows it owns.
:::

:::quiz
{
  "question": "A try-with-resources block's body throws, and then close() throws a different exception. Which one reaches the caller?",
  "options": [
    { "text": "The body's — the close failure is attached to it as a suppressed exception", "correct": true, "why": "Right. The primary failure is preserved because it is the one that explains what went wrong, and the close failure is kept on it, retrievable with getSuppressed()." },
    { "text": "The close failure — it was thrown last", "correct": false, "why": "That is what a hand-written finally does, and it is precisely the bug try-with-resources was designed to remove. Last-thrown-wins destroys the useful exception." },
    { "text": "Both, wrapped in a combined exception", "correct": false, "why": "No new exception is created. One is thrown and the other is attached to it, which keeps the type of the primary failure intact for catch clauses." },
    { "text": "Whichever is checked, or the body's if both are unchecked", "correct": false, "why": "Checked-ness plays no part. The rule is simply that the body's exception is primary." }
  ]
}
:::

## Practice

:::exercise closing-in-order

:::exercise transactional-resource

:::recap
- Anything implementing `AutoCloseable` can be declared in a try-with-resources
  header and is closed when the block ends, however it ends.
- Resources close in reverse order of declaration.
- If the body throws and `close()` also throws, the body's exception is the one
  that propagates and the close failure is attached to it as a suppressed
  exception. Hand-written `finally` destroys the body's exception instead.
- Narrow `close()`'s `throws` clause to nothing when it cannot fail, and save
  every caller a `catch`.
- Since Java 9 an effectively final existing variable may be used directly.
:::
