---
id: read-the-trace
title: "Find the real failure"
difficulty: core
chapter: debugging
topics: [debugging, exceptions, stack-traces]
check: unit
standard: java21
---

Write the tools you wish a log viewer had. Everything operates on a live
`Throwable`, not on text.

- `static Throwable rootCauseOf(Throwable failure)` — the innermost cause; a
  throwable with no cause is its own root. A self-referential or cyclic cause
  chain must not loop forever.
- `static List<String> causeChain(Throwable failure)` — every throwable in the
  chain, outermost first, as `"SimpleName: message"`, or just `"SimpleName"`
  when the message is `null`
- `static String summarise(Throwable failure)` — the root cause's
  `"SimpleName: message"` followed by `" at "` and the first stack frame
  belonging to a class whose name does **not** start with `"java."` or
  `"jdk."`, formatted `"Class.method(File:line)"`. When there is no such frame,
  use `"unknown"`.
- `static List<String> suppressedMessages(Throwable failure)` — the messages of
  every suppressed throwable on the outermost exception, in order
- `static int depthOf(Throwable failure)` — how many throwables are in the
  chain, counting the outermost as 1

## Starter
```java
static Throwable rootCauseOf(Throwable failure) {
    return failure.getCause();
}

static List<String> causeChain(Throwable failure) {
    return List.of(failure.getClass().getSimpleName() + ": " + failure.getMessage());
}

static String summarise(Throwable failure) {
    StackTraceElement[] frames = failure.getStackTrace();
    return failure.getMessage() + " at " + frames[0];
}

static List<String> suppressedMessages(Throwable failure) {
    return List.of();
}

static int depthOf(Throwable failure) {
    return 1;
}
```

## Tests
```java
import java.io.IOException;

IllegalArgumentException innermost = new IllegalArgumentException("expected a number, found 'abc'");
IllegalStateException middle = new IllegalStateException("could not load record 42", innermost);
RuntimeException outermost = new RuntimeException("request failed", middle);

check(rootCauseOf(outermost) == innermost);
check(rootCauseOf(innermost) == innermost);
check(rootCauseOf(middle) == innermost);

checkEq(causeChain(outermost), List.of(
    "RuntimeException: request failed",
    "IllegalStateException: could not load record 42",
    "IllegalArgumentException: expected a number, found 'abc'"));
checkEq(causeChain(innermost), List.of("IllegalArgumentException: expected a number, found 'abc'"));

checkEq(depthOf(outermost), 3);
checkEq(depthOf(middle), 2);
checkEq(depthOf(innermost), 1);

// A message-less exception.
checkEq(causeChain(new IllegalStateException()), List.of("IllegalStateException"));
checkEq(causeChain(new RuntimeException("outer", new IllegalStateException())),
        List.of("RuntimeException: outer", "IllegalStateException"));

// A cycle must terminate.
RuntimeException a = new RuntimeException("a");
RuntimeException b = new RuntimeException("b", a);
a.initCause(b);
checkEq(depthOf(b), 2);
check(rootCauseOf(b) == a);

// summarise reports the root cause and the first frame that is ours.
RuntimeException thrownHere = capture();
checkEq(causeChain(thrownHere).get(0), "RuntimeException: wrapper");
check(summarise(thrownHere).startsWith("IllegalArgumentException: the real problem at "));
check(summarise(thrownHere).contains("Main."));
check(!summarise(thrownHere).contains("java.base"));

// A throwable with a hand-made empty trace has no frame to name.
RuntimeException noFrames = new RuntimeException("nowhere");
noFrames.setStackTrace(new StackTraceElement[0]);
checkEq(summarise(noFrames), "RuntimeException: nowhere at unknown");

// A trace made only of JDK frames also has none of ours.
RuntimeException jdkOnly = new RuntimeException("elsewhere");
jdkOnly.setStackTrace(new StackTraceElement[] {
    new StackTraceElement("java.util.ArrayList", "get", "ArrayList.java", 427),
    new StackTraceElement("jdk.internal.misc.Unsafe", "park", "Unsafe.java", 1),
});
checkEq(summarise(jdkOnly), "RuntimeException: elsewhere at unknown");

// Suppressed exceptions come from try-with-resources.
Exception caught = null;
try (AutoCloseable first = () -> { throw new IllegalStateException("close first"); };
     AutoCloseable second = () -> { throw new IllegalStateException("close second"); }) {
    throw new IOException("the body failed");
} catch (Exception failure) {
    caught = failure;
}
checkEq(causeChain(caught).get(0), "IOException: the body failed");
checkEq(suppressedMessages(caught), List.of("close second", "close first"));
checkEq(suppressedMessages(innermost), List.of());
```

