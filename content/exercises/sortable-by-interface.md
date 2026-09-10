---
id: sortable-by-interface
title: "Sort anything that can be ranked"
difficulty: core
chapter: interfaces
topics: [interfaces, polymorphism]
check: unit
standard: java21
---

Write an interface `Ranked` with a single method `rank()` returning an `int`,
and a method `highest(Ranked[] items)` returning the item with the largest
rank.

Then make two unrelated classes implement it:

- `Player(String name, int score)` — its rank is the score
- `Task(String label, int priority)` — its rank is the priority

`highest` must work over a mixed array of both, returning `null` for an empty
array. It must contain no `instanceof` and no cast.

## Starter
```java
interface Ranked {
    int rank();
}

static class Player {
    private final String name;
    private final int score;

    Player(String name, int score) {
        this.name = name;
        this.score = score;
    }

    String name() {
        return name;
    }

    public int rank() {
        return score;
    }
}

static class Task {
    private final String label;
    private final int priority;

    Task(String label, int priority) {
        this.label = label;
        this.priority = priority;
    }

    String label() {
        return label;
    }

    public int rank() {
        return priority;
    }
}

static Ranked highest(Ranked[] items) {
    return null;
}
```

## Tests
```java
Player ada = new Player("Ada", 90);
Player bob = new Player("Bob", 40);
Task urgent = new Task("deploy", 99);
Task later = new Task("tidy", 5);

checkEq(highest(new Ranked[] { ada, bob }), ada);
checkEq(highest(new Ranked[] { bob, ada }), ada);
checkEq(highest(new Ranked[] { ada, urgent, later }), urgent);
checkEq(highest(new Ranked[] { later }), later);
checkEq(highest(new Ranked[] { }), null);

Ranked r = ada;
checkEq(r.rank(), 90);

checkEq(highest(new Ranked[] { bob, later }), bob);
```

## Hints
- `Player` and `Task` each have a `rank()` method already, but neither says it
  implements `Ranked` — so neither can be put in a `Ranked[]`.
- Having the right method is not enough. Java requires the class to declare the
  relationship.
- `highest` is a linear scan keeping the best so far, as in `second-largest`.
  Seed from the first element, not from a sentinel.

## Solution
```java
interface Ranked {
    int rank();
}

static class Player implements Ranked {
    private final String name;
    private final int score;

    Player(String name, int score) {
        this.name = name;
        this.score = score;
    }

    String name() {
        return name;
    }

    @Override
    public int rank() {
        return score;
    }
}

static class Task implements Ranked {
    private final String label;
    private final int priority;

    Task(String label, int priority) {
        this.label = label;
        this.priority = priority;
    }

    String label() {
        return label;
    }

    @Override
    public int rank() {
        return priority;
    }
}

static Ranked highest(Ranked[] items) {
    if (items.length == 0) {
        return null;
    }
    Ranked best = items[0];
    for (Ranked item : items) {
        if (item.rank() > best.rank()) {
            best = item;
        }
    }
    return best;
}
```

## Notes
The starter's classes already have exactly the right method, and it makes no
difference. Java's typing is **nominal**: a class implements an interface
because it says it does, not because its methods happen to line up. Adding
`implements Ranked` is the whole of the fix, and everything else about the
classes stays as it was.

That is a real design decision with costs and benefits. A structurally-typed
language would accept both classes without the declaration, which is convenient
and means a method can satisfy an interface by accident — a `rank()` that meant
"military rank" would be silently eligible. Requiring the declaration means the
author of each class opts in and takes responsibility for keeping the promise.

`checkEq(highest(...), ada)` compares with `equals`, which neither class
overrides — so it is identity comparison, which is right here. These are
entities, not values: two players with the same score are two different people.
Chapter 2.4's distinction, applied.

Seeding `best` from `items[0]` rather than from a sentinel is the habit from
`second-largest`. There is no `int` that cannot be a rank, so any sentinel you
picked would be a value some input is allowed to have.
