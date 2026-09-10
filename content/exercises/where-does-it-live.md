---
id: where-does-it-live
title: "Stop publishing it"
difficulty: stretch
chapter: stack-and-heap
topics: [escape-analysis, encapsulation, allocation]
check: unit
standard: java21
---

Escape analysis is not something you write code for. But *publishing* an object
— returning it, storing it in a field, adding it to a shared collection — is a
decision with both a design cost and a performance cost, and this class makes
every one of those decisions wrong.

`Tracker` records timed samples and answers questions about them. Fix it so
that:

- `record Sample(String name, long micros) {}`
- `void record(String name, long micros)` — appends a sample; a `null` name or
  a negative duration throws `IllegalArgumentException`
- `List<Sample> samples()` — every sample in order, and **the caller must not
  be able to change the tracker through it**
- `Optional<Sample> slowest()` — the slowest sample, first one winning a tie
- `long totalMicros()` — the sum, computed without allocating a `Sample`,
  a `Long`, or a stream
- `Stats summarise(String name)` — count, min, max and total for one name,
  returned as a `record Stats(int count, long min, long max, long total)`;
  for an unseen name, `new Stats(0, 0, 0, 0)`
- `void clear()` — drops every sample, and must not leave any of them reachable
  from the tracker

The class must have **no** `static` mutable state. The starter has some.

## Starter
```java
record Sample(String name, long micros) {}
record Stats(int count, long min, long max, long total) {}

static final class Tracker {
    static Sample lastRecorded;                  // "handy for debugging"
    private final List<Sample> samples = new ArrayList<>();

    void record(String name, long micros) {
        Sample sample = new Sample(name, micros);
        lastRecorded = sample;
        samples.add(sample);
    }

    List<Sample> samples() {
        return samples;
    }

    Optional<Sample> slowest() {
        return samples.stream().max(Comparator.comparingLong(Sample::micros));
    }

    long totalMicros() {
        return samples.stream().map(Sample::micros).reduce(0L, Long::sum);
    }

    Stats summarise(String name) {
        List<Sample> matching = samples.stream()
            .filter(s -> s.name().equals(name))
            .toList();
        return new Stats(matching.size(),
            matching.stream().mapToLong(Sample::micros).min().getAsLong(),
            matching.stream().mapToLong(Sample::micros).max().getAsLong(),
            matching.stream().mapToLong(Sample::micros).sum());
    }

    void clear() {
        samples.clear();
    }
}
```

## Tests
```java
import java.lang.ref.WeakReference;

Predicate<WeakReference<?>> collected = ref -> {
    for (int i = 0; i < 25 && ref.get() != null; i++) {
        System.gc();
        try {
            Thread.sleep(20);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
    return ref.get() == null;
};

Tracker tracker = new Tracker();
checkEq(tracker.samples(), List.of());
checkEq(tracker.slowest(), Optional.empty());
checkEq(tracker.totalMicros(), 0L);
checkEq(tracker.summarise("anything"), new Stats(0, 0, 0, 0));

tracker.record("parse", 30);
tracker.record("render", 90);
tracker.record("parse", 10);
tracker.record("render", 90);

checkEq(tracker.samples().size(), 4);
checkEq(tracker.samples().get(0), new Sample("parse", 30));
checkEq(tracker.totalMicros(), 220L);
checkEq(tracker.slowest(), Optional.of(new Sample("render", 90)));

checkEq(tracker.summarise("parse"), new Stats(2, 10, 30, 40));
checkEq(tracker.summarise("render"), new Stats(2, 90, 90, 180));
checkEq(tracker.summarise("missing"), new Stats(0, 0, 0, 0));

checkThrows(IllegalArgumentException.class, () -> tracker.record(null, 1));
checkThrows(IllegalArgumentException.class, () -> tracker.record("x", -1));
checkEq(tracker.samples().size(), 4);

// The view handed out must not be a way in.
List<Sample> view = tracker.samples();
checkThrows(UnsupportedOperationException.class, () -> view.add(new Sample("sneaky", 1)));
checkEq(tracker.samples().size(), 4);

// A tracker must not be the reason a sample stays alive after clear().
Tracker temporary = new Tracker();
temporary.record("doomed", 5);
WeakReference<Sample> watcher = new WeakReference<>(temporary.samples().get(0));
checkEq(temporary.totalMicros(), 5L);
temporary.clear();
checkEq(temporary.samples(), List.of());
check(collected.test(watcher));

// Two trackers share nothing.
Tracker one = new Tracker();
Tracker two = new Tracker();
one.record("a", 1);
checkEq(two.samples(), List.of());
checkEq(two.slowest(), Optional.empty());
```

