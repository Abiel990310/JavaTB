---
id: layered-config
title: "Configuration that resolves the way you meant"
difficulty: core
chapter: packaging
topics: [configuration, packaging, precedence, validation]
check: unit
standard: java21
---

A configuration resolver with the layering rules from the chapter, and the edge
cases that make it worth writing once rather than at every call site.

- `enum Source { DEFAULT, FILE, ENVIRONMENT, SYSTEM_PROPERTY, ARGUMENT }` —
  declared weakest to strongest
- `record Resolved(String value, Source source) {}`
- `static final class Config`
  - `Config(Map<Source, Map<String, String>> layers, Map<String, String> defaults)`
  - `Resolved lookup(String key)` — the value from the strongest layer that
    supplies a **non-blank** one, with its `Source`; a key with no value
    anywhere throws `NoSuchElementException` naming the key
  - `String get(String key)` and `String get(String key, String fallback)`
  - `int getInt(String key)` — throws `IllegalArgumentException` naming the key
    *and* the offending value when it does not parse
  - `boolean getBoolean(String key)` — `"true"` case-insensitively is true,
    everything else is false
  - `Set<String> keys()` — every key any layer supplies a non-blank value for,
    sorted
  - `Map<String, Source> provenance()` — which layer each key came from, keys
    sorted
- `static String redact(String key, String value)` — the value, unless the key
  contains `"password"`, `"secret"` or `"token"` case-insensitively, in which
  case `"****"`

## Starter
```java
enum Source { DEFAULT, FILE, ENVIRONMENT, SYSTEM_PROPERTY, ARGUMENT }

record Resolved(String value, Source source) {}

static final class Config {
    private final Map<Source, Map<String, String>> layers;
    private final Map<String, String> defaults;

    Config(Map<Source, Map<String, String>> layers, Map<String, String> defaults) {
        this.layers = layers;
        this.defaults = defaults;
    }

    Resolved lookup(String key) {
        for (Source source : Source.values()) {
            Map<String, String> layer = layers.get(source);
            if (layer != null && layer.containsKey(key)) {
                return new Resolved(layer.get(key), source);
            }
        }
        return new Resolved(defaults.get(key), Source.DEFAULT);
    }

    String get(String key) {
        return lookup(key).value();
    }

    String get(String key, String fallback) {
        String value = get(key);
        return value == null ? fallback : value;
    }

    int getInt(String key) {
        return Integer.parseInt(get(key));
    }

    boolean getBoolean(String key) {
        return get(key).equals("true");
    }

    Set<String> keys() {
        return layers.keySet().stream().map(Object::toString).collect(java.util.stream.Collectors.toSet());
    }

    Map<String, Source> provenance() {
        return Map.of();
    }
}

static String redact(String key, String value) {
    return value;
}
```

## Tests
```java
Map<Source, Map<String, String>> layers = new EnumMap<>(Source.class);
layers.put(Source.FILE, Map.of(
    "app.host", "file-host",
    "app.port", "9000",
    "app.verbose", "TRUE",
    "app.blankInEnv", "kept"));
layers.put(Source.ENVIRONMENT, Map.of(
    "app.host", "env-host",
    "app.blankInEnv", "   ",
    "app.token", "s3cret"));
layers.put(Source.SYSTEM_PROPERTY, Map.of(
    "app.host", "property-host"));
layers.put(Source.ARGUMENT, Map.of(
    "app.retries", "3"));

Config config = new Config(layers, Map.of("app.host", "localhost", "app.port", "8080"));

// The strongest non-blank layer wins.
checkEq(config.lookup("app.host"), new Resolved("property-host", Source.SYSTEM_PROPERTY));
checkEq(config.lookup("app.port"), new Resolved("9000", Source.FILE));
checkEq(config.lookup("app.retries"), new Resolved("3", Source.ARGUMENT));
checkEq(config.lookup("app.token"), new Resolved("s3cret", Source.ENVIRONMENT));

// A blank value does not override a real one.
checkEq(config.lookup("app.blankInEnv"), new Resolved("kept", Source.FILE));

// Defaults are the weakest layer, not a fallback bolted on afterwards.
Config bare = new Config(new EnumMap<>(Source.class), Map.of("app.host", "localhost"));
checkEq(bare.lookup("app.host"), new Resolved("localhost", Source.DEFAULT));

checkEq(config.get("app.host"), "property-host");
checkEq(config.get("app.missing", "fallback"), "fallback");
checkEq(config.get("app.host", "fallback"), "property-host");
checkThrows(NoSuchElementException.class, () -> config.get("app.missing"));
try {
    config.get("app.nowhere");
    check(false);
} catch (NoSuchElementException expected) {
    check(expected.getMessage().contains("app.nowhere"));
}

checkEq(config.getInt("app.port"), 9000);
checkEq(config.getInt("app.retries"), 3);
try {
    config.getInt("app.host");
    check(false);
} catch (IllegalArgumentException expected) {
    check(expected.getMessage().contains("app.host"));
    check(expected.getMessage().contains("property-host"));
}

check(config.getBoolean("app.verbose"));            // "TRUE"
check(!config.getBoolean("app.host"));
checkThrows(NoSuchElementException.class, () -> config.getBoolean("app.missing"));

checkEq(config.keys(), new TreeSet<>(List.of(
    "app.blankInEnv", "app.host", "app.port", "app.retries", "app.token", "app.verbose")));

Map<String, Source> provenance = config.provenance();
checkEq(provenance.get("app.host"), Source.SYSTEM_PROPERTY);
checkEq(provenance.get("app.port"), Source.FILE);
checkEq(provenance.get("app.retries"), Source.ARGUMENT);
checkEq(provenance.get("app.blankInEnv"), Source.FILE);
checkEq(new ArrayList<>(provenance.keySet()), new ArrayList<>(config.keys()));

checkEq(redact("app.host", "example.test"), "example.test");
checkEq(redact("app.token", "s3cret"), "****");
checkEq(redact("APP.TOKEN", "s3cret"), "****");
checkEq(redact("db.password", "hunter2"), "****");
checkEq(redact("client.secret", "abc"), "****");
checkEq(redact("app.secretless", "fine"), "****");
```

