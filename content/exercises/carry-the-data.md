---
id: carry-the-data
title: "An exception a handler can act on"
difficulty: core
chapter: checked-exceptions
topics: [exceptions, design]
check: unit
standard: java21
---

A handler that can only read a message string has to parse English to do
anything useful. Give the exception the data instead.

Write `RateLimitException`, a checked exception carrying:

- `retryAfterSeconds()` — how long the caller should wait
- `limit()` — the number of requests allowed per window

Its message must read `rate limit of N requests exceeded, retry in M seconds`.

Then write `call(int requestsMade, int limit)` which throws it when
`requestsMade` is at or above the limit, and otherwise returns the number of
requests remaining. The retry delay is `requestsMade - limit + 1` seconds, so a
caller one over the limit waits one second.

## Starter
```java
static class RateLimitException extends Exception {
    RateLimitException(String message) {
        super(message);
    }
}

static int call(int requestsMade, int limit) throws RateLimitException {
    if (requestsMade >= limit) {
        throw new RateLimitException("rate limited");
    }
    return limit - requestsMade;
}
```

## Tests
```java
checkEq(call(3, 10), 7);
checkEq(call(0, 5), 5);
checkEq(call(9, 10), 1);

RateLimitException caught = null;
try {
    call(10, 10);
} catch (RateLimitException e) {
    caught = e;
}
check(caught != null);
checkEq(caught.limit(), 10);
checkEq(caught.retryAfterSeconds(), 1);
checkEq(caught.getMessage(), "rate limit of 10 requests exceeded, retry in 1 seconds");

RateLimitException later = null;
try {
    call(14, 10);
} catch (RateLimitException e) {
    later = e;
}
check(later != null);
checkEq(later.retryAfterSeconds(), 5);
checkEq(later.limit(), 10);
```

## Hints
- The exception needs two `final` fields and a constructor taking both.
- Build the message from those values with `super(...)`, so the text and the
  fields can never disagree.
- `call` computes the delay as `requestsMade - limit + 1` and passes both
  numbers to the constructor.

## Solution
```java
static class RateLimitException extends Exception {
    private final int retryAfterSeconds;
    private final int limit;

    RateLimitException(int limit, int retryAfterSeconds) {
        super("rate limit of " + limit + " requests exceeded, retry in "
              + retryAfterSeconds + " seconds");
        this.retryAfterSeconds = retryAfterSeconds;
        this.limit = limit;
    }

    int retryAfterSeconds() {
        return retryAfterSeconds;
    }

    int limit() {
        return limit;
    }
}

static int call(int requestsMade, int limit) throws RateLimitException {
    if (requestsMade >= limit) {
        throw new RateLimitException(limit, requestsMade - limit + 1);
    }
    return limit - requestsMade;
}
```

## Notes
An exception is an object. It can hold whatever a handler needs, and the
difference that makes is the difference between a caller that logs the problem
and one that solves it:

```java
try {
    call(made, limit);
} catch (RateLimitException e) {
    Thread.sleep(e.retryAfterSeconds() * 1000L);   // possible only with the field
}
```

With the starter, the same handler would have to find the number by searching
the message text — which works right up until somebody improves the wording.

Note that the message is built inside the constructor from the same values that
become the fields. That is deliberate: passing the message in separately lets
the text and the data drift apart, so a log line could say five seconds while
`retryAfterSeconds()` returns seven. Deriving one from the other makes that
impossible, and it is the same argument chapter 2.3 made for computing an
invariant in one place.

Checked is the right choice here, by the test from the chapter: there is
obviously something a caller can do about being rate limited — wait and retry
— and a caller who has not thought about it should be made to. This is the
minority of cases where the checked/unchecked argument comes down clearly on
the checked side.
