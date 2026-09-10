---
id: schedule-across-zones
title: "A meeting everyone can attend"
difficulty: stretch
chapter: java-time
topics: [java-time, time-zones, clock, dst]
check: unit
standard: java21
---

Scheduling is where every date bug lives. Build a small scheduler that stores
instants, renders them per attendee, and refuses to guess about the two
awkward hours a year.

- `record Meeting(String title, Instant start, Duration length) {}`
- `static Meeting schedule(String title, LocalDateTime wallClock, ZoneId zone, Duration length)`
  — builds a `Meeting` from a wall-clock time in the organiser's zone. If that
  local time **does not exist** there, throw `IllegalArgumentException` whose
  message contains `"does not exist"`. If it is **ambiguous**, throw one
  containing `"ambiguous"`.
- `static String render(Meeting meeting, ZoneId viewer)` — the meeting's start
  in the viewer's zone, formatted `yyyy-MM-dd HH:mm` followed by a space and
  the zone's short offset, e.g. `2026-03-08 09:15 -05:00`
- `static boolean overlaps(Meeting a, Meeting b)` — do the two intervals share
  any instant? Touching end-to-start does not count.
- `static List<Meeting> onDay(List<Meeting> meetings, LocalDate day, ZoneId zone)`
  — the meetings that *start* on `day` as seen from `zone`, in start order
- `static Meeting nextAfter(List<Meeting> meetings, Clock clock)` — the
  earliest meeting starting strictly after `clock`'s instant, or `null`

## Starter
```java
record Meeting(String title, Instant start, Duration length) {}

static Meeting schedule(String title, LocalDateTime wallClock, ZoneId zone, Duration length) {
    return new Meeting(title, wallClock.toInstant(ZoneOffset.UTC), length);
}

static String render(Meeting meeting, ZoneId viewer) {
    return meeting.start().toString();
}

static boolean overlaps(Meeting a, Meeting b) {
    return a.start().equals(b.start());
}

static List<Meeting> onDay(List<Meeting> meetings, LocalDate day, ZoneId zone) {
    return meetings;
}

static Meeting nextAfter(List<Meeting> meetings, Clock clock) {
    return meetings.isEmpty() ? null : meetings.get(0);
}
```

## Tests
```java
import java.time.*;
import java.time.format.DateTimeFormatter;

ZoneId newYork = ZoneId.of("America/New_York");
ZoneId london = ZoneId.of("Europe/London");
ZoneId tokyo = ZoneId.of("Asia/Tokyo");

Meeting standup = schedule("standup",
    LocalDateTime.of(2026, 6, 1, 9, 15), newYork, Duration.ofMinutes(30));

checkEq(standup.start(), Instant.parse("2026-06-01T13:15:00Z"));
checkEq(render(standup, newYork), "2026-06-01 09:15 -04:00");
checkEq(render(standup, london), "2026-06-01 14:15 +01:00");
checkEq(render(standup, tokyo), "2026-06-01 22:15 +09:00");
checkEq(render(standup, ZoneOffset.UTC), "2026-06-01 13:15 Z");

// Winter in New York is -05:00.
Meeting winter = schedule("winter",
    LocalDateTime.of(2026, 1, 5, 9, 15), newYork, Duration.ofMinutes(30));
checkEq(render(winter, newYork), "2026-01-05 09:15 -05:00");

// 02:30 on 2026-03-08 never happens in New York.
checkThrows(IllegalArgumentException.class, () -> schedule("gap",
    LocalDateTime.of(2026, 3, 8, 2, 30), newYork, Duration.ofMinutes(30)));
try {
    schedule("gap", LocalDateTime.of(2026, 3, 8, 2, 30), newYork, Duration.ofMinutes(30));
    check(false);
} catch (IllegalArgumentException expected) {
    check(expected.getMessage().contains("does not exist"));
}

// 01:30 on 2026-11-01 happens twice.
try {
    schedule("overlap", LocalDateTime.of(2026, 11, 1, 1, 30), newYork, Duration.ofMinutes(30));
    check(false);
} catch (IllegalArgumentException expected) {
    check(expected.getMessage().contains("ambiguous"));
}

// The same wall-clock time is fine in a zone with no such transition.
Meeting fine = schedule("fine",
    LocalDateTime.of(2026, 3, 8, 2, 30), tokyo, Duration.ofMinutes(30));
checkEq(render(fine, tokyo), "2026-03-08 02:30 +09:00");

Meeting a = new Meeting("a", Instant.parse("2026-06-01T10:00:00Z"), Duration.ofHours(1));
Meeting b = new Meeting("b", Instant.parse("2026-06-01T10:30:00Z"), Duration.ofHours(1));
Meeting c = new Meeting("c", Instant.parse("2026-06-01T11:00:00Z"), Duration.ofHours(1));
Meeting d = new Meeting("d", Instant.parse("2026-06-01T09:00:00Z"), Duration.ofHours(4));

check(overlaps(a, b));
check(overlaps(b, a));
check(!overlaps(a, c));          // a ends exactly when c starts
check(!overlaps(c, a));
check(overlaps(a, d));           // d contains a
check(overlaps(d, a));
check(overlaps(a, a));

// A meeting at 22:15 in New York is the next day in London.
Meeting late = schedule("late",
    LocalDateTime.of(2026, 6, 1, 22, 15), newYork, Duration.ofMinutes(30));
List<Meeting> all = List.of(late, standup, a);

checkEq(onDay(all, LocalDate.of(2026, 6, 1), newYork).stream().map(Meeting::title).toList(),
        List.of("a", "standup", "late"));
checkEq(onDay(all, LocalDate.of(2026, 6, 2), newYork).stream().map(Meeting::title).toList(),
        List.of());
checkEq(onDay(all, LocalDate.of(2026, 6, 2), london).stream().map(Meeting::title).toList(),
        List.of("late"));
checkEq(onDay(List.of(), LocalDate.of(2026, 6, 1), newYork), List.of());

Clock early = Clock.fixed(Instant.parse("2026-06-01T00:00:00Z"), ZoneOffset.UTC);
Clock midday = Clock.fixed(Instant.parse("2026-06-01T13:15:00Z"), ZoneOffset.UTC);
Clock late2 = Clock.fixed(Instant.parse("2026-06-02T23:00:00Z"), ZoneOffset.UTC);

checkEq(nextAfter(all, early).title(), "a");
checkEq(nextAfter(all, midday).title(), "late");     // standup starts exactly now
checkEq(nextAfter(all, late2), null);
checkEq(nextAfter(List.of(), early), null);
```

