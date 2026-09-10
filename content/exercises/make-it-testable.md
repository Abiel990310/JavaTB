---
id: make-it-testable
title: "Make it testable"
difficulty: stretch
chapter: testing
topics: [testing, design, dependency-injection, fakes]
check: unit
standard: java21
---

`OrderService` works and cannot be tested. Every dependency it needs, it
reaches out and takes: the clock, the random number generator, the rate
lookup, and a global mutable log. Rewrite it so every one of them is handed in,
then write the fakes that make exact assertions possible.

- `interface Rates { double rateFor(String currency); }` — throws
  `NoSuchElementException` naming the currency when unknown
- `interface AuditLog { void record(String entry); }`
- `record Order(String id, long amountPence, String currency, Instant placedAt) {}`
- `static final class OrderService` — constructed with everything it needs:
  a `Clock`, a `Rates`, an `AuditLog` and a `LongSupplier` for reference
  numbers
  - `Order place(String currency, long amount)` — converts `amount` in
    `currency` into pence with `Math.round`, stamps it with the clock's
    instant, and gives it an id of `"ORD-" + reference`. It records
    `"placed <id> <pence>p"` in the audit log. An amount of zero or less
    throws `IllegalArgumentException`; an unknown currency propagates the
    `NoSuchElementException`, and nothing is logged in either case.
  - `boolean isExpired(Order order, Duration window)` — true when the clock is
    at or past `placedAt + window`
- `static final class FixedRates implements Rates` — built from a
  `Map<String, Double>`
- `static final class RecordingLog implements AuditLog` — keeps the entries,
  exposes them as an unmodifiable list

## Starter
```java
import java.time.*;
import java.util.function.LongSupplier;

interface Rates {
    double rateFor(String currency);
}

interface AuditLog {
    void record(String entry);
}

record Order(String id, long amountPence, String currency, Instant placedAt) {}

static final class OrderService {
    static final List<String> GLOBAL_LOG = new ArrayList<>();
    private static long nextReference = 1000;

    private static final Map<String, Double> RATES = Map.of("USD", 0.79, "EUR", 0.85);

    Order place(String currency, long amount) {
        double rate = RATES.get(currency);
        long pence = Math.round(amount * rate);
        String id = "ORD-" + (nextReference++);
        GLOBAL_LOG.add("placed " + id + " " + pence + "p");
        return new Order(id, pence, currency, Instant.now());
    }

    boolean isExpired(Order order, Duration window) {
        return Instant.now().isAfter(order.placedAt().plus(window));
    }
}
```

## Tests
```java
import java.time.*;
import java.util.function.LongSupplier;

Rates rates = new FixedRates(Map.of("USD", 0.79, "EUR", 0.85));
Clock clock = Clock.fixed(Instant.parse("2026-03-08T09:15:00Z"), ZoneOffset.UTC);
RecordingLog log = new RecordingLog();
LongSupplier references = new LongSupplier() {
    private long next = 1000;
    public long getAsLong() {
        return next++;
    }
};

OrderService service = new OrderService(clock, rates, log, references);

Order first = service.place("USD", 100);
checkEq(first.id(), "ORD-1000");
checkEq(first.amountPence(), 79L);
checkEq(first.currency(), "USD");
checkEq(first.placedAt(), Instant.parse("2026-03-08T09:15:00Z"));

Order second = service.place("EUR", 200);
checkEq(second.id(), "ORD-1001");
checkEq(second.amountPence(), 170L);

checkEq(log.entries(), List.of("placed ORD-1000 79p", "placed ORD-1001 170p"));
checkThrows(UnsupportedOperationException.class, () -> log.entries().add("forged"));

// Failures are not logged, and do not consume a reference number.
checkThrows(IllegalArgumentException.class, () -> service.place("USD", 0));
checkThrows(IllegalArgumentException.class, () -> service.place("USD", -5));
checkThrows(NoSuchElementException.class, () -> service.place("JPY", 100));
checkEq(log.entries().size(), 2);
checkEq(service.place("USD", 100).id(), "ORD-1002");

// Expiry is decided by the injected clock, so it can be asserted exactly.
Order order = new Order("ORD-9", 100, "USD", Instant.parse("2026-03-08T09:00:00Z"));
check(service.isExpired(order, Duration.ofMinutes(10)));
check(service.isExpired(order, Duration.ofMinutes(15)));      // exactly at the boundary
check(!service.isExpired(order, Duration.ofMinutes(16)));

// A different clock, the same service class: no static state anywhere.
Clock later = Clock.fixed(Instant.parse("2026-03-08T11:00:00Z"), ZoneOffset.UTC);
RecordingLog otherLog = new RecordingLog();
OrderService otherService = new OrderService(later, rates, otherLog,
    new LongSupplier() {
        private long next = 1;
        public long getAsLong() {
            return next++;
        }
    });
Order elsewhere = otherService.place("USD", 100);
checkEq(elsewhere.id(), "ORD-1");
checkEq(elsewhere.placedAt(), Instant.parse("2026-03-08T11:00:00Z"));
checkEq(otherLog.entries(), List.of("placed ORD-1 79p"));
checkEq(log.entries().size(), 3);           // untouched by the other service

// The fake rates behave like the real thing, including the failure.
checkEq(rates.rateFor("USD"), 0.79);
checkThrows(NoSuchElementException.class, () -> rates.rateFor("GBP"));
```

