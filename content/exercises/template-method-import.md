---
id: template-method-import
title: "Fix the sequence, vary the steps"
difficulty: stretch
chapter: abstract-classes
topics: [abstract, template method, design]
check: unit
standard: java21
---

Two importers read a line of data and turn it into a normalised record. They
share a sequence and differ in one step each.

Every import does exactly this, in this order:

1. strip leading and trailing whitespace from the line
2. split it into fields — **this part differs**
3. join the fields with `|`
4. prefix the result with the source name and a colon — **the name differs**

So a CSV importer given `"  a,b,c  "` produces `csv:a|b|c`, and a
tab-separated importer given `"\tx\ty\t"` produces… whatever step 2 yields for
that input, joined and prefixed.

Write an abstract `Importer` that fixes the sequence in a `final` method
`importLine(String)`, and two concrete subclasses `CsvImporter` and
`TsvImporter` supplying the two varying steps.

Do not let a subclass change the order of the steps.

## Starter
```java
abstract static class Importer {
    final String importLine(String line) {
        return null;
    }
}

static class CsvImporter extends Importer {
}

static class TsvImporter extends Importer {
}
```

## Tests
```java
Importer csv = new CsvImporter();
checkEq(csv.importLine("  a,b,c  "), "csv:a|b|c");
checkEq(csv.importLine("one"), "csv:one");
checkEq(csv.importLine("  x,y  "), "csv:x|y");

Importer tsv = new TsvImporter();
checkEq(tsv.importLine("a\tb\tc"), "tsv:a|b|c");
checkEq(tsv.importLine("  p\tq  "), "tsv:p|q");

Importer[] all = { csv, tsv };
checkEq(all[0].importLine("1,2"), "csv:1|2");
checkEq(all[1].importLine("1\t2"), "tsv:1|2");
```

## Hints
- Two things vary, so the abstract class needs two abstract methods: one
  returning the source name, one splitting a line into a `String[]`.
- `importLine` does the stripping, calls the two abstract methods, and joins —
  in that fixed order.
- `String.join("|", parts)` joins an array with a separator.
- `split` takes a regular expression, so a tab is `"\t"` and a comma is `","`.

## Solution
```java
abstract static class Importer {
    abstract String sourceName();

    abstract String[] splitFields(String line);

    final String importLine(String line) {
        String[] fields = splitFields(line.strip());
        return sourceName() + ":" + String.join("|", fields);
    }
}

static class CsvImporter extends Importer {
    @Override
    String sourceName() {
        return "csv";
    }

    @Override
    String[] splitFields(String line) {
        return line.split(",");
    }
}

static class TsvImporter extends Importer {
    @Override
    String sourceName() {
        return "tsv";
    }

    @Override
    String[] splitFields(String line) {
        return line.split("\t");
    }
}
```

## Notes
This is the **template method** shape: the parent owns the algorithm and the
children own the steps. What makes it a template method rather than ordinary
inheritance is that `importLine` is `final` — the sequence is part of the
contract, not a default a subclass may quietly rearrange.

That matters more than it looks. Without `final`, a subclass could override
`importLine` to skip the stripping, and every caller would still be told it
had an `Importer`. Marking the skeleton final and the steps abstract states
exactly which parts are negotiable.

Two design details worth noticing:

**The stripping happens in the parent, once.** Had each subclass been left to
strip its own input, the two would eventually disagree about whether stripping
happens before or after splitting — and the bug would appear only for inputs
with leading whitespace, only in one importer.

**Both varying parts became abstract methods, not constructor parameters.**
`sourceName()` could have been a `String` passed to `super(...)`, and for a
value this simple that would be a reasonable alternative. The method form pays
off when the value depends on the subclass's own state, or when a further
subclass wants to compute it — a `DatedCsvImporter` could return
`"csv-" + date` without the parent knowing anything about dates.

An interface with default methods could almost express this, and cannot quite:
`importLine` would have to be a `default` method, and a default method cannot
be `final`. The sequence would then be a suggestion. That is one of the
clearest cases where the abstract class is the right tool.