## Hints
- `samples()` returning the field is the classic published-collection bug from
  chapter 2.3. `List.copyOf` gives an unmodifiable snapshot.
- The `static Sample lastRecorded` field is shared by every tracker in the JVM
  and keeps the last sample alive forever. It is also why the weak-reference
  test fails after `clear()`. Delete it.
- `totalMicros` is explicitly asked for without a stream: a `long` accumulator
  in a `for` loop over `samples`. `reduce(0L, Long::sum)` boxes every partial
  result.
- `summarise` walks the list four times and throws `NoSuchElementException` on
  an unseen name, because `min()` on an empty `LongStream` has no value. One
  loop with four accumulators answers all four questions and handles the empty
  case naturally.
- `slowest` must return the *first* maximum. `Stream.max` keeps the last
  element that compares greater, so with two equal maxima it may not be the one
  you want — check which, and write a loop if it is not.

## Solution
```java
record Sample(String name, long micros) {}
record Stats(int count, long min, long max, long total) {}

static final class Tracker {
    private final List<Sample> samples = new ArrayList<>();

    void record(String name, long micros) {
        if (name == null) {
            throw new IllegalArgumentException("name");
        }
        if (micros < 0) {
            throw new IllegalArgumentException("micros: " + micros);
        }
        samples.add(new Sample(name, micros));
    }

    List<Sample> samples() {
        return List.copyOf(samples);
    }

    Optional<Sample> slowest() {
        Sample best = null;
        for (Sample sample : samples) {
            if (best == null || sample.micros() > best.micros()) {
                best = sample;
            }
        }
        return Optional.ofNullable(best);
    }

    long totalMicros() {
        long total = 0;
        for (int i = 0; i < samples.size(); i++) {
            total += samples.get(i).micros();
        }
        return total;
    }

    Stats summarise(String name) {
        int count = 0;
        long min = Long.MAX_VALUE;
        long max = Long.MIN_VALUE;
        long total = 0;
        for (Sample sample : samples) {
            if (sample.name().equals(name)) {
                count++;
                min = Math.min(min, sample.micros());
                max = Math.max(max, sample.micros());
                total += sample.micros();
            }
        }
        return count == 0 ? new Stats(0, 0, 0, 0) : new Stats(count, min, max, total);
    }

    void clear() {
        samples.clear();
    }
}
```

## Notes
Four fixes, and every one of them is a design fix that happens to be a
performance fix too.

The `static Sample lastRecorded` field is the worst thing in the starter and
the easiest to defend in a code review — it is one field, it costs nothing, it
helps when debugging. It is also shared by every `Tracker` in the process, so
two trackers are not independent; it is a `GlobalEscape` for every sample ever
recorded, so none of them can ever be scalar-replaced; and it holds the last
sample alive after `clear()`, which is why the weak-reference test fails
without deleting it. "Static" and "escapes" turn out to be the same word.

`samples()` returning the live list is chapter 2.3's defensive-copy argument.
Note the version of it that matters here: the tests do not just check that
adding through the view throws, they check that the tracker is *unchanged*
afterwards. `Collections.unmodifiableList` would also pass the first check and
is a wrapper over the live list, so later changes show through it —
`List.copyOf` takes a snapshot. Which you want depends on whether the caller
should see later samples; for a method named `samples()` returning "the samples
as of now", the snapshot is the honest reading.

`totalMicros` was written with `map(Sample::micros).reduce(0L, Long::sum)`,
which boxes every element and every partial sum: the pipeline's element type is
`Long`, so the running total is a fresh `Long` object per sample. `mapToLong`
would have fixed the boxing and the loop fixes it more plainly. This is
chapter 6.3's measurement showing up in code that does not look numeric.

`summarise` walking the list four times is the ordinary cost of composing
stream operations that each need their own pass; that is usually fine and here
it is not, because `min()` on an empty stream returns an empty `OptionalLong`
and `getAsLong()` throws. The starter's bug is not the four passes, it is that
the four-pass shape made the empty case invisible — there is no single place
where "no matching samples" is handled. The single loop has one.

`slowest` is the subtle one. `Stream.max` is specified to return one of the
maximal elements, and `Comparator.comparingLong` reports equal micros as equal,
so with `render` recorded twice at 90 there is no guarantee which object comes
back. Both are `equal` records here so the test passes either way — but change
`Sample` to hold a timestamp and the two stop being interchangeable, and a
requirement of "first one wins" needs the explicit loop that this solution
writes. When ties matter, say so in code rather than relying on what a stream
happens to do.