## Hints
- Four things vary: the time, the rates, the log and the reference number.
  Every one becomes a constructor parameter.
- `Instant.now(clock)` and `clock.instant()` both read the injected clock;
  `Instant.now()` reads the machine.
- "At or past" means `!before`, not `isAfter` — the boundary test asserts that
  fifteen minutes exactly counts as expired.
- Validate the amount **and** look up the rate before consuming a reference
  number or writing to the log, or a rejected order leaves a gap in the
  sequence and a line in the audit trail.
- `RATES.get(currency)` on an unknown currency returns `null` and then throws
  `NullPointerException` while unboxing. The interface says
  `NoSuchElementException`, so `FixedRates` must check.
- `RecordingLog.entries()` returns `List.copyOf(...)`, which is both a snapshot
  and unmodifiable.
- `LongSupplier` is a functional interface, so a real implementation can be one
  line — but it must be stateful here, which a lambda cannot be.

## Solution
```java
import java.time.*;
import java.util.function.LongSupplier;

interface Rates {
    double rateFor(String currency);
}

interface AuditLog {
    void record(String entry);
}

record Order(String id, long amountPence, String currency, Instant placedAt) {}

static final class FixedRates implements Rates {
    private final Map<String, Double> rates;

    FixedRates(Map<String, Double> rates) {
        this.rates = Map.copyOf(rates);
    }

    @Override
    public double rateFor(String currency) {
        Double rate = rates.get(currency);
        if (rate == null) {
            throw new NoSuchElementException("no rate for " + currency);
        }
        return rate;
    }
}

static final class RecordingLog implements AuditLog {
    private final List<String> entries = new ArrayList<>();

    @Override
    public void record(String entry) {
        entries.add(entry);
    }

    List<String> entries() {
        return List.copyOf(entries);
    }
}

static final class OrderService {
    private final Clock clock;
    private final Rates rates;
    private final AuditLog log;
    private final LongSupplier references;

    OrderService(Clock clock, Rates rates, AuditLog log, LongSupplier references) {
        this.clock = clock;
        this.rates = rates;
        this.log = log;
        this.references = references;
    }

    Order place(String currency, long amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("amount must be positive: " + amount);
        }
        double rate = rates.rateFor(currency);           // throws before anything is recorded
        long pence = Math.round(amount * rate);
        String id = "ORD-" + references.getAsLong();
        log.record("placed " + id + " " + pence + "p");
        return new Order(id, pence, currency, clock.instant());
    }

    boolean isExpired(Order order, Duration window) {
        return !clock.instant().isBefore(order.placedAt().plus(window));
    }
}
```

## Notes
Every change here is the same change: something the class *took* becomes
something it is *given*.

`Instant.now()` becomes `clock.instant()`, and that single substitution is what
makes `placedAt` assertable at all. With the original, the strongest test
available is "the timestamp is somewhere near now" — an assertion that would
still pass if the code recorded the wrong instant by a minute, or recorded the
*delivery* time instead of the order time. The expiry test is the sharper
example: asserting that a fifteen-minute window expires *exactly* at fifteen
minutes is impossible against a moving clock, and trivial against a fixed one.

`nextReference` as a `static` is two problems at once. It makes the ids depend
on how many tests ran before — order-dependence, the second of the chapter's
three lies — and it makes two services in the same JVM share a counter. The
test that builds a second `OrderService` with its own supplier starting at 1 is
what catches that; with a static, `ORD-1` would have come out as `ORD-1003`.

`GLOBAL_LOG` is the same fault in a more dangerous place. A shared static list
means every test sees every other test's entries, so `log.entries()` grows
until an assertion on its size fails for reasons that have nothing to do with
the test that failed. The final check — `log.entries().size()` still 3 after
the other service placed an order — is the assertion that pins this down.

The **ordering inside `place`** is the subtle part, and the specification
demands it: validate, look up the rate, *then* take a reference number and
write to the log. Do it the other way round and a rejected order still burns
an id and leaves a "placed" line in the audit trail — a bug that is invisible
in production until an auditor asks why order ORD-1042 does not exist. The
tests check both: the reference sequence has no gap, and the log has no extra
line.

`FixedRates` is a **fake**, not a mock: it is a real implementation of the
interface with a simple backing map, so it behaves correctly for every input
including the unknown currency. A mock configured to return 0.79 for `"USD"`
would say nothing about what happens for `"JPY"` unless you also configured
that — and the test that matters most is usually the one you would forget to
configure. Ten lines of fake, reusable across every test in the suite, beats a
stanza of expectations in each one.
