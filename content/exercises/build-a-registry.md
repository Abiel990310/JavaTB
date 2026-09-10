---
id: build-a-registry
title: "A registry of constructors"
difficulty: stretch
chapter: method-references
topics: [method-references, constructors, generics]
check: unit
standard: java21
---

`Type::new` turns a constructor into a value, which means you can put
constructors in a map and choose one at run time — the type-token idea from
chapter 5.4, arrived at from the other direction.

Build a `Registry<T>` that maps a name to a way of making a `T`:

- `Registry()` — starts empty
- `register(String name, Supplier<? extends T> maker)` — returns `this` so
  calls chain; registering a name twice throws
  `IllegalStateException("duplicate: " + name)`
- `create(String name)` — a new `T` from the registered maker, throwing
  `NoSuchElementException(name)` when nothing is registered under it
- `names()` — the registered names in the order they were registered,
  unmodifiable
- `createAll()` — one instance per registered name, in registration order
- `static <A, T> Registry<T> of(Map<String, Function<A, T>> makers, A argument)`
  — a registry whose every entry applies its function to the same fixed
  argument, preserving the map's iteration order

Nothing here should call `Class.newInstance` or touch reflection. A
`Supplier<T>` *is* the factory.

## Starter
```java
static final class Registry<T> {
    private final Map<String, Supplier<? extends T>> makers = new HashMap<>();

    Registry<T> register(String name, Supplier<? extends T> maker) {
        makers.put(name, maker);
        return this;
    }

    T create(String name) {
        return makers.get(name).get();
    }

    List<String> names() {
        return new ArrayList<>(makers.keySet());
    }

    List<T> createAll() {
        List<T> all = new ArrayList<>();
        for (Supplier<? extends T> maker : makers.values()) {
            all.add(maker.get());
        }
        return all;
    }
}

static <A, T> Registry<T> of(Map<String, Function<A, T>> makers, A argument) {
    return new Registry<>();
}
```

## Tests
```java
Registry<List<String>> lists = new Registry<List<String>>()
    .register("array", ArrayList::new)
    .register("linked", LinkedList::new);

checkEq(lists.names(), List.of("array", "linked"));

List<String> made = lists.create("array");
checkEq(made.getClass().getSimpleName(), "ArrayList");
checkEq(lists.create("linked").getClass().getSimpleName(), "LinkedList");

// A fresh instance per call, not one shared object.
List<String> first = lists.create("array");
List<String> second = lists.create("array");
check(first != second);
first.add("x");
checkEq(second.size(), 0);

checkThrows(NoSuchElementException.class, () -> lists.create("missing"));
checkThrows(IllegalStateException.class, () -> lists.register("array", ArrayList::new));

// Registration order survives, and the list cannot be edited from outside.
Registry<StringBuilder> builders = new Registry<StringBuilder>()
    .register("z", StringBuilder::new)
    .register("a", StringBuilder::new)
    .register("m", StringBuilder::new);
checkEq(builders.names(), List.of("z", "a", "m"));
checkThrows(UnsupportedOperationException.class, () -> builders.names().add("q"));

List<StringBuilder> all = builders.createAll();
checkEq(all.size(), 3);
check(all.get(0) != all.get(1));

// The registry is lazy: registering must not build anything.
int[] calls = { 0 };
Registry<String> counted = new Registry<String>()
    .register("one", () -> { calls[0]++; return "made"; });
checkEq(calls[0], 0);
checkEq(counted.create("one"), "made");
checkEq(calls[0], 1);

// of(): every maker gets the same argument.
Map<String, Function<String, Object>> makers = new LinkedHashMap<>();
makers.put("builder", StringBuilder::new);
makers.put("upper", String::toUpperCase);
makers.put("length", String::length);

Registry<Object> fromMap = of(makers, "seed");
checkEq(fromMap.names(), List.of("builder", "upper", "length"));
checkEq(fromMap.create("builder").toString(), "seed");
checkEq(fromMap.create("upper"), "SEED");
checkEq(fromMap.create("length"), 4);
checkEq(fromMap.createAll().size(), 3);
```

