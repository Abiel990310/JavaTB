---
id: async-pipeline
title: "A pipeline that does not block"
difficulty: stretch
chapter: executors
topics: [completablefuture, async, composition, error-handling]
check: unit
standard: java21
---

Four fake services and a pipeline over them. The rule: **no `get()`, no
`join()`, and no `Thread.sleep` inside any method you write** — every method
returns a `CompletableFuture` and the composition does the waiting. Only the
tests join, at the very end.

Given (do not change them):

```java
static CompletableFuture<String> lookupUser(String id);       // "user:<id>"
static CompletableFuture<Integer> creditFor(String user);     // length of user * 10
static CompletableFuture<String> nameFor(String user);        // user uppercased
static CompletableFuture<String> flaky(String id);            // fails for "bad"
```

Write:

- `static CompletableFuture<String> profile(String id)` — look the user up,
  then fetch the name, and return `"<name> (<id>)"`. The second call depends on
  the first.
- `static CompletableFuture<String> summary(String id)` — look the user up,
  then fetch **name and credit concurrently**, and return
  `"<name>: <credit>"`
- `static CompletableFuture<String> withFallback(String id)` — `flaky(id)`, or
  `"fallback"` if it fails
- `static CompletableFuture<String> describeOutcome(String id)` — `flaky(id)`
  as `"ok:<value>"`, or `"failed:<message>"` using the original exception's
  message, never the wrapper's
- `static CompletableFuture<List<String>> allProfiles(List<String> ids)` —
  every id's profile, in order, completing when all of them have
- `static CompletableFuture<String> firstOf(List<String> ids)` — the first
  profile to complete

## Starter
```java
import java.util.concurrent.*;

static CompletableFuture<String> lookupUser(String id) {
    return CompletableFuture.supplyAsync(() -> "user:" + id);
}

static CompletableFuture<Integer> creditFor(String user) {
    return CompletableFuture.supplyAsync(() -> user.length() * 10);
}

static CompletableFuture<String> nameFor(String user) {
    return CompletableFuture.supplyAsync(() -> user.toUpperCase());
}

static CompletableFuture<String> flaky(String id) {
    return CompletableFuture.supplyAsync(() -> {
        if (id.equals("bad")) {
            throw new IllegalStateException("service refused " + id);
        }
        return "value for " + id;
    });
}

static CompletableFuture<String> profile(String id) {
    String user = lookupUser(id).join();
    String name = nameFor(user).join();
    return CompletableFuture.completedFuture(name + " (" + id + ")");
}

static CompletableFuture<String> summary(String id) {
    return lookupUser(id).thenApply(user -> nameFor(user).join() + ": " + creditFor(user).join());
}

static CompletableFuture<String> withFallback(String id) {
    return flaky(id);
}

static CompletableFuture<String> describeOutcome(String id) {
    return flaky(id).thenApply(value -> "ok:" + value);
}

static CompletableFuture<List<String>> allProfiles(List<String> ids) {
    List<String> profiles = new ArrayList<>();
    for (String id : ids) {
        profiles.add(profile(id).join());
    }
    return CompletableFuture.completedFuture(profiles);
}

static CompletableFuture<String> firstOf(List<String> ids) {
    return profile(ids.get(0));
}
```

## Tests
```java
import java.util.concurrent.*;

checkEq(profile("42").join(), "USER:42 (42)");
checkEq(profile("").join(), "USER: ()");

checkEq(summary("42").join(), "USER:42: 70");
checkEq(summary("7").join(), "USER:7: 60");

checkEq(withFallback("good").join(), "value for good");
checkEq(withFallback("bad").join(), "fallback");

checkEq(describeOutcome("good").join(), "ok:value for good");
checkEq(describeOutcome("bad").join(), "failed:service refused bad");

checkEq(allProfiles(List.of("1", "2", "3")).join(),
        List.of("USER:1 (1)", "USER:2 (2)", "USER:3 (3)"));
checkEq(allProfiles(List.of()).join(), List.of());

// firstOf returns one of them, and it is a real profile.
String first = firstOf(List.of("a", "b", "c")).join();
check(List.of("USER:A (a)", "USER:B (b)", "USER:C (c)").contains(first));

// profile() must not block the calling thread: building the future returns
// before the work finishes.
CompletableFuture<String> pending = profile("99");
check(pending instanceof CompletableFuture);
checkEq(pending.join(), "USER:99 (99)");

// Nothing in the pipeline may run on the calling thread only — 200 profiles
// must all complete.
List<String> many = new ArrayList<>();
for (int i = 0; i < 200; i++) {
    many.add(String.valueOf(i));
}
checkEq(allProfiles(many).join().size(), 200);
checkEq(allProfiles(many).join().get(199), "USER:199 (199)");
```

## Hints
- The step that depends on the previous one and itself returns a future is
  `thenCompose`. `thenApply` would give you a
  `CompletableFuture<CompletableFuture<String>>`.
