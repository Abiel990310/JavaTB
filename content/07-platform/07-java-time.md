---
title: "java.time — the API that finally got dates right"
navTitle: "java.time"
summary: >-
  Immutable, unambiguous, thread-safe — and clear that two days and forty-eight hours are not the same thing.
objectives:
  - Choose between LocalDate, LocalDateTime, Instant and ZonedDateTime
  - Explain why Period and Duration give different answers across a DST change
  - Handle local times that do not exist or happen twice
  - Say what was wrong with Date, Calendar and SimpleDateFormat
status: complete
standard: java21
requires: [files-and-nio]
---

Java 8 replaced the date and time API, and the replacement is one of the best
libraries in the JDK. It is worth understanding *why* it looks the way it does,
because the design answers questions most date libraries never ask.

## What was wrong

```java run title="Two of the old API's greetings"
import java.text.*;
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Calendar calendar = new GregorianCalendar(2026, 1, 15);
        System.out.println("new GregorianCalendar(2026, 1, 15) is "
            + new SimpleDateFormat("yyyy-MM-dd").format(calendar.getTime()));

        Date date = calendar.getTime();
        System.out.println("date now:     " + new SimpleDateFormat("yyyy-MM-dd").format(date));
        date.setTime(0);
        System.out.println("after setTime: " + new SimpleDateFormat("yyyy-MM-dd").format(date));
    }
}
```

Month `1` is February: `Calendar`'s months are zero-based, and its days are
not. And a `Date` is **mutable** — hand one to a method and you have handed
over the right to change it, so every getter returning a `Date` needed a
defensive copy (chapter 2.3) that almost nobody wrote.

There is a third problem, and it is worse:

```java run title="One SimpleDateFormat, eight threads"
import java.text.*;
import java.util.*;
import java.util.concurrent.*;

public class Main {
    public static void main(String[] args) throws Exception {
        SimpleDateFormat shared = new SimpleDateFormat("yyyy-MM-dd");

        Set<String> wrong = ConcurrentHashMap.newKeySet();
        Set<String> threw = ConcurrentHashMap.newKeySet();

        ExecutorService pool = Executors.newFixedThreadPool(8);
        for (int i = 0; i < 20_000; i++) {
            String input = String.format("2026-01-%02d", 1 + (i % 28));
            pool.submit(() -> {
                try {
                    Date parsed = shared.parse(input);
                    String roundTripped = new SimpleDateFormat("yyyy-MM-dd").format(parsed);
                    if (!roundTripped.equals(input)) {
                        wrong.add(input + " came back as " + roundTripped);
                    }
                } catch (Throwable failure) {
                    threw.add(failure.getClass().getSimpleName());
                }
            });
        }
        pool.shutdown();
        pool.awaitTermination(30, TimeUnit.SECONDS);

        System.out.println("parses that came back wrong: " + wrong.size() + " of 20000");
        System.out.println("examples: " + wrong.stream().sorted().limit(3).toList());
        System.out.println("exceptions thrown:           " + threw);
    }
}
```

`SimpleDateFormat` is **not thread-safe**, and it does not say so by failing
cleanly. It keeps a `Calendar` in a field and mutates it while parsing, so two
threads parsing at once corrupt each other's work. On the machine this was
written on, one run turned `2026-01-19` into `1627-06-19` — and thousands of
inputs came back as some other date entirely, alongside
`NumberFormatException` and `ArrayIndexOutOfBoundsException` from inside the
parser.

Your run will report different numbers, and on a single-core machine it might
report none at all. That is exactly what makes the bug dangerous: a static
`SimpleDateFormat` field passes every test and starts producing dates from the
seventeenth century under load.

`java.time`'s types are all immutable, and `DateTimeFormatter` is
consequently thread-safe. A static formatter is not just allowed, it is the
recommended shape.

## Picking a type

| Type | Answers | Use for |
|---|---|---|
| `LocalDate` | 2026-03-08 | a birthday, an invoice date |
| `LocalTime` | 14:30 | opening hours |
| `LocalDateTime` | 2026-03-08T14:30 | a wall-clock appointment, no zone |
| `ZonedDateTime` | that, in `America/New_York` | a meeting someone must attend |
| `OffsetDateTime` | that, at `-05:00` | a timestamp in a wire format |
| `Instant` | a point on the timeline, UTC | when something happened |
| `Duration` | 48 hours | elapsed machine time |
| `Period` | 2 days, 1 month | human calendar amounts |

