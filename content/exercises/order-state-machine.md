---
id: order-state-machine
title: "Only the legal transitions"
difficulty: core
chapter: enums
topics: [enums, switch, state machines]
check: unit
standard: java21
---

An order moves through states, and only some moves are allowed:

- `NEW` may become `PAID` or `CANCELLED`
- `PAID` may become `SHIPPED` or `REFUNDED`
- `SHIPPED` may become `DELIVERED`
- `DELIVERED`, `CANCELLED` and `REFUNDED` are final — nothing follows them

Write an enum `State` with those six constants and a method
`canMoveTo(State next)` returning whether the move is legal.

Implement it with a **switch expression that has no `default` arm**. The point
is that if a seventh state is ever added, this method must stop compiling.

## Starter
```java
enum State {
    NEW, PAID, SHIPPED, DELIVERED, CANCELLED, REFUNDED;

    boolean canMoveTo(State next) {
        return true;
    }
}
```

## Tests
```java
check(State.NEW.canMoveTo(State.PAID));
check(State.NEW.canMoveTo(State.CANCELLED));
check(!State.NEW.canMoveTo(State.SHIPPED));
check(!State.NEW.canMoveTo(State.NEW));

check(State.PAID.canMoveTo(State.SHIPPED));
check(State.PAID.canMoveTo(State.REFUNDED));
check(!State.PAID.canMoveTo(State.CANCELLED));

check(State.SHIPPED.canMoveTo(State.DELIVERED));
check(!State.SHIPPED.canMoveTo(State.REFUNDED));

check(!State.DELIVERED.canMoveTo(State.SHIPPED));
check(!State.CANCELLED.canMoveTo(State.NEW));
check(!State.REFUNDED.canMoveTo(State.PAID));

for (State from : State.values()) {
    check(!from.canMoveTo(from));
}
```

## Hints
- `switch (this)` inside an enum method, with one arm per constant.
- Several arms return `false` and can share a case: `case DELIVERED, CANCELLED,
  REFUNDED -> false;`.
- An arm can test `next`: `case NEW -> next == PAID || next == CANCELLED;`.
- Inside the enum you can write the constants unqualified — `PAID`, not
  `State.PAID`.

## Solution
```java
enum State {
    NEW, PAID, SHIPPED, DELIVERED, CANCELLED, REFUNDED;

    boolean canMoveTo(State next) {
        return switch (this) {
            case NEW -> next == PAID || next == CANCELLED;
            case PAID -> next == SHIPPED || next == REFUNDED;
            case SHIPPED -> next == DELIVERED;
            case DELIVERED, CANCELLED, REFUNDED -> false;
        };
    }
}
```

## Notes
Four arms cover six states, because the three terminal ones behave identically
and a single case can carry several labels.

The final loop — no state may move to itself — is a property rather than an
example, in the sense `reverse-in-place` used. It holds for all six constants
and would catch an implementation that returned `true` by default, or one that
forgot a `next ==` comparison and simply reported whether a transition existed
at all.

There is no `default`, and that is the requirement rather than a stylistic
choice. Add a `PARTIALLY_REFUNDED` constant and this method stops compiling
with *the switch expression does not cover all possible input values*, which is
the compiler handing you the list of decisions the new state requires. With
`default -> false` it would compile silently, and the new state would be unable
to move anywhere — a bug that reaches production and then reaches a customer.

A table would be the other reasonable implementation: an `EnumMap<State,
EnumSet<State>>` built once, with `canMoveTo` a lookup. It is better when the
rules are numerous or come from configuration, and worse here, because it moves
the rules out of the compiler's sight — a missing entry in the map is a run-time
absence rather than a compile error. The switch is the right choice precisely
while the set of states is small and fixed, which is what an enum means.
