---
id: snapshot-not-view
title: "A getter that cannot change under the caller"
difficulty: core
chapter: the-framework
topics: [collections, immutability, defensive copying]
check: unit
standard: java21
---

`Playlist` returns its tracks through `Collections.unmodifiableList`, which
looks defensive and is not: the caller cannot modify the list they are given,
but they watch it change every time the playlist does.

Fix `tracks()` so the returned list is a **snapshot** — fixed at the moment it
was called, unaffected by anything the playlist does afterwards.

`add` must keep working, and the returned list must still reject modification.

## Starter
```java
static class Playlist {
    private final List<String> tracks = new ArrayList<>();

    void add(String track) {
        tracks.add(track);
    }

    List<String> tracks() {
        return Collections.unmodifiableList(tracks);
    }

    int size() {
        return tracks.size();
    }
}
```

## Tests
```java
Playlist p = new Playlist();
p.add("one");
p.add("two");

List<String> snapshot = p.tracks();
checkEq(snapshot, List.of("one", "two"));

p.add("three");
checkEq(snapshot, List.of("one", "two"));
checkEq(p.tracks(), List.of("one", "two", "three"));
checkEq(p.size(), 3);

List<String> first = p.tracks();
List<String> second = p.tracks();
checkEq(first, second);

boolean rejected = false;
try {
    p.tracks().add("sneaky");
} catch (UnsupportedOperationException e) {
    rejected = true;
}
check(rejected);
checkEq(p.size(), 3);

Playlist empty = new Playlist();
checkEq(empty.tracks(), List.of());
```

## Hints
- The second check is the one that fails: `snapshot` was taken before
  `"three"` was added and should not contain it.
- `Collections.unmodifiableList` wraps the same list. It copies nothing.
- `List.copyOf` takes a copy and the copy is immutable, which satisfies both
  requirements at once.

## Solution
```java
static class Playlist {
    private final List<String> tracks = new ArrayList<>();

    void add(String track) {
        tracks.add(track);
    }

    List<String> tracks() {
        return List.copyOf(tracks);
    }

    int size() {
        return tracks.size();
    }
}
```

## Notes
`Collections.unmodifiableList` answers a different question than the one most
people are asking when they reach for it. It answers "can the recipient change
this?" — no. It does not answer "will this change?" — which is the question
that matters when the caller intends to hold onto the value, iterate it later,
or compare it against something.

The failing check makes the difference concrete. A caller who takes
`p.tracks()`, adds a track, and then looks at their list again finds something
they did not put there. If they were iterating it on another thread while the
playlist changed, they would get a `ConcurrentModificationException` — chapter
4.6's subject — from a list they were told was unmodifiable.

`List.copyOf` gets both properties in one call: a copy, so later changes cannot
reach it, and immutable, so the caller cannot change it either. It is the
right default for returning a collection from a getter.

The cost is a copy per call, and it is worth naming rather than ignoring. For a
playlist of a few hundred strings it is nothing. For a large collection read in
a loop it is the dominant cost, and the answer then is the same as chapter
2.2's: stop handing the collection out. Offer `size()`, `contains(track)`, or
an `Iterable` view — whatever the caller actually wanted — and copy nothing.

Note that `List.copyOf` returns the *same* immutable list when handed one that
is already immutable, so a chain of copies costs nothing extra. It also rejects
`null` elements, which is worth knowing before adding one to the backing list.