## Hints
- `zone.getRules().getValidOffsets(localDateTime)` returns a list: **empty**
  for a time in a gap, **one** offset normally, **two** when the time is
  ambiguous. That is the whole check.
- `LocalDateTime.toInstant(ZoneOffset.UTC)` ignores the zone you were given —
  use `wallClock.atZone(zone).toInstant()` once you have confirmed the offset
  is unique.
- `render` wants `meeting.start().atZone(viewer)` and a `DateTimeFormatter`.
  Pattern letters: `XXX` prints `+01:00` and a literal `Z` for a zero offset,
  which is what the tests expect; `xxx` prints `+00:00` there instead.
- Interval overlap: `a.start < b.end && b.start < a.end`, with `Instant`'s
  `isBefore`. Touching intervals fail both halves.
- `onDay` needs each meeting's start converted to a `LocalDate` **in the given
  zone**, then sorting by `start()`.
- `nextAfter` compares against `clock.instant()`, strictly after, and wants the
  minimum — `Comparator.comparing(Meeting::start)`.

## Solution
```java
record Meeting(String title, Instant start, Duration length) {}

static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm XXX");

static Meeting schedule(String title, LocalDateTime wallClock, ZoneId zone, Duration length) {
    List<ZoneOffset> offsets = zone.getRules().getValidOffsets(wallClock);
    if (offsets.isEmpty()) {
        throw new IllegalArgumentException(wallClock + " does not exist in " + zone);
    }
    if (offsets.size() > 1) {
        throw new IllegalArgumentException(wallClock + " is ambiguous in " + zone + ": " + offsets);
    }
    return new Meeting(title, wallClock.atZone(zone).toInstant(), length);
}

static String render(Meeting meeting, ZoneId viewer) {
    return meeting.start().atZone(viewer).format(STAMP);
}

static boolean overlaps(Meeting a, Meeting b) {
    Instant aEnd = a.start().plus(a.length());
    Instant bEnd = b.start().plus(b.length());
    return a.start().isBefore(bEnd) && b.start().isBefore(aEnd);
}

static List<Meeting> onDay(List<Meeting> meetings, LocalDate day, ZoneId zone) {
    List<Meeting> found = new ArrayList<>();
    for (Meeting meeting : meetings) {
        if (meeting.start().atZone(zone).toLocalDate().equals(day)) {
            found.add(meeting);
        }
    }
    found.sort(Comparator.comparing(Meeting::start));
    return List.copyOf(found);
}

static Meeting nextAfter(List<Meeting> meetings, Clock clock) {
    Instant now = clock.instant();
    Meeting best = null;
    for (Meeting meeting : meetings) {
        if (meeting.start().isAfter(now) && (best == null || meeting.start().isBefore(best.start()))) {
            best = meeting;
        }
    }
    return best;
}
```

## Notes
The record stores an `Instant`, and that single decision removes most of the
difficulty. A meeting happens at a moment; the wall-clock time it appears at is
a rendering choice per attendee, and the tests show the same meeting reading as
09:15, 14:15 and 22:15 without anything being converted twice. A scheduler that
stored `LocalDateTime` would have to carry the organiser's zone alongside it
and re-derive the instant every time — which is the design that produces
"the meeting moved by an hour" tickets every March.

`getValidOffsets` is the API worth remembering. Its three possible sizes are
exactly the three cases a local time can be in, and it is the only way to ask
without guessing. `atZone` never throws: for a gap it silently shifts forward
and for an overlap it silently picks the earlier offset, which is a reasonable
default for displaying a time and a terrible one for *accepting* one from a
user. This exercise refuses both, because a scheduler that quietly moves a
meeting to 03:30 has made a decision the organiser did not.

`overlaps` is the standard interval test, and the two `!overlaps` assertions
are the ones that catch a wrong implementation: `a` ending exactly when `c`
starts must not count, which `isBefore` gives you and `!isAfter` would not.
Note it works on `Instant` only — comparing wall-clock times across zones would
be meaningless, and the type system quietly prevents it because a `Meeting` has
no wall-clock field to compare.

`onDay` is where the zone argument earns its place. `late` starts at 22:15 in
New York, which is 03:15 the next morning in London, so the same meeting is on
the 1st for one attendee and the 2nd for another. Both answers are correct;
"which day is this meeting on" is not a question with a single answer, and the
signature says so by requiring a zone.

`nextAfter` takes a `Clock` rather than calling `Instant.now()`, which is what
makes those four assertions possible at all. The `midday` clock is set to
exactly `standup`'s start, and the expected answer is the *next* one — strictly
after, not at or after. That is a boundary you can only test with a clock you
control, which is the argument for injecting one.
