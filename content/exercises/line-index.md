---
id: line-index
title: "Read it, index it, put it back atomically"
difficulty: stretch
chapter: files-and-nio
topics: [nio, files, streams, try-with-resources]
check: unit
standard: java21
---

Real file handling, in a temporary directory the tests create and clean up.

- `static Map<String, List<Integer>> index(Path file)` — for each distinct
  whitespace-separated word, the 1-based numbers of the lines it appears on, in
  order and without repeats within a line. Words compare case-insensitively and
  are stored lower-cased. The map iterates in alphabetical order. A missing
  file throws `NoSuchFileException`.
- `static long countMatching(Path file, Predicate<String> test)` — how many
  lines satisfy `test`, **without reading the whole file into memory**
- `static void writeAtomically(Path target, String contents)` — replaces the
  file's contents, leaving the old contents intact if the write fails; the
  target's directory must already exist
- `static List<String> namesUnder(Path dir)` — the names of every *regular
  file* at any depth under `dir`, relative to `dir`, with `/` as the separator,
  sorted
- `static void deleteTree(Path root)` — removes `root` and everything under it;
  a missing `root` is not an error

## Starter
```java
static Map<String, List<Integer>> index(Path file) throws IOException {
    Map<String, List<Integer>> found = new HashMap<>();
    List<String> lines = Files.readAllLines(file);
    for (int i = 0; i < lines.size(); i++) {
        for (String word : lines.get(i).split(" ")) {
            found.computeIfAbsent(word, key -> new ArrayList<>()).add(i);
        }
    }
    return found;
}

static long countMatching(Path file, Predicate<String> test) throws IOException {
    return Files.readAllLines(file).stream().filter(test).count();
}

static void writeAtomically(Path target, String contents) throws IOException {
    Files.writeString(target, contents);
}

static List<String> namesUnder(Path dir) throws IOException {
    return Files.walk(dir).map(Path::toString).sorted().toList();
}

static void deleteTree(Path root) throws IOException {
    Files.delete(root);
}
```

## Tests
```java
import java.io.IOException;
import java.nio.file.*;

Path dir = Files.createTempDirectory("line-index");
try {
    Path text = dir.resolve("text.txt");
    Files.writeString(text, "the cat sat\nThe mat\n\nthe cat the cat\n");

    Map<String, List<Integer>> index = index(text);
    checkEq(new ArrayList<>(index.keySet()), List.of("cat", "mat", "sat", "the"));
    checkEq(index.get("the"), List.of(1, 2, 4));
    checkEq(index.get("cat"), List.of(1, 4));
    checkEq(index.get("sat"), List.of(1));
    checkEq(index.get("mat"), List.of(2));
    checkEq(index.get("missing"), null);

    // A missing file must throw rather than return an empty index.
    index(dir.resolve("not-created.txt"));
    check(false);
} catch (NoSuchFileException expected) {
    check(expected.getFile().endsWith("not-created.txt"));
}

Path dir2 = Files.createTempDirectory("line-index-2");
try {
    Path text = dir2.resolve("text.txt");
    Files.writeString(text, "alpha\nbeta\ngamma\nbeta\n");

    checkEq(countMatching(text, line -> line.startsWith("b")), 2L);
    checkEq(countMatching(text, line -> true), 4L);
    checkEq(countMatching(text, String::isEmpty), 0L);

    Path config = dir2.resolve("config.txt");
    writeAtomically(config, "version=1\n");
    checkEq(Files.readString(config), "version=1\n");
    writeAtomically(config, "version=2\n");
    checkEq(Files.readString(config), "version=2\n");
    // No leftovers from the temporary file.
    try (var entries = Files.list(dir2)) {
        checkEq(entries.count(), 2L);
    }

    Files.createDirectories(dir2.resolve("a/b"));
    Files.writeString(dir2.resolve("a/one.txt"), "1");
    Files.writeString(dir2.resolve("a/b/two.txt"), "2");
    checkEq(namesUnder(dir2),
        List.of("a/b/two.txt", "a/one.txt", "config.txt", "text.txt"));

    deleteTree(dir2.resolve("a"));
    checkEq(namesUnder(dir2), List.of("config.txt", "text.txt"));
    deleteTree(dir2.resolve("a"));            // already gone, still fine
} finally {
    deleteTree(dir2);
}
checkEq(Files.notExists(dir2), true);
deleteTree(dir);
checkEq(Files.notExists(dir), true);
```

## Hints
- Line numbers are 1-based; the starter's `i` is 0-based.
- `split(" ")` on an empty line yields one empty string, and does not handle
  runs of whitespace. `split("\\s+")` plus dropping empties is the fix — the
  same pattern as `stream-the-log`.
- "Without repeats within a line" means checking the last recorded number
  before adding, or gathering the line's words into a `Set` first.
- `TreeMap` gives the alphabetical iteration the tests check; `HashMap` gives
  whatever it feels like.
- `countMatching` must not use `readAllLines`. `Files.lines` streams, and its
  stream **holds the file open** — `try`-with-resources.
