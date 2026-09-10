---
id: resource-lookup
title: "Find the resource"
difficulty: core
chapter: classpath-and-modules
topics: [classpath, resources, class-loaders]
check: unit
standard: java21
---

Resource lookup has two APIs with different rules, and mixing them up is one of
the most common startup failures in Java. Get the rules right in code.

- `static String pathFor(Class<?> anchor, String name)` — the **absolute**
  resource path (no leading slash, `/`-separated) that
  `ClassLoader.getResource` needs, for a resource named `name` sitting beside
  `anchor` in its package. For a class in the default package, that is just
  `name`.
- `static boolean existsViaClass(Class<?> anchor, String name)` — is there a
  resource called `name` beside `anchor`, asked through `Class.getResource`?
- `static boolean existsViaLoader(Class<?> anchor, String name)` — the same
  question asked through the class loader, using `pathFor`
- `static boolean existsAbsolute(Class<?> anchor, String absolutePath)` —
  `absolutePath` is written the `ClassLoader` way (no leading slash); answer it
  through `Class.getResource`, which needs the other convention
- `static String readBeside(Class<?> anchor, String name)` — the resource's
  bytes as a UTF-8 string, or `null` when there is none; the stream must be
  closed

Nothing here may assume a particular class loader is available: read the anchor
class's own loader, and fall back to the system loader when it is `null`
(which it is for anything in `java.base`).

## Starter
```java
static String pathFor(Class<?> anchor, String name) {
    return anchor.getPackageName() + "/" + name;
}

static boolean existsViaClass(Class<?> anchor, String name) {
    return anchor.getResource("/" + name) != null;
}

static boolean existsViaLoader(Class<?> anchor, String name) {
    return anchor.getClassLoader().getResource("/" + pathFor(anchor, name)) != null;
}

static boolean existsAbsolute(Class<?> anchor, String absolutePath) {
    return anchor.getResource(absolutePath) != null;
}

static String readBeside(Class<?> anchor, String name) {
    return anchor.getResourceAsStream(name).toString();
}
```

## Tests
```java
import java.io.InputStream;

// String lives in java.lang, and its own class file is a resource beside it.
checkEq(pathFor(String.class, "String.class"), "java/lang/String.class");
checkEq(pathFor(java.util.List.class, "List.class"), "java/util/List.class");
checkEq(pathFor(Main.class, "Main.class"), "Main.class");

check(existsViaClass(String.class, "String.class"));
check(!existsViaClass(String.class, "NoSuchThing.class"));
check(existsViaClass(Main.class, "Main.class"));

check(existsViaLoader(String.class, "String.class"));
check(!existsViaLoader(String.class, "NoSuchThing.class"));

check(existsAbsolute(String.class, "java/lang/String.class"));
check(existsAbsolute(Main.class, "java/util/List.class"));
check(!existsAbsolute(Main.class, "java/util/NotThere.class"));

// Reading: a class file starts with the four magic bytes 0xCAFEBABE.
String bytes = readBeside(String.class, "String.class");
check(bytes != null);
check(bytes.length() > 100);
checkEq((int) bytes.charAt(0), 0xCA);

checkEq(readBeside(String.class, "NoSuchThing.class"), null);
```

## Hints
- `Class.getResource("name")` is relative to the class's **package**;
  `Class.getResource("/a/b/name")` is absolute. `ClassLoader.getResource` is
  always absolute and must have **no** leading slash.
- `getPackageName()` returns `""` for the default package, so the naive
  `packageName + "/" + name` produces `"/Main.class"` for `Main`. Handle the
  empty case.
- Package names use dots and resource paths use slashes. `replace('.', '/')`.
- `String.class.getClassLoader()` is `null` — the bootstrap loader. Use
  `ClassLoader.getSystemClassLoader()` when the anchor's loader is `null`;
  it can still find JDK class files.
- `readBeside` needs `getResourceAsStream`, `readAllBytes`, and a `null` check
  *before* touching the stream. Wrap it in `try`-with-resources, and turn an
  `IOException` into an unchecked one.
- Reading a class file as UTF-8 would mangle it. Use
  `new String(bytes, StandardCharsets.ISO_8859_1)` if you want each byte to
  survive as one character — which the magic-number test relies on.

## Solution
```java
import java.io.*;

static String pathFor(Class<?> anchor, String name) {
    String packageName = anchor.getPackageName();
    return packageName.isEmpty() ? name : packageName.replace('.', '/') + "/" + name;
}

static ClassLoader loaderFor(Class<?> anchor) {
    ClassLoader loader = anchor.getClassLoader();
    return loader != null ? loader : ClassLoader.getSystemClassLoader();
}

static boolean existsViaClass(Class<?> anchor, String name) {
    return anchor.getResource(name) != null;
}

static boolean existsViaLoader(Class<?> anchor, String name) {
    return loaderFor(anchor).getResource(pathFor(anchor, name)) != null;
}

static boolean existsAbsolute(Class<?> anchor, String absolutePath) {
    return anchor.getResource("/" + absolutePath) != null;
}

static String readBeside(Class<?> anchor, String name) {
    try (InputStream in = anchor.getResourceAsStream(name)) {
        if (in == null) {
            return null;
        }
        return new String(in.readAllBytes(), java.nio.charset.StandardCharsets.ISO_8859_1);
    } catch (IOException failure) {
        throw new UncheckedIOException(failure);
    }
}
```

## Notes
Every one of the starter's five bodies has the slash in the wrong place, which
is the point: there is no way to remember which API wants what except by
knowing why.

`Class.getResource` resolves *relative to the class's package* unless the name
starts with `/`. That is a genuine convenience — a class can ship a properties
file beside itself and say `getResource("messages.properties")` without ever
naming its own package. `ClassLoader.getResource` has no class and therefore no
package to be relative to, so it takes only absolute paths, and it treats a
leading slash as part of the name — which is why `loader.getResource("/x")`
returns `null` rather than throwing. A silent `null` where a slash was
mistakenly added is exactly the failure mode that makes this worth memorising.

`pathFor` is where the default package bites. `getPackageName()` returns the
empty string, and the obvious concatenation gives `"/Main.class"` — a path with
a leading slash, handed to the API that rejects them. The one class in this
book that is *always* in the default package is the one you write, so this case
is not hypothetical here.

`loaderFor` handles the `null` from `String.class.getClassLoader()`. `null`
means the bootstrap loader, and there is no object for it, so every piece of
code that walks from a class to its loader needs this two-line fallback.
`ClassLoader.getSystemClassLoader()` delegates upwards and finds JDK resources
fine.

`readBeside` has three separate faults in the starter: it calls `toString()` on
the stream rather than reading it, it never closes it, and it throws
`NullPointerException` on a missing resource instead of returning `null`. The
`try`-with-resources form fixes all three, and the `null` check has to be
*inside* the try — `try (InputStream in = ...)` handles a `null` resource
gracefully at close time, so testing after opening is both correct and shorter
than testing before.

The `ISO_8859_1` charset in the solution is a trick worth knowing: it maps
bytes 0–255 one-to-one onto the first 256 code points, so it round-trips
arbitrary binary through a `String` without loss. UTF-8 would replace every
invalid sequence with `U+FFFD` and the magic-number check would fail. For real
text, use UTF-8; for bytes you are only inspecting, `ISO_8859_1` is the
lossless choice.
