---
id: write-a-collector
title: "Four functions and a result"
difficulty: stretch
chapter: collectors
topics: [collectors, reduction, generics]
check: unit
standard: java21
---

`Collector.of` takes a supplier, an accumulator, a combiner and an optional
finisher. Write four collectors with it, and one method that shows why the
combiner has to exist.

- `static Collector<String, ?, String> initials()` — the first character of
  each element, concatenated; an empty element contributes `'?'`
- `static <T> Collector<T, ?, Optional<T>> lastOf()` — the final element, or
  empty for an empty stream
- `static <T> Collector<T, ?, List<T>> everyOther()` — elements at index 0, 2,
  4… of the stream reaching the collector
- `static <T> Collector<T, ?, Map<Boolean, List<T>>> splitOn(Predicate<T> test)`
  — like `partitioningBy`, both keys always present, each list unmodifiable
- `static <A, R> R combineHalves(List<String> values, Collector<? super String, A, R> collector)`
  — accumulate the first half and the second half into two separate containers,
  merge them with the collector's combiner, and finish. The result must equal
  collecting the whole list in one go.

## Starter
```java
static Collector<String, ?, String> initials() {
    return Collector.of(StringBuilder::new,
        (buffer, s) -> buffer.append(s.charAt(0)),
        StringBuilder::append);
}

static <T> Collector<T, ?, Optional<T>> lastOf() {
    return Collector.of(ArrayList::new, List::add, (a, b) -> a, list -> Optional.empty());
}

static <T> Collector<T, ?, List<T>> everyOther() {
    return Collector.of(ArrayList::new, List::add, (a, b) -> { a.addAll(b); return a; });
}

static <T> Collector<T, ?, Map<Boolean, List<T>>> splitOn(Predicate<T> test) {
    return Collector.of(HashMap::new,
        (map, value) -> map.computeIfAbsent(test.test(value), k -> new ArrayList<>()).add(value),
        (a, b) -> a);
}

static <A, R> R combineHalves(List<String> values, Collector<? super String, A, R> collector) {
    return values.stream().collect(collector);
}
```

## Tests
```java
checkEq(Stream.of("Ada", "Grace", "", "Alan").collect(initials()), "AG?A");
checkEq(Stream.<String>of().collect(initials()), "");
checkEq(Stream.of("solo").collect(initials()), "s");

checkEq(Stream.of("a", "b", "c").collect(lastOf()), Optional.of("c"));
checkEq(Stream.<String>of().collect(lastOf()), Optional.empty());
checkEq(Stream.of(1, 2).collect(lastOf()), Optional.of(2));

checkEq(Stream.of("a", "b", "c", "d", "e").collect(everyOther()), List.of("a", "c", "e"));
checkEq(Stream.<String>of().collect(everyOther()), List.of());
checkEq(Stream.of("only").collect(everyOther()), List.of("only"));

Map<Boolean, List<Integer>> split = Stream.of(1, 2, 3, 4).collect(splitOn(n -> n % 2 == 0));
checkEq(split.get(true), List.of(2, 4));
checkEq(split.get(false), List.of(1, 3));
checkEq(split.size(), 2);

Map<Boolean, List<Integer>> oneSided = Stream.of(1, 3).collect(splitOn(n -> n % 2 == 0));
checkEq(oneSided.get(true), List.of());
checkEq(oneSided.get(false), List.of(1, 3));
checkThrows(UnsupportedOperationException.class, () -> oneSided.get(false).add(9));

Map<Boolean, List<Integer>> empty = Stream.<Integer>of().collect(splitOn(n -> true));
checkEq(empty.get(true), List.of());
checkEq(empty.get(false), List.of());

// The combiner has to produce what one pass would have produced.
List<String> words = List.of("Ada", "Bob", "Cy", "Dee", "Eve", "Fay");
checkEq(combineHalves(words, initials()), "ABCDEF");
checkEq(combineHalves(words, Collectors.joining("-")), "Ada-Bob-Cy-Dee-Eve-Fay");
checkEq(combineHalves(words, Collectors.<String>toList()), words);
checkEq(combineHalves(words, Collectors.<String>counting()), 6L);
checkEq(combineHalves(List.of(), Collectors.joining("-")), "");
```

## Hints
- `initials()` needs a finisher — without one the collector's result type is
  the container, and `StringBuilder` is not a `String`.
- `lastOf` does not need a list at all. A one-element `ArrayList` used as a
  mutable box works, and so does an array of length one; the finisher turns it
  into an `Optional`.
- `everyOther` cannot discard as it goes. Keep every element and pick the even
  positions in the finisher — a container that drops the odd ones loses the
  information a merge would need.
- `splitOn` should seed both keys in the supplier rather than relying on
  `computeIfAbsent`, and freeze the lists in the finisher.
