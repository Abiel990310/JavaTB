---
id: concurrent-index
title: "An index many threads can write"
difficulty: core
chapter: concurrent-collections
topics: [concurrent-collections, atomicity, compound-actions]
check: unit
standard: java21
---

A word index built from many threads at once. Every method must be correct
under concurrent use, and none of them may use `synchronized` or a lock — the
collections provide everything needed.

- `static final class Index`
- `void add(String word, int line)` — records that `word` appears on `line`.
  Repeats of the same line for the same word are kept only once.
- `Set<Integer> linesFor(String word)` — the lines, or an empty set
- `int distinctWords()`
- `long totalOccurrences()` — how many `add` calls recorded something new
- `Map<String, Integer> countsByWord()` — word to number of distinct lines, as
  an ordinary snapshot map
- `void indexAll(List<String> lines, int threads)` — splits the lines across
  `threads` threads, each splitting its lines on whitespace and calling `add`
  with the correct 1-based line number, and returns once all are done

## Starter
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

static final class Index {
    private final Map<String, Set<Integer>> lines = new HashMap<>();
    private int occurrences;

    void add(String word, int line) {
        if (!lines.containsKey(word)) {
            lines.put(word, new HashSet<>());
        }
        if (lines.get(word).add(line)) {
            occurrences++;
        }
    }

    Set<Integer> linesFor(String word) {
        return lines.get(word);
    }

    int distinctWords() {
        return lines.size();
    }

    long totalOccurrences() {
        return occurrences;
    }

    Map<String, Integer> countsByWord() {
        Map<String, Integer> counts = new HashMap<>();
        for (String word : lines.keySet()) {
            counts.put(word, lines.get(word).size());
        }
        return counts;
    }

    void indexAll(List<String> lines, int threads) throws InterruptedException {
        for (int t = 0; t < threads; t++) {
            new Thread(() -> {
                for (int i = 0; i < lines.size(); i++) {
                    for (String word : lines.get(i).split("\\s+")) {
                        add(word, i + 1);
                    }
                }
            }).start();
        }
    }
}
```

## Tests
```java
Index index = new Index();
index.add("the", 1);
index.add("cat", 1);
index.add("the", 2);
index.add("the", 1);                 // a repeat: recorded once

checkEq(index.linesFor("the"), Set.of(1, 2));
checkEq(index.linesFor("cat"), Set.of(1));
checkEq(index.linesFor("missing"), Set.of());
checkEq(index.distinctWords(), 2);
checkEq(index.totalOccurrences(), 3L);
checkEq(index.countsByWord(), Map.of("the", 2, "cat", 1));

// Many threads adding the same word and line: still one entry.
Index hammered = new Index();
Thread[] workers = new Thread[4];
for (int t = 0; t < workers.length; t++) {
    workers[t] = new Thread(() -> {
        for (int i = 0; i < 50_000; i++) {
            hammered.add("shared", 7);
        }
    });
}
for (Thread worker : workers) {
    worker.start();
}
for (Thread worker : workers) {
    worker.join();
}
checkEq(hammered.linesFor("shared"), Set.of(7));
checkEq(hammered.distinctWords(), 1);
checkEq(hammered.totalOccurrences(), 1L);

// Many threads adding different lines of the same word.
Index spread = new Index();
Thread[] adders = new Thread[4];
for (int t = 0; t < adders.length; t++) {
    int base = t * 10_000;
    adders[t] = new Thread(() -> {
        for (int i = 0; i < 10_000; i++) {
            spread.add("word", base + i);
        }
    });
}
for (Thread adder : adders) {
    adder.start();
}
for (Thread adder : adders) {
    adder.join();
}
checkEq(spread.linesFor("word").size(), 40_000);
checkEq(spread.totalOccurrences(), 40_000L);
checkEq(spread.distinctWords(), 1);

// indexAll splits the work and does not double-count.
List<String> text = List.of(
    "the cat sat",
    "the mat",
    "the cat the cat");
Index full = new Index();
full.indexAll(text, 3);
checkEq(full.linesFor("the"), Set.of(1, 2, 3));
checkEq(full.linesFor("cat"), Set.of(1, 3));
checkEq(full.linesFor("sat"), Set.of(1));
checkEq(full.linesFor("mat"), Set.of(2));
checkEq(full.distinctWords(), 4);
checkEq(full.totalOccurrences(), 7L);

