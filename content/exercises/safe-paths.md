---
id: safe-paths
title: "A path you can hand to a stranger"
difficulty: core
chapter: files-and-nio
topics: [paths, security, nio]
check: unit
standard: java21
---

Everything here is pure `Path` arithmetic — no file needs to exist, and your
code must not touch the disk.

- `static Path within(Path base, String userSupplied)` — the path `base`
  resolved against `userSupplied`, normalized, **provided it is still inside
  `base`**; otherwise `IllegalArgumentException` whose message contains the
  offending input. An input that resolves to `base` itself is inside.
- `static boolean isInside(Path base, Path candidate)` — is `candidate`,
  normalized, contained in `base`? `base` itself counts.
- `static String extensionOf(Path path)` — the part after the last `.` in the
  file name, lower-cased, or `""` when there is none. A leading dot is not a
  separator, so `.gitignore` has no extension.
- `static Path withExtension(Path path, String extension)` — the same path with
  its extension replaced; adds one when there is none. `extension` arrives
  without a dot.
- `static List<String> segments(Path path)` — the name elements as strings,
  with the root (if any) excluded. The empty path has no segments.

## Starter
```java
static Path within(Path base, String userSupplied) {
    if (userSupplied.contains("..")) {
        throw new IllegalArgumentException("traversal: " + userSupplied);
    }
    return base.resolve(userSupplied);
}

static boolean isInside(Path base, Path candidate) {
    return candidate.toString().startsWith(base.toString());
}

static String extensionOf(Path path) {
    String name = path.toString();
    int dot = name.indexOf('.');
    return dot < 0 ? "" : name.substring(dot + 1);
}

static Path withExtension(Path path, String extension) {
    return Path.of(path + "." + extension);
}

static List<String> segments(Path path) {
    return List.of(path.toString().split("/"));
}
```

## Tests
```java
import java.nio.file.Path;

Path base = Path.of("/srv/uploads");

checkEq(within(base, "photo.png"), Path.of("/srv/uploads/photo.png"));
checkEq(within(base, "sub/photo.png"), Path.of("/srv/uploads/sub/photo.png"));
checkEq(within(base, "a/../b.txt"), Path.of("/srv/uploads/b.txt"));
checkEq(within(base, "."), base);

checkThrows(IllegalArgumentException.class, () -> within(base, "../secret"));
checkThrows(IllegalArgumentException.class, () -> within(base, "a/../../secret"));
checkThrows(IllegalArgumentException.class, () -> within(base, "/etc/passwd"));
try {
    within(base, "/etc/passwd");
    check(false);
} catch (IllegalArgumentException expected) {
    check(expected.getMessage().contains("/etc/passwd"));
}

check(isInside(base, Path.of("/srv/uploads/a/b")));
check(isInside(base, Path.of("/srv/uploads/a/../b")));
check(isInside(base, base));
check(!isInside(base, Path.of("/srv/uploadsmore/a")));
check(!isInside(base, Path.of("/srv")));
check(!isInside(base, Path.of("/srv/uploads/../elsewhere")));

checkEq(extensionOf(Path.of("photo.PNG")), "png");
checkEq(extensionOf(Path.of("archive.tar.gz")), "gz");
checkEq(extensionOf(Path.of("README")), "");
checkEq(extensionOf(Path.of(".gitignore")), "");
checkEq(extensionOf(Path.of("dir.with.dots/plain")), "");

checkEq(withExtension(Path.of("a/photo.png"), "webp"), Path.of("a/photo.webp"));
checkEq(withExtension(Path.of("a/README"), "md"), Path.of("a/README.md"));
checkEq(withExtension(Path.of("archive.tar.gz"), "bz2"), Path.of("archive.tar.bz2"));
checkEq(withExtension(Path.of(".gitignore"), "txt"), Path.of(".gitignore.txt"));

checkEq(segments(Path.of("/a/b/c.txt")), List.of("a", "b", "c.txt"));
checkEq(segments(Path.of("a/b")), List.of("a", "b"));
checkEq(segments(Path.of("/")), List.of());
checkEq(segments(Path.of("solo")), List.of("solo"));
```

