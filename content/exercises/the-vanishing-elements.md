---
id: the-vanishing-elements
title: "Why did half the set disappear?"
difficulty: core
chapter: set-and-ordering
topics: [TreeSet, comparators, bugs]
check: unit
standard: java21
---

`uniqueSorted` is supposed to return every distinct event, ordered by
timestamp and then by name. It loses events instead.

Fix it so that no distinct event is discarded, keeping the required ordering.

`Event` is given: `record Event(String name, int timestamp) { }`. Two events
are distinct when the record's own `equals` says so — that is, when either
field differs.

## Starter
```java
record Event(String name, int timestamp) { }

static List<Event> uniqueSorted(List<Event> events) {
    Set<Event> set = new TreeSet<>(Comparator.comparingInt(Event::timestamp));
    set.addAll(events);
    return new ArrayList<>(set);
}
```

## Tests
```java
List<Event> sameTime = List.of(
    new Event("open", 100), new Event("close", 100), new Event("save", 50));
checkEq(uniqueSorted(sameTime), List.of(
    new Event("save", 50), new Event("close", 100), new Event("open", 100)));

List<Event> withDuplicates = List.of(
    new Event("tick", 1), new Event("tick", 1), new Event("tock", 2));
checkEq(uniqueSorted(withDuplicates), List.of(new Event("tick", 1), new Event("tock", 2)));

checkEq(uniqueSorted(List.of()), List.of());

List<Event> one = List.of(new Event("only", 7));
checkEq(uniqueSorted(one), List.of(new Event("only", 7)));

List<Event> many = List.of(
    new Event("c", 2), new Event("a", 2), new Event("b", 1), new Event("a", 2));
checkEq(uniqueSorted(many), List.of(
    new Event("b", 1), new Event("a", 2), new Event("c", 2)));
```

## Hints
- The first check expects three events and the starter returns two. Which one
  went, and what did the comparator think of it?
- A `TreeSet` decides two elements are the same when the comparator returns
  zero. It never calls `equals`.
- The comparator must distinguish every pair that `equals` distinguishes. Add
  the name as a tie-break.
- Genuine duplicates — same name *and* same timestamp — must still collapse to
  one, which the second check verifies.

## Solution
```java
record Event(String name, int timestamp) { }

static List<Event> uniqueSorted(List<Event> events) {
    Set<Event> set = new TreeSet<>(
        Comparator.comparingInt(Event::timestamp).thenComparing(Event::name));
    set.addAll(events);
    return new ArrayList<>(set);
}
```

## Notes
`comparingInt(Event::timestamp)` returns zero for `open@100` and `close@100`,
so the `TreeSet` concludes they are the same element and keeps the first. No
exception, no warning, and a returned list that is a plausible-looking subset
of the right answer — which is the worst kind of wrong, because nothing about
the output announces that anything is missing.

Adding `.thenComparing(Event::name)` makes the comparator agree with `equals`
about which events are distinct: it returns zero exactly when both fields
match, which is exactly when the record's `equals` returns true. Now the set
keeps every distinct event and still collapses real duplicates, which the
second check confirms.

The specification's phrase for the requirement is *ordering consistent with
equals*: `compare(a, b) == 0` should hold precisely when `a.equals(b)`. It is
recommended rather than enforced, so nothing checks it, and the failure mode is
silent data loss rather than an error.

The same trap applies to `TreeMap`. A map keyed with a comparator on one field
overwrites entries whose keys differ only in another, and since `put` returns
the displaced value, the information that something was overwritten is
available and almost never looked at.

A useful habit: when writing a comparator for a sorted collection, finish it
with a tie-break on something unique — an id, a name, anything that cannot
repeat. It costs one comparison and removes the whole class of problem.