The distinction that matters: `Instant` is a **point in time** and
`LocalDateTime` is **not**. `2026-03-08T02:30` does not identify a moment until
you say where — and in some places it never happened at all.

```java run title="The basics, and the ones that surprise"
import java.time.*;
import java.time.temporal.*;

public class Main {
    public static void main(String[] args) {
        LocalDate date = LocalDate.of(2026, 1, 31);
        System.out.println("month is 1-based:     " + date.getMonth() + " " + date.getDayOfMonth());
        System.out.println("plusMonths clamps:    " + date.plusMonths(1));
        System.out.println("and in a leap year:   " + LocalDate.of(2024, 1, 31).plusMonths(1));
        System.out.println("immutable:            " + date + " is unchanged");

        try {
            LocalDate.of(2026, 2, 30);
        } catch (DateTimeException refused) {
            System.out.println("February 30th:        " + refused.getMessage());
        }

        System.out.println("days between:         "
            + ChronoUnit.DAYS.between(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 3, 1)));
        System.out.println("as a Period:          "
            + Period.between(LocalDate.of(2026, 1, 31), LocalDate.of(2026, 3, 1)));

        System.out.println("last day of month:    " + date.with(TemporalAdjusters.lastDayOfMonth()));
        System.out.println("next Friday:          "
            + date.with(TemporalAdjusters.next(DayOfWeek.FRIDAY)));
    }
}
```

Months are 1-based, February 30th is refused rather than rolled over, and
`plusMonths` **clamps** — 31 January plus one month is the 28th, or the 29th in
a leap year. Clamping is a choice, and it is not associative: adding a month
then subtracting one does not always get you home. When exact day counts
matter, count days.

## Two days is not forty-eight hours

```java run title="Across a daylight-saving change"
import java.time.*;

public class Main {
    public static void main(String[] args) {
        ZoneId newYork = ZoneId.of("America/New_York");
        ZonedDateTime start = ZonedDateTime.of(2026, 3, 7, 12, 0, 0, 0, newYork);

        System.out.println("start:                " + start);
        System.out.println("plus Period.ofDays(2):" + start.plus(Period.ofDays(2)));
        System.out.println("plus Duration 48h:    " + start.plus(Duration.ofHours(48)));
        System.out.println("plusDays(2):          " + start.plusDays(2));
        System.out.println("plusHours(48):        " + start.plusHours(48));
    }
}
```

Clocks in New York go forward on 8 March 2026. So:

- **`Period.ofDays(2)`** means "the same wall-clock time, two calendar days
  later" — noon becomes noon, and only 47 hours actually elapse.
- **`Duration.ofHours(48)`** means "48 hours of elapsed time" — noon becomes
  one o'clock.

Both are right. The question is which one your requirement means. "The
subscription renews in one month" is a `Period`. "The token expires in 24
hours" is a `Duration`. Getting this backwards produces a bug that appears
twice a year, in one timezone, and cannot be reproduced in July.

Note also that the offset changed from `-05:00` to `-04:00` in the output.
`ZonedDateTime` tracks that for you; `LocalDateTime` cannot, because it does
not know where it is.

## Local times that do not exist, or happen twice

```java run title="The two awkward hours"
import java.time.*;

public class Main {
    public static void main(String[] args) {
        ZoneId newYork = ZoneId.of("America/New_York");

        LocalDateTime springForward = LocalDateTime.of(2026, 3, 8, 2, 30);
        System.out.println("asked for:  " + springForward);
        System.out.println("got:        " + springForward.atZone(newYork));

        LocalDateTime fallBack = LocalDateTime.of(2026, 11, 1, 1, 30);
        System.out.println("asked for:  " + fallBack);
        System.out.println("got:        " + fallBack.atZone(newYork));
        System.out.println("  earlier:  " + fallBack.atZone(newYork).withEarlierOffsetAtOverlap());
        System.out.println("  later:    " + fallBack.atZone(newYork).withLaterOffsetAtOverlap());
    }
}
```

02:30 on 8 March **never happens** in New York — the clock jumps from 02:00 to
03:00. `atZone` does not throw; it moves the time forward by the size of the
gap, giving 03:30. And 01:30 on 1 November happens **twice**, once at `-04:00`
and once at `-05:00`; `atZone` picks the earlier by default, and
`withLaterOffsetAtOverlap()` asks for the other.

Neither behaviour is a default you should rely on silently. If your application
schedules things at wall-clock times, these two hours a year are where the
bugs live, and the fix is to decide explicitly which offset you meant.

## Formatting, and testable clocks

