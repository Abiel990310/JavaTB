---
id: optional-lookup
title: "Absence in the signature"
difficulty: core
chapter: null-and-optional
topics: [Optional, null]
check: unit
standard: java21
---

A directory maps names to users, and a user may or may not have a manager.

Write two methods:

- `find(Map<String, User> directory, String name)` returning
  `Optional<User>` — empty when the name is absent.
- `managerNameOf(Map<String, User> directory, String name)` returning the
  manager's name in upper case, or `"none"` when the user is absent, has no
  manager, or the manager's name is blank.

Write `managerNameOf` as a chain. No `isPresent`, no `get`, and no `if`.

`User` is provided: `record User(String name, String manager) { }`, where
`manager` may be `null` or blank.

## Starter
```java
record User(String name, String manager) { }

static Optional<User> find(Map<String, User> directory, String name) {
    return Optional.of(directory.get(name));
}

static String managerNameOf(Map<String, User> directory, String name) {
    Optional<User> user = find(directory, name);
    if (user.isPresent()) {
        return user.get().manager().toUpperCase(Locale.ROOT);
    }
    return "none";
}
```

## Tests
```java
Map<String, User> dir = new HashMap<>();
dir.put("ada", new User("Ada", "Charles"));
dir.put("grace", new User("Grace", null));
dir.put("alan", new User("Alan", "   "));

check(find(dir, "ada").isPresent());
check(find(dir, "nobody").isEmpty());
checkEq(find(dir, "ada").get().name(), "Ada");

checkEq(managerNameOf(dir, "ada"), "CHARLES");
checkEq(managerNameOf(dir, "grace"), "none");
checkEq(managerNameOf(dir, "alan"), "none");
checkEq(managerNameOf(dir, "nobody"), "none");
```

## Hints
- `Optional.of` throws when given `null`, and `directory.get` returns `null`
  for an absent key. `ofNullable` is the one that accepts either.
- `map` applies a function only when a value is present, so
  `.map(User::manager)` gives an `Optional<String>` that is empty for Grace.
- `filter` drops a value that fails a test — use it for the blank manager.
- Finish with `.orElse("none")`.

## Solution
```java
record User(String name, String manager) { }

static Optional<User> find(Map<String, User> directory, String name) {
    return Optional.ofNullable(directory.get(name));
}

static String managerNameOf(Map<String, User> directory, String name) {
    return find(directory, name)
            .map(User::manager)
            .filter(m -> !m.isBlank())
            .map(m -> m.toUpperCase(Locale.ROOT))
            .orElse("none");
}
```

## Notes
The starter has two separate bugs and they fail differently, which is worth
watching for.

`Optional.of(directory.get(name))` throws `NullPointerException` for a missing
name — so `find(dir, "nobody")` explodes rather than returning empty, which is
the precise opposite of what an `Optional`-returning method is for.
`ofNullable` is almost always the one you want when the value comes from a
lookup.

And `user.get().manager().toUpperCase(...)` throws for Grace, whose manager is
`null`. Unwrapping the outer `Optional` does nothing about the inner value, and
this is the shape the chapter calls "Optional written as if it were null" — the
`isPresent`/`get` pair reintroduces exactly the check that had been eliminated,
and then misses the second one.

The chained version has no such gap because each step is defined on absence.
`map` on an empty `Optional` returns empty without calling the function; the
`null` manager becomes empty at the first `map`; the blank one is removed by
`filter`. Four different inputs — missing, null, blank, present — take four
different routes to the same well-defined answer, and no branch was written.

`.map(User::manager)` is a **method reference**, shorthand for
`user -> user.manager()`. Part 6 covers them; they read well here because the
step is exactly "call this method".