## Hints
- `rootCauseOf` must handle a throwable with **no** cause (`getCause()` is
  `null`) and must not loop on a cycle. Walk with a `Set` of already-seen
  throwables, compared by identity — `Collections.newSetFromMap(new IdentityHashMap<>())`,
  or just a `List` and `contains` by `==`.
- `Throwable.equals` is `Object.equals`, so a `HashSet` is already
  identity-based here; the reason to be explicit is that a subclass might
  override it.
- `causeChain` is the same walk, formatting each element. A `null` message
  means the name alone, with no colon.
- `summarise` scans `rootCauseOf(failure).getStackTrace()` for the first frame
  whose `getClassName()` starts with neither `"java."` nor `"jdk."`.
- `StackTraceElement.toString()` already prints `Class.method(File:line)`, so
  you do not have to assemble it.
- `getSuppressed()` returns an array, never `null`, and is empty for most
  throwables.
- A lambda can implement `AutoCloseable` — that is how the test builds
  resources whose `close` throws.

## Solution
```java
static List<Throwable> chainOf(Throwable failure) {
    List<Throwable> chain = new ArrayList<>();
    Throwable current = failure;
    while (current != null) {
        boolean alreadySeen = false;
        for (Throwable seen : chain) {
            if (seen == current) {
                alreadySeen = true;
                break;
            }
        }
        if (alreadySeen) {
            break;
        }
        chain.add(current);
        current = current.getCause();
    }
    return chain;
}

static Throwable rootCauseOf(Throwable failure) {
    List<Throwable> chain = chainOf(failure);
    return chain.get(chain.size() - 1);
}

static String describe(Throwable failure) {
    String message = failure.getMessage();
    String name = failure.getClass().getSimpleName();
    return message == null ? name : name + ": " + message;
}

static List<String> causeChain(Throwable failure) {
    List<String> described = new ArrayList<>();
    for (Throwable link : chainOf(failure)) {
        described.add(describe(link));
    }
    return List.copyOf(described);
}

static String summarise(Throwable failure) {
    Throwable root = rootCauseOf(failure);
    String where = "unknown";
    for (StackTraceElement frame : root.getStackTrace()) {
        String className = frame.getClassName();
        if (!className.startsWith("java.") && !className.startsWith("jdk.")) {
            where = frame.toString();
            break;
        }
    }
    return describe(root) + " at " + where;
}

static List<String> suppressedMessages(Throwable failure) {
    List<String> messages = new ArrayList<>();
    for (Throwable suppressed : failure.getSuppressed()) {
        messages.add(suppressed.getMessage());
    }
    return List.copyOf(messages);
}

static int depthOf(Throwable failure) {
    return chainOf(failure).size();
}

static RuntimeException capture() {
    try {
        throw new IllegalArgumentException("the real problem");
    } catch (RuntimeException real) {
        return new RuntimeException("wrapper", real);
    }
}
```

## Notes
`rootCauseOf` returning `getCause()` is the mistake that makes a log viewer
useless in both directions at once. For a two-deep chain it happens to be
right; for the three-deep chain in the tests it returns the *middle* exception
— the one that says "could not load record 42" rather than the one that says
what was actually wrong. And for an exception with no cause at all it returns
`null`, so the caller gets a `NullPointerException` while trying to report a
failure. Walking to the end and treating a causeless throwable as its own root
handles both.

The cycle case is not paranoia. `initCause` will happily make `a` the cause of
`b` and `b` the cause of `a` — the JDK's own `printStackTrace` guards against
this, and any chain-walking code of yours has to as well. Comparison must be by
identity: two distinct exceptions with the same class and message are not the
same link, and `Throwable` inherits `Object.equals`, so identity is what you
get by default. The solution makes it explicit because relying on an inherited
`equals` that a subclass could override is exactly the kind of assumption that
breaks quietly.

`summarise` skipping JDK frames is the small piece of judgement that turns a
trace into a sentence. The root cause's top frame is very often
`java.util.Objects.requireNonNull` or an `ArrayList` internal — true, and not
where *your* bug is. The first non-JDK frame is where your code did the wrong
thing, which is the line you want in a one-line summary. The two tests with
hand-built traces exist because both edge cases are real: a fast-throw
exception has an empty trace (chapter 9.3), and a failure deep inside a library
can genuinely have no frame of yours near the top.

`suppressedMessages` reads them in the order the array reports, which is
**reverse close order**: `try`-with-resources closes the last-declared resource
first, so `"close second"` is suppressed before `"close first"`. That ordering
is worth checking rather than assuming, because a handler that reports "the
first thing that went wrong while closing" and prints element zero is reporting
the last resource declared.