```java run title="Immutable formatters and an injected clock"
import java.time.*;
import java.time.format.*;

public class Main {
    // Safe as a static field, unlike SimpleDateFormat.
    static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    static String receiptFor(String item, Clock clock) {
        return item + " at " + LocalDateTime.now(clock).format(STAMP);
    }

    public static void main(String[] args) {
        LocalDate date = LocalDate.parse("2026-03-08");
        System.out.println("parsed ISO:        " + date);
        System.out.println("ISO output:        " + date);
        System.out.println("custom pattern:    " + date.format(DateTimeFormatter.ofPattern("d MMM yyyy")));
        System.out.println("Instant to string: " + Instant.ofEpochSecond(0));

        try {
            LocalDate.parse("08/03/2026");
        } catch (DateTimeParseException refused) {
            System.out.println("wrong format:      " + refused.getMessage());
        }

        Clock fixed = Clock.fixed(Instant.parse("2026-03-08T09:15:00Z"), ZoneOffset.UTC);
        System.out.println(receiptFor("one coffee", fixed));
        System.out.println(receiptFor("one coffee", fixed) + "   (same every run)");
    }
}
```

`toString()` on every `java.time` type is ISO-8601, and `parse` reads ISO-8601,
so a round trip needs no formatter at all. Reach for `DateTimeFormatter` when
a human is reading the output — and keep it in a `static final` field, which is
safe precisely because the type is immutable.

`Clock` is the piece people miss. `LocalDateTime.now()` with no argument reads
the system clock and makes the method untestable; `now(clock)` takes it as a
parameter, and `Clock.fixed` makes the test deterministic. Every `now()` in
`java.time` has an overload taking a `Clock`, and that is not an accident — it
is the API telling you that reading the time is a dependency like any other.

## Rules of thumb

- Store timestamps as `Instant` (or a UTC `OffsetDateTime` on the wire). Never
  store a `LocalDateTime` and hope everyone agrees which zone it meant.
- Convert to a zone only when a human is going to read it.
- Use `LocalDate` for things that are genuinely dates — a birthday is not an
  instant, and it does not shift when you fly.
- Use `Period` for calendar amounts and `Duration` for elapsed time.
- Take a `Clock` parameter wherever the current time matters.
- Never use `Date`, `Calendar` or `SimpleDateFormat` in new code.
  `Date.toInstant()` and `Date.from(Instant)` convert at the boundary with old
  APIs.

:::quiz
{
  "question": "A subscription starting at noon on 7 March 2026 in New York must renew \"in two days\". Clocks go forward on the 8th. `plus(Period.ofDays(2))` gives noon on the 9th; `plus(Duration.ofHours(48))` gives 1pm. Which is right?",
  "options": [
    { "text": "`Period.ofDays(2)` — a human calendar amount keeps the wall-clock time, which is what \"in two days\" means to a subscriber", "correct": true, "why": "Right. Period is calendar arithmetic; Duration is elapsed time. Only 47 hours actually pass, and that is the correct answer for a subscription." },
    { "text": "`Duration.ofHours(48)` — two days is defined as 48 hours, so elapsed time is always the accurate measure", "correct": false, "why": "That definition is what breaks across a DST change; a subscriber expecting renewal at noon gets it at one o'clock." },
    { "text": "Neither — you must convert to `Instant` first and add 172800 seconds", "correct": false, "why": "That is the Duration answer spelled differently, and it has the same off-by-an-hour result." },
    { "text": "Both, since ZonedDateTime normalises the offset either way", "correct": false, "why": "It does track the offset, which is why the two results differ by an hour rather than silently agreeing." }
  ]
}
:::

## Practice

:::exercise time-arithmetic

:::exercise schedule-across-zones

:::recap
- `Date` is mutable and zero-month-based; `SimpleDateFormat` is not
  thread-safe and corrupts results silently under load. `java.time` is
  immutable throughout, so `DateTimeFormatter` is safe as a static field.
- `Instant` is a point in time; `LocalDateTime` is a wall-clock reading with no
  zone and is not a moment until you attach one.
- `Period` is calendar arithmetic (same wall-clock time, later date);
  `Duration` is elapsed time. Across a DST change they differ.
- `plusMonths` clamps: 31 January plus a month is 28 or 29 February.
- A local time can fail to exist (`atZone` shifts it forward) or happen twice
  (`atZone` takes the earlier; `withLaterOffsetAtOverlap` takes the other).
- `toString` and `parse` are ISO-8601 by default, so round trips need no
  formatter.
- Take a `Clock` where the current time matters; `Clock.fixed` makes the test
  deterministic.