- `writeAtomically`: `Files.createTempFile(target.getParent(), …)` then
  `Files.move` with `REPLACE_EXISTING` and `ATOMIC_MOVE`. Delete the temporary
  file if the write fails, or the directory-count test will notice.
- `namesUnder` wants only regular files, paths relative to `dir`, and `/` as
  the separator regardless of platform: `dir.relativize(path)` then join its
  elements. `Files.walk` returns a stream to close.
- `deleteTree` must delete children before parents — `Comparator.reverseOrder()`
  on the walked paths does it, since a child's path sorts after its parent's.

## Solution
```java
static Map<String, List<Integer>> index(Path file) throws IOException {
    Map<String, List<Integer>> found = new TreeMap<>();
    List<String> lines = Files.readAllLines(file);
    for (int i = 0; i < lines.size(); i++) {
        int lineNumber = i + 1;
        for (String raw : lines.get(i).split("\\s+")) {
            if (raw.isEmpty()) {
                continue;
            }
            String word = raw.toLowerCase();
            List<Integer> at = found.computeIfAbsent(word, key -> new ArrayList<>());
            if (at.isEmpty() || at.get(at.size() - 1) != lineNumber) {
                at.add(lineNumber);
            }
        }
    }
    return found;
}

static long countMatching(Path file, Predicate<String> test) throws IOException {
    try (Stream<String> lines = Files.lines(file)) {
        return lines.filter(test).count();
    }
}

static void writeAtomically(Path target, String contents) throws IOException {
    Path temporary = Files.createTempFile(target.getParent(), "tmp", ".part");
    try {
        Files.writeString(temporary, contents);
        Files.move(temporary, target,
            StandardCopyOption.REPLACE_EXISTING,
            StandardCopyOption.ATOMIC_MOVE);
    } catch (IOException failure) {
        Files.deleteIfExists(temporary);
        throw failure;
    }
}

static List<String> namesUnder(Path dir) throws IOException {
    try (Stream<Path> walk = Files.walk(dir)) {
        List<String> names = new ArrayList<>();
        for (Path path : walk.toList()) {
            if (Files.isRegularFile(path)) {
                names.add(String.join("/", segmentsOf(dir.relativize(path))));
            }
        }
        Collections.sort(names);
        return List.copyOf(names);
    }
}

static List<String> segmentsOf(Path path) {
    List<String> names = new ArrayList<>();
    for (Path element : path) {
        names.add(element.toString());
    }
    return names;
}

static void deleteTree(Path root) throws IOException {
    if (Files.notExists(root)) {
        return;
    }
    try (Stream<Path> all = Files.walk(root)) {
        for (Path path : all.sorted(Comparator.reverseOrder()).toList()) {
            Files.delete(path);
        }
    }
}
```

## Notes
Five methods, and four of them are broken in the starter in ways that pass a
casual test on a casual file.

`index` gets the line numbers off by one, splits on a single space so a double
space produces an empty "word", uses a `HashMap` so the key order is
meaningless, does not lower-case, and records `the` twice for the line
`the cat the cat`. Each is small; together they make the output useless. The
duplicate check is the one worth keeping: because lines are visited in order,
the last recorded number is the only one that can equal the current line, so
`at.get(at.size() - 1)` is a complete test — no `Set`, no scan. Note it
compares `int` to `int` after the list element is unboxed; had both sides been
`Integer` this would be chapter 5.4's identity trap, and line 200 would start
misbehaving.

`countMatching` with `readAllLines` gives the right answer and reads the whole
file into memory, which is exactly what the requirement rules out. `Files.lines`
streams — and returns a stream over an **open file handle**. Without the
`try`-with-resources every call leaks a descriptor, and a program doing this in
a loop dies with `Too many open files` at some unrelated later point. The
garbage collector will not save you here: chapter 7.1 was explicit that it
manages memory and nothing else.

`writeAtomically` writing straight to the target is the difference between a
configuration file that is always readable and one that is empty for a
microsecond every time it is updated — or permanently truncated, if the process
dies mid-write. The temporary file goes in `target.getParent()` and not the
system temp directory, because `ATOMIC_MOVE` cannot cross filesystems. The
`catch` that deletes the temporary is what the directory-count test is really
checking: an atomic writer that leaves `.part` files behind on failure has
turned one problem into two.

`namesUnder` in the starter returns absolute paths and includes directories.
The relativize-and-rejoin dance is not pedantry — hard-coding `/` into a string
comparison is how code stops working on Windows, and `dir.relativize(path)`
followed by joining the elements produces `/`-separated output on every
platform *by construction*.

`deleteTree` calling `Files.delete` on a directory throws
`DirectoryNotEmptyException`, which is the API doing its job: chapter 7.6's
point about `File.delete()` returning a bare `false` is that you would not have
found out. Reverse-sorted order works because a child's path string always
sorts after its parent's, so children are always deleted first — a small trick
worth remembering, and the reason the walk is collected with `toList()` before
deleting rather than deleted lazily inside the stream.
