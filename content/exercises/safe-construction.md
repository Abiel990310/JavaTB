---
id: safe-construction
title: "Fix the half-built object"
difficulty: stretch
chapter: inheritance
topics: [inheritance, constructors]
check: unit
standard: java21
---

`Report` builds a header when it is constructed, using a title that subclasses
supply by overriding `title()`. It does not work: every subclass gets a header
saying `null`.

Fix it so the header is correct, keeping the same public surface —
`header()` must still return the finished header, and `DatedReport` must still
supply its own title.

You may change either class. There is more than one correct answer.

## Starter
```java
static class Report {
    private final String header;

    Report() {
        this.header = "== " + title() + " ==";
    }

    String title() {
        return "report";
    }

    String header() {
        return header;
    }
}

static class DatedReport extends Report {
    private final String date;

    DatedReport(String date) {
        super();
        this.date = date;
    }

    @Override
    String title() {
        return "report for " + date;
    }
}
```

## Tests
```java
DatedReport d = new DatedReport("2026-01-01");
checkEq(d.header(), "== report for 2026-01-01 ==");
checkEq(d.title(), "report for 2026-01-01");

Report plain = new Report();
checkEq(plain.header(), "== report ==");

Report viewedAsReport = d;
checkEq(viewedAsReport.header(), "== report for 2026-01-01 ==");

DatedReport second = new DatedReport("2026-06-30");
checkEq(second.header(), "== report for 2026-06-30 ==");
checkEq(d.header(), "== report for 2026-01-01 ==");
```

## Hints
- `Report`'s constructor calls `title()`, which dispatches to `DatedReport`'s
  override — before `date` has been assigned.
- The header cannot be computed at construction time if it depends on data the
  subclass has not set yet.
- Compute it when it is asked for instead of when the object is built.
- If you want to keep caching it, the cache has to be filled lazily, on the
  first call to `header()`.

## Solution
```java
static class Report {
    Report() {
    }

    String title() {
        return "report";
    }

    String header() {
        return "== " + title() + " ==";
    }
}

static class DatedReport extends Report {
    private final String date;

    DatedReport(String date) {
        super();
        this.date = date;
    }

    @Override
    String title() {
        return "report for " + date;
    }
}
```

## Notes
The starter is the canonical version of the trap: a constructor calling an
overridable method. Construction runs outside-in, so `Report`'s constructor
finishes before `DatedReport`'s field initialisers and constructor body run.
Dispatch still selects the override — the object's type is already
`DatedReport` — and that override reads `date`, which is still `null`.

The fix here removes the timing problem rather than working around it: compute
the header when it is requested, by which point the object is fully built.
Deriving a value on demand instead of caching it at construction is usually the
right first answer, and it is cheaper than it looks because most such values
are read once or not at all.

Two other correct answers, worth knowing:

**Make `title()` final and pass the data up.** If `DatedReport` calls
`super(date)` and `Report` stores it, no override is needed and the header can
be built in the constructor safely. This is the strongest fix, because it
removes the possibility rather than avoiding it — but it changes the parent's
constructor signature.

**Cache lazily.** Keep a `private String header` field, and have `header()`
compute and store it the first time it is called. That preserves the caching
and defers it past construction. Note the field can no longer be `final`, which
is a real cost: a lazily-filled field is one more thing that can be observed
half-initialised, particularly by another thread — Part 8's subject.

The last two checks are there so that a fix which computes the header once into
a `static` field, or otherwise shares state between instances, cannot pass.
