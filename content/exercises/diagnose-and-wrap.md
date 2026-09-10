---
id: diagnose-and-wrap
title: "Wrap it so the next reader can tell"
difficulty: stretch
chapter: debugging
topics: [debugging, exceptions, logging, context]
check: unit
standard: java21
---

A batch importer whose error handling destroys every piece of evidence it
touches. Fix it so that a failure can be diagnosed from the log alone.

The rules the tests enforce:

- **Never swallow.** A failure must reach the caller or the report.
- **Never drop the cause.** Every wrapper carries the original.
- **Add the context the original could not know** — which record, which line.
- **Log the throwable, not its message.**

Build:

- `record Line(int number, String text) {}`
- `static final class ImportFailure extends Exception` — `ImportFailure(String message, Throwable cause)`
- `interface Log { void error(String message, Throwable failure); }`
- `static final class RecordingLog implements Log` — keeps
  `List<String> messages()` and `List<Throwable> failures()`, both unmodifiable
- `static int parseAmount(String text)` — `Integer.parseInt`, but a failure
  becomes `ImportFailure("bad amount: <text>", cause)`
- `static int importLine(Line line)` — parses `line.text()` and returns the
  amount; a failure becomes an `ImportFailure` whose message contains
  `"line " + number` and whose cause chain still ends at the
  `NumberFormatException`
- `static long importAll(List<Line> lines, Log log)` — the total of the lines
  that parsed. Every failing line is logged with `log.error(message, failure)`
  and does **not** abort the batch. The logged message must contain the line
  number.
- `static String diagnose(Throwable failure)` — the root cause's
  `"SimpleName: message"`

## Starter
```java
record Line(int number, String text) {}

static final class ImportFailure extends Exception {
    ImportFailure(String message) {
        super(message);
    }
}

interface Log {
    void error(String message, Throwable failure);
}

static int parseAmount(String text) throws ImportFailure {
    try {
        return Integer.parseInt(text);
    } catch (NumberFormatException e) {
        throw new ImportFailure("bad amount");
    }
}

static int importLine(Line line) throws ImportFailure {
    return parseAmount(line.text());
}

static long importAll(List<Line> lines, Log log) {
    long total = 0;
    for (Line line : lines) {
        try {
            total += importLine(line);
        } catch (Exception e) {
            // keep going
        }
    }
    return total;
}

static String diagnose(Throwable failure) {
    return failure.getMessage();
}
```

## Tests
```java
RecordingLog log = new RecordingLog();

checkEq(parseAmount("42"), 42);
checkEq(parseAmount("-7"), -7);

ImportFailure badAmount = checkThrowsImportFailure(() -> parseAmount("abc"));
checkEq(badAmount.getMessage(), "bad amount: abc");
check(badAmount.getCause() instanceof NumberFormatException);

checkEq(importLine(new Line(3, "10")), 10);
ImportFailure badLine = checkThrowsImportFailure(() -> importLine(new Line(7, "oops")));
check(badLine.getMessage().contains("line 7"));
checkEq(diagnose(badLine).substring(0, "NumberFormatException".length()), "NumberFormatException");
check(diagnose(badLine).contains("oops"));

// The chain is intact all the way down.
check(badLine.getCause() instanceof ImportFailure);
check(badLine.getCause().getCause() instanceof NumberFormatException);

List<Line> batch = List.of(
    new Line(1, "10"),
    new Line(2, "not a number"),
    new Line(3, "20"),
    new Line(4, ""),
    new Line(5, "12"));

checkEq(importAll(batch, log), 42L);

// Both failures were logged, with the line number and the throwable.
checkEq(log.messages().size(), 2);
check(log.messages().get(0).contains("line 2"));
check(log.messages().get(1).contains("line 4"));
checkEq(log.failures().size(), 2);
check(log.failures().get(0) instanceof ImportFailure);
checkEq(diagnose(log.failures().get(0)).substring(0, "NumberFormatException".length()),
        "NumberFormatException");

checkThrows(UnsupportedOperationException.class, () -> log.messages().add("forged"));
checkThrows(UnsupportedOperationException.class, () -> log.failures().add(new RuntimeException()));

// A clean batch logs nothing.
RecordingLog quiet = new RecordingLog();
checkEq(importAll(List.of(new Line(1, "5"), new Line(2, "5")), quiet), 10L);
checkEq(quiet.messages(), List.of());

checkEq(importAll(List.of(), quiet), 0L);
```

## Hints
- `ImportFailure` has no cause-taking constructor, so every throw site loses
  the original. Add `ImportFailure(String, Throwable)` and call
  `super(message, cause)`.
- `"bad amount"` says nothing useful. Include the text that failed.
- `importLine` must wrap again, adding the line number — so the chain is
  `ImportFailure(line 7) -> ImportFailure(bad amount: oops) -> NumberFormatException`.
