---
id: truly-immutable-order
title: "Immutable all the way down"
difficulty: core
chapter: immutable-collections
topics: [immutability, records, collections]
check: unit
standard: java21
---

`Order` looks immutable. It is a record, its components are final, and the
list it holds is handed straight back by the accessor.

It is not immutable at all: the caller who built it keeps a reference to the
list, and the caller who receives it can modify what they are given.

Fix it so that neither route works, without changing the constructor's
signature or the accessor's return type.

## Starter
```java
record Order(String id, List<String> lines) { }
```

## Tests
```java
List<String> source = new ArrayList<>(List.of("widget", "gasket"));
Order order = new Order("A1", source);

source.add("sneaked in");
checkEq(order.lines(), List.of("widget", "gasket"));

boolean rejected = false;
try {
    order.lines().add("also sneaked in");
} catch (UnsupportedOperationException e) {
    rejected = true;
}
check(rejected);
checkEq(order.lines(), List.of("widget", "gasket"));

checkEq(order.id(), "A1");
checkEq(order, new Order("A1", List.of("widget", "gasket")));

Order fromImmutable = new Order("B2", List.of("bolt"));
checkEq(fromImmutable.lines(), List.of("bolt"));

boolean nullRejected = false;
try {
    List<String> withNull = new ArrayList<>();
    withNull.add(null);
    new Order("C3", withNull);
} catch (NullPointerException e) {
    nullRejected = true;
}
check(nullRejected);
```

## Hints
- A record's generated constructor assigns the component as it arrives. No copy
  is made anywhere.
- A compact constructor can reassign the parameter before it is stored —
  chapter 2.9's `normalise-on-construction`.
- `List.copyOf(lines)` copies and returns something immutable, which closes
  both routes at once.
- It also rejects null elements, which the last check depends on.

## Solution
```java
record Order(String id, List<String> lines) {
    Order {
        lines = List.copyOf(lines);
    }
}
```

## Notes
Two words, and the record becomes what it appeared to be.

`List.copyOf` in the compact constructor closes both doors from chapter 2.2 in
a single move. The copy means the caller's list is no longer the record's list,
so later additions to it cannot reach in. The copy being *immutable* means the
accessor can hand it out freely, because there is nothing a recipient can do to
it.

That is why no defensive copy is needed in an accessor here, unlike
`defend-the-inventory`, where the field was a mutable array and every getter
had to copy. Making the field immutable once at construction is strictly better
than copying on every read: one allocation instead of one per call, and no
accessor that can be forgotten.

The null rejection is a side effect worth having. `List.copyOf` throws on a
null element, so the compact constructor validates the component without a line
of validation code — and it happens at construction, which is where chapter
2.3 argued invariants belong.

Note the last-but-one check: `new Order("B2", List.of("bolt"))` passes an
already-immutable list, and `List.copyOf` returns it unchanged rather than
allocating. So the defensive copy costs nothing for callers who were already
doing the right thing, which is what makes it reasonable to apply
unconditionally.

The record's generated `equals` compares components with `Objects.equals`, and
`List` implements `equals` by contents — so two orders with equal lines are
equal regardless of which list implementation each holds. That is why the check
comparing against `new Order("A1", List.of(...))` passes.
