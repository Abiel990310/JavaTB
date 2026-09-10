---
id: design-the-api
title: "Redesign the API"
difficulty: core
chapter: api-design
topics: [api-design, factories, builders, optional, overloads]
check: unit
standard: java21
---

`Duration` here is a small value type with a badly designed surface: a
constructor whose arguments nobody can read, two overloads that resolve in
different ways than anyone expects, a getter that returns `null`, and no
validation. Redesign it.

- `record Span(long seconds)` — an amount of time, validated as non-negative
  with the message `"seconds must not be negative: <n>"`
  - `static Span ofSeconds(long)`, `static Span ofMinutes(long)`,
    `static Span ofHours(long)`, `static Span zero()`
  - `Span plus(Span other)`, `boolean isZero()`
  - `String toString()` giving `"<h>h<m>m<s>s"` with no zero-padding, e.g.
    `"1h2m3s"`, and `"0h0m0s"` for zero
- `static final class Schedule` — built with a builder
  - `Schedule.named(String name)` returns a `Builder`; a blank or `null` name
    throws `IllegalArgumentException`
  - `Builder.every(Span)`, `Builder.startingAfter(Span)`,
    `Builder.retries(int)` — each validating and returning `this`; `retries`
    must not be negative
  - Defaults: `every` one hour, `startingAfter` zero, `retries` 0
  - `Builder.build()` returns a `Schedule`
  - `Schedule` exposes `name()`, `every()`, `startingAfter()`, `retries()`,
    and `String describe()` giving
    `"<name>: every <every>, after <startingAfter>, <retries> retries"`
- `static Optional<Schedule> longestInterval(List<Schedule> schedules)` — the
  schedule with the largest `every`, first one winning a tie, empty for an
  empty list
- `static Span parseSpan(String text)` — accepts `"90s"`, `"5m"`, `"2h"`;
  anything else throws `IllegalArgumentException` naming the input
- Rename the confusable overloads: `Span.ofSeconds` and `Span.ofMinutes`
  replace a single `of(long, boolean)`

## Starter
```java
static final class Span {
    final long seconds;

    Span(long amount, boolean isMinutes) {
        this.seconds = isMinutes ? amount * 60 : amount;
    }

    long get() {
        return seconds;
    }
}

static final class Schedule {
    String name;
    Span every;
    Span startingAfter;
    int retries;

    Schedule(String name, Span every, Span startingAfter, int retries) {
        this.name = name;
        this.every = every;
        this.startingAfter = startingAfter;
        this.retries = retries;
    }

    Schedule longest(List<Schedule> schedules) {
        return schedules.isEmpty() ? null : schedules.get(0);
    }
}

static Span parseSpan(String text) {
    return new Span(Long.parseLong(text), false);
}
```

