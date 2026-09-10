---
id: plugin-registry
title: "Load the plugins, survive the bad ones"
difficulty: stretch
chapter: packaging
topics: [service-loading, plugins, reflection, packaging]
check: unit
standard: java21
---

Build the discovery half of a plugin system: read the provider declarations
several jars would have contributed, instantiate what you can, and report what
you could not — without letting one broken plugin take the process down.

- `interface Codec { String name(); String encode(String input); }`
- `record LoadFailure(String className, String reason) {}` — `reason` is the
  failure's `SimpleName` and message, as `"SimpleName: message"`, or just
  `"SimpleName"` when the message is `null`
- `record Registry<T>(List<T> providers, List<LoadFailure> failures) {}` — both
  lists unmodifiable
- `static <T> Registry<T> discover(Class<T> service, List<String> declarations, ClassLoader loader)`
  — `declarations` are the lines of every `META-INF/services/<service>` file
  concatenated. Blank lines and lines whose first non-space character is `#`
  are skipped; so is anything after a `#` on a line with content. Names are
  trimmed. A duplicate name is loaded **once**, keeping the first occurrence.
  A name that cannot be loaded, is not a `T`, has no accessible no-argument
  constructor, or whose constructor throws contributes a `LoadFailure` and does
  not stop the rest.
- `static Optional<Codec> byName(Registry<Codec> registry, String name)` — the
  provider whose `name()` matches, case-insensitively
- `static String encodeWith(Registry<Codec> registry, String codecName, String input)`
  — throws `NoSuchElementException` naming the codec when it is not registered

## Starter
```java
interface Codec {
    String name();
    String encode(String input);
}

record LoadFailure(String className, String reason) {}

record Registry<T>(List<T> providers, List<LoadFailure> failures) {}

static <T> Registry<T> discover(Class<T> service, List<String> declarations, ClassLoader loader)
        throws Exception {
    List<T> providers = new ArrayList<>();
    for (String line : declarations) {
        Class<?> type = Class.forName(line, false, loader);
        providers.add((T) type.getDeclaredConstructor().newInstance());
    }
    return new Registry<>(providers, List.of());
}

static Optional<Codec> byName(Registry<Codec> registry, String name) {
    return Optional.empty();
}

static String encodeWith(Registry<Codec> registry, String codecName, String input) {
    return input;
}
```

## Tests
```java
// Providers such as several jars might contribute.
class Upper implements Codec {
    public String name() { return "upper"; }
    public String encode(String input) { return input.toUpperCase(); }
}
class Reverse implements Codec {
    public String name() { return "REVERSE"; }
    public String encode(String input) { return new StringBuilder(input).reverse().toString(); }
}

List<String> declared = List.of(
    "# contributed by codec-core",
    "",
    Upper.class.getName(),
    "   " + Reverse.class.getName() + "   ",
    "# contributed by codec-extra",
    Upper.class.getName(),                                   // duplicate: loaded once
    "com.example.Missing",                                   // not on the classpath
    "java.lang.String",                                      // not a Codec
    Broken.class.getName(),                                  // constructor throws
    NoDefaultConstructor.class.getName());                   // no no-arg constructor

Registry<Codec> registry = discover(Codec.class, declared, Main.class.getClassLoader());

checkEq(registry.providers().size(), 2);
checkEq(registry.providers().get(0).name(), "upper");
checkEq(registry.providers().get(1).name(), "REVERSE");
checkThrows(UnsupportedOperationException.class, () -> registry.providers().add(null));
checkThrows(UnsupportedOperationException.class, () -> registry.failures().add(null));

checkEq(registry.failures().size(), 4);
checkEq(registry.failures().stream().map(LoadFailure::className).toList(), List.of(
    "com.example.Missing", "java.lang.String",
    Broken.class.getName(), NoDefaultConstructor.class.getName()));
check(registry.failures().get(0).reason().startsWith("ClassNotFoundException"));
check(registry.failures().get(1).reason().contains("ClassCastException"));
check(registry.failures().get(2).reason().contains("refuses to start"));
check(registry.failures().get(3).reason().startsWith("NoSuchMethodException"));

checkEq(byName(registry, "upper").map(Codec::name), Optional.of("upper"));
checkEq(byName(registry, "UPPER").map(Codec::name), Optional.of("upper"));
checkEq(byName(registry, "reverse").map(Codec::name), Optional.of("REVERSE"));
checkEq(byName(registry, "rot13"), Optional.empty());

checkEq(encodeWith(registry, "upper", "hello"), "HELLO");
checkEq(encodeWith(registry, "REVERSE", "abc"), "cba");
checkThrows(NoSuchElementException.class, () -> encodeWith(registry, "rot13", "x"));
try {
    encodeWith(registry, "rot13", "x");
    check(false);
} catch (NoSuchElementException expected) {
    check(expected.getMessage().contains("rot13"));
}

// A trailing comment on a real line is stripped.
Registry<Codec> commented = discover(Codec.class,
    List.of(Upper.class.getName() + "  # the default codec"), Main.class.getClassLoader());
checkEq(commented.providers().size(), 1);
checkEq(commented.failures(), List.of());

// Nothing declared is not an error.
Registry<Codec> empty = discover(Codec.class, List.of(), Main.class.getClassLoader());
checkEq(empty.providers(), List.of());
checkEq(empty.failures(), List.of());

// Every declaration broken is also not an error.
Registry<Codec> allBad = discover(Codec.class, List.of("a.B", "c.D"), Main.class.getClassLoader());
checkEq(allBad.providers(), List.of());
checkEq(allBad.failures().size(), 2);
```