- `summary` needs the two calls to overlap: start both from the same `user`,
  then `thenCombine` them. Calling `join()` inside a `thenApply` serialises
  them *and* blocks a pool thread.
- `withFallback` is `exceptionally`.
- `describeOutcome` is `handle`, which receives both the value and the
  throwable. The throwable is a `CompletionException`, so the message you want
  is `failure.getCause().getMessage()`.
- `allOf` returns a `CompletableFuture<Void>`; join nothing and instead
  `thenApply` over it, reading each individual future — they are all complete
  by then, so `join()` on them inside that callback returns immediately.
- `anyOf` takes an array and returns `CompletableFuture<Object>`; cast the
  result in a `thenApply`.
- `CompletableFuture[]::new` is chapter 5.4's type token, met in the wild.

## Solution
```java
import java.util.concurrent.*;

static CompletableFuture<String> lookupUser(String id) {
    return CompletableFuture.supplyAsync(() -> "user:" + id);
}

static CompletableFuture<Integer> creditFor(String user) {
    return CompletableFuture.supplyAsync(() -> user.length() * 10);
}

static CompletableFuture<String> nameFor(String user) {
    return CompletableFuture.supplyAsync(() -> user.toUpperCase());
}

static CompletableFuture<String> flaky(String id) {
    return CompletableFuture.supplyAsync(() -> {
        if (id.equals("bad")) {
            throw new IllegalStateException("service refused " + id);
        }
        return "value for " + id;
    });
}

static CompletableFuture<String> profile(String id) {
    return lookupUser(id)
        .thenCompose(user -> nameFor(user))
        .thenApply(name -> name + " (" + id + ")");
}

static CompletableFuture<String> summary(String id) {
    return lookupUser(id).thenCompose(user ->
        nameFor(user).thenCombine(creditFor(user), (name, credit) -> name + ": " + credit));
}

static CompletableFuture<String> withFallback(String id) {
    return flaky(id).exceptionally(failure -> "fallback");
}

static CompletableFuture<String> describeOutcome(String id) {
    return flaky(id).handle((value, failure) ->
        failure == null ? "ok:" + value : "failed:" + failure.getCause().getMessage());
}

static CompletableFuture<List<String>> allProfiles(List<String> ids) {
    List<CompletableFuture<String>> futures = new ArrayList<>(ids.size());
    for (String id : ids) {
        futures.add(profile(id));
    }
    return CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
        .thenApply(ignored -> futures.stream().map(CompletableFuture::join).toList());
}

static CompletableFuture<String> firstOf(List<String> ids) {
    List<CompletableFuture<String>> futures = new ArrayList<>(ids.size());
    for (String id : ids) {
        futures.add(profile(id));
    }
    return CompletableFuture.anyOf(futures.toArray(CompletableFuture[]::new))
        .thenApply(value -> (String) value);
}
```

## Notes
Every starter method calls `join()` somewhere, and each one is a different
version of the same mistake: turning an asynchronous API back into a
synchronous one, then wrapping the answer in a future so the signature still
looks asynchronous.

`profile` joins on the **calling** thread. It works, and it means a caller who
believed they were getting a future back was blocked for the duration. The
signature lied. `thenCompose` is the fix, and the reason it exists: the callback
returns a `CompletableFuture<String>`, and `thenCompose` flattens it —
precisely `flatMap` from chapter 6.3, applied to time instead of to elements.

`summary` is worse than it looks. Joining inside a `thenApply` blocks a
**pool** thread, and the common pool has `availableProcessors() - 1` of them.
Two hundred concurrent summaries would each occupy a pool thread while waiting
for work that needs a pool thread to run — chapter 8.3's thread-starvation
deadlock, arrived at by accident. It also serialises the two calls that were
meant to overlap. `thenCombine` starts both and merges when both are done.

`describeOutcome` needs `handle` rather than `exceptionally`, because it must
produce a different *shape* of answer in each case, not merely a substitute
value. Note where the message comes from: the throwable handed to `handle` is a
`CompletionException` wrapper, and `getCause()` is the `IllegalStateException`
the task actually threw. Reporting the wrapper's message gives you
`java.lang.IllegalStateException: service refused bad`, with the class name
glued on — a small thing that makes error messages look unfinished.

`allProfiles` shows why `allOf` returns `CompletableFuture<Void>` rather than a
list: it accepts futures of mixed types, so there is no element type to return.
The pattern is always the same — keep your own list of futures, wait on
`allOf`, then read each one inside the callback where `join()` is guaranteed
not to block. That last point is the subtle one: `join()` is forbidden in this
exercise everywhere except there, because by the time `allOf`'s callback runs
every future is already complete.

`firstOf` loses its type for the same reason and needs a cast. And note what
neither `allOf` nor `anyOf` does: cancel the losers. `anyOf` returns the first
result and leaves the other requests running, which is a difference from
`invokeAny` in the previous problem worth knowing before you rely on either.