## Tests
```java
checkEq(Span.ofSeconds(90).seconds(), 90L);
checkEq(Span.ofMinutes(2).seconds(), 120L);
checkEq(Span.ofHours(1).seconds(), 3_600L);
checkEq(Span.zero().seconds(), 0L);
check(Span.zero().isZero());
check(!Span.ofSeconds(1).isZero());

checkEq(Span.ofSeconds(3_723).toString(), "1h2m3s");
checkEq(Span.zero().toString(), "0h0m0s");
checkEq(Span.ofMinutes(90).toString(), "1h30m0s");

checkEq(Span.ofMinutes(1).plus(Span.ofSeconds(30)), Span.ofSeconds(90));
checkEq(Span.ofSeconds(0).plus(Span.zero()), Span.zero());

checkThrows(IllegalArgumentException.class, () -> Span.ofSeconds(-1));
try {
    Span.ofSeconds(-5);
    check(false);
} catch (IllegalArgumentException expected) {
    checkEq(expected.getMessage(), "seconds must not be negative: -5");
}

// Records give equality and hashing for free.
checkEq(Span.ofSeconds(60), Span.ofMinutes(1));
checkEq(Span.ofSeconds(60).hashCode(), Span.ofMinutes(1).hashCode());

Schedule defaults = Schedule.named("nightly").build();
checkEq(defaults.name(), "nightly");
checkEq(defaults.every(), Span.ofHours(1));
checkEq(defaults.startingAfter(), Span.zero());
checkEq(defaults.retries(), 0);
checkEq(defaults.describe(), "nightly: every 1h0m0s, after 0h0m0s, 0 retries");

Schedule configured = Schedule.named("sync")
    .every(Span.ofMinutes(15))
    .startingAfter(Span.ofMinutes(5))
    .retries(3)
    .build();
checkEq(configured.describe(), "sync: every 0h15m0s, after 0h5m0s, 3 retries");

checkThrows(IllegalArgumentException.class, () -> Schedule.named(""));
checkThrows(IllegalArgumentException.class, () -> Schedule.named("   "));
checkThrows(IllegalArgumentException.class, () -> Schedule.named(null));
checkThrows(IllegalArgumentException.class, () -> Schedule.named("x").retries(-1));

checkEq(longestInterval(List.of()), Optional.empty());
Schedule quick = Schedule.named("quick").every(Span.ofMinutes(1)).build();
Schedule slow = Schedule.named("slow").every(Span.ofHours(2)).build();
Schedule alsoSlow = Schedule.named("also").every(Span.ofHours(2)).build();
checkEq(longestInterval(List.of(quick, slow)).map(Schedule::name), Optional.of("slow"));
checkEq(longestInterval(List.of(slow, alsoSlow)).map(Schedule::name), Optional.of("slow"));
checkEq(longestInterval(List.of(quick)).map(Schedule::name), Optional.of("quick"));

checkEq(parseSpan("90s"), Span.ofSeconds(90));
checkEq(parseSpan("5m"), Span.ofMinutes(5));
checkEq(parseSpan("2h"), Span.ofHours(2));
checkThrows(IllegalArgumentException.class, () -> parseSpan("90"));
checkThrows(IllegalArgumentException.class, () -> parseSpan("5x"));
checkThrows(IllegalArgumentException.class, () -> parseSpan(""));
checkThrows(IllegalArgumentException.class, () -> parseSpan("-1s"));
try {
    parseSpan("later");
    check(false);
} catch (IllegalArgumentException expected) {
    check(expected.getMessage().contains("later"));
}
```

## Hints
- `new Span(2, true)` is unreadable at the call site — that is the overload the
  named factories replace.
- A `record Span(long seconds)` gives you `seconds()`, `equals`, `hashCode` and
  a canonical constructor to validate in.
- The compact constructor `Span { ... }` is where the negative check goes, so
  every factory inherits it.
- `Schedule.named(...)` returns the **Builder**, not the `Schedule` — the
  required argument goes on the factory that makes the builder, so it cannot
  be omitted.
- Each setter validates immediately and returns `this`.
- `longestInterval` returns `Optional`, never `null`, and must keep the first
  of two equal maxima — use `>` rather than `>=`.
- `parseSpan` needs at least two characters, a digit prefix and a unit suffix.
  `Long.parseLong` on the prefix throws `NumberFormatException`, which is not
  what the specification asked for; catch it and rethrow.