## Hints
- Two helper classes are needed for the failure cases; declare them in your
  code:
  `static final class Broken implements Codec { Broken() { throw new IllegalStateException("refuses to start"); } ... }`
  and
  `static final class NoDefaultConstructor implements Codec { NoDefaultConstructor(int unused) {} ... }`.
- Strip comments first: cut the line at the first `#`, then `trim()`, then skip
  it if it is empty.
- Duplicates need a `Set<String>` of names already accepted, checked before
  loading.
- `Class.forName` throws `ClassNotFoundException`; `getDeclaredConstructor`
  throws `NoSuchMethodException`; `newInstance` throws
  `InvocationTargetException` wrapping whatever the constructor threw; and
  `service.cast` throws `ClassCastException`. Catch them separately enough to
  report the right thing — `getCause()` for the wrapped one.
- `Class.forName(name, false, loader)` avoids initialising a class you are
  about to reject.
- `byName` compares with `equalsIgnoreCase`, because a provider chooses its own
  name and yours is not the only convention.

## Solution
```java
import java.lang.reflect.InvocationTargetException;

interface Codec {
    String name();
    String encode(String input);
}

record LoadFailure(String className, String reason) {}

record Registry<T>(List<T> providers, List<LoadFailure> failures) {
    Registry {
        providers = List.copyOf(providers);
        failures = List.copyOf(failures);
    }
}

static final class Broken implements Codec {
    Broken() {
        throw new IllegalStateException("refuses to start");
    }

    public String name() {
        return "broken";
    }

    public String encode(String input) {
        return input;
    }
}

static final class NoDefaultConstructor implements Codec {
    NoDefaultConstructor(int unused) {
    }

    public String name() {
        return "nope";
    }

    public String encode(String input) {
        return input;
    }
}

static String describe(Throwable failure) {
    String message = failure.getMessage();
    String name = failure.getClass().getSimpleName();
    return message == null ? name : name + ": " + message;
}

static <T> Registry<T> discover(Class<T> service, List<String> declarations, ClassLoader loader) {
    List<T> providers = new ArrayList<>();
    List<LoadFailure> failures = new ArrayList<>();
    Set<String> alreadySeen = new HashSet<>();

    for (String rawLine : declarations) {
        int comment = rawLine.indexOf('#');
        String line = (comment < 0 ? rawLine : rawLine.substring(0, comment)).trim();
        if (line.isEmpty() || !alreadySeen.add(line)) {
            continue;
        }
        try {
            Class<?> type = Class.forName(line, false, loader);
            providers.add(service.cast(type.getDeclaredConstructor().newInstance()));
        } catch (InvocationTargetException wrapped) {
            failures.add(new LoadFailure(line, describe(wrapped.getCause())));
        } catch (ReflectiveOperationException | ClassCastException failure) {
            failures.add(new LoadFailure(line, describe(failure)));
        }
    }
    return new Registry<>(providers, failures);
}

static Optional<Codec> byName(Registry<Codec> registry, String name) {
    for (Codec codec : registry.providers()) {
        if (codec.name().equalsIgnoreCase(name)) {
            return Optional.of(codec);
        }
    }
    return Optional.empty();
}

static String encodeWith(Registry<Codec> registry, String codecName, String input) {
    return byName(registry, codecName)
        .orElseThrow(() -> new NoSuchElementException("no codec registered as " + codecName))
        .encode(input);
}
```

## Notes
The starter's `discover` fails on the first bad line and takes the whole
registry with it, which is the difference between a plugin system and a
liability. Six declarations, four of them broken in four different ways, and
the correct answer is two working codecs plus four reports — because a plugin
mechanism exists precisely so that things you did not write can be present, and
things you did not write are sometimes wrong.

The four failure modes are worth being able to name, because each produces a
different exception and each means something different to whoever has to fix
the deployment:

- **`ClassNotFoundException`** — the provider jar is missing, or the service
  file names a class that was renamed. A packaging problem.
- **`ClassCastException`** — the class exists and does not implement the
  interface, usually because two versions of the interface are on the classpath
  (chapter 7.5's identity rule).
- **`NoSuchMethodException`** — there is no accessible no-argument
  constructor. This is *why* the convention exists, and the error is the
  convention being enforced.
- **The constructor threw** — arriving as `InvocationTargetException`, with the
  real failure in `getCause()`. Reporting the wrapper's message here would
  produce a line saying nothing, which is chapter 9.3's rule in the one place
  a reader has no other evidence.

`service.cast(...)` rather than `(T) ...` is what makes the third test pass at
all. An unchecked cast to `T` erases to nothing (chapter 5.2), so
`java.lang.String` would go into the list quietly and explode later at the
first `Codec` call — a `ClassCastException` in code that never mentions
casting. `Class.cast` checks at the point of the mistake.

`Class.forName(name, false, loader)` skips initialisation deliberately.
Initialising a class you are about to reject runs its static initialisers,
which chapter 7.3 showed can throw, can register things, and can never be
undone — and there is no reason to run a plugin's static code before you have
established that it is a plugin.

Two details on the surface. The compact constructor copying both lists into
`List.copyOf` means a `Registry` handed to a caller cannot be edited, which the
tests check — a registry that callers can add to is a registry whose contents
nobody can reason about. And `byName` comparing case-insensitively acknowledges
that a provider picks its own name: `Upper` says `"upper"` and `Reverse` says
`"REVERSE"`, and neither is wrong.
