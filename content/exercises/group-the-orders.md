---
id: group-the-orders
title: "Reports from a list of orders"
difficulty: core
chapter: collectors
topics: [collectors, groupingBy, toMap]
check: unit
standard: java21
---

Five reports over the same list, each a single `collect`.

The record is given:

```java
record Order(String id, String customer, String region, int cents, boolean paid) {}
```

Write:

- `static Map<String, Long> countByRegion(List<Order> orders)`
- `static Map<String, Integer> totalByCustomer(List<Order> orders)` — the sum
  of `cents`, in a `TreeMap` so the customers come out alphabetically
- `static Map<Boolean, List<String>> idsByPaid(List<Order> orders)` — order ids
  split into paid and unpaid, with **both keys present even when one side is
  empty**
- `static Map<String, Order> largestPerRegion(List<Order> orders)` — the
  highest-value order in each region; on a tie, the one appearing first
- `static String receipt(List<Order> orders)` — the ids of the unpaid orders,
  comma-separated, wrapped in `"unpaid: "` and `"."`, in the order given.
  With no unpaid orders it must be exactly `"unpaid: ."`

A `region` may be `null`, meaning unknown; group those under `"unknown"`.

## Starter
```java
record Order(String id, String customer, String region, int cents, boolean paid) {}

static Map<String, Long> countByRegion(List<Order> orders) {
    return orders.stream().collect(Collectors.groupingBy(Order::region, Collectors.counting()));
}

static Map<String, Integer> totalByCustomer(List<Order> orders) {
    return orders.stream().collect(
        Collectors.groupingBy(Order::customer, Collectors.summingInt(Order::cents)));
}

static Map<Boolean, List<String>> idsByPaid(List<Order> orders) {
    return orders.stream().collect(
        Collectors.groupingBy(Order::paid, Collectors.mapping(Order::id, Collectors.toList())));
}

static Map<String, Order> largestPerRegion(List<Order> orders) {
    return orders.stream().collect(Collectors.toMap(Order::region, o -> o));
}

static String receipt(List<Order> orders) {
    return orders.stream()
        .filter(o -> !o.paid())
        .map(Order::id)
        .reduce("unpaid: ", (a, b) -> a + b + ",") + ".";
}
```

## Tests
```java
List<Order> orders = List.of(
    new Order("A1", "ada", "north", 500, true),
    new Order("A2", "grace", "south", 900, false),
    new Order("A3", "ada", "north", 250, false),
    new Order("A4", "alan", null, 900, true),
    new Order("A5", "grace", "south", 100, true));

checkEq(countByRegion(orders), Map.of("north", 2L, "south", 2L, "unknown", 1L));
checkEq(countByRegion(List.of()), Map.of());

Map<String, Integer> totals = totalByCustomer(orders);
checkEq(totals, Map.of("ada", 750, "alan", 900, "grace", 1000));
checkEq(new ArrayList<>(totals.keySet()), List.of("ada", "alan", "grace"));

checkEq(idsByPaid(orders).get(true), List.of("A1", "A4", "A5"));
checkEq(idsByPaid(orders).get(false), List.of("A2", "A3"));

// Both keys exist even when everything is on one side.
Map<Boolean, List<String>> allPaid = idsByPaid(List.of(orders.get(0)));
checkEq(allPaid.get(true), List.of("A1"));
checkEq(allPaid.get(false), List.of());
checkEq(allPaid.size(), 2);

Map<String, Order> largest = largestPerRegion(orders);
checkEq(largest.get("north").id(), "A1");
checkEq(largest.get("south").id(), "A2");
checkEq(largest.get("unknown").id(), "A4");
checkEq(largest.size(), 3);

// A tie keeps the first one seen.
List<Order> tied = List.of(
    new Order("T1", "ada", "east", 100, true),
    new Order("T2", "ada", "east", 100, true));
checkEq(largestPerRegion(tied).get("east").id(), "T1");

checkEq(receipt(orders), "unpaid: A2,A3.");
checkEq(receipt(List.of(orders.get(0))), "unpaid: .");
checkEq(receipt(List.of()), "unpaid: .");
```

