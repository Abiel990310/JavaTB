---
id: read-a-jar
title: "Build a jar, then take it apart"
difficulty: stretch
chapter: build-tools
topics: [jar, manifest, packaging, zip]
check: unit
standard: java21
---

Everything here happens in memory — no files are written. You will build jars
with `JarOutputStream`, read them back, and answer the questions a build tool
answers.

- `record Entry(String name, byte[] content) {}`
- `static byte[] buildJar(Map<String, String> manifestAttributes, List<Entry> entries)`
  — a jar whose manifest carries the given attributes plus
  `Manifest-Version: 1.0`, and whose entries are the given ones in order
- `static Map<String, String> manifestOf(byte[] jar)` — the main attributes as
  a plain map, in no particular order, or an empty map when there is no
  manifest
- `static List<String> entryNames(byte[] jar)` — every entry's name **except**
  the manifest, in the order stored
- `static String readEntry(byte[] jar, String name)` — that entry's content as
  UTF-8, or `null` when absent
- `static boolean isExecutable(byte[] jar)` — has a non-blank `Main-Class`
- `static List<String> classPathOf(byte[] jar)` — the `Class-Path` attribute
  split on runs of whitespace, empty when absent
- `static List<String> classNames(byte[] jar)` — the binary names of the
  `.class` entries, sorted: `com/example/App.class` becomes
  `com.example.App`, and a nested `A$B.class` keeps its dollar

## Starter
```java
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.jar.*;

record Entry(String name, byte[] content) {}

static byte[] buildJar(Map<String, String> manifestAttributes, List<Entry> entries) throws IOException {
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    JarOutputStream jar = new JarOutputStream(bytes);
    for (Entry entry : entries) {
        jar.putNextEntry(new JarEntry(entry.name()));
        jar.write(entry.content());
    }
    return bytes.toByteArray();
}

static Map<String, String> manifestOf(byte[] jar) throws IOException {
    JarInputStream in = new JarInputStream(new ByteArrayInputStream(jar));
    Map<String, String> attributes = new HashMap<>();
    in.getManifest().getMainAttributes()
        .forEach((key, value) -> attributes.put(key.toString(), value.toString()));
    return attributes;
}

static List<String> entryNames(byte[] jar) throws IOException {
    JarInputStream in = new JarInputStream(new ByteArrayInputStream(jar));
    List<String> names = new ArrayList<>();
    JarEntry entry;
    while ((entry = in.getNextJarEntry()) != null) {
        names.add(entry.getName());
    }
    return names;
}

static String readEntry(byte[] jar, String name) throws IOException {
    return null;
}

static boolean isExecutable(byte[] jar) throws IOException {
    return manifestOf(jar).containsKey("Main-Class");
}

static List<String> classPathOf(byte[] jar) throws IOException {
    return List.of(manifestOf(jar).get("Class-Path").split(" "));
}

static List<String> classNames(byte[] jar) throws IOException {
    return entryNames(jar);
}
```

## Tests
```java
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.jar.*;

byte[] app = buildJar(
    Map.of("Main-Class", "com.example.App",
           "Class-Path", "lib/util.jar   lib/json.jar",
           "Implementation-Version", "1.4.2"),
    List.of(
        new Entry("com/example/App.class", "bytecode A".getBytes(StandardCharsets.UTF_8)),
        new Entry("com/example/App$Inner.class", "bytecode B".getBytes(StandardCharsets.UTF_8)),
        new Entry("com/example/messages.properties", "greeting=hello".getBytes(StandardCharsets.UTF_8))));

Map<String, String> manifest = manifestOf(app);
checkEq(manifest.get("Main-Class"), "com.example.App");
checkEq(manifest.get("Implementation-Version"), "1.4.2");
checkEq(manifest.get("Manifest-Version"), "1.0");

checkEq(entryNames(app), List.of(
    "com/example/App.class",
    "com/example/App$Inner.class",
    "com/example/messages.properties"));

checkEq(readEntry(app, "com/example/messages.properties"), "greeting=hello");
checkEq(readEntry(app, "com/example/App.class"), "bytecode A");
checkEq(readEntry(app, "com/example/App$Inner.class"), "bytecode B");
checkEq(readEntry(app, "nothing/here.txt"), null);

check(isExecutable(app));
checkEq(classPathOf(app), List.of("lib/util.jar", "lib/json.jar"));
checkEq(classNames(app), List.of("com.example.App", "com.example.App$Inner"));

// A library jar: no Main-Class, no Class-Path.
byte[] library = buildJar(
    Map.of("Implementation-Title", "json"),
    List.of(new Entry("org/json/Parser.class", "x".getBytes(StandardCharsets.UTF_8))));

check(!isExecutable(library));
checkEq(classPathOf(library), List.of());
checkEq(classNames(library), List.of("org.json.Parser"));
checkEq(manifestOf(library).get("Implementation-Title"), "json");

// An empty jar still has a manifest.
byte[] empty = buildJar(Map.of(), List.of());
checkEq(entryNames(empty), List.of());
checkEq(classNames(empty), List.of());
check(!isExecutable(empty));
checkEq(manifestOf(empty).get("Manifest-Version"), "1.0");

// A blank Main-Class does not make it executable.
byte[] blank = buildJar(Map.of("Main-Class", "   "), List.of());
check(!isExecutable(blank));

// It really is a zip.
java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(new ByteArrayInputStream(app));
List<String> viaZip = new ArrayList<>();
java.util.zip.ZipEntry zipEntry;
while ((zipEntry = zip.getNextEntry()) != null) {
    viaZip.add(zipEntry.getName());
}
checkEq(viaZip.get(0), "META-INF/MANIFEST.MF");
checkEq(viaZip.size(), 4);
```

