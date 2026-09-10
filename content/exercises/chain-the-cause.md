---
id: chain-the-cause
title: "Do not lose the real problem"
difficulty: core
chapter: exceptions
topics: [exceptions, chaining]
check: unit
standard: java21
---

A loader wraps low-level failures in its own exception type so callers have one
thing to catch. The starter loses the original failure on the way.

Write:

- `LoadException`, a `RuntimeException` with a constructor taking a message and
  a cause
- `load(String name)` which throws `LoadException` with the message
  `cannot load <name>`, caused by the original exception

`fetch(String)` is provided and throws for you: it throws
`IllegalStateException("no such resource: <name>")` for a name starting with
`missing`, and returns the name uppercased otherwise.

## Starter
```java
static class LoadException extends RuntimeException {
    LoadException(String message) {
        super(message);
    }
}

static String fetch(String name) {
    if (name.startsWith("missing")) {
        throw new IllegalStateException("no such resource: " + name);
    }
    return name.toUpperCase(Locale.ROOT);
}

static String load(String name) {
    try {
        return fetch(name);
    } catch (IllegalStateException e) {
        throw new LoadException("cannot load " + name);
    }
}
```

## Tests
```java
checkEq(load("config"), "CONFIG");
checkEq(load("data"), "DATA");

LoadException thrown = null;
try {
    load("missing-config");
} catch (LoadException e) {
    thrown = e;
}
check(thrown != null);
checkEq(thrown.getMessage(), "cannot load missing-config");
check(thrown.getCause() != null);
checkEq(thrown.getCause().getClass().getSimpleName(), "IllegalStateException");
checkEq(thrown.getCause().getMessage(), "no such resource: missing-config");

checkThrows(LoadException.class, () -> load("missing-anything"));
```

## Hints
- `LoadException` currently has no way to carry a cause. Give its constructor a
  second parameter.
- `RuntimeException` already has a `(String, Throwable)` constructor — pass
  both up with `super`.
- In the catch block, hand the caught exception to the new one.

## Solution
```java
static class LoadException extends RuntimeException {
    LoadException(String message, Throwable cause) {
        super(message, cause);
    }
}

static String fetch(String name) {
    if (name.startsWith("missing")) {
        throw new IllegalStateException("no such resource: " + name);
    }
    return name.toUpperCase(Locale.ROOT);
}

static String load(String name) {
    try {
        return fetch(name);
    } catch (IllegalStateException e) {
        throw new LoadException("cannot load " + name, e);
    }
}
```

## Notes
The starter throws away the only information that identifies the actual
problem. `cannot load missing-config` tells an operator that something failed;
it does not say whether the file was absent, the permissions were wrong, the
disk was full, or the name was malformed. All four produce the same message and
the same empty stack trace below the wrapper.

Passing the cause costs one parameter and preserves everything. A printed stack
trace then carries `Caused by: java.lang.IllegalStateException: no such
resource: missing-config`, with the original frames underneath, so the line
that really failed is still named.

`check(thrown.getCause() != null)` is the check the starter fails, and it is
worth writing that way round rather than only asserting the cause's type — a
null cause would otherwise fail with a `NullPointerException` inside the check,
which reports the symptom rather than the fact.

Two conventions worth carrying:

**Wrap to change the abstraction, not to rename.** `LoadException` is useful
because callers of a loader should not have to know that it uses
`IllegalStateException` internally. Wrapping an exception in another exception
that says the same thing adds a frame and no information.

**Never catch, log and rethrow.** It produces the same failure twice in the log
from different places, and the second copy is usually the one someone reads.
Either handle it, or let it travel and let whoever handles it decide what to
record.
