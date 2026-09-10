---
id: breaking-changes
title: "Will this break them?"
difficulty: stretch
chapter: api-design
topics: [api-design, compatibility, evolution, versioning]
check: unit
standard: java21
---

Encode the compatibility rules as something you can run, then use them.

- `enum Compatibility { SAFE, SOURCE_BREAKING, BINARY_BREAKING, SILENTLY_WRONG }`
  — `SOURCE_BREAKING` means already-compiled callers keep working but
  recompiling fails; `BINARY_BREAKING` means the opposite; `SILENTLY_WRONG`
  means both keep working and the behaviour is not what the author intended.
- `record Change(String description, Compatibility effect) {}`
- `static Compatibility classify(String changeKind)` — for the kinds listed
  below. An unknown kind throws `IllegalArgumentException`.

| kind | effect |
|---|---|
| `"add-class-method"` | `SAFE` |
| `"add-interface-abstract-method"` | `SOURCE_BREAKING` |
| `"add-interface-default-method"` | `SAFE` |
| `"add-sealed-subtype"` | `SOURCE_BREAKING` |
| `"add-enum-constant"` | `SAFE` |
| `"widen-parameter-type"` | `BINARY_BREAKING` |
| `"rename-parameter"` | `SAFE` |
| `"change-public-constant"` | `SILENTLY_WRONG` |
| `"remove-public-method"` | `BINARY_BREAKING` |
| `"narrow-return-type"` | `SAFE` |

- `static boolean requiresMajorVersion(Compatibility effect)` — true for
  anything that is not `SAFE`
- `static String nextVersion(String current, Compatibility effect)` — semantic
  versioning over `"major.minor.patch"`: a non-`SAFE` effect bumps major and
  zeroes the rest; `SAFE` bumps minor and zeroes patch. A malformed version
  throws `IllegalArgumentException`.
- `static List<Change> breakingOnly(List<Change> changes)` — the ones needing a
  major version, in order
- `static String releaseNotes(List<Change> changes)` — each change on its own
  line as `"<EFFECT>: <description>"`, breaking ones first and each group in
  the order given; an empty list gives `""`

## Starter
```java
enum Compatibility { SAFE, SOURCE_BREAKING, BINARY_BREAKING, SILENTLY_WRONG }

record Change(String description, Compatibility effect) {}

static Compatibility classify(String changeKind) {
    return Compatibility.SAFE;
}

static boolean requiresMajorVersion(Compatibility effect) {
    return effect == Compatibility.BINARY_BREAKING;
}

static String nextVersion(String current, Compatibility effect) {
    String[] parts = current.split("\\.");
    return (Integer.parseInt(parts[0]) + 1) + ".0.0";
}

static List<Change> breakingOnly(List<Change> changes) {
    return changes;
}

static String releaseNotes(List<Change> changes) {
    StringBuilder notes = new StringBuilder();
    for (Change change : changes) {
        notes.append(change.description()).append("\n");
    }
    return notes.toString();
}
```