Index empty = new Index();
empty.indexAll(List.of(), 2);
checkEq(empty.distinctWords(), 0);
checkEq(empty.totalOccurrences(), 0L);
```

## Hints
- `containsKey` then `put` is the compound action from the chapter.
  `computeIfAbsent` does the pair atomically.
- The inner `Set<Integer>` must be concurrent too, or two threads adding
  different lines for the same word corrupt it.
  `ConcurrentHashMap.newKeySet()` is the concurrent set.
- `occurrences++` is chapter 8.1's lost update. `AtomicLong` or `LongAdder`;
  the tests read the total only after joining, so either works.
- `linesFor` must return an empty set for an unknown word, not `null`.
- `indexAll` gives every thread **all** the lines, so each line is indexed
  `threads` times. Split the range: thread `t` takes lines where
  `i % threads == t`.
- It also never joins. Keep the threads and join them.

## Solution
```java
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

static final class Index {
    private final ConcurrentMap<String, Set<Integer>> lines = new ConcurrentHashMap<>();
    private final LongAdder occurrences = new LongAdder();

    void add(String word, int line) {
        Set<Integer> forWord = lines.computeIfAbsent(word, key -> ConcurrentHashMap.newKeySet());
        if (forWord.add(line)) {
            occurrences.increment();
        }
    }

    Set<Integer> linesFor(String word) {
        Set<Integer> forWord = lines.get(word);
        return forWord == null ? Set.of() : Set.copyOf(forWord);
    }

    int distinctWords() {
        return lines.size();
    }

    long totalOccurrences() {
        return occurrences.sum();
    }

    Map<String, Integer> countsByWord() {
        Map<String, Integer> counts = new HashMap<>();
        lines.forEach((word, forWord) -> counts.put(word, forWord.size()));
        return Map.copyOf(counts);
    }

    void indexAll(List<String> text, int threads) throws InterruptedException {
        Thread[] workers = new Thread[threads];
        for (int t = 0; t < threads; t++) {
            int slice = t;
            workers[t] = new Thread(() -> {
                for (int i = slice; i < text.size(); i += threads) {
                    for (String word : text.get(i).split("\\s+")) {
                        if (!word.isEmpty()) {
                            add(word, i + 1);
                        }
                    }
                }
            });
        }
        for (Thread worker : workers) {
            worker.start();
        }
        for (Thread worker : workers) {
            worker.join();
        }
    }
}
```

## Notes
Three compound actions and one counter, and the starter gets all four wrong.

`containsKey` then `put` is the pair the chapter opened with. Two threads
adding the first occurrence of the same word both see it absent and both
install a fresh set — so one of them is discarded along with whatever was
added to it. `computeIfAbsent` performs the check and the insertion under the
bin's lock, and returns whichever set won.

The **inner** collection matters as much as the outer one, and it is the piece
people forget. A `ConcurrentHashMap<String, HashSet<Integer>>` is a concurrent
map of unsafe sets: the map operations are atomic and the `add` on the value is
not. The `spread` test exists for exactly this — four threads adding forty
thousand distinct lines to one word's set — and a plain `HashSet` there loses
entries or corrupts itself.

`occurrences++` is chapter 8.1 verbatim. Note why `LongAdder` is the right
choice here rather than `AtomicLong`: this counter is written by every thread
on every new occurrence and read once at the end, which is precisely the shape
`LongAdder` is built for.

`indexAll` has two faults, and the first is not about concurrency at all: every
thread iterates *every* line, so three threads index the text three times.
`totalOccurrences` would be 7 anyway, because the sets deduplicate — which is
what makes this bug so easy to ship. Striping by `i % threads` gives each
thread a disjoint slice. The second fault is the missing `join`, so the
assertions run against a half-built index.

One design note on `linesFor`: it returns `Set.copyOf(...)`, a snapshot. A
weakly consistent view of a live set would also be defensible, but a caller
that does `if (!index.linesFor(w).isEmpty())` and then iterates would be
reading two different states. Where a method's result will be used as a value,
hand back a value.
