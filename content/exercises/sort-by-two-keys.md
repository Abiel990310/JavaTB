---
id: sort-by-two-keys
title: "Sort by one key, then another"
difficulty: intro
chapter: set-and-ordering
topics: [comparators, sorting]
check: unit
standard: java21
---

Write `rank(List<Player> players)`, sorting the list **in place** by score
descending, breaking ties by name ascending and ignoring case.

`Player` is given: `record Player(String name, int score) { }`.

So a player with 90 comes before one with 80, and two players on 80 are
ordered `alice` before `Bob`.

The starter sorts by score ascending with no tie-break.

## Starter
```java
record Player(String name, int score) { }

static void rank(List<Player> players) {
    players.sort(Comparator.comparingInt(Player::score));
}
```

## Tests
```java
List<Player> players = new ArrayList<>(List.of(
    new Player("Bob", 80), new Player("Zoe", 90), new Player("alice", 80)));
rank(players);
checkEq(players, List.of(new Player("Zoe", 90), new Player("alice", 80), new Player("Bob", 80)));

List<Player> ties = new ArrayList<>(List.of(
    new Player("carol", 50), new Player("Alice", 50), new Player("bob", 50)));
rank(ties);
checkEq(ties, List.of(new Player("Alice", 50), new Player("bob", 50), new Player("carol", 50)));

List<Player> one = new ArrayList<>(List.of(new Player("solo", 1)));
rank(one);
checkEq(one, List.of(new Player("solo", 1)));

List<Player> empty = new ArrayList<>();
rank(empty);
checkEq(empty, List.of());

List<Player> descending = new ArrayList<>(List.of(
    new Player("a", 1), new Player("b", 3), new Player("c", 2)));
rank(descending);
checkEq(descending, List.of(new Player("b", 3), new Player("c", 2), new Player("a", 1)));
```

## Hints
- `reversed()` flips everything built before it, so where you put it decides
  whether the name tie-break is reversed too.
- Reverse the score comparator first, then add the tie-break:
  `comparingInt(Player::score).reversed().thenComparing(...)`.
- For the case-insensitive name, `thenComparing(Player::name,
  String.CASE_INSENSITIVE_ORDER)` takes a key extractor and a comparator for
  that key.

## Solution
```java
record Player(String name, int score) { }

static void rank(List<Player> players) {
    players.sort(Comparator.comparingInt(Player::score)
                           .reversed()
                           .thenComparing(Player::name, String.CASE_INSENSITIVE_ORDER));
}
```

## Notes
The position of `reversed()` is the whole exercise. Written the other way —
`comparingInt(Player::score).thenComparing(Player::name).reversed()` — it
reverses the *combined* comparator, so the names come out descending too, and
the second check fails with `carol` first.

Read a comparator chain as building one object left to right: each call wraps
what came before. `reversed()` wraps everything so far; `thenComparing` adds a
tie-break to everything so far. So put `reversed()` immediately after the part
you want reversed.

`String.CASE_INSENSITIVE_ORDER` is a ready-made `Comparator<String>` in the JDK,
and using it is better than `thenComparing(p -> p.name().toLowerCase())` for
two reasons: it allocates nothing per comparison, and it does not depend on the
default locale — the Turkish-I problem from chapter 2.4, which
`toLowerCase()` without an explicit locale would reintroduce here.

`List.sort` is stable, so elements the comparator calls equal keep their
original relative order. That is why a missing tie-break can appear to work:
the first check would pass with no `thenComparing` at all, purely because
`alice` happened to come after `Bob` in the input. The second check exists to
remove that luck, with three names whose input order is not the answer.