## Tests
```java
checkEq(classify("add-class-method"), Compatibility.SAFE);
checkEq(classify("add-interface-abstract-method"), Compatibility.SOURCE_BREAKING);
checkEq(classify("add-interface-default-method"), Compatibility.SAFE);
checkEq(classify("add-sealed-subtype"), Compatibility.SOURCE_BREAKING);
checkEq(classify("add-enum-constant"), Compatibility.SAFE);
checkEq(classify("widen-parameter-type"), Compatibility.BINARY_BREAKING);
checkEq(classify("rename-parameter"), Compatibility.SAFE);
checkEq(classify("change-public-constant"), Compatibility.SILENTLY_WRONG);
checkEq(classify("remove-public-method"), Compatibility.BINARY_BREAKING);
checkEq(classify("narrow-return-type"), Compatibility.SAFE);
checkThrows(IllegalArgumentException.class, () -> classify("delete-everything"));

check(!requiresMajorVersion(Compatibility.SAFE));
check(requiresMajorVersion(Compatibility.SOURCE_BREAKING));
check(requiresMajorVersion(Compatibility.BINARY_BREAKING));
check(requiresMajorVersion(Compatibility.SILENTLY_WRONG));

checkEq(nextVersion("1.4.2", Compatibility.SAFE), "1.5.0");
checkEq(nextVersion("1.4.2", Compatibility.BINARY_BREAKING), "2.0.0");
checkEq(nextVersion("1.4.2", Compatibility.SOURCE_BREAKING), "2.0.0");
checkEq(nextVersion("1.4.2", Compatibility.SILENTLY_WRONG), "2.0.0");
checkEq(nextVersion("0.9.9", Compatibility.SAFE), "0.10.0");
checkEq(nextVersion("9.9.9", Compatibility.BINARY_BREAKING), "10.0.0");
checkThrows(IllegalArgumentException.class, () -> nextVersion("1.4", Compatibility.SAFE));
checkThrows(IllegalArgumentException.class, () -> nextVersion("1.4.x", Compatibility.SAFE));
checkThrows(IllegalArgumentException.class, () -> nextVersion("", Compatibility.SAFE));

List<Change> release = List.of(
    new Change("added Span.ofDays", classify("add-class-method")),
    new Change("Shape gained a fourth subtype", classify("add-sealed-subtype")),
    new Change("renamed the timeout parameter", classify("rename-parameter")),
    new Change("DEFAULT_HOST is now 127.0.0.1", classify("change-public-constant")),
    new Change("Codec.decode takes CharSequence", classify("widen-parameter-type")));

checkEq(breakingOnly(release).stream().map(Change::description).toList(), List.of(
    "Shape gained a fourth subtype",
    "DEFAULT_HOST is now 127.0.0.1",
    "Codec.decode takes CharSequence"));

checkEq(releaseNotes(release),
    "SOURCE_BREAKING: Shape gained a fourth subtype\n"
    + "SILENTLY_WRONG: DEFAULT_HOST is now 127.0.0.1\n"
    + "BINARY_BREAKING: Codec.decode takes CharSequence\n"
    + "SAFE: added Span.ofDays\n"
    + "SAFE: renamed the timeout parameter\n");

checkEq(releaseNotes(List.of()), "");
checkEq(breakingOnly(List.of()), List.of());

List<Change> allSafe = List.of(new Change("one", Compatibility.SAFE));
checkEq(breakingOnly(allSafe), List.of());
checkEq(releaseNotes(allSafe), "SAFE: one\n");
```

## Hints
- `classify` is a table. A `Map<String, Compatibility>` in a `static final`
  field, with an `IllegalArgumentException` for anything absent.
- `requiresMajorVersion` is `effect != SAFE` — three of the four are breaking,
  and the starter only counts one of them.
- `nextVersion` must handle both branches, must validate that there are exactly
  three numeric parts, and must not use `compareTo` on the strings.
- `"1.4".split("\\.")` gives two parts; `"1.4.x"` gives three, one of which is
  not a number. Both are malformed.
- `releaseNotes` groups but does not sort *within* a group — a stable partition
  into breaking and safe, then concatenate.
- `Compatibility` prints as its name, so `change.effect() + ": " + ...` is
  enough.

