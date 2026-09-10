---
id: time-arithmetic
title: "Period or Duration"
difficulty: core
chapter: java-time
topics: [java-time, dates, durations]
check: unit
standard: java21
---

Five calculations, each of which the starter gets wrong by picking the other
one.

- `static LocalDate nextBillingDate(LocalDate start, int monthsElapsed)` — the
  same day of the month, `monthsElapsed` months later, clamped to the last day
  when that day does not exist
- `static Instant tokenExpiry(Instant issued, int hours)` — exactly `hours` of
  elapsed time after `issued`
- `static ZonedDateTime sameTimeTomorrow(ZonedDateTime when)` — the same
  wall-clock time on the next calendar day, in the same zone
- `static long nightsBetween(LocalDate arrival, LocalDate departure)` — hotel
  nights; the same day is 0, and a departure before arrival throws
  `IllegalArgumentException`
- `static String describeGap(LocalDate from, LocalDate to)` — the gap as
  `"Ny Nm Nd"`, omitting any zero component, or `"same day"` when there is no
  gap. `to` is never before `from`.

## Starter
```java
static LocalDate nextBillingDate(LocalDate start, int monthsElapsed) {
    return start.plusDays(30L * monthsElapsed);
}

static Instant tokenExpiry(Instant issued, int hours) {
    return issued.plus(Period.ofDays(hours / 24));
}

static ZonedDateTime sameTimeTomorrow(ZonedDateTime when) {
    return when.plus(Duration.ofHours(24));
}

static long nightsBetween(LocalDate arrival, LocalDate departure) {
    return Period.between(arrival, departure).getDays();
}

static String describeGap(LocalDate from, LocalDate to) {
    return ChronoUnit.DAYS.between(from, to) + "d";
}
```

## Tests
```java
import java.time.*;
import java.time.temporal.ChronoUnit;

checkEq(nextBillingDate(LocalDate.of(2026, 1, 15), 1), LocalDate.of(2026, 2, 15));
checkEq(nextBillingDate(LocalDate.of(2026, 1, 31), 1), LocalDate.of(2026, 2, 28));
checkEq(nextBillingDate(LocalDate.of(2024, 1, 31), 1), LocalDate.of(2024, 2, 29));
checkEq(nextBillingDate(LocalDate.of(2026, 1, 31), 3), LocalDate.of(2026, 4, 30));
checkEq(nextBillingDate(LocalDate.of(2026, 1, 15), 0), LocalDate.of(2026, 1, 15));
checkEq(nextBillingDate(LocalDate.of(2026, 1, 15), 12), LocalDate.of(2027, 1, 15));

Instant issued = Instant.parse("2026-03-07T17:00:00Z");
checkEq(tokenExpiry(issued, 24), Instant.parse("2026-03-08T17:00:00Z"));
checkEq(tokenExpiry(issued, 1), Instant.parse("2026-03-07T18:00:00Z"));
checkEq(tokenExpiry(issued, 0), issued);

ZoneId newYork = ZoneId.of("America/New_York");
ZonedDateTime beforeChange = ZonedDateTime.of(2026, 3, 7, 12, 0, 0, 0, newYork);
ZonedDateTime tomorrow = sameTimeTomorrow(beforeChange);
checkEq(tomorrow.toLocalDate(), LocalDate.of(2026, 3, 8));
checkEq(tomorrow.toLocalTime(), LocalTime.of(12, 0));
// Only 23 hours actually elapsed, because the clocks went forward.
checkEq(Duration.between(beforeChange.toInstant(), tomorrow.toInstant()).toHours(), 23L);

ZonedDateTime ordinary = ZonedDateTime.of(2026, 6, 1, 12, 0, 0, 0, newYork);
checkEq(sameTimeTomorrow(ordinary).toLocalDate(), LocalDate.of(2026, 6, 2));
checkEq(Duration.between(ordinary.toInstant(), sameTimeTomorrow(ordinary).toInstant()).toHours(), 24L);

checkEq(nightsBetween(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 4)), 3L);
checkEq(nightsBetween(LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 1)), 0L);
checkEq(nightsBetween(LocalDate.of(2026, 1, 15), LocalDate.of(2026, 3, 1)), 45L);
checkThrows(IllegalArgumentException.class,
    () -> nightsBetween(LocalDate.of(2026, 5, 4), LocalDate.of(2026, 5, 1)));

checkEq(describeGap(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 1)), "same day");
checkEq(describeGap(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 5)), "4d");
checkEq(describeGap(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 3, 1)), "2m");
checkEq(describeGap(LocalDate.of(2026, 1, 1), LocalDate.of(2027, 3, 5)), "1y 2m 4d");
checkEq(describeGap(LocalDate.of(2026, 1, 31), LocalDate.of(2026, 3, 1)), "1m 1d");
```