## Solution
```java
record Span(long seconds) {
    Span {
        if (seconds < 0) {
            throw new IllegalArgumentException("seconds must not be negative: " + seconds);
        }
    }

    static Span ofSeconds(long seconds) {
        return new Span(seconds);
    }

    static Span ofMinutes(long minutes) {
        return new Span(minutes * 60);
    }

    static Span ofHours(long hours) {
        return new Span(hours * 3_600);
    }

    static Span zero() {
        return new Span(0);
    }

    Span plus(Span other) {
        return new Span(seconds + other.seconds());
    }

    boolean isZero() {
        return seconds == 0;
    }

    @Override
    public String toString() {
        return (seconds / 3_600) + "h" + (seconds % 3_600) / 60 + "m" + seconds % 60 + "s";
    }
}

static final class Schedule {
    private final String name;
    private final Span every;
    private final Span startingAfter;
    private final int retries;

    private Schedule(Builder builder) {
        this.name = builder.name;
        this.every = builder.every;
        this.startingAfter = builder.startingAfter;
        this.retries = builder.retries;
    }

    static Builder named(String name) {
        return new Builder(name);
    }

    String name() {
        return name;
    }

    Span every() {
        return every;
    }

    Span startingAfter() {
        return startingAfter;
    }

    int retries() {
        return retries;
    }

    String describe() {
        return name + ": every " + every + ", after " + startingAfter + ", " + retries + " retries";
    }

    static final class Builder {
        private final String name;
        private Span every = Span.ofHours(1);
        private Span startingAfter = Span.zero();
        private int retries;

        private Builder(String name) {
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("name must not be blank");
            }
            this.name = name;
        }

        Builder every(Span every) {
            this.every = Objects.requireNonNull(every, "every");
            return this;
        }

        Builder startingAfter(Span startingAfter) {
            this.startingAfter = Objects.requireNonNull(startingAfter, "startingAfter");
            return this;
        }

        Builder retries(int retries) {
            if (retries < 0) {
                throw new IllegalArgumentException("retries must not be negative: " + retries);
            }
            this.retries = retries;
            return this;
        }

        Schedule build() {
            return new Schedule(this);
        }
    }
}

static Optional<Schedule> longestInterval(List<Schedule> schedules) {
    Schedule best = null;
    for (Schedule schedule : schedules) {
        if (best == null || schedule.every().seconds() > best.every().seconds()) {
            best = schedule;
        }
    }
    return Optional.ofNullable(best);
}

static Span parseSpan(String text) {
    if (text == null || text.length() < 2) {
        throw new IllegalArgumentException("not a span: " + text);
    }
    char unit = text.charAt(text.length() - 1);
    String digits = text.substring(0, text.length() - 1);
    long amount;
    try {
        amount = Long.parseLong(digits);
    } catch (NumberFormatException cause) {
        throw new IllegalArgumentException("not a span: " + text, cause);
    }
    if (amount < 0) {
        throw new IllegalArgumentException("not a span: " + text);
    }
    return switch (unit) {
        case 's' -> Span.ofSeconds(amount);
        case 'm' -> Span.ofMinutes(amount);
        case 'h' -> Span.ofHours(amount);
        default -> throw new IllegalArgumentException("not a span: " + text);
    };
}
```

## Notes
`new Span(2, true)` is the shape this exercise exists to delete. A boolean
parameter is the least readable thing an API can have: at the call site it is
the word `true`, and the reader has to open the declaration to learn what it
means. Named factories move that meaning to where it is read —
`Span.ofMinutes(2)` needs no documentation and cannot be got backwards.

Making `Span` a **record** rather than a class does four things at once. It
gives `seconds()` a name; it makes the type immutable and therefore safely
shareable (chapter 8.2); it provides `equals` and `hashCode`, which is what
makes `checkEq(Span.ofSeconds(60), Span.ofMinutes(1))` pass; and its compact
constructor is a single choke point for validation that every factory goes
through. The starter's class had none of these — two `Span`s with the same
seconds were not equal, which would quietly break any `Map` keyed on one.

The builder's required argument sits on `Schedule.named(...)`, and that is the
whole trick: there is no way to obtain a `Builder` without supplying a name, so
"you forgot the name" is not a runtime error, it is not a state you can reach.
Optional settings have defaults and validate on the way in, so `retries(-1)`
fails at the line that wrote `-1` rather than at `build()` with four candidates.

`longestInterval` returning `Optional` instead of `null` is the change the
compiler enforces for you. The starter's `longest` returned `null` for an empty
list, and every caller that forgot to check got a `NullPointerException` some
distance away. Note also `>` rather than `>=` in the comparison — the
specification says the first of two equal maxima wins, and `>=` silently
returns the last.

`parseSpan` is the boundary. `Long.parseLong` throws `NumberFormatException`,
which is technically an `IllegalArgumentException` subclass and so would pass
the `checkThrows` — but the *message* would be `For input string: "later"`,
which describes `parseLong`'s problem rather than yours. Catching it and
rethrowing with your own message and the original as the cause is chapter 9.3's
rule applied at an API boundary: each layer adds what only it knows, and keeps
what the layer below knew.