- `catch (Exception e) { }` is the swallow. Log it *with the throwable*, and
  keep going.
- `diagnose` should walk to the root cause, as in `read-the-trace`, and format
  `SimpleName: message`.
- `checkThrowsImportFailure` is not in the harness — write it yourself in your
  code, as a small helper taking a body that may throw.

## Solution
```java
record Line(int number, String text) {}

static final class ImportFailure extends Exception {
    ImportFailure(String message, Throwable cause) {
        super(message, cause);
    }
}

interface Log {
    void error(String message, Throwable failure);
}

static final class RecordingLog implements Log {
    private final List<String> messages = new ArrayList<>();
    private final List<Throwable> failures = new ArrayList<>();

    @Override
    public void error(String message, Throwable failure) {
        messages.add(message);
        failures.add(failure);
    }

    List<String> messages() {
        return List.copyOf(messages);
    }

    List<Throwable> failures() {
        return List.copyOf(failures);
    }
}

static int parseAmount(String text) throws ImportFailure {
    try {
        return Integer.parseInt(text);
    } catch (NumberFormatException cause) {
        throw new ImportFailure("bad amount: " + text, cause);
    }
}

static int importLine(Line line) throws ImportFailure {
    try {
        return parseAmount(line.text());
    } catch (ImportFailure cause) {
        throw new ImportFailure("line " + line.number() + " could not be imported", cause);
    }
}

static long importAll(List<Line> lines, Log log) {
    long total = 0;
    for (Line line : lines) {
        try {
            total += importLine(line);
        } catch (ImportFailure failure) {
            log.error("skipping line " + line.number(), failure);
        }
    }
    return total;
}

static String diagnose(Throwable failure) {
    Throwable current = failure;
    List<Throwable> seen = new ArrayList<>();
    while (current.getCause() != null) {
        boolean alreadySeen = false;
        for (Throwable link : seen) {
            if (link == current) {
                alreadySeen = true;
                break;
            }
        }
        if (alreadySeen) {
            break;
        }
        seen.add(current);
        current = current.getCause();
    }
    String message = current.getMessage();
    String name = current.getClass().getSimpleName();
    return message == null ? name : name + ": " + message;
}

interface Body {
    void run() throws Exception;
}

static ImportFailure checkThrowsImportFailure(Body body) {
    try {
        body.run();
    } catch (ImportFailure expected) {
        return expected;
    } catch (Exception other) {
        throw new AssertionError("expected ImportFailure but got " + other);
    }
    throw new AssertionError("expected ImportFailure but nothing was thrown");
}
```

## Notes
The starter is what error handling looks like when each layer is written
without thinking about the layer above. Four separate losses, and each one
alone would be enough to make a failure undiagnosable.

**No cause-taking constructor.** `ImportFailure(String)` is a perfectly normal
thing to write and it silently discards the `NumberFormatException`, so the
trace ends at your own `throw`. The original told you the input was `"oops"`
and where in `Integer.parseInt` it gave up; that is now gone. Every custom
exception should have a `(String, Throwable)` constructor, and most should have
it *only* — a wrapper with nothing to wrap is usually a wrapper you did not
need.

**No context.** `"bad amount"` is true of every failing row in the file.
Adding the text turns it into `"bad amount: oops"`, and adding the line number
one layer up turns it into something you can find in the input. The rule worth
remembering: **each layer adds what only it knows.** `parseAmount` knows the
text; it does not know which line it came from. `importLine` knows the line
number; it does not know why the parse failed. Neither can write the whole
message, and together they do.

**The empty catch.** `catch (Exception e) { }` turns a failure into a silently
wrong total, which the tests catch by asserting both the total *and* the log.
Note that continuing after a failure is correct here — a batch importer should
not abandon three thousand good rows because of one bad one — and that
"continue" and "say nothing" are different decisions that an empty block
conflates.

**Logging the message instead of the throwable.** `log.error(message, failure)`
takes both for a reason: the message is for a human scanning, the throwable is
for whoever has to fix it. The test asserting that
`diagnose(log.failures().get(0))` reaches the `NumberFormatException` is really
asserting that the log kept enough to work with. Had `importAll` logged
`failure.getMessage()`, the log would read *"line 2 could not be imported"* and
nothing else — the outermost, least informative link in a chain of three,
which is chapter 9.3's whole point about reading traces from the bottom.

One thing the solution does not do: catch `Exception`. It catches
`ImportFailure`, which is the failure this loop knows how to handle. A
`RuntimeException` from a bug in the importer itself propagates and stops the
batch, which is right — a batch that quietly skips every row because of a null
pointer in your own code is worse than one that crashes on the first.