- Every combiner must *merge*, not pick a side. `(a, b) -> a` silently drops
  half the data, and a sequential stream never calls the combiner, so the tests
  are the only thing that will tell you.
- `combineHalves` needs `collector.supplier()`, `.accumulator()`,
  `.combiner()` and `.finisher()` — they are ordinary methods returning the
  four functions.
- The parameter is `Collector<? super String, A, R>`, not
  `Collector<String, A, R>`: `Collectors.joining()` is declared over
  `CharSequence`, and PECS puts the consumer side on `super`.

## Solution
```java
static Collector<String, ?, String> initials() {
    return Collector.of(
        StringBuilder::new,
        (buffer, s) -> buffer.append(s.isEmpty() ? '?' : s.charAt(0)),
        StringBuilder::append,
        StringBuilder::toString);
}

static <T> Collector<T, ?, Optional<T>> lastOf() {
    return Collector.of(
        () -> new ArrayList<T>(1),
        (box, value) -> {
            box.clear();
            box.add(value);
        },
        (a, b) -> b.isEmpty() ? a : b,
        box -> box.isEmpty() ? Optional.empty() : Optional.of(box.get(0)));
}

static <T> Collector<T, ?, List<T>> everyOther() {
    return Collector.of(
        (Supplier<List<T>>) ArrayList::new,
        List::add,
        (a, b) -> {
            a.addAll(b);
            return a;
        },
        seen -> {
            List<T> kept = new ArrayList<>();
            for (int i = 0; i < seen.size(); i += 2) {
                kept.add(seen.get(i));
            }
            return List.copyOf(kept);
        });
}

static <T> Collector<T, ?, Map<Boolean, List<T>>> splitOn(Predicate<T> test) {
    return Collector.of(
        () -> {
            Map<Boolean, List<T>> map = new HashMap<>();
            map.put(true, new ArrayList<>());
            map.put(false, new ArrayList<>());
            return map;
        },
        (map, value) -> map.get(test.test(value)).add(value),
        (a, b) -> {
            a.get(true).addAll(b.get(true));
            a.get(false).addAll(b.get(false));
            return a;
        },
        map -> Map.of(true, List.copyOf(map.get(true)), false, List.copyOf(map.get(false))));
}

static <A, R> R combineHalves(List<String> values, Collector<? super String, A, R> collector) {
    int middle = values.size() / 2;

    A left = collector.supplier().get();
    for (String value : values.subList(0, middle)) {
        collector.accumulator().accept(left, value);
    }

    A right = collector.supplier().get();
    for (String value : values.subList(middle, values.size())) {
        collector.accumulator().accept(right, value);
    }

    return collector.finisher().apply(collector.combiner().apply(left, right));
}
```

## Notes
The finisher is the part people leave out. Without it, `Collector.of` returns a
collector whose result type is the container, so `initials()` would have to be
declared `Collector<String, ?, StringBuilder>` and every caller would have to
call `toString` — which also means every caller learns that a `StringBuilder`
was involved. The `?` in the middle position exists to keep that hidden; a
finisher is what makes the hiding possible.

The combiner is the part people get *wrong*, and the reason is that a
sequential stream never calls it. `(a, b) -> a` passes every ordinary test and
silently discards half the data the first time someone writes `.parallel()`.
That is why `combineHalves` exists in this problem: it calls the four functions
by hand, exactly as a parallel stream would, so a broken combiner fails on a
sequential test. Pulling the functions out with `collector.supplier()` and
friends is not something you will often do, but doing it once makes the
contract concrete — a collector really is just four functions in a box.

`lastOf` shows that the container need not resemble the result. A one-element
list used as a mutable box is a perfectly good accumulator; the accumulator
clears and replaces, so the box holds the most recent element and the finisher
wraps it. Its combiner is `b.isEmpty() ? a : b` — the right-hand container wins
when it saw anything, because it holds later elements.

`everyOther` is the one that will not fold as it goes, and that is why it is
here. The obvious accumulator — count elements, keep the even ones, discard the
rest — cannot be merged. If the left container saw an odd number of elements,
the right container's *odd* local positions are the globally even ones, and it
threw those away. The information needed to combine is exactly the information
the accumulator discarded, so the container has to keep everything and the
finisher has to choose.

That is worth more than the code. An operation that depends on an element's
position does not decompose, which is why `Stream` offers nothing like
`indexOf` and why a positional reduction gets no benefit from being a
collector: you have buffered the whole stream anyway. When you reach this
point, a loop over `List.get(i)` says the same thing in three lines — which is
chapter 6.5's argument.

`splitOn` seeds both keys up front instead of using `computeIfAbsent`. That is
what makes the empty-stream case produce two empty lists rather than an empty
map, and it is how the real `partitioningBy` does it. The finisher's
`List.copyOf` is the defensive copy from chapter 2.2, applied at the last
possible moment — inside the pipeline the lists must stay mutable, because
accumulating into an unmodifiable list is not possible.