## Hints
- A `null` region kills `groupingBy` outright. Map it first — a helper
  `static String regionOf(Order o)` returning
  `Objects.requireNonNullElse(o.region(), "unknown")` keeps every pipeline
  clean.
- `groupingBy` returns a `HashMap`; the alphabetical requirement needs the
  three-argument form with `TreeMap::new`, which needs a declared target type
  to infer against.
- Both-keys-present is `partitioningBy`, not `groupingBy`.
- `toMap` throws on the duplicate region. The three-argument form takes
  `(existing, incoming)` — return the one you want to keep, remembering that a
  tie should keep `existing`.
- `receipt` is `Collectors.joining(",", "unpaid: ", ".")`, which gets the empty
  case right for free.

## Solution
```java
record Order(String id, String customer, String region, int cents, boolean paid) {}

static String regionOf(Order order) {
    return Objects.requireNonNullElse(order.region(), "unknown");
}

static Map<String, Long> countByRegion(List<Order> orders) {
    return orders.stream().collect(
        Collectors.groupingBy(Main::regionOf, Collectors.counting()));
}

static Map<String, Integer> totalByCustomer(List<Order> orders) {
    TreeMap<String, Integer> totals = orders.stream().collect(
        Collectors.groupingBy(Order::customer, TreeMap::new,
            Collectors.summingInt(Order::cents)));
    return totals;
}

static Map<Boolean, List<String>> idsByPaid(List<Order> orders) {
    return orders.stream().collect(
        Collectors.partitioningBy(Order::paid,
            Collectors.mapping(Order::id, Collectors.toList())));
}

static Map<String, Order> largestPerRegion(List<Order> orders) {
    return orders.stream().collect(Collectors.toMap(
        Main::regionOf,
        order -> order,
        (existing, incoming) -> incoming.cents() > existing.cents() ? incoming : existing));
}

static String receipt(List<Order> orders) {
    return orders.stream()
        .filter(order -> !order.paid())
        .map(Order::id)
        .collect(Collectors.joining(",", "unpaid: ", "."));
}
```

## Notes
Every one of the starter's five bodies is a plausible first draft, and each
fails for a reason worth carrying forward.

`countByRegion` throws `NullPointerException` — not from the record, from
`groupingBy`, which refuses a null key even though the `HashMap` underneath
would take one. The stack trace points into `Collectors`, which is confusing
until you have met it once. The fix is to make the key total before grouping,
and factoring that into `regionOf` means the same decision is written down once
rather than repeated in three pipelines with a chance to disagree.

`totalByCustomer` produces the right numbers in a `HashMap`, so `keySet()` is
in hash order — which for three short strings may well *look* alphabetical, and
then stop being so the day a fourth customer appears. The test pins the key
order for exactly that reason. Note the shape of the fix: the three-argument
`groupingBy` will not infer `TreeMap` from a `return` statement in some
contexts, so assigning to a declared `TreeMap<String, Integer>` first is the
reliable spelling.

`idsByPaid` looks equivalent to `partitioningBy` and is not. With a
single-sided input, `groupingBy` gives a one-entry map and `get(false)` returns
`null` — an NPE for the caller doing `.size()` on it. `partitioningBy`
guarantees both keys. This is the whole reason `partitioningBy` exists as a
separate method; if it were only "grouping by a boolean" it would be redundant.

`largestPerRegion` throws `IllegalStateException: Duplicate key north`. The
two-argument `toMap` has no policy for collisions and refuses to invent one,
which is a good default — `Map.put` semantics would have kept whichever order
came last and told nobody. Writing the merge function forces you to decide, and
the tie case makes the decision visible: `incoming.cents() > existing.cents()`
keeps `existing` on equality, while `>=` would keep the last. The test catches
the difference.

`receipt` gets the common case right and the empty case wrong: `reduce` leaves
`"unpaid: A2,A3,."` with a trailing comma, and an empty list gives
`"unpaid: ."` only by accident. `joining(",", prefix, suffix)` puts separators
*between* elements, so both cases fall out. It is also the collector-versus-
reduce point from the chapter, in miniature: `joining` appends into a
`StringJoiner` while the `reduce` version builds a new `String` per order.