## Hints
- `Source.values()` is declared weakest first, so iterating forwards finds the
  *weakest* match. Iterate backwards, or keep the last match rather than the
  first.
- `containsKey` is the wrong test: a blank value is present and must not win.
  Check for non-null and non-blank.
- Defaults are `Source.DEFAULT`, which is already the weakest enum constant —
  put them in the search rather than handling them separately after it.
- `getInt` must catch `NumberFormatException` and rethrow with the key and the
  value, per chapter 9.3.
- `keys()` and `provenance()` are the same walk: for every key any layer
  supplies, resolve it. Collect the keys from every layer plus the defaults.
- A `TreeMap` gives `provenance()` sorted keys for free, which is what makes
  the last assertion pass.
- `redact` matching `"app.secretless"` is deliberate — a substring test is
  crude and the test pins that behaviour so the choice is explicit rather than
  accidental.

## Solution
```java
enum Source { DEFAULT, FILE, ENVIRONMENT, SYSTEM_PROPERTY, ARGUMENT }

record Resolved(String value, Source source) {}

static final class Config {
    private final Map<Source, Map<String, String>> layers;

    Config(Map<Source, Map<String, String>> layers, Map<String, String> defaults) {
        Map<Source, Map<String, String>> all = new EnumMap<>(Source.class);
        all.putAll(layers);
        all.put(Source.DEFAULT, Map.copyOf(defaults));
        this.layers = Map.copyOf(all);
    }

    Resolved lookup(String key) {
        Source[] sources = Source.values();
        for (int i = sources.length - 1; i >= 0; i--) {
            Map<String, String> layer = layers.get(sources[i]);
            if (layer == null) {
                continue;
            }
            String value = layer.get(key);
            if (value != null && !value.isBlank()) {
                return new Resolved(value, sources[i]);
            }
        }
        throw new NoSuchElementException("no value configured for " + key);
    }

    String get(String key) {
        return lookup(key).value();
    }

    String get(String key, String fallback) {
        try {
            return lookup(key).value();
        } catch (NoSuchElementException absent) {
            return fallback;
        }
    }

    int getInt(String key) {
        String value = get(key);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException cause) {
            throw new IllegalArgumentException(key + " is not a number: " + value, cause);
        }
    }

    boolean getBoolean(String key) {
        return get(key).equalsIgnoreCase("true");
    }

    Set<String> keys() {
        Set<String> found = new TreeSet<>();
        for (Map<String, String> layer : layers.values()) {
            for (Map.Entry<String, String> entry : layer.entrySet()) {
                if (entry.getValue() != null && !entry.getValue().isBlank()) {
                    found.add(entry.getKey());
                }
            }
        }
        return Collections.unmodifiableSet(found);
    }

    Map<String, Source> provenance() {
        Map<String, Source> where = new TreeMap<>();
        for (String key : keys()) {
            where.put(key, lookup(key).source());
        }
        return Collections.unmodifiableMap(where);
    }
}

static String redact(String key, String value) {
    String lower = key.toLowerCase();
    boolean sensitive = lower.contains("password") || lower.contains("secret") || lower.contains("token");
    return sensitive ? "****" : value;
}
```

## Notes
The starter iterates `Source.values()` **forwards**, which finds the weakest
layer rather than the strongest — so a value in a config file beats one set on
the command line, which is exactly backwards. It is the kind of bug that
survives review because the loop looks obviously correct and the enum's
declaration order is fifteen lines away. Declaring the enum weakest-first and
searching backwards keeps the two facts next to each other; the alternative,
keeping the *last* match instead of the first, works equally well and reads
slightly worse.

`containsKey` versus a non-blank check is the chapter's point about empty
environment variables. A deployment script that writes `APP_HOST=${HOST}` with
`HOST` unset produces an empty string, not an absent variable, and a resolver
that respects it binds the service to nothing and logs no complaint. Treating
blank as absent is a small deliberate lie that is almost always what was meant
— and because it is a decision, the tests pin it.

Folding the defaults into the search **as a layer** rather than handling them
after it is what makes `provenance()` possible at all. A `get(key, fallback)`
bolted on afterwards cannot say where a value came from, and "where did this
setting come from" is the question every configuration bug reduces to. Note
that `get(String, String)` still exists for a genuine per-call fallback, and is
implemented in terms of `lookup` rather than duplicating it.

`getInt` wrapping `NumberFormatException` is chapter 9.3's rule at a boundary.
`Integer.parseInt` says `For input string: "property-host"`, which does not
mention the key, and the key is the only thing that tells the operator which
line of which file to fix.

`redact` matching `"app.secretless"` is the wart, and the test exists so the
wart is a decision. Substring matching over-redacts, which is the safe
direction: a redacted non-secret costs someone one debugging round, and a
logged secret costs a rotation. If that trade is wrong for your service, match
whole segments — but choose, rather than discovering the behaviour in
production.