## Hints
- `HashMap` has no order. `LinkedHashMap` keeps insertion order, which is what
  `names()` and `createAll()` are tested on.
- Duplicate detection: `makers.containsKey(name)` before putting, or check the
  return value of `putIfAbsent` for `null`.
- `create` must not call `.get()` on a `null` maker — look the name up, check
  it, then call.
- `names()` returns `List.copyOf(makers.keySet())`, which both copies and
  freezes.
- In `of`, each entry becomes `() -> maker.apply(argument)`. An enhanced-for
  variable is a fresh, effectively-final variable per iteration, so capturing it
  is fine — it is the classic `for (int i = 0; ...)` counter that a lambda
  cannot capture.
- `String::length` returns `Integer`, `String::toUpperCase` returns `String`,
  `StringBuilder::new` takes a `String` — all three fit
  `Function<String, Object>`.

## Solution
```java
static final class Registry<T> {
    private final Map<String, Supplier<? extends T>> makers = new LinkedHashMap<>();

    Registry<T> register(String name, Supplier<? extends T> maker) {
        if (makers.putIfAbsent(name, maker) != null) {
            throw new IllegalStateException("duplicate: " + name);
        }
        return this;
    }

    T create(String name) {
        Supplier<? extends T> maker = makers.get(name);
        if (maker == null) {
            throw new NoSuchElementException(name);
        }
        return maker.get();
    }

    List<String> names() {
        return List.copyOf(makers.keySet());
    }

    List<T> createAll() {
        List<T> all = new ArrayList<>(makers.size());
        for (Supplier<? extends T> maker : makers.values()) {
            all.add(maker.get());
        }
        return all;
    }
}

static <A, T> Registry<T> of(Map<String, Function<A, T>> makers, A argument) {
    Registry<T> registry = new Registry<>();
    for (Map.Entry<String, Function<A, T>> entry : makers.entrySet()) {
        Function<A, T> maker = entry.getValue();
        registry.register(entry.getKey(), () -> maker.apply(argument));
    }
    return registry;
}
```

## Notes
`ArrayList::new` and `LinkedList::new` are both `Supplier<List<String>>`, and
they are ordinary values — stored in a map, passed around, called later. That
is the whole idea. Before Java 8 this pattern needed either an
`AbstractFactory` interface with a subclass per type or a `Class<?>` plus
`newInstance()`; the reflective version compiles just as happily when the class
has no no-argument constructor and fails at run time, while `ArrayList::new`
does not compile if the constructor is missing.

Three details in the starter are worth naming.

`HashMap` was the wrong choice and the tests say so with `"z", "a", "m"` — a
deliberately unsorted set, because a `HashMap` of short strings will often look
ordered enough to pass a lazy test. `LinkedHashMap` costs one word and gives
`names()` a meaning.

`makers.get(name).get()` reads fine and throws `NullPointerException` for an
unregistered name, which tells the caller nothing about what went wrong. Look
the value up, test it, and throw the exception that names the problem. This is
chapter 3.2's argument, in three lines.

The `? extends T` in the field type is what lets `ArrayList::new` register in a
`Registry<List<String>>`. Without it, `Supplier<ArrayList<String>>` would not
be a `Supplier<List<String>>` — invariance again, from chapter 5.3. The
registry only ever *produces* `T`s, so PECS says the producer side wants
`extends`, and it works out.

`of` is where capture is worth thinking about, and the answer is not the one
people expect. An enhanced-for variable is a *fresh* variable on every
iteration, never reassigned, so `entry` is effectively final and
`() -> entry.getValue().apply(argument)` compiles — each lambda holds its own
entry. What does not compile is the same trick over a counted loop:

```java
for (int i = 0; i < 2; i++) {
    suppliers.add(() -> i);      // error: must be final or effectively final
}
```

because there is one `i` and it is assigned three times. If you need the index,
copy it: `int index = i;` inside the body creates the per-iteration variable
that `i` is not.

Copying `entry.getValue()` into `maker` here is therefore about reading, not
compiling: the lambda then names the one thing it uses, and the reader does not
have to check what else `entry` might be. `argument` is a parameter, never
reassigned, so every lambda shares it.
