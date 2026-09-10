---
id: choose-the-nesting
title: "Static, or attached to an instance?"
difficulty: intro
chapter: nested-classes
topics: [nested classes, references]
check: unit
standard: java21
---

`Registry` has a nested `Entry` class holding a key and a value. `Entry` never
looks at anything belonging to a `Registry` instance — it is nested purely for
namespacing.

As written it is an *inner* class, which means every `Entry` silently holds a
reference to the `Registry` that made it, and an `Entry` cannot be created
without one at all.

Fix it, and add the two accessors. The checks construct an `Entry` on its own,
with no `Registry` anywhere, which is only possible for the right kind of
nested class.

## Starter
```java
static class Registry {
    private final String name;

    Registry(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    class Entry {
        private final String key;
        private final int value;

        Entry(String key, int value) {
            this.key = key;
            this.value = value;
        }
    }
}
```

## Tests
```java
Registry.Entry e = new Registry.Entry("alpha", 1);
checkEq(e.key(), "alpha");
checkEq(e.value(), 1);

Registry.Entry other = new Registry.Entry("beta", 2);
checkEq(other.key(), "beta");
checkEq(other.value(), 2);

Registry r = new Registry("main");
checkEq(r.name(), "main");

Registry.Entry third = new Registry.Entry("gamma", 3);
checkEq(third.value(), 3);
```

## Hints
- `new Registry.Entry(...)` with no `Registry` object in sight only compiles
  for one kind of nested class.
- An inner class needs an enclosing instance: `registry.new Entry(...)`. The
  checks deliberately do not provide one.
- One keyword.
- `Entry` also needs `key()` and `value()` accessors; they are not there yet.

## Solution
```java
static class Registry {
    private final String name;

    Registry(String name) {
        this.name = name;
    }

    String name() {
        return name;
    }

    static class Entry {
        private final String key;
        private final int value;

        Entry(String key, int value) {
            this.key = key;
            this.value = value;
        }

        String key() {
            return key;
        }

        int value() {
            return value;
        }
    }
}
```

## Notes
The starter does not compile against these checks, and the error is the useful
part: *an enclosing instance that contains Registry.Entry is required*. An
inner class instance cannot exist without an outer object, because it holds a
reference to one.

That reference is the reason this matters beyond syntax. Had the checks
happened to have a `Registry` handy, the starter would have compiled and worked
— and every `Entry` in the program would have pinned a whole `Registry` in
memory. A map of ten thousand entries would keep ten thousand references to an
object nobody was using. Nothing warns you; the symptom is a heap that will not
shrink.

The rule is easy to apply and worth applying every time: **if a nested class
does not use the outer instance, make it `static`.** Ask what `Entry` needs
from a `Registry` — nothing — and the answer follows.

`Entry` here would be better still as a `record`: `record Entry(String key, int
value) { }` is one line, generates both accessors, and is implicitly static
because a nested record always is. That is not an accident of the design —
records are transparent carriers of data, and a carrier that secretly pointed
at an enclosing object would not be transparent.
