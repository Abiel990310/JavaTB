---
id: checked-or-unchecked
title: "Pick the right kind of failure"
difficulty: core
chapter: checked-exceptions
topics: [exceptions, checked, design]
check: unit
standard: java21
---

A booking service has two failure modes, and they are not the same kind of
thing.

- **The requested seat count is zero or negative.** No caller should ever ask
  for that; it is a bug in the calling code. This must be an **unchecked**
  exception, `InvalidSeatCountException`, extending `IllegalArgumentException`,
  with the message `seats must be positive, got N`.
- **There are not enough seats left.** This happens constantly in normal
  operation and the caller has a real decision to make. This must be a
  **checked** exception, `SoldOutException`, extending `Exception`, with the
  message `only N left`.

Write both, and `book(int available, int wanted)` returning the number of seats
remaining after a successful booking.

The signature of `book` is part of the answer: the checked exception must
appear in its `throws` clause, and the unchecked one must not.

## Starter
```java
static class InvalidSeatCountException extends Exception {
    InvalidSeatCountException(int seats) {
        super("seats must be positive, got " + seats);
    }
}

static class SoldOutException extends RuntimeException {
    SoldOutException(int available) {
        super("only " + available + " left");
    }
}

static int book(int available, int wanted) throws InvalidSeatCountException {
    if (wanted <= 0) {
        throw new InvalidSeatCountException(wanted);
    }
    if (wanted > available) {
        throw new SoldOutException(available);
    }
    return available - wanted;
}
```

## Tests
```java
checkEq(book(10, 3), 7);
checkEq(book(5, 5), 0);

checkThrows(IllegalArgumentException.class, () -> {
    try {
        book(10, 0);
    } catch (SoldOutException e) {
        throw new AssertionError("wrong exception type");
    }
});

boolean caughtSoldOut = false;
try {
    book(2, 5);
} catch (SoldOutException e) {
    caughtSoldOut = true;
    checkEq(e.getMessage(), "only 2 left");
}
check(caughtSoldOut);

check(InvalidSeatCountException.class.getSuperclass() == IllegalArgumentException.class);
check(SoldOutException.class.getSuperclass() == Exception.class);
```

## Hints
- The two exception types are the wrong way round in the starter.
- `InvalidSeatCountException` must extend `IllegalArgumentException` so it is
  unchecked; `SoldOutException` must extend `Exception` so it is checked.
- Once they are swapped, `book`'s `throws` clause has to change too — it now
  declares the checked one and not the unchecked one.
- The checks compare superclasses directly, so guessing will not help.

## Solution
```java
static class InvalidSeatCountException extends IllegalArgumentException {
    InvalidSeatCountException(int seats) {
        super("seats must be positive, got " + seats);
    }
}

static class SoldOutException extends Exception {
    SoldOutException(int available) {
        super("only " + available + " left");
    }
}

static int book(int available, int wanted) throws SoldOutException {
    if (wanted <= 0) {
        throw new InvalidSeatCountException(wanted);
    }
    if (wanted > available) {
        throw new SoldOutException(available);
    }
    return available - wanted;
}
```

## Notes
The starter compiles and works. Every message is right and every branch is
taken at the right moment. What is wrong is what the *signature* tells a
caller, and that is the part a reader relies on.

As written, `throws InvalidSeatCountException` forces every caller to handle a
condition that means their own code is broken — so they wrap the call in a
`try` and write something apologetic in the catch block, and the bug is
absorbed instead of surfacing. Meanwhile `SoldOutException`, the one thing a
booking system genuinely has to deal with on an ordinary Tuesday, is unchecked
and can be forgotten entirely. The compiler is being made to police the wrong
one.

Swapping them puts the obligation where the decision is. A caller must now
acknowledge that seats can run out — the compiler will not let them past it —
and is not troubled about a case that should never occur.

The last two checks compare `getSuperclass()` rather than catching, because
checked-ness is not observable at run time. Both kinds throw and unwind
identically; the entire difference is what the compiler demanded when the code
was written. That is worth sitting with: the checked/unchecked split is a
compile-time contract, and the choice is a statement about who is expected to
respond.