## Hints
- Months are not 30 days. `plusMonths` exists and already clamps.
- An `Instant` has no calendar, so `Instant.plus(Period)` throws — a `Duration`
  is the only thing you can add to one.
- "The same wall-clock time tomorrow" is calendar arithmetic: `plusDays(1)`, or
  `plus(Period.ofDays(1))`. Adding 24 hours gives 1pm on a spring-forward day.
- `Period.getDays()` is the *day component* of a year/month/day breakdown, not
  the total. `Period.between(Jan 1, Mar 1).getDays()` is 0. For a total, use
  `ChronoUnit.DAYS.between`.
- `describeGap` wants the components, so `Period.between` is right there —
  `getYears()`, `getMonths()`, `getDays()`.
- Build the description by collecting non-zero parts into a list and
  `String.join(" ", parts)`.

## Solution
```java
static LocalDate nextBillingDate(LocalDate start, int monthsElapsed) {
    return start.plusMonths(monthsElapsed);
}

static Instant tokenExpiry(Instant issued, int hours) {
    return issued.plus(Duration.ofHours(hours));
}

static ZonedDateTime sameTimeTomorrow(ZonedDateTime when) {
    return when.plusDays(1);
}

static long nightsBetween(LocalDate arrival, LocalDate departure) {
    if (departure.isBefore(arrival)) {
        throw new IllegalArgumentException("departure " + departure + " is before arrival " + arrival);
    }
    return ChronoUnit.DAYS.between(arrival, departure);
}

static String describeGap(LocalDate from, LocalDate to) {
    Period gap = Period.between(from, to);
    List<String> parts = new ArrayList<>();
    if (gap.getYears() != 0) {
        parts.add(gap.getYears() + "y");
    }
    if (gap.getMonths() != 0) {
        parts.add(gap.getMonths() + "m");
    }
    if (gap.getDays() != 0) {
        parts.add(gap.getDays() + "d");
    }
    return parts.isEmpty() ? "same day" : String.join(" ", parts);
}
```

## Notes
Each starter picks the wrong side of the `Period`/`Duration` line, and each
wrong answer is wrong in a different way.

`plusDays(30 * months)` is the classic. It gives the right answer for exactly
one month of the year and drifts by a day or two every month after — a
subscription started on the 15th of January bills on the 14th of February, the
16th of March, and so on. `plusMonths` does calendar arithmetic and clamps, so
31 January plus one month is the 28th (or 29th), and plus three is 30 April.

`Instant.plus(Period)` does not merely give a wrong answer — it throws
`UnsupportedTemporalTypeException`, because an `Instant` has no calendar and
therefore no notion of a day. That is the API refusing to guess, and it is the
clearest possible statement of the distinction: elapsed time is the only kind
of arithmetic a point on the timeline supports.

`sameTimeTomorrow` adding 24 hours is the bug that appears twice a year. The
test pins it down from both directions: on a normal day the two answers agree
and 24 hours elapse, and across the spring change the correct answer is noon
with only **23** hours elapsed. If your requirement says "tomorrow at the same
time", 23 hours is the right amount of elapsed time.

`nightsBetween` using `Period.getDays()` is the subtlest. `Period` is a
year/month/day *breakdown*, so `Period.between(15 January, 1 March).getDays()`
is `14` — the day component after a month and a half — not `45`. Anyone
reaching for `Period` to get a day count is asking the wrong object;
`ChronoUnit.DAYS.between` gives totals. The two APIs sit next to each other in
the same package and answer completely different questions.

`describeGap` is the case where `Period` *is* right, because the output wants
the breakdown. Note `1m 1d` for 31 January to 1 March: `Period` counts a whole
month to 28 February and then one day, which is the same clamping rule as
`plusMonths` seen from the other side. Consistency here is not a coincidence —
`from.plus(Period.between(from, to))` always equals `to`, which is the property
the whole design is built to preserve.