## Hints
- `new JarOutputStream(out)` writes **no manifest**; the two-argument
  constructor `new JarOutputStream(out, manifest)` writes one first.
- `Attributes.Name.MANIFEST_VERSION` must be set, or the manifest is written
  without a main section and `getManifest()` gives you nothing back.
- Every `putNextEntry` needs a matching `closeEntry`, and the stream itself must
  be closed before `toByteArray()` — the central directory is written on close.
  `try`-with-resources does both.
- `JarInputStream.getNextJarEntry()` skips `META-INF/MANIFEST.MF` when the
  manifest was the first entry, which is why `entryNames` needs no filtering —
  but the plain `ZipInputStream` in the last test does see it.
- `getManifest()` returns `null` for a jar without one; `manifestOf` must
  return an empty map rather than throwing.
- `Class-Path` is separated by runs of whitespace: split on `"\\s+"` and drop
  empties.
- A class name is the entry name minus `.class`, with `/` replaced by `.`.
  Only entries ending in `.class` count.

## Solution
```java
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.jar.*;

record Entry(String name, byte[] content) {}

static byte[] buildJar(Map<String, String> manifestAttributes, List<Entry> entries) throws IOException {
    Manifest manifest = new Manifest();
    Attributes attributes = manifest.getMainAttributes();
    attributes.put(Attributes.Name.MANIFEST_VERSION, "1.0");
    manifestAttributes.forEach((key, value) -> attributes.put(new Attributes.Name(key), value));

    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    try (JarOutputStream jar = new JarOutputStream(bytes, manifest)) {
        for (Entry entry : entries) {
            jar.putNextEntry(new JarEntry(entry.name()));
            jar.write(entry.content());
            jar.closeEntry();
        }
    }
    return bytes.toByteArray();
}

static Map<String, String> manifestOf(byte[] jar) throws IOException {
    try (JarInputStream in = new JarInputStream(new ByteArrayInputStream(jar))) {
        Manifest manifest = in.getManifest();
        if (manifest == null) {
            return Map.of();
        }
        Map<String, String> attributes = new HashMap<>();
        manifest.getMainAttributes()
            .forEach((key, value) -> attributes.put(key.toString(), value.toString()));
        return Map.copyOf(attributes);
    }
}

static List<String> entryNames(byte[] jar) throws IOException {
    try (JarInputStream in = new JarInputStream(new ByteArrayInputStream(jar))) {
        List<String> names = new ArrayList<>();
        JarEntry entry;
        while ((entry = in.getNextJarEntry()) != null) {
            if (!entry.getName().equals("META-INF/MANIFEST.MF")) {
                names.add(entry.getName());
            }
        }
        return List.copyOf(names);
    }
}

static String readEntry(byte[] jar, String name) throws IOException {
    try (JarInputStream in = new JarInputStream(new ByteArrayInputStream(jar))) {
        JarEntry entry;
        while ((entry = in.getNextJarEntry()) != null) {
            if (entry.getName().equals(name)) {
                return new String(in.readAllBytes(), StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}

static boolean isExecutable(byte[] jar) throws IOException {
    String mainClass = manifestOf(jar).get("Main-Class");
    return mainClass != null && !mainClass.isBlank();
}

static List<String> classPathOf(byte[] jar) throws IOException {
    String declared = manifestOf(jar).get("Class-Path");
    if (declared == null || declared.isBlank()) {
        return List.of();
    }
    List<String> parts = new ArrayList<>();
    for (String part : declared.trim().split("\\s+")) {
        if (!part.isEmpty()) {
            parts.add(part);
        }
    }
    return List.copyOf(parts);
}

static List<String> classNames(byte[] jar) throws IOException {
    List<String> names = new ArrayList<>();
    for (String entry : entryNames(jar)) {
        if (entry.endsWith(".class")) {
            names.add(entry.substring(0, entry.length() - ".class".length()).replace('/', '.'));
        }
    }
    Collections.sort(names);
    return List.copyOf(names);
}
```

## Notes
The starter fails before any of the interesting questions, and the reason is
worth remembering: `new JarOutputStream(out)` produces a jar with **no
manifest**. It is a perfectly valid zip and `java -jar` refuses it with *no
main manifest attribute*. The one-argument constructor exists for building
plain archives; packaging wants the two-argument one.

`Manifest-Version` is the second trap. Without it the manifest has no main
section, so `getManifest()` returns something with no attributes and every
lookup gives `null` — a jar that looks empty rather than one that fails. Maven
and Gradle both write it for you, which is why nobody meets this until they
build a jar by hand.

The stream must also be **closed** before `toByteArray()`. A zip's central
directory is written at the end, so an unclosed `JarOutputStream` produces
bytes that no reader can parse. The starter reads them successfully only
because it never closes and never reads — both bugs cancelling out until you
fix one.

`JarInputStream` has a quirk worth knowing: when the manifest is the first
entry, `getNextJarEntry()` consumes it and does not report it, which is why
`entryNames` sees three entries where the raw `ZipInputStream` in the last test
sees four. The explicit filter in the solution costs nothing and makes the
method correct for a jar whose manifest is stored later, which some tools
produce.

Two small requirements carry real weight. `isExecutable` checking `isBlank()`
rather than presence is the difference between "the attribute exists" and "the
jar runs" — an empty `Main-Class` is exactly what a misconfigured build plugin
writes. And splitting `Class-Path` on `"\\s+"` rather than `" "` matters
because the manifest format wraps long lines and pads them, so single-space
splitting yields empty strings that later become classpath entries pointing at
the current directory.
