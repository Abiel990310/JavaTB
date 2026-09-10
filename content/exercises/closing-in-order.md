---
id: closing-in-order
title: "Close them, and in the right order"
difficulty: intro
chapter: try-with-resources
topics: [try-with-resources, AutoCloseable]
check: unit
standard: java21
---

`Tracker` records every open and close into a shared log so the order can be
checked.

Write `run(List<String> log)` which:

1. opens a `Tracker` named `outer`, then one named `inner`
2. appends `"work"` to the log
3. lets both close automatically

Use try-with-resources. Do not call `close()` yourself.

Then write `runFailing(List<String> log)`, which does the same but throws
`IllegalStateException("failed")` instead of appending `"work"` — and lets the
exception escape. Both trackers must still close.

## Starter
```java
static class Tracker implements AutoCloseable {
    private final String name;
    private final List<String> log;

    Tracker(String name, List<String> log) {
        this.name = name;
        this.log = log;
        log.add("open " + name);
    }

    @Override
    public void close() {
        log.add("close " + name);
    }
}

static void run(List<String> log) {
    Tracker outer = new Tracker("outer", log);
    Tracker inner = new Tracker("inner", log);
    log.add("work");
}

static void runFailing(List<String> log) {
    Tracker outer = new Tracker("outer", log);
    Tracker inner = new Tracker("inner", log);
    throw new IllegalStateException("failed");
}
```

## Tests
```java
List<String> log = new ArrayList<>();
run(log);
checkEq(log, List.of("open outer", "open inner", "work", "close inner", "close outer"));

List<String> failLog = new ArrayList<>();
boolean threw = false;
try {
    runFailing(failLog);
} catch (IllegalStateException e) {
    threw = true;
    checkEq(e.getMessage(), "failed");
}
check(threw);
checkEq(failLog, List.of("open outer", "open inner", "close inner", "close outer"));
```

## Hints
- The starter never closes anything — the log ends after `"work"`.
- Move both declarations into the parentheses of a `try`, separated by a
  semicolon.
- Resources close in reverse order, which is what the expected log says: inner
  before outer.
- The failing version needs no `catch` at all. try-with-resources closes on the
  way out whether the block ends normally or by exception.

## Solution
```java
static class Tracker implements AutoCloseable {
    private final String name;
    private final List<String> log;

    Tracker(String name, List<String> log) {
        this.name = name;
        this.log = log;
        log.add("open " + name);
    }

    @Override
    public void close() {
        log.add("close " + name);
    }
}

static void run(List<String> log) {
    try (Tracker outer = new Tracker("outer", log);
         Tracker inner = new Tracker("inner", log)) {
        log.add("work");
    }
}

static void runFailing(List<String> log) {
    try (Tracker outer = new Tracker("outer", log);
         Tracker inner = new Tracker("inner", log)) {
        throw new IllegalStateException("failed");
    }
}
```

## Notes
`runFailing` has no `catch` and no `finally`, and still closes both trackers
before the exception leaves the method. That is the entire proposition: cleanup
is attached to the *declaration* rather than to any particular exit path, so
there is no exit path that can miss it.

The reverse order is not arbitrary. `inner` was created after `outer` and may
depend on it — a writer wrapping a stream, a statement belonging to a
connection — so unwinding in the opposite order guarantees that nothing is
closed while something still using it is open. The same rule governs local
variables going out of scope in languages with destructors.

Note that `close()` here appends to a log rather than throwing, so this problem
does not exercise suppression. The next one does. A `close()` that can fail is
the case where hand-written cleanup goes from verbose to actively harmful.

The checks compare `List` values with `checkEq`, which works because `List.of`
and `ArrayList` both implement `equals` by contents — unlike arrays, whose
default `equals` is identity, as chapter 1.5 showed. Lists are Part 4's
subject; they appear here because comparing a sequence of log lines is what the
problem needs.