## Solution
```java
enum Compatibility { SAFE, SOURCE_BREAKING, BINARY_BREAKING, SILENTLY_WRONG }

record Change(String description, Compatibility effect) {}

static final Map<String, Compatibility> EFFECTS = Map.ofEntries(
    Map.entry("add-class-method", Compatibility.SAFE),
    Map.entry("add-interface-abstract-method", Compatibility.SOURCE_BREAKING),
    Map.entry("add-interface-default-method", Compatibility.SAFE),
    Map.entry("add-sealed-subtype", Compatibility.SOURCE_BREAKING),
    Map.entry("add-enum-constant", Compatibility.SAFE),
    Map.entry("widen-parameter-type", Compatibility.BINARY_BREAKING),
    Map.entry("rename-parameter", Compatibility.SAFE),
    Map.entry("change-public-constant", Compatibility.SILENTLY_WRONG),
    Map.entry("remove-public-method", Compatibility.BINARY_BREAKING),
    Map.entry("narrow-return-type", Compatibility.SAFE));

static Compatibility classify(String changeKind) {
    Compatibility effect = EFFECTS.get(changeKind);
    if (effect == null) {
        throw new IllegalArgumentException("unknown change kind: " + changeKind);
    }
    return effect;
}

static boolean requiresMajorVersion(Compatibility effect) {
    return effect != Compatibility.SAFE;
}

static String nextVersion(String current, Compatibility effect) {
    if (current == null) {
        throw new IllegalArgumentException("not a version: null");
    }
    String[] parts = current.split("\\.");
    if (parts.length != 3) {
        throw new IllegalArgumentException("not a version: " + current);
    }
    int[] numbers = new int[3];
    for (int i = 0; i < 3; i++) {
        try {
            numbers[i] = Integer.parseInt(parts[i]);
        } catch (NumberFormatException cause) {
            throw new IllegalArgumentException("not a version: " + current, cause);
        }
    }
    return requiresMajorVersion(effect)
        ? (numbers[0] + 1) + ".0.0"
        : numbers[0] + "." + (numbers[1] + 1) + ".0";
}

static List<Change> breakingOnly(List<Change> changes) {
    List<Change> breaking = new ArrayList<>();
    for (Change change : changes) {
        if (requiresMajorVersion(change.effect())) {
            breaking.add(change);
        }
    }
    return List.copyOf(breaking);
}

static String releaseNotes(List<Change> changes) {
    StringBuilder notes = new StringBuilder();
    for (Change change : changes) {
        if (requiresMajorVersion(change.effect())) {
            notes.append(change.effect()).append(": ").append(change.description()).append("\n");
        }
    }
    for (Change change : changes) {
        if (!requiresMajorVersion(change.effect())) {
            notes.append(change.effect()).append(": ").append(change.description()).append("\n");
        }
    }
    return notes.toString();
}
```

## Notes
The table is the exercise. Three rows deserve arguing about, and the arguments
are the chapter.

**`add-interface-abstract-method` is source-breaking but not binary-breaking.**
An already-compiled implementer keeps running — its class file satisfies the
old interface, and nothing looks for the new method until something calls it.
Recompile that implementer and it fails. This asymmetry is precisely why
`default` methods were added to the language in Java 8: `Collection.stream()`
had to appear on an interface with thousands of existing implementations, and
without `default` every one of them would have stopped compiling.

**`add-enum-constant` is `SAFE` and still ruins someone's day.** Nothing about
adding a constant breaks compilation or linkage — but a consumer with an
exhaustive `switch` over the enum now fails to compile, and one with a
`default` branch now silently takes it. The table records what the *change* is;
it cannot record what your consumers did with the old version. That is the real
lesson: "compatible" is a property of the pair, not of the change alone. The
same is true of `add-interface-default-method`, which breaks any implementer
that already had a clashing method.

**`change-public-constant` is the one with its own category.** Chapter 7.3
showed why: a `static final String` with a literal initialiser is inlined into
every reader at compile time, so the new jar links fine and the old value keeps
being used. Nothing fails. Classifying it as `SAFE` would be technically
defensible and practically a lie, which is what `SILENTLY_WRONG` is for — and
naming it is most of the value of having the table at all.

`nextVersion`'s validation is the small piece of discipline that keeps the rest
honest. `"1.4".split("\\.")` gives two parts and the starter's version happily
reads `parts[0]`, producing `"2.0.0"` from a malformed input. Semantic
versioning is a promise to your consumers about exactly the distinctions this
exercise encodes; a version bumper that accepts nonsense is a promise you have
not read.

Finally, note that `releaseNotes` puts the breaking changes **first**. Release
notes are read in a hurry by someone deciding whether to upgrade, and the three
lines that might cost them an afternoon should not be below the twelve that
will not.