## Hints
- Rejecting `".."` is not the check. `base.resolve("/etc/passwd")` returns
  `/etc/passwd` with no `..` anywhere in it — and `a/../b.txt` is harmless yet
  gets rejected. Resolve, `normalize()`, then `startsWith(base)`.
- `String.startsWith` is the wrong containment test: `/srv/uploadsmore` starts
  with `/srv/uploads` as text. `Path.startsWith` compares whole name elements.
- Extensions are about the **file name**, not the whole path — use
  `getFileName()`, or `dir.with.dots/plain` will look like it has one.
- `lastIndexOf('.')` rather than `indexOf`, and a dot at index 0 does not
  count.
- `Path` implements `Iterable<Path>`, so iterating it yields the name elements
  with the root already excluded. `getNameCount()` and `getName(i)` do the
  same. Watch `Path.of("/")`, whose name count is 0, and `Path.of("")`, whose
  name count is 1.
- `resolveSibling` is the tidy way to replace a file name while keeping the
  directory.

## Solution
```java
static boolean isInside(Path base, Path candidate) {
    return candidate.normalize().startsWith(base.normalize());
}

static Path within(Path base, String userSupplied) {
    Path candidate = base.resolve(userSupplied).normalize();
    if (!isInside(base, candidate)) {
        throw new IllegalArgumentException("outside the base directory: " + userSupplied);
    }
    return candidate;
}

static String extensionOf(Path path) {
    Path name = path.getFileName();
    if (name == null) {
        return "";
    }
    String text = name.toString();
    int dot = text.lastIndexOf('.');
    return dot <= 0 ? "" : text.substring(dot + 1).toLowerCase();
}

static Path withExtension(Path path, String extension) {
    Path name = path.getFileName();
    if (name == null) {
        throw new IllegalArgumentException("no file name: " + path);
    }
    String text = name.toString();
    int dot = text.lastIndexOf('.');
    String stem = dot <= 0 ? text : text.substring(0, dot);
    return path.resolveSibling(stem + "." + extension);
}

static List<String> segments(Path path) {
    List<String> names = new ArrayList<>();
    for (Path element : path) {
        names.add(element.toString());
    }
    return List.copyOf(names);
}
```

## Notes
The starter's `within` is the check almost everyone writes first, and it is
wrong in both directions. It rejects `a/../b.txt`, which never leaves the
directory, and it accepts `/etc/passwd`, which never entered it — because
`resolve` with an absolute argument discards the base and the result contains
no `..` for the filter to find. A denylist of dangerous-looking input is the
wrong shape; compute the answer and then check the answer.

`isInside` using `String.startsWith` is the same mistake in miniature.
`/srv/uploadsmore/a` starts with `/srv/uploads` as text and is a completely
different directory. `Path.startsWith` compares name elements, so it says
`false` — and it is one character shorter to write.

`extensionOf` has three separate faults in the starter: `indexOf` instead of
`lastIndexOf` gets `tar.gz` wrong, using the whole path gets
`dir.with.dots/plain` wrong, and there is no lower-casing. The dot-at-zero rule
is the interesting one: `.gitignore` is a name, not an extension, and
`dot <= 0` rather than `dot < 0` is the entire fix. Every real
extension-handling routine has that comparison in it.

`withExtension` uses `resolveSibling`, which keeps the directory and replaces
the last element — exactly the operation, spelled in one call. Building the
string by hand and calling `Path.of` works on this platform and breaks on one
whose separator is not `/`, which is the other reason to stay inside the `Path`
API rather than treating paths as text.

`segments` gets iteration for free: `Path` implements `Iterable<Path>` and
iterating it yields the name elements without the root, which is precisely the
specification. Splitting the string on `"/"` gives a leading `""` for an
absolute path, gives one element for `Path.of("/")` instead of none, and
hard-codes the separator — three bugs from one shortcut.
